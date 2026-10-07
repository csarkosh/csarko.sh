---
description: How AAA engines draw ground fog as a frustum-aligned volume instead of sprites, what it costs, where it ghosts, and which of it a browser game can run.
published: 2026-10-07
source: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-10-07-ground-fog-in-aaa-games.md
---
# Ground fog without the wall

**Question:** a horror game wants fog that rests on the ground, that the player walks through,
and that looks like weather rather than a screen effect. Drawn as camera-facing sprites it reads
as a wall: the terrain cuts each quad along a hard line, the quads' flat bottoms line up into one
baseline, and a dozen soft blobs overlapping average into a flat sheet. How do the games whose fog
looks real draw it, what does it cost them, and which of it can a browser game run?

**Short answer:** every current AAA fog is a volume, not a set of sprites. A low-resolution 3D
texture aligned to the camera's frustum holds the fog's density and in-scattered light, a scan
through its depth slices integrates them, and each screen pixel looks up its own depth in the
result. Because the fog is integrated along the ray to the pixel's own depth there is no surface
for the ground to cut, which is exactly the wall. Density is an analytic height falloff times one
octave of wind-blown noise; the look comes from the integration, the phase function and temporal
filtering, not from texture detail. It costs about 1 ms on a PlayStation 4 and 1 to 3 ms on a
2014 laptop or desktop GPU, and its one known artifact is ghosting from the temporal filter.
Sprites survive only as local density fed into the volume, or as soft particles for wisps the
volume is too coarse for. A browser can do the same integral per pixel in a half-resolution
fragment pass with a dozen steps, on WebGL2 and WebGPU alike; a true froxel grid needs compute
and is WebGPU only.

## 1. The froxel technique

**Origin.** Wronski's volumetric fog for Assassin's Creed 4 at GDC and SIGGRAPH 2014 [1], [2],
made physically based and unified with every other participating medium by Hillaire at Frostbite
in 2015 [3]. Unreal's Volumetric Fog [4], Godot's [5], Flax's [6] and Unity HDRP's are the same
design; Remedy's Northlight engine in Alan Wake 2 [7] and Sucker Punch's haze in Ghost of
Tsushima [8] are reported as the same design with their own extensions.

**The storage.** A 3D texture mapped to the view frustum, "froxels" (frustum voxels): width and
height in normalised device coordinates, depth in slices distributed so the nearest metres get
the most, "where we need the most precision and aliasing artifacts show up easily" [2]. Wronski
first tried a world-aligned cuboid, which made temporal filtering easy but made the ray march
slow and aliased; the frustum layout makes the march "a parallel scan through depth slices" [2].

**The resolution.** Tiny. Unreal defaults to one voxel for every 8 screen pixels and 128 depth
slices, and its own scalability advice is that 8 pixels a voxel is four times faster than 4 and
64 slices twice as fast as 128 [4]. Flax uses about 150×80×64 [6]; a Unity URP implementation
offers 80×45×64 at its low preset and 240×135×128 at ultra [9]; Godot defaults to 64×64×64 [5];
Ghost of Tsushima's haze is a 128×64×64 grid [8]. Wronski explains why it is enough: the volume
holds low-frequency information only, it is read with quadrilinear filtering so no texel is ever
visible, and "every target pixel receives information about proper and precise depth from its
native resolution" [2]. The result "is very soft and is missing high frequency geometric
details", which "is quite similar to reality (because in the real atmosphere multiple scattering
effect takes place and softens the look of light shafts a lot)" [2].

**The passes.** Four in Assassin's Creed 4 [1]: build the density and the in-scattered light for
every cell (the sun through an exponential shadow map, an ambient term, the local lights touching
the frustum); march the slices front to back, solving the scattering equation numerically; and
composite with "just one bilinear volume texture fetch" at each pixel's depth. The URP write-up
names seven: noise bake, inject density, scatter lighting, temporal reprojection, spatial filter,
integrate, composite [9].

**The density.** "Just one octave of Perlin noise that is animated by wind. We tried using
multiple octaves, but in the end difference was rather subtle for added cost", times a vertical
exponential attenuation, because "heavy particles such as steam water particles tend to gather
around the ground level with exponential distribution" [2]. The URP implementation bakes a 128³
tileable noise and scrolls it by the wind [9]; Godot reads a 3D noise texture and advises 64³ or
smaller [5]. Local shapes (Godot's fog volumes in ellipsoid, cone, cylinder, box or world form;
Unreal's volume-domain particles describing "Albedo, Emissive, and Extinction for a given point
in space") are written into the same grid, which is how a bank of ground fog or a single wisp is
placed [4], [5].

**The light.** Beer-Lambert extinction along the ray, a Henyey-Greenstein phase function for the
scattering's direction, in-scatter from the main light through its shadow map (so the fog has
light shafts) and from local lights. Alan Wake 2 adds an approximation of multiple scattering,
"giving it a thick and realistic look" [7]; Ghost of Tsushima lit its haze, clouds and particles
with multiple scattering too [8]. This is where the realism comes from: the fog is lit by the
scene's lights with the scene's shadows, so it is bright toward the moon and dark under the trees,
and the eye reads it as air.

**The temporal filter.** Every implementation jitters the sample position inside each voxel from
frame to frame and blends with the previous frame's reprojected volume: Unreal's "heavy temporal
reprojection filter with a different sub-voxel jitter per frame" [4], Flax's Halton offsets with a
7 % blend of the current frame [6], Godot's with a tunable amount [5]; Wronski proposed it as the
extension after Assassin's Creed 4 and noted that "reprojection is much easier in 3D than in 2D"
[1]. The price is the one artifact all of them document: "fast-changing lights, like flashlights
and muzzle flashes, leave lighting trails" [4]; moving fog volumes and lights "ghosting and
leaving a trail behind them" [5]. The Silent Hill 2 remake, built on Unreal Engine 5 [10], has a
player guide devoted to reducing its fog's ghosting [11].

**The cost.** Unreal: 1 ms on a PlayStation 4 at High, 3 ms on a GTX 970 at Epic with eight
times the voxels; a shadowed point or spot light costs about three times an unshadowed one [4].
Flax: about 1.1 ms on a GeForce 840M laptop [6]. Ghost of Tsushima: about 0.5 ms on async
compute [8]. The cost is nearly fixed by the grid size, not the scene, which makes it a budget
line rather than a risk.

**The limits.** The fog does not shadow itself [4]; it is bounded by a view distance past which
an analytic fog takes over [4], [9]; and it is fixed to the camera frustum [4].

## 2. The other half: particles

The volume is soft by construction. For wisps at the player's face, smoke and dust, these games
still draw sprites, and they make the sprites meet the world in two ways.

**Soft particles.** Each sprite pixel compares its own depth with the scene depth behind it and
fades over the last fraction of a metre before contact, so a card meets the ground as a gradient
instead of a line [12]. GPU Gems 3 draws the particles to an off-screen target against a
downsampled depth buffer and composites them back, for the fill rate of near-full-screen cards
[13]. This is the direct fix for a ridge cutting a quad.

**Feeding the volume.** In Unreal, Godot and Alan Wake 2 the sprites can instead add density to
the froxel grid [4], [5], [7], so a placed bank is lit, shadowed and integrated like the rest of
the fog and has no edge at all. Alan Wake 2 goes further and renders fog, particles and glass
through one order-independent transparency scheme, moment-based, at three resolutions, so none
of them sorts against the others [7].

**The old way.** Godot's own advice for renderers without volumetrics is "specially configured
QuadMeshes" for ground fog [5]: flat quads lying on the ground with a noise texture, not vertical
cards facing the camera.

## 3. What a browser can run

WebGL2 has fragment shaders, 3D textures and, with a depth pre-pass or a resolved depth
attachment, a depth texture; it has no compute shaders and no convenient render-to-3D-slice.
WebGPU adds compute and storage textures. Three designs, cheapest first.

**Analytic height fog in the post pass.** Quilez's closed form of the exponential height density
integrated along the ray, `(a/b)·e^(−b·y₀)·(1 − e^(−b·t·dir.y)) / dir.y`, is valid with the camera
inside the fog and costs a few instructions a pixel [14]. With the depth texture it gives the
ground-hugging layer, the trees fading into it by height, and never a wall. It has no wisps:
the density is smooth.

**A half-resolution ray march.** The froxel integral done per pixel instead of per cell: 12 to 16
steps along each pixel's ray to its depth, capped at a few tens of metres with the analytic fog
beyond, each step reading the height density times a 32³ or 64³ tileable noise scrolled by wind,
Beer-Lambert extinction, a Henyey-Greenstein lobe toward the moon and the lamp, a 10 % temporal
blend against the reprojected previous frame, and a depth-aware upsample into the post pass.
This runs on WebGL2 and WebGPU alike, since it is one fragment pass; at half resolution it is of
the order of 1 to 2 ms on an integrated GPU and well under that on a discrete one. It gives
wisps, a ground bank with structure and walking through it, with the same ghosting risk the AAA
volumes carry, which the blend factor tunes.

**A froxel grid.** The real thing, on WebGPU only: a compute pass writing a 160×90×64 storage
texture that the post pass reads. Cheaper than the per-pixel march at the same quality once the
lights are many, since each cell is lit once rather than per pixel per step; not worth it until
the march is light-bound.

In every design the density is one scalar a frame (`a` in the analytic form, the extinction
coefficient in the others), which is what a game's time of day, weather or threat level sets.

## 4. A plan for a browser game

Build the half-resolution march, with the analytic fog as the low tier and as the fallback past
the march's range, and convert the near sprites to soft particles for the last metre at the face:

1. The volume, as a post pass before the colour grade: half resolution, 12 steps to 40 m, an
   exponential height density with its floor at the terrain (a small height texture round the
   player, so the march knows where the ground is), one octave of 32³ noise with wind,
   Beer-Lambert, Henyey-Greenstein toward the moon and the player's lamp, temporal blend 0.1,
   depth-aware upsample. Density, colour and anisotropy are uniforms.
2. The analytic fog, in the grade, from the march's range to the draw distance, and the whole
   fog on the low tier.
3. Soft near particles for the wisp at the face: a depth fade of about half a metre against the
   scene depth and the noise map in their alpha, born only within two metres; everything farther
   is the volume's. Remove any vertical ground-fog cards: the volume is the cloud.
4. Tiers: high and medium run all three; low runs the last two.

What this does not give is the AAA fog's light shafts through the trees' shadows: that needs the
march to read the moon's shadow map, a later step on top of the same pass.

## 5. Sources

1. B. Wronski, "Volumetric fog: unified compute shader-based solution to atmospheric scattering," presented at SIGGRAPH Advances in Real-Time Rendering, Vancouver, BC, Canada, Aug. 2014. Accessed: Oct. 7, 2026. [Online]. Available: https://advances.realtimerendering.com/s2014/wronski/bwronski_volumetric_fog_siggraph2014.pdf
2. B. Wronski, "Assassin's Creed 4: Black Flag, road to next-gen graphics," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2014, speaker notes. Accessed: Oct. 7, 2026. [Online]. Available: https://bartwronski.com/wp-content/uploads/2014/03/ac4_gdc_notes.pdf
3. S. Hillaire, "Physically-based and unified volumetric rendering in Frostbite," presented at SIGGRAPH Advances in Real-Time Rendering, Los Angeles, CA, USA, Aug. 2015. Accessed: Oct. 7, 2026. [Online]. Available: https://www.researchgate.net/publication/281295687_Physically-based_Unified_Volumetric_Rendering_in_Frostbite
4. Epic Games, "Volumetric fog in Unreal Engine," Unreal Engine documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-fog-in-unreal-engine
5. Godot Engine contributors, "Volumetric fog and fog volumes," Godot Engine documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://docs.godotengine.org/en/latest/tutorials/3d/volumetric_fog.html
6. Flax Engine, "Flax Facts #14: volumetric fog," Flax Engine blog. Accessed: Oct. 7, 2026. [Online]. Available: https://flaxengine.com/blog/flax-facts-14-volumetric-fog/
7. Remedy Entertainment, "How Northlight makes Alan Wake 2 shine," Remedy Games. Accessed: Oct. 7, 2026. [Online]. Available: https://www.remedygames.com/article/how-northlight-makes-alan-wake-2-shine
8. J. Patry, "Ghost of Tsushima SIGGRAPH talks," glowybits, Dec. 18, 2022. Accessed: Oct. 7, 2026. [Online]. Available: https://www.glowybits.com/blog/2022/12/18/ghost_talks/
9. Euclidean Dreams, "Building a froxel volumetric fog renderer in Unity URP," Euclidean Dreams. Accessed: Oct. 7, 2026. [Online]. Available: https://www.euclideandreams.com/writing/building-a-froxel-volumetric-fog-renderer-in-unity-urp
10. TweakTown staff, "Silent Hill 2 remake uses Unreal Engine 5's Lumen for ultra-creepy fog," TweakTown. Accessed: Oct. 7, 2026. [Online]. Available: https://www.tweaktown.com/news/89021/silent-hill-2-remake-uses-unreal-engine-5s-lumen-for-ultra-creepy-fog/index.html
11. Steam Community, "Improving fog quality + reducing ghosting," Silent Hill 2 community guide. Accessed: Oct. 7, 2026. [Online]. Available: https://steamcommunity.com/sharedfiles/filedetails/?id=3417952221
12. Flax Engine, "HOWTO: make soft particles," Flax Engine documentation. Accessed: Oct. 7, 2026. [Online]. Available: https://docs.flaxengine.com/manual/particles/tutorials/soft-particles.html
13. I. Cantlay, "High-speed, off-screen particles," in GPU Gems 3, ch. 23, NVIDIA, 2007. Accessed: Oct. 7, 2026. [Online]. Available: https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles
14. I. Quilez, "Better fog," iquilezles.org. Accessed: Oct. 7, 2026. [Online]. Available: https://iquilezles.org/articles/fog/
