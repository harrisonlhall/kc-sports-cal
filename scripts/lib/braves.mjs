import { fetchOnce } from "./http.mjs";
import { cleanTeamName, eventTitle, hoursAfter, similar } from "./match.mjs";

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KCSportsCalendar/1.0)" };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** UK wall time to UTC. BST runs from the last Sunday in March to the last Sunday in October. */
function londonToUtc(year, monthIndex, day, hour, minute) {
  const lastSunday = (month) => {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return last.getUTCDate() - last.getUTCDay();
  };
  const asUtc = Date.UTC(year, monthIndex, day, hour, minute);
  const bstStart = Date.UTC(year, 2, lastSunday(2), 1);
  const bstEnd = Date.UTC(year, 9, lastSunday(9), 1);
  const bst = asUtc >= bstStart && asUtc < bstEnd;
  return new Date(asUtc - (bst ? 3600_000 : 0));
}

function parseKickoff(value) {
  const text = String(value || "").trim().toLowerCase();
  const h24 = text.match(/^(\d{1,2}):(\d{2})/);
  const h12 = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (h24 && !h12) return { hour: Number(h24[1]), minute: Number(h24[2]) };
  if (h12) {
    const hour = (Number(h12[1]) % 12) + (h12[3] === "pm" ? 12 : 0);
    return { hour, minute: Number(h12[2] || 0) };
  }
  return { hour: 15, minute: 0 };
}

export async function fetchBravesOfficial(team) {
  const response = await fetchOnce("https://www.caledonianbraves.com/fixtures", { headers: HEADERS, timeoutMs: 25000 });
  if (!response.ok) return { ok: false, events: [], error: response.error || `HTTP ${response.status}` };
  const blocks = response.text.split(/<div class="fixtureSmall\s/).slice(1);
  const events = [];
  for (const block of blocks) {
    const names = [...block.matchAll(/<h6([^>]*)>([^<]+)<\/h6>/g)].map((match) => ({
      own: /own/.test(match[1]),
      name: cleanTeamName(match[2].trim()),
    }));
    if (names.length < 2) continue;
    const stamp = block.match(/class="tagline[^"]*">\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
    if (!stamp) continue;
    const month = MONTHS.indexOf(stamp[2].toLowerCase().slice(0, 3));
    if (month < 0) continue;
    const { hour, minute } = parseKickoff((block.match(/fixtureSmallKO">\s*([^<]+)</) || [])[1]);
    const start = londonToUtc(Number(stamp[3]), month, Number(stamp[1]), hour, minute);
    const homeIsBraves = names[0].own || /braves/i.test(names[0].name);
    const opponent = (homeIsBraves ? names[1] : names[0]).name;
    const home = homeIsBraves;
    const competition = stripTags((block.match(/fixtureSmallType">([\s\S]*?)<\/p>/) || [])[1]);
    const location = stripTags((block.match(/fixtureSmallVenue">([\s\S]*?)<\/h6>/) || [])[1]);
    events.push({
      uid: `braves-official-${start.toISOString().slice(0, 10)}-${opponent.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
      team: team.key,
      title: eventTitle(team, home, opponent, competition),
      opponent,
      home,
      competition,
      session: "",
      start,
      end: hoursAfter(start, team.durationH),
      location,
      broadcast: team.fallbackBroadcast || "",
      note: "",
      timeValid: true,
      source: "official",
    });
  }
  return { ok: events.length > 0, events, error: events.length ? "" : "club fixture page had no matches" };
}

const SOURCE_RANK = { sofascore: 3, official: 2, thesportsdb: 1, espn: 4 };

function sameBravesGame(left, right) {
  const delta = Math.abs(left.start - right.start);
  if (similar(left.opponent, right.opponent) && delta <= 36 * 3600_000) return true;
  return delta <= 2 * 3600_000;
}

/**
 * The club site is the source for cups SofaScore does not list. When both
 * name a different opponent for the same kickoff, SofaScore is kept: its
 * league list matches the published Lowland League West fixtures.
 */
export function mergeBraves(team, groups) {
  const pool = groups.flat().sort((a, b) => a.start - b.start);
  const used = new Set();
  const merged = [];
  for (let index = 0; index < pool.length; index += 1) {
    if (used.has(index)) continue;
    const cluster = [pool[index]];
    used.add(index);
    for (let other = index + 1; other < pool.length; other += 1) {
      if (used.has(other)) continue;
      if (cluster.some((event) => sameBravesGame(event, pool[other]))) {
        cluster.push(pool[other]);
        used.add(other);
      }
    }
    const ranked = [...cluster].sort((a, b) => (SOURCE_RANK[b.source] || 0) - (SOURCE_RANK[a.source] || 0));
    const best = { ...ranked[0] };
    for (const event of cluster) {
      if (!best.location && event.location) best.location = event.location;
      if (!best.note && event.note) best.note = event.note;
    }
    const official = cluster.find((event) => event.source === "official" && event.location);
    if (official && !ranked[0].location) best.location = official.location;
    if (!best.broadcast) best.broadcast = team.fallbackBroadcast || "";
    best.title = eventTitle(team, best.home, best.opponent, best.competition);
    best.uid = `braves-${best.start.toISOString().slice(0, 10).replace(/-/g, "")}-${best.opponent.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    merged.push(best);
  }
  return merged;
}
