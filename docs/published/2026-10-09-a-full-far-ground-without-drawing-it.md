---
description: Cheap GPU tricks that make a game's far ground read as full of grass and cover without drawing blades there: fitted colour, sun-shaded clumps, sparse cards.
published: 2026-10-09
---
# A full far ground without drawing it

**Question:** In Day Hike, a first-person hiking game in Babylon.js, a still taken on a trail under a
closed conifer canopy shows a full foreground, ferns, grass blades, tufts and leaf litter, out to
about 25 m. Past that, between the trunks, the ground is a flat, even grey-green with nothing
standing on it. The trunks meet it in clean lines, the trail crosses it as a pale ribbon, and the
whole band reads as a game floor rather than a forest floor. What cheap GPU tricks make that far
ground read as full of grass and ground cover, at a cost far below drawing real blades there?

**Short answer:** the far ground is bare because every layer that makes the foreground full ends
between 18 and 40 m, and what the terrain shader does past that was tuned for open meadow, not for
ground under trees. The ground can carry most of the impression on its own: a cover colour fitted
to what the near grass actually renders at, a clump pattern that shades with the sun, and less of
the grazing sky reflection that a smooth floor gets and a grass canopy does not. That is a few
dozen arithmetic instructions in a shader the game already runs, an estimated 0.1 to 0.3 ms at 4K.
Paint cannot stand up off the ground. For the fuzzy line where cover meets trunks and the trail,
the documented answer is sparse vertical cards that widen as they thin, which the game's card and
culling code can already draw. Shells fail at the 1 to 3 degree angles a walker sees this ground at.

This is the complement of [the September note on near-field fullness](https://csarko.sh/research/grass-fullness-without-thinning)
[1], which recommended that the terrain carry the far sward. The game is public at
[game-dayhike](https://github.com/csarkosh/game-dayhike).

## 1. Why the far ground reads bare

From a 1.6 m eye, ground 30 m away is seen 3 degrees above edge-on, and ground 100 m away under
1 degree. At those angles "full" is whatever stands up: a tuft 0.3 m tall at 40 m hides several
metres of ground behind it, while a 2 m texture tile is on its coarsest mips and its normal map
averages to flat. So a bare far ground is first a geometry problem and second a shading one: the
ground that shows must have the colour, value and break-up of the cover that would hide it.

## 2. What the code draws past 18 m

The fields that make the foreground, on the high tier:

| Layer | Spacing | Ends | Notes |
|---|---|---|---|
| Blade clumps | 0.5 m cells | 18 m | finer tiers at 4 and 8 m; half counts on medium; none on low |
| Leaf litter (duff) | 1 m cells | 24 m (16 m medium) | none on low |
| Meadow cards | 0.7 m cells | dither out over 28 to 40 m | sink by up to half their height over the same band |
| Sword ferns | 2 m cells | 56 to 70 m | patch-gated, so in drifts |
| Grass-class tufts | 3 m cells | 88 to 110 m | at most one per 9 m²; culled to the view |

Under a closed canopy the grass cover sits at its floor of 0.75 of open ground, and each card's
albedo is multiplied by 1 − 0.5ρ, ρ being the forest density. The meadow cards there come at about
1.1 to 1.9 per m² and the grass-class tufts at about 0.07 to 0.11 per m², so across 28 to 40 m the
number of things standing on the ground drops more than tenfold. That is the edge in the
still. The low tier draws every class at 0.6 of its radius, so there the edge comes at 24 m.

What the terrain does with that ground:

- **Colour.** Baked per vertex: a 34 m mottle between forest floor (0.11, 0.09, 0.06) and grass
  (0.09, 0.15, 0.06), pulled toward a dark crown green (0.045, 0.085, 0.05) by up to 0.85ρ, and
  toward a tan needle bed by 0.75 of the litter weight. Five tiled textures are multiplied over
  it, each divided by its own mean so it adds variation and not hue.
- **Detail.** The textured relief fades out over 80 to 140 m, the finer grass detail over 8 to
  20 m, and a lush-to-dry macro tint (18 and 6 m wavelengths) with the relief.
- **The sward pull.** Inside the blade reach the floor is pulled toward a dark thatch colour,
  keyed on the per-vertex ground cover. It is gone by 18 m.
- **The horizon tint.** From 35 to 90 m the floor is pulled up to halfway toward a tuft colour
  (0.18, 0.22, 0.11), weighted by the grass texture's share. Under trees that share is small,
  because litter turns the ground toward the forest-floor layer, so in the forest this tint
  moves the colour by a few percent.
- **Reflectance.** Grass and forest floor have roughness 1 and half the usual dielectric F0. But
  the compiled terrain stages use Babylon 9.18's legacy energy-conservation path, in which the
  grazing reflectance F90 is the material's specular weight, 1, whatever F0 is. At 1 to 3 degrees
  the Fresnel term is near its grazing end, so the far floor reflects a share of the grey sky that
  a real grass canopy, whose blades shade each other, would not. How much of the grey in the still
  this is has not been measured.

The per-vertex data the far ground would need is already there: ground cover, litter and canopy
density ride on every clipmap vertex, at 1 m spacing out to 64 m and 2 m to 128 m.

For scale on cost: at native 1080p on the high tier the blades in view cost 0.88 to 0.94 ms for an
18 m disc. Carrying blades to 60 m covers eleven times that area. The grass-class tufts cost
0.43 ms unculled and 0.11 ms culled; the far meadow cards 0.44 ms for 8,700 cards. On the
fragment side, the grass floor's hex tiling, six to twelve extra texture fetches and nine to
eighteen sine hashes per grass fragment, measured about +3 ms at four times the pixels.

## 3. What shipped engines document

Every published grass level-of-detail chain ends with the terrain carrying the sward. Ghost of
Tsushima's last tier replaces "entire grass field with a single texture on terrain" [2], and its
blades widen as they thin [3]. Horizon Zero Dawn's grass has three LODs, scales its animation down
over distance and "vertically push[es] the vertices of the mesh down" [4], which is what Day
Hike's far sink already does. Horizon colourises most vegetation from a 512 by 512 world-data
texture of erosion, flow and closeness to water [4]; Day Hike's macro tint is the same idea.
Forbidden West's foliage work concerns cost, a visibility buffer and compute shading for
alpha-tested geometry, not the far look [5].

Frostbite's 2007 terrain draws undergrowth only near the player, in 16 m cells, and its grass
"blends in with the terrain by compositing its color map with the diffuse color from the actual
terrain grass shader. Lighting uses the normal of the heightfield to look the same as the
terrain" [6]. That is the hand-off rule: the card and the ground under it share colour and
lighting, so the card's disappearance changes little. Unreal places grass from the same painted
landscape layer the ground material samples [7] and can feed the landscape's colour to the grass
through a runtime virtual texture [8]. Unity culls detail meshes at a "Detail Distance" [9] and
past a "basemap distance" draws terrain from "a precomputed low res basemap" [10]. Rockstar has not
published Red Dead Redemption 2's ground cover; its rendering talk covers the atmosphere [11].

Smaller renderers say the same. A Godot series ends in an impostor plane with no geometry that
replicates the blades' world-space colour noise and wind, about 2 ms for the whole field on the
author's machine [12]. Helio goes to "terrain material only" past 120 m with 2 m blend bands [13].
Boulanger, Pattanaik and Bouatouch divided a field into three regions: instanced geometry near,
vertical volume slices in the middle, horizontal slices far, with a density map deciding blade
by blade [14], [15].

## 4. Ground-side tricks

### 4.1 A cover colour fitted to the rendered near field

How it works: where the cards are already half gone, the terrain pulls its albedo toward the
colour the near cover renders at, keyed on the per-vertex cover. The target is neither the dirt's
colour nor the card texture's mean but the near crop as rendered: cards, the ground between them,
the canopy shade and the root tint. That is a number to fit from
stills, as the game's horizon tint was fitted ("the mean albedo a lit tuft card reads at, measured
against the far field in the running game").

For this game: the designed but unbuilt far-sward pull (cover-keyed, 24 to 30 m) is the start. It
needs two things for the forest. A litter colour mixed in by the per-vertex litter weight, because
under trees the near field is ferns and tan leaves as much as grass. And the cards' own canopy
shade, 1 − 0.5ρ, on the target, or under a closed canopy the far paint is twice as bright as the
cards it replaces.

Cost: two smoothsteps and a few mixes per terrain fragment, no texture fetch. The far band takes
the near field's hue and value, so the 30 m line weakens; texture is 4.2's job.

### 4.2 Clumps that shade with the sun

How it works: real cover at 40 m is a field of light and dark clumps, tussocks lit on the sun side
and pools of shade between them. A value noise at two wavelengths, about 0.8 m for tussocks and
3 m for patches, perturbs the normal through its analytic gradient [16] and darkens the troughs as
micro-occlusion. The clumps then catch low sun on one side and lose it on the other, and move with
the time of day where a painted mottle would not. Ghost of Tsushima drives clump height, colour and
facing from Voronoi cells [2]; a smooth noise does the same job at this distance for less.

Two cautions from the code. The far-sward design's mottle is constant per 1.5 m cell, which on the
ground would show as a grid of squares at 40 m. It needs an interpolated noise. And any procedural
pattern must fade where its cells shrink below two pixels, by the band-limiting rule
`noise × smoothstep(1.0, 0.5, w)` with w from `fwidth` [17], or it shimmers at 100 m.

Cost: about 8 lattice hashes and 20 to 30 further instructions per far fragment, branch-gated
to the band. Under a closed canopy, where light is mostly ambient, the occlusion mottle carries
most of the effect; in sun the normal does.

### 4.3 Grazing sky reflection and a canopy-like response

A flat microfacet floor reflects more as the view turns edge-on. A grass canopy seen grazing shows
blade sides and self-shadowed depth instead, and its reflectance peaks with the sun behind the
viewer, where blades hide their own shadows: the "hot spot" [18]. Cloth renderers model fibre fuzz
with a sheen lobe that dominates at grazing angles [19]; Babylon's is material-wide and cannot
follow distance or cover without plugin code.

For this game: scale the specular weight, which in the compiled path sets F90 as well as F0, down
by the far-cover weight through the same regex rewrite the terrain already uses for roughness and
F0. Then add a small brightening toward the backscatter direction and a darkening toward a grazing,
front-lit view. Cost: a few instructions. The first half can be tested before any code: setting the
terrain material's `metallicF0Factor` to zero at run time is a uniform change, and a crop of the
far band with and without it says how much of the grey is sky.

### 4.4 Macro variation

The macro tint fades with the 80 to 140 m relief and is weighted by the grass texture's share, so it
is missing exactly past 80 m and under trees. Keying it on cover and running it to the fog costs
nothing new: the noise is already evaluated. Roughness break-up is moot at roughness 1.

## 5. Silhouette tricks

Paint cannot occlude a trunk's base. What makes ground look covered at a grazing angle is the
irregular line where cover meets anything standing on or crossing it.

**Shells.** Copies of the ground offset upward, each hashing and discarding fragments, read as
fur from above [20], [21]. At grazing angles NVIDIA's reference says "the shells become too
transparent and their gaps become visible", which is why fur adds fins [22]. Here, a 1 m noise
cell at 50 m seen at 1.8 degrees, through the game's 80-degree lens, projects to about 25 pixels
wide and under 1 pixel tall at 4K, so a shell reads as horizontal dashes. Shells suit the 0 to 4 m
ring the September note named, not this one.

**Ray-marched slices in the ground shader.** Habel, Wimmer and Jeschke trace a grid of implicit
vertical grass slices inside the terrain's fragment shader, with front-to-back compositing, four
iterations sufficing, at 140 fps at 1024 by 768 on a 2006 GPU, against 90 fps for real billboards
[23]. It gives true parallax for flat cover with no geometry. It draws nothing above the carrier
surface, though, so trunks keep their clean bases, and it costs several texture reads per pixel.
The game also declined parallax on grass near the eye because it drags the texture sideways as
the player walks; at 40 m that drag is under a pixel, but the cost is not.

**Screen-space fuzz and horizon cards.** A post pass cannot find the ground-to-trunk contact, both
being at one depth; a card ring at a fixed distance breaks on relief.

**Trunk-base grounding.** The cheapest silhouette is on the trunks. Past 25 m, darken and tint
the lowest 0.3 to 0.5 m of bark toward the far cover colour with a noisy upper edge, so the trunk
seems to stand in something. It is fragment arithmetic on trunk pixels only. Without discarding
pixels the bark stays opaque and keeps early depth rejection.

## 6. Card and impostor tricks

**Sparse vertical cards, wider as they thin.** Vertical slices are the right primitive at a
grazing angle; that is Boulanger's middle region [14], [15]. Ghost of Tsushima's policy is a constant
count per tile as tiles double in size, "3 out of 4 blades are dropped" per step [2], with the
survivors widened [3]. For Day Hike, a renderer-only fill across 28 to 80 m, keyed by a per-instance
hash so the survivors of each thinning are fixed and nothing pops, using the meadow card's 20-vertex
LOD, widened continuously in the vertex stage rather than rescaled at each rebuild, and run
through the existing frustum filter, which keeps 19 to 26 % of grass instances at the measured
poses. Starting at 0.5 per m² at 28 m and thinning fourfold per doubling of distance, about 2,600
instances cover the band and 500 to 700 survive the view: under 0.1 ms of vertex work by the far
meadow cards' measured cost, plus alpha-tested fill in a thin screen band. These cards give what paint cannot: a broken line
against trunks and the trail.

**Baked billboards.** The forest's far trees are one alpha-tested quad per species, baked at run
time to 256 by 256 under the sky's light, thin-instanced to 2 km. The same bake could make a grass
atlas, but a lit bake keeps the light it was baked under, which grass at 50 m cannot hide as a
crown at 500 m can, and a 20-vertex card is nearly as cheap as a quad. An albedo-only bake, lit at
run time, is the fallback if the card texture reads wrong at this distance.

**Dither-free fades.** Dither bands cost more the wider they are. Sinking cards into the ground,
as Horizon does [4] and the meadow's far band already does, is the dither-free fade at a grazing
angle.

## 7. Lighting tricks

**One lighting model across the hand-off.** The cards are lit with a wrapped diffuse (wrap 0.35) and
a normal forced toward the viewer; the terrain is lit Lambertian. In shade or low sun the cards
read brighter on their dark side than the ground beside them. Frostbite's rule [6] applies:
weight the terrain's per-light diffuse toward the same wrap by the far-cover weight, through the
per-light regex the foliage already uses. Cost: a few instructions per light.

**Translucency.** Horizon's grass glows when backlit, from the light behind it, the view-light
angle, albedo, thickness and occlusion [4]. Far cover seen toward a low sun should do the same.

**Shade between clumps.** At 30 to 100 m the shadow cascades are coarse and the ground has no
self-shadowing below its vertex spacing; 4.2's trough occlusion stands in, matched to the near
crop's luminance within the 0.8 to 1.25 ratio the September measure set.

## 8. What no source measured

No source gives a frame time for a terrain-only far-cover shader, nor for the reflectance cut.
The estimates here scale the game's own measurements, the hex tiling's +3 ms at four times the
pixels and the far cards' 0.44 ms, and need the game's paired method at the canopy and meadow
poses. How much of the far grey is sky reflection, rather than fog and palette, is open; it is a
one-uniform test. And whether paint holds up on a walk toward it, where it must turn into cards,
can only be judged walking.

## 9. Sources

1. C. Sarkosh, "Grass fullness without thinning the field," csarko.sh, Sep. 26, 2026. Accessed: Oct. 9, 2026. [Online]. Available: https://csarko.sh/research/grass-fullness-without-thinning
2. T. Abrodi, "Grass in Ghost of Tsushima," tigerabrodi.blog. Accessed: Oct. 9, 2026. [Online]. Available: https://tigerabrodi.blog/grass-in-ghost-of-tsushima
3. E. Wohllaib, "Procedural Grass in 'Ghost of Tsushima'," GDC Advanced Graphics Summit, 2021. Accessed: Oct. 9, 2026. [Online]. Available: https://gdcvault.com/play/1027214/Advanced-Graphics-Summit-Procedural-Grass
4. G. Sanders, "Between Tech and Art: The Vegetation of Horizon Zero Dawn," GDC, 2018. Accessed: Oct. 9, 2026. [Online]. Available: https://media.gdcvault.com/gdc2018/presentations/gilbert_sanders_between_tech_and.pdf
5. J. McLaren, "Adventures with Deferred Texturing in 'Horizon Forbidden West'," GDC, 2022. Accessed: Oct. 9, 2026. [Online]. Available: https://www.gdcvault.com/play/1027553/
6. J. Andersson, "Terrain Rendering in Frostbite Using Procedural Shader Splatting," SIGGRAPH 2007 Advanced Real-Time Rendering course notes. Accessed: Oct. 9, 2026. [Online]. Available: https://www.advances.realtimerendering.com/s2007/Andersson-TerrainRendering(Siggraph07)-CourseNotes.pdf
7. Epic Games, "Grass Quick Start," Unreal Engine documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/grass-quick-start-in-unreal-engine
8. Epic Games, "Runtime Virtual Texturing Quick Start," Unreal Engine documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/runtimevirtual-texturing-quick-start-in-unreal-engine
9. Unity Technologies, "Terrain settings: other settings," Unity 6 manual. Accessed: Oct. 9, 2026. [Online]. Available: https://docs.unity.com/en-us/engine/6000.5/manual/creating-environments/script-terrain/terrain-other-settings
10. Unity Technologies, "Terrain.basemapDistance," Scripting API. Accessed: Oct. 9, 2026. [Online]. Available: https://docs.unity3d.com/530/Documentation/ScriptReference/Terrain-basemapDistance.html
11. F. Bauer, "Creating the Atmospheric World of Red Dead Redemption 2," SIGGRAPH 2019 Advances in Real-Time Rendering. Accessed: Oct. 9, 2026. [Online]. Available: https://history.siggraph.org/?p=76936
12. K. Bittner, "Grass Rendering Series Part 4: Level-of-Detail Tricks for Infinite Plains of Grass in Godot," hexaquo.at. Accessed: Oct. 9, 2026. [Online]. Available: https://hexaquo.at/pages/grass-rendering-series-part-4-level-of-detail-tricks-for-infinite-plains-of-grass-in-godot/
13. Pulsar, "Rendering a million blades of grass: Helio's GPU-driven foliage system," Aug. 2, 2026. Accessed: Oct. 9, 2026. [Online]. Available: https://pulsarnative.com/blog/2026-08-02-helio-foliage-system
14. K. Boulanger, S. Pattanaik, K. Bouatouch, "Rendering grass terrains in real-time with dynamic lighting," SIGGRAPH 2006 sketch. Accessed: Oct. 9, 2026. [Online]. Available: https://history.siggraph.org/learning/rendering-grass-terrains-in-real-time-with-dynamic-lighting-by-boulanger-pattanaik-and-bouatouch/
15. N. Porcino, "Realtime grass rendering," meshula.net archive. Accessed: Oct. 9, 2026. [Online]. Available: https://nickporcino.com/meshula-net-archive/posts/post119
16. I. Quilez, "Value noise derivatives.". Accessed: Oct. 9, 2026. [Online]. Available: https://iquilezles.org/articles/morenoise/
17. I. Quilez, "Bandlimiting.". Accessed: Oct. 9, 2026. [Online]. Available: https://iquilezles.org/articles/bandlimiting/
18. B. Hapke, D. DiMucci, R. Nelson, W. Smythe, "The cause of the hot spot in vegetation canopies and soils: shadow-hiding versus coherent backscatter," Remote Sensing of Environment, 1996. Accessed: Oct. 9, 2026. [Online]. Available: https://ntrs.nasa.gov/api/citations/19970021464/downloads/19970021464.pdf
19. A. Conty Estevez, C. Kulla, "Production Friendly Microfacet Sheen BRDF," SIGGRAPH 2017 Physically Based Shading course. Accessed: Oct. 9, 2026. [Online]. Available: https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf
20. 80 Level, "Here's how games render grass and fur," 2023. Accessed: Oct. 9, 2026. [Online]. Available: https://80.lv/articles/classic-video-games-trick-for-rendering-grass-fur
21. G. Gunnell (Acerola), "Shell Texturing," GitHub. Accessed: Oct. 9, 2026. [Online]. Available: https://github.com/GarrettGunnell/Shell-Texturing
22. NVIDIA, "Fur (using Shells and Fins)," Direct3D SDK 10.5. Accessed: Oct. 9, 2026. [Online]. Available: https://developer.download.nvidia.com/SDK/10.5/direct3d/Source/Fur/doc/FurShellsAndFins.pdf
23. R. Habel, M. Wimmer, S. Jeschke, "Instant Animated Grass," WSCG 2007. Accessed: Oct. 9, 2026. [Online]. Available: https://www.cg.tuwien.ac.at/research/publications/2007/Habel_2007_IAG/Habel_2007_IAG-Preprint.pdf
