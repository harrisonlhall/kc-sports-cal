import fs from "node:fs";
import path from "node:path";
import { buildIcs, fold } from "./lib/ics.mjs";

const dir = path.resolve(process.argv[2] || "dist");
const failures = [];

function fail(message) {
  failures.push(message);
}

function unfold(text) {
  return text.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n");
}

function checkText(label, text) {
  if (!text.endsWith("\r\n")) fail(`${label}: missing trailing CRLF`);
  if (text.includes("\n") && text.split("\n").some((line) => !line.endsWith("\r") && line.length)) {
    const bare = text.split("\n").filter((line) => line.length && !line.endsWith("\r"));
    if (bare.length) fail(`${label}: line break is not CRLF`);
  }
  const physical = text.split("\r\n");
  if (physical.at(-1) === "") physical.pop();
  for (const line of physical) {
    const width = Buffer.byteLength(line, "utf8");
    if (width > 75) fail(`${label}: line longer than 75 octets (${width})`);
  }
  const logical = unfold(text);
  const begins = (logical.match(/^BEGIN:VEVENT/gm) || []).length;
  const ends = (logical.match(/^END:VEVENT/gm) || []).length;
  if (begins !== ends) fail(`${label}: VEVENT imbalance ${begins} begin / ${ends} end`);
  if (!logical.includes("BEGIN:VCALENDAR") || !logical.includes("END:VCALENDAR")) fail(`${label}: missing calendar envelope`);
  if (!logical.includes("REFRESH-INTERVAL;VALUE=DURATION:PT2H")) fail(`${label}: missing refresh interval`);
  const uids = [...logical.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);
  if (uids.length !== begins) fail(`${label}: a VEVENT is missing UID`);
  const seen = new Set();
  for (const uid of uids) {
    if (seen.has(uid)) fail(`${label}: duplicate UID ${uid}`);
    seen.add(uid);
  }
  const blocks = logical.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    for (const required of ["DTSTAMP:", "DTSTART:", "DTEND:", "SUMMARY:"]) {
      if (!block.includes(required)) fail(`${label}: VEVENT missing ${required}`);
    }
  }
  return uids;
}

const sample = buildIcs(
  [
    {
      uid: "sample-1",
      team: "brentford",
      title: "Brentford vs Nottingham Forest · Premier League",
      opponent: "Nottingham Forest",
      home: true,
      competition: "Premier League",
      start: new Date("2026-10-31T15:00:00Z"),
      end: new Date("2026-10-31T17:00:00Z"),
      location: "Gtech Community Stadium, Brentford, England — a deliberately long venue line so folding is exercised",
      broadcast: "USA Net",
      note: "",
    },
  ],
  "Sample",
);
checkText("sample", sample);
const folded = fold(`SUMMARY:${"🐝".repeat(40)} Brentford`);
if (!folded.includes("\r\n ")) fail("fold() did not wrap a long emoji line");

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".ics")) files.push(full);
  }
}
walk(dir);
if (!files.length) fail(`no .ics files under ${dir}`);
const calendar = files.find((file) => path.basename(file) === "calendar.ics");
if (!calendar) fail("calendar.ics is missing");

let calendarUids = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const uids = checkText(path.relative(dir, file), text);
  if (file === calendar) calendarUids = uids;
}

const teamDir = path.join(dir, "teams");
for (const name of fs.readdirSync(teamDir)) {
  const text = fs.readFileSync(path.join(teamDir, name), "utf8");
  const uids = [...unfold(text).matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);
  for (const uid of uids) {
    if (!calendarUids.includes(uid)) fail(`${name} UID missing from calendar.ics: ${uid}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Validated ${files.length} ICS files (${calendarUids.length} events in calendar.ics).`);
