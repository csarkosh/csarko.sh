---
description: Why game grass reads as flat, what shipped meadows do instead, wind as one shared field, and what Babylon.js on WebGL2 can afford at 60 Hz.
published: 2026-09-15
updated: 2026-10-10
source: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-09-15-grass-and-trail-realism.md
---
# Grass, wind and trails in a browser meadow

**Question:** Day Hike's grass and trails read as flat and game-like. The goal is grass that
looks fuller, has volume and moves with a wind the rest of the world shares, and a trail that
reads as trodden ground rather than a stripe of another texture, all inside a 60 Hz frame
budget. What do modern games do to get there, which of it is a grounding problem and which a
geometry problem, and how much of it can Babylon.js 9.18 on WebGL2 do in 16.7 ms?

**Short answer:** "flat and game-like" is mostly a *grounding* failure, not a triangle-count
failure, and most of the fix is cheap. Every shipped meadow in this survey does four things
Day Hike does not: it tints the grass to the ground it stands on (The Witcher 3's pigment map,
Horizon's world-data colourisation), it darkens root to tip and varies height and colour *per
clump* rather than per instance (Ghost of Tsushima's Voronoi clumps), it lights the field as
one rounded mass instead of N flipping cards (Horizon flattens the view-space normal), and it
lets low sun through the blades. Wind that reads as *wind* is one global vector whose strength
is modulated by noise travelling downwind, with a permanent lean the oscillation rides on,
sampled by grass, bushes, trees, particles and sound alike; Day Hike's is three zero-mean sines
phased on a fixed axis, with trees rigid and mist ignoring it, so it reads as vibration. A real
trail is a bench cut into the hill with a four-band edge whose width varies along its length;
Day Hike's is a constant-width smoothstep with the grass cut off in a soft ring, and the hard
grass ring and the hard texture edge reinforce each other. In Babylon nearly all of the fix is
vertex-stage plugin work, per-instance attributes written in a rebuild that already runs, and
fragment arithmetic inside a branch that already exists. The one structural change worth its
risk is opaque blade clumps for the nearest 10 to 20 m, because the binding frame cost is
alpha-tested fill, not triangles, and opaque geometry gives early depth rejection back.

The game is public in [game-dayhike](https://github.com/csarkosh/game-dayhike). Sources are
listed at the end; anything marked *unverified* comes from a secondary write-up of a talk
whose slides could not be read.

## 1. What the grass, the wind and the trail are today

**Grass** is ground clutter: two card-based tuft models, 0.32 and 0.40 m tall, alpha-masked and
double-sided, 290 triangles at the near level of detail and 130 at the far, scattered on a 3 m
lattice out to 110 m with a 4,400-instance budget that is effectively a tuft in every cell.
Under it a 20-triangle alpha-masked meadow-carpet card sits on a 0.7 m lattice to 40 m, up to
10,600 instances, with its near/far seam at 18 m. Flowers and bushes are further card models.
Everything is thin instances, one draw per model per level of detail, 28 draws for all clutter,
with a 16-float matrix and a 4-float fade-band attribute per instance. Grass receives no shadows
(a receiver pass measured about 4 ms for bush-scale receivers) and has no ambient occlusion; its
colour is one texture with no per-instance variation, no tint from the ground and no
translucency. The ground under it is a 2 m tiled grass photo texture with normal and
roughness/AO/height detail.

The level-of-detail swap and the disc edge dissolve through a screen-space dither, described in
[No visible pop-in](/research/no-visible-pop-in). That plugin is also why every card material runs
with early depth rejection off: any `discard` in a fragment shader disables it for the whole
draw, measured at +10.7 ms roadside and +20 ms meadow when the dither was attached to opaque
materials too.

**Wind** is a vertex-stage material plugin shared by grass, meadow, flowers, bushes and the
forest understory. Amplitude scales with the square of the height fraction so bases stay
anchored; the phase is `x·0.24 + z·0.08 + t·ω`, a fixed axis; the motion is a 0.06 Hz gust sine
plus a second harmonic plus a 2 Hz flutter, all zero-mean, with tips displaced up to 6 cm. Time
wraps every 300 s and every frequency is an exact multiple of 2π/300 so the wrap is continuous.
Only the gust frequencies are shared: the dust motes evaluate the same two sines at the origin
to drift. **Trees do not sway** (the plugin is attached to the understory only), mist banks have
no drift term, rain falls with a fixed spread, and the ambient wind sound follows the weather
preset rather than the gusts.

**The trail** is a fragment-shader paint on the terrain. A bucketed segment table finds the
nearest trail edge per fragment; inside a 1 m bed half-width plus a 0.5 m margin the ground
blends to a tiled gravel layer under a wet-earth tint over a 0.4 m smoothstep, and a bank band
paints bare forest floor on the uphill side. Normals, roughness and F0 mix the same way. The
edge is a clean ramp of constant width: no noise, no height-aware blend (the height channel of
the gravel and floor relief textures is fetched and never used), no relief beyond the tiled
normal map, and no wetness. Grass presence fades in over 2 to 5 m from the trail centre by a
smoothstep in the scatter gate, so the grass stops in a soft ring; there is no shorter, leaning
or trampled grass, no litter or pebbles at the edge, and no variation of width or wear along the
trail's length. The bed is the ground: the trail follows the terrain and is not cut into it.

**The frame** on the high tier renders into a full-resolution scene pass and then the grade
chain. That scene pass is a post-process render target, and a Babylon `PostProcess` defaults to
one sample [1], so **medium and high have no multisampling today** even though the engine is created
with `antialias` on; only the low tier, which has no chain, gets it.

## 2. Why it reads flat

Mapping the survey against section 1, the game-like read has seven causes, in order of how much
each costs to fix:

1. **The grass does not belong to the ground.** No tint from the terrain colour at the base, no
   root-to-tip darkening, no occlusion where blade meets soil. Every shipped meadow does all
   three, and The Witcher 3's next-gen patch is the negative proof: removing HBAO visibly broke
   the "grass shadows", and the fix that shipped was restoring it [2].
2. **Every tuft is the same tuft.** Per-instance variation is one scale and one yaw. The natural
   read comes from *spatially correlated* variation: in Tsushima the clump, not the blade, owns
   height, colour, facing and lean [3].
3. **Cards flip dark as they turn.** Double-sided cards lit by their geometric normal go from
   lit to black across a clump. Horizon forces the view-space normal's Z positive for grass and
   canopies so the field lights as one mass [4].
4. **Nothing is backlit.** Low sun through grass is the strongest photoreal cue for thin
   foliage, and the eerie dusk frames are exactly where it would pay.
5. **The wind vibrates instead of blowing.** Zero-mean sines on a fixed axis, no lean, no
   travelling front, and half the world not listening. Horizon's grass sway is biased positive
   so the grass *leans* and the sine rides on the lean [4]; AMD's formula projects world position
   onto the wind direction so the wave physically travels downwind with a Perlin-ragged front [5].
6. **The trail is a stripe.** Constant width, a smoothstep edge, a ring where grass stops, no
   bench, no litter, no wetness. Real trails are four bands wide with a ragged boundary, sunk
   into the turf with a soil face uphill, wider at wet spots and narrower on side-hill. The
   Skyrim modding community's decade of seam-fix mods [6], [7] shows that a hard grass cut-off and a hard
   texture edge make each other worse.
7. **The far field is thin.** With coverage falling and no width compensation the 110 m disc
   reads sparse at range. Tsushima drops three of four blades per tile doubling [3] and AMD widens
   each survivor by the ratio [5], so apparent density stays constant.

The 60 Hz contract shapes the answer. Clutter is about 0.97 M triangles a frame, which any GPU
of the last decade sets up in well under a millisecond. The cost is fill: 4 to 6 M PBR fragment
invocations across three to five layers of alpha-tested cards over the bottom half of the frame,
with early depth rejection off. That is why the fixes for causes 1 to 5 are nearly free, being
vertex work and per-instance data, and why the one geometry change that matters is the one that
removes the `discard`.

## 3. How shipped games make grass full and alive

### The games

- **Ghost of Tsushima** (GDC 2021, two talks) [3], [8]. Blades are cubic Bézier curves generated per tile
  in compute, 15 vertices near and 7 far with positions blended across the switch, a blade-folding
  trick that builds a second blade from a short blade's spare vertices, and **Voronoi clumping**
  where the clump controls height, colour, facing and lean. Distant tiles double in size and keep
  the blade count, so three of four blades drop per step. Edge-on blades are stretched in view
  space so they never collapse to a sliver [9]. Shadows are dithered-depth impostors on raised terrain
  vertices plus screen-space shadows, never a real shadow pass. Terrain textures drive the grass
  kind, the clump factor, the blade size and the terrain material from one set of maps. The
  often-quoted 83,000 blades at 2.5 ms is *unverified*.
- **Horizon Zero Dawn** (GDC 2018, slides read in full) [4]. Grass levels of detail are 20 to 36, 10
  to 18 and 10 to 18 triangles: the fidelity is not in the triangle count. Ambient motion is two
  scales, both published: a large-scale term `2·sin(centre.x + y + z + t) + 1` phased by the
  **object centre** and biased positive, and a small-scale flutter
  `0.065·sin(2.65·(p.x + y + z + t))` along the normal, phased by each vertex's world position.
  Three more displacements: a camera-based tilt so cards never present a pure edge, ground hugging
  in the vertex shader, and, with distance, animation scaled to zero and vertices pushed *down* so
  far grass sinks instead of popping. Grass has no AO texture; occlusion comes from the
  translucency texture influencing roughness. Translucency is light-from-behind times view/light
  angle times thickness times baked AO times an artistic boost. Normals use `abs()` on the
  view-space Z for grass and canopies. On overdraw: a depth-only pass then the geometry pass with
  depth EQUAL, "zero percent overdraw", listed first among what worked; a 256×128 alpha texture to
  stay in cache; and a coverage-preserving custom mip chain so distant masked cards keep their
  mass. Vegetation has a separate, cheaper, non-masked, non-animated shadow-caster mesh for the
  near cascades.
- **The Witcher 3** (GDC 2014, transcript read) [10]. Grass is auto-distributed by terrain material,
  about ten types per level, each with its own culling grid and draw distance so species fade out
  staggered. The **pigment map** renders the terrain top-down from the nearest clipmap at its
  lowest mip, then colourises instances by sampling it in the vertex shader with a bottom-up
  falloff per type, slightly less for near instances and slightly more for far ones. That one
  fetch grounds the grass and hides the card-to-ground-texture transition at once. The whole
  distribution costs under 1 ms.
- **Crysis and CryEngine** (GPU Gems 3, chapter 16) [11]. Vertex colour carries stiffness, per-leaf
  phase, overall stiffness and baked AO. Main bending runs along the wind scaled by height;
  detail bending comes from four triangle waves at 1.975, 0.793, 0.375 and 0.193 Hz with the
  phase from object, branch and vertex position; wind is a sum of sources, a global vector plus
  local emitters. Translucency is `(−N·L)·(E·L)·thickness` from a 128×128 map.
- **AMD GPUOpen mesh-shader grass** (documented in full) [5]. 32 blades a patch, 8 vertices and 6
  triangles a blade. Density falls off as `lerp(32, 2, pow(d/(1.05·end), 0.75))` blades with
  `width *= 32/blades`, so the survivors widen by exactly the ratio and apparent density holds
  without a cross-fade. Wind phase is the world position projected onto the wind direction plus
  time plus `4·perlin(0.1·p)`, two axes at 0.5 and 1.0 Hz with 2:1 amplitude, so the tip traces an
  ellipse and the front travels downwind and ragged.
- **Unreal Engine 5 and Hellblade II.** Epic's own guidance is that alpha masking "introduces a
  lot of overdraw" and keeps foliage flat [12]; the direction is real geometry. Ninja Theory called
  foliage the major bottleneck and bulk-converted masked cards to geometry cut to the mask [13]. The
  three.js counter-case is worth holding: one 3 M-instance workload went the other way, from a
  20-triangle blade to a 2-triangle quad, because it was vertex-bound [14]. The right answer depends
  on which resource binds, and here it is fill.
- **Red Dead Redemption 2** ships "Grass Shadows" as its own toggle [15]: grass casts real dynamic
  shadows, and it is expensive enough to be optional. The algorithm is not published.
- **Alan Wake 2** skins vegetation as GPU character rigs, about 300,000 bones a frame in one
  area [16]. An existence proof for art-directed motion, out of budget for a browser.
- **Breath of the Wild, Genshin Impact, Flower and Sky** have no public technical source for
  grass or wind at all; every claim about them is fan reverse-engineering and is *unverified*.
- **Browser references.** SimonDev's three.js Tsushima-style grass [17] runs 300,000 or more blades
  with the geometry shaped in a 2,000-line vertex shader; Codrops reached 1 M alpha-card instances
  by chunking into 256 instanced meshes with three levels of detail each [18]; a Babylon forum
  `GrassBuilder` plants 1 M blades as thin instances with frustum culling done in the vertex
  shader; another Babylon thread holds 100,000 or more blades at 60 fps [19], [20]. Day Hike's 15,000
  instances are two orders of magnitude below the browser ceiling [21]. Shell texturing is the wrong
  tool here: shells separate into visible layers at grazing angles [22], which is exactly the view from
  1.6 m over 0.35 m grass.

### The recipe, ranked by payoff per cost

1. **Tint the grass to the ground it grows in**, strongest at the base, more at distance [10], [23].
2. **Root-to-tip darkening, plus per-clump height and colour variation** from cellular noise.
3. **Flatten the normals** so the field lights as one volume and cards stop flipping.
4. **Translucency** for backlit blades at low sun [11], [24].
5. **One global wind field** with the phase travelling downwind and a biased lean, three tiers of
   motion (object bend, sway, vertex flutter), sampled by everything that moves.
6. **Density falloff with width compensation**, per-species draw distances, and animation that
   scales to zero and sinks with distance.
7. **Occlusion where grass meets ground by any means**: a gradient, a cheap proxy, never grass in
   the shadow map at full quality.
8. **Overdraw discipline**: depth prime with EQUAL, cards trimmed to the silhouette, a small alpha
   texture, coverage-preserving mips, opaque geometry where the budget allows [4], [25].
9. **Interaction**: a bend around the players, and a decayed top-down render target if trampling
   memory is ever wanted.

## 4. Wind as one field

The games that read as windy share one architecture, and it is the thing Day Hike's wind lacks.

- **Ghost of Tsushima's** model is stated on a slide as "Vector + Noise + Vorticles" [8], with the
  principle "volume over accuracy". A single global wind vector, direction broadly constant,
  whose *magnitude* is modulated by time-varying Perlin noise across the world: that modulation
  is the gust front rolling across a field. Vorticles are invisible spheres summed brute-force,
  hundreds of them, expressing a vortex, a linear gust or a blast; footfalls feed in as local
  sources. Grass, foliage, cloth and about 100,000 particles all sample the same field, which is
  why a gust reads as one event happening to the world.
- **Horizon's** Global Wind Force Field is one compute pass at about 150 µs [4], with four spring
  categories (trees, plants, grasses, special) so every asset class reads the same field at its
  own stiffness. Large-scale sway is phased by the object centre so a whole tuft moves together;
  flutter is phased by vertex position so the blades within it break up. The sway is biased
  positive.
- **Crysis** is the same shape a decade earlier: a global vector plus attenuated local sources,
  with hierarchical bending phased from object, branch and vertex [11].

Concretely, for this game, one engine-free wind module computes direction, base speed from the
weather, and a two-octave gust plus a flutter:

```glsl
// evaluated identically on the CPU and in the vertex plugin
float d    = dot(windDir, p.xz);              // world position projected onto the wind
float gust = A1 * sin(k1 * d + w1 * t)
           + A2 * sin(k2 * d + w2 * t);       // two octaves travelling downwind
float bend = lean + gust;                     // biased, so the field leans and the sine rides it
```

The grass, meadow, flowers, bushes, understory and **trees** would evaluate it in the vertex
plugin, trees at a smaller amplitude and a lower wavenumber, the first time the canopy would
move. The motes (already), the mist banks' drift, the rain slant and the ambient wind gain's
low-frequency oscillator would evaluate it on the CPU.

Two constraints hold the design. The wind must stay analytic rather than a scrolling texture:
the whole value of one field is that the CPU can evaluate exactly what the shader evaluates,
which the motes already rely on, and a texture would need a CPU mirror. And every new frequency
must remain an exact multiple of 2π/300 or the 300 s wrap snaps. Nothing in the wind may touch
the simulation: sway is cosmetic, peers need not agree on phase, and a wind constant migrating
into a tunable would move the
[level id](/research/procedural-world-as-a-pure-function) that peers check before they connect.

A storm is then a parameter, not a feature: base speed up, gust amplitude up, lean angle up, the
audio oscillator deeper, all from one record the weather preset owns.

## 5. Trails through grass

### What a real trail edge looks like

From trail-construction handbooks and the recreation-ecology literature:

- A built trail is a **bench cut into the hillside**: a 0.6 to 0.9 m tread, outsloped about 5%
  and "barely detectable to the eye", with a backslope of 1:1 in soil, 2:1 in rock and 1:2 in
  loose ground, and rounded transitions at both edges [26], [27], [28]. The tread sits centimetres to tens of
  centimetres *below* the uphill turf, with a short soil face uphill and a slight lip or fill
  shoulder downhill.
- Construction removes duff and vegetation **down to mineral soil** [26]: the tread is a different
  material, not a different colour of the same one. The duff is replaced along the edges, which
  is why real margins carry loose litter, twigs and torn turf that belongs to neither side.
- Traffic compacts the tread into something close to rammed earth: denser, darker, harder and far
  less permeable [29]. The bed holds puddles and sheens after rain while the meadow does not, dusts in
  dry weather, and dries lighter and greyer on top while staying dark below, so every fresh scuff
  is darker than its surroundings.
- **Four bands from the centre out**: a 40 to 75 cm core of bare compacted soil with 1 to 5 cm of
  print relief and stones and roots standing proud; a 10 to 30 cm loose margin with the highest
  small-debris density in the scene; 20 to 60 cm of trampled vegetation, shorter, thinner, leaning
  outward, bases stained; then full vegetation across a boundary that is *ragged* at the 10 to
  30 cm scale [30], [31].
- **Width varies along the length**: wider and braided at wet spots, which is self-reinforcing; a
  boot's width on side-hill benches; gone on rock and in leaf litter; scuffed bare in a radius at
  junctions and viewpoints [30], [31].
- Colour runs pale dusty grey-brown on the compacted crown, darker in depressions and under the
  edge overhang, near-black where litter is ground in, and the parent rock's hue where it shows.
  Wet trail is 1.5 to 3 times darker and much glossier at grazing angles.

### The games

- **The Witcher 3** is the closest published match to this architecture: two materials per texel,
  an overlay revealed by a *geometric* quantity (slope, at seven quantised thresholds) rather than
  a painted ramp, and **per-material blend sharpness**, blurry for mud, sharp for grass and sand [10].
  Its grass lookup "replicates terrain shader behaviour at vertex precision", so the scatter and
  the ground can never disagree about where the path is.
- **Red Dead Redemption 2** keeps a top-down trail map around the camera, described in a
  Take-Two patent [32]: 4096² over 48 m for shallow mud, about 1.2 cm a texel, 2048² over 96 m for
  snow, with footprints and wagon ruts written as decals, consumed by parallax for mud and
  tessellation for snow, and aged by a per-frame blur so old prints slump while new ones stay
  crisp. A frame capture [33] confirms a 2048² 16-bit height map in the shipped build.
- **Ghost of Tsushima** drives grass kind, clump factor, blade size and terrain material from the
  same terrain textures, and blends distant terrain toward the grass tip colour so culled distance
  keeps the foreground's density [3]. Its road network is authored at scale; the specifics are
  *unverified*.
- **Hellblade II** builds its trails as sculpted terrain from survey height data: the tread is a
  real sunken bench with a real uphill cut, so it silhouettes and self-shadows [13].
- **Death Stranding** grows paths from traffic and decays unused ones [34]. The aesthetic consequence
  is that definition varies along the length, and a constant-width path reads as unused.
- **Skyrim modding** is the failure catalogue: the road seams are among the worst in the game,
  grass mods hid them by growing into the road, and the mod that stopped grass growing on roads
  re-exposed the seams [6], [7]. A hard grass ring and a hard texture edge reinforce each other.
- **Firewatch's** trails read through silhouette and framing, a gap in the shrub layer bounded by
  taller vegetation and deadfall, more than through ground fidelity (*unverified* as a documented
  technique). **Tears of the Kingdom's** foliage still does not react to the player, which is
  evidence that interaction is not required for a path to read: placement and colour are.

### The recipe, ranked for a first-person walker

1. **Sink the bed and cut the uphill edge.** A few centimetres of offset plus a short soil face
   gives self-shadowing, a real silhouette against the grass and a dark line at the edge that no
   texture blend fakes. It is the one thing every reference has and a painted trail cannot.
2. **Break the edge with noise at two scales**: perturb the distance to the centreline with fBm,
   better still domain-warped, at 2 to 5 m for width variation and 10 to 30 cm for raggedness.
   Pure arithmetic.
3. **Height-based blending, not a lerp**: `smoothstep(t, t + depth, heightBed − heightTurf)` times
   the mask [35], so grass and litter overhang the dirt, with a per-material sharpness.
4. **Grass shortens and sickens instead of stopping**: a height-only scale falloff (scaling all
   three axes reads as dotty) and a separate tint toward dried grass, both about 50 cm in the
   scatter-tool literature [36], plus outward lean and a few flattened blades inside the margin.
5. **Four bands, not one.** The loose margin is where pebbles, twigs and leaves go: small opaque
   props break the silhouette far more cheaply than more blades.
6. **Along-length wear** from one 1-D noise on the trail parameter, modulating half-width, bare
   fraction and wetness.
7. **Sub-5 cm relief on the bed** by offset-limited parallax on prints and ruts, amplitude well
   under the feature size. Parallax never fixes the silhouette, which is another argument for
   doing point 1 in geometry.
8. **Tint both ways**: grass base toward the ground colour, ground toward the grass tip colour at
   distance.
9. **Wetness as a spatial mask** with Lagarde's rules [37] (`diffuse *= lerp(1, lerp(1, 0.2, porosity),
   wet)`, gloss smoothed, F0 unchanged), puddles on the trail and not the meadow, because
   compaction is what makes a trail.
10. **Kill tiling on the bed** with histogram-preserving stochastic tiling (three samples and a
    small lookup table) [38], [39] or two UV scales blended by low-frequency noise.
11. **Litter on forest sections**, filling the margin and spilling onto the bed.
12. **Night and the headlamp** (reasoned, *unverified*): a near-axial light makes grazing specular
    the dominant cue and albedo banding nearly vanishes, so a trail legible only by albedo
    disappears under the lamp. Edge geometry and wet specular have to carry it after dark.

The meta-lesson from three shipped systems and one modding decade: **the ground shader and the
scatter must consume the same field.** Day Hike's trail paint and grass gate already both read the
trail distance; the work is making them agree about the four bands rather than one.

## 6. What Babylon.js 9.18 can do, and what it costs

Claims below were checked against the installed engine, not the documentation alone.

### Geometry without compute

WebGL2 has no compute, and Babylon's transform feedback (it exists, and GPU particles use it) has
no mesh-level integration, so blade lists cannot be generated on the GPU the Tsushima way. The
path that fits is a **static blade-clump mesh**: 16 to 32 blades of 5 to 7 triangles each with one
extra static `vec4` per vertex (blade index, height fraction, per-blade random, side),
thin-instanced on the existing 0.7 m meadow lattice **for the near band only**, with today's card
tufts kept beyond. A material plugin can declare the attribute through `getAttributes` exactly as
the existing distance-fade and ground-conform plugins do [40], [41]. A 24-blade clump at 6 triangles is 144
triangles, half of today's 290-triangle near tuft.

A thin instance cannot be narrower than its 64-byte matrix, since the stride is hard-coded and
the count is derived from the matrix buffer [42], so per-instance cost is 64 bytes plus 16 for the fade
bands plus 16 for one new `vec4` carrying tint, height and hash: 96 bytes, the same order as
today. `gl_InstanceID` is available [43] but is **not stable across the 3 m rebuild**, so per-clump
randomness must hash the instance's world position, which is already in scope at the vertex hook,
or ride the attribute.

The clump footprint must stay under the fade ramp's 4.24 m floor, because the whole instance
fades as one unit; a 0.7 m clump is safe. The honest near band for blades is **10 to 20 m**: a
5 mm blade is three pixels wide at about 2.2 m at 1080p and a 2 cm cluster at about 9 m, and below
three pixels the 2×2 quad rasterisation tax outweighs the fill saving. That lines up with the
carpet's existing 18 m seam.

### Alpha, overdraw and antialiasing

- Babylon's PBR alpha test discards early, after the albedo fetch and before the BRDF [44], so a killed
  fragment is cheap. The structural cost is that the `discard` turns early depth rejection off for
  the whole draw [45], [46]. Opaque blades have no `discard`, get early-Z back, and resolve overdraw with the
  depth test instead of the shader. **The hardest design constraint follows from this**: the
  distance-fade dither would have to become a geometric hand-off for blades (scale to zero, sink,
  or a hard seam under the carpet), or the benefit is lost. The attach function already refuses
  opaque materials by design.
- **Alpha-to-coverage is not a drop-in.** The engine has the enable call but no material uses it [47],
  and the PBR shader sets `alpha = 1.0` immediately after the alpha test whenever the
  material is alpha-tested and not alpha-blended [44], so coverage would see full alpha.
  Skip it.
- **Multisampling is a one-line win once blades are opaque**: set `samples = 4` on the scene pass,
  clamped by the engine to its maximum and tolerant of Safari forcing it back to 1 [1], [47]. Expect +0.5 to
  +1.5 ms.
- **A depth pre-pass** (`needDepthPrePass`) reruns the vertex shader and the discard to buy early-Z
  in the colour pass; with three to five layers of full PBR it plausibly pays, but that is a
  measurement, not a plan. **Sorting the instance buffer nearest-first at rebuild** is nearly free,
  since the collector already computes the squared distance, and is the real front-to-back win;
  Babylon's submesh sort does nothing for a single-draw bucket.

### Volume cues, all near zero cost

- Root-to-tip darkening from the height-fraction attribute, in the vertex stage.
- **Base tint from the ground colour computed on the CPU** during the rebuild. The terrain module
  exposes the engine-free surface albedo the clipmap already bakes into vertex colours, and the
  rebuild already takes a terrain sample per instance. There is no ground colour map to fetch in
  the vertex shader, so the CPU route is the only cheap one, and it needs no sampler.
- Per-instance canopy darkening from forest density, the precedent being the pre-darkened bush
  palette colour.
- **Translucency through the same wrap-lighting plugin the character skin shader uses**, about six
  arithmetic operations per light with no thickness texture. Babylon's own `subSurface`
  translucency costs 1 to 3 ms and recompiles every material variant.
- A per-clump contact shadow sampled in the vertex stage is not reachable cheaply: the cascaded
  shadow samplers are declared fragment-only [48], [49], so it would mean a hand-declared sampler on both
  shader paths and a hand-copied cascade selection.
- Normal flattening and the camera tilt are vertex-stage terms in the same plugin.

### Interaction

Plugin uniforms support arrays [40], so a `vec3 windPlayers[5]` updated per frame in `bindForSubMesh`
bends blades around every player for about 25 arithmetic operations a vertex, under 0.1 ms,
scaling with vertices rather than fragments. The bend must use the clump origin so a clump leans
as a unit, and must never reach the simulation. Trampling memory needs a camera-following render
target read by vertex texture fetch: real, but a whole subsystem for a subtle effect. The
instantaneous bend is about 1 % of the work for most of the read.

### Trail upgrades and the level id

| Upgrade | Where | Moves the level id? |
|---|---|---|
| Height-aware bed and bank blend from the relief height channel already fetched | trail paint fragment, about 6 operations | No |
| Noise-broken edge distance (a world-space fBm must be written; the only GLSL noise in the repo is screen-space) | trail paint, about 20 operations on corridor pixels only | No |
| Analytic edge lip from the bed distance, bending the normal over the last 0.3 m | trail paint | No |
| Wetness: albedo and roughness in the bed centre, puddles from a low-frequency mask | trail paint | No |
| Along-length wear from a 1-D noise on the segment parameter | trail paint and the segment table | No |
| Trampled band: height-only scale, outward lean and dried tint near the trail | clutter rebuild, one extra sample per near grass instance per 3 m crossing | No |
| Sinking the bed and an uphill soil face as vertex displacement of the clipmap inside the corridor | the terrain vertex stage; the simulated walk height must not change | No, if renderer-only |
| Pebbles, twigs and litter as a ninth clutter class | the simulation's clutter cell, density and salt | **Yes** |

The bench is the one renderer-only item with a real risk: if the visual bed sinks while the
simulation's ground height does not, feet float by the sink depth. A few centimetres is under the
view bob; more than that means the bench belongs in the simulated terrain field, which does move
the level id.

## 7. The 60 Hz contract: arithmetic and measurement

**What today costs.** Grass tufts contribute about 686 k triangles a frame and the carpet 206 k,
about 0.97 M with bushes and flowers. That is 58 M triangles a second at 60 Hz, which is nothing.
Fill is the cost: in an open meadow grass covers the bottom 55 to 65 % of a 1080p frame, about
1.2 M pixels, at three to five layers of cards, so 4 to 6 M PBR fragment invocations of which
perhaps half survive the alpha test and pay the BRDF, the two-cascade PCF and the atmosphere fog.
On the integrated GPUs the low and medium tiers target, that is 2 to 5 ms, consistent with the
repo's own +9.6 ms meadow and roughly 4 ms receiver measurements. Grass is a fill-rate problem
wearing a geometry costume.

**What blade clumps would cost.** 3,000 clumps × 24 blades × 6 triangles is 432 k triangles, fewer
than today's tufts, and about 360 k vertices through the PBR vertex shader plus the plugin, so 0.2
to 0.5 ms. The fill picture flips: no `discard`, early-Z on, a nearest-first buffer so later layers
are depth-rejected, and each blade covering a fraction of the pixels its card covered. Expected
net: roughly neutral on triangles, **−1 to −3 ms on fill, +0.2 to +0.5 ms on vertex work**, plus
multisampling becoming affordable. The cheap tier, meaning sections 3 and 5 without the blades, is
bounded by vertex work and a few dozen operations on corridor fragments: well under 0.5 ms in
total.

**How to measure.** Paired branch-versus-main frame-time samples, back to back, in both orders,
with the vsync cap checked before trusting a pair and a warm-up before every sample, at four
viewpoints:

1. Open meadow at noon, for peak fill and overdraw with no canopy shadow. This is the gate.
2. Forest edge, where grass, understory, bushes and the shadow cascades interact.
3. The trail at eerie dusk, with the trail branch live, the headlamp on and the atmosphere chain
   at its most expensive.
4. Deep forest, the frame already nearest the 16.7 ms cliff.

Sample at the high tier natively and at the low tier's 1.5× hardware scaling, because a fill
conclusion inverts with pixel count. The 95th percentile is the stutter tell.

## 8. Candidate directions

Four packages, ordered by payoff per risk. They compose.

**A. Ground the cards (renderer-only, days).** A per-instance `vec4` (ground tint, height and
colour hash, canopy darkening, trail proximity) written in the rebuild; root-to-tip darkening,
normal flattening, camera tilt and a downward sink with distance in the wind plugin;
wrap-lighting translucency on the card materials; nearest-first instance order; per-clump
variation hashed from world position. Buys causes 1 to 4 and 7 of section 2 for about zero GPU
cost and no level-id change. The grass stops looking pasted on before a single blade is drawn.

**B. One wind (renderer-only, days).** One wind module with direction, weather-driven speed, a
biased lean and a two-octave gust travelling downwind with a ragged front, three motion tiers,
consumed by every card class, the understory, the trees, the motes, the mist, the rain and the
audio oscillator, plus the five-player bend. Buys cause 5 entirely.

**C. The trail as a bench (renderer-only except the litter class, about a week).** Height-aware
blending from the channel already fetched, the noise-broken edge, four bands, along-length wear,
wetness, the edge lip, the trampled-grass band, and a few centimetres of visual sink with an
uphill face. Buys cause 6. Pebbles and litter as a clutter class are the optional level-id item
and should batch with any other geometry retune.

**D. Blade clumps for the near band (the structural change, one to two weeks, the risky one).**
The static clump mesh on the 0.7 m lattice to 10 to 20 m, opaque, multisampling on the scene pass,
and a geometric hand-off to the cards beyond. Buys real volume at eye height and the fill budget
that pays for everything else, but it is the only package that can regress the frame, and the fade
constraint means the near/far seam has to be redesigned rather than reused. Gate it on the paired
measurement at the four viewpoints before it is allowed to stay.

The recommended order is A and B together, since they share the plugin and the per-instance
attribute, then C, then D behind its gate. A and B alone should move the read from "flat and
game-like" to "grounded and windy"; D is what makes it "full".

## 9. Traps

- A `discard` anywhere in a fragment shader disables early depth rejection for the whole draw. No
  new fragment feature may add one to an opaque material, and blades must stay opaque.
- A plugin sampler must be declared in the shader source on both the uniform-buffer and non-UBO
  paths; a `getUniforms` string reaches only the non-UBO path [41]. Babylon's null engine reports WebGL 1, which
  leaves `supportsUniformBuffers` false, so a headless test compiles the non-UBO path only; forcing
  WebGL2 and compiling both paths is the only way to cover this. The installed
  9.18 exception list disables uniform buffers only for very old Chrome and Firefox versions [47], so
  the development browser will not exercise both paths for you.
- A comment that spells a hashed preprocessor keyword is parsed as a directive and deletes code.
  The shader hygiene test covers `.fx` files only, not GLSL written as TypeScript template
  literals, which is where most of this work would land.
- `vAlbedoColor` is the material constant, not the vertex colour; tint the surface albedo
  multiplicatively.
- `gl_InstanceID` reshuffles on every rebuild; hash the world position instead.
- A thin instance cannot be narrower than 64 bytes.
- Every wind frequency must be an exact multiple of 2π/300, and the motes must be re-derived from
  the same constants.
- Nothing cosmetic may touch the simulation. The trail-distance hook is read from the render
  layer, never added to the simulation's instance record for a renderer feature.
- Plugin attach is reached more than once per material, because level-of-detail buckets share a
  model's material, so it must stay idempotent.
- Small masked cards die in the mip chain; any new alpha texture needs coverage-preserving mips.
- Tests and reviews have blessed wrong shapes before: drive the game, take a control, and pair the
  frame-time samples.

More of these are collected in
[Babylon.js material plugin traps](/research/babylon-material-plugin-traps).

## Sources

1. Babylon.js Authors, "postProcess.pure.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/PostProcesses/postProcess.pure.ts
2. PC Gamer, "I can finally enjoy The Witcher 3 again now that they've fixed the grass shadows," Mar. 13, 2023. Accessed: Oct. 10, 2026. [Online]. Available: https://www.pcgamer.com/i-can-finally-enjoy-the-witcher-3-again-now-that-theyve-fixed-the-grass-shadows/
3. E. Wohllaib, "Procedural Grass in 'Ghost of Tsushima'," presented at Game Developers Conf., Advanced Graphics Summit, 2021. Accessed: Oct. 10, 2026. [Online]. Available: https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass
4. G. Sanders, "Between Tech and Art: The Vegetation of Horizon Zero Dawn," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2018. Accessed: Sep. 15, 2026. [Online]. Available: https://media.gdcvault.com/gdc2018/presentations/gilbert_sanders_between_tech_and.pdf
5. C. Faber, B. Kuth, Q. Meyer, and M. Oberberger, "Procedural grass rendering," AMD GPUOpen. Accessed: Oct. 10, 2026. [Online]. Available: https://gpuopen.com/learn/mesh_shaders/mesh_shaders-procedural_grass_rendering/
6. Real Pharaoh, "Landscape Seam Fixes," Nexus Mods, Skyrim Special Edition. Accessed: Oct. 10, 2026. [Online]. Available: https://www.nexusmods.com/skyrimspecialedition/mods/59687
7. code1k, "Landscape Fixes For Grass Mods," Nexus Mods, Skyrim Special Edition. Accessed: Sep. 15, 2026. [Online]. Available: https://www.nexusmods.com/skyrimspecialedition/mods/9005
8. B. Rockenbeck, "Blowing from the West: Simulating Wind in Ghost of Tsushima," presented at Game Developers Conf., 2021. Accessed: Sep. 15, 2026. [Online]. Available: https://media.gdcvault.com/GDC+2021/Rockenbeck-Bill-Blowing+from+the+West.pdf
9. 2Retr0, "GodotGrass," GitHub repository. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/2Retr0/GodotGrass
10. M. Gollent, "Landscape Creation and Rendering in REDengine 3," presented at Game Developers Conf., 2014. Accessed: Sep. 15, 2026. [Online]. Available: https://media.gdcvault.com/GDC2014/Presentations/Gollent_Marcin_Landscape_Creation_and.pdf
11. T. Sousa, "Vegetation procedural animation and shading in Crysis," in *GPU Gems 3*, H. Nguyen, Ed. Addison-Wesley, 2008, ch. 16, pp. 373-385. Accessed: Oct. 10, 2026. [Online]. Available: https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis
12. Epic Games, "Nanite Foliage," Unreal Engine Documentation. Accessed: Oct. 10, 2026. [Online]. Available: https://dev.epicgames.com/documentation/unreal-engine/nanite-foliage
13. Digital Foundry, "The big Senua's Saga: Hellblade 2 tech interview," Eurogamer, 2024. Accessed: Sep. 15, 2026. [Online]. Available: https://www.eurogamer.net/digitalfoundry-2024-the-big-senuas-saga-hellblade-2-tech-interview
14. wildy13, "[Performance] Optimizing 3M Instanced Grass in Three.js," three.js Forum, Apr. 2025. Accessed: Oct. 10, 2026. [Online]. Available: https://discourse.threejs.org/t/performance-optimizing-3m-instanced-grass-in-three-js/81286
15. C. Jarrard, "Red Dead Redemption 2 PC graphics settings guide," Shacknews. Accessed: Oct. 10, 2026. [Online]. Available: https://www.shacknews.com/article/115067/red-dead-redemption-2-pc-graphics-settings-guide
16. Remedy Entertainment, "How Northlight makes Alan Wake 2 shine," Remedy. Accessed: Oct. 10, 2026. [Online]. Available: https://www.remedygames.com/article/how-northlight-makes-alan-wake-2-shine
17. SimonDev, "Quick_Grass," GitHub repository. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/simondevyoutube/Quick_Grass
18. Ebenezer, "How to Make The Fluffiest Grass With Three.js," Codrops, Feb. 4, 2025. Accessed: Oct. 10, 2026. [Online]. Available: https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/
19. Babylon.js Forum, "Stylized animated and reactive grass." Accessed: Oct. 10, 2026. [Online]. Available: https://forum.babylonjs.com/t/stylized-animated-and-reactive-grass/62558
20. Babylon.js Forum, "Creating grass field." Accessed: Oct. 10, 2026. [Online]. Available: https://forum.babylonjs.com/t/creating-grass-field/56860
21. three.js Forum, "Real-time Grass Simulation in the Browser: Over 1 Million Blades at 60 FPS." Accessed: Oct. 10, 2026. [Online]. Available: https://discourse.threejs.org/t/real-time-grass-simulation-in-the-browser-over-1-million-blades-at-60-fps/82808
22. 80 Level, "Here's how games render grass and fur," 2023. Accessed: Oct. 10, 2026. [Online]. Available: https://80.lv/articles/classic-video-games-trick-for-rendering-grass-fur
23. J. van Muijden, "GPU-Based Run-Time Procedural Placement in Horizon Zero Dawn," presented at Game Developers Conf., 2017. Accessed: Oct. 10, 2026. [Online]. Available: https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn
24. C. Barré-Brisebois and M. Bouchard, "Approximating translucency for a fast, cheap and convincing subsurface scattering look," presented at Game Developers Conf., 2011. Accessed: Sep. 15, 2026. [Online]. Available: https://colinbarrebrisebois.com/2011/03/07/gdc-2011-approximating-translucency-for-a-fast-cheap-and-convincing-subsurface-scattering-look/
25. J. McLaren, "Adventures with Deferred Texturing in Horizon Forbidden West," presented at Game Developers Conf., Mar. 2022. Accessed: Oct. 10, 2026. [Online]. Available: https://www.guerrilla-games.com/read/adventures-with-deferred-texturing-in-horizon-forbidden-west
26. W. Hesselbarth, B. Vachowski, and M. A. Davies, "Trail Construction and Maintenance Notebook," USDA Forest Service, Missoula Technology and Development Center, 0723-2806-MTDC, Jul. 2007. Accessed: Sep. 15, 2026. [Online]. Available: https://www.fs.usda.gov/t-d/pubs/htmlpubs/htm07232806/page08.htm
27. USDA Forest Service, "FSTAG 2013 update." Accessed: Sep. 15, 2026. [Online]. Available: https://www.fs.usda.gov/sites/default/files/FSTAG-2013-Update.pdf
28. Ashland Woodlands and Trails Association, "Trail tread building basics." Accessed: Sep. 15, 2026. [Online]. Available: https://www.ashlandtrails.org/trail-tread-building-basics/
29. Trailism, "Soil compaction." Accessed: Sep. 15, 2026. [Online]. Available: https://trailism.com/soil-and-rock/soil-compaction/
30. M. Ballantyne and C. M. Pickering, "The impacts of trail infrastructure on vegetation and soils: Current literature and future directions," *J. Environ. Manage.*, vol. 164, pp. 53-64, 2015. Accessed: Sep. 15, 2026. [Online]. Available: https://www.sciencedirect.com/science/article/abs/pii/S030147971530236X
31. D. N. Cole and N. G. Bayfield, "Recreational trampling of vegetation: Standard experimental procedures," *Biol. Conserv.*, vol. 63, pp. 209-215, 1993. Accessed: Sep. 15, 2026. [Online]. Available: https://www.sciencedirect.com/science/article/abs/pii/000632079390714C
32. Take-Two Interactive Software, Inc., "Method and apparatus for enhanced graphics rendering in a video game environment," U.S. Patent 11 534 688 B2. Accessed: Sep. 15, 2026. [Online]. Available: https://patents.google.com/patent/US11534688B2
33. imgeself, "Graphics study: Red Dead Redemption 2," Jun. 19, 2020. Accessed: Sep. 15, 2026. [Online]. Available: https://imgeself.github.io/posts/2020-06-19-graphics-study-rdr2/
34. Video Games Chronicle, "PlayStation has patented Death Stranding's online path-building features." Accessed: Oct. 10, 2026. [Online]. Available: https://www.videogameschronicle.com/news/sony-has-patented-death-strandings-online-path-building-features/
35. Van Huffelen, "Heightmap Blending," Shaderic. Accessed: Sep. 15, 2026. [Online]. Available: https://www.shaderic.com/tutorials/HeightmapBlending.html
36. iToo Software, "How to create realistic grass edges using Forest Effects," Forest Pack tutorial. Accessed: Sep. 15, 2026. [Online]. Available: https://www.itoosoft.com/tutorials/how-to-create-realistic-grass-edges-using-forest-effects
37. S. Lagarde, "Water drop 3b: Physically based wet surfaces," Apr. 14, 2013. Accessed: Sep. 15, 2026. [Online]. Available: https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/
38. E. Heitz and F. Neyret, "High-performance by-example noise using a histogram-preserving blending operator," *Proc. ACM Comput. Graph. Interact. Tech.*, vol. 1, no. 2, pp. 31:1-31:25, 2018. Accessed: Sep. 15, 2026. [Online]. Available: https://eheitzresearch.wordpress.com/722-2/
39. M. S. Mikkelsen, "Practical real-time hex-tiling," *J. Comput. Graph. Tech.*, vol. 11, 2022. Accessed: Oct. 10, 2026. [Online]. Available: https://jcgt.org/published/0011/03/05/paper-lowres.pdf
40. Babylon.js Authors, "materialPluginBase.pure.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Materials/materialPluginBase.pure.ts
41. Babylon.js Authors, "materialPluginManager.pure.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Materials/materialPluginManager.pure.ts
42. Babylon.js Authors, "thinInstanceMesh.pure.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Meshes/thinInstanceMesh.pure.ts
43. Babylon.js Forum, "Pass index of current thin instance to shader?" Accessed: Oct. 10, 2026. [Online]. Available: https://forum.babylonjs.com/t/pass-index-of-current-thin-instance-to-shader/36244
44. Babylon.js Authors, "pbrBlockAlbedoOpacity.fx," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Shaders/ShadersInclude/pbrBlockAlbedoOpacity.fx
45. Arm, "Early-Z," Arm Developer Documentation. Accessed: Sep. 15, 2026. [Online]. Available: https://developer.arm.com/documentation/102224/0200/Early-Z
46. MJP, "To early-Z or not to early-Z," therealmjp.github.io. Accessed: Sep. 15, 2026. [Online]. Available: https://therealmjp.github.io/posts/to-earlyz-or-not-to-earlyz/
47. Babylon.js Authors, "thinEngine.pure.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Engines/thinEngine.pure.ts
48. Babylon.js Authors, "lightVxFragmentDeclaration.fx," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Shaders/ShadersInclude/lightVxFragmentDeclaration.fx
49. Babylon.js Authors, "lightVxUboDeclaration.fx," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 10, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Shaders/ShadersInclude/lightVxUboDeclaration.fx

Explicitly unverified: Tsushima's 83,000 blades at 2.5 ms and its 15 and 7 vertex figures;
Horizon's placement densities; any Firewatch trail technique; Tsushima's road authoring; every
technical claim about Breath of the Wild, Tears of the Kingdom, Genshin Impact, Flower and Sky;
Red Dead Redemption 2's grass-shadow algorithm; the trail-under-headlamp reasoning.
