import { teamByKey } from "./teams.mjs";

const CHICAGO = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function esc(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold a content line at 75 octets, breaking on UTF-8 character boundaries. */
export function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let index = 0;
  let budget = 75;
  while (index < bytes.length) {
    let end = Math.min(index + budget, bytes.length);
    if (end < bytes.length) {
      while (end > index && (bytes[end] & 0xc0) === 0x80) end -= 1;
      if (end === index) end = Math.min(index + budget, bytes.length);
    }
    const chunk = bytes.subarray(index, end).toString("utf8");
    parts.push(parts.length === 0 ? chunk : ` ${chunk}`);
    index = end;
    budget = 74;
  }
  return parts.join("\r\n");
}

export function buildIcs(events, calName) {
  const stamp = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KC Sports Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    "X-WR-TIMEZONE:America/Chicago",
    `X-WR-CALDESC:${esc("Auto-updating schedule feed. Times are stored in UTC and shown in your device timezone.")}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
  ];

  const ordered = [...events].sort((a, b) => a.start - b.start || a.uid.localeCompare(b.uid));
  for (const event of ordered) {
    const meta = teamByKey(event.team);
    const summary = `${meta?.emoji ?? ""} ${event.title}${event.broadcast ? ` (${event.broadcast})` : ""}`.trim();
    const description = [
      `Start: ${CHICAGO.format(event.start)}`,
      `Where to watch: ${event.broadcast ?? "TBD"}`,
      event.location ? `Venue: ${event.location}` : null,
      event.competition ? `Competition: ${event.competition}` : null,
      event.note || null,
      meta ? `League: ${meta.league}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid.includes("@") ? event.uid : `${event.uid}@kc-sports-calendar`}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${icsDate(event.start)}`);
    lines.push(`DTEND:${icsDate(event.end)}`);
    lines.push(`SUMMARY:${esc(summary)}`);
    lines.push(`DESCRIPTION:${esc(description)}`);
    if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
    lines.push(`CATEGORIES:${esc(meta?.short ?? event.team)}`);
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map((line) => fold(line)).join("\r\n")}\r\n`;
}
