---
name: substack-post
description: >-
  Turn 1 to 4 published csarko.sh research docs into one short, non-technical post
  for Cyrus's Substack (csarko.log) that links back to the full docs, written in his
  voice rather than a model's. Use whenever the user wants a Substack post, newsletter
  issue or csarko.log post about his docs ("write a Substack post about the grass
  doc", "summarise the netcode and signaling docs for Substack", "what hasn't been on
  Substack yet?"), wants to record a post he just published, or wants to build or
  refresh his voice profile. Not for publishing a doc on the site (that's publish-doc).
---

# Substack posts from research docs

A post is a short, plain-language way into one to four docs already live at
`https://csarko.sh/research/<slug>`, and its job is to send readers there. The design,
and the research behind every rule below, is in
`docs/superpowers/specs/2026-09-23-substack-post-design.md`.

**Two rules outrank everything else in this skill:**

1. **The post says nothing Cyrus didn't.** Every claim, opinion, anecdote and number
   comes from the docs or from his angle (step 3). Never invent a feeling, a story, a
   lesson or a statistic to fill space. If the angle is thin, ask for more.
2. **It must read as his, not a model's.** Substack scans every post with Pangram and
   any reader can check one with a tap. The voice profile and the lint are the tools;
   the checklist ends with Substack's own check.

Nothing is posted for him: Substack has no posting API. The skill hands over a package
and he pastes it in.

## The voice profile

`~/.config/csarko-sh/voice.md`, **outside the repo, never committed** (the repo is
public). Post mode refuses to run without it. It has fixed headings, because
`lint_post.py` reads the protect list from it:

```markdown
# Voice: Cyrus Sarkosh
## Rules
## Words I use
## Words I never use
## Protect
- <one word or phrase per line; the lint exempts these from its AI-tell rules>
## Examples
### <where it came from>
<verbatim excerpt>
```

### Setup mode: build or refresh it

1. **Samples.** Ask Cyrus for files he wrote himself: emails, old posts, notes,
   READMEs, PR descriptions. Read all of them. If one looks agent-drafted, ask before
   using it. Don't use `docs/published/`: those docs were largely agent-written.
2. **Draft the profile** from the samples:
   - sentence and paragraph length
   - punctuation habits
   - contractions, first person, humour
   - how he opens and how he closes
   - words he reaches for and words he never uses
   - how much jargon he allows
3. **Interview him**, one question per message, 6 to 10 questions on what the samples
   can't show. For example: how he'd explain a shader bug to a non-engineer friend,
   what makes him stop reading a post, and phrases he catches himself overusing.
4. **Examples:** 3 to 5 short excerpts copied exactly from the samples. Paraphrases don't count.
5. **Protect list:** his own habits that look like AI tells (a fragment style, a pet
   phrase), so the lint leaves them alone.
6. **Show him the whole profile and write it only when he approves.** Don't keep the
   samples anywhere.

## Post mode

### 1. Pick the docs

He names 1 to 4 slugs, or asks what hasn't been on Substack yet. To answer that, list
the slugs in `docs/published/` that no entry in `docs/substack/posts.json` names.

Refuse a slug unless both hold:
- it is in `docs/published/`
- `curl -sI https://csarko.sh/research/<slug>` returns 200

A post that links to a 404 is the worst outcome. If `voice.md` is missing, stop and
offer setup mode.

### 2. Read the docs

Read each whole doc. The post is written for a reader who isn't an engineer, so look
for:
- the question each doc answers
- the surprise in it
- what it cost in time or effort

Leave the mechanism to the doc itself.

### 3. Take his angle

Ask for 2 to 3 minutes of dictation (pasted as text) or about five bullets:
- why these docs, or this one
- what he thinks about them
- one concrete moment: a bug, a surprise, a cost

If it can't carry 300 words without padding, ask a follow-up question instead of filling
the gap.

### 4. Draft

Load `voice.md` into context first, then write `post.md` in this exact shape (the lint
parses it):

```markdown
# <title>
## <subtitle>

<body paragraphs>

[<button text>](<url>)
```

- **Title:** 9 to 17 words, first-person or number-led, no question mark. It is the
  email subject line too.
- **Subtitle:** 6 to 10 words that say something the title doesn't. It is the email's
  preview line.
- **Body:** 300 to 600 words of plain prose, no headers, at most two bold phrases.
  - Link a doc in paragraph 1 or 2, since many readers never reach the bottom.
  - Link each doc again where the post talks about it.
  - End on one question to the reader, since comments are what Substack's feed rewards.
- **Button:** the last line. It links the single doc, or `https://csarko.sh/research`
  when the post covers several. He makes it a Substack "Custom" button when pasting.
- **Links:** every csarko.sh link ends
  `?utm_source=substack&utm_medium=email&utm_campaign=<post-slug>`. `<post-slug>` is
  the title lowercased, with each run of non-letters turned into one hyphen. GoatCounter
  shows these visits under the referrer `substack`.
- **Site rules** (`AGENTS.md`, Content rules):
  - no em-dashes
  - no email address or phone number
  - no metrics or customer names from his DoorDash work
  - nothing about the commercial asset pipeline

Write `notes.md` too: two Substack Notes, each 120 to 300 characters, with **no URL
and no domain name**. A link in a Note halves its reach, and an outside link almost
never gets a like.
- One goes out with the restack on publish day.
- One is a teaser for the next day that names the post ("my latest post on…").

### 5. Lint

```bash
.agents/skills/substack-post/scripts/lint_post.py post.md --notes notes.md --slugs <a,b>
```

Fix every error and look at every warning. A warning may stand only when breaking the
rule is deliberate; list each one that stands when you hand over the package.

The lint catches words and shapes, not rhythm. After it passes, read the draft beside
the profile's examples. Rewrite any sentence he wouldn't say, such as:
- an evenly balanced sentence
- a tidy moral
- a lesson the angle didn't contain

### 6. Hand over the package

Put everything in a folder in the session's scratchpad directory. **Never commit a
draft:** the repo is public, so a committed draft is published before the post is.
- `post.md` and `notes.md`
- `cover.jpg`, the 1456×1048 cover card, from
  `.agents/skills/substack-post/scripts/cover.py "<title>" <folder>/cover.jpg`. Look at
  it before handing it over.
- An optional disclosure line for Substack's "How I make this" field, for example: "I
  write the angle and the research; Claude helps me shape the post."

Then give him this checklist:
1. New post: paste `post.md` (the title and subtitle go in their own fields; turn the last line into a Custom button).
2. Upload `cover.jpg` as the cover.
3. Send a test email and read it on a phone.
4. Run Substack's AI check on the draft.
5. Publish as email and web.
6. Restack it with the first Note.
7. Post the second Note the next day.

### 7. After he publishes

He gives you the post's Substack URL. Then:

1. **Log it.** Append the entry to `docs/substack/posts.json` (keep the list sorted by
   date) and commit on a branch, as with any other change:

   ```json
   {"date": "YYYY-MM-DD", "url": "<substack url>", "title": "<title>", "slugs": ["<slug>", "..."]}
   ```

2. **Learn from his edits.** Fetch the live post and compare it with your draft. What he
   changed by hand is the best voice data there is. For each pattern in his edits ("you
   cut every 'so'"), propose a change to `voice.md`, one at a time. Write only the ones
   he accepts.
