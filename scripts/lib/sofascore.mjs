import { getJsonWithHosts, mapPool } from "./http.mjs";
import { cleanTeamName, eventTitle, hoursAfter, seasonYears } from "./match.mjs";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.sofascore.com/",
  Origin: "https://www.sofascore.com",
};

// api.sofascore.com answers 403 to many datacenter IPs. api.sofascore1.com
// serves the same API and is the mirror that currently answers.
const HOSTS = ["https://api.sofascore.com", "https://api.sofascore1.com"];
let preferred = null;

function orderedHosts() {
  return preferred ? [preferred, ...HOSTS.filter((host) => host !== preferred)] : HOSTS;
}

async function sofaGet(path) {
  const result = await getJsonWithHosts((host) => `${host}${path}`, orderedHosts(), HEADERS);
  if (result.ok && result.host) preferred = result.host;
  return result;
}

function finishedNote(event, home) {
  const type = event.status?.type;
  if (type !== "finished" && type !== "ended") return "";
  const homeScore = event.homeScore?.current;
  const awayScore = event.awayScore?.current;
  if (homeScore == null || awayScore == null) return "";
  const mine = home ? homeScore : awayScore;
  const theirs = home ? awayScore : homeScore;
  return `Final: ${mine}-${theirs}`;
}

function mapTeamEvent(raw, team) {
  if (!raw?.id || !raw.startTimestamp) return null;
  const homeSide = raw.homeTeam?.id === team.sofaId;
  const awaySide = raw.awayTeam?.id === team.sofaId;
  if (!homeSide && !awaySide) return null;
  const home = homeSide;
  const opponent = cleanTeamName(home ? raw.awayTeam?.name : raw.homeTeam?.name);
  const competition = raw.tournament?.name || raw.tournament?.uniqueTournament?.name || "";
  const start = new Date(raw.startTimestamp * 1000);
  if (Number.isNaN(start.getTime())) return null;
  return {
    uid: `sofa-${team.key}-${raw.id}`,
    sofaId: raw.id,
    team: team.key,
    title: eventTitle(team, home, opponent, competition),
    opponent,
    home,
    competition,
    session: "",
    start,
    end: hoursAfter(start, team.durationH),
    location: "",
    broadcast: team.fallbackBroadcast || "",
    note: finishedNote(raw, home),
    timeValid: true,
    source: "sofascore",
  };
}

async function pages(teamId, kind) {
  const events = [];
  const limit = kind === "last" ? 1 : 5;
  for (let page = 0; page < limit; page += 1) {
    const response = await sofaGet(`/api/v1/team/${teamId}/events/${kind}/${page}`);
    if (!response.ok && response.status !== 404) return { ok: false, events, error: response.error };
    const batch = response.data?.events || [];
    events.push(...batch);
    if (!batch.length || !response.data?.hasNextPage) break;
  }
  return { ok: true, events };
}

export async function fetchSofaTeam(team) {
  if (!team.sofaId) return { ok: true, failed: false, events: [], skipped: true };
  const [upcoming, recent] = await Promise.all([pages(team.sofaId, "next"), pages(team.sofaId, "last")]);
  if (!upcoming.ok && !recent.ok) {
    return { ok: false, failed: true, events: [], error: upcoming.error || recent.error || "SofaScore unavailable" };
  }
  const mapped = [];
  for (const raw of [...recent.events, ...upcoming.events]) {
    const event = mapTeamEvent(raw, team);
    if (event) mapped.push(event);
  }
  const byId = new Map(mapped.map((event) => [event.uid, event]));
  return { ok: true, failed: false, events: [...byId.values()], error: "" };
}

async function raceSessions(stageId) {
  const response = await sofaGet(`/api/v1/stage/${stageId}/substages`);
  if (!response.ok || !response.data) return [];
  return response.data.substages || response.data.stages || [];
}

export async function fetchSofaF1(team) {
  const seasons = await sofaGet("/api/v1/unique-stage/40/seasons");
  if (!seasons.ok) return { ok: false, failed: true, events: [], error: seasons.error || "SofaScore F1 unavailable" };
  const wanted = new Set(seasonYears("f1").map(String));
  const chosen = (seasons.data?.seasons || []).filter((season) => wanted.has(String(season.year)));
  const events = [];
  for (const season of chosen) {
    const grandsPrix = await raceSessions(season.id);
    const upcoming = grandsPrix.filter((stage) => {
      const start = (stage.startDateTimestamp || 0) * 1000;
      return start > Date.now() - 20 * 86400_000;
    });
    const details = await mapPool(upcoming, 4, async (stage) => ({ stage, sessions: await raceSessions(stage.id) }));
    for (const { stage, sessions } of details) {
      for (const session of sessions) {
        const type = session.type?.name || session.description || "";
        const sprint = /sprint/i.test(type);
        const race = /grand prix|^race$/i.test(type) || session.type?.id === 6;
        if (!sprint && !race) continue;
        if (!session.startDateTimestamp) continue;
        const start = new Date(session.startDateTimestamp * 1000);
        const gp = stage.name || stage.description || "Grand Prix";
        events.push({
          uid: `sofa-f1-${session.id}`,
          team: team.key,
          title: `F1 ${sprint ? "Sprint" : "Race"}: ${gp}`,
          opponent: gp,
          home: null,
          competition: sprint ? "F1 Sprint" : "Formula 1",
          session: sprint ? "sprint" : "race",
          start,
          end: hoursAfter(start, sprint ? 1 : team.durationH),
          location: "",
          broadcast: team.fallbackBroadcast || "",
          note: "",
          timeValid: true,
          source: "sofascore",
        });
      }
    }
  }
  return { ok: true, failed: false, events, error: "" };
}

export async function fillSofaVenues(events) {
  const pending = events.filter((event) => event.source === "sofascore" && event.sofaId && !event.location);
  await mapPool(pending.slice(0, 40), 4, async (event) => {
    const response = await sofaGet(`/api/v1/event/${event.sofaId}`);
    const venue = response.data?.event?.venue;
    if (!venue?.name) return;
    event.location = [venue.name, venue.city?.name, venue.country?.name].filter(Boolean).join(", ");
  });
}
