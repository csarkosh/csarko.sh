---
description: Can 2026 AI video models make a multi-scene short film with the same actor and set in every shot? Where they fail, and the one architecture that holds.
published: 2026-09-16
---
# AI short films: consistent characters and sets

**Question:** how close is AI to generating a multi-scene short film, taking as the benchmark
Evillica's analog-horror YouTube Shorts (a recurring actress, a recurring apartment, 15 to 23
cuts in under 40 seconds)? And are there techniques by which characters and scenes can be
generated *deterministically* and *combined* into a film, so that episode two has the same
person in the same room as episode one?

**Short answer:** for a series, no, and it is a dead end for generation rather than a gap the
next model release closes. A single convincing short is achievable today with a person curating
several takes per shot. But the two things a series depends on, the same actor and the same
location in every shot, are exactly what no 2026 video model can lock: reference images hold a
face "recognisably the same" while costume, props and the room itself drift, and nothing hosted
is repeatable. The only architecture that makes a multi-scene film both consistent and
reproducible builds the character and the set as **3D assets**, renders every shot's structure
conventionally, and uses AI only as a finishing pass. At that point AI is not generating the
film; a 3D production is, with a generative filter on top.

This is a snapshot of the landscape in September 2026. Figures come from vendor documentation,
model cards, papers and practitioner write-ups accessed that month; section 10 lists what could
not be verified against a primary source.

## 0. The answer in six lines

1. The three reference shorts are **live-action**, not AI: one actress, one real apartment,
   practical creatures, a post-production face warp, a VHS grade. The bar is therefore "fake a
   cheap camcorder short with the *same* actor and flat across episodes", which is harder for
   generative video than "make an AI-looking short".
2. Per-shot generation of a *convincing single short* in this look is possible today with a human
   curating 3 to 6 takes per shot, for roughly $40 to $200 hosted or $10 to $25 self-hosted. Keep
   rates are about 25 %; character drift shows after about ten shots; no hosted model repeats a
   clip.
3. **Characters** can be locked "recognisably the same" by reference images (every 2026 model
   has them, about 0.5 face similarity on the one published cross-vendor table) and locked
   *exactly* only by a trained LoRA or by owning the character as a 3D asset. A deliberately
   *wrong* face survives only the latter two: every zero-shot identity mechanism is trained to
   make faces look right.
4. **Scenes** cannot be locked by any video model: reference images condition on appearance, not
   geometry, and the room is re-invented once the camera turns past roughly a quarter turn. The
   door stays put only in a 3D set, a Gaussian splat, or a depth-locked control pass driven by
   one.
5. **Determinism** exists at exactly one place in the whole landscape: a 3D scene rendered with a
   fixed seed. Open-weight diffusion is bit-repeatable under a strict recipe on pinned hardware;
   every hosted API says "seed improves similarity" at best. Hosted models were also *retired*
   three times in 2026 (Sora, Gen-3, Gen-4 Aleph) with weeks of notice.
6. The technique that makes a multi-scene film both deterministic and combinable is to **build
   the character and the set as 3D assets, render every shot's structure in a path tracer such
   as Blender's Cycles, let an open-weight model add photographic surface under depth and identity
   lock, add narration and a single VHS pass last, and treat the episode as a reproducible build
   with a lock file.** Hosted models are inserts, not the spine.

## 1. What the three shorts actually are

| Short | ID | Uploaded | Length | Views | Cuts (ffmpeg scene > 0.3) | Held shots |
|---|---|---|---|---|---|---|
| Stay quiet | [LuiJh6JldaQ](https://www.youtube.com/shorts/LuiJh6JldaQ) | 2025-09-02 | 37 s | 0.53 M | 15 | 7 s, 11 s |
| Guess I didn't close the door tight enough | [WgS4mY1Wzks](https://www.youtube.com/shorts/WgS4mY1Wzks) | 2025-09-10 | 27 s | 0.46 M | 14 | none > 3 s |
| Something's off about Mom | [KzzKsKemFlo](https://www.youtube.com/shorts/KzzKsKemFlo) | 2025-09-15 | 37 s | 1.50 M | 23 | none > 3 s |

Downloaded and stepped frame by frame (608×1080, 30 fps, AV1). What is on screen:

- **One actress** plays the daughter in all three: long dark hair, red and blue plaid flannel over
  a black tee, leopard-print phone case, identical across the three uploads.
- **One real apartment** recurs: galley kitchen with a white fridge, white six-panel doors,
  vertical blinds, grey plank floor, a round table with a cream cloth, a bedroom with grey bedding
  and a mirrored closet.
- **Practical creatures with a post pass**: "Mom" in a red bathrobe with a digitally warped face
  (stretched-open mouth, blank white eyes; a grinning variant through the window); a black
  morph-suit figure with white eyes and teeth under the bed and in the mirror; a rabbit-eared
  silhouette in a doorway. The audience calls the black figure "the black Dorito" across all
  three videos and compliments the "monster costumes".
- **A VHS or camcorder grade** over everything: chroma bleed, scanline shimmer, tracking noise.
- **Burned-in dialogue captions** ("Mom?", "Did you need something, honey?", "You okay?"); "Stay
  quiet" is narrated by a synthetic emergency-alert voice.
- **Coverage**: a static tripod for most shots, occasional handheld, shot/reverse-shot, an average
  shot of 1.5 to 2.5 s, a reveal beat about two-thirds of the way through.

The creator's side confirms it. Evillica is a videographer (182 K YouTube subscribers, 149
videos, 83 M views; 328 K on TikTok) whose two published interviews describe notes, then a
storyboard, then *filming*, then Premiere, After Effects and Photoshop; they cite Henson and Krofft
puppetry and treat AI as "a tool … it should never become the skeleton of the work". No
synthetic-content label appears on any of the three videos; the TikTok "everything is fake"
caption is a fiction disclaimer. The face warp on Mom is the only element that could plausibly be
AI-assisted, and nothing public settles it.

So the question splits:

- **Track A:** can generation reproduce a *live-action-looking* single-actor, single-location
  camcorder short, with the same actor and flat recurring across episodes?
- **Track B:** what do the AI-native creators in the same niche do, and how good is it?

Track B is a known quantity: Angel Engine (58+ parts, generative AI admitted on its Steam page),
content-farm clusters like Dead Signal VHS, viral one-offs like "That's not MOM.." (2.2 M views,
11 s). They change the conventions to dodge the hard parts: no recurring human actor, found-tape
and emergency-broadcast framings that justify stills and text cards, narration over rotating
subjects. YouTube's July 2025 and July 2026 "inauthentic content" rules were written against
exactly that population. The rest of this document is about Track A, because that is where the
engineering problems are.

## 2. What the genre asks of a generator

| Convention | Helps or hurts generation | Why |
|---|---|---|
| Locked-off or barely moving camera | helps | low motion is every model's sweet spot; vendors prompt "camera locked off" to stop drift |
| 1.5 to 2.5 s cuts | helps | far below any clip-length wall; each shot is the best 2 s of a 5 to 10 s generation, head and tail trimmed |
| Whole-frame tape degradation | helps | hides texture shimmer, flicker and plastic skin; a bad take reads as a bad tape |
| Captions instead of audible dialogue | helps | removes lip-sync, the hardest sub-problem |
| One subject per frame, night interiors | helps | single-subject reference lock is the reliable case; low light hides hands and edges |
| Wrongness as the point | helps for the monster, hurts for Mom | a warped stranger is free; the *same* subtly wrong familiar face is the hard case (section 4.4) |
| Same actress, wardrobe and props across 20 cuts and 149 episodes | hurts | reference lock gives "recognisably the same", not the same flannel fold or phone case |
| Same apartment from many angles across episodes | hurts | no vendor sells a location lock; the layout is re-invented per generation (section 5.1) |
| 7 to 11 s held stares that must not morph | hurts | single-shot image-to-video is 8 to 15 s and "breathes" on a static subject |
| Mirror and under-the-bed gags with a practical monster | hurts | reflection logic and occlusion by real furniture are classic failure points |
| Hand-timed knocks and breaths | hurts | every documented workflow still does sound design by hand in the editor |

The economic asymmetry underneath: AI cost is per shot and per reroll; live-action cost is per
setup, and the recurring elements (actress, flat, costume) are free after episode one. A pipeline
that makes the character and the room *assets* rather than *prompts* restores that asymmetry.

## 3. The model landscape, September 2026

A survey of about 25 models against their primary pages and the Artificial Analysis arena found
the familiar picture of "Veo 3 vs Sora 2 vs Kling 2.x" obsolete. Six shifts:

1. **Sora is dead.** The app closed 2026-04-26; the API closes 2026-09-24. Its $1 B Disney deal
   never funded; the $30 M Critterz feature lost its renderer mid-production and missed Cannes.
2. **Chinese models own the top of the arena.** Text-to-video with audio, fetched 2026-09-16:
   Gemini Omni Flash 1233, Wan 3.0 1229, MiniMax H3 Max 1227, MiniMax H3 1220, Seedance 2.0 1210.
   Kling 3.0 is 12th (1095), Veo 3.1 14th (1088). Image-to-video: H3 Max, H3, Omni Flash,
   HiDream-O1-Video, Seedance 2.0.
3. **The 8-second wall is gone at the top.** Wan 3.0 and Seedance 2.5 do 30 s in one pass;
   Kling 3.0, Seedance 2.0, H3, HappyHorse and Grok do 15 s; Veo 3.1 stays at 8 s plus 7 s
   extensions (720p only, up to 20); Omni Flash does 10 s, extending to 40 s.
4. **References and native multi-shot are universal.** Veo 3.1 takes 3 images; Kling Omni 7
   images or 4 plus a video, with voice binding; Seedance 2.0 takes 9 images, 3 videos and 3
   audio clips, Seedance 2.5 takes 30, 10 and 10; Wan 3.0 takes 20 assets including documents;
   MiniMax H3 takes 9, 3 and 3. Kling (6 cuts per 15 s, per-shot framing), Seedance ("Shot 1:/Shot
   2:" prose), H3, Wan 3.0, LTX-2.5 and Omni Flash all cut between shots inside one generation.
5. **Open weights: two real 2026 options plus the Wan 2.2 workhorse.** LTX-2.5 (22B, audio and
   video, native multi-shot, 2026-08-11, free under $10 M ARR, gated download) and MiniMax H3
   (33B, audio, 9-image references, 2026-08-03; the model card routes US, EU, UK and Korean users
   through an application, and secondary sources describe a local-deployment exclusion, so read
   the licence). Wan 2.2 (Apache-2.0, no audio) plus Wan2.2-Animate-2 (2026-08-07) remain
   Alibaba's open ceiling; Wan 2.5, 2.6, 2.7 and 3.0 are API-only despite SEO claims. HappyHorse's
   "fully open" claim has produced no weights. MAGI-2 is Apache-2.0 but needs 8 Hopper GPUs.
6. **Nobody hosted guarantees determinism** (section 6.4).

### 3.1 Condensed table

| Model | Version, date | Clip / extend | Audio | References | Multi-shot in one call | Seed wording | Price | Weights |
|---|---|---|---|---|---|---|---|---|
| Gemini Omni Flash | 1.1, I/O 2026-05-19 | 3 to 10 s, to 40 s | yes | ≤3 subject or video refs | yes, by default | **no seed parameter** | ≈$0.10/s 720p | closed |
| Wan 3.0 | GA 2026-08-24 | **30 s** | yes | 20 assets incl. documents | yes | not documented | $0.05 to $0.20/s | closed |
| MiniMax H3 | 2026-07-31; weights 08-03 | 4 to 15 s | yes, stereo | 9 img + 3 vid + 3 audio | yes | not documented | $0.13/s 2K | **open**, community licence |
| Seedance 2.0 / 2.5 | 2026-02-10 / 2026-07-31 | 4 to 15 s / **4 to 30 s** | yes | 9/3/3, then 30/10/10 | yes, prose-timed | "minor variation may still occur" | $0.06 to $0.30/s by host | closed |
| Kling 3.0 / Omni | Feb 2026; Turbo Jun 2026 | 3 to 15 s | yes (not with video input) | Elements ≤7 images, voice binding | yes, ≤6 structured cuts | not documented | $0.11 to $0.20/s | closed |
| Veo 3.1 (+Fast, Lite) | Jan 2026 Ingredients update | 4/6/8 s + 20×7 s | yes | ≤3 images, first+last frame | no | "doesn't guarantee determinism" | $0.40 / $0.10 / $0.05 per s | closed |
| Runway Gen-4.5 / Aleph 2 | 2025-12-01 / 2026-06-02 | 2 to 10 s / edits 2 to 30 s | no / preserves | Gen-4 References; Aleph 5 keyframes | no | "similar results" | $0.12 / $0.28 per s | closed |
| LTX-2.5 | 2026-08-11 | ~10 to 20 s | yes | first frame, keyframes, IC-LoRA refs | **yes, native** | `--seed`, no guarantee | self-host | **open**, free < $10 M ARR |
| Wan 2.2 (+Animate-2) | 2025; Animate-2 2026-08-07 | ~5 s | no | I2V, VACE control, Animate ref-swap | no | Generator seed | self-host | **Apache-2.0** |
| HunyuanVideo 1.5 | 2025-11-20 | ~5 s | no | I2V | no | seed | self-host, 14 GB | Apache-2.0 |
| Luma Ray3.2 | 2026-06-09 | ≤20 s Modify | yes | 16 keyframes, character ref | no | not documented | credits | closed |
| Grok Imagine 1.5 | GA 2026-06-16 | 6 to 15 s | yes | 7 refs + voice | no | not documented | ~$0.10/s | closed |
| Sora 2 | shutting down | 4 to 12 s | yes | first frame; cameos gone | no | none | n/a | closed |

Prices differ by host.

### 3.2 Failure modes that persist (vendor-admitted)

Consistency through edits and extensions ("maintaining complete consistency throughout edits …
remains a challenge", Google's Omni model card); complex motion; garbled text (composite title
cards and VHS timestamps in post, never generate them); ignored negative constraints (a hand
appears when forbidden); hands, faces and physics, still scored dimensions on VBench-2.0 because
they fail; morphing on held shots (practitioner consensus, not quantified); audio caveats (Kling:
no native audio with video input); prose-timed cuts on Seedance; extension only at 720p on Veo;
and non-determinism everywhere hosted.

## 4. Characters: deterministic identity across shots

### 4.1 The determinism ladder

| Tier | What "the same character" means | Repeatable? |
|---|---|---|
| Text prompt + character bible | a similar person | no |
| Reference images per call (all 2026 models) | recognisably the same person, ~0.5 face similarity; wardrobe and props drift | no (hosted) |
| Reference video or multi-angle Elements | same person, gait, voice | no (hosted) |
| Zero-shot identity adapter on open weights | same ArcFace identity, normalised toward a correct face | seed-repeatable |
| Trained LoRA on open weights | the face *as trained*, including defects | seed-repeatable |
| 3D asset rendered in Cycles | the mesh, any angle, any light, any expression | **bit-exact** |

### 4.2 Reference conditioning in video models

Every hosted model now has a reference slot: Runway one image; Hailuo one; Luma one plus 10 s of
video; Veo three; Vidu seven; Kling O1 seven images, or multi-angle Elements of 2 to 4 images plus
a 3 to 8 s video that also captures voice; Seedance and H3 mixed media. All vendors say
"consistent"; none publishes a face-similarity number. The one cross-vendor table (HunyuanCustom,
2025) puts hosted models at 0.42 to 0.53 face similarity, i.e. the same person, far from
copy-paste. Hailuo's launch note admits "environmental morphing"; OpenAI's cookbook warned "small
changes in phrasing can alter identity". An 8-week, 300-clip Seedance 2.0 production test calls
multi-shot character consistency "reliable, not 100 % of the time". The 2026 practitioner finding
is sharper: **faces mostly hold; costume, hairline, props, gait and palette do not** ("the face
passed every review; the costume failed eleven of twenty-four"), and drift becomes perceptible
after about ten shots.

### 4.3 Training the character (LoRA)

Tools: ai-toolkit (MIT) and musubi-tuner (Apache) cover FLUX.2, Qwen-Image, Wan 2.2, LTX-2.x and
MiniMax H3 on a 24 GB card; Lightricks ships `ltx-trainer` for LoRA and IC-LoRA. The recipe
practitioners converge on for Wan 2.2: 5 to 100 captioned images or ~2 s clips, rank 32 and alpha
16, learning rate 2e-4, flow shift 2 to 3 for tight identity, latents cached first. Hosted: fal
charges $4 per 1,000 steps for a Wan 2.2 14B LoRA and $2 per FLUX run with commercial rights.
Roughly 1 to 3 h on one H100 (a recalled figure). Licence-safe bases: Wan 2.2, Qwen-Image-Edit-2511
and FLUX.2-klein-4B (Apache); FLUX.1 and FLUX.2 dev and klein-9B are non-commercial; HunyuanVideo
excludes the EU, UK and Korea; Krea Realtime is CC BY-NC-SA. A LoRA also learns the dataset's
lighting and lens unless the set is varied, which for a rendered character is a feature: render
under a dozen HDRIs and focal lengths and train on that.

### 4.4 Zero-shot adapters and the "wrong face" problem

For stills: PuLID-FLUX, InfiniteYou (model CC BY-NC), DreamO, OmniGen2, and the older InstantID
and PhotoMaker line. For video on Wan 2.1 and 2.2 (Apache): Phantom, SkyReels-A2, MAGREF (ICLR
2026), Stand-In (153 M parameters, composes with VACE and LoRAs, V2 announced 2026-08-10), VACE,
Wan2.2-Animate and Animate-2, InfiniteTalk, MultiTalk. HunyuanCustom has the best published face
similarity (0.627) under the territory-limited Tencent licence.

All of these are supervised by an ArcFace-style embedding and increasingly by human-preference
rewards (Identity-GRPO, Avatar V). ArcFace encodes *who* and discards *what is off about the
face*; the diffusion prior then regresses toward an average, symmetric, attractive face. The
WithAnyone paper names the complementary failure: adapters "copy-paste" the reference pixels and
fail under new pose, expression and lighting. Large yaw in close-up remains the documented weak
spot (FaithfulFaces, MoFE). **The consequence for horror:** eye spacing normalises, the asymmetric
smile symmetrises, the dead eyes get a catch-light. The only generative object that can *learn* a
defect as identity is a LoRA trained on images that contain it; the only thing that reproduces it
exactly is a mesh.

### 4.5 Character sheets and keyframes

The workflow every vendor recommends, including Google's own Veo 3.1 guide: a canonical sheet,
then a per-shot keyframe made by editing, then image-to-video from the keyframe. Editors: Nano
Banana Pro (14 references, 5 people, SynthID on every output), FLUX.2 (10 references; dev
non-commercial, klein-4B Apache), Qwen-Image-Edit-2511 (Apache, seedable), GPT-image-1.5
(`input_fidelity: high`; the cookbook says to repeat "do not change her face" in every call
because drift occurs without repeated constraints), Seedream 4.5, Midjourney `--oref` ("does not
promise exact copying"). All of them beautify; the defect must be spelled out every time.

### 4.6 3D-first: build once, render exactly, then use the render

Build the character as a rigged, photoreal 3D asset (body, blendshape face, strand hair, skeleton)
and render it in Cycles. The render can then feed a generative model in three ways.

- **(a) The render as the image-to-video first frame.** Works with every model in section 3. Frame
  0 is pixel-exact; identity decays at the model's native rate, slowly for a locked-off close-up,
  fast for a head turn (the model invents the unseen side from its prior). Give both ends where the
  model allows (Veo first+last, Luma keyframes, LTX multi-anchor), rendered from the same head.
- **(b) The render as a control signal.** Wan 2.1 and 2.2 VACE take a reference image plus a
  depth, pose or edge control video plus masks (Apache; 1.3B at 480p, 14B at 720p); LTX-2.3 and
  2.5 IC-LoRA Union does depth, canny and pose in one adapter. Stand-In composes with VACE, so a
  frontal reference and a pose track ride together. Blender bridges exist: Pallaidium (GPL-3; a
  depth pass output added 2026-07-10, FLUX.2 klein multi-reference, LTX-2.3 IC-LoRA, ComfyUI and
  fal remote backends), ComfyUI-BlenderAI-node, the older controlnet-render addon. Geometry,
  camera and timing are then exact; the face is whatever the reference plus LoRA make it.
- **(c) Video-to-video restyle of the render.** Runway Aleph 2 ($0.28/s; its own editing guide now
  steers away from new angles); Luma Ray3 Modify with an "Adhere" strength that retextures and
  relights while keeping edges (the closest hosted thing to a deterministic render pass); Krea
  Realtime 14B (non-commercial); Wan2.2-Animate-2 replacement mode (put the character into a
  driving video and match its lighting); LTX IC-LoRA. **RealMaster** (arXiv 2603.23462, March
  2026) is the proof of concept: GTA V engine renders lifted to photoreal video "preserving the
  geometry, dynamics and identity specified by the original 3D control", distilled into an
  IC-LoRA that needs no anchors at inference. "Goodbye Drift" (arXiv 2605.20476) shows
  control-conditioned video-to-video holding for 40+ minutes when generated sparse-to-dense from
  anchors.

What survives: geometry, camera and timing survive (b) and (c)-Adhere almost completely; lighting
survives Adhere; identity survives only as well as the identity conditioning you add; the
wrongness survives only if it is in the LoRA or the restyle strength is low enough that the render
dominates. A licence note: MetaHuman content "cannot be used to train or enhance AI models", which
forbids training a LoRA on renders of a MetaHuman head; MakeHuman/MPFB and ICT FaceKit carry no
such clause (ICT's exact text unverified). TRELLIS.2 is MIT but has no human-specific path.

### 4.7 Dialogue on a held close-up, ranked by identity safety

1. Animate the 3D head from audio with **NVIDIA Audio2Face-3D** (open-sourced September 2025; SDK
   MIT, models under the NVIDIA Open Model Licence; ARKit-style blendshape output; Maya and Unreal
   plugins but no Blender plugin, so a small importer onto the head's shape keys is needed) or with
   iPhone ARKit capture, then render. Zero drift by construction.
2. Relip the render: **LatentSync 1.6** (Apache, a 512² mouth region, keeps everything outside the
   mouth) or **InfiniteTalk** (Apache, Wan 2.1, unlimited length; the FusionX speed LoRA reduces
   identity). LongCat-Video-Avatar-1.5 (MIT, 2026-05-21) is the newer open option.
3. Hosted single-image talkers for medium shots: Hedra Character-3 (6.25 ¢/s at 1080p, "character
   angle libraries" recommended), OmniHuman-1.5 (16 ¢/s).
4. Native dialogue in the video model (Veo, Kling, Seedance): the least controllable identity;
   dialogue realism degrades after about 8 s per clip and profile shots are problematic.

The genre's convention is captions, not audible lines, which removes most of this.

### 4.8 Measuring identity instead of eyeballing it

- **ArcFace or AdaFace cosine similarity** (insightface `buffalo_l`) between each generated frame
  and a canonical render set. Published operating points run from 0.33 to 0.82 depending on the
  false-accept rate; a recent ICLR paper treats < 0.3 as a different person and ≥ 0.5 as the same
  person with variation; thresholds are dataset-dependent and must be calibrated.
- **VBench "subject consistency"**: DINO feature similarity first-frame-to-frame and
  frame-to-frame. DINO sees within-class change; CLIP does not.
- **A proposed gate:** about 50 Cycles renders of the character (yaw ±60°, pitch ±20°, 6 HDRIs, 5
  expressions); set the shot gate at the 5th percentile of the within-set ArcFace distribution
  (expect about 0.55 to 0.65 frontal); require DINO frame-to-frame similarity at least equal to
  the raw playblast's. ArcFace is blind to an authored defect by design, so pair it with a
  landmark-ratio check (eye spacing, mouth width, asymmetry, from MediaPipe or the mesh topology)
  that measures the specific wrongness.

### 4.9 Ranking for "the same wrong face on demand"

1. Author the wrongness in the 3D head and render in Cycles. Deterministic at any angle, light
   and expression; dialogue via Audio2Face-3D or ARKit. The raw render is *already* uncanny in the
   way analog horror wants (perfect skin, too-still eyes), so the AI pass may be optional.
2. Train a character LoRA on those renders (Wan 2.2 14B via musubi-tuner or fal; Qwen-Image-Edit
   or FLUX.2-klein-4B for stills; all Apache) with a caption token naming the defect. Use it for
   photoreal keyframes at low denoise, inside VACE and Stand-In for restyled shots, and inside
   LatentSync or InfiniteTalk for dialogue.
3. Image-to-video from a rendered first (and last) frame with minimal camera motion; gate with
   ArcFace-to-render plus the landmark check; record every seed and weight hash.
4. Hosted multi-reference (Kling Elements from four rendered angles plus a voice element; Veo
   ingredients from Nano Banana keyframes) for establishing and medium shots where the face is
   small and the wrongness is carried by posture and framing.

Routes 1 to 3 give a repeatable wrong face today. Route 4 gives a repeatable *normal* face and
will silently fix the wrongness in close-up. Nothing on the market lets you upload a defect and
have it respected without training.

## 5. Scenes: deterministic locations across shots

### 5.1 Nothing in the video-model camp keeps the door where it was

Veo Ingredients, Runway References, Kling Elements (scenes are a first-class element type) and the
rest condition on an *image of the room*, not on its geometry. They keep the look, palette and
rough furniture set; they do not carry a floor plan. The cleanest negative evidence is from
real-estate staging (Inman, April 2026): tools that treat each photo in isolation "place
different furniture in different locations across the photos … no memory of layout". VideoGPA
(ICML 2026) states the mechanism: denoising objectives "lack explicit incentives for geometric
coherence". No vendor publishes a rotation budget; the practitioner rule is that the visible half
of a room holds for pans of about 30° to 45° from one reference, and beyond that each generation
invents the other half differently.

The strongest video-model-only primitives:

- **First + last frame** between two *known* views (Wan 2.1 FLF2V-14B, Apache; Veo 3.1; Kling
  start/end; Wan 2.7). Both endpoints are fixed, so the door is where you put it at both ends;
  hold focal length, angle, distance and key-light direction constant, or the model "commits to an
  interpolation path early" and artefacts mid-clip. If the endpoints are renders of one 3D set,
  the middle is usually plausible because it *is* a real camera move.
- **Kling 3.0 Omni multi-shot**: up to six cuts inside one 15 s generation share one latent, which
  is where the location is most likely to stay coherent; no control over where the cuts land.
- **Extend** modes condition on the tail of the previous clip and hold the room only while the
  view overlaps; not a way to get a reverse angle.
- **Reference propagation**: the last clean frame of clip N as the reference for clip N+1.

### 5.2 Generated 3D worlds are now real assets

| Tool | Output | Free camera | Blender | Licence | Notes |
|---|---|---|---|---|---|
| World Labs Marble (GA 2025-11-12) | Gaussian splats (.ply/.spz), collider and high-quality GLB meshes | yes | yes | tiers to a $95/mo Max plan with commercial rights; HQ mesh on Pro | **Chisel** lets you block out walls and have the model dress them, the closest generative-3D thing to "the door is where I put it"; weak on thin, transparent and reflective structure |
| HY-World 2.0 (Tencent, 2026-04-16) | 3DGS, meshes, point clouds; navigation with collision | yes | yes | community licence: **excludes the EU, UK and Korea**, 1 M MAU cap | indoor support not called out explicitly |
| HunyuanWorld 1.0 / Voyager | layered textured mesh from a panorama / RGB-D video + point cloud | near origin / trajectory | yes | same licence | Voyager needs 60 to 80 GB |
| Matrix-3D (Skywork) | panorama to 3DGS | yes | yes | MIT | ~1 h per 720p on an A800; outdoor examples |
| NVIDIA Lyra 2.0 (2026-04-15) | explorable 3DGS from an image or video | yes | yes | code Apache; per-model weights licences | |
| Genie 3 / Project Genie | 60-second, non-saveable, non-exportable sessions (US, Ultra) | in-session | **no** | n/a | a video you cannot re-enter; not a set |
| Infinigen Indoors (Princeton) | whole houses as `.blend` with depth, normal and segmentation passes; constraint-solved layouts | yes | **native** | BSD-3 | procedural, seed-driven, CUDA; a natural fit for a Blender pipeline |
| Real-room capture (Postshot, Polycam) | splats from ~200 phone photos per room | yes | via the KIRI 3DGS addon (GPL-2) | none | the most photoreal deterministic set; lighting is baked, so night needs a night capture or a relight |

Generation is not repeatable; the exported file is. Generate once, commit the file with a hash,
and never regenerate it: the same discipline as a package lock file.

### 5.3 3D-first plus AI

Build the set (Infinigen, hand-dressed, Marble, or a capture), place the camera and character,
render beauty, Z, normal and segmentation passes in Cycles, then:

- **Image-to-video from the rendered first frame**: the layout is exact at frame 0 and decays with
  camera motion; enough for the tripod shots that are most of this genre; first+last frame from
  two renders is the upgrade.
- **Depth-locked control** (Wan 2.2 VACE; LTX-2.3 and 2.5 IC-LoRA Union): the silhouette and depth
  ordering of every wall, door and prop is pinned per frame, so the door cannot move because its
  depth edge is in the control video. The RunComfy "Blender → ComfyUI AI Renderer 2.0" workflow is
  exactly this; its rules: identical aspect ratio and fps between Blender and the graph, 4n+1
  frame counts, recheck the first and last 10 frames.
- **Restyle** (Luma "adhere", Aleph 2, Krea Realtime, Decart Lucy): structure approximately kept;
  the live restylers drift over long runs.
- **Per-frame enhancers** (Magnific, Krea) flicker on sequences; use a temporal upscaler (Topaz,
  SeedVR2) for video and per-frame enhancers for keyframes only.

Camera-control re-shoot models (GEN3C with an explicit 3D cache, NVIDIA OML; Uni3C, Apache;
TrajectoryCrafter; ReCamMaster, MIT but documented to break across occlusions; Stable Virtual
Camera, non-commercial; CameraAnything, July 2026) re-render a *video* from a new camera and
hallucinate what the source never saw. They are redundant when you own the set: Blender is the
camera-control model. They earn their place for re-shooting a hosted clip you like.

### 5.4 Lighting continuity

Trivial in 3D: one light rig, with the lamp keyframed per time of night. Splat sets have baked
illumination. AI relighters: IC-Light V2 weights were never released and are non-commercial;
Light-A-Video (Apache, Wan 2.1 backbone) and NVIDIA DiffusionRenderer (G-buffers from a splat or
real video, then relit under a new HDR map; ~2.4 s clips) are the usable video relighters; the
practical route without a set is to relight the keyframe and generate video from it. LTX-2.5 has
a Relight IC-LoRA in beta.

### 5.5 The VHS layer goes last, once, over the whole cut

**ntsc-rs** (open source; an OpenFX, After Effects, Premiere and Resolve plugin plus a standalone
app) simulates the actual NTSC and VHS signal path. Apply it after generation and any upscale, as
one parametric operator over the finished cut, because it (a) collapses the different "film
stocks" that different generators, seeds and even clips of one generator produce below the tape's
noise floor; (b) low-passes exactly the high-frequency texture shimmer where AI video flickers
most; (c) turns clip joins and restyle-strength changes into tape dropouts and tracking errors,
the genre's own vocabulary; and (d) is deterministic, so a regenerated upstream shot never needs
the grade re-approved. Prompting "VHS look" into each generation gives each clip its own invented
VHS, another axis of inconsistency. Put on-screen timecode *before* the tape emulation so it
degrades with the picture.

### 5.6 Where the ceiling sits

| Approach | Door stays put? | Rerun = same? | Lighting continuity | Licence risk |
|---|---|---|---|---|
| Video model + reference image | while the view overlaps; not on a reverse angle | no (hosted) | prompt-level | vendor ToS |
| First+last frame from two known views | at both ends, plausible between | seed-locked on open Wan | inherited | Apache |
| Kling Omni multi-shot | within one 15 s generation | no | within the generation | vendor ToS |
| 360° panorama + crops | rotation yes, translation no | file | one state per pano | image ToS |
| Generated 3D world (Marble, HY-World, Matrix-3D, Lyra) | **yes** | file frozen; regeneration not repeatable | baked or Blender-lit | Marble Max; Tencent territory |
| Real-room splat | **yes** | file | baked | none |
| Procedural or hand-built Blender set | **yes, by construction** | **bit-exact, fixed Cycles seed** | **by construction** | BSD-3 / none |
| Blender set + depth-locked AI pass | **yes** (depth edges pinned) | seed-locked, with PyTorch caveats | render-lit, model-mooded | Apache / LTX |
| Camera-control re-shoot | moderate moves; hallucinates the unseen | seed-locked open | inherited | Apache / OML / MIT |

## 6. Combining them into a multi-scene film

### 6.1 Three architectures

**A. Per-shot hosted generation with a reference kit** (what the AI-native niche does). Script
beats, then a Nano Banana character sheet and location keyframes, then image-to-video per shot on
Kling, Veo or Seedance with the sheet as an ingredient, motion-only prompts, the camera locked
off, two variations per shot, 10 to 15 frames trimmed from each end; then ElevenLabs or captions;
then CapCut with a VHS overlay stack. Consistency is probabilistic and non-reproducible; drift
shows after about ten shots; the practitioners' fix is a *frozen* reference kit ("the moment you
'improve' the hero shot in week two, every earlier shot becomes inconsistent") plus a per-shot
checklist and last-frame chaining.

**B. Native multi-shot in one call.** Kling Omni (six structured cuts), Seedance 2.5 (30 s, 50
references, scene-level prose), Wan 3.0 (30 s), LTX-2.5 (native multi-shot, open), Omni Flash
(conversational edits). For a 30 to 60 s Short this is 2 to 4 calls instead of 8 to 12, and
continuity only has to survive across those seams. Timing control is prose on Seedance and
structured on Kling; no public benchmark isolates cross-shot identity.

**C. The 3D-first film build.** Character and set are assets; every shot's blocking, camera,
lens, lighting and hold time are keyframes; Cycles renders beauty and passes with a fixed seed; an
open-weight pass adds photographic surface under depth and identity lock; the edit, captions and
VHS grade are deterministic post. Only the surface is stochastic, and with pinned open weights
and a seed even that repeats. This is also what Autodesk Flow Studio's 3D Editor and Canvas
(August 2026) productise: 3D for "performance, staging, composition and camera movement",
generative models for "lighting integration, atmosphere … and cinematic finishing".

### 6.2 Where each architecture breaks

| | A: per-shot hosted | B: native multi-shot | C: 3D-first build |
|---|---|---|---|
| Same face across 20 cuts | ~0.5 face similarity, drift after ~10 shots | better within a call, seams between calls | exact |
| Same room across angles | no | within a call only | exact |
| Held 8 to 11 s stare | at the clip wall; morphs | 15 to 30 s clips now exist; unstudied | exact structure; the surface pass is the only risk |
| Exact blocking and hold time | the prompt is a request | structured on Kling only | keyframes |
| Reshoot one shot without touching the rest | no (re-match everything) | no | yes |
| Model retirement | you lose the show | you lose the show | structure is model-agnostic |
| Photoreal texture | best | best | depends on the surface pass |
| Up-front effort | hours | hours | days |

### 6.3 Audio, captions, assembly

Narration is safer as a separate voice track than as generated dialogue; the genre's captions
remove lip-sync entirely. Native audio in the video models (Veo, Kling, Seedance, H3, LTX-2.5,
Vidu) is a scratch track: keep it for Foley timing, and replace narration and music with locked
assets, because it is tuned for dialogue, not for a knock three frames before a cut. Text on
screen must be composited, never generated.

| Stage | Options | Seed / determinism |
|---|---|---|
| Narration | ElevenLabs v3 (`seed`, "best effort … not guaranteed"); Chatterbox (MIT, local, ~10 s clone, watermarked); Kokoro (Apache, no cloning); OpenAI and Gemini TTS | ElevenLabs best-effort; OpenAI and Gemini expose no seed; local voices are cheap enough to pin by cached WAV |
| Sound effects | ElevenLabs SFX v2 ($0.0194 per effect, loops); HunyuanVideo-Foley (open, ComfyUI nodes); MMAudio (MIT code, CC-BY-NC weights) | none documented; pin by hash |
| Music | Eleven Music (commercially cleared); Lyria 3.5 ($0.08 per song, SynthID, no seed); Suno and Udio have no official API; **ACE-Step v1.5** (Apache, seeded, ComfyUI node, 1 min in under 2 s on a 4090) | ACE-Step is the only seedable music |
| Lip-sync on camera | sync lipsync-2 via fal; LatentSync, MuseTalk, InfiniteTalk open; Wan2.2-Animate-2 is motion-driven, not audio-driven | the cheap answer: narrator off camera, mouths degraded by the VHS pass |
| Captions | force-align the *known script* with WhisperX (BSD-2) rather than transcribe; burn in via Remotion caption components or an ffmpeg ASS file | deterministic given pinned models |
| Timeline | ffmpeg with `-fflags +bitexact -flags +bitexact` ("file and data checksums are reproducible and match between platforms"); Remotion (frames are required to be pure functions of frame number); Blender VSE (the `swimlane` project compiles a JSON timeline into VSE); OpenTimelineIO as the interchange artefact for a human NLE | deterministic with a pinned build |
| Loudness, delivery | two-pass `loudnorm` with measured values and `linear=true`; 9:16 1080×1920 | deterministic |

No commercial product accepts a JSON shot list end to end. Descript's API takes only a
natural-language prompt and publishes to a web link; Eddie for Agents offers CLI, SDK and MCP
operations over real footage; Runway's agent runs Workflows from chat over MCP; CapCut is
driveable only through an unofficial draft-file MCP; LTX Studio, Flow, Higgsfield, Hailuo Agent
and Vidu Agent are UI-first. Google Flow deletes generated videos from the server after two days;
Sora had an export deadline. **The assembly layer must be self-built, and hosted output archived
on receipt.** The VHS pass goes last (section 5.5).

### 6.4 Determinism end to end

Bit-repeatability exists only self-hosted: `torch.Generator(device="cpu")` even on GPU,
`CUBLAS_WORKSPACE_CONFIG=":16:8"`, `cudnn.benchmark=False`,
`torch.use_deterministic_algorithms(True)`, a pinned GPU SKU, driver, CUDA, PyTorch and attention
kernel (an H100 run will not bit-match a B200), and a fixed scheduler and step count; MAGI-2 ships
a `--deterministic` flag. Diffusers' own guide: results are not guaranteed "across PyTorch
releases, individual commits, or different platforms". Hosted: Veo's seed "doesn't guarantee
determinism, but slightly improves it"; Runway's gives "similar results"; Seedance's "minor
variation may still occur"; Omni Flash and Sora expose no seed; fxguide (August 2026) documents
cloud models changing output under identical input and seed without changelogs.

A reproducible episode borrows the shape of a package manager: a manifest, a lock file and a
build script.

```
film/<slug>/
  film.json        # source of truth: cast (character id → asset hashes), locations (set hashes),
                   # shots[] {id, duration, framing, camera, light state, action, dialogue, sfx[],
                   #          surface model, params, seed}, audio {narration, music, sfx}, edit,
                   #          degrade preset, loudness target
  film.lock.json   # per stage: inputs-hash → {provider, model version, request, seed, output sha256,
                   #          cost, time, accepted_by: auto|human, qc scores of accepted and rejected takes}
  build/           # content-addressed artefacts, git-ignored or LFS
```

Rules that make it reproducible in practice, each grounded in a published half-example:

1. **Every stage is keyed by a hash of its inputs** (prompt, params, seed, upstream artefact
   hashes, model ID and version string). A rebuild reuses the cached artefact when the key
   matches; this is the only way a hosted, non-deterministic stage becomes "reproducible".
   ftl-studio (MIT; Veo 3.1, Gemini and Claude) frames its `plan.json` as "a reproducible recipe"
   while admitting the APIs expose no seed.
2. **Human acceptance is recorded in the lock**, not in chat: which candidate was chosen, and the
   QC scores of the rejected siblings. ftl-studio's `qc.json` scores identity, wardrobe, set match
   and manifest compliance from 0 to 100 with a vision model before any video spend; ViStoryBench
   and MSVBench publish open scorers for character consistency, style, prompt alignment and
   copy-paste artefacts.
3. **Generate the establishing shot first** and reference it everywhere: GroundShot (2026) finds
   "the visual quality of this initial appearance sets the consistency ceiling for all that
   follows".
4. **Prefer local, seeded models for anything iterated on** (sheets, plates, degrade, music) and
   pin hosted hero shots by hash. The published Krea-2 multi-shot node uses `seed + N - 1` per
   shot, the cleanest example of per-shot seed discipline.
5. **Emit the edit as `.otio` plus a Remotion or ffmpeg render script**, both derived from
   `film.json`; render under `bitexact` with a pinned ffmpeg.

No public project implements the lock-file half; the "video as code" repositories are declarative
timelines without generation provenance.

### 6.5 Assembly frameworks and agentic pipelines

**Native multi-shot in one call** (the strongest inter-shot consistency available without 3D):

| Model | Shots per call | Length | Per-shot control | Open? |
|---|---|---|---|---|
| Kling 3.0 / Omni | ≤6 cuts | 3 to 15 s | `multi_prompt` list, `shot_type` customize or intelligent, Elements; **no seed field** on the fal schema | no |
| Seedance 2.0 / 2.5 | `Shot N:` labels | 15 s / 30 s + extensions | text per shot; seed "not a hard lock"; live studio cease-and-desists | no |
| MiniMax H3 | `[Shot 1]` with `at 00:04.500` timing | 4 to 15 s | text with timestamps; ≤9 image refs | **yes** (community licence) |
| LTX-2.5 | "several consecutive shots in a single generation" | 6 to 20 s | prompt-described; exact syntax unverified | **yes** (< $10 M ARR) |
| HoloCine (CVPR 2026) | 5 to 6 shots | 5 to 15 s | one caption per shot, a global caption, seed | weights yes, **CC BY-NC-SA** |
| Vidu Q3 | multi-shot with camera control | ≤16 s | stated | no |
| Veo 3.1 | none; extend 20× to 148 s at 720p | 4/6/8 s | per-generation prompt | no |
| MAGI-1.1 (Apache) | chunk-wise prompts, continuous take | long | per 24-frame chunk | yes; 24B needs 4 to 8 H100s |

A 45 s Short is 3 to 4 multi-shot calls or 6 to 12 single-shot calls. Multi-shot buys consistency
inside each call and pushes the problem to the seams, where a locked sheet, a locked plate and the
establishing-shot-first rule matter. It also fights a 3D lock, because it decides framing for you;
use it only where the shot list says "montage".

**Agentic and open frameworks**, by how usable they are today:

- **Runnable and relevant:** Wan2.2-Animate-2 (Apache, driving video plus reference character),
  the bridge from a Blender playblast to a photoreal shot without regenerating identity; the
  RunComfy Qwen-Image-Edit + Wan 2.2 "cinematic coherence" graph; ComfyUI-Wan-VACE-Prep for
  transitions and extensions; MoneyPrinterTurbo (124 k stars, MIT: LLM script, TTS, clips, burned
  subtitles, ffmpeg, 9:16, API, CLI and agent modes) as the Shorts half minus the locks; Vanta (MIT:
  a JSON timeline rendered by Remotion, WhisperX captions, Wan 2.2 and LTX, ACE-Step, LatentSync,
  licence-audited); OpenCut (MIT, a TypeScript timeline to MP4); Nomi (AGPL, 514 stars: storyboard,
  references, generation, then an "editable first cut on a real timeline"; 23 MCP tools so a coding
  agent can drive it; local ComfyUI as one of about 12 providers; no seeds, no audio stages, no
  documented project format).
- **Closest to the 3D-first build:** FilmAgent (a Unity sandbox with 15 locations, 272 camera
  shots and 21 Mixamo actions; LLM director, screenwriter, actor and cinematographer roles; a
  deterministic 3D render) and Cutscene Agent (arXiv 2604.25318, MCP-driven engine agents producing
  editable engine-native cinematic assets). These are the "shot list, then 3D scene, then render"
  pattern in a game engine.
- **Research, not yet runnable:** STAGE (a structural storyboard of start and end frame pairs per
  shot plus a multi-shot memory pack), GroundShot (training-free, model-agnostic entity memory;
  its method is usable by hand), ViMax, Captain Cinema (keyframe planning plus interleaved
  synthesis, 1,000 s films, no code), and MSVBench's finding that current systems are "visual
  interpolators rather than true world models".
- **Historical:** MovieAgent (a stale SVD stack), StoryAgent, Anim-Director, VideoGen-of-Thought,
  DreamFactory and Mora, superseded by native multi-shot models.

**Reference pipelines published in 2026** with code: ftl-studio (one sentence to a directed
multi-shot film on Veo 3.1; canon stills approved once, every frame composited from them and
chained to the previous frame; vision-judge QC before video spend; an ffmpeg finish with a
unified grade, grain, crossfades and loudness; no narration; about $6 per 64 s pass on Veo Fast);
Krea-2 multi-shot stills with an identity LoRA into LTX Director (seeded stills, hosted video);
MoneyPrinterTurbo plus Vanta (fully local possible, the highest determinism, the lowest craft). No
verifiable write-up of an AI analog-horror pipeline specifically could be found.

## 7. Readiness verdict and cost

### 7.1 What has been made

Festival tier: the Runway AIFF 2026 Grand Prix winner "A Face Only A Mother Could Love" is 7:50;
winners run 3.5 to 11.6 min; the festival requires generative video but no minimum AI percentage;
process is rarely disclosed. Studio tier: Netflix's one generative AI shot in *El Eternauta*;
Amazon's *House of David* with 72 of 850 VFX shots AI in season 1 and 350 to 400 in season 2,
plates and inserts, never a recurring AI character. The only place AI narrative is mass-produced
is China: 470 AI dramas per day, RMB 500 to 1,000 per finished minute (about $30), 10-person teams
doing 30 episodes in 20 days, a 0.117 % breakout rate, the lowest willingness to pay of any AI
format, and the top revenue still with human-acted titles. Creator tier: production logs from a
vendor's own agent show a 3-minute episode at 164 generations, 41 kept (25 %), 17 of the 41 final
shots stitched from two or more takes, 2 people, 2 days, about $950; a 90 s horror short at about
400 generations, 2 days, $870.

### 7.2 Residual gaps

A keep rate of about 25 % (3 generations per usable shot, some 8+); identity drift perceptible
after about ten shots, mostly in costume, hairline, props, gait and palette rather than the face;
dialogue realism that degrades after about 8 s per clip, and poor "quiet, layered" emotion;
extension chains that accumulate colour and identity walk; references that bias but do not
constrain; blocking and camera direction that obey prompts loosely (the reason 3D-first hybrids
appeared); and nothing repeatable. In one line: **faces are mostly solved, everything around the
face is not, and nothing hosted is repeatable.**

### 7.3 Cost for a 45-second, 8 to 18 shot vertical short

| Route | Cash per episode | Human hours (first / later) | Repeatable? | Platform risk |
|---|---|---|---|---|
| (a) hosted with a reference kit | $40 to $200 (Seedance or Omni at 3× rerolls to Veo Standard at 6×; plus $50 to $80/mo of subscriptions) | 6 to 10 / 3 to 5 | no | high: Sora, Gen-3 and Gen-4 Aleph retired in 2026 |
| (b) open weights on a rented H100 ($2 to $3.5/h) | $10 to $25 including a character LoRA | 8 to 16 / 3 to 6 | yes, with pinned weights, seed and GPU | low; licence caveats (Hunyuan territory, LTX $10 M, H3 application) |
| (c) 3D render, then open-weight restyle | $5 to $40 after the build | 8 to 24 / 2 to 4, once a character rig and set exist | structure yes; surface yes if (b) | low |

An independent estimate for an Evillica-shaped short (18 shots, 4 rerolls each, about 400
generated seconds) agrees: about $37 to $46 on Kling 3.0 at 1080p, $48 on Veo 3.1 Fast, $20 on
Veo Lite, $160 on Veo Standard, and half a day to a day of solo work.

### 7.4 Trend line and forecast

In twelve months: native clips went from 8 s to 15 s to 30 s, with a 3-minute beta; native audio
everywhere; references from 3 to 50; multi-shot storyboards; conversational editing; prices down
3 to 5× per second at equal or better quality (while Sora ran at about $1 M a day against $2.1 M
of lifetime revenue); MiniMax H3 the only open model in the arena's top 15. No Veo 4, Sora 3,
Gen-5 or Seedance 3 has been announced. The frontier moved from "better clips" to
*directability*, which is the right direction for a series.

A sober forecast:

- A human-curated 45 s analog-horror Short with a consistent character and room: **now** (an
  afternoon, $40 to $200, keeping 1 take in 4). Analog horror is the most forgiving genre for these
  defects.
- Agent-curated end to end, publishable most of the time: **6 to 18 months**; the remaining work
  is the judgment (which take, where to cut, when drift is a feature) that a 25 % keep rate says
  models cannot yet self-assess.
- A human-curated 3 to 10 minute dialogue short: **now**, at 1 to 3 people for 1 to 3 weeks, with
  heavy stitching.
- An automated 10-minute dialogue short with subtle performance and 100-shot continuity: **2 to 4
  years**. Of its two blockers, only reproducibility has a known engineering path (open weights,
  a LoRA and 3D structure); performance does not.

## 8. Why it is a dead end for generation

The question was whether AI can generate a film like these. For a one-off, the answer in section
7.4 is yes, with a person curating. For a *series*, which is what makes a channel like Evillica's
work, it is no, and the reason is structural rather than a matter of model quality:

- The recurring actress and the recurring apartment are the two things that make live action
  cheap after episode one, and they are the two things no generative video model can lock.
  References improve "recognisably the same"; they do not produce "the same".
- Every hosted route is non-repeatable and exposed to model retirement, so a show built on one
  cannot reshoot a scene next month, let alone next year.
- Everything that does lock identity and layout moves the work *out* of generation: a trained LoRA
  needs a consistent source to train on, and a depth-locked pass needs a 3D set to render from.
  Follow that to the end and the film is a conventional 3D production with a generative surface
  pass, which is architecture C. It can be a good way to make a film, but it is not AI generating
  one, and its up-front cost is building the character and the set.

### 8.1 What a 3D-first episode build would contain

For anyone who does take architecture C, these are the stages it needs.

| Stage | What it produces |
|---|---|
| character | a rigged photoreal head and body, hair, and ARKit-compatible blendshapes |
| defect | any authored wrongness as shape keys or a mesh edit, with a landmark-ratio signature to check it survives |
| set | a `.blend` house (an Infinigen Indoors seed, hand-dressed, a Marble or Chisel export, or a captured splat via the KIRI addon) with a light rig keyed per time of night |
| perform | audio to Audio2Face-3D blendshapes (or ARKit capture) for the head; body clips retargeted onto the rig |
| shots | a shot list as data: camera, lens, hold time, light state and character pose per shot |
| render | Cycles beauty, Z, normal and segmentation per shot, with a fixed seed, at VHS-era resolution (≤ 720×480 before degradation) |
| surface | a depth-locked open-weight pass (Wan 2.2 VACE + Stand-In + character LoRA, or LTX-2.5 IC-LoRA Union) with the beauty pass as the first frame, under the deterministic PyTorch recipe |
| gate | ArcFace-to-render ≥ a calibrated threshold; DINO frame-to-frame ≥ the playblast; the landmark-ratio defect check; depth-edge IoU against the render's Z pass |
| audio | narration (ElevenLabs v3 with a fixed voice and seed, or local Chatterbox, pinned by WAV hash); Foley (Eleven SFX v2 or HunyuanVideo-Foley); a seeded ACE-Step drone; captions force-aligned from the script with WhisperX |
| cut | `.otio` plus a Remotion or ffmpeg render from the shot list under `bitexact`; captions burned in; timecode overlay before degrade; two-pass loudnorm |
| degrade | an ntsc-rs preset over the whole cut, once |
| lock | `film.lock.json`: every input and output hash, model IDs, seeds, presets, accepted takes and QC scores |

The raw Cycles render with the VHS pass and *no* surface stage is a legitimate product on its own:
the genre's aesthetic absorbs a clean CG interior and a too-still face, and it is bit-exact end to
end. The surface stage is an upgrade whose value should be judged against that baseline, not
assumed.

### 8.2 Licences

Keep to Apache, MIT and BSD wherever a model touches shipped pixels: the Wan 2.2 family (VACE,
Stand-In, Animate-2, InfiniteTalk), LatentSync, Qwen-Image-Edit-2511 or FLUX.2-klein-4B for
stills, Infinigen (BSD-3), ntsc-rs, and Audio2Face-3D (SDK MIT; models under the NVIDIA Open Model
Licence, which needs a read). LTX-2.5 is usable under $10 M ARR and must not present machine
output as human-made. Avoid without reading the licence: HunyuanVideo, HunyuanCustom and HY-World
(EU, UK and Korea exclusion), MiniMax H3 (territory application), FLUX dev and klein-9B
(non-commercial), Krea Realtime, Stable Virtual Camera and InfiniteYou's model (non-commercial),
and MetaHuman (no AI training on its output). Marble needs the Max plan for commercial rights.

### 8.3 Experiments that would settle the open questions

None of these were run. They are the cheapest tests of the claims above that rest on vendor
statements or practitioner consensus.

1. **Determinism**: run LTX-2.5 distilled and Wan 2.2 VACE twice on one H100 under the recipe in
   section 6.4 and check bit-equality; then across an H100 and a B200 (expect a mismatch, and
   decide which SKU is canonical). Measure seconds per 5 s and 10 s 720p clip.
2. **Identity under restyle**: render 50 canonical frames of a character (a yaw, pitch, HDRI and
   expression sweep), calibrate the ArcFace gate on them, then run one held 10 s close-up through
   VACE at three control strengths and through Luma "adhere"; plot face similarity and the
   landmark-ratio defect against strength. This answers whether a deliberate wrongness survives.
3. **Layout under restyle**: one Infinigen room, a 90° pan rendered in Cycles, the same pan through
   depth-locked VACE and through image-to-video from the first frame; measure depth-edge IoU
   against the Z pass per frame.
4. **The drift benchmark nobody publishes**: a 10-shot, same-character, same-kitchen sequence on
   Kling Omni, Seedance 2.5 and LTX-2.5 from the same keyframes, scored with the section 4.8
   gates. This decides whether hosted inserts are worth having at all.
5. **Licences**: read the MiniMax H3 community licence and the NVIDIA Open Model Licence in full.

A rough cost: single-digit dollars of rented GPU time per experiment, plus a Kling or Seedance
credit pack (about $40) for the fourth.

## 9. Legal and policy, briefly

US Copyright Office, Part 2 (2025-01-29): prompts alone are not authorship; a human's creative
selection, arrangement and modification of AI output is registrable with the AI portions
disclaimed, so the *edit* of a short is protectable and the raw clips are not. YouTube: since
2025-07-15, "inauthentic content" (templated, mass-produced AI) is demonetised, while a series with
recurring characters and distinct storylines is explicitly allowed; the July 2026 clarification
adds an "unsatisfying or off-putting … designed to shock" bucket that an AI horror channel must
avoid; realistic synthetic scenes need the disclosure label (which does not affect monetisation);
C2PA metadata auto-labels; and from 2027-02-01 the Shorts Creator Pool requires 10 M Shorts views
per trailing 90 days. Practical-plus-post work like Evillica's needs no label. Veo and Omni carry
SynthID. Seedance carries live US legal exposure (studio complaints, a Senate letter).

## 10. What was not verified

The ones that matter: the "slow push-in breathing" failure mode is practitioner consensus, not a
measurement; no public benchmark isolates cross-shot identity, and VBench-2.0's 2026 tables would
not render; the MiniMax H3 geographic clause comes from secondary sources; LTX-2.5's seconds per
clip on one H100 and its run-to-run bit-equality are vendor claims until experiment 1 runs; Reddit
and Instagram were unreachable, so community reroll counts come from vendor and course pages; the
ICT FaceKit licence text was not re-read; and whether the Mom face warp in the reference shorts is
AI-assisted is unknown.

## Sources

The primary pages relied on most, by topic. Every claim above was checked against these or marked
as recalled or unverified.

- **Reference shorts and creator:** youtube.com/@Evillica; the horrortoculture.com interview
  (2025-12-28); the houseofscream.com BUFF piece (2026-04-13); the three watch pages' metadata and
  comment threads.
- **Models:** ai.google.dev Gemini API docs for Veo, Omni and pricing; the deepmind.google Omni
  model card; kling.ai Omni and Element Library guides; Runway's API docs (api.md, pricing.md,
  changelog); seed.bytedance.com Seedance 2.5; huggingface.co MiniMaxAI/MiniMax-H3;
  huggingface.co Lightricks/LTX-2.5 and github.com Lightricks/LTX-2; github.com Wan-Video/Wan2.2
  and Wan-Animate-2; huggingface.co Wan-AI; huggingface.co sand-ai/MAGI-2-preview; the
  artificialanalysis.ai video leaderboard; the-decoder.com on the Sora shutdown; the Hugging Face
  diffusers reproducibility guide.
- **Characters:** github.com WeChatCV/Stand-In, Phantom-video/Phantom, MAGREF-Video/MAGREF,
  Tencent-Hunyuan/HunyuanCustom (face-similarity table and LICENSE), ostris/ai-toolkit,
  kohya-ss/musubi-tuner, bytedance/LatentSync, MeiGen-AI/InfiniteTalk, NVIDIA/Audio2Face-3D; arXiv
  2510.14975 (WithAnyone), 2510.14256 (Identity-GRPO), 2605.04702 (FaithfulFaces), 2603.23462
  (RealMaster), 2605.20476 (Goodbye Drift); Google's Veo 3.1 prompting guide; OpenAI's
  GPT-image-1.5 cookbook; cgchannel on the MetaHuman licence.
- **Scenes:** the worldlabs.ai Marble blog and mesh-export docs; github.com
  Tencent-Hunyuan/HY-World-2.0 and its LICENSE; github.com princeton-vl/infinigen; github.com
  Kiri-Innovation/3dgs-render-blender-addon; the Wan2GP VACE doc; docs.ltx.io IC-LoRA adapters; the
  runcomfy.com Blender to VACE workflow; the flick.art Blender AI filmmaking guide;
  docs.lumalabs.ai Modify Video; github.com nv-tlabs/GEN3C, alibaba-damo-academy/Uni3C,
  KlingAIResearch/ReCamMaster; ntsc.rs; inman.com on multi-angle staging (2026-04-27); arXiv
  2601.23286 (VideoGPA); the PyTorch randomness note.
- **Assembly:** the fal.ai Kling v3 pro API schema (`multi_prompt`, no seed); the
  Emily2040/seedance-2.0 api-status notes; huggingface.co MiniMaxAI/MiniMax-H3 and
  Comfy-Org/MiniMax-H3; docs.comfy.org LTX-2.5; github.com yihao-meng/HoloCine, SandAI-org/MAGI-1,
  showlab/MovieAgent; arXiv 2512.12372 (STAGE), 2606.20799 (GroundShot), 2602.23969 (MSVBench),
  2604.25318 (Cutscene Agent); huggingface.co papers 2501.12909 (FilmAgent); thecinema.ai (Captain
  Cinema); github.com uby174/ftl-studio, CodingWithShahzaib/ComfyUI-Krea-MultiShot-Stills,
  harry0703/MoneyPrinterTurbo, itsjwill/vanta, floomhq/opencut, aqm857886159/Nomi,
  idreesaziz/swimlane; the elevenlabs.io TTS API reference (seed) and Music docs; the OpenAI TTS
  guide; ai.google.dev speech and music generation; github.com resemble-ai/chatterbox,
  ace-step/ACE-Step, Tencent-Hunyuan/HunyuanVideo-Foley, hkchengrex/MMAudio, m-bain/whisperX,
  AcademySoftwareFoundation/OpenTimelineIO; the ffmpeg formats and codecs docs (`bitexact`); the
  remotion.dev flickering and openai-whisper docs; docs.descriptapi.com; heyeddie.ai/devs; github.com
  atx-guy/capcut-mcp-server; the blog.google Flow tips (2-day retention).
- **Readiness and policy:** cartoonbrew.com and thenextweb.com on Critterz; techcrunch.com on the
  Sora shutdown; hellochinatech.com and techtimes.com on China's AI dramas; invideo.io
  generation-count FAQs; screenweaver.ai on character drift (2026-08-24); fxguide.com on
  on-premises open weights (2026-08-28) and Autodesk Flow Studio (2026-08-24); hackernoon.com on
  retired models (2026-09-10); aif.runwayml.com; copyright.gov/ai; YouTube Help answers 1311392 and
  14328491; tubefilter.com and techcrunch.com on the July 2026 YouTube clarification;
  runpod.io/pricing; fal.ai model pages; eesel.ai on Kling pricing; elevenlabs.io/pricing.
