import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchBravesOfficial, mergeBraves } from "./lib/braves.mjs";
import { fetchEspn } from "./lib/espn.mjs";
import { buildIcs } from "./lib/ics.mjs";
import { applyCachedUids, chooseEvents, mergeEspnAndSofa } from "./lib/merge.mjs";
import { chicagoParts, reviveEvent, serializeEvent } from "./lib/match.mjs";
import { fetchSofaF1, fetchSofaTeam, fillSofaVenues } from "./lib/sofascore.mjs";
import { ALL_KEYS, PROLONGED_MS, TEAMS, teamByKey } from "./lib/teams.mjs";
import { fetchTheSportsDb } from "./lib/thesportsdb.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(root, process.env.OUTPUT_DIR || "dist");
const pagesBase = (process.env.PAGES_BASE_URL || "https://harrisonlhall.github.io/kc-sports-cal").replace(/\/$/, "");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function fetchRemoteCache() {
  try {
    const response = await fetch(`${pagesBase}/cache.json`, {
      headers: { "User-Agent": "KCSportsCalendar/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function pickCache(local, remote) {
  const teams = {};
  for (const team of TEAMS) {
    const left = local?.teams?.[team.key];
    const right = remote?.teams?.[team.key];
    const leftAt = Date.parse(left?.lastSuccessfulFetch || "") || 0;
    const rightAt = Date.parse(right?.lastSuccessfulFetch || "") || 0;
    teams[team.key] = rightAt > leftAt ? right : left || right || null;
  }
  return teams;
}

async function liveEvents(team) {
  const warnings = [];
  if (team.officialSite) {
    const [official, sofa, tsdb] = await Promise.all([
      fetchBravesOfficial(team),
      fetchSofaTeam(team),
      fetchTheSportsDb(team),
    ]);
    if (!official.ok) warnings.push(`club site: ${official.error || "failed"}`);
    if (!sofa.ok) warnings.push(`sofascore: ${sofa.error || "failed"}`);
    if (!tsdb.ok && !tsdb.skipped) warnings.push(`thesportsdb: ${tsdb.error || "failed"}`);
    const events = mergeBraves(team, [official.events || [], sofa.events || [], tsdb.events || []]);
    const fresh = official.ok || sofa.ok || tsdb.ok;
    const source = [
      sofa.ok && sofa.events?.length ? "sofascore" : null,
      official.ok ? "club" : null,
      tsdb.ok && tsdb.events?.length ? "thesportsdb" : null,
    ]
      .filter(Boolean)
      .join("+");
    return { events, fresh, source: source || "none", corrected: 0, warnings };
  }

  const espn = await fetchEspn(team);
  let sofa = { ok: true, events: [], skipped: true };
  if (team.espn?.kind === "f1") {
    if (!espn.ok || espn.events.length === 0) sofa = await fetchSofaF1(team);
  } else if (team.sofaId) {
    sofa = await fetchSofaTeam(team);
  }
  if (!espn.ok && !espn.skipped) warnings.push(`espn: ${espn.error || "failed"}`);
  if (!sofa.ok && !sofa.skipped) warnings.push(`sofascore: ${sofa.error || "failed"}`);

  let merged = mergeEspnAndSofa(team, espn.events || [], sofa.events || []);
  let sourceParts = [
    espn.ok && !espn.skipped && (espn.events.length || sofa.events.length === 0) ? "espn" : null,
    sofa.ok && !sofa.skipped && sofa.events.length ? "sofascore" : null,
  ].filter(Boolean);

  const upcoming = merged.events.filter((event) => event.start.getTime() >= Date.now()).length;
  if (upcoming === 0 && team.tsdbId && (!espn.ok || !sofa.ok)) {
    const tsdb = await fetchTheSportsDb(team);
    if (tsdb.events.length) {
      merged = mergeEspnAndSofa(team, merged.events, tsdb.events);
      sourceParts.push("thesportsdb");
    } else if (!tsdb.ok) warnings.push(`thesportsdb: ${tsdb.error || "failed"}`);
  }

  const fresh = Boolean((espn.ok && !espn.skipped) || (sofa.ok && !sofa.skipped && sofa.events.length));
  return {
    events: merged.events,
    fresh,
    source: sourceParts.join("+") || "none",
    corrected: merged.corrected,
    warnings,
  };
}

function feedName(keys) {
  if (keys.length === ALL_KEYS.length) return "KC Sports + F1";
  return keys.map((key) => teamByKey(key).short).join(" · ");
}

function writeFeeds(byTeam) {
  fs.mkdirSync(path.join(outDir, "teams"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "feeds"), { recursive: true });
  const total = 1 << ALL_KEYS.length;
  for (let mask = 1; mask < total; mask += 1) {
    const keys = ALL_KEYS.filter((_, index) => mask & (1 << index));
    const events = keys.flatMap((key) => byTeam[key] || []);
    const ics = buildIcs(events, feedName(keys));
    if (keys.length === ALL_KEYS.length) fs.writeFileSync(path.join(outDir, "calendar.ics"), ics);
    else if (keys.length === 1) fs.writeFileSync(path.join(outDir, "teams", `${keys[0]}.ics`), ics);
    else fs.writeFileSync(path.join(outDir, "feeds", `${keys.join("_")}.ics`), ics);
  }
}

function formatWhen(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

async function main() {
  const local = readJson(path.join(root, "data", "cache.json"));
  const remote = await fetchRemoteCache();
  const previous = pickCache(local, remote);
  const now = new Date();
  const month = chicagoParts(now).month;
  const results = {};

  for (const team of TEAMS) {
    let live;
    try {
      live = await liveEvents(team);
    } catch (error) {
      live = { events: [], fresh: false, source: "none", corrected: 0, warnings: [error.message || String(error)] };
    }
    const cachedRaw = (previous[team.key]?.events || []).map(reviveEvent);
    applyCachedUids(live.events, cachedRaw);
    const choice = chooseEvents(live.events, cachedRaw);
    const events = choice.events.sort((a, b) => a.start - b.start || a.uid.localeCompare(b.uid));
    if (choice.stale) {
      for (const event of events) {
        if (!event.broadcast) event.broadcast = team.fallbackBroadcast || "";
      }
    } else {
      await fillSofaVenues(events.filter((event) => event.source === "sofascore" && !event.location));
    }
    const inSeason = team.inSeasonMonths.includes(month);
    const previousSuccess = previous[team.key]?.lastSuccessfulFetch || null;
    const fetchOk = live.fresh && !choice.stale;
    const lastSuccessfulFetch = fetchOk ? now.toISOString() : previousSuccess;
    const age = lastSuccessfulFetch ? now.getTime() - Date.parse(lastSuccessfulFetch) : Infinity;
    const prolonged = inSeason && !fetchOk && age > PROLONGED_MS;
    const upcoming = events.filter((event) => event.start.getTime() >= now.getTime());
    results[team.key] = {
      events,
      inSeason,
      prolonged,
      status: {
        eventCount: events.length,
        upcoming: upcoming.length,
        next: upcoming[0]?.start.toISOString() || null,
        lastSuccessfulFetch,
        source: choice.stale ? "cache" : live.source,
        stale: choice.stale,
        inSeason,
        warnings: live.warnings,
      },
      corrected: live.corrected,
      nextThree: upcoming.slice(0, 3),
    };
    console.log(
      `${team.short.padEnd(18)} ${String(events.length).padStart(3)} events  ${String(upcoming.length).padStart(3)} upcoming  ${choice.stale ? "cache" : live.source || "none"}${live.corrected ? `  ${live.corrected} kickoffs corrected` : ""}`,
    );
    for (const event of live.events.filter((item) => item.timeCorrected)) {
      console.log(`  kickoff corrected: ${event.title} -> ${event.start.toISOString()}`);
    }
    for (const warning of live.warnings) console.log(`  warning: ${warning}`);
    for (const [index, event] of results[team.key].nextThree.entries()) {
      console.log(`  ${index + 1}. ${formatWhen(event.start)}  ${event.title}${event.broadcast ? ` (${event.broadcast})` : ""}`);
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(path.join(root, "site"), outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
  writeFeeds(Object.fromEntries(TEAMS.map((team) => [team.key, results[team.key].events])));

  const prolonged = TEAMS.filter((team) => results[team.key].prolonged).map((team) => team.key);
  const status = {
    generatedAt: now.toISOString(),
    healthy: prolonged.length === 0,
    prolongedHours: PROLONGED_MS / 3600_000,
    prolongedFailures: prolonged,
    teams: Object.fromEntries(TEAMS.map((team) => [team.key, results[team.key].status])),
  };
  const cache = {
    savedAt: now.toISOString(),
    teams: Object.fromEntries(
      TEAMS.map((team) => [
        team.key,
        {
          lastSuccessfulFetch: results[team.key].status.lastSuccessfulFetch,
          source: results[team.key].status.source,
          events: results[team.key].events.map(serializeEvent),
        },
      ]),
    ),
  };
  const catalog = TEAMS.map(({ key, name, short, league, emoji, color }) => ({ key, name, short, league, emoji, color }));
  fs.writeFileSync(path.join(outDir, "status.json"), `${JSON.stringify(status, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "cache.json"), `${JSON.stringify(cache)}\n`);
  fs.writeFileSync(path.join(outDir, "teams.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "data", "cache.json"), `${JSON.stringify(cache)}\n`);

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    fs.appendFileSync(output, `unhealthy=${prolonged.length ? "1" : "0"}\n`);
    fs.appendFileSync(output, `unhealthy_teams=${prolonged.join(",")}\n`);
  }
  console.log(prolonged.length ? `UNHEALTHY ${prolonged.join(",")}` : "HEALTHY");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
