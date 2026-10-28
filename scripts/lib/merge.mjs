import { PAST_WINDOW_MS } from "./teams.mjs";
import { similar, stableKeys } from "./match.mjs";

function sameFixture(left, right) {
  if (left.session && right.session && left.session !== right.session) return false;
  const delta = Math.abs(left.start.getTime() - right.start.getTime());
  const alike = similar(left.opponent, right.opponent) || similar(left.title, right.title);
  if (!alike) return false;
  if (delta <= 3 * 3600_000) return true;
  if (left.home != null && right.home != null && left.home !== right.home) return false;
  return delta <= 7 * 86400_000;
}

export function mergeEspnAndSofa(team, espnEvents, sofaEvents) {
  const used = new Set();
  const fresh = [];
  let corrected = 0;
  for (const event of espnEvents) {
    const match = sofaEvents.find((candidate) => !used.has(candidate.uid) && sameFixture(event, candidate));
    if (match) {
      used.add(match.uid);
      if (event.timeValid === false) {
        event.start = match.start;
        event.end = match.end;
        event.timeCorrected = true;
        corrected += 1;
      }
      if (!event.location && match.location) event.location = match.location;
      if (!event.note && match.note) event.note = match.note;
      if (!event.competition && match.competition) event.competition = match.competition;
    } else if (event.timeValid === false) {
      event.note = [event.note, "Kickoff time not confirmed yet"].filter(Boolean).join(" · ");
    }
    fresh.push(event);
  }
  for (const event of sofaEvents) {
    if (used.has(event.uid)) continue;
    if (fresh.some((candidate) => sameFixture(candidate, event))) continue;
    fresh.push(event);
  }
  return { events: fresh, corrected };
}

export function applyCachedUids(events, cached) {
  const exact = new Map();
  const byMonth = new Map();
  const monthCount = new Map();
  for (const event of cached || []) {
    const [dayKey, monthKey] = stableKeys(event);
    exact.set(dayKey, event.uid);
    monthCount.set(monthKey, (monthCount.get(monthKey) || 0) + 1);
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, event.uid);
  }
  for (const event of events) {
    const [dayKey, monthKey] = stableKeys(event);
    if (exact.has(dayKey)) event.uid = exact.get(dayKey);
    else if (monthCount.get(monthKey) === 1) event.uid = byMonth.get(monthKey);
  }
  return events;
}

export function inWindow(event, now = Date.now()) {
  return event.start.getTime() > now - PAST_WINDOW_MS;
}

export function chooseEvents(fresh, cached) {
  const now = Date.now();
  const freshKept = fresh.filter((event) => inWindow(event, now));
  const cachedKept = (cached || []).filter((event) => inWindow(event, now));
  const freshUpcoming = freshKept.filter((event) => event.start.getTime() >= now).length;
  const cachedUpcoming = cachedKept.filter((event) => event.start.getTime() >= now).length;
  if (freshKept.length === 0 && cachedKept.length > 0) {
    return { events: cachedKept, stale: true, reason: "live fetch was empty" };
  }
  if (cachedUpcoming >= 4 && freshUpcoming < cachedUpcoming * 0.5) {
    const seen = new Set(freshKept.map((event) => stableKeys(event)[0]));
    const extras = cachedKept.filter((event) => event.start.getTime() >= now && !seen.has(stableKeys(event)[0]));
    return { events: [...freshKept, ...extras], stale: true, reason: "live fetch shrunk" };
  }
  return { events: freshKept, stale: false, reason: "" };
}
