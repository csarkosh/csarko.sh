---
description: Big games give sand volume by stacking cheap cues, not one trick. Six reasons a beach reads as paint, and the fixes that fit a browser game, in order.
published: 2026-11-26
categories: Rendering, Game design
project: none
asks: How do big games make sand look like it has volume?
related: ink-line-from-depth-webgpu, rock-on-steep-terrain-shape-it-cover-it-or-skin-it, floating-props-on-procedural-terrain
---
# How big games give sand volume, and what fits a browser game

**Question:** How do big-budget games make sand and beaches look like they have volume, and not like a flat painted surface? And which of those techniques fit a browser game with little GPU memory to spare?

**Short answer:** They stack cheap cues; no single trick does it. The published cases shade smooth ground so it looks deep (Journey), fake footprints with decals (Uncharted 3), shift the ground's texture with the view near tracks (Red Dead Redemption 2), and scatter small objects. Under tight limits the order is: colour variation at several scales, darker hollows, a graded wet edge, anti-repetition, objects lying on the sand, then real shape in the terrain. Bigger textures and sparkle come last.

**What that leaves open:** Studios publish almost no costs for sand, so the ranking here rests on what each technique reads per pixel, not on reported timings. The plan at the end was not built or measured as of Nov 26, 2026. By the end you can list the reasons a beach reads as paint and say which fix answers each.

The figure is a real beach from a game in development, with a sand texture, a bump map, a wet band and driftwood already in place. Look at the dry sand on the right: it is one even slope of one colour.

![A wide, shallow beach under an overcast sky, seen from the water's edge. Rippled shallow water fills the left and centre. On the right the dry sand is a single smooth cream slope with no ripples, no tide line, no stones and nothing lying on it. A headland and a line of trees stand in the distance, drawn with a thin dark outline.](dry-beach.png "A beach can have a texture, a bump map and a wet band and still read as paint. Under an even sky none of them gives the eye a hollow, an edge or an object to judge depth by.")

**In short:**

- **Six causes**, and the texture is only one: light, repetition, colour, shape, the wet edge and an empty surface ([section 1](#six-reasons-a-beach-reads-as-paint)).
- **No costs published:** the best documented sand in games took three years and its talk gives no timings ([section 2](#what-the-published-record-says-and-how-thin-it-is)).
- **Three reads where there was one:** what breaking a texture's repetition costs per picture, with no memory ([section 4](#anti-repetition-three-texture-reads-where-there-was-one)).
- **About 19 MB:** a four-picture ground material at 2048 by 2048, which is why a bigger scan comes last ([section 7](#a-bigger-photograph-about-19-mb-for-the-least-gain)).

## 1. Six reasons a beach reads as paint

The beach in the figure belongs to Cape Sorrow, a detective game in development that runs in the browser on WebGPU with a forward renderer. This section describes it as of Nov 26, 2026. In play its sand read as flat and fake. Reading the code that draws it gave six separate causes.

1. **The light hides relief.** The game is lit as a midday under full cloud. Light arrives evenly from the whole sky and the ground receives no sun shadow. A bump map, a picture that tilts the surface's lighting to fake small bumps, only shows when light comes from one side. The sand has one, and under this sky it does almost nothing.
2. **The texture repeats, then stops.** The sand is one 512 by 512 picture repeated every 1.8 m. Between 80 and 140 m from the camera it fades out, and beyond that the beach is one colour.
3. **The colour does not vary.** Dry sand is a single colour, mixed with a pebble colour by a pattern 34 m across. There are no damp patches, no darker hollows and no tide lines.
4. **The ground has no small shape.** The terrain is a mesh with a point every metre. The beach rises 1 m in 40 and its dunes are about 20 cm tall, so nothing casts an outline against anything else.
5. **The wet edge is a ruled line.** Below a fixed height the sand is darkened and made glossy as one even band, about 12 m wide on this slope, with a straight upper edge.
6. **Almost nothing lies on it.** One driftwood model at about one piece per 50 square metres near the water, and some larger logs. No kelp, shells, stones or grass.

A seventh problem sat beside the beach. The engine decides what is sand by height alone: ground under 4 m above the sea is sand. The town's levelled ground is at 2.5 m, so every strip of it that is not a street or a yard is painted as beach.

![Level ground at the edge of a port town under an overcast sky. A railroad runs along the left with rails, ties and dark ballast. A wide band of smooth, pale cream ground fills the middle of the picture between the railroad and a grey road on the right. Utility poles, a brick building and a wooded hillside stand beyond the road.](made-ground.png "A rule that paints sand by height alone also paints it where no beach is. The pale band between the railroad and the road is levelled town ground that happens to lie under 4 m.")

Only the second cause is about the texture, which is where most advice about sand begins. So the next question is what large games do about the other five.

## 2. What the published record says, and how thin it is

The best documented sand in any game is Journey's. Its lead engineer spent three years on it, refining and rewriting, and described the result in a talk [1]. The slides name six parts of the shipped shader: sharp mips, anisotropic masking, glitter specular, ocean specular, diffuse contrast and detail heightmaps [2]. The slides compare each part on and off, and give no timings, texture sizes or memory figures [2]. The fullest explanation in print is a recreation from visual references by another author, which is careful to say it is inspired by the talk and is not the shipped code [3]. In that account the sand is a smooth surface made to look deep by shading alone: a diffuse term with more contrast than plain matte shading, a grain layer, a rim of light at dune edges, a water-like highlight at shallow angles, sparse bright glints, and ripples [3], [4].

Three other shipped games document something narrower.

- **Uncharted 3** wanted sand to deform under the hero and found that prohibitive. It drew prints as decals projected in screen space, and its effects could write into the stored surface directions, so that marks like these were lit like the ground around them [5].
- **Red Dead Redemption 2**, as read from captured frames by an outside developer, draws the prints of people and horses into a 2048 by 2048 single-channel picture and uses it to shift the terrain's texture with the viewing angle [6].
- **Horizon Zero Dawn** places rocks and plants from the graphics card as the player walks [7], and its remaster added sand that deforms [8]. Neither source gives a number for sand.

For shorelines, the wet band and the foam, I found no large studio's account at all.

So the record supports a method and not a recipe: the documented games layer several cheap cues, and each one leans on something specific to its setting. Journey's leans on a low sun. That leaves the problem of choosing cues for an overcast beach, with no one else's timings to lean on.

## 3. Variation, hollows and a wet edge survive an even sky

A cue that needs light from one side is lost under full cloud. Three cues are not, and all three are arithmetic in the ground's shader with no memory cost.

**Colour variation at several scales.** Real sand is mottled at half a metre, patchy with damp at five, and drifted at thirty. Three layers of noise, each a little arithmetic per pixel, give the eye something to measure distance by. The same noise can keep working past the distance where the texture fades.

**Darker hollows.** A ground material usually carries a height picture and an ambient occlusion picture, which records how much sky each point can see. Under even light, how much sky a point sees is the whole of its shading, so darkening the low grain and the gaps between pebbles is the correct picture and not a trick. Naughty Dog's micro shadowing is the sun-lit relative of this, and Unity's version of it describes the inputs: the bump map and the occlusion picture [9].

**A graded, ragged wet edge and tide lines.** The sea leaves lines that follow height: a dark line of debris at the last high water, fainter older ones above it, and a wet zone that fades through damp to dry. Since the shader knows the height of every pixel, each line is a narrow band in height, wandered by noise.

These three answer causes one, three and five. They do nothing about a texture that visibly repeats.

## 4. Anti-repetition: three texture reads where there was one

A repeating texture is fixed by sampling it more than once at shifted and rotated places and blending the results. Two published methods do this over a grid of triangles or hexagons. The first keeps the texture's contrast through the blend and needs an extra lookup table prepared ahead of time [10]. The second, hex tiling, samples the original texture directly and is the one with a free reference implementation [11].

Both read each picture about three times in the blended region. A ground material with a colour picture, a bump picture and a packed picture goes from 3 reads to 9. That is the main per-pixel cost of everything in this doc, and it applies only to pixels that show sand. It adds no memory.

That fixes cause two. The ground is still a smooth sheet, which is cause four.

## 5. Parallax and real shape: what a 1 m mesh can and cannot hold

There are two ways to give the ground shape.

**Parallax** shifts the texture by its height picture according to the viewing angle, so bumps appear to stand up. The simple form costs one extra read and fails at shallow angles. The steep and occlusion forms march through the height picture in layers, 8 looking straight down and 32 at a shallow angle in one common tutorial's shader [12]. Babylon.js calls the simple form nearly free and warns that the occlusion form samples the height picture many times [13]. A beach is seen at a shallow angle almost always, which is exactly where parallax costs the most and smears the most. It also never changes an outline: a stone drawn by parallax still has a flat edge against the sky.

**Real shape** moves the terrain's points. WebGPU has no hardware tessellation, so the mesh cannot be subdivided on the graphics card, and a mesh with a point every metre can only hold features a few metres across. Sand ripples 5 to 15 cm apart would need points every few centimetres. What a 1 m mesh can hold is the larger anatomy of a beach: a low ridge with a step where storms reach, scallops along the swash, shallow channels and bars on the wet flat, hummocks at the foot of the dunes. Those cost nothing per frame, because the ground is computed once when it is built.

Ripples therefore belong to shading, and the ridge and channels to the mesh. Neither gives the sand anything to be compared against, which is cause six.

## 6. Objects on the sand give scale and contact

A flat surface with objects on it reads as ground; without them it reads as a backdrop. Large games assemble whole environments from small objects placed on the graphics card [7]. A browser game can do the same at a smaller scale with instancing, where one mesh is drawn many times in a single call.

For a beach the useful objects are the ones the sea sorts by height: a wrack line of kelp at the last high water, cobbles in patches near the storm line, small driftwood along both, and coarse grass from the storm line up. Each one adds an outline, a size the eye knows, and a place where it meets the sand. They can share the heights the shader's tide lines use, so the dark line in the sand and the kelp lying on it agree.

Footprints belong here too. The two documented approaches are decals and a picture of prints that drives parallax [5], [6]. Decals are the cheap one.

## 7. A bigger photograph: about 19 MB for the least gain

The obvious fix, a larger scanned sand material, is the worst value under these limits. By my arithmetic from the block sizes of the common compressed formats [14], a four-picture set (colour, bump, a packed roughness and occlusion picture, height) with its smaller copies is about 4.7 MB at 1024 by 1024 and about 19 MB at 2048 by 2048. In a game with tens of megabytes to spare, the larger set takes most of the room, and an overcast sky hides most of what it adds.

Sparkle is in the same position. The recent real-time glint methods count the reflecting flakes under each pixel; the newest reports being 1.5 to 5 times faster than earlier work and gives no time per frame in its abstract [15]. Glints need a sun to reflect.

## 8. The order to build it in

This is the plan for Cape Sorrow as of Nov 26, 2026. None of it was built or measured on that date, and the frame times are estimates.

| Step | Answers | GPU memory | Frame time |
|---|---|---|---|
| Paint levelled town ground as gravel and soil, not sand | The seventh problem | None | None |
| Variation at three scales, darker hollows, tide lines, a graded wet edge, ripples near the water | Causes 1, 3, 5 | None | A little arithmetic on sand pixels |
| Anti-repetition for sand and pebbles | Cause 2 | None | 9 texture reads on a sand pixel where there were 3 |
| A wrack line, cobbles, small driftwood and beach grass, from models the game already has | Cause 6 | 1 to 3 MB | A few more draw calls |
| A storm ridge, channels and bars in the terrain | Cause 4 | None | None |

The first four are being built first. The fifth changes the ground that everything stands on, so it waits until frames show whether the beach still reads flat from standing height.

What I would check before trusting this order on another project: which of the six causes that project has. A game with a low sun has no cause one, and Journey's list fits it far better than this one does.

## Sources

1. J. Edwards, "Sand Rendering in Journey," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2013. Accessed: Nov. 26, 2026. [Online]. Available: https://gdcvault.com/play/1017742/Sand-Rendering-in
2. J. Edwards, "Sand Rendering in Journey" (slide text), SlideToDoc. Accessed: Nov. 26, 2026. [Online]. Available: https://slidetodoc.com/sand-rendering-in-journey-john-edwards-thatgamecompany-shipping/
3. A. Zucconi, "A Journey Into Journey's Sand Shader," Alan Zucconi, Oct. 2019. Accessed: Nov. 26, 2026. [Online]. Available: https://www.alanzucconi.com/2019/10/08/journey-sand-shader-1/
4. A. Zucconi, "Journey Sand Shader: Specular Reflection," Alan Zucconi, Oct. 2019. Accessed: Nov. 26, 2026. [Online]. Available: https://www.alanzucconi.com/2019/10/08/journey-sand-shader-4/
5. M. Robin, "Effects Techniques Used in Uncharted 3: Drake's Deception," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2012. Accessed: Nov. 26, 2026. [Online]. Available: https://www.slideshare.net/slideshow/uncharted3-effect-technique/12977466
6. imgeself, "Graphics Study: Red Dead Redemption 2," imgeself, Jun. 2020. Accessed: Nov. 26, 2026. [Online]. Available: https://imgeself.github.io/posts/2020-06-19-graphics-study-rdr2
7. J. van Muijden, "GPU-Based Procedural Placement in Horizon Zero Dawn," Guerrilla Games, Mar. 2017. Accessed: Nov. 26, 2026. [Online]. Available: https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn
8. S. Bronkhorst, "Horizon Zero Dawn Remastered: a deep dive into its enhancements," PlayStation Blog, Oct. 2024. Accessed: Nov. 26, 2026. [Online]. Available: https://blog.playstation.com/2024/10/17/horizon-zero-dawn-remastered-a-deep-dive-into-its-enhancements/
9. Unity Technologies, "Micro shadows," High Definition Render Pipeline manual, v17.1. Accessed: Nov. 26, 2026. [Online]. Available: https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.1/manual/Override-Micro-Shadows.html
10. T. Deliot and E. Heitz, "Procedural Stochastic Textures by Tiling and Blending," in *GPU Zen 2*, 2019. Accessed: Nov. 26, 2026. [Online]. Available: https://eheitzresearch.wordpress.com/738-2/
11. M. Mikkelsen, "hextile-demo," GitHub repository. Accessed: Nov. 26, 2026. [Online]. Available: https://github.com/mmikk/hextile-demo
12. J. de Vries, "Parallax Mapping," LearnOpenGL. Accessed: Nov. 26, 2026. [Online]. Available: https://learnopengl.com/Advanced-Lighting/Parallax-Mapping
13. Babylon.js Authors, "Parallax Mapping," Babylon.js Documentation. Accessed: Nov. 26, 2026. [Online]. Available: https://doc.babylonjs.com/features/featuresDeepDive/materials/using/parallaxMapping
14. Wikipedia contributors, "Adaptive scalable texture compression," Wikipedia. Accessed: Nov. 26, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Adaptive_scalable_texture_compression
15. T. Deliot and L. Belcour, "Real-Time Rendering of Glinty Appearances using Distributed Binomial Laws on Anisotropic Grids," arXiv:2306.05051, Jun. 2023. Accessed: Nov. 26, 2026. [Online]. Available: https://arxiv.org/abs/2306.05051
