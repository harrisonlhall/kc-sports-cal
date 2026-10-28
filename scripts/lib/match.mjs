const STOP = new Set(["fc", "afc", "sc", "cf", "the", "club", "and"]);

const ALIASES = {
  byu: ["brigham", "young"],
  tcu: ["texas", "christian"],
  ucf: ["central", "florida"],
  wvu: ["west", "virginia"],
  lsu: ["louisiana", "state"],
  usc: ["southern", "california"],
  smu: ["southern", "methodist"],
  unlv: ["nevada", "las", "vegas"],
  utep: ["texas", "el", "paso"],
};

export function chicagoParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function hoursAfter(date, hours) {
  return new Date(date.getTime() + hours * 3600_000);
}

export function cleanTeamName(name) {
  return String(name || "")
    .replace(/\s+FC$/i, "")
    .replace(/\s+AFC$/i, "")
    .trim();
}

export function tokens(name) {
  const words = cleanTeamName(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP.has(word));
  const expanded = new Set(words);
  for (const word of words) {
    for (const alias of ALIASES[word] || []) expanded.add(alias);
  }
  return expanded;
}

export function tokenKey(name) {
  return [...tokens(name)].sort().join("-") || "tbd";
}

export function similar(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  if (shared / union >= 0.6) return true;
  if (Math.min(left.size, right.size) === 1 && shared === 1) {
    const only = [...(left.size === 1 ? left : right)][0];
    return only.length >= 2 && only.length <= 4;
  }
  return false;
}

export function seasonYears(style, date = new Date()) {
  const { year, month } = chicagoParts(date);
  if (style === "mbb") {
    const endYear = month >= 7 ? year + 1 : year;
    return [endYear];
  }
  if (style === "fall") {
    const start = month <= 2 ? year - 1 : year;
    return [start];
  }
  if (style === "mlb") return [year];
  if (style === "soccer") {
    const start = month >= 7 ? year : year - 1;
    return [start];
  }
  if (style === "f1") return [year, year + 1];
  return [year];
}

export function splitMatchup(name) {
  const at = name.indexOf(" at ");
  if (at !== -1) return { away: name.slice(0, at).trim(), home: name.slice(at + 4).trim() };
  const versus = name.split(/\s+vs\.?\s+/i);
  if (versus.length === 2) return { away: versus[0].trim(), home: versus[1].trim() };
  return null;
}

export function nameIsUs(name, names) {
  const lower = String(name || "").toLowerCase();
  return (names || []).some((candidate) => lower.includes(candidate.toLowerCase()));
}

export function eventTitle(team, home, opponent, competition) {
  const versus = opponent ? `${home ? "vs" : "@"} ${opponent}` : "";
  let title = `${team.label} ${versus}`.trim();
  if (team.multiComp && competition) title += ` · ${competition}`;
  return title;
}

export function stableKeys(event) {
  const day = event.start.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const who = tokenKey(event.opponent || event.title);
  const side = event.home == null ? "n" : event.home ? "h" : "a";
  const session = event.session || "";
  return [
    `${event.team}|${side}|${who}|${session}|${day}`,
    `${event.team}|${side}|${who}|${session}|${month}`,
  ];
}

export function reviveEvent(raw) {
  return {
    ...raw,
    start: new Date(raw.start),
    end: new Date(raw.end),
  };
}

export function serializeEvent(event) {
  return {
    uid: event.uid,
    team: event.team,
    title: event.title,
    opponent: event.opponent || "",
    home: event.home ?? null,
    competition: event.competition || "",
    session: event.session || "",
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    location: event.location || "",
    broadcast: event.broadcast || "",
    note: event.note || "",
    source: event.source || "",
  };
}
