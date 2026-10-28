import { fetchOnce, getJsonWithHosts, mapPool } from "./http.mjs";
import {
  cleanTeamName,
  eventTitle,
  hoursAfter,
  nameIsUs,
  seasonYears,
  splitMatchup,
} from "./match.mjs";

const BROWSER = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.espn.com/",
  Origin: "https://www.espn.com",
};

const SITE_HOSTS = ["site.api.espn.com", "site.web.api.espn.com"];
const CORE_HOSTS = ["sports.core.api.espn.com"];

const preferred = { site: null, core: null };

function hosts(kind) {
  const all = kind === "core" ? CORE_HOSTS : SITE_HOSTS;
  const pin = preferred[kind];
  return pin ? [pin, ...all.filter((host) => host !== pin)] : all;
}

async function getSite(path) {
  const result = await getJsonWithHosts((host) => `https://${host}${path}`, hosts("site"), BROWSER);
  if (result.ok && result.host) preferred.site = result.host;
  return result;
}

async function getCore(urlOrPath) {
  const build =
    urlOrPath.startsWith("http")
      ? () => urlOrPath.replace(/^http:\/\//, "https://").replace("sports.core.api.espn.pvt", "sports.core.api.espn.com")
      : (host) => `https://${host}${urlOrPath}`;
  const result = urlOrPath.startsWith("http")
    ? await getJsonWithHosts(build, ["sports.core.api.espn.com"], BROWSER)
    : await getJsonWithHosts(build, hosts("core"), BROWSER);
  if (result.ok && result.host) preferred.core = result.host;
  return result;
}

function broadcastsOf(competition) {
  const names = new Set();
  for (const broadcast of competition?.broadcasts ?? []) {
    if (Array.isArray(broadcast)) continue;
    const short = broadcast?.media?.shortName ?? broadcast?.shortName;
    if (short) names.add(short);
    for (const name of broadcast?.names ?? []) if (name) names.add(name);
  }
  for (const broadcast of competition?.geoBroadcasts ?? []) {
    const short = broadcast?.media?.shortName;
    if (short) names.add(short);
  }
  return names.size ? [...names].join(", ") : undefined;
}

function venueOf(venue) {
  if (!venue?.fullName) return undefined;
  const region = venue.address?.state || venue.address?.country;
  return [venue.fullName, venue.address?.city, region].filter(Boolean).join(", ");
}

function finishNote(me, opp, completed) {
  if (!completed) return undefined;
  const mine = me?.score?.displayValue ?? me?.score?.value;
  const theirs = opp?.score?.displayValue ?? opp?.score?.value;
  if (mine == null || theirs == null || mine?.$ref || theirs?.$ref) return undefined;
  return `Final: ${mine}-${theirs}`;
}

function fromNames(name, team, homeHint) {
  const parts = splitMatchup(name || "");
  if (!parts) return { opponent: undefined, home: homeHint ?? true };
  const homeIsUs = nameIsUs(parts.home, team.names);
  const awayIsUs = nameIsUs(parts.away, team.names);
  if (homeIsUs && !awayIsUs) return { opponent: cleanTeamName(parts.away), home: true };
  if (awayIsUs && !homeIsUs) return { opponent: cleanTeamName(parts.home), home: false };
  const home = homeHint ?? homeIsUs;
  return { opponent: cleanTeamName(home ? parts.away : parts.home), home };
}

function makeEvent(team, fields) {
  const start = fields.start;
  const duration = fields.session === "sprint" ? 1 : team.durationH;
  const home = fields.home ?? false;
  const competition = fields.competition || "";
  return {
    uid: fields.uid,
    team: team.key,
    title: fields.title || eventTitle(team, home, fields.opponent, competition),
    opponent: fields.opponent || "",
    home,
    competition,
    session: fields.session || "",
    start,
    end: hoursAfter(start, duration),
    location: fields.location || "",
    broadcast: fields.broadcast || team.fallbackBroadcast || "",
    note: fields.note || "",
    timeValid: fields.timeValid !== false,
    source: "espn",
    broadcastRef: fields.broadcastRef || "",
  };
}

function parseSiteEvent(raw, team, pageTeamId, competition) {
  const competitionBlock = raw?.competitions?.[0];
  if (!competitionBlock?.date && !raw?.date) return null;
  const start = new Date(competitionBlock?.date || raw.date);
  if (Number.isNaN(start.getTime())) return null;
  const competitors = competitionBlock.competitors || [];
  const me =
    competitors.find((competitor) => String(competitor?.team?.id) === String(pageTeamId)) ||
    competitors.find((competitor) => nameIsUs(competitor?.team?.displayName, team.names));
  const opponentSide = competitors.find((competitor) => competitor !== me);
  const home = me ? me.homeAway === "home" : fromNames(raw.name || "", team, true).home;
  const opponent = cleanTeamName(
    opponentSide?.team?.displayName || opponentSide?.team?.shortDisplayName || fromNames(raw.name || "", team, home).opponent || "",
  );
  const completed = competitionBlock?.status?.type?.completed === true;
  const timeValid = raw.timeValid !== false && competitionBlock.timeValid !== false;
  return makeEvent(team, {
    uid: `espn-${team.key}-${raw.id}`,
    opponent,
    home,
    competition,
    start,
    location: venueOf(competitionBlock.venue),
    broadcast: broadcastsOf(competitionBlock),
    note: finishNote(me, opponentSide, completed),
    timeValid,
  });
}

async function fetchSiteSchedule(team, spec) {
  const years = seasonYears(spec.season || "fall");
  const paths = [];
  for (const year of years) {
    const base = `/apis/site/v2/sports/${spec.path}/teams/${spec.teamId}/schedule`;
    paths.push(`${base}?season=${year}`);
    for (const type of [1, 2, 3]) paths.push(`${base}?season=${year}&seasontype=${type}`);
  }
  const pages = await mapPool(paths, 4, (path) => getSite(path));
  const failures = pages.filter((page) => !page.ok).length;
  const events = new Map();
  let sawPayload = false;
  for (const page of pages) {
    if (!page.ok || !page.data) continue;
    sawPayload = true;
    const pageTeamId = page.data.team?.id || spec.numericId;
    for (const raw of page.data.events || []) {
      const event = parseSiteEvent(raw, team, pageTeamId, team.league);
      if (event) events.set(event.uid, event);
    }
  }
  return {
    ok: sawPayload && (failures === 0 || events.size > 0),
    failed: !sawPayload,
    events: [...events.values()],
    error: sawPayload ? "" : pages.find((page) => page.error)?.error || "ESPN schedule unavailable",
  };
}

async function fetchCoreSeason(team, sport, league, teamId, season, competition) {
  const list = await getCore(
    `/v2/sports/${sport}/leagues/${league}/seasons/${season}/teams/${teamId}/events?limit=300`,
  );
  if (!list.ok) return { ok: false, events: [], error: list.error || "core schedule failed" };
  if (list.empty || !list.data) return { ok: true, events: [] };
  const refs = (list.data.items || [])
    .map((item) => item.$ref)
    .filter(Boolean)
    .map((ref) => ref.replace(/^http:\/\//, "https://"));
  if (!refs.length) return { ok: true, events: [] };
  const raws = await mapPool(refs, 6, async (ref) => {
    const response = await getCore(ref);
    return response.ok ? response.data : null;
  });
  const events = [];
  for (const raw of raws) {
    if (!raw?.id || !raw.date) continue;
    const block = raw.competitions?.[0];
    const competitors = block?.competitors || [];
    const me = competitors.find((competitor) => String(competitor.id) === String(teamId));
    const named = fromNames(raw.name || "", team, me ? me.homeAway === "home" : undefined);
    const home = me ? me.homeAway === "home" : named.home;
    const timeValid = raw.timeValid !== false && block?.timeValid !== false;
    events.push(
      makeEvent(team, {
        uid: `espn-${team.key}-${raw.id}`,
        opponent: named.opponent,
        home,
        competition: competition || team.league,
        start: new Date(raw.date),
        location: venueOf(block?.venue),
        timeValid,
        broadcastRef: typeof block?.broadcasts === "string" ? block.broadcasts : block?.broadcasts?.$ref || "",
      }),
    );
  }
  return { ok: true, events: events.filter((event) => !Number.isNaN(event.start.getTime())) };
}

async function fetchCoreTeam(team, spec) {
  const core = spec.core || spec;
  const years = seasonYears(spec.season || (spec.kind === "core" ? "mbb" : "fall"));
  const sport = core.sport;
  const league = core.league;
  const teamId = core.teamId || spec.teamId;
  const seasons = await mapPool(years, 2, (year) => fetchCoreSeason(team, sport, league, teamId, year, team.league));
  const events = new Map();
  let ok = false;
  for (const season of seasons) {
    if (season.ok) ok = true;
    for (const event of season.events || []) events.set(event.uid, event);
  }
  return { ok, failed: !ok, events: [...events.values()], error: ok ? "" : "ESPN core schedule unavailable" };
}

async function fetchSoccer(team, spec) {
  const years = seasonYears("soccer");
  const jobs = [];
  for (const league of spec.leagues) {
    for (const year of years) jobs.push({ league, year });
  }
  const seasons = await mapPool(jobs, 4, ({ league, year }) =>
    fetchCoreSeason(team, "soccer", league.slug, spec.teamId, year, league.name),
  );
  const events = new Map();
  let okCount = 0;
  for (const season of seasons) {
    if (season.ok) okCount += 1;
    for (const event of season.events || []) events.set(event.uid, event);
  }
  const ok = okCount > 0;
  return {
    ok,
    failed: !ok,
    partial: ok && okCount < seasons.length,
    events: [...events.values()],
    error: ok ? "" : "ESPN soccer schedule unavailable",
  };
}

async function fetchF1(team) {
  const years = seasonYears("f1");
  const pages = await mapPool(years, 2, (year) => getSite(`/apis/site/v2/sports/racing/f1/scoreboard?dates=${year}`));
  const events = [];
  let sawPayload = false;
  for (const page of pages) {
    if (!page.ok || !page.data) continue;
    sawPayload = true;
    for (const raw of page.data.events || []) {
      for (const competition of raw.competitions || []) {
        const abbreviation = String(competition?.type?.abbreviation || "").toUpperCase();
        const text = String(competition?.type?.text || competition?.type?.name || "").toLowerCase();
        const sprint = abbreviation === "SR" || abbreviation === "SPR" || text.includes("sprint");
        const race = abbreviation === "RACE" || text === "race";
        if (!sprint && !race) continue;
        const when = competition.date || competition.startDate;
        if (!when) continue;
        const start = new Date(when);
        if (Number.isNaN(start.getTime())) continue;
        const gp = raw.name || "Grand Prix";
        const circuit = raw.circuit;
        events.push(
          makeEvent(team, {
            uid: `espn-f1-${raw.id}-${sprint ? "SR" : "Race"}`,
            title: `F1 ${sprint ? "Sprint" : "Race"}: ${gp}`,
            opponent: gp,
            home: null,
            competition: sprint ? "F1 Sprint" : "Formula 1",
            session: sprint ? "sprint" : "race",
            start,
            location: circuit?.fullName
              ? [circuit.fullName, circuit.address?.city, circuit.address?.country].filter(Boolean).join(", ")
              : "",
            broadcast: broadcastsOf(competition) || team.fallbackBroadcast,
            timeValid: competition.timeValid !== false && raw.timeValid !== false,
          }),
        );
      }
    }
  }
  return { ok: sawPayload, failed: !sawPayload, events, error: sawPayload ? "" : "ESPN F1 scoreboard unavailable" };
}

async function hydrateBroadcasts(events) {
  const now = Date.now();
  const pending = events.filter((event) => {
    if (event.broadcast || !event.broadcastRef) return false;
    const delta = event.start.getTime() - now;
    return delta < 120 * 86400_000 && delta > -2 * 86400_000;
  });
  await mapPool(pending, 6, async (event) => {
    const response = await getCore(event.broadcastRef);
    const items = response.data?.items || [];
    const names = [];
    for (const item of items) {
      const name = item?.media?.shortName || item?.media?.name;
      if (name) names.push(name);
    }
    if (names.length) event.broadcast = [...new Set(names)].join(", ");
  });
  for (const event of events) delete event.broadcastRef;
  return events;
}

export async function fetchEspn(team) {
  const spec = team.espn;
  if (!spec) return { ok: true, failed: false, events: [], skipped: true };
  let result;
  if (spec.kind === "f1") result = await fetchF1(team);
  else if (spec.kind === "soccer") result = await fetchSoccer(team, spec);
  else if (spec.kind === "core") result = await fetchCoreTeam(team, spec);
  else result = await fetchSiteSchedule(team, spec);

  if ((!result.ok || result.events.length === 0) && spec.core && spec.kind === "site") {
    const backup = await fetchCoreTeam(team, { ...spec, season: spec.season });
    if (backup.events.length) {
      result = { ok: true, failed: false, events: backup.events, error: "" };
    }
  }
  result.events = await hydrateBroadcasts(result.events);
  return result;
}

export async function espnReachable() {
  const response = await fetchOnce("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {
    headers: BROWSER,
    timeoutMs: 15000,
  });
  return response.ok;
}
