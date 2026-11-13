# Doc reading time and the path to the product: research report

Date: 2026-11-13. Status: research for a redesign of the doc pages. Nothing here is built yet.

**Goals.** (1) Raise the time readers who came to understand the research spend on a doc.
(2) Send more of them on to the game, app or film the doc belongs to.

**Baseline (last four weeks, bots removed).** 184 visits. Median engaged time on a doc 21.5 s.
A third reach the end marker, mostly by a fast scroll. 10 to 14% show real reading through the
body. 91% never open a second page. "Keep reading" got 1 click and "Read next" 0 in 172 page
loads. The Play button near the end was clicked by 4 of 29 people who finished a doc that
carries it. The docs that hold readers best answer one concrete engineering question (median
84 s on a 2,500 word doc). Doc length does not correlate with time spent.

**How this was made.** Eight research passes swept the web on different angles and every
finding was checked against its source. Only findings marked supported or partly supported are
used, and partly supported ones are stated in their corrected form. Several checker notes had
been pasted from a neighbouring finding; for those I confirmed the quote in the fetched copy of
the source myself (Conlen 2019 on preview scrolling, central widgets and phone medians; Mayer
2023 on coherence, segmenting and signaling; Loewenstein 1994 p. 91; Patel on colours; Alexander
on humour; Pew 2016 on one article a month; the HubSpot relevancy line). Claims that existed
only in a researcher's "applies" note and were never checked are left out. A final review then
re-opened more than 50 of the cited pages, matched the quoted figures against them, and folded its
corrections in.

**The short version.**

1. The median is decided on the first two screens. On a phone those screens hold the title, the
   description, the Question and the Short answer: the same answer stated three ways, with no
   reason to keep going and no link to the product.
2. The body starts too late. Measured on a 390 px wide screen, section 1 of the most visited doc
   begins about 3,230 px down, after four and a half screens of summary.
3. The pages answer first, which the evidence supports, and then stop. They never open a second
   question for the reader who now has the answer.
4. 23 of the 49 docs get no product link from the template. It links only a game the text
   names, only near the end. No doc gets a link to its app or its film.
5. The end blocks are boxed, sit where few readers arrive, and name an action ("Keep reading")
   instead of a payoff. The Play button itself converts well among those who see it (4 of 29).
6. At about 50 visits a week only a doubling will show in four weeks. Change on principle,
   everywhere at once, and judge on reader rate and product clicks, not on the median.

The changes are ranked by expected effect at the start of section 3 ("The order to build in").
The first three: rewrite each opening so it ends on what the answer leaves open (B1, B2), get
the answer onto the first phone screen (A3, B3), and put one plain product line right after
the Short answer (A1, C1).

---

## 1. What the evidence says, by theme

Evidence types: **data** (large logs), **study** (experiment, eye tracking, meta-analysis),
**test** (one site's A/B test or case), **guide** (expert guidance without figures),
**practice** (a practitioner's own account or a page I can observe), **vendor** (a company's own
marketing data).

### 1.1 Reading behaviour on the web

Measured:

- Leaving is front-loaded. On 98.5% of 205,873 pages the chance of leaving falls the longer a
  visitor has stayed: people screen first, then read.
  [Liu, White, Dumais, SIGIR 2010](https://www.microsoft.com/en-us/research/wp-content/uploads/2010/10/dwelltime.pdf)
  (data; desktop, 2010). Nielsen's reading of the same data: the first 10 seconds are critical
  and the curve flattens after about 30.
  [NN/g 2011](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/) (guide on data).
- Short visits are ordinary. 55% of all page visits and one in three article visits were under
  15 s. [Haile, Time, 2014](https://time.com/12933/what-you-think-you-know-about-the-web-is-wrong/)
  (vendor data, 2 billion visits, news sites). Wikipedia's median is 25 s and its 75th percentile
  75.1 s (tab-visible time, which runs longer than engaged time).
  [Wikimedia readability report](https://www.mediawiki.org/wiki/Reading/Web/Accessibility_for_reading/Repository/Readability_research_report)
  (data). Against Chartbeat's article figure, a 21.5 s median is ordinary to slightly low, not
  proof the pages are healthy.
- Attention falls with depth. 57% of viewing time is above the fold, 74% in the first two
  screenfuls. [NN/g 2018](https://www.nngroup.com/articles/scrolling-and-attention/) (study, 120
  people, desktop, mixed page types). The first four paragraphs get a look from 81%, 71%, 63%
  and 32% of users ([NN/g 2013](https://www.nngroup.com/articles/website-reading/); a look is one
  fixation, not reading; no sample size given).
- The fold is real. The 100 px just above it were viewed 102% more than the 100 px just below.
  [NN/g 2015](https://www.nngroup.com/articles/page-fold-manifesto/) (study, 57,453 fixations,
  desktop). That what shows above the fold "encourages us to scroll" is the author's reading.
- Most readers get about halfway. "Most readers scroll to about the 50 percent mark" on Slate,
  about 60% on other Chartbeat sites.
  [Manjoo, Slate, 2013](https://slate.com/technology/2013/06/how-people-read-online-why-you-wont-finish-this-article.html)
  (vendor data, news, articles about 2,000 px long).
- Readers who do scroll dwell lower down. Time in view peaks about 1,200 px down, nearly three
  times the top. [Chartbeat 2013](https://chartbeat.com/resources/research/scroll-behavior-across-the-web/)
  (vendor data, 25 million sessions).
- Readers preview with a fast scroll. "We saw many readers quickly scroll through article content
  before leaving the page or engaging in depth."
  [Conlen, Kale, Heer, EuroVis 2019](https://idl.cs.washington.edu/files/2019-IdyllAnalytics-EuroVis.pdf)
  (study, three articles, 50,000+ sessions).
- Length buys little. On pages of 30 to 1,250 words each extra 100 words added 4.4 s, so about
  18% of added text is read. [NN/g 2008](https://www.nngroup.com/articles/how-little-do-users-read/)
  (study, 25 users, 2005; does not cover pages as long as these). Time rises with length to a
  peak and then flattens. [Digiday on Chartbeat, 2014](https://digiday.com/publishers/long-form-winning-strategy/)
  (vendor data, news).
- No single dwell time means "satisfied": the time needed depends on topic, length and
  readability. [Kim et al., WSDM 2014](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/KimWSDM2014.pdf)
  (study, search logs). A short visit can be a success.
  [Li, Huffman, Tokuda, SIGIR 2009](https://research.google/pubs/good-abandonment-in-mobile-and-pc-internet-search/)
  (study, search pages; applying it to a doc is an analogy).
- The "8 second attention span" has no research behind it.
  [BBC More or Less, 2017](https://www.bbc.com/news/health-38896790) (journalism).

Strength: strong and consistent on the shape (screen first, top-heavy attention, most visits
short). Weak on transfer: the data is news sites, Wikipedia and desktop logs from 2008 to 2019,
not long technical write-ups.

### 1.2 Openings

Measured or theory with experiments behind it:

- Curiosity is attention on a gap in one's own knowledge, and it declines once a person is
  confident they know the answer. The most direct inducer is a posed question or puzzle; guessing
  with feedback raises it.
  [Loewenstein, Psychological Bulletin, 1994](https://www.cmu.edu/dietrich/sds/docs/loewenstein/PsychofCuriosity.pdf)
  (review and theory, pp. 87 to 91). That an answer-first opening closes the reader's only gap is
  an inference from this, not a tested result.
- People read every word when they believe they are in the best place for the information, for
  example because the title matches their exact need.
  [NN/g 2019](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/) (study,
  qualitative eye tracking).
- Jargon lowers interest and perceived understanding even with a definition one hover away.
  [Shulman et al. 2020, via Ohio State](https://www.sciencedaily.com/releases/2020/02/200212084357.htm)
  (study, N = 650, general public; the authors say jargon is fine for specialists).
- Clickbait styles did not beat plain headlines on curiosity or clicks.
  [Molina et al., CHI 2021](https://pike.psu.edu/publications/chi21.pdf) (study).
- People who open a top summary read longer (49 s against 25 s), but they chose to open it.
  [Reuters Institute on NRK, 2024](https://reutersinstitute.politics.ox.ac.uk/news/how-norways-public-broadcaster-uses-ai-generated-summaries-reach-younger-audiences)
  (data, self-selected). No experiment was found on whether an answer-first opening costs or
  gains reading time.

Practice and guidance:

- Lead with the conclusion; it "can encourage scrolling".
  [NN/g, Inverted Pyramid, 2018](https://www.nngroup.com/articles/inverted-pyramid/) (guide, no data).
- A nut graf in paragraphs two to five tells the impatient reader where the piece is going. It
  need not give away the end, except that a study's finding must be stated by then.
  [NPR Training, 2021](https://www.npr.org/sections/npr-training/2025/05/29/g-s1-64764/nut-graf-and-lead-duos-that-point-readers-in-the-right-direction)
  (guide; the page is dated June 3, 2021, and 2025 appears only in its address).
- Context, content, conclusion at every scale; content-first serves the impatient reader, and the
  title and abstract already do that job.
  [Mensh and Kording, 2017](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1005619) (guide).
  Nature's summary paragraph adds a step these docs lack: what the result shows compared with
  what was thought before.
  [Nature guide](https://www.nature.com/documents/nature-summary-paragraph.pdf) (guide).
- Four well-known explainers put the finished result or demo in the first screen, and two of them
  promise to explain it. [Ciechanowski, Mechanical Watch](https://ciechanow.ski/mechanical-watch/)
  (practice, observed; also Patel, Comeau, Luu).
- Start concrete, with something the reader has seen or done.
  [Evans, 2021](https://jvns.ca/blog/confusing-explanations/);
  [Case, 2017](https://blog.ncase.me/how-i-make-an-explorable-explanation/) (practice).
- Open with a simplified version of the problem so a reader with a problem can tell at once the
  page is for them; "web users, might hit back button at any point".
  [Patel, lecture notes, 2023](https://www.redblobgames.com/x/2306-educ432/) (practice).

Strength: moderate. The answer-first top is supported by guidance and nothing contradicts it.
The second half (open a new gap after the answer) rests on curiosity theory and newsroom habit,
not on a test of article pages.

### 1.3 Structure and pacing

Measured:

- Headings that state the point produce "layer-cake" scanning, the most effective scan, and help
  even committed readers. [NN/g 2019](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/)
  (study, qualitative). Headings improve processing of topic sentences and recall of topics.
  [Hyönä and Lorch, 2004](https://scholars.uky.edu/en/publications/effects-of-topic-headings-on-text-processing-evidence-from-adult-/) (study, abstract).
- Learner-paced segments beat a continuous unit (7 of 7 tests, median effect 0.67).
  [Mayer 2023](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-research-based-principles-for-designing-multimedia-instruction-mayer.pdf)
  (study summary; short lab lessons, students).
- Questions the reader must answer between segments cut mind wandering from 41% to 19% of probes.
  Showing the same questions with their answers did nothing.
  [Szpunar et al., PNAS 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3631699) (study; students,
  video lecture, a test they knew was coming).
- Predict-then-reveal raised liking (d = 0.55) and surprise but not memory in a web experiment.
  [Case, N = 1,620](https://ncase.me/experiment-stats/results/) (test, self-published).
- Interesting but irrelevant additions lower learning (58 studies, 7,500+ students), worse when
  they sit beside a relevant diagram.
  [Sundararajan and Adesope 2020, via WSU](https://www.sciencedaily.com/releases/2020/03/200319103223.htm) (study, release only).
- Narrative text was read about twice as fast and recalled about twice as well.
  [Dahlstrom, PNAS 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4183170/) (review; the figure
  is second-hand and old). A better doc may be read faster, so seconds can fall while reading
  improves.
- Concise, scannable, non-promotional rewriting raised measured usability 124%.
  [NN/g 1997](https://www.nngroup.com/articles/how-users-read-on-the-web/) (study; one small site,
  direction only).

Practice and guidance:

- Make a long piece feel like a series of small ones, each section closing on an insight.
  [Alexander, 2016](https://slatestarcodex.com/2016/02/20/writing-advice/) (opinion).
- Join steps with "but" and "therefore", never "and then".
  [Case, 2017](https://blog.ncase.me/how-i-make-an-explorable-explanation/) (practice, relaying two TV writers).
- Tell it as the problem, the sticking point, what people tried, and what let someone see it. Do
  not give every idea equal weight. [Lin, Quanta, 2026](https://www.insidehighered.com/node/218366) (practice).
- "Discovery fiction": a plausible path to the result with naive ideas, obvious problems and
  simple fixes. It runs longer. [Nielsen, 2023](https://michaelnotebook.com/df/index.html) (practice).
- Old information at the start of a unit, the new and important thing at the end.
  [Gopen and Swan, 1990](https://cseweb.ucsd.edu/~swanson/papers/science-of-writing.pdf) (guide).
- Busy readers read opening sentences and skip the rest.
  [Google Technical Writing One](https://developers.google.com/tech-writing/one/paragraphs) (guide).
- More examples than feels natural reduce misreading.
  [Luu](https://danluu.com/writing-non-advice/) (practice, self-observation).
- Reward the reader with high points, especially in the middle.
  [Clark, Poynter, 2006](https://poynter.org/?p=76067) (maxim).
- Question headings where you know the reader's question, statement headings next, topic headings
  last. [Digital.gov](https://digital.gov/guides/plain-language/design/headings) (guide).
- Short, narrow articles are welcome; rambling "is an easy failure mode".
  [Distill](https://distill.pub/journal/) (editorial policy).
- When a piece needs too much set-up, write precursor posts as a staircase.
  [Comeau, 2021](https://www.joshwcomeau.com/email/authoring-process/) (practice). The evidence
  that a series holds readers is thin and mixed: one small positive
  ([Velocity, 2012](https://velocitypartners.com/blog/diary-of-a-content-pimp-5-content-analytics-and-the-power-of-the-series/))
  and one confounded negative
  ([Fishkin, 2020](https://sparktoro.com/blog/i-blogged-every-night-for-a-week-it-went-terribly/):
  five posts written on five nights, which he blames on titles and topics, not on the format).
- Show a draft to someone like the intended reader and find out whether they can follow it.
  [Pinker, 2014](https://stevenpinker.com/files/pinker/files/the_source_of_bad_writing_-_wsj_0.pdf) (opinion).

Strength: headings and segmenting are measured, on comprehension and not on time. The narrative
shape (but, therefore, the failed attempt) is practitioner agreement with no reading-time data.

### 1.4 Figures and interactives

Measured:

- Three well-made interactive articles had desktop medians of 78 to 116 s and phone medians of 20
  to 41 s. Readers used a widget when it was central to the story (85% in one article). The median
  number of uses of an optional details button was zero, and about 40 to 60% of readers who
  finished never opened click-to-reveal content.
  [Conlen, Kale, Heer 2019](https://idl.cs.washington.edu/files/2019-IdyllAnalytics-EuroVis.pdf) (study).
- Words placed on the figure beside the part they describe beat a caption below (9 of 9 tests,
  median effect 0.82). Removing extraneous material helps (18 of 19, 0.86). Visual signals such as
  arrows help when sparing (11 of 12, 0.71).
  [Mayer 2023](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-research-based-principles-for-designing-multimedia-instruction-mayer.pdf)
  (study summary; lab lessons, students).
- Users study images that carry information and ignore decorative ones.
  [NN/g 2010](https://www.nngroup.com/articles/photos-as-web-content/) (study, qualitative).
- 91% of readers fixated the image caption in one short-article test.
  [Speero, 2018](https://speero.com/post/how-people-read-short-articles-original-research)
  (test; 95 people, one 300 word article, 30 s cap).
- Animation beats stills by d = 0.37 overall, more for realistic video (0.76) and for
  procedural-motor knowledge (1.06). Animation that depicts the content does barely better than
  the average (0.40), so the abstract does not show that the gain is confined to cases where
  motion is the subject.
  [Höffler and Leutner, 2007](https://www.leibniz-ipn.de/en/research/publications/instructional-animation-versus-static-pictures-a-meta-analysis) (study, abstract).
- One Wikipedia pageview in 29 includes a click on an image, ten times any other in-article
  interaction. [Rama et al., 2021](https://arxiv.org/abs/2112.01868) (data, abstract). That click
  opens the picture larger: it measures wanting a closer look, not wanting to leave the page.
- Developers reading documentation start from the code examples, and an example with
  placeholders that point at another block cannot be copied and used as it stands.
  [Meng et al., 2019](https://sigdoc.acm.org/cdq/how-developers-use-api-documentation-an-observation-study/)
  (study; 11 developers, qualitative, an API task, not an explainer).
- A diagram helps when it is built to put the things used together in one place; an arbitrary
  diagram is not assured any advantage over text.
  [Larkin and Simon, 1987](https://mechanism.ucsd.edu/bill/teaching/F12/cs200/Readings/larkin.whyadiagramissometimesworth.1987.pdf)
  (theory and computational models, not a reader experiment).
- Scrolljacking harmed control and task success in usability tests.
  [NN/g 2023](https://www.nngroup.com/articles/scrolljacking-101/) (study, qualitative).
- Video viewers stay 1.5 to 2 times longer, but they chose to press play, and "volume alone ...
  does not increase engaged time". [Chartbeat, 2021](https://blog.chartbeat.com/?p=6408) (vendor, correlational).
- "There is limited empirical evaluation of the effectiveness of interactive articles."
  [Hohman et al., Distill, 2020](https://distill.pub/2020/communicating-with-interactive-articles/) (review).

Practice and guidance:

- "If you make a tooltip or rollover, assume no one will ever see it." Anything other than a
  scroll must make something spectacular happen.
  [Tse, NYT, 2016](https://github.com/archietse/malofiej-2016/blob/master/tse-malofiej-2016-slides.pdf)
  (practice, no numbers; Distill calls it an anecdote that hardened into a rule).
- Pages mostly static, interaction as separate islands, and "often better to show all the variants
  than to ask the reader to interact". Text colours matched to diagram colours.
  [Patel, Little things](https://www.redblobgames.com/making-of/little-things/) (practice).
- "The reader is not forced to interact in order to learn."
  [Victor, 2011](https://worrydream.com/ExplorableExplanations/) (opinion).
- Video makes the emotional connection that makes someone want to understand; text carries the
  detail. [Matuschak and Nielsen, 2019](https://numinous.productions/ttft/) (opinion).
- Native video with a poster and `preload="none"` loads no video data until played; avoid
  autoplay. [web.dev](https://web.dev/articles/lazy-loading-video) (guide).
- Load a costly component only on interaction.
  [patterns.dev](https://www.patterns.dev/vanilla/import-on-interaction/) (guide).
- Ciechanowski's GPS essay ships 43 KB of compressed first-party script, over four times this
  site's budget. [Observed](https://ciechanow.ski/gps/) (practice).

Strength: strong that hidden content goes unseen and that decoration does not help. Placement of
labels and signals is well measured for learning, never for time on page. Interactives set a
modest ceiling: they do not turn a 21 s median into minutes.

### 1.5 Navigation and next steps

Measured:

- 89% of readers leave after one article; new visitors continue 9.1% of the time, phones 9%,
  desktop 19%. [Chartbeat, 2022](https://chartbeat.com/resources/research/recirculation-by-category-device-loyalty/)
  (vendor data, news). Against the desktop figure the site's 9% is low; against new visitors and
  phones it is the norm. 68 to 78% of Wikipedia sessions are one pageload.
  [Piccardi et al., 2023](https://arxiv.org/abs/2112.11848) (data). On phones, 72% of long-form
  readers see one article on a site in a month.
  [Pew 2016](https://www.pewresearch.org/journalism/2016/05/05/long-form-reading-shows-signs-of-life-in-our-mobile-news-world/) (data).
- 1.42% of first-time visitors clicked any link module. End-of-article placement beat mid-article
  by 55% (61% on phones). Related links beat popular ones by 14% (39% for arrivals from Google).
  Links with an image got 63% more clicks than text-only links.
  [Collier and Stroud, 2018](https://mediaengagement.org/research/links/)
  (study, randomized, 1.8 million first visits, seven news sites, one week; relative lifts on a
  very low base).
- A bottom module on mobile Wikipedia got 1.91% overall and 6.0% when scrolled into view, and did
  not raise total pageviews (ratio 1.003).
  [Wikimedia Read more, 2017](https://www.mediawiki.org/wiki/Reading/Web/Projects/Read_more) (test).
  On desktop Wikipedia the same kind of module at the bottom of the article gets about 0.4%.
  [Wikimedia, 2024](https://www.mediawiki.org/wiki/Reading/Web/Content_Discovery_Experiments) (data).
- The lead and infobox hold 17% and 4% of a Wikipedia article's links and get 32% and 18% of
  clicks. [Wikimedia research summary](https://meta.wikimedia.org/wiki/Research:Which_parts_of_an_article_do_readers_read) (data).
- Readers prefer links at the top and left and links to closely related articles.
  [Dimitrov et al., 2017](https://arxiv.org/abs/1611.02508) (data, abstract).
- One reference click per 300 page views (0.13% on phones).
  [Piccardi et al., 2020](https://arxiv.org/abs/2001.08614) (data).
- Among people who already used it, an always-visible contents list got about 50% more clicks.
  Whether more people used it or read longer is unknown.
  [Wikimedia, 2022](https://docs.google.com/presentation/d/10r-kp0C0vKWmDZ0oLAt2ju_B-3DnfGIWdfPfB8j179U/htmlpresent) (test, flawed).
- Choice overload has a mean effect of about zero across 50 experiments.
  [Scheibehenne et al., 2010](https://econpapers.repec.org/RePEc:oup:jconrs:v:37:y:2010:i:3:p:409-425) (study).
- Slow-looking progress feedback raised abandonment in surveys.
  [Conrad et al., 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC2910434/) (study; surveys, not
  reading). No traceable evidence that a reading-time label helps; the "40%" claim has no source.

Practice and guidance:

- Nothing should sit between the last paragraph and the next links; gaps and rules read as the end
  of the page. [NN/g 2014](https://www.nngroup.com/articles/related-content-pageviews/);
  [NN/g 2016](https://www.nngroup.com/articles/illusion-of-completeness/) (guides).
- A rail contents list should be sticky with the current section marked; a collapsed sticky bar
  on phones is often missed. [NN/g 2023](https://www.nngroup.com/articles/table-of-contents/) (guide).
- Link text should say what the reader gets; avoid "Read more".
  [NN/g 2014](https://www.nngroup.com/articles/writing-links/) (guide).
- New tabs annoy phone users, who lose the Back button.
  [NN/g 2020](https://www.nngroup.com/articles/new-browser-windows-and-tabs/) (guide).
- Patel ends on a "More" section of the reader's next questions and has no read-next block.
  [A* page](https://www.redblobgames.com/pathfinding/a-star/introduction.html) (practice, no click data).

Strength: strong that second pages are rare everywhere and that position matters more than the
module. The site's 1 click in 172 is low but not distinguishable from the 1.42% norm. Expect a
few points, not a reversal, and more room on desktop (norm 19%) than on phones (norm 9%).

### 1.6 Sending readers to the product

Measured, all single cases:

- On Wikipedia the "official site" link in the top fact box is clicked at 2.47%, against 0.9% for
  infobox links overall, 0.14% for body links and 0.03% for references. It is the link's meaning
  (the subject's own site) more than its position.
  [Piccardi et al., 2021](https://arxiv.org/abs/2102.07385) (data).
- A linked line of text between a post's first paragraphs produced 47 to 93% of that post's
  leads; the end banner 6%. The line stood alone and was styled as a small heading, so it was not
  an in-sentence link, and a lead was a form filled in for a gated download. The author adds that
  relevance of the link to the post is the critical factor.
  [HubSpot, 2016](https://web.archive.org/web/20160602141151/http://blog.hubspot.com:80/marketing/blog-anchor-text-call-to-action-study)
  (test; 11 posts chosen for their high lead counts, four weeks, marketers, link attribution and
  not an A/B test).
- An offer at the end of an article got twice the clicks of the same offer in the middle (4.4%
  against 2.2%), with no change in completed conversions.
  [NextAfter, 2017](https://www.nextafter.com/?p=14391) (test, 366,818 visits, one non-profit).
- Content that looks like a promotion, or sits where promotions sit, tends to be ignored.
  [NN/g 2018](https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/) (study,
  qualitative, replicated since 1997).
- Play rate drops sharply when a video's play button is below the first screen.
  [Wistia, 2015](https://wistia.com/blog/video-position-and-size) (vendor data, 95,000 pages).
- A free web version sold 2,500 to 3,000 copies a month from 100,000 to 200,000 players, roughly
  1 to 3% by my arithmetic. Bought traffic from unrelated games: 8,000 clicks, 4 sales.
  [GameDiscoverCo on shapez.io, 2021](https://newsletter.gamediscover.co/p/deep-dive-how-shapezio-went-from)
  (case, the developer's own figures).
- One developer reported about ten times the plays on a browser game as on a similar
  download-only one. [itch.io thread, 2024](https://itch.io/t/4101149/understanding-the-difference-between-play-in-browser-and-download)
  (one anecdote, total plays with no page-view counts; the cause is the poster's guess).
- About 90% of visits to a store page from social links arrived logged out and could not wishlist.
  [Zukowski, 2021](https://howtomarketagame.com/2021/04/14/how-to-use-steams-utm-feature-to-track-the-number-of-wishlists-and-sales-your-marketing-is-generating/)
  (case; 9 developers, links from one social network; that phones explain it is the author's guess).
- Videos that only named a game sent few visitors to its page; the days a video carried a direct
  link sent many.
  [Gamblers Table devlog, 2025](https://greenpixels.itch.io/gamblers-table/devlog/945763/wishlists-0-to-10000-in-just-three-weeks-)
  (one team's reading of its own traffic; viewers also found the game by searching its name).
- A click is not use: about a quarter of demo players wishlisted, and that is high.
  [Zukowski, 2026](https://howtomarketagame.com/2026/06/30/nobody-plays-demos-and-that-is-ok/) (case).
- Modals, content that shifts and autoplay are the most disliked formats; related links at the
  side and the end are the least. [NN/g 2017](https://www.nngroup.com/articles/most-hated-advertising-techniques/)
  (study, survey of 452; stated dislike, not clicks).

Practice:

- Game write-ups link the playable thing in the opening paragraph. "If you're reading this but
  haven't played sandspiel, you should probably go try it!"
  [Bittker, 2019](https://maxbittker.com/making-sandspiel) (practice, four pages observed, no data).
- Tool posts give a copyable install command early, where the reader first learns what the tool
  does. [Bun 1.1](https://bun.sh/blog/bun-v1.1) (practice).
- Comeau's pitch is a written section near the end that names the reader's effort and offers more
  of the same, followed by a bonus so the pitch is not the last thing.
  [Flexbox guide](https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/) (practice; his
  belief that it works, no figures).
- Case ends an explorable by handing the reader a place to explore their own questions; Matuschak
  says article sandboxes are toys because they were built for the article.
  [Case, 2017](https://blog.ncase.me/how-i-make-an-explorable-explanation/) (opinion on both sides).
- One honest sentence, once: who made this and what a click gets you.
  [Fly.io](https://fly.io/blog/sqlite-internals-btree/) (practice, two pages).
- Technical readers want "specificity and the lowest possible level of abstraction": a more
  literal button label lifted the agency's own click rate from 1.3% to 2.0%.
  [Evil Martians, 2025](https://evilmartians.com/chronicles/how-to-kill-conversions-on-your-developer-tool-landing-page)
  (vendor, self-report, no method). Avoid generic "Get started"; keep one primary action with a
  quieter secondary.
  [Evil Martians survey, 2025](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025)
  (a designer's survey of landing pages, no conversion data).
- Film sites play the work first and analyse it after.
  [Art of the Title](https://www.artofthetitle.com/title/severance/) (practice, layout observed).
- Make it easy to try without barriers. [Show HN guidelines](https://news.ycombinator.com/showhn.html) (norm).
- A tool company grew on unpromotional posts with no pop-ups; search visitors stayed longest.
  [Plausible, 2020](https://plausible.io/blog/startup-marketing) (practice, one company).

Strength: weak to moderate. Every conversion number is one company, mostly non-technical
audiences, 2015 to 2021. No write-up was found that reports a click rate from a technical article
to a game, app or film. The direction is consistent: a plain, specific link early, a written
invitation at the true end, nothing boxed in the middle.

### 1.7 AI-assistant and search arrivals

Measured, almost all vendor data:

- With a Google AI summary, users clicked a result on 8% of visits against 15% without, clicked a
  link inside the summary on 1%, and ended the session on 26% against 16%.
  [Pew, 2025](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
  (study, 900 adults, observational, Google only). An AI Overview correlates with a 58% lower
  click rate for the top result. [Ahrefs, 2026](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/) (vendor).
- AI-referred sessions run slightly longer on fewer pages.
  [Clarity, 2026](https://clarity.microsoft.com/blog/ai-visitors-show-stronger-intent-signals/);
  [Ahrefs, 2025](https://ahrefs.com/blog/ai-traffic-quality-study) (vendor). Ahrefs reads it as
  "information validation or one-and-done behavior".
- Two newsrooms disagree: one saw ChatGPT readers at 22 s, under half its search readers; the
  other saw them level. [Tow-Knight, 2026](https://restructurednews.substack.com/p/what-metrics-matter-two-case-studies) (two anecdotes).
- ChatGPT, Perplexity, Copilot and Grok link to the top of the page. 70.9% of Google AI Mode
  citations and 51.8% of Gemini's carry a text fragment, so the reader lands mid-page on a
  highlighted sentence. Three quarters of cited sentences are in the first half of the page.
  [Shashko, 2026](https://hackmd.io/@A09fyOMpSD2VYIJodmXHqQ/r1eJyqthdbe) (data, one author, not reviewed).
- A text-fragment match is scrolled into view and highlighted, `location.hash` does not show it,
  and `::target-text` styles it.
  [MDN](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments) (reference).
- Conversion from AI referrals is mixed: higher on publisher sign-ups in one vendor dataset, lower
  in an academic e-commerce study.
  [Clarity, 2025](https://clarity.microsoft.com/blog/ai-traffic-converts-at-3x-the-rate-of-other-channels-study/) (vendor);
  [Kaiser and Schulze, 2025](https://www.bwl.uni-hamburg.de/en/ueber-die-fakultaet/aktuelles/2025/1106-chatgpt-und-e-commerce.html)
  (study, 973 shops, university summary).
- One vendor put ChatGPT referrals at 94% desktop in mid 2025.
  [BrightEdge via Search Engine Journal, 2025](https://www.searchenginejournal.com/newly-released-data-shows-desktop-ai-search-referrals-dominate/548506/)
  (vendor, method not described). The site's own share, half on phones, does not match it.
- In Chrome, text inside a closed `details` element is findable, and a text-fragment or
  find-in-page match opens it. Text hidden any other way cannot be landed on.
  [Chromium intent to ship, 2021](https://groups.google.com/a/chromium.org/g/blink-dev/c/a6iO__pqI_E)
  (a statement of what Chromium would ship; nothing on Safari).
- Where ChatGPT sends people changes with its interface: after a May 2026 change about 60% of its
  referrals landed on home pages. [Similarweb, 2026](https://aisearch.similarweb.com/blog/chatgpt-referral-traffic-triples/) (vendor, desktop, brands).

Guidance:

- If the first screen does not confirm what the link promised, the click is wasted.
  [NN/g 2020](https://www.nngroup.com/articles/information-scent/) (guide).
- A reader leaves when the page's rate of new information falls below what is available
  elsewhere. [Pirolli and Card, 1995](https://www.chi1995.chistatic.hosting.acm.org/proceedings/papers/ppp_bdy.htm)
  (theory). For these readers "elsewhere" is another question to the assistant; that part is my
  extension.

Strength: weak. No peer-reviewed work on what AI-referred readers do on the destination page. The
safe reading: they already have a summary, they arrive to check or to go deeper, and the first
screen has to offer what the summary could not (the measurement, the figure, the running thing).

### 1.8 Phones

Measured:

- Long articles get about twice the engaged time of short ones on phones (123 s against 57 s, means).
  Arrivals by internal link gave 148 s, search 119 s.
  [Pew 2016](https://www.pewresearch.org/journalism/2016/05/05/long-form-reading-shows-signs-of-life-in-our-mobile-news-world/)
  (data, 117 million phone sessions, news, 2015).
- Comprehension on a phone matches a computer, but hard passages take about 30 ms more per word.
  [NN/g 2016](https://www.nngroup.com/articles/mobile-content/) (study, 276 people).
- Phone medians on interactive articles were 23 to 52% of desktop.
  [Conlen et al. 2019](https://idl.cs.washington.edu/files/2019-IdyllAnalytics-EuroVis.pdf) (study).
- Sections shown open instead of collapsed raised reading time at the 75th percentile from 38 s to
  53 s on mobile Wikipedia; the median barely moved.
  [Wikimedia, 2016](https://meta.wikimedia.org/wiki/Research:Collapsed_vs_uncollapsed_section_view_on_mobile_web) (test, not strict).
- 18 point text beat smaller sizes on comprehension; extreme line spacing (0.8 and 1.8) hurt
  slightly. [Rello et al., CHI 2016](https://pielot.org/pubs/Rello2016-Fontsize.pdf) (study, desktop, 104 people).
- Light mode is slightly better for normal vision; offer both.
  [NN/g 2020](https://www.nngroup.com/articles/dark-mode/) (review).

Strength: moderate that phones can hold long reading and that hard text costs more there. Nothing
measured on phone layout for technical write-ups.

---

## 2. What successful explanatory bloggers do

All of this is practice, not measurement. Their readers mostly arrive from feeds and communities,
already willing to read. Cold arrivals from search or a chat answer are a different population.

| Device | Who uses it | What it does for the reader |
|---|---|---|
| The finished thing in the first screen | Ciechanowski, Patel, Comeau, Luu | Shows what the page will explain before any theory; the reader knows what they are working towards |
| A promise to explain what was just shown | Ciechanowski, Comeau | Turns the picture into a question the reader now holds |
| A simplified version of the problem at the top | Patel | Lets a reader with a problem confirm in seconds that this page is about it |
| Concrete before abstract, one new idea at a time | Evans, Case, Victor | Nothing is defined before the reader has a case to hang it on |
| A chain of "but" and "therefore" | Case, Lin, M. Nielsen | Each section ends on the problem the next one solves, so stopping feels like leaving mid-thought |
| The wrong turns kept in | Wenger, M. Nielsen | Shows why each part of the final method exists |
| Small finished pieces with visible breaks | Alexander | A long page reads as a run of short ones, each with its own payoff |
| More examples than feels natural | Luu | Fewer readers leave with the wrong idea |
| Text and figure as one: the sentence before says what to look for, terms share the figure's colours | Ciechanowski, Patel | The reader's eye goes to the right part of the picture |
| All variants side by side instead of a control | Patel | Every reader sees every state, including those who never tap |
| Static page first, interaction as an island | Patel, Victor, Gwern | The page works for scrollers and without scripts |
| Layers of depth: summary, headings, body, notes | Gwern, Victor | The skimmer and the full reader each get a complete read |
| Digressions moved to footnotes or side notes | Graham, Gwern, Urban | The main line stays unbroken |
| A person talking to one reader: a conversational tone, written for one specific person | Graham, Evans | Reads as a person reporting what they found |
| The next step as the reader's next question, in prose | Patel | The link arrives when the need does |
| The thing they made as the subject, linked in the opening paragraph | Bittker, marian42, PlayCanvas; uv and Bun give the install command early | No pitch is needed; the product is what the page is about |
| A written closing that says what the reader can now do | Comeau, Case | The end becomes a next step instead of a stop |
| One quiet ask, once | Fly.io, Ciechanowski | Tells the reader who made this without interrupting |

They disagree on length (short for Evans, long when needed for Luu), on hidden detail (Gwern
collapses, Tse says assume nobody opens it), on interaction (Comeau and Case build on it,
Matuschak calls every interaction a cost), and on humour (Alexander ranks it first; Ciechanowski,
Luu and Gwern use none).

---

## 3. Recommendations for the doc pages

### What the page does now

Read from `docs_lib.mjs` (`docPage`, `seriesLine`, `inlineContents`, `keepReading`, `afterward`,
`DOC_CSS`) and from the two docs rendered at 390 px wide with about 700 px of visible screen:

| Position on a phone | What is there |
|---|---|
| Screen 1 (0 to 700 px) | Nav, trail, date, title, description, reading time, three lines of series navigation, the first two lines of the Question |
| Screen 2 | Rest of the Question, the Short answer (starts near 880 px), the top of the figure |
| Screens 3 and 4 | The figure, "In numbers" (six bullets) |
| Screen 5 | A companion paragraph, the boxed "In this doc" list, a rule, then section 1 at about 3,230 px |
| End | A boxed, tinted "Keep reading" (series, cards, Play pill, feed), Sources, the author box, then "Read next", Play, "All research" |

Other facts that matter:

- The Play link is built only for a game the text names (26 of 49 docs name Day Hike). It appears
  only in the two end blocks. It opens a new tab.
- No doc gets a template link to its own app or film. The best-holding doc (Codex's browser,
  written for Arkos IDE) has no link to Arkos IDE anywhere. The most visited doc (the AI horror
  short) has no link to either film.
- One doc, since 2026-11-12, carries a "Watch ... on YouTube" pill in its header (the `watch:`
  field, event `watch-<doc slug>`). It links the outside film that doc analyses, not a product,
  and opens a new tab. Apart from the "Also on GitHub" tag on docs that have a source, it is the
  template's only first-screen link out, and its clicks are the site's first numbers for one.
- The title, the description and the Short answer state the same result. Nothing after them says
  what the body adds.
- Section 1 of the most visited doc opens with a six row table, which is cramped at phone width.
- Term definitions are popovers behind a tap.
- Body text is 17 px in a 72 ch column. The line-length evidence is one study that found better
  comprehension at about 55 characters a line than at 100 and an earlier one that found no
  difference, so nothing here asks for a type change. Script on a doc page is about 5 KB of the
  10 KB budget, and nothing below adds any.

### The order to build in

Ranked by expected effect on the two goals, not by ease. "Reaches" is the share of doc visits
that get far enough to meet the change, from the baseline at the top. Items joined by "with" are
one piece of work seen from the template side and the writing side.

| Rank | Change | Goal | Reaches | Why it ranks here |
|---|---|---|---|---|
| 1 | B1 with B2: rewrite each opening. A shorter Question and Short answer in plain words, then what the answer leaves open and the route through the page | 1 | Every visit | The median is decided on the first two screens, and this is the only change that hands a reader who has the answer a reason to go on. Curiosity theory and newsroom practice; no test on article pages |
| 2 | A3 with B3: the answer on the first phone screen, section 1 within three screens | 1 | Every visit, phones most | The same two screens, by layout. One template change covers all 49 docs |
| 3 | A1 with C1: one plain product line right after the Short answer | 2 | Every visit | The first screen carries no product link today, and 23 docs carry none anywhere |
| 4 | C3 with A2: a written closing that sends the reader to check something in the product | 2 | Readers who finish (29 in four weeks on the docs with a Play button) | The end is the one place a product link already works (4 of 29), and two tests favour the end over the middle. The doc-to-doc links beside it will earn little: 1 and 0 clicks in 172 loads |
| 5 | C2 with A5: a marked capture from the product, with a linked caption, where the doc explains it | 2, then 1 | The 10 to 14% who read the body, and fast scrollers, who see figures | Committed readers dwell there. No measured click data for this placement |
| 6 | B4: section 1 opens on a case the reader can see | 1 | Readers who reach the body | Decides whether a visit that passed the opening becomes a read |
| 7 | B6: figures, labels and captions that state the argument | 1 | The third of visits that scroll to the end | A preview scroll sees only figures and headings |
| 8 | B5: joins between sections | 1 | Readers in the body | More sections per reader; practice only |
| 9 | C4 with A4: the link lands somewhere that works, in the same tab | 2 | Readers who click | Follow-through, not clicks |
| 10 | C5: film docs show the film near the top | 2 | Visits to film docs | 9 of the 49 docs are in the Film category |
| 11 | C6: links from the product into its docs | 1 | A few new arrivals | Brings readers who already care |
| 12 | B8: one doc, one question | 1 | New docs | Slow: it acts through what gets written next |
| 13 to 15 | A6, B7, A7 | 1 | Small slices | Small, or by analogy only |

B9, the reader test, is not ranked: it is a check, not a change. Run it first on the five
most-landed docs, write B1 and B2 for those five, then for the other 44 in order of landings.

### (a) Template changes, applied to every doc at once

**A1. A product line right after the Short answer.** Overall rank 3, first for goal 2. With C1.

- What: a new front matter field, `project:`, naming a slug in `docs/games`, `docs/apps` or
  `docs/films`, or `none`. Make it required, so each of the 49 docs makes the choice once: the 26
  docs that name Day Hike get `day-hike` unless one is really about an app or a film; a doc
  written for an app gets that app; a Film doc gets
  the film its research fed, or the newest film when there is no particular one; a doc with no
  honest tie gets `none` and no line. From it the builder writes one plain paragraph in body type,
  with one link, placed after the Short answer paragraph (after the hook line of B1) and before
  the figure. No box, no pill, no icon. The default sentence is built from the project's own
  file: its title, a new one-phrase `blurb:` there ("a co-op horror game that runs in your
  browser"), and a link per kind: a game's `play` address with "Play it, no install", an app's
  `page` with "See what it does", a film's `watch` address with "Watch it" and its `runtime`. A
  doc may replace the whole sentence with `project-line:` (C1). After A3, check at 390 px that
  the line sits above about 1,400 px, the end of the second screen. The header's Watch pill stays
  as it is: it links the film a doc analyses, not a product. Examples:
  "This research was done for Day Hike, a co-op horror game that runs in your browser. Play it,
  no install." "This research was done for Arkos IDE, a Mac app for running many Claude Code sessions at once.
  See what it does."
  "I make AI horror shorts. The newest, The Last Trail, is 56 seconds. Watch it."
- Why here: it stays below the answer, so a searcher gets the answer before the product comes up
  (the existing rule), and it is inside the first two screens, where 74% of viewing time goes.
- Evidence: Wikipedia's official link at the top, 2.47% against 0.14% in the body (data; it is
  highest where the subject's own site is the obvious place to go, and fact-box links overall get
  0.9%). HubSpot's early linked line (one company, and theirs was styled to stand out). Game
  write-ups that link the game in the first paragraph (practice). Banner blindness, so plain type
  and not a pill (study, qualitative).
- Expected effect: goal 2 mainly. Somewhere between 1% and a few percent of page loads, on every
  doc with a project instead of 29 finishers. The end button gets 2.3% of loads today, so matching
  it from the top would double product clicks. No effect on reading time.
- Cost: HTML only. No JavaScript.
- Measure: a named click `lead-<project slug>`. Compare with `play-<slug>` at the end, and with
  `watch-<doc slug>` on the one doc that has the header pill: that is the only comparison of a
  plain line with a pill the site can make. Report clicks per human doc load and per reader (see
  section 5).

**A2. Replace "Keep reading" and "Read next" with a written closing section.** Overall rank 4. With C3.

- What: remove the tinted box, the cards with descriptions and the pill from `keepReading`. In its
  place, directly under the last paragraph of the last section, in the same column and body type,
  under an ordinary heading ("What next", unless the doc's closing paragraph brings its own):
  (1) the doc's closing paragraph (C3), which carries the product link built from `project:`, so
  every doc with a project gets one and not only the 26 game docs; (2) a short list of two or
  three links whose text is the question the linked doc answers, the next part of the series
  first, the rest from the same project or topic. The question comes from a new optional front
  matter line on each doc, `asks:` (one line in the reader's words, about 90 characters at most),
  and falls back to the title until it is written. The feed line stays as one quiet sentence.
  `afterward` (after the author box) shrinks to one line: the same product link and the one next
  question. "Read next" got 0 clicks in 172 loads in that spot, so expect nothing from it; it only
  keeps the page from ending on the author box. Keep the order that exists: closing section, then
  Sources.
- One variant worth a single try: a small figure from the next doc beside its question. Links
  with an image got 63% more clicks than text-only links in the randomized news study. It must
  stay in the text column and not look like a card.
- Evidence: 1 click and 0 clicks in 172 loads (own data). Nothing should come between the article
  and its links, and ad-like blocks are ignored (NN/g guides). End placement beats middle by 55%
  (randomized, news). Related beats popular, most of all for search arrivals (same study). Link
  text should name the payoff (NN/g). Patel's "More" section (practice).
- Expected effect: goal 2, through the closing product link, which reaches every reader who
  finishes (4 of 29 clicked Play there). For the doc-to-doc links expect a few clicks, not a
  change in the 91%: Wikipedia's bottom module redirected willing readers and raised total
  pageviews by nothing.
- Cost: HTML and CSS. Removes CSS. No JavaScript.
- Measure: existing `next-<slug>` and `end-<slug>` names kept for the doc links; new
  `close-<project slug>` for the product link in the closing section.

**A3. Get the answer onto the first phone screen and the body onto the third.** Overall rank 2. With B3.

- What: (1) Cut the series navigation in the header from three lines to one ("Part 3 of 5 in" and
  the series name, linked to the list in the closing section), and put Previous and Next in the
  closing section and the rail, keeping their `series-<slug>` event names. A reader an assistant
  drops on part 3 still sees that it is a part. The only evidence for series navigation at the
  top is one small agency analysis, which does not earn it about 110 px above the Question.
  (2) Trim the phone header spacing. Together these start the Question about 130 px higher than
  its present 600 px. (3) Hide the boxed "In this doc" list where the rail is visible; on phones
  keep it but without the box, and drop the full-width rule and the large gap above section 1 so
  the page does not look finished. (4) Let the top of the first figure or the next heading show
  at each fold. The writing changes B1 to B3 shorten the rest.
- Evidence: the first screen must confirm the link's promise (NN/g guide). 57% of viewing time above
  the fold (study, desktop). Rules, gaps and in-flow blocks read as the end of the page (NN/g guide).
  Phone medians of 20 to 41 s even on well-made articles (study); that a phone reader's whole
  visit is often two screens is my inference from those medians.
- Expected effect: goal 1, on the share of visits that pass 30 s. This is where the median is set.
- Cost: CSS and a small HTML move. No JavaScript.
- Measure: share of doc visits with engaged time over 30 s, split phone and desktop; share with a
  `section` event for n of 1 or more.

**A4. Own links open in the same tab.** Overall rank 9. With C4.

- What: remove `target="_blank"` from `playLink` and from links to the site's own hosts. Back then
  returns the reader to their place in the doc. The journey is already one visit across hosts.
  Links to other sites, the film links to YouTube among them, keep the site's present behaviour;
  on a phone a YouTube link usually opens the app either way.
- Evidence: NN/g guidance; half the AI-referred readers are on phones.
- Expected effect: small, goal 2 and return-to-doc. Cost: HTML only.
- Measure: journeys that go doc, game, doc.

**A5. Let a figure be a link, and allow a self-hosted clip.** Overall rank 5. With C2.

- What: in `renderMarkdown`, allow a figure whose image links to the product (for a capture from
  the product only; a diagram or chart keeps the plain image, since a reader who taps a picture
  mostly wants it larger), with the same link in words in the caption, and a
  `<video controls muted playsinline preload="none" poster width height>` figure for a first-party
  `.mp4`. Reserve the space so nothing shifts. No autoplay. Check the doc pages' policy carries
  `media-src 'self'`.
- Evidence: one Wikipedia pageview in 29 clicks an image, ten times other in-article interactions
  (data), but that click enlarges the picture, so it shows where attention goes, not that readers
  will follow a picture off the page. `preload="none"` loads no video data until played (guide).
  Animation beats stills modestly overall and more for realistic video (meta-analysis, abstract).
  Autoplay is among the most disliked formats (survey).
- Expected effect: both goals, through C2 and B6. Cost: HTML only.
- Measure: named click `fig-<project slug>`; `section` dwell on the section that holds the figure.

**A6. Style text-fragment landings.** Overall rank 13.

- What: `::target-text` colours for both themes, and `scroll-margin-top` on headings. Readers sent
  by Google AI Mode or Gemini land mid-page on one highlighted sentence, with the title and Short
  answer off screen. The claim headings already orient them.
- Evidence: 70.9% and 51.8% of those citations carry a fragment (one author's data); MDN.
- Expected effect: small, goal 1 for a slice of the Google half. Cost: CSS only.
- Measure: none directly without new script; watch engaged time for Google arrivals.

**A7. The reading-time tag on very long docs.** Overall rank 15, inference only.

- What: above about 30 minutes, show the section count instead ("9 sections"), or nothing. Do not
  add a countdown.
- Evidence: none for reading-time labels. Slow-looking progress raised abandonment in surveys
  (analogy). Cost: HTML only. Measure: share past 30 s on the docs affected.

### (b) Changes to how each doc is written and opened

**B1. End the Short answer on what it does not settle, then give the route.** Overall rank 1. With B2.

- What: keep Question and Short answer. Cut the Question to two sentences and the Short answer to
  60 to 90 words in plain terms. Shorter in words, not in content: every part of the Question
  still gets its answer there. Then one new paragraph of two or three sentences: the thing the
  answer leaves open (the number that looks wrong, the approach that failed, the cost), and what
  the reader will be able to check by the end. Do not tease and do not withhold the answer.
  Keep the title and the address, and keep the answer's plain factual sentences: they are likely
  what Google and assistants quote (cited sentences sit high on the page and are short, in one
  author's data), so watch each rewritten doc in Search Console for four weeks. That caution is
  mine, not a finding.
- Evidence: curiosity falls once a person is confident of the answer; a puzzle or a violated
  expectation raises it (Loewenstein, theory). The nut graf (NPR, guide). "What the result shows
  compared with what was thought" (Nature, guide). AI arrivals already have a summary (Pew, by
  inference). No experiment tests this on article pages.
- Expected effect: goal 1. The best candidate for moving visits past 30 s into the body.
- Cost: none. Writing only.
- Measure: share of visits with a `section` event for n of 1 or more (now 10 to 14%); share past
  60 s.

Before and after, the opening of "Reverse engineering an AI horror short" (most visited, median
16 s, half its readers on phones from an assistant).

Before, as published (abridged):

> **Question:** a 45 second vertical horror short turned up on Reddit with no credit: a grinning
> woman in a nightgown climbs out of a fifth floor window of a Soviet apartment block, runs across
> the courtyard, appears through the peephole, then climbs in through the living room window. Was
> it generated, with what, and how would someone make one just like it?
>
> **Short answer:** yes, it was generated. It is episode 18 part 5 of "Архив Аномалии" (Archive of
> Anomaly), a Russian AI anthology by the two person studio XCVmind, made as five image-to-video
> clips from one shared character reference and finished in a video editor. The exact model cannot
> be read from the file, because Reddit's transcode strips every provenance tag. The same look is
> reproducible today on the Gemini API, with Nano Banana Pro for keyframes and Veo 3.1 Fast for
> motion, for under $15 in generation per finished minute.
>
> (figure, then six "In numbers" bullets, a companion paragraph, the contents list)

After:

> **Question:** A 45 second horror short turned up on Reddit with no credit. Was it generated,
> with what, and how would someone make one like it?
>
> **Short answer:** Yes. It is five clips, each a still picture animated by a video model, all
> drawn from one reference image of the same woman, then slowed and grained in an editor. It is an
> episode of "Архив Аномалии" by the two person studio XCVmind. Which model made it cannot be read
> from the file. As of Sep 26, 2026 the same look can be made on the Gemini API, with Nano Banana
> Pro for the stills and Veo 3.1 Fast for the motion, for $14.10 in generation.
>
> **What that leaves open:** how anyone can tell. Reddit's copy carries no tags at all, so the
> only evidence is the picture. Three things in it settle "generated" without any metadata: a
> white shape on the windowsill turns into a person, the candles change number inside one take,
> and a door lock rearranges itself as the camera walks up. A fourth narrows the model: four of the
> five clips show only 19 to 21 new frames a second. The rest of this page is how each of those was
> checked, what the studio says about its own workflow, and the recipe priced line by line.
>
> I make AI horror shorts myself. The newest, The Last Trail, is 56 seconds: watch it.
>
> (figure, captioned as an instruction: "Look at the four long bars: each is a 24 fps clip
> stretched to about 80% speed." Then three or four "In numbers" bullets.)

What changed: the answer comes two paragraphs sooner on a phone; all three parts of the Question
(generated, with what, how to make one) are still answered; the two terms behind taps are said in
plain words; the reader with the answer is handed a puzzle the body solves; the first concrete
things are things they can picture; the product appears once, as a fact, on screen two. Every fact
is already in the doc.

**B2. Say it in plain words first; keep tap-to-open definitions as reminders only.** Overall rank 1. With B1.

- What: in the Question and Short answer, describe the idea and then name the term ("a still
  picture animated by a video model", then "image-to-video" in the body). Any term the argument
  depends on is explained in its own sentence at first use. Change rule 5 of "Write for the skim"
  to match.
- Evidence: definitions one hover away did not reduce perceived difficulty (N = 650, lay readers).
  About half of finishers never open click-to-reveal content (study, one article). Tse's rule
  (practice). Experts also "crave succinct information that is easy to scan"
  ([NN/g 2017](https://www.nngroup.com/articles/plain-language-experts/), qualitative), and the
  jargon study's authors say terms are fine for specialists, so body sections for practitioners
  can keep theirs. A definition inside a closed popover is not rendered, so a text-fragment link
  or find-in-page cannot land on it; the sentence itself has to carry the meaning.
- Expected effect: goal 1 on the first screen, for assistant and search arrivals. Cost: none.
- Measure: share past 30 s for ChatGPT arrivals.

**B3. Shorten the run-up to section 1.** Overall rank 2. With A3.

- What: "In numbers" capped at four bullets (now three to six). No companion paragraph between the
  bullets and section 1; put that link in the closing section. Target: section 1 starts within
  three phone screens.
- Evidence: 74% of viewing time in two screenfuls (study); the fold measurements above.
- Expected effect: goal 1. Cost: none. Measure: `section` events for n of 1.

**B4. Open section 1 with a case the reader can see, in prose, with a figure.** Overall rank 6.

- What: the first screen of the body is a concrete instance: a frame, the bug as it looked, a
  measured number. Not a table, not definitions. Tables go after the paragraph that says what to
  look for in them.
- Evidence: start concrete (Evans, Case; practice). Hard text is slower on phones (study). The
  site's own best docs answer one concrete question.
- Expected effect: goal 1. Cost: none. Measure: `section` dwell for n of 1 and 2.

**B5. Write the joins.** Overall rank 8.

- What: the last sentence of each section names the problem the next section solves. Order the
  body as problem, sticking point, what was tried, what worked, and keep the failed attempt. Section
  7 of the Codex doc already does this (ship Chromium, dock a window, use the OS engine), and it is
  the doc that holds readers best. Test: read the headings and section endings in order; they
  should read as an argument. Mix in a question heading where the answer is the payoff.
- Evidence: Case, Lin, M. Nielsen, Gopen and Swan (practice and guidance). Segmenting (measured,
  learning). Narrative recall (review). No reading-time data.
- Expected effect: goal 1 for readers already in the body: more sections dwelt on per reader.
- Cost: none. Measure: mean number of distinct `section` events per reader.

**B6. Make figures carry the argument for the fast scroller.** Overall rank 7.

- What: the sentence before a figure says what to look for. The caption states the claim the
  figure proves. Part names sit on the figure, one outline or arrow per figure. Show a technique as
  stacked stills of the same frame with one change each. Cut any image that only shows that the
  thing exists. In a pipeline or architecture diagram each stage carries its inputs, outputs and
  cost on the box. In rendering and tooling docs each code sample is complete as it stands, with
  no placeholder that points at another block. Scroll a doc in five seconds: figures, labels and
  headings alone should state the answer.
- Evidence: spatial contiguity 0.82, signaling 0.71, coherence 0.86 (Mayer, lab). Captions get
  looked at (one small test). Preview scrolling (study). Decorative images are ignored (study).
  Diagrams that group what is used together (theory). Developers start from the code example
  (11 developers, an API task).
- Expected effect: goal 1, by converting preview scrolls into reads. Cost: authoring time; inline
  SVG and stills, no JavaScript.
- Measure: among visits that reach the end marker, the share with any `section` event.

**B7. One prediction per doc, answered in view.** Overall rank 14.

- What: before the key result, one line asking the reader to guess ("Which of these two frames is
  the generated one?"), with the answer in the next paragraph, not behind a tap.
- Evidence: answering questions between segments halved mind wandering (lab, lecture), but the
  group shown the same questions with their answers did no better than the group shown none, and
  a question a reader can scroll past is closer to that second case. Predict first raised liking,
  not memory (web experiment). Expect a little interest, not proven understanding or time.
- Expected effect: small, goal 1. Cost: none. Measure: `section` dwell on that section.

**B8. One doc, one question.** Overall rank 12, for new docs first.

- What: scope each new doc to one concrete question, stated in the title in the reader's words.
  Split an existing long doc only where it answers separate questions, and make each part stand
  alone with its own Question and Short answer. Do not split to create page views.
- Evidence: own data (84 s median on single-question docs; length does not predict time). Distill's
  welcome for narrow scope (policy). Added words get about 18% read (old, small). Series evidence
  is thin and mixed, and an assistant will land readers on part 3.
- Expected effect: goal 1 on new docs. Cost: none. Measure: per-doc reader rate.

**B9. A reader test on the five most-landed docs.** Not ranked: a check to run before the rewrites.

- What: one person who does not know the topic reads each and says where they got lost. Fix those
  spots first.
- Evidence: Pinker (opinion). Cheap, and the only check that does not depend on 50 visits a week.

### (c) The path from a doc to its game, app or film

A doc ends up with at most three product mentions: the line near the top (A1, C1), one capture
where the doc explains the thing (C2), and the closing (C3). Each is plain text or a real figure,
none repeats another's wording, and none is a block. The skeptic's reading of the evidence is one
pointer per doc; three is defensible because they meet three different readers (the screener, the
body reader, the finisher), but it is the reason to watch returning readers (section 5).

**C1. Word the product line for this doc.** Overall rank 3. With A1.

- What: one or two sentences that say what the product is, what in it this doc explains, and what
  the click gives. "I build Day Hike, a co-op horror game that runs in your browser. This doc is
  how its ground fog is drawn. Play it, no install, and look down the first valley." Name the cost
  where there is one ("for macOS", "56 seconds"). A doc with only a loose tie to a product gets the
  neutral line and nothing more.
- Evidence: relevance of the link to the page is the critical factor (HubSpot). Specific labels
  (NN/g; Evil Martians, self-report). One honest sentence, once (Fly.io, practice).
- Cost: none. Measure: `lead-<slug>` rate by doc; docs with a specific line against the neutral one.

**C2. Show the product where the doc explains it.** Overall rank 5. With A5.

- What: in the section where the technique is visible, one real capture from the game, app or film
  as a figure, marked to show the point, with a caption that links: "Captured in Day Hike, the
  first valley. Play it and watch the fog band at the ridge." Aim for the second screenful to the
  halfway point. Every bare product name in the body becomes a link to a specific destination. No
  box and no button mid-article.
- Evidence: scrollers dwell around 1,200 px (vendor data). Images draw more clicks than anything
  else in an article, though to see them larger (Wikipedia). Readers click out for what the page
  cannot give (Wikipedia citations, by inference). A named product without a link sent few
  visitors; a direct link sent many (one team). An offer block mid-article did half as well as at
  the end (one test), so this is a figure and a sentence, not a block. No measured click rate
  exists for this placement.
- Expected effect: both goals. It is also the honest reward in the middle of a long doc.
- Cost: one capture per doc. HTML only. Measure: `fig-<slug>` and in-text `body-<slug>` clicks.

**C3. Close with something to go and check.** Overall rank 4. With A2.

- What: the doc's last section is two to four sentences in the author's voice: what the reader can
  now recognise, where to see it, the link, and one last look back at the opening picture. "Stand
  at the trailhead at dusk. The band of fog under the trees is section 3; the way it thins as you
  climb is section 5." Then the next question and its doc.
- Evidence: Comeau's closing section (practice). Case's sandbox ending (practice); the game and app
  are real, not toys built for the article. End placement doubles clicks on an offer (one test).
  The Play button already gets 4 of 29 finishers, above Wikipedia's 6% seen-rate, so the end works
  for those who arrive.
- Expected effect: goal 2 among finishers. Cost: writing only. Measure: `close-<slug>` per finisher.

**C4. Send each device somewhere that works.** Overall rank 9. With A4.

- What: the game link lands in the game, not on a card, and says "in your browser, no install".
  Confirm the game starts on a phone before offering it to phone readers. For a Mac app, the link
  goes to its page (which shows the app working), not to a download.
- Evidence: make it easy to try (Show HN norm). One developer's ten to one plays for a browser
  build (anecdote). About 90% of visits to a store page from social links were logged out and
  could not act (9 developers; that phones explain it is the author's guess).
- Cost: none on the doc. Measure: journeys where the click is followed by a game route or an app
  page view of more than a few seconds.

**C5. Film docs: the film in the first two screens, within the privacy rule.** Overall rank 10.

- What: a film doc carries the film's poster as a linked figure near the top ("The Last Trail, a
  56 second horror short. Watch it."), using the poster the site already hosts. The link goes
  straight to YouTube and so skips the horror notice the film's card carries, which is why the
  line and the caption must say "horror". On a film doc this captioned poster takes the place of
  the plain line (A1): one mention near the top, not two. Craft docs (camera, sound, dread) may
  say what to watch for in the film, since the film's own card on the projects page already says
  its story and camera follow that research. Docs about models, prompts, pipelines and costs
  carry only the neutral line and no poster: how a film was made stays private.
- Evidence: play rate falls when the play button is below the first screen (vendor data). Film
  sites play the work first (practice). No published numbers for making-of articles.
- Cost: HTML only, no new asset. Measure: `lead-<film>` and `fig-<film>` clicks; YouTube's own
  external-source count is the only follow-through signal.

**C6. Link from the product into its docs.** Overall rank 11.

- What: the game's menu or credits, each app page and each film's card link the one or two docs
  that explain them.
- Evidence: phone readers who arrive by an internal link read longest (148 s against 119 s from
  search; Pew, news, 2015).
- Expected effect: goal 1, by bringing readers who already care. Cost: a link per product.
- Measure: engaged time on docs for arrivals whose referrer is one of the site's own hosts.

---

## 4. What not to do

| Do not | Evidence |
|---|---|
| Withhold or tease the answer, or cut facts out of it, to force scrolling (B1 trims words, never content) | Lead with the conclusion (NN/g guide). Clickbait styles did not beat plain headlines (CHI 2021). Some 20 s visits are answered readers (Google, 2009, by analogy). |
| Add a pop-up, slide-out, exit prompt or sticky product bar | Among the most disliked formats (NN/g survey, 452 adults). Overlays erode trust (NN/g). A sticky bar helped on phones only and lost 5% on desktop in the one test found ([NextAfter](https://www.nextafter.com/?p=16490), one non-profit's donation pages). |
| Add more or louder product blocks, or a boxed call-out mid-article | Ad-like content is ignored (NN/g). An offer mid-article got half the clicks of one at the end (NextAfter). Banner ads cost one long-form site about 10% of traffic ([Gwern](https://gwern.net/banner); third-party ads that also slowed the page, so the size may not transfer). |
| Put anything the argument needs behind a tap, a hover or a collapsed section | Half of finishers never open it (Conlen 2019). Tse's rule. Open sections raised 75th percentile reading time on mobile Wikipedia from 38 s to 53 s. |
| Build widgets, step-throughs or reveal clicks to raise time | Well-made interactive articles have phone medians of 20 to 41 s. Optional controls had a median of zero uses. Evidence that interactivity helps is limited (Distill review). A harder font raised felt difficulty, not memory ([Warwick release, 2020](https://warwick.ac.uk/newsandevents/pressreleases/previously_claimed_memory)). |
| Take over the scroll, pin figures to it, or auto-load the next doc | Scrolljacking harmed task success (NN/g 2023). Infinite scroll showed only "slight evidence" of benefit (Chartbeat via Digiday) and would corrupt the end marker. |
| Add a progress bar, a "minutes left" counter or completion rewards | No evidence for reading-time labels. Slow-looking progress raised abandonment in surveys (Conrad 2010). |
| Add decoration: hero images, mood stills, looping clips, jokes, mascots | Seductive details lower learning (58 studies). Decorative images are ignored (NN/g). Coherence principle (Mayer). |
| Autoplay video or sound | Among the most disliked formats; leave control with the user (web.dev). |
| Lengthen docs to raise time, or cut them to a word target | About 18% of added words are read (NN/g 2008). Time flattens with length (Chartbeat). Own data: length does not predict time. |
| Split docs into a series to create second pages | About 9% of cold visitors open any second page. Series evidence is thin and mixed. |
| Tune fonts, widths or contents styling expecting a reading-time gain | Years of A/B tests on a comparable site mostly found nothing; an early 10 to 20% win shrank to 0.4% ([Gwern](https://gwern.net/ab-test)). The pages already have these features. |
| Open the product in a new tab | Phone users lose Back (NN/g 2020). |
| Run A/B tests, or trust a before-and-after jump | With 82 and 75 visitors a 337% "lift" appeared; low-power wins are mostly false and exaggerated ([Kohavi, Deng, Vermeer, KDD 2022](https://airbnb.tech/wp-content/uploads/sites/19/2025/10/ABTestingIntuitionBusters.pdf)). |
| Count scroll-to-end or shares as reading | Own data: most end-marker hits are fast scrolls. 75% of link shares on Facebook were made without opening the link ([Penn State, 2024](https://www.psu.edu/news/research/story/social-media-users-probably-wont-read-beyond-headline-researchers-say)). |
| Copy a famous blogger's long personal lead-in, running jokes or reliance on prior trust | Their readers arrive trusting them; these arrive cold. "Copying what's worked for someone else is unlikely to work for you" (Luu). Success is only partly determined by quality (Salganik 2006). |

---

## 5. How to measure honestly

**Better proxies than raw time on page.** All from events the site already logs.

| Measure | Definition | Why |
|---|---|---|
| Reader rate | Share of human doc visits with at least one `section` event for n of 1 or more | Counts people who stayed 5 s in the body. A flick never fires it. Baseline 10 to 14%. |
| Past 30 s, past 60 s | Share of doc visits with engaged time over each mark | 30 s is where leaving flattens. The median hides movement on either side of it. |
| 75th percentile engaged time | Per doc and overall | Tracks the readers, not the screeners. Wikipedia's is 75 s. |
| Sections per reader | Mean distinct `section` events among readers | Shows whether the joins carry people forward. |
| Quality read | Engaged time at or above half the doc's expected reading time, and scroll past the midpoint | After the [Financial Times measure](https://www.ftstrategies.com/en-gb/insights/how-the-financial-times-brought-data-into-the-newsroom), which uses time alone; the scroll condition is added here. Reachable on a 2,500 word doc; treat as rare on a 20,000 word one. |
| Time ratio | Engaged time divided by expected reading time, per doc | The time needed depends on length and difficulty, so compare docs by ratio. |
| Product click rate | Clicks on `lead-`, `fig-`, `body-`, `close-` and `play-` per doc visit and per reader | Per reader is the fair rate: a screener was never going to click. |
| Follow-through | Journeys where the click is followed by a game route or an app page | A click is not use. The cross-host journey already records it. |
| Returning readers | Visitors whose journey shows a later doc visit | The only check that a louder page is not costing return visits. |

Always split by referrer (Google, ChatGPT, other) and by phone and desktop. A blended median can
hide a gain in one group, and phone time is not comparable with desktop time.

**Check the clock first.** With 91% one-page visits, every timing rests on the page's own last
report. Analytics that time a page by the next page view record zero seconds for a one-page visit
([Matomo's documentation](https://matomo.org/faq/faq_21824/)), and a page that reports only when
it unloads loses phone visits. Before the first comparison, confirm that engaged time is sent
when the tab is hidden, on a phone, and that the same build of the measuring script runs in both
periods.

**What a successful four weeks looks like.** About 200 visits before and 200 after. These are my
own rough power figures (80% power, 5% two-sided), not from a source:

| Measure | Baseline | Smallest change four weeks can show |
|---|---|---|
| Reader rate | about 12% | about 23% |
| Share past 30 s | under 50% (assume 40%) | about 54% |
| Product clicks per doc visit | 4 in about 172 loads (2.3%; only 26 of the 49 docs carry the button) | about 9%, or 16 clicks |
| Median engaged time | 21.5 s | Not readable at this size. Report it; do not judge by it. |

So: call it a success if the reader rate roughly doubles, or product clicks go from 4 to 15 or
more, and the result repeats in the next four weeks. Anything smaller is not failure; it is
unmeasurable yet. Keep the change and keep counting. This is a before-and-after comparison with no
control, so check that the mix of landing docs and referrers did not shift, and compare the same
docs across the two periods.

**Guard rails.** Reject a change that raises seconds without raising reader rate or
follow-through. Time alone is the wrong target: nudges do move numbers without the reader gaining
anything (mild manipulative patterns doubled sign-ups with no backlash in
[Luguri and Strahilevitz, 2021](https://academic.oup.com/jla/article/13/1/43/6180579)), and
YouTube added "valued watchtime" because
["not all watchtime is equal"](https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/).
Expect narrative rewrites to be read faster per word. Do not count a 20 s visit that ended on the
Short answer as a failure of the doc. Watch returning readers after the product line goes in, and
watch each rewritten doc's clicks and position in Search Console.

---

## 6. Open questions the evidence does not settle

1. Does an answer-first opening cost reading time on an article page? No experiment was found in
   either direction. The hook line (B1) is the hedge.
2. What do readers sent by ChatGPT do on the destination page? Vendor data and two newsroom
   anecdotes disagree. The site's own split by referrer will be better evidence than anything
   published.
3. Why are half the ChatGPT arrivals on phones here, when one vendor's 2025 data (section 1.7,
   method not described) put ChatGPT referrals at about 94% desktop? Check how those visits are
   identified.
4. Does a product link near the top lower trust or return visits for readers who came for the
   research? The only test of that kind was third-party banner ads. Watch returning readers. The
   header Watch pill added on 2026-11-12 is a small natural experiment: its click rate against the
   plain line's will say whether a pill or a sentence does better here.
5. Do tap-to-open definitions get opened at all on these pages? They are not logged. One named
   event on the popover would answer it.
6. Is a short clip of the game or film at the top a draw or a distraction? Learning research finds
   a modest gain for animation that depicts the content and harm from interesting but irrelevant
   material; the practitioners who do it publish no data.
7. One next link or three? Choice research has a mean effect of zero. Practice runs from one to
   seven. The one A/B test found
   ([NextAfter](https://www.nextafter.com/experiments/how-an-up-next-slideout-impacts-mobile-email-acquisition-rate/),
   3.6% to 4.7% on phones) added a single named "Up Next" where there was nothing, in a slide-out
   this site would not use, so it does not compare one with several.
8. Would splitting the 15,000 to 21,000 word docs help? The series evidence is thin, and the
   best-holding docs are short for a reason that may be scope, not length.
9. How far may a film doc point at the films? The privacy rule allows craft observations and the
   one named model. Whether "watch for this in The Last Trail" is inside that line for each craft
   doc is the owner's call, doc by doc.
10. Can the game open at a named place (a valley, a time of day)? If it can, C2 and C3 can link to
    the exact thing the doc explains. If not, the caption has to say where to walk.
11. Do the phone fold measurements hold inside the ChatGPT in-app browser? They were taken at 390
    px wide with 700 px of visible height; the in-app view may be shorter.
