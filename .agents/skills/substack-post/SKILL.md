---
name: substack-post
description: >-
  Help Cyrus write a short Substack post (csarko.log) about 1 to 4 of his published
  csarko.sh research docs, linking back to them. Claude outlines the post, Cyrus writes
  every sentence himself, and Claude reviews it (grammar, spelling, coherence, facts,
  links) and suggests spots for dry humour. Use whenever the user wants a Substack post,
  newsletter issue or csarko.log post about his docs ("help me write a Substack post
  about the grass doc", "outline a post on the netcode docs", "review my Substack
  draft", "what hasn't been on Substack yet?"), wants to record a post he just
  published, or wants to build or refresh his voice profile. Not for publishing a doc
  on the site (that's publish-doc).
---

# Substack posts from research docs

A post is a short, plain-language way into one to four docs already live at
`https://csarko.sh/research/<slug>`, and its job is to send readers there. The design,
and the research behind every rule below, is in
`docs/superpowers/specs/2026-09-23-substack-post-design.md`.

**Three rules outrank everything else in this skill:**

1. **Cyrus writes every sentence.** Claude never drafts post text: not the title, the
   subtitle, a paragraph, a caption or a Note. The first version of this skill wrote the
   post in his voice, and Substack's Pangram check scored it AI 100%, Human 0%. Pangram is
   a learned classifier that catches style imitation and humanizer rewrites; the why is
   in `/research/voice-profile-vs-pangram`. The only approach with consistent evidence is
   the author writing and the model editing, and one rule from that evidence stands here:
   he never has to use a word Claude suggests.
2. **Review, don't rewrite.** A spelling or grammar fix may be given exactly. Anything
   bigger (an unclear jump, a weak sentence, a missing fact) is described, and he rewrites
   it. Pangram labels text clause by clause: a clause the model rewrote counts as
   AI-assisted, and enough of those move a post from Human to Mixed.
3. **The post says nothing the docs or Cyrus didn't.** When reviewing, flag any claim,
   number or name that isn't in the docs or his own knowledge, and any fact the docs
   state differently.

Nothing is posted for him: Substack has no posting API. The skill hands over a package
and he pastes it in.

## The voice profile

`~/.config/csarko-sh/voice.md`, **outside the repo, never committed** (the repo is
public). It is no longer a style guide for Claude's writing. It tells the review what is
deliberately his (so a habit isn't "corrected" away) and tells the humour suggestions
what kind of joke he makes. Post mode refuses to run without it. It has fixed headings,
because `lint_post.py` reads the protect list from it:

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

Every post he publishes is a new real sample (step 8).

## Post mode

### 1. Pick the docs

He names 1 to 4 slugs, or asks what hasn't been on Substack yet. To answer that, list
the slugs in `docs/published/` that no entry in `docs/substack/posts.json` names.

Refuse a slug unless both hold:
- it is in `docs/published/`
- `curl -sI https://csarko.sh/research/<slug>` returns 200

A post that links to a 404 is the worst outcome. If `voice.md` is missing, stop and
offer setup mode.

### 2. Read the docs, and convert their sources to IEEE

Read each whole doc. A reader who isn't an engineer has to be able to follow the post,
so look for:
- the question each doc answers
- the surprise in it
- what it cost in time or effort

The post can stay technical, as long as the story holds up for someone who doesn't
follow the mechanics.

**Before outlining, every chosen doc must cite its sources in IEEE style.** That's the
publish-doc skill's "Sources in IEEE style". Docs published before 2026-09-23 are
converted here, one at a time, only when a post uses them. A doc is already converted if
its `## Sources` section is a numbered list. Otherwise, with the publish-doc skill:
1. Rewrite each existing source as an IEEE entry. Open every URL again, and set
   `Accessed:` to the day you checked it.
2. Put the `[n]` markers in the body where the doc relies on each source, numbered by
   first citation.
3. Set `updated:` to today.
4. Build, look at the doc page, commit, and deploy with the deploy skill.
5. Confirm the live page shows the new Sources before outlining.

The post links to the live doc, so it must never go out ahead of the conversion.

### 3. Take his angle, and the image

Ask for about five bullets, or 2 to 3 minutes of dictation pasted as text:
- why these docs, or this one
- what he thinks about them
- one concrete moment: a bug, a surprise, a cost

Ask for the post's image in the same message: a screenshot of the game or a still from a
film, whatever shows what the post is about. Never use another game's screenshots or
art: they are not his to publish. Substack uses the post's first image as its social
preview, above the title and subtitle.

### 4. Outline

Write `outline.md`: the story arc, with **no finished sentences** anywhere in it. Give
him, in this order:

- **Title and subtitle: the rules and the hook, not the words.**
  - Title: 9 to 17 words, first-person or number-led, no question mark; it is the email
    subject line.
  - Subtitle: 6 to 10 words that add something the title doesn't; it is the email's
    preview line, so the hook works hardest here.
  - Name the hook the angle offers (for example, "the surprise that most looks use one or
    two effects"), and leave the wording to him.
- **Paragraphs, 4 to 7 of them, about 300 to 600 words in all.** For each one:
  - its job in the arc (the hook, the stakes, an example, the turn, the payoff)
  - the facts it can use, as short notes rather than sentences, with the doc section
    they came from so he can check them. The docs were largely agent-written too, so
    their sentences mustn't end up pasted into the post. Only a real attributed quote
    (someone's own words, like a developer's) is given verbatim.
  - the link it should carry, ready to paste (see "Links" below)
  - a rough word count
  - one question for him to answer in his own words, which becomes the paragraph
- **Placement:** a link to a doc in paragraph 1 or 2, since many readers never reach the
  bottom; the image right after paragraph 1.
- **The ending:** the topic for one closing question to readers (comments are what
  Substack's feed rewards). Suggest what to ask about, not the question itself.
- **Two Notes,** each 120 to 300 characters, with no URL and no domain name (a link in a
  Note halves its reach). Give the hook for each: one goes out with the restack on
  publish day, one is a teaser the next day that names the post. Pangram scans Notes
  too, so he writes them.
- **The button:** a Substack "Custom" button at the end, linking the single doc or
  `https://csarko.sh/research` when the post covers several. Its short label is his to
  write.

**Links:** every csarko.sh link ends
`?utm_source=substack&utm_medium=email&utm_campaign=<post-slug>`, where `<post-slug>` is
the title lowercased with each run of non-letters turned into one hyphen. The title
isn't written yet at this point, so tag the outline's links with a working slug and retag
them once his title is final. GoatCounter shows these visits under the referrer
`substack`.

**Site rules** to tell him about, from `AGENTS.md`'s Content rules: no em-dashes, no email
address or phone number, no metrics or customer names from his DoorDash work, nothing
about the commercial asset pipeline.

### 5. He writes

He writes the post and the Notes, in the scratchpad folder or pasted into the chat.
Put his text into `post.md` in this exact shape, because the lint and `copy_body.py`
parse it:

```markdown
# <title>
## <subtitle>

<paragraph 1>

![<caption>](<image file>)

<more paragraphs>

[<button text>](<url>)
```

Changing the shape is allowed; changing his words is not. Turn the phrases he marks as
links into Markdown links with the tagged URLs, and add the image line and the button
line. If he didn't mark a link where the outline wanted one, ask which phrase to link
rather than picking one yourself.

### 6. Review

Run the lint in author mode, where the AI-tell lists only warn (they were built for
model text; his own words are his) and the site and link rules still fail:

```bash
.agents/skills/substack-post/scripts/lint_post.py post.md --notes notes.md --slugs <a,b> --author
```

Then read it and give him **a numbered list of findings**, each with its paragraph, the
problem and what kind of fix it needs. Nothing is changed in his text until he says so.

- **Spelling and grammar:** give the exact correction ("teh" → "the").
- **Coherence:** unclear references, a jump the reader can't follow, a paragraph that
  repeats another, a claim that doesn't connect to the one before. **Describe the problem;
  don't write the replacement.**
- **Facts:** anything the docs state differently, or a claim that's in neither the docs
  nor his angle. Quote the doc.
- **Site rules:** every lint error (dashes, contact details, links, tracking tags, a URL in
  a Note). An AI-tell warning on his own writing is information for him, not a required
  change.

Before calling something an error, check it against `voice.md`. His habits are not
mistakes: "But" and "So" opening sentences without a comma, fragments as follow-ups,
the colon reveal.

#### Engagement check

End the review with this scorecard, one row per practice, each marked pass or miss with
a note on any miss. The numbers come from the 94,391-post scrape and Substack's own
guidance cited in the spec. The lint checks what it can; the rest is read by eye. A miss
he keeps on purpose stays a miss on the card, marked as his call.

| Practice | Why | Checked by |
|---|---|---|
| Title 9 to 17 words | 13 to 17 word titles averaged 26.8 reactions, 1 to 5 words 21.1 | lint |
| Title first-person or number-led | about 30% and 47% more reactions | lint |
| No question mark in the title | question titles did slightly worse | lint |
| Subtitle 6 to 10 words, saying something new | it's the email's preview line; 6 to 10 words did best | lint (length, overlap with the title), review (is it new) |
| The first two sentences hook | the preview and the opening decide whether a reader stays | review |
| A doc link in paragraph 1 or 2 | many readers never reach the bottom | lint |
| One real image, after paragraph 1 | 22.9 reactions with a cover against 12.7 without; it's the social preview | lint (present), review (placement, caption) |
| Body 300 to 600 words | short posts win on reactions per word | lint |
| Plain prose: no headers, at most two bold phrases | reads on a phone | lint |
| One closing question, one a reader can answer | comments are what the feed rewards | lint (present), review (answerable, not rhetorical) |
| One button at the end | one call to action | lint |
| Every csarko.sh link tagged | GoatCounter can only count what's tagged | lint |
| Two Notes, 120 to 300 characters, no URL or domain | a link in a Note halves its reach | lint (length, links), review (two, one naming the post) |

Publishing as email and web, restacking and the next day's Note are timing, so they stay
in the handover checklist.

### 7. Humour suggestions

Suggest 2 to 4 places for dry humour, from `voice.md`'s "Tone" and "Emoji" rules. For each:

- **Where:** the paragraph, and the moment in it.
- **What kind:** self-mockery (🤡), an understated win (😎), gentle exasperation at a tool
  or company (🤦‍♂️), or a flat verdict ("That sucked.").
- **Why it fits:** what in that moment sets it up.

Don't write the joke. He writes the line or skips the spot. Keep the profile's limits:
at most two emoji in a post, and tools and companies get understanding, never blame.

Once he's applied what he wants, re-run the lint, then hand over the package.

### 8. Hand over the package

Put everything in a folder in the session's scratchpad directory. **Never commit a
draft:** the repo is public, so a committed draft is published before the post is.
- `post.md` and `notes.md`, his words
- **The image,** prepared from his file:
  - Copy it in first. macOS screenshot names put a narrow no-break space (U+202F)
    before "AM"/"PM", so an `@`-path he pastes won't match as typed; list the
    folder to find it.
  - Crop off any browser chrome or UI strip. `sips` ignores `--cropOffset` and crops
    from the centre, so crop with Pillow.
  - Resize it to 1456 px wide as a JPEG, quality 85.
  - Look at the result before handing it over.
- **`cover.jpg`, only when the post has no image.** It's the 1456×1048 title card, from
  `.agents/skills/substack-post/scripts/cover.py "<title>" <folder>/cover.jpg`. When
  the post has an image, skip it: the social preview already shows that image with
  the title and subtitle, so a card only repeats them. Look at it before handing it
  over.

**Markdown doesn't paste into Substack:** links come through as literal
`[text](url)`. Put the body on his clipboard as rich text instead:

```bash
.agents/skills/substack-post/scripts/copy_body.py <folder>/post.md
```

That copies the paragraphs between the subtitle and the button, with working links.
It leaves out the title and subtitle, the image and the button, which he adds in
Substack.

Then give him this checklist:
1. New post: type the title and subtitle into their own fields, then paste the body.
2. Upload the image after paragraph 1, with its caption.
3. Add a Custom button at the end, with the button text and URL from `post.md`'s last line.
4. Only if the post has no image: upload `cover.jpg` as the social preview image (post settings).
5. Send a test email and read it on a phone.
6. Run Substack's AI check on the draft.
7. Publish as email and web.
8. Restack it with the first Note.
9. Post the second Note the next day.

### 9. After he publishes

He gives you the post's Substack URL. Then:

1. **Log it.** Append the entry to `docs/substack/posts.json` (keep the list sorted by
   date) and commit it, as with any other change:

   ```json
   {"date": "YYYY-MM-DD", "url": "<substack url>", "title": "<title>", "slugs": ["<slug>", "..."]}
   ```

2. **Add it to the voice profile.** The published post is a real sample of his writing.
   Offer to add a short excerpt to `voice.md`'s Examples, copied exactly, and propose any
   new habit it shows, one at a time. Write only what he accepts.
