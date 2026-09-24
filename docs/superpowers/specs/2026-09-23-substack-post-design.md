# Substack posts from research docs: design

Date: 2026-09-23 · Status: approved in brainstorming, awaiting spec review

## Goal

Turn one to four published research docs (`https://csarko.sh/research/<slug>`) into a
single short, non-technical post for csarko.log on Substack
(`https://csarko.substack.com/`), so that Substack readers follow its links to the full
docs on csarko.sh. The post has to follow what is known to earn engagement on Substack,
and it has to read as Cyrus's own writing, not as a model's.

A new skill, `substack-post`, does this. It is separate from `publish-doc`: the workflow
is to publish a few docs first, then gather one or more of them into a post later.

## Decisions

| Question | Decision |
|---|---|
| Separate skill or a step in `publish-doc` | Separate: `.agents/skills/substack-post/` in this repo, since it reads `docs/published/` and knows the site's URLs |
| Docs per post | 1 to 4 published slugs |
| Where the words come from | Cyrus supplies the angle (dictation or about five bullets); the skill structures it with the docs and adds no claims of its own |
| Sounding like Cyrus | A private voice profile built once from his own writing plus an interview, refined after every post from his edits |
| Output | A paste-ready package in the session scratchpad; nothing posted automatically (Substack has no posting API) |
| Checks | A deterministic lint script (errors and warnings); Substack's own Pangram check, run by Cyrus in the editor, as the last step |
| Cover image | A generated 1456×1048 title card in the site's dark theme |
| Record of posts | `docs/substack/posts.json`, committed |

## Non-goals

- Posting, scheduling or editing on Substack (no API; browser automation was considered
  and left out as fragile).
- Calling Pangram or any other detector from the skill. Optimising a draft against a
  detector optimises for the detector; Cyrus runs Substack's check once, at the end.
- Generating opinions, anecdotes or numbers. Every claim traces to a doc or to Cyrus's angle.
- Paid posts, series, cross-posting to other platforms.
- Showing on csarko.sh which docs were featured on Substack.

## Research this design rests on

Gathered 2026-09-23. The full notes are in that session's transcript; the load-bearing
findings:

**Substack engagement.** From WriteStack / The Writing Edge's scrape of 94k posts and
655k Notes, plus Substack's Grow guide and support articles:
- Titles of 9 to 17 words, first-person or number-led, do best; question-mark titles slightly worse.
- The subtitle is the email preheader: 6 to 10 words that add new information; 1 to 5 words performs like none.
- A cover image is close to mandatory (posts without one: -81% reactions). Spec 1456×1048; 68% of reads are on phones.
- Short posts win on reactions per word. 300 to 600 words suits a summary that links out.
- One primary call to action; a closing question drives comments, which the feed weights.
- Many readers never reach the bottom, so the outbound link goes in paragraph 1 or 2 as well as a button at the end.
- A URL in a Note halves its median likes, and an external URL has a 92% chance of zero likes. Notes name the post and never carry a csarko.sh link.
- Substack posts have no canonical tag, so the post's text must differ from the doc's (it will: it is a summary).
- Substack does not add UTM parameters; hand-tagged ones reach GoatCounter as the referrer.

Sources: https://writebuildscale.substack.com/p/i-analyzed-94391-substack-posts-heres,
https://thewritingedge.substack.com/p/how-to-make-urls-in-your-notes-convert,
https://on.substack.com/p/grow-3,
https://support.substack.com/hc/en-us/articles/5320347155860.

**Not reading as AI-written.**
- Substack scans posts with Pangram since 2026-07-24. Readers can score any post; writers
  can test drafts and add a "How I make this" disclosure
  (https://on.substack.com/p/how-writers-are-reacting-to-substacks). Pangram's false-positive
  rate on human text is close to zero in independent tests.
- What works, strongest first:
  1. The human supplies the substance and the model edits (https://sockpuppet.org/blog/2026/09/17/how-to-write-with-an-llm/).
  2. A voice profile with 3 to 5 of the author's own samples. Epoch AI measured 10 to 18% of such outputs passing detectors against under 1% for plain prompts (https://epoch.ai/data-insights/ai-detectors-false-negatives).
  3. A humanizer pass with a per-author protect list (https://github.com/blader/humanizer, https://github.com/kjmagnan1s/anti-slop).
  4. Banned-word lists alone come last: the vocabulary drifts between model generations.
- The catalogue of tells comes from Wikipedia's "Signs of AI writing"
  (https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) and `vale-ai-tells`
  (https://github.com/tbhb/vale-ai-tells).
- Learning the profile from the author's edits is taken from
  https://github.com/TravinDSO/myvoice-skill.

## Files

| Path | What |
|---|---|
| `.agents/skills/substack-post/SKILL.md` | The two modes, the drafting rules, the package checklist |
| `.agents/skills/substack-post/scripts/lint_post.py` | The lint (standard-library Python) |
| `.agents/skills/substack-post/scripts/cover.py` | Renders the cover card |
| `.agents/skills/substack-post/assets/cover.html` | The cover template |
| `.agents/skills/substack-post/tests/test_lint_post.py` | `unittest` tests for the lint |
| `docs/substack/posts.json` | The committed log of posts |
| `~/.config/csarko-sh/voice.md` | The voice profile. **Outside the repo, never committed.** |

`.claude/skills` is already a symlink to `.agents/skills`, so Claude Code discovers the
new skill with no further wiring.

## Setup mode: the voice profile

Run once, and again whenever Cyrus wants a fresh profile.

1. **Samples.** Cyrus points at files he wrote himself: emails, old posts, notes,
   READMEs, PR descriptions. The skill reads all of them. Anything that looks
   agent-drafted is set aside after asking him, since a sample of model prose would
   teach the profile the wrong voice. The research docs in `docs/published/` are not
   used as samples for that reason.
2. **Draft the profile** from the samples. It covers:
   - sentence and paragraph length
   - punctuation habits
   - contractions, first person and humour
   - how he opens and closes a piece
   - words he uses and words he never uses
   - how much jargon he allows
3. **Interview**, one question at a time, 6 to 10 questions on what the samples can't show.
   For example: how he'd explain a shader bug to a non-engineer friend, what makes him stop
   reading a post, and phrases he catches himself overusing.
4. **Examples**: 3 to 5 short excerpts copied exactly from the samples. Paraphrases don't count.
5. **Protect list**: his own habits that look like AI tells (a fragment style, a pet
   phrase). The lint exempts them.
6. **Review**: Cyrus reads the profile and approves it before it is written.

The profile is Markdown with fixed section headings, so the lint can find the protect list:

```markdown
# Voice: Cyrus Sarkosh
## Rules
## Words I use
## Words I never use
## Protect
- <one word or phrase per line>
## Examples
### <where it came from>
<verbatim excerpt>
```

The samples themselves are not stored anywhere; only the profile is.

`.gitignore` gains `voice.md` as a second line of defence (the file should never be in
the repo in the first place).

## Post mode

1. **Pick the docs.** Cyrus names 1 to 4 slugs, or asks which docs haven't been on
   Substack yet. The skill answers that from `docs/substack/posts.json` against
   `docs/published/`. It refuses a slug that is not live: the slug must exist in
   `docs/published/`, and `https://csarko.sh/research/<slug>` must return 200.
2. **Refuse without a profile.** If `~/.config/csarko-sh/voice.md` is missing, it stops
   and points to setup mode.
3. **Take the angle.** It asks for 2 to 3 minutes of dictation, pasted as text, or about
   five bullets:
   - why these docs, or this one
   - what he thinks about them
   - one concrete moment: a bug, a surprise, a cost

   If the angle is too thin to carry the post, it asks again rather than padding.
4. **Draft** with the voice profile's rules and examples in context:
   - title of 9 to 17 words, first-person or number-led, no question mark
   - subtitle of 6 to 10 words that says something the title doesn't
   - 300 to 600 words of plain prose; no headers
   - a csarko.sh link in paragraph 1 or 2, and a link to each doc where the post discusses it
   - one closing question
   - one button at the end (a Substack "Custom" button, pointing at the single doc, or at `/research` for several)
   - every csarko.sh link tagged `?utm_source=substack&utm_medium=email&utm_campaign=<post-slug>`,
     where `<post-slug>` is the post title lowercased and hyphenated

   Content rules from `AGENTS.md` apply:
   - no em-dashes
   - no email address or phone number
   - facts only from the docs or the angle
   - nothing about the commercial asset pipeline
   - no metrics or customer names from his DoorDash work
5. **Lint** with `lint_post.py`, fix every error, and look at every warning. A warning may
   stand when breaking the rule is deliberate; the package names each one that stands.
6. **Hand over the package** in the session scratchpad, never committed:
   - `post.md`: the title, subtitle, body and button, ready to paste
   - `cover.jpg`: the 1456×1048 card
   - `notes.md`: two Notes, neither with a URL. One is for publish day, to go with the
     restack. The other is a teaser for the next day that names the post.
   - A one-line "How I make this" disclosure he may choose to use, stating that he wrote
     the angle and Claude helped shape the post.
   - The checklist:
     1. Paste into a new Substack post.
     2. Upload the cover.
     3. Send a test email and read it on a phone.
     4. Run Substack's AI check on the draft.
     5. Publish as email and web.
     6. Restack it.
     7. Post the day-2 Note.
7. **After publishing**, Cyrus gives the Substack URL. The skill:
   1. Appends `{date, url, title, slugs}` to `docs/substack/posts.json` and commits it on a
      branch, as with any other change to the repo.
   2. Fetches the live post and compares it with the draft. It proposes profile changes
      from his hand edits ("you cut every 'so'"), one at a time; he accepts or rejects
      each, and accepted ones are written to `voice.md`.

## The lint

`lint_post.py <post.md> [--notes notes.md] [--slugs a,b] [--voice path]`. `--voice`
defaults to `~/.config/csarko-sh/voice.md` and is optional, so tests and a first run
without a profile still work. The script exits 1 if there is any error, 0 otherwise, and
prints each finding with its line.

`post.md` has a fixed shape so the lint can parse it:

```markdown
# <title>
## <subtitle>

<body paragraphs>

[<button text>](<url>)
```

**Errors:**

| Group | Rule |
|---|---|
| Site rules | No em-dash (`—`) or en-dash (`–`) |
| Site rules | No email address or phone number (the patterns `deploy.sh` uses) |
| Links | Every `--slugs` doc is linked at least once as `https://csarko.sh/research/<slug>`, and no link names a slug missing from `docs/published/` |
| Links | A csarko.sh link appears in body paragraph 1 or 2 |
| Links | Every csarko.sh link carries `utm_source=substack`, `utm_medium=email` and the same `utm_campaign` |
| Links | `notes.md` contains no URL |
| AI tells | Vocabulary list: delve, tapestry, testament, pivotal, crucial, intricate, interplay, meticulous, vibrant, garner, underscore, boasts, leverage, harness, navigate, embark, foster, spearhead, showcase, landscape (as a metaphor), realm, seamless, robust, game-changer |
| AI tells | Negative parallelism: "not just … but", "it's not … it's" |
| AI tells | Copula avoidance: "serves as", "stands as" |
| AI tells | Staged openers: "Here's the thing", "Let's dive in", "In today's …" |
| AI tells | Summarising closers: "In short", "In conclusion", "Ultimately," |
| AI tells | More than two bold spans; any header after the subtitle |

A word or phrase on the voice profile's protect list is exempt from the AI-tell rules
(never from the site or link rules).

**Warnings:**

| Rule |
|---|
| Title outside 9 to 17 words, or ending in `?` |
| Subtitle outside 6 to 10 words, or sharing more than half its words with the title |
| Body outside 300 to 600 words |
| No `?` in the last body paragraph |
| More than two "X, Y and Z" lists |

What the lint cannot see is cadence, which is why the profile exists and why Substack's
Pangram check is the last step.

## The cover

`cover.py "<title>" <out.jpg>` fills `assets/cover.html` with the title, renders it at
1456×1048 with headless Chrome, and converts it to JPEG with `sips`. It finds Chrome the
same way `generate-assets.sh` does. The template follows `site-quality/assets/og-image.html`:
- fonts loaded from `site-quality/assets/fonts/`, by relative path
- the dark tokens and the teal radial glow
- a mono eyebrow reading `csarko.log`
- the title in Inter
- `csarko.sh/research` at the foot

The title is HTML-escaped. A title that overflows two lines at the base size steps the
font size down.

## Tests

`python3 -m unittest discover -s .agents/skills/substack-post/tests`, in the style of
`site-quality/tests/test_check.py`: the script is loaded by path, and each case writes a
throwaway `post.md`. Coverage:
- a passing and a failing sample for every error and warning rule
- the protect-list exemption
- UTM parameters present but mismatched between links
- a slug that doesn't exist
- a clean post that produces no findings

The cover script is checked by running it once and reading the image. It gets no unit test.

## Docs updates

- `AGENTS.md`:
  - the layout table gains `docs/substack/`
  - the skills row lists `substack-post`
  - Workflows gains "Write a Substack post"
  - the csarko.log line in Content rules says posts are made with the skill
- `README.md`: the skills list.
- `publish-doc/SKILL.md`: its description says "not … for Substack posts". It will point
  to `substack-post` instead.

## Amendment, 2026-09-23: IEEE sources

The same day, `publish-doc` moved to IEEE citations: bare `[n]` markers in the text and a
numbered `## Sources` list, enforced by `docs_lib.mjs` for docs published from
2026-09-23 (`IEEE_SINCE`) and for any doc already converted. The eleven older docs are not
converted in bulk. Post mode's step 2 converts each chosen doc through `publish-doc`
(entries, markers, `updated:`, deploy) before drafting, so a post never links to a doc
whose conversion hasn't shipped.

## Amendment, 2026-09-23: a real image first

The first post showed that Substack uses a post's first image as its social preview,
with the title and subtitle beneath it, so a generated title card only repeats them.
Every post now carries one real image (a screenshot or film still from Cyrus) after
paragraph 1, and the lint warns when it's missing. `cover.py` is the fallback for a
post with no image. The same post showed that Markdown pastes into Substack as
literal text, so `copy_body.py` puts the body on the clipboard as rich text instead.

## Amendment, 2026-09-24: Cyrus writes, Claude outlines and reviews

The first post, drafted by Claude in the author's voice and passing every check here,
scored AI 100%, Human 0% on Substack's Pangram check. Pangram 4's technical report
explains why: it is a learned classifier trained on AI rewrites of human documents, and
it catches style imitation and humanizer rewrites (the full account is the research doc
`/research/voice-profile-vs-pangram`). The skill no longer writes post text. Post mode is
now: outline (arc, per-paragraph job, facts as notes, links, a question to answer; no
finished sentences) → Cyrus writes the post and Notes → review (exact fixes for spelling
and grammar only; coherence and fact problems described, never rewritten) → suggestions
for places to put dry humour, from the voice profile, without the joke itself. The lint
gains `--author`, which turns the AI-tell and formatting rules into warnings for his own
text while the site and link rules still fail. The voice profile now guides the review
and the humour suggestions, and each published post becomes a new real sample for it.
This supersedes "Where the words come from" in Decisions and steps 3 to 6 of "Post mode"
above.
