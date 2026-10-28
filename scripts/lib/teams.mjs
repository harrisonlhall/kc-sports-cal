/**
 * Team catalog. The generator and the landing page both read this list.
 *
 * To add a team:
 * 1. Add an entry here (key, names, ESPN and/or SofaScore ids, in-season months).
 * 2. Run `node scripts/generate.mjs` and check the new /teams/<key>.ics file.
 * 3. Commit. The next Pages run publishes the feed. No page code change is required.
 *
 * IDs were checked against live schedules on 2026-10-28:
 *   Brentford ESPN 337 / SofaScore 50 / TheSportsDB 134355
 *   Rangers   ESPN 257 / SofaScore 2351 / TheSportsDB 133642
 *   Chiefs ESPN 12 (slug kc) / SofaScore 4422
 *   Royals ESPN 7 (slug kc) / SofaScore 3651
 *   Sporting KC ESPN 186 / SofaScore 2509
 *   KU ESPN 2305 / SofaScore football 4369, men's basketball 34634
 *   Caledonian Braves SofaScore 329412 / TheSportsDB 142330
 */

export const PROLONGED_MS = 72 * 60 * 60 * 1000;
export const PAST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const TEAMS = [
  {
    key: "ku-mbb",
    name: "Kansas Jayhawks Basketball",
    short: "KU Basketball",
    league: "NCAA Men's Basketball",
    emoji: "🏀",
    color: "#0051BA",
    label: "KU Basketball",
    durationH: 2,
    inSeasonMonths: [10, 11, 12, 1, 2, 3, 4],
    names: ["Kansas Jayhawks"],
    espn: {
      kind: "core",
      sport: "basketball",
      league: "mens-college-basketball",
      teamId: "2305",
      season: "mbb",
    },
    sofaId: 34634,
  },
  {
    key: "ku-fb",
    name: "Kansas Jayhawks Football",
    short: "KU Football",
    league: "NCAA Football",
    emoji: "🏈",
    color: "#0051BA",
    label: "KU Football",
    durationH: 3.5,
    inSeasonMonths: [8, 9, 10, 11, 12, 1],
    names: ["Kansas Jayhawks"],
    espn: {
      kind: "site",
      path: "football/college-football",
      teamId: "2305",
      numericId: "2305",
      season: "fall",
      core: { sport: "football", league: "college-football", teamId: "2305" },
    },
    sofaId: 4369,
  },
  {
    key: "chiefs",
    name: "Kansas City Chiefs",
    short: "Chiefs",
    league: "NFL",
    emoji: "🏈",
    color: "#E31837",
    label: "Chiefs",
    durationH: 3.25,
    inSeasonMonths: [8, 9, 10, 11, 12, 1, 2],
    names: ["Kansas City Chiefs", "Chiefs"],
    espn: {
      kind: "site",
      path: "football/nfl",
      teamId: "kc",
      numericId: "12",
      season: "fall",
      core: { sport: "football", league: "nfl", teamId: "12" },
    },
    sofaId: 4422,
  },
  {
    key: "royals",
    name: "Kansas City Royals",
    short: "Royals",
    league: "MLB",
    emoji: "⚾",
    color: "#7EB6FF",
    label: "Royals",
    durationH: 3,
    inSeasonMonths: [3, 4, 5, 6, 7, 8, 9, 10],
    names: ["Kansas City Royals", "Royals"],
    espn: {
      kind: "site",
      path: "baseball/mlb",
      teamId: "kc",
      numericId: "7",
      season: "mlb",
      core: { sport: "baseball", league: "mlb", teamId: "7" },
    },
    sofaId: 3651,
  },
  {
    key: "skc",
    name: "Sporting Kansas City",
    short: "Sporting KC",
    league: "MLS",
    emoji: "⚽",
    color: "#8FD0FF",
    label: "Sporting KC",
    durationH: 2,
    inSeasonMonths: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    names: ["Sporting Kansas City", "Sporting KC"],
    fallbackBroadcast: "MLS Season Pass (Apple TV)",
    espn: {
      kind: "soccer",
      teamId: "186",
      leagues: [{ slug: "usa.1", name: "MLS" }],
    },
    sofaId: 2509,
  },
  {
    key: "braves",
    name: "Caledonian Braves F.C.",
    short: "Caledonian Braves",
    league: "Lowland League",
    emoji: "⚽",
    color: "#D6B25E",
    label: "Caledonian Braves",
    durationH: 2,
    multiComp: true,
    inSeasonMonths: [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5],
    names: ["Caledonian Braves", "Caledonian Braves FC"],
    fallbackBroadcast: "Braves TV (YouTube)",
    espn: null,
    sofaId: 329412,
    tsdbId: "142330",
    officialSite: true,
  },
  {
    key: "brentford",
    name: "Brentford FC",
    short: "Brentford",
    league: "Premier League",
    emoji: "🐝",
    color: "#E30613",
    label: "Brentford",
    durationH: 2,
    multiComp: true,
    inSeasonMonths: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5],
    names: ["Brentford"],
    espn: {
      kind: "soccer",
      teamId: "337",
      leagues: [
        { slug: "eng.1", name: "Premier League" },
        { slug: "eng.fa", name: "FA Cup" },
        { slug: "eng.league_cup", name: "EFL Cup" },
        { slug: "uefa.champions", name: "Champions League" },
        { slug: "uefa.europa", name: "Europa League" },
        { slug: "uefa.europa.conf", name: "Conference League" },
        { slug: "uefa.champions_qual", name: "UCL Qualifying" },
        { slug: "uefa.europa_qual", name: "UEL Qualifying" },
        { slug: "uefa.europa.conf_qual", name: "UECL Qualifying" },
      ],
    },
    sofaId: 50,
    tsdbId: "134355",
  },
  {
    key: "rangers",
    name: "Rangers FC",
    short: "Rangers",
    league: "Scottish Premiership",
    emoji: "⚽",
    color: "#6EA8FF",
    label: "Rangers",
    durationH: 2,
    multiComp: true,
    inSeasonMonths: [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5],
    names: ["Rangers"],
    espn: {
      kind: "soccer",
      teamId: "257",
      leagues: [
        { slug: "sco.1", name: "Scottish Premiership" },
        { slug: "sco.tennents", name: "Scottish Cup" },
        { slug: "sco.cis", name: "Scottish League Cup" },
        { slug: "sco.challenge", name: "Scottish Challenge Cup" },
        { slug: "uefa.champions", name: "Champions League" },
        { slug: "uefa.europa", name: "Europa League" },
        { slug: "uefa.europa.conf", name: "Conference League" },
        { slug: "uefa.champions_qual", name: "UCL Qualifying" },
        { slug: "uefa.europa_qual", name: "UEL Qualifying" },
        { slug: "uefa.europa.conf_qual", name: "UECL Qualifying" },
      ],
    },
    sofaId: 2351,
    tsdbId: "133642",
  },
  {
    key: "f1",
    name: "Formula 1 Grands Prix",
    short: "Formula 1",
    league: "F1",
    emoji: "🏁",
    color: "#FF1E00",
    label: "F1",
    durationH: 2,
    inSeasonMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    names: [],
    fallbackBroadcast: "ESPN / F1 TV Pro",
    espn: { kind: "f1" },
    sofaUniqueStage: 40,
  },
];

export const ALL_KEYS = TEAMS.map((team) => team.key);

export function teamByKey(key) {
  return TEAMS.find((team) => team.key === key);
}
