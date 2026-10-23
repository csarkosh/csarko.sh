---
description: Memorable game looks come from one or two strong shader rules applied everywhere: ink outlines, cel bands, dithering, gradient fog or VHS.
published: 2026-09-14
categories: Rendering
updated: 2026-10-23
source: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-09-14-stylized-shader-looks.md
series: Day Hike's look
related: a-painted-look-over-a-photoreal-render-webgpu-vs-webgl2, ground-fog-without-the-wall
---
# Stylized shader looks: how games build a visual identity

**Question:** what are the different ways games have used shaders to give themselves a distinct
look, in the way Borderlands' ink outlines make it read as a comic book?

**Short answer:** most memorable looks come from one or two strong rules applied everywhere,
not from many small effects. Borderlands itself is mostly two things: a
[post-process](#term "A full-screen shader run on the finished frame, after the scene has been drawn.")
pass that finds edges in the
[depth and normal buffers](#term "Per-pixel images of how far each surface is from the camera and which way it faces, kept beside the colour.")
and draws them black, and textures that were hand-painted with ink lines already in them. The
lighting underneath is fairly conventional.

![A grass meadow in Day Hike before a line of tall trees under a grey sky, the far trees fading into mist](meadow.png "Day Hike today keeps its photoreal render and builds the look on top: fog whose colour runs along a gradient with distance fades the far tree line (section 6), and on the medium and high tiers a Kuwahara filter smears the frame into strokes (section 5) before a muted grade.")

**In short:**

- **Edge detection draws Borderlands' ink** in screen space: cheap and it catches every object,
  but the line width cannot be art-directed
  ([section 1](#outlines-edge-detection-inverted-hulls-and-ink-wash)).
- **Two or three flat bands** of light instead of a smooth falloff is the cel look; Team
  Fortress 2 runs its light through a hand-authored 1D ramp instead
  ([section 2](#cel-bands-and-warped-diffuse-reshape-the-light)).
- **Two colours and a dither** make Return of the Obra Dinn, with the pattern pinned to a
  sphere around the camera so it does not swim
  ([section 3](#limited-colour-1-bit-dither-and-restricted-palettes)).
- **One gradient fog shader** carries much of Firewatch's identity, and it is the closest
  reference for Day Hike ([section 6](#atmosphere-as-the-style-firewatch-s-gradient-fog)).
- **Film grain, vignette and chromatic aberration** are horror's shorthand for found footage
  ([section 7](#camera-imitation-vhs-grain-and-fog-as-dread)).
- **Sanity effects** warp the screen and drain the colour as the character's mind frays
  ([section 8](#shaders-tied-to-mechanics-paint-scanning-and-sanity)).

Every game below links to its Steam page so you can see the look in the store screenshots and
trailers. Where a game is not sold on Steam, the link goes to its official site, or to its
Wikipedia article if it is no longer sold at all.

## 1. Outlines: edge detection, inverted hulls and ink-wash

- **Post-process edge detection:** [Borderlands](https://store.steampowered.com/app/729040/)
  and [XIII](https://store.steampowered.com/app/1170760/) (the 2003 original, sold as
  *XIII - Classic*). Find sudden jumps in depth or surface angle in screen space and draw a
  line there. It is cheap and catches every object, but line width is the same everywhere and
  cannot be art-directed.
- **Inverted hull:** [Guilty Gear Xrd](https://store.steampowered.com/app/520440/),
  [Hi-Fi Rush](https://store.steampowered.com/app/1817230/) and most anime-style games. Draw
  each mesh a second time, pushed out along its normals, with front faces culled. Arc System
  Works' GDC 2015 talk [1] shows how far this goes: vertex colours set line thickness, normals
  were hand-edited to control where shadows fall, and animation runs at a lowered frame rate
  so it reads like hand-drawn keyframes.
- **Ink-wash:** [Okami HD](https://store.steampowered.com/app/587620/). Brush-stroke outlines,
  a paper-grain overlay and a faded palette imitate sumi-e painting.

## 2. Cel bands and warped diffuse reshape the light

- **Cel ramps:** [Jet Set Radio](https://en.wikipedia.org/wiki/Jet_Set_Radio) (no longer sold
  on Steam) and [The Legend of Zelda: The Wind Waker](https://en.wikipedia.org/wiki/The_Legend_of_Zelda:_The_Wind_Waker)
  (Nintendo only). Round the light amount into two or three flat bands instead of a smooth
  falloff.
- **Warped diffuse:** [Team Fortress 2](https://store.steampowered.com/app/440/). Valve's 2007
  "Illustrative Rendering in Team Fortress 2" paper describes it [2]. Lighting runs through a
  hand-authored 1D ramp and gets a strong rim light, so characters read like early-20th-century
  commercial illustration and their silhouettes stay clear at a distance.
- **Authored face shadows:** [Genshin Impact](https://genshin.hoyoverse.com/) (HoYoverse's
  own launcher, not Steam). Shadow shapes on faces come from textures, not from the geometry,
  so a nose never casts an ugly shadow.

## 3. Limited colour: 1-bit dither and restricted palettes

- **1-bit dithering:** [Return of the Obra Dinn](https://store.steampowered.com/app/653530/).
  Two colours and a dither pattern. Lucas Pope's devlog [3] covers the hard part: a dither
  computed fresh each frame swims as the camera moves, so the final version maps the pattern
  onto a sphere around the camera for surfaces facing the viewer, which keeps it pinned while
  the camera turns, and uses blue noise everywhere else.
- **A restricted palette as the identity:** [MadWorld](https://en.wikipedia.org/wiki/MadWorld)
  (Wii only; black, white and red), [SUPERHOT](https://store.steampowered.com/app/322500/)
  (a white world with red enemies) and [LIMBO](https://store.steampowered.com/app/48000/)
  (greyscale silhouettes).

## 4. Low fidelity on purpose: PS1 jitter and 3D as pixel art

- **The PS1 look:** [SIGNALIS](https://store.steampowered.com/app/1262350/) and much of the
  indie horror scene. Vertices snapped to a coarse grid so they jitter, textures that warp
  because there is no perspective correction, low resolution and dithering. People's memories
  of that era make it feel uncanny.
- **3D rendered as pixel art:** [Dead Cells](https://store.steampowered.com/app/588650/).
  3D models rendered at low resolution with no anti-aliasing, then used as sprites.
- **Low-resolution assets under modern lighting:** [Valheim](https://store.steampowered.com/app/892970/).
  Pixelated textures under volumetric fog and bloom.

## 5. Painterly: line art, hatching and hand-painted textures

- **Moebius-style line art:** [Sable](https://store.steampowered.com/app/757310/). Heavy
  outlines, flat colour and very little shading.
- **Hatching, watercolour and brush filters:** cross-hatch textures chosen by light level,
  paper grain, or a Kuwahara filter that smears the image into brush strokes.
- **Hand-painted textures with simple lighting:** early [World of Warcraft](https://worldofwarcraft.blizzard.com/)
  (Battle.net, not Steam). Most of the look lives in the textures.

## 6. Atmosphere as the style: Firewatch's gradient fog

- **Gradient fog:** [Firewatch](https://store.steampowered.com/app/383870/). This is the
  closest reference for Day Hike. Fog colour comes from a hand-painted gradient chosen by
  distance, so far ridgelines fade into flat poster colours, and each time of day has its own
  gradient. Much of the game's identity comes from that one shader. Jane Ng's GDC 2015 talk
  covers the art direction behind it [4], and her 2016 talk how the world was built [5].
- **Specular glitter:** [Journey](https://store.steampowered.com/app/638230/). John Edwards'
  GDC talk on the sand [6]: glitter from sparkle normal maps plus a broad, ocean-like sheen made
  sand the game's signature material.
- **Tilt-shift diorama:** [OCTOPATH TRAVELER](https://store.steampowered.com/app/921570/)
  (its "HD-2D" look) and [TUNIC](https://store.steampowered.com/app/553420/). Strong depth of
  field, bloom and vignette make the world look like a miniature.

## 7. Camera imitation: VHS, grain and fog as dread

- **VHS and camcorder:** [Resident Evil 7 Biohazard](https://store.steampowered.com/app/418370/)
  (its found-footage tapes) and [Outlast](https://store.steampowered.com/app/238320/) (the
  night-vision camcorder). Scanlines, colour bleed, noise and tracking glitches.
- **Film grain, vignette and chromatic aberration:** horror uses these as shorthand for
  found footage.
- **Fog and noise as dread:** [Silent Hill](https://en.wikipedia.org/wiki/Silent_Hill_(video_game))
  (the 1999 PS1 original, no longer sold). The fog began as a way to hide a short draw distance
  and became the series' identity; the [SILENT HILL 2](https://store.steampowered.com/app/2124490/)
  remake keeps it.

## 8. Shaders tied to mechanics: paint, scanning and sanity

- **Painting the world in:** [The Unfinished Swan](https://store.steampowered.com/app/1206430/).
  The world starts pure white, and you reveal it by throwing paint.
- **Seeing by scanning:** [Scanner Sombre](https://store.steampowered.com/app/475190/). You
  only see the point cloud your LIDAR scanner has painted.
- **Sanity effects:** [Eternal Darkness](https://en.wikipedia.org/wiki/Eternal_Darkness)
  (GameCube only) and [Amnesia: The Dark Descent](https://store.steampowered.com/app/57300/).
  The screen warps, colour drains and the image distorts as the character's mind frays.

## For Day Hike: gradient fog plus a dread post-process

- **Firewatch-style gradient fog** fits an outdoor hiking game. It can sit on top of
  photoreal rendering instead of replacing it, so it does not fight the world's current
  photoreal direction.
- **The horror layer** could draw on sections 7 and 8. A post-process that shifts as dread
  builds would set the horror apart from the daytime hike without re-authoring any assets:
  fog colour sliding along a different gradient, grain and chromatic aberration creeping in,
  or a slight VHS bleed on the headlamp cone.

Babylon.js supports both through the material plugins the ground shaders already use and
through its `PostProcess` pipeline.

## Sources

1. J. C. Motomura, "GuiltyGearXrd's Art Style: The X Factor Between 2D and 3D," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2015. Accessed: Sep. 23, 2026. [Online]. Available: https://www.gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The
2. J. Mitchell, M. Francke, and D. Eng, "Illustrative Rendering in Team Fortress 2," in Proc. Int. Symp. Non-Photorealistic Animation and Rendering (NPAR), 2007. Accessed: Sep. 23, 2026. [Online]. Available: https://steamcdn-a.akamaihd.net/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2.pdf
3. L. Pope, "Return of the Obra Dinn devlog: November 2017," TIGSource development log, Nov. 2017. Accessed: Sep. 23, 2026. [Online]. Available: https://dukope.com/devlogs/obra-dinn/tig-32/
4. J. Ng, "The Art of Firewatch," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2015. Accessed: Sep. 23, 2026. [Online]. Available: https://gdcvault.com/play/1022295/The-Art-of
5. J. Ng, "Making the World of Firewatch," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2016. Accessed: Sep. 23, 2026. [Online]. Available: https://www.gdcvault.com/play/1023191/Making-the-World-of
6. J. Edwards, "Sand Rendering in Journey," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2013. Accessed: Sep. 23, 2026. [Online]. Available: https://www.gdcvault.com/play/1017742/Sand-Rendering-in
