import { fetchOnce } from "./http.mjs";
import { cleanTeamName, eventTitle, hoursAfter, nameIsUs } from "./match.mjs";

const KEY = "123";

function parseWhen(event) {
  if (event.strTimestamp) {
    const raw = event.strTimestamp.replace(" ", "T");
    const iso = /z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (event.dateEvent && event.strTime && event.strTime !== "00:00:00") {
    const date = new Date(`${event.dateEvent}T${event.strTime}Z`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export async function fetchTheSportsDb(team) {
  if (!team.tsdbId) return { ok: true, failed: false, events: [], skipped: true };
  const urls = [
    `https://www.thesportsdb.com/api/v1/json/${KEY}/eventsnext.php?id=${team.tsdbId}`,
    `https://www.thesportsdb.com/api/v1/json/${KEY}/eventslast.php?id=${team.tsdbId}`,
  ];
  const events = [];
  let ok = false;
  let error = "";
  for (const url of urls) {
    const response = await fetchOnce(url, {
      headers: { "User-Agent": "KCSportsCalendar/1.0", Accept: "application/json" },
    });
    if (!response.ok) {
      error = response.error || `HTTP ${response.status}`;
      continue;
    }
    let payload;
    try {
      payload = JSON.parse(response.text);
    } catch {
      error = "TheSportsDB returned invalid JSON";
      continue;
    }
    ok = true;
    const rows = payload.events || payload.results || [];
    for (const row of rows) {
      const homeName = row.strHomeTeam || "";
      const awayName = row.strAwayTeam || "";
      if (!nameIsUs(homeName, team.names) && !nameIsUs(awayName, team.names)) continue;
      const start = parseWhen(row);
      if (!start) continue;
      const home = nameIsUs(homeName, team.names);
      const opponent = cleanTeamName(home ? awayName : homeName);
      const done = row.intHomeScore != null && row.intHomeScore !== "";
      events.push({
        uid: `tsdb-${team.key}-${row.idEvent}`,
        team: team.key,
        title: eventTitle(team, home, opponent, row.strLeague || ""),
        opponent,
        home,
        competition: row.strLeague || "",
        session: "",
        start,
        end: hoursAfter(start, team.durationH),
        location: row.strVenue || "",
        broadcast: team.fallbackBroadcast || "",
        note: done ? `Final: ${home ? row.intHomeScore : row.intAwayScore}-${home ? row.intAwayScore : row.intHomeScore}` : "",
        timeValid: true,
        source: "thesportsdb",
      });
    }
  }
  return { ok, failed: !ok, events, error: ok ? "" : error || "TheSportsDB unavailable" };
}
