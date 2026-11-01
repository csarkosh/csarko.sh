# apps.csarko.sh in the store's look

*Approved by Cyrus on 2026-10-31 from a hand-written mock of the Arkos IDE page ("I love it").*

## Why

Every apps.csarko.sh page was `standaloneShell` from `docs_lib.mjs`: the portfolio's head, token
blocks, Inter and JetBrains Mono, the doc page's prose and contents rail. It read as a
continuation of csarko.sh. Cyrus wants "a totally separate experience so the user doesn't get the
impression that they're on my portfolio site anymore", in the style of the Google Store's
product pages (https://store.google.com/product/pixel_11_pro), the themes to be iterated later.

## What the store page is

Measured from the Pixel 11 Pro page in Chrome on 2026-10-31 and kept:

- **Type.** Google Sans Flex (weight 500 headings, 400 text) and Google Sans Code, both OFL on
  Google Fonts, self-hosted from `apps/fonts/` and content-hashed by `apps/build.mjs`, with
  metric-matched Arial and Courier New fallbacks so the swap moves nothing.
- **Colour.** Light only, as the store is: a cream page `#f5f2eb`, ink `#191c1d`, and bands in
  white, sand `#f4f1df`, sky `#ebf6ff`, peach `#f4d2c5` and sage `#dbe5dc`. Every text colour
  clears 4.5:1 on every band (`apps/test/store.test.mjs`). A README picture's dark variant is not
  used.
- **Shape.** 28px cards, 24px media, 100px pills, a 1156px width and a 720px reading column.
- **Chrome.** The title and tagline centred over the original hero, then a floating white bar
  (name, GitHub, Buy me tokens, the licence and the release, a black Install or Download pill)
  that sticks 12px below the top. On a narrow screen it becomes a two-row card, every link kept.
- **Motion.** The site's Material 3 tokens, copied from `public/index.html` at build time
  (`motionTokens`): folds open as an accordion and hovers ease; nothing moves under reduced motion.

Nothing of the portfolio is left on the page: no Inter, no `--accent`, no nav, trail or rail.
The 404 page stays the site's.

## How a README becomes the page

The README stays the source; `apps/product.mjs` lays it out:

1. **Top.** The `# Title`, the tagline (a lone paragraph between the title and the hero, or the
   app's description), the hero and its caption.
2. **Promo.** `promo` and `promo-link` in `docs/apps/<slug>.md` make one white card under the
   bar. Arkos IDE's says its sessions survive IDE updates, restarts and frozen windows, and links
   to the guide's "After a restart" (Cyrus: the top card highlights persistence, not Rust).
3. **Opening band.** The text before the first section. A line of three or more bold names joined
   by middle dots becomes chips; a list whose items lead with bold words becomes cards (a lead
   that ends its own sentence is the card's title).
4. **Bands.** Each `## ` section that shows something (a picture, code, a flowchart, panels,
   downloads, or the recording) is a band, the tints taking turns, under a centred headline that
   ends in a period. Its first paragraph, when it is a whole sentence, goes under the headline.
   The install section's headline also says "Free · Open source". Paragraphs before a picture
   become a feature row beside it, sides alternating; a bold lead becomes the row's heading
   ("**The multi tasker** runs..." reads "The multi tasker." over "Runs..."), and each row after
   the first wears its own tint the full width of the page. On a phone a row's heading leads,
   then its picture, then its words.
5. **The details.** Sections of only words and lists (Privacy, Learn more, License) fold, in the
   README's order, into one closing band, the store's questions.
6. **Recording.** The front matter's recording plays under its section's headline (unchanged).

Each app page also gets `og.jpg`, the hero on cream at 1200 by 630, as its share card instead of
the portfolio's.

## Changed on review (2026-11-01)

- **The opening clip.** Cyrus wanted the recording "more cinematic" and "a background video
  similar to the one that plays at the top of" the Pixel 11 Pro page. `hero-video` and
  `hero-video-alt` put an app's clip full bleed behind the title, played once and held on its
  last frame (its poster, and the share card), with a dark scrim under the words so they keep
  their contrast over any frame (14:1 on a phone over Arkos's last frame). Arkos's is ide-arkos'
  `docs/images/hero.mp4`, made by `scripts/shoot/cinema.py`. The themes loop under "Who it's
  for" came off the page.
- **The bar** is the app's name and the Install pill, nothing else; Buy me tokens is one quiet
  line under it, set to the right; the licence, the version and GitHub went to the footer.
- **The promo card** lost its icon, links to the guide with "Learn more", and Arkos's goes on
  from the sessions to the themes and their effects, the rendered markdown editor and the panes.

## Left for later

- The mock's gallery thumbnails and theme swatches, its "Engineered to never lose a session."
  cards and its FAQ were written for the mock; the README carries none of them. They would need
  copy of their own (a sidecar file per app) if Cyrus wants them.
- The favicon is still csarko.sh's.
- The specific themes, which Cyrus said would be iterated later.
