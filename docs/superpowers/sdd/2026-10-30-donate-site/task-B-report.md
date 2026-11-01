# Task B report: three tiers and your own number

Status: DONE. Commit `25276e9` on `donate` ("donate: three tiers and your own number; the 30% tier is dropped", Co-Authored-By Claude Fable 5.1), on top of 67e3f1a. 14 files, +104/-134.

Ask (Cyrus, 2026-10-31): "just have 1%, 3%, 10%, and a custom field. Drop the 30%."

## What changed

### Code
- `admin/api/src/donate/doors.mjs`: `TIERS` is now `prompt` 0.01, `context` 0.03 and `run` 0.1. `finetune` is gone, so `TIER_KEYS` (derived) is `["prompt","context","run","own"]`. The fourth caption ("you really like it") is dropped from `APP_CAPTIONS`, `FILM_CAPTIONS`, MacStats' and Day Hike's own arrays (4 places). Header and comment changes: "the three tiers every door shares", "The three tiers, each a share of last month's pool", and "The fourth, dashed row" (was "fifth").
- `admin/api/src/donate/prices.mjs`: comment "The three tiers priced from the pool".
- `admin/api/src/donate/step.mjs`: "three prices" (was four), "four concurrent link creates per door" (was five), "A door's four links" (was five). The budget line is now "about eight sequential creates" (4 products and 4 prices, was ten) and "instead of about thirty sequential calls" (was forty; 8 + 24 = 32).
- `admin/api/src/donate/bucket.mjs`: "this month's three prices".
- `donate/page.mjs`: "three tiers and the free row" in the header comment. The rows already come from `TIERS` plus `CUSTOM`, so there are four radios with no code change.
- `donate/build.mjs`: "its own four link URLs".
- `donate/view.mjs` and `donate/public-src/app.js`: nothing assumed five rows or named the fourth tier. No change.

### Tests and fixture
- `donate/test/fixtures/prices.json`: three tiers, no `finetune` product, four links on each of the six doors (rewritten with the same 1-space JSON format).
- `admin/api/test/donate-prices.test.mjs`:
  - The test is now "three tiers at 1, 3 and 10 percent, then the custom row" and asserts the three tiers.
  - `TIER_KEYS` is asserted as four keys.
  - "$287.40 gives $3, $9 and $29".
  - The floor check is `priceOf(0, 0.1)` (was 0.3).
  - `pricesOf(0)` is `[1,1,1]`.
  - `captions.length` is 3.
- `admin/api/test/donate-step.test.mjs`:
  - "four products, four prices, four links a door" with the three-tier JSON and 24 `createLink`s.
  - The sweep fixtures drop `finetune`. The custom price is `price_o4` (was `price_o5`); the sweep archives 4 prices `price_s1..s4`.
  - The rerun test expects `[3,f0],[9,f1],[30,f2]` with custom `price_f3`. The partial test creates `[9, 30]`.
  - "two of its four links ... gets two new ones" (`context`, `run`).
  - Mid-month door: 4 calls, custom `price_4`.
  - "only the four product keys repeat".
- `donate/test/page.test.mjs`: the `PRICES` fixture has no fine-tune, and the radio count is 4.
- `donate/test/view.test.mjs`: `BAKED` and the `links()` helper have no fine-tune.
- `finance-queries.test.mjs` and `stripe-write.test.mjs` name no tier beyond prompt and context. No change.

### Docs
- Spec `docs/superpowers/specs/2026-10-30-donate-site-design.md`:
  - Section 1: the token units list drops "a fine-tune".
  - Section 2: the intro says "three tiers and your own number, one button".
  - Section 2 item 5 is "**Three tiers** (Cyrus, Oct 31: the 30% tier was dropped; three tiers and the custom row)", with three shares, three names and three captions per door. Item 6 is "A fourth, dashed row".
  - Section 3, "The shares": "Three tiers at 1%, 3% and 10%" with the Oct 31 note. The original "4 exponentially increasing percentiles" quote is kept as history ("They began as four"). The example is "$3, $9 and $29", and the custom row is "The fourth row".
  - Section 4: step 3 is "three prices". Step 4's products drop "A fine-tune" and read "Four links per door ... 24 links a month, seven doors and 28 links with Day Hike". Step 6 is "the four prices".
  - Section 8: "three exponential tiers" with the Oct 31 note.
  - The edited paragraphs were reflowed to the file's width.
- Plan `docs/superpowers/plans/2026-10-30-donate-site.md`:
  - Goal: "three prices".
  - Global Constraints: the tier line lists three tiers with the Oct 31 note, and the custom row is "the fourth row".
  - Review Focus 1: "three prices".
  - Task 1 opens with a one-line note: the `finetune` tier was dropped on Oct 31 and the plan's text and tests are updated to match.
  - Task 1's interfaces: `TIERS`, `TIER_KEYS`, `captions: [3 strings]` and "its three captions".
  - The test code in Tasks 1, 3 and 7 is updated the same way as the real tests.
  - "four products", the products JSON, "each of the four tier keys", "a fieldset of four labels" and Task 13's "three prices and the custom row".
- `AGENTS.md`, the `donate/` row: "three tiers, each a share of last month's cloud spend, plus your own number".
- `admin/CONTRACT.md` and `admin/api/README.md`: they do not count tiers. No change.
- `.superpowers/` mockups: not touched.

## Grep hits resolved

I searched `admin/api/src`, `admin/api/test`, `donate`, the spec, the plan, `AGENTS.md`, `admin/CONTRACT.md`, `admin/api/README.md` and `docs_lib.mjs` for these patterns: `fine-tune`, `finetune`, `30%`, `0.3`, `Five links`, `five links`, `35 links`, `30 links`, `four tiers`, `Four tiers`, `four prices`, `$87`, `price_o4`, `price_4`.

- Resolved: every hit in `doors.mjs`, `prices.mjs`, `step.mjs`, `bucket.mjs`, `page.mjs`, `build.mjs`, the fixture, the five test files above, the spec (11 places), the plan (about 25 places) and `AGENTS.md`.
- Left on purpose, because they are not tier shares or counts:
  - `focusY` comments, including "(0.3 lost the radio)" in `doors.mjs`, and `--focus-y 0.3` in `pictures.py` and the plan.
  - `0.3` and `40.3` amounts in the finance, GSC and app tests and fixtures, and in `CONTRACT.md`.
  - The CSS `30%` gradients in `docs_lib.mjs`.
  - The required "(Cyrus, Oct 31: the 30% tier was dropped ...)" notes in the spec and plan, and the plan's Task 1 note.
- `price_o4` and `price_4` still appear in `donate-step.test.mjs` and the plan. They now name the custom ("own") price, the fourth of four objects, not a fourth tier.
- No em-dash in any added line (`git diff | grep '^+' | grep —` gives 0). No email address added.

## Tests

- `cd admin/api && npm test`: 229 tests, 229 pass, 0 fail.
- `node --test donate/test/*.test.mjs apps/test/*.test.mjs .agents/skills/site-quality/tests/*.test.mjs`: 98 tests, 98 pass, 0 fail.

## Build and screenshot

`node donate/build.mjs --prices donate/test/fixtures/prices.json` built 6 doors from the 2026-10 prices. `donate/public/arkos/index.html` has 4 `name="tier"` radios and `<a id="pay" ...test_arkos_context">Tip $9`. I served `donate/public` on port 8789 with `python3 -m http.server`, took the screenshot with headless Chrome at 1280x1400 in the dark scheme, then killed the server.

Screenshot: `/tmp/csarko-donate-site/arkos-desktop-dark.png`. Top to bottom it shows:
- The kicker "BUY ME TOKENS · ARKOS IDE", "Fund my next agent run", the lead and the Arkos hero.
- "In October the cloud behind all this cost $288. Each tier is a slice of that bill." and "Prices are from October." That last line is expected locally: the live fetch fails, so the page uses its baked prices.
- Three tier rows:
  - A prompt, "a quick fix, a good question", $3, about 1%.
  - A long context window, "a whole feature, read end to end", $9, about 3%, selected.
  - A whole agent run, "a milestone, start to merge", $29, about 10%.
- The dashed "Your own number" row: "set it at checkout", any, $1 or more.
- The button "Tip $9" and "Payments by Stripe · no account needed".

The layout is clean with no gap where the fourth row was.

## Concerns

- I did not change this pre-existing fixture oddity: in `donate/test/fixtures/prices.json`, the arkos door's `own` link URL is `https://buy.stripe.com/test_hallway_own` (its id is `plink_test_arkos_own`). It only affects the fixture, not the code.
- This report is under the git-ignored `.superpowers/`, so it is not in the commit.
