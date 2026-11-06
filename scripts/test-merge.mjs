import assert from "node:assert/strict";
import { applyCachedUids, chooseEvents } from "./lib/merge.mjs";

function event(fields) {
  const start = new Date(fields.start);
  return {
    uid: fields.uid,
    team: "rangers",
    title: fields.title || `Rangers @ ${fields.opponent}`,
    opponent: fields.opponent,
    home: fields.home ?? false,
    competition: fields.competition || "Scottish Premiership",
    session: "",
    start,
    end: new Date(start.getTime() + 2 * 3600_000),
    location: "",
    broadcast: "",
    note: "",
    source: fields.source || "espn",
  };
}

const prem = event({
  uid: "espn-rangers-401878317",
  opponent: "Hibernian",
  start: "2026-12-07T20:00:00Z",
});
const cup = event({
  uid: "espn-rangers-401920022",
  opponent: "Hibernian",
  start: "2026-12-13T15:00:00Z",
  competition: "Scottish League Cup",
});
applyCachedUids([prem, cup], [prem]);
assert.equal(prem.uid, "espn-rangers-401878317");
assert.equal(cup.uid, "espn-rangers-401920022", "a second match against the same club in one month keeps its own uid");

const moved = event({
  uid: "espn-rangers-401878309",
  opponent: "St Johnstone",
  start: "2027-01-13T20:00:00Z",
});
const stillDecember = event({
  uid: "sofa-rangers-170000",
  opponent: "St. Johnstone",
  start: "2026-12-13T12:00:00Z",
  source: "sofascore",
});
const cachedDecember = event({
  uid: "espn-rangers-401878309",
  opponent: "St Johnstone",
  start: "2026-12-13T12:00:00Z",
});
applyCachedUids([stillDecember, moved], [cachedDecember]);
assert.equal(moved.uid, "espn-rangers-401878309");
assert.notEqual(stillDecember.uid, moved.uid, "a fixture left on the old date does not inherit the moved match uid");

const cachedCeltic = event({
  uid: "espn-rangers-401800001",
  opponent: "Celtic",
  start: "2026-12-20T12:00:00Z",
});
const retimed = event({
  uid: "sofa-rangers-55",
  opponent: "Celtic",
  start: "2026-12-20T15:30:00Z",
  source: "sofascore",
});
applyCachedUids([retimed], [cachedCeltic]);
assert.equal(retimed.uid, "espn-rangers-401800001", "a same-day kickoff change keeps the published uid");

const fresh = [
  event({ uid: "espn-rangers-401878309", opponent: "St Johnstone", start: "2027-01-13T20:00:00Z" }),
];
const cached = [
  event({ uid: "espn-rangers-401878309", opponent: "St Johnstone", start: "2026-12-13T12:00:00Z" }),
  event({ uid: "espn-rangers-a", opponent: "Celtic", start: "2026-12-02T20:00:00Z" }),
  event({ uid: "espn-rangers-b", opponent: "Aberdeen", start: "2026-12-05T15:00:00Z" }),
  event({ uid: "espn-rangers-c", opponent: "Dundee", start: "2026-12-09T20:00:00Z" }),
  event({ uid: "espn-rangers-d", opponent: "Motherwell", start: "2026-12-16T20:00:00Z" }),
];
const chosen = chooseEvents(fresh, cached);
const uids = chosen.events.map((item) => item.uid);
assert.equal(uids.filter((uid) => uid === "espn-rangers-401878309").length, 1);
assert.equal(chosen.stale, true);

console.log("merge uid tests passed");
