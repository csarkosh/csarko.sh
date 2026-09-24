---
description: A Claude draft written to its author's voice profile scored 100% AI on Substack's Pangram check. Why, and the workflow that replaced it.
published: 2026-09-24
---
# Why a voice profile didn't get Claude past Substack's AI check

**Question:** can a model write a newsletter post that reads as its author's own work, if it
is grounded in the author's research, steered by the author's opinions, and written against
a voice profile built from the author's own writing? The test case: short Substack posts
that summarise the research on this site and send readers back to it.

**Short answer:** no, not against Substack's detector. The first post, drafted by Claude
from two research docs and three bullets of the author's opinions, passed every check built
for it (a lint for AI vocabulary and phrasing, the voice profile, the author's own edits)
and then scored **AI 100%, Human 0%** on Pangram, the classifier Substack runs on every
post. That result is what Pangram's own technical report predicts. It is a learned
classifier trained on AI rewrites of human documents, and on its authors' tests it
catches humanizer rewrites 97.67% of the time and style imitation almost as reliably. A
voice profile changes the surface of the text; the model's word-by-word choices underneath
stay the same. The workflow now inverts: the model outlines, the author writes every
sentence, and the model only reviews.

## 1. The setup

csarko.log is the Substack newsletter for this site. The plan was to turn one to four
published research docs into a 300 to 600 word, plain-language post that links back to
them, as a way to bring readers here. A Claude Code skill in this repository was built to
do it, with four parts:

- **The author's angle.** Before drafting, the author gives about five bullets: why these
  docs, what he thinks, one concrete moment. The skill is barred from adding any claim,
  opinion or anecdote that isn't in the docs or the angle.
- **A voice profile.** A private file built from three Medium posts he wrote in 2019 and
  2020 [1], about 26,000 words of his own messages to Claude Code (automated runs
  filtered out), and an eight-question interview. It records his habits: short sentences,
  colons for the reveal ("got my first grade: F"), dry humour aimed at himself, no hype
  words, emoji only at a punchline, and a closing line that ends on the result rather than
  a moral.
- **A lint.** A script that fails on the catalogued tells of AI writing, drawn from
  Wikipedia's "Signs of AI writing" [2] and the `vale-ai-tells` style package [3]:
  words like "delve", "pivotal" and "showcase", "not just X, but Y" constructions, "serves
  as" in place of "is", staged openers and summarising closers.
- **Substack's engagement findings.** A scrape of 94,391 posts [4] sets the
  targets the lint warns on: titles of 9 to 17 words (13 to 17 word titles averaged 26.8
  reactions against 21.1 for 1 to 5 words), subtitles of 6 to 10 words, no question mark
  in the title, and an image (posts without a cover averaged 12.7 reactions, with one
  22.9). Notes carry no links, since a link in a Note costs it reach [5].

## 2. What the research said before the first draft

Substack began scanning posts with Pangram on July 22, 2026. Any reader can score a post,
reply or Note, and writers can test drafts, switch scanning off per post, or add a "How I
make this" statement [6]. The launch drew complaints from writers worried about
false accusations [7].

The ways people try to make model output read as human, strongest evidence first:

1. **The human writes; the model edits.** One widely shared rule: "You may not use a single
   word an LLM suggests to you", because "readers can detect LLM words in the parts per
   trillion" [8].
2. **A voice profile with samples of the author.** Epoch AI gave models five samples of a
   real author's writing and asked for new text in that voice. Pangram missed 10.10% of
   those passages, GPTZero 10.77% and Originality.ai 17.85%, against under 1% for plainly
   prompted text [9].
3. **A humanizer pass,** such as the `blader/humanizer` agent skill (about 52,000 GitHub
   stars), which rewrites a draft to remove 25 catalogued patterns [10].
4. **Banned-word lists,** the weakest: the vocabulary drifts with each model generation
   [2].

The skill took a middle path: the author supplies the substance, the model writes the
prose in his voice. Option 1 had the best evidence; this was a bet that grounding and a
voice profile would close most of the gap.

## 3. The experiment

The first post covered two docs, [Stylized shader looks](/research/stylized-shader-looks)
and [Atmosphere and dread](/research/atmosphere-and-dread-shaders). The angle: he is
building a horror game and won't play a game with bad graphics; the research took him from
no understanding to a working one; the surprise was how little a signature look needs,
since most games commit to one or two effects.

The draft came out at about 300 words and passed the lint with no errors and no warnings.
The author then edited it by hand in three places:

- He rewrote the title ("What makes a game look good, and what it means for my horror
  game").
- He cut a closing joke about his own game as "kind of forced".
- He swapped the closing question for one about horror.

Substack's check on the draft:

> Fully AI-assisted text. AI 100%, AI-assisted 0%, Human 0%.

The author's own verdict on the joke he cut is worth keeping: he found the model's humour
forced before any detector said anything.

## 4. Why Pangram caught it

### What Pangram is

Pangram is not a list of tells. It is a neural classifier on top of an open-weight
language model, with heads that label every token as human, AI-assisted or AI-generated;
its report describes no hand-crafted linguistic features [11]. Its training data is
built to defeat exactly the idea behind a voice profile:

- **Synthetic mirrors.** For each human document, a model is asked for its topic and then
  told "Write an article about X". The pair teaches the classifier "How was this text
  written?" rather than "What is this text about?" [11]. The original version of
  the method added hard negative mining: scanning tens of millions of human documents for
  the ones the classifier got wrong, and training on mirrors of those [12].
- **AI-assisted examples** come from human documents that a model has then edited
  [11].

Its reported robustness, on its authors' own tests [11]:

- **Commercial humanizers:** labelled AI 97.67% of the time, and AI or Mixed 98.83%.
- **The `blader/humanizer` skill,** applied by GPT-5.5, Opus 4.8 and Sonnet 4.6: 44
  misses in 10,223 documents, a 0.430% false negative rate.
- **Epoch's style-imitation set:** 2.86% missed across its plain and style-imitating AI
  passages combined, with no human passage flagged. Epoch had measured 10.10% on style
  imitation alone for the Pangram version it tested [9].
- **False positives:** 0.0041%, about 1 in 24,000 human documents. An independent
  evaluation also found Pangram's false positives "essentially 0" across most thresholds
  [13].

Labels are assigned clause by clause. A document reads as Human when at least 90% of it is
human, as AI when at least 80% is AI (AI-assisted clauses count at half weight), and as
Mixed otherwise [11].

### What the draft gave away

Pangram doesn't say which signals it learned, so this part is a reading of the draft
against the author's real writing, not a description of the model.

- **Predictable wording.** Every sentence took the likely next word. "The answer was a lot
  smaller than I expected." The author's 2019 post has small oddities a model doesn't
  produce: "redirected-to HTTPS… so I got a 15/100", "Easy-enough." [1].
- **Even rhythm.** Every paragraph had the same shape: a setup, two or three supporting
  sentences, a payoff. The profile asked for short sentences, and the draft delivered them
  uniformly. Human writing is uneven: a long sentence, a three-word one, a tangent.
- **Textbook moves.** Three escalating fragments for effect ("Return of the Obra Dinn goes
  even further. Two colors and a pattern of dots. That's the whole look."), a glossing
  parenthesis ("(a small program that decides the color of each pixel)"), a quote with
  "as Thomas Grip put it", a closing question. Each is a move the model has seen work many
  times, and a classifier trained on its output has seen it many times too.
- **No slack.** Every sentence advanced the argument. Nothing repeated, nothing wandered.
  The author's own writing has slack: one paragraph of his 2019 post turns on "However,
  it tends to be technical in nature." and the next on "However, this was my project."
  [1]. A model would have varied the second.
- **Rules applied as rules.** The profile's habits ("Problem was:", the colon reveal)
  appeared exactly where the instructions put them. A person uses a habit when it occurs
  to them; a model following a profile uses it on schedule, which is itself a pattern.

## 5. What the lint could and couldn't see

The lint did its job: no AI vocabulary, no "not just X, but Y", no summarising closer, no
em-dashes. It checks words and sentence shapes. Pangram judges the distribution the words
came from, which no word list reaches. Worse, every rule added to a style guide or a lint
gives the model one more thing to do consistently, and consistency is part of what a
classifier learns.

## 6. The workflow now

The skill no longer writes the post. It follows the one approach with consistent evidence
behind it [8]:

1. **The skill outlines.** It gives the story arc and, for each paragraph, its job, the
   facts and links from the docs, and a question for the author to answer. No finished
   sentences.
2. **The author writes** every sentence, in his own words.
3. **The skill reviews** only grammar, spelling and coherence, plus the facts against the
   docs and the site rules, and points out each issue rather than rewriting the sentence.
4. **The skill suggests places for humour** that fit the voice profile, and the kind of
   joke that would work there. The author writes the line, or skips it.

Pangram's clause-level labels are why the review stays light. A corrected typo leaves a
clause his; a clause the model rewrote becomes AI-assisted, and enough of those move a
post from Human to Mixed [11].

## 7. Limits

- **One post, one detector.** The result is a single data point against Pangram 4, which
  itself changes with each release.
- **Section 4's second half is interpretation.** Pangram's learned signals aren't
  published, so the reading of the draft is informed guesswork, checked only against the
  author's own writing.
- **This doc was drafted by Claude Code** from the working session and checked against the
  sources below. It is research for this site, not a Substack post, which is the kind of
  writing the new workflow keeps human.

## Sources

1. C. Sarkosh, "My experience getting an A+ from Mozilla’s Observatory tool on AWS," Medium, Sep. 15, 2019. Accessed: Sep. 24, 2026. [Online]. Available: https://medium.com/@csarkosh/my-experience-getting-an-a-from-mozillas-observatory-tool-on-aws-f0abf12811a1
2. Wikipedia contributors, "Wikipedia:Signs of AI writing," Wikipedia. Accessed: Sep. 24, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
3. tbhb, "vale-ai-tells," GitHub repository. Accessed: Sep. 24, 2026. [Online]. Available: https://github.com/tbhb/vale-ai-tells
4. S. Günel and Orel, "How to Grow on Substack: 7 Data-Backed Tips From 94,000 Posts," Write Build Scale, Jun. 3, 2026. Accessed: Sep. 24, 2026. [Online]. Available: https://writebuildscale.substack.com/p/i-analyzed-94391-substack-posts-heres
5. Orel, "How To Make URLs in Your Notes Convert Readers into Subscribers," The Writing Edge, Aug. 1, 2026. Accessed: Sep. 24, 2026. [Online]. Available: https://thewritingedge.substack.com/p/how-to-make-urls-in-your-notes-convert
6. Substack Team, "How writers are reacting to Substack’s AI transparency tools," On Substack, Jul. 24, 2026. Accessed: Sep. 24, 2026. [Online]. Available: https://on.substack.com/p/how-writers-are-reacting-to-substacks
7. J. C. Ofonagoro, "Substack AI Detector Sparks Writer Backlash," eWeek, Jul. 31, 2026. Accessed: Sep. 24, 2026. [Online]. Available: https://www.eweek.com/news/substack-ai-detector-writer-backlash/
8. "How To Write With An LLM," A Final Ward (sockpuppet.org), Sep. 17, 2026. Accessed: Sep. 24, 2026. [Online]. Available: https://sockpuppet.org/blog/2026/09/17/how-to-write-with-an-llm/
9. J. Lee, "AI detectors rarely flag human writing, but sometimes miss AI text imitating real authors," Epoch AI, Jul. 15, 2026. Accessed: Sep. 24, 2026. [Online]. Available: https://epoch.ai/data-insights/ai-detectors-false-negatives
10. blader, "humanizer," GitHub repository, v3.0.0. Accessed: Sep. 24, 2026. [Online]. Available: https://github.com/blader/humanizer
11. B. Glickenhaus et al., "Pangram 4 Technical Report," arXiv:2607.27183, Jul. 2026. Accessed: Sep. 24, 2026. [Online]. Available: https://arxiv.org/abs/2607.27183
12. B. Emi and M. Spero, "Technical Report on the Pangram AI-Generated Text Classifier," arXiv:2402.14873, Feb. 2024. Accessed: Sep. 24, 2026. [Online]. Available: https://arxiv.org/abs/2402.14873
13. M. Robinson, "Do AI Detectors Work Well Enough to Trust?," Chicago Booth Review, Dec. 2, 2025. Accessed: Sep. 24, 2026. [Online]. Available: https://www.chicagobooth.edu/review/do-ai-detectors-work-well-enough-trust
