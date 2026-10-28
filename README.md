# KC Sports Calendar

One subscribe-able calendar for KU basketball, KU football, the Chiefs, the Royals, Sporting KC, Caledonian Braves, Brentford, Rangers, and Formula 1. A GitHub Actions job rebuilds the `.ics` files every three hours and publishes them with GitHub Pages. There is no server.

## Feeds

| Feed | URL |
| --- | --- |
| Everything | `https://harrisonlhall.github.io/kc-sports-cal/calendar.ics` |
| One team | `https://harrisonlhall.github.io/kc-sports-cal/teams/<key>.ics` |
| A combination | `https://harrisonlhall.github.io/kc-sports-cal/feeds/<key>_<key>.ics` |

Team keys: `ku-mbb`, `ku-fb`, `chiefs`, `royals`, `skc`, `braves`, `brentford`, `rangers`, `f1`. Combination files use that order, joined with `_`. On an iPhone, subscribe with the `webcal://` form of the same path (the site's button does this).

Times are stored in UTC. The calendar asks clients to refresh every two hours (`REFRESH-INTERVAL: PT2H`). The description of each event includes the start time in `America/Chicago`, the venue, and where to watch.

## How a run works

`node scripts/generate.mjs` writes `dist/`:

1. Download `cache.json` from the live Pages site, and read `data/cache.json` in the repo. Keep whichever copy last succeeded for each team.
2. Fetch each team. ESPN (`site.api.espn.com` and `site.web.api.espn.com`, with `sports.core.api.espn.com` for full soccer and college-basketball schedules) is the main source. SofaScore (`api.sofascore.com`, then `api.sofascore1.com` when the main host returns 403) fills gaps and replaces kickoffs ESPN has marked unconfirmed. Caledonian Braves also use the club fixtures page and TheSportsDB. Brentford and Rangers include league, cup, and European matches.
3. If a live fetch comes back empty, or with far fewer upcoming games than the last good feed, keep the previous events for that team.
4. Write `calendar.ics`, every per-team file, every combination, `status.json`, and `cache.json`.
5. Exit 0 even when a team is stale, and record that in the Actions output. The deploy still publishes the last good events. A follow-up job then exits 1, so the workflow fails and GitHub can email the owner.

A team counts as stale for a prolonged time when it is in its usual season and no live source has succeeded for 72 hours. An offseason team, or a team whose schedule is genuinely not published yet, does not fail the workflow.

`status.json` has, per team, the event count, upcoming count, next kickoff, last successful fetch, and the source that produced the file (`espn`, `sofascore`, `club`, `thesportsdb`, `cache`, or a combination).

## Enable GitHub Pages

The workflow deploys with `actions/deploy-pages`. The repository has to allow that source once:

1. Open **Settings → Pages** for this repo: `https://github.com/harrisonlhall/kc-sports-cal/settings/pages`
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not "Deploy from a branch").
3. Actions → **Update calendars** → **Run workflow**.

The schedule is `0 */3 * * *` UTC, and a push to `main` that changes the generator, the site, or this workflow also runs it. The workflow permissions are `pages: write` and `id-token: write`.

## Add a team

Edit `scripts/lib/teams.mjs`. Each entry needs a `key`, display fields (`name`, `short`, `league`, `emoji`, `color`, `label`), `durationH`, `inSeasonMonths` (1–12, America/Chicago), and at least one id:

- `espn.kind: "site"` for an ESPN team schedule (`path`, `teamId`). Add `core` when the public schedule hides future games.
- `espn.kind: "soccer"` with `teamId` and a `leagues` list (`slug` + display `name`) for every competition that should be included.
- `espn.kind: "core"` for a single ESPN core season (college basketball uses the spring year).
- `sofaId` from SofaScore's team id. The generator uses it when ESPN is short or wrong on the kickoff.
- `tsdbId` is an optional TheSportsDB fallback.
- `officialSite: true` is the Caledonian Braves path (club page + SofaScore + TheSportsDB).

`multiComp: true` puts the competition name in the event title. Run `node scripts/generate.mjs`, then `node scripts/validate-ics.mjs dist`, and commit `scripts/lib/teams.mjs` plus the refreshed `data/cache.json`. The landing page reads `teams.json` produced by the generator, so it does not need an edit.

## Local preview

Node 20 or newer. There are no npm dependencies.

```bash
node scripts/generate.mjs
node scripts/validate-ics.mjs dist
python3 -m http.server 4173 --directory dist
```

Open `http://127.0.0.1:4173/`.
