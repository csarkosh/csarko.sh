---
description: A viral AI horror short, taken apart from its pixels: five image-to-video clips on one character reference, slowed and grained in an editor; a $14.10 recipe.
published: 2026-09-26
categories: AI, Film
series: AI short films
updated: 2026-10-23
related: horror-sequences-shot-by-shot, horror-cinematography-shot-by-shot
---
# Reverse engineering an AI horror short

**Question:** a 45 second vertical horror short turned up on Reddit with no credit: a grinning
woman in a nightgown climbs out of a fifth floor window of a Soviet apartment block, runs across
the courtyard, appears through the peephole, then climbs in through the living room window. Was it
generated, with what, and how would someone make one just like it?

**Short answer:** yes, it was generated. It is episode 18 part 5 of "Архив Аномалии" (Archive of
Anomaly), a Russian AI anthology by the two person studio XCVmind, made as five
[image-to-video](#term "A video model that takes a finished still and a prompt, and animates the scene from it.")
clips from one shared character reference and finished in a video editor. The exact model cannot
be read from the file, because
[Reddit's transcode](#term "Reddit's own re-encode of an uploaded video, which drops the original file's creation tags.")
strips every provenance tag. The same look is reproducible today on the Gemini API, with Nano
Banana Pro for keyframes and Veo 3.1 Fast for motion, for under $15 in generation per finished
minute.

![A timeline of the 45 second short: an establishing shot of 2.2 seconds, then four longer clips (window, courtyard, hallway to peephole, room) and a 3 second title card](shots.svg "The short as section 1 reconstructs it: five generated clips and a still title card. Four of the clips are 24 fps sources slowed to about 80 % on a 30 fps timeline.")

**In numbers:**

- **Five clips of 2.2 to 13 seconds** and a 3 second title card make up the 45 seconds
  ([section 1](#five-clips-and-a-title-card-from-an-xcvmind-anthology)).
- **No provenance at all:** no C2PA manifest, no XMP, zeroed creation dates and no encoder name
  but ffmpeg in Reddit's x264 re-encode
  ([section 1](#five-clips-and-a-title-card-from-an-xcvmind-anthology)).
- **19 to 21 unique frames a second** in four of the clips: 24 fps sources slowed to about 80 %,
  which fits Veo, Sora 2, Runway Gen-4, Seedance and Wan 2.5 better than Kling or Hailuo
  ([section 2](#the-pixels-prove-generation-and-a-24-fps-source-slowed-to-80)).
- **Seven video models** named by the studio over its channel's history, the best take winning
  each shot; its per-scene breakdowns with prompts are sold on a paid Telegram tier
  ([section 3](#the-studio-animates-stills-on-several-models-best-take-wins)).
- **Around 5,000 rubles** and up to dozens of hours per finished minute, by the studio's own
  account ([section 3](#the-studio-animates-stills-on-several-models-best-take-wins)).
- **$14.10** in generation for a 45 second reproduction on the Gemini API, at two takes per shot
  ([section 4](#a-14-10-recipe-nano-banana-pro-keyframes-veo-3-1-fast-motion)).

This is a companion to [the September survey of consistent characters and sets in AI
film](/research/ai-short-film-generation). That doc asked whether a series could be locked; this
one takes one real short apart to see what a working studio actually does.

## 1. Five clips and a title card, from an XCVmind anthology

| Segment | Time | Length | Content |
|---|---|---|---|
| Establishing | 0.0 to 2.2 s | 2.2 s, trimmed | Push in on a five storey brick block toward one lit window |
| Window | 2.4 to 12.8 s | 10.4 s | The woman unfolds from a shape on the sill, grins, retreats |
| Courtyard | 12.9 to 18.4 s | 5.5 s | She runs out of the entrance toward the camera, seen from a balcony |
| Hallway to peephole | 19.3 to 32.2 s | 13 s, no cut | POV walk to the door, the peephole fills the frame, fisheye view of her on the stairs |
| Room | 33.7 to 41.9 s | 8.2 s | POV enters the living room, she climbs in through the window |
| Title card | 42 to 45 s | 3 s | "Tickling Toes by Hard Master" over a gold hexagram on red |

The file itself was a Reddit download: the `RDT_` file name is Reddit's own naming for a saved
video, and the stream carries Reddit's 360p transcode ladder (x264, constant quality 23, a
keyframe every 60 frames, scene cut detection off, an 800 kbps buffer cap), muxed by ffmpeg 8.
Every creation date is zero, there is no encoder name other than ffmpeg, no C2PA or JUMBF
manifest, no XMP, and no H.264 user data. That is what a Reddit copy of anything looks like, so
the absence proves nothing about the original export.

A title card search found nothing. The YouTube link, once supplied, gave the real title:
"Архив Аномалии №018, часть 5" on the XCVmind channel, uploaded about a week before this doc
[1]. The studio's public posts confirm the shape of the workflow this doc reads from the pixels
and name the models it rotates through: Hailuo, Kling, Midjourney Video, Sora 2 and Veo [2], [3].
Episode 18 is a five part arc about a mimic entity that copies people, which is why the
woman grins, climbs out of a window and turns up at the door [4].

## 2. The pixels prove generation and a 24 fps source slowed to 80 %

The tells, strongest first. Each was checked on frames extracted at full resolution, on
per-clip temporal variance maps (the standard deviation of every pixel across a clip, which
exposes anything that stays still, such as a watermark), and on a frame difference trace.

Three of them settle the first question on their own: a formless white shape on the windowsill
resolves into a face and a body over two seconds, candles multiply and move within one continuous
take, and a door's lock hardware changes count as the camera approaches. None of that happens to a
camcorder.

| Tell | Where | What it means |
|---|---|---|
| A shape resolves into a person | 2.4 to 4.8 s | Diffusion image-to-video starting from a still that showed a curled figure |
| Candles change count and place inside one take | 3 s versus 12.5 s | No cut between them; the model re-invented the set dressing |
| Door lock and handle shift as the camera nears | 22.4 to 23.4 s | Geometry is not tracked across a push-in |
| An arm twice its plausible length, a foot that smears into the balcony door | 40.5 s | Anatomy drift under motion; some of it is intended, the smear is not |
| Grass and fence detail crawls; the running figure leaves a soft ghost | Courtyard clip | Texture is re-sampled per frame rather than tracked |
| One face, one costume, five clips | Everywhere | A reference image, or a character consistency feature, in every generation |
| No static region in any corner | All clips | No visible watermark: a paid tier, a crop, or an invisible mark such as SynthID |
| A 13 second continuous POV push-in with correct fisheye | Hallway to peephole | Either a long generation or an extend feature; the difference trace shows no cut or dissolve |

**One character reference.** The same face, hair and nightgown with the pink bow trim appear in
every shot, including the fisheye close-up. Five independent prompts do not do that; a reference
image fed to every generation does.

**Frame cadence.** Counting exactly repeated consecutive frames gives the source rate under the
30 fps container:

| Segment | Unique frames per second | Reading |
|---|---|---|
| Establishing | 24 | A 24 fps clip dropped onto a 30 fps timeline at native speed |
| Window, courtyard, hallway, room | 19 to 21 | The same kind of source, slowed to about 80 % with frame repeats, no optical flow |
| Title card | 0 | A still |

A native 24 fps output fits Veo, Sora 2, Runway Gen-4, Seedance and Wan 2.5. Kling emits 30 fps
and Hailuo 25 fps, so those would need a different slowdown to land at the same numbers; they are
less likely, not excluded. The cadence narrows the field; it does not name a model.

**The edit.** A 30 fps timeline, four of the five clips slowed to roughly 80 %, a film grain
overlay, two stock transitions (an RGB scanline glitch and a whip-blur), vector title text and an
ambience bed with no dialogue. All of it is a preset away in CapCut or DaVinci Resolve.

**Audio.** A sound design bed with no dialogue; the low band shows no speech formants. The first
4.5 seconds are a quieter drone that rolls off at 15 kHz, and everything after is broadband
ambience with transients (footsteps, a door) that rolls off at 17 kHz, the AAC limit of Reddit's
128 kbps re-encode. Two different sources, laid under each other in the edit.

## 3. The studio animates stills on several models, best take wins

XCVmind is an AI film studio co-founded by "misterXCV". It runs the anthology on YouTube and
TikTok, with a Telegram channel for the films and a second one for announcements and tips
[1], [2], [3], [4]. Read across those channels and the studio's profiles on iFilm, vc.ru,
DTF and Pikabu [5], [6], [7], [8], the stated workflow is:

- **Image-to-video is the core method.** Finished artwork goes in with a prompt and the video
  model animates the scene [2]. The opening, where a shape on the sill becomes a person, is what
  image-to-video does when the still shows a curled figure and the prompt says she rises.
- **Several video models run in parallel** and the best take wins per shot. Named over the
  channel's history: Hailuo (MiniMax), Kling including its Omni reference mode and its O1
  video editor, Midjourney Video, Sora 2, Veo 3, Grok Imagine and Seedance. The studio's
  refrain is that no perfect network exists yet; Sora is "obedient but soulless", Midjourney is
  "an impressionist" [2], [3].
- **Cost and effort.** Up to dozens of hours and around 5,000 rubles per finished minute [3].
- **The exact breakdowns are for sale.** The announcements channel's paid tier, "Секретное
  место" (Secret Place), publishes a per-scene breakdown of each episode: prompts, reference
  images, which model made each shot, and process notes. It is the direct route to the recipe
  behind this episode [4].

One caveat on the channel's banner, which reads "XCVmind | AI Video | Sora 2": OpenAI shut the
Sora app down in April 2026 and retired the Sora 2 API on 24 September 2026 [9]. Any Sora based
recipe in the studio's older posts is now historical, and its current shots come from Kling,
Veo, Hailuo or Seedance.

## 4. A $14.10 recipe: Nano Banana Pro keyframes, Veo 3.1 Fast motion

The studio's method, restated as steps, with the one stack that a single API key covers.

1. **Beat sheet.** Five or six beats of 5 to 12 seconds, one location idea per beat, told as
   found footage. The anthology frames each episode as a documentary lore entry, then shows one
   incident.
2. **Character sheet.** One image model with a fixed reference: a front view, three quarter,
   full body and a face close-up of the same person in the same costume. Those four images ride
   along with every later generation.
3. **A start frame per shot.** Same image model, same character reference, plus a style
   reference for the late Soviet apartment look: yellow brick, teal stairwell paint, patterned
   carpet, wooden window frames, candlelight. Generate at 9:16 so nothing is cropped later.
4. **Animate each frame.** Image-to-video, three to five takes per shot, keep the least broken.
   Prompt the camera outright: "handheld POV, slow push toward the door, fisheye through a
   peephole".
5. **Sound.** An ambience bed, a couple of transients, a low drone under the opener.
6. **Edit.** A 30 fps, 1080 by 1920 timeline. Slow the clips to 75 to 85 %, add film grain, a
   VHS glitch preset and a whip-blur for transitions, end on a static title card, export H.264.

**Cost on the Gemini API** for a 45 second short with two takes per shot, at the September 2026
list prices [10], [11]:

| Item | Unit price | Quantity | Cost |
|---|---|---|---|
| Character sheet, Nano Banana Pro at 2K | $0.13 per image | 4 | $0.52 |
| Keyframes, Nano Banana Pro at 2K | $0.13 per image | 6 | $0.78 |
| Motion, Veo 3.1 Fast at 1080p | $0.12 per second | 5 shots, 2 takes, 8 s | $9.60 |
| One hero shot on Veo 3.1 standard | $0.40 per second | 8 s | $3.20 |
| Total | | | $14.10 |

Veo 3.1 generates 4, 6 or 8 second clips at 24 fps in 16:9 or 9:16 with native audio, and takes
a start image plus up to three reference images for character consistency [10], [11]. The
budget model for stills, Gemini 2.5 Flash Image, is deprecated with a shutdown on 2 October
2026, so the Pro model is the one to build on [11]. Expect two to four hours per finished minute
at first, most of it choosing takes.

## 5. Unverified: the model, an invisible watermark, the full posts

- **The model behind this episode.** Nothing in the Reddit copy names it. The studio's own
  export, or its paid breakdown, would.
- **Invisible watermarking.** A SynthID check needs Google's verifier run on the original
  export, not on a transcoded copy.
- **The full text of the studio's posts.** The environment that did this work could reach
  search results but not Telegram, YouTube, TikTok, Instagram or the Russian blog platforms
  directly, so the workflow statements above come from indexed excerpts of those channels, not
  from reading them end to end.

## 6. Sources

1. XCVmind, "Архив Аномалии №018, часть 5," YouTube, Sep. 2026. Accessed: Sep. 26, 2026. [Online]. Available: https://www.youtube.com/shorts/dAdaAVyWxNw
2. misterXCV, "misterXCV ART," Telegram channel. Accessed: Sep. 26, 2026. [Online]. Available: https://t.me/s/misterxcv_art
3. XCVmind, "XCVmind," TikTok profile. Accessed: Sep. 26, 2026. [Online]. Available: https://www.tiktok.com/@xcvmind
4. XCVmind, "XCVmind | Анонсы | Советы," Telegram channel. Accessed: Sep. 26, 2026. [Online]. Available: https://t.me/s/vmind_ai1
5. iFilm, "XCVmind - AI Filmmaker," iFilm creator page. Accessed: Sep. 26, 2026. [Online]. Available: https://www.ifilm.com/creator/XCVmind
6. XCVmind, "XCVmind (@id4823848)," vc.ru profile. Accessed: Sep. 26, 2026. [Online]. Available: https://vc.ru/id4823848
7. misterXCV, "misterXCV (@id221242)," DTF profile. Accessed: Sep. 26, 2026. [Online]. Available: https://dtf.ru/id221242
8. XCVmind, "XCVmind," Pikabu profile. Accessed: Sep. 26, 2026. [Online]. Available: https://pikabu.ru/@XCVmind
9. OpenAI, "What to know about the Sora discontinuation," OpenAI Help Center. Accessed: Sep. 26, 2026. [Online]. Available: https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation
10. Google, "Gemini Developer API pricing," Google AI for Developers. Accessed: Sep. 26, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/pricing
11. Google, "Generate videos with Veo 3.1 in Gemini API," Google AI for Developers. Accessed: Sep. 26, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/video
