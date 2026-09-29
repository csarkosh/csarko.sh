---
description: Real-time water rendering from the physics up: how lakes, ocean waves, breaking surf and foam look, how games draw them, and what it costs on WebGPU and WebGL2.
published: 2026-09-29
---
# Photorealistic water rendering: lakes and oceans

**Question:** Day Hike is a first-person co-op hiking game in Babylon.js 9.18, set on a
coast and forest like Washington's Olympic Peninsula. Its water is a flat plane with one
scrolling normal map, and it does not look real. We want photorealistic water of two
kinds, rendered in real time in a browser: a still forest lake, murky with algae at its
margin and insects over it, and an ocean coast with waves that are large and concave where
real ones would be, small where real ones would be, and white where they break. How does
real water of both kinds behave, what do shipped games do about it, and what can a browser
afford on WebGPU and on WebGL2? The water system is meant to be reused, in later maps and
in other games, so the survey covers water at arm's length as well as from a kilometre
away.

**Short answer:** most of what makes water read as real is cheap, and most of it is about
light, not waves. Water is a window at your feet and a mirror 20 m away, and the water
itself is dark, so across a lake or a sea what is seen is the sky and the far shore upside
down. A sheltered lake mirrors its trees; a rough sea never mirrors its coast, and shows
sky from 20 to 30° up. A brown forest lake lets red through least badly (measured
attenuation about 1.1, 1.5 and 3.5 per metre for red, green and blue at a Secchi depth of
1.8 m), so its bed is an amber rim a few metres wide round a black mirror. On the Olympic
Peninsula only the lowland lakes with marsh at an end are murky, at 1.5 to 3.8 m of Secchi
depth; the high lakes are clear to the bed at 5 to 11 m, so one lake material has to span
both, with its attenuation as the setting. "Algae around the sides" is floating mats of
filamentous algae in the shallows. Insect swarms hold station over a marker, do not flock,
and vanish above 3 m/s of wind; a swarm is nearly silent, and the whine is one mosquito at
the ear.

At the coast, the sea is never small (a median of 2 m at 11 s offshore, 3 m in January),
waves arrive in sets, turn to the beach, and grow before they break in water about 1.3
times their height. Whether a wave spills or plunges is set by the beach's slope. The
game's sea bed, at 1:67, spills in every sea. The concave wave belongs on a steep face,
and this coast has them: the pebble beaches between its headlands stand at 1:9 to 1:17.
Foam in the surf decays over about 20 s, longer than the gap between waves, so the inner
surf stays white through a set.

Games solved the open sea years ago with an FFT of a wave spectrum, at 0.1 to 2 ms on
desktop GPUs. At the shore, shipped engines shrink waves where nature grows them. The
concave breaker has shipped in four places as one technique: a small baked texture of the
wave's cross-section over time, swept along the shore. Nobody publishes its cost, which
is the cost of a mesh fine enough to draw the lip, and nobody has drawn one in a browser.
In a browser the FFT costs about 0.7 ms a cascade as WebGL2 fragment passes on an Apple
M5, and under 1 ms for three small cascades in WebGPU compute; with the simulation in
compute, drawing the water costs more than simulating it. For a still lake the mirror is
the picture, every published reflection method is weakest there, and no one has published
what a mirrored render costs in a browser.

The game is public at [game-dayhike](https://github.com/csarkosh/game-dayhike) and playable
at [games.csarko.sh/dayhike](https://games.csarko.sh/dayhike/). Its renderer's two paths
are described in [WebGPU and WebGL2: what changes and what does not](/research/webgpu-vs-webgl2),
and its material plugins in
[Babylon.js material plugins: hooks and traps](/research/babylon-material-plugin-traps).
Numbers given without a source are our own arithmetic from the sources beside them:
Fresnel's equations, the wave dispersion relation, and the published buoy, lidar and survey
data.

## 1. The water today

Day Hike's world is a procedural coast and forest modelled on Washington's Olympic Peninsula:
the Pacific west of the start, sand bays between headlands, sea stacks, a highway along the
shore, and a trail that climbs a peak. The player is on foot at eye height; there are no boats
and no swimming, so water is always looked at from land, from a few metres to a few kilometres
away.

| | What is drawn now |
|---|---|
| The sea | A flat plane at sea level: four camera-following rings of 128 by 128 cells, with cells of 8, 16, 32 and 64 m, 106,496 triangles, reaching 8,192 m |
| Its material | One PBR material, roughness 0.12, alpha blended, with one 256 px procedural normal map that scrolls at 0.36 and 0.26 m/s. Nothing else moves |
| Its colour | Baked per vertex from the depth of the sea bed under it: a pale foam colour at 0.05 m, teal at 2.5 m, dark blue at 10 m, with alpha from 0.55 to 0.92 |
| Its foam | The foam colour at the vertices nearest the waterline, so the band is one 8 m cell wide and never moves |
| Its reflection | A 128 px cube map of the sky alone, rendered again when the hour or the weather changes. No headland, stack or tree is ever reflected |
| Ponds | At most one in a world: a 48-triangle disc of radius 25 to 40 m over a basin 0.6 m deep, with the sea's material. At that depth the sea's colour ramp leaves it a pale, translucent grey |
| Sound, rain | The water makes no sound, and rain leaves no mark on it |

Three properties of the renderer bound every option in section 9. No material can read the
scene's depth or its colour: the game has no depth pass, no pre-pass and no mirror or
refraction target. Every custom shader is a GLSL plugin on a PBR material, translated to WGSL
ahead of time for WebGPU, so each new material variant is a shader to record and ship. And
the frame is limited by the GPU: about 20 ms on an Apple M4 at 1080p on the high tier, which
leaves water perhaps 1 to 2 ms there and well under 1 ms on the low tier.

Three properties of the world matter as much as the renderer:

- **No player can reach the sea.** An invisible wall runs along the highway, which lies
  between the forest and the beach. The nearest a player gets to the waterline is about 62 m
  on a headland and up to 141 m in a bay. The surf is seen from the road, from the trail and
  from the summit, never from the wet sand. That is a fact of this map and not of the water
  system: later maps, and other games built on it, will put a player at the waterline, so
  nothing below is ruled out because of the distance.
- **There is no lake.** The largest inland water is the pond above. A lake 50 to 300 m across
  is a new stage in the terrain function, which changes the world every player must agree on;
  and on a hillside of gradient 0.25, a level rim 300 m across stands about 38 m proud of the
  slope on one side, so it has to sit in flatter ground or a cut.
- **The sea bed is nearly flat.** It falls 1.5 m in 100 m (1:67) for the first 530 m, so the
  sea is under 1 m deep for its first 65 m. Section 3.3 shows what kind of wave that makes.

## 2. How real water looks, and why

### 2.1 Fresnel reflection: clear at your feet, a mirror at a distance

A flat water surface reflects about 2 % of the light that meets it head on, and the fraction
rises with the angle from the vertical, slowly at first and steeply near grazing [1].
From the Fresnel equations with a refractive index of 1.333, for an eye 1.7 m above flat water:

| Distance from the feet | Angle from vertical | Reflected | What the eye gets |
|---:|---:|---:|---|
| 1 m | 30° | 2.2 % | what is under the water |
| 3 m | 61° | 6.2 % | under the water, with a sheen |
| 5 m | 71° | 15 % | both |
| 10 m | 80° | 36 % | mostly the reflection |
| 20 m | 85° | 59 % | the reflection |
| 100 m | 89° | 90 % | a mirror |

The whole change from window to mirror happens between 2 and 20 m from a standing walker. The
common shortcut, Schlick's approximation, reads 22 % low at 53° and 14 % high at 80° for water,
so it makes the middle distance slightly more mirror-like than it is; the exact curve fits in
a one-dimensional lookup.

Water itself is dark. Section 2.3 puts the light that comes back out of a forest lake at under
1 % of what went in, and out of green coastal water at 1 to 4 %. So the reflection wins long
before it reaches 50 %: across a lake or a sea, what is seen is mostly the sky and the far
shore, upside down. Looking down beside your feet, it is the bed and the water's own colour.

### 2.2 Wind sets the roughness

Cox and Munk measured the slopes of the sea surface from photographs of sun glitter. For a
clean surface the mean square slope grows linearly with the wind speed U in m/s: 0.003 +
0.00512 U in total, a little more along the wind than across it [2]. That is a
root-mean-square slope of about 5° at 1 m/s, 10° at 5 m/s and 13° at 10 m/s. An oil slick
cuts the mean square slope by a factor of two to three, to 0.008 + 0.00156 U
[3]. The slopes that make
glitter belong mostly to capillary waves, not to the larger gravity waves [4]: they
are millimetres to centimetres long, the slowest of them 1.7 cm long and moving at 0.23 m/s
[5]. Beyond a few metres they are smaller than a pixel, so a renderer has to
carry them as a roughness, not as geometry.

The Beaufort scale gives the same ladder in words: a mirror under 0.3 m/s, "ripples with
appearance of scales" to 1.5 m/s, glassy wavelets that do not break to 3.3 m/s, and the first
scattered white horses from 3.4 m/s [6]. In a laboratory the first wavelets grew
once the friction velocity passed about 2 cm/s, and the wind at which they become visible
depends on the water's temperature [7].

Three consequences for the picture follow from the geometry of a tilted facet, and the
classic observers of light on water report all three.

- **Reflections stretch vertically, never sideways.** Every point of light becomes "an
  oblong spot with its long axis in the vertical plane containing the eye and
  light-source" [8]. The ratio of its width to its length is the sine of the angle
  at which the eye looks along the water [9]: about 1 to 12 for water 20 m away
  and 1 to 59 at 100 m. A lamp on the far shore, or a low moon, is a long streak pointing
  at the viewer, and the sun's glitter is a narrow column when the sun is low and a broad
  patch at the feet when it is high. On flat water the glitter vanishes into a single image
  of the sun [4].
- **A rough sea is darker than the sky above the horizon.** "Our gaze falls on the slopes
  of the distant wavelets", so the far sea shows "the colour of the sky at a height of 20°
  to 30°" and not the pale sky at the horizon [8]. Summing Fresnel reflection over
  Cox and Munk's slopes gives the same answer in numbers: water 100 m away reflects 90 %
  when flat but about 42 % in a 5 m/s wind. A glassy sea is paler and merges with the sky.
- **A rough sea does not mirror the coast.** "The first 25° or 35° of the sky above the
  horizon are, in reality, hardly visible in the reflection", which "explains why one never
  sees trees, dunes, etc., on the coast reflected in the sea; they are not high enough"
  [8]. A sheltered lake is the opposite case. There "the regular reflection" plays
  "a much more prominent part than in the case of the sea", and the image is the landscape
  itself seen "from a point as far below the surface of the water as our eye is above it",
  so the undersides of branches show in it [8].

Shelter decides which of the two a lake is. Behind a line of trees the wind's grip on the
water recovers only after 40 to 60 tree heights, and an aerial photograph of a forest lake
shows the water flat for about three tree heights from the upwind shore [10].
With 30 to 50 m conifers, a lake a few hundred metres across is sheltered over its whole
surface. In light air it is a patchwork: glassy where the trees shelter it or a film of
pollen or organic matter damps the ripples, ruffled and darker where a gust touches down.
A natural slick in Cox and Munk's own data had about a fifth of the roughness of clean
water in the same wind [3]. Above about 3 m/s on open water, foam and debris
gather into lines along the wind, 1 to 300 m apart [11].


### 2.3 Water colour and murk: absorption by depth

Pure water absorbs red light 50 to 100 times more strongly than blue: 0.0092 per metre at
450 nm against 0.34 per metre at 650 nm [12]. That is why clear water is blue.
Everything else in natural water shifts the balance. Plankton absorbs blue and red and
leaves green. Dissolved organic matter from soils and rotting plants absorbs blue most and
falls away toward the red, so water rich in it is yellow, brown or the colour of tea
[13]. Sediment scatters at every wavelength and makes water pale and opaque.

How fast light dies with depth is the diffuse attenuation coefficient, Kd, in units of per
metre. Measured in lakes with a spectrometer, and estimated for the coast from the measured
chlorophyll:

| Water | Secchi depth | Kd red, 610 nm | Kd green, 545 nm | Kd blue, 465 nm |
|---|---:|---:|---:|---:|
| A very clear lake [14] | 13 m | 0.2 | 0.12 | 0.2 |
| A clear lake [14] | 5.5 m | 0.75 | 0.8 | 1.6 |
| A moderately humic forest lake [14] | 1.8 m | 1.1 | 1.5 | 3.5 |
| A small brown forest lake [14] | 1.0 m | 2.4 | 3.7 | 8 |
| The Washington shelf at its summer chlorophyll of 3.3 mg/m³ [15], [16] | | 0.34 | 0.18 | 0.26 |

The lake values are read from the published curves and are good to about 15 %. The coast's
row is a floor: it counts plankton alone, and the water beside the beach also carries
sediment and river colour (section 4.3).

In brown water the order of the channels turns over. Red goes least fast, so the water
transmits red-brown, and "the very rapid attenuation of irradiance with depth" between 400
and 500 nm leaves little blue below 1.5 to 2 m [14].

Seen from above, a bed at depth H shows through with its brightness pulled toward the deep
water's own by exp(−2 Kd H), the light having gone down and come back
[17]. In the humic lake above that leaves a pale bed 30 cm down at half its red,
two fifths of its green and an eighth of its blue, which is amber; at 1 m it has a tenth
of its red, a twentieth of its green and no blue. The bed is a warm rim a few metres wide, and beyond it the lake is a dark mirror.
Over the same pale sand in the sea, the filter is green.

The water body itself returns very little. Its reflectance just under the surface is a
fraction of the ratio of backscattering to absorption, the fraction rising from about 0.35
with the sun overhead to about 0.5 with a low sun, and about 0.54 of that gets out through
the surface [14]. For brown lake water that comes to well under 1 % of the light
that went in.

### 2.4 The shore's edge: wet sand, foam and caustics

**Wet sand.** Beach sand measured as it dried reflects, when saturated, about 0.40 of what
it does dry, "with little apparent color change". The change comes in two steps: the first
few percent of moisture take off 15 %, sand between 5 and 25 % moisture hardly differs, and
the last step to saturation does the rest, so that "only a distinction between a dry and a
wet surface is practical" [18]. Three states are enough: dry, damp at about 0.7,
soaked at 0.4. The gloss comes on top. Water lying on sand is a true mirror, unlike the sea
beside it: "a streak of wet sand, in which reflections of certain parts of the sky are
smooth and perfect" [8]. From 10 to 30 m away a walker sees it at 80 to 87° from
the vertical, where it reflects 35 to 70 % of the sky.

**Foam.** Foam is white because light scatters among its bubbles with almost no
absorption. Fresh, thick whitecaps reflect about 40 % in the visible, up to about 55 % at
the moment of breaking; thin or aged foam about 18 %; and the figure falls to 3 to 10 %
within about 10 s [19]. Averaged over its life a whitecap reflects about 22 %
[20]. Bubbles below the surface do not look white. They brighten the water's
own colour, which near this coast is green [19]: the pale green glow behind a
breaking wave.

**Caustics.** The bright moving net on a shallow bed is sunlight focused by the crests of
ripples [21]. A crest focuses at about four times its radius of curvature, so
centimetre ripples draw the net on a bed 10 to 50 cm down and metre waves on a bed of
several metres. From land it shows only in clear shallows over a pale bed, in sun, within
a few metres of the walker. In brown water it is gone with the bed.

### 2.5 Night and the headlamp

A full moon gives 0.05 to 0.3 lux against the sun's 32,000 to 100,000 [22]. At night
the water body returns nothing, and a lake shows only as the sky's reflection and the
shore's silhouette in it.

A lamp worn on the head is a special case, because the light source sits at the eye. A
facet returns the lamp to the eye only if it faces the eye, which at a distance d needs a
tilt of atan(d / 1.7): 30° at 1 m, 60° at 3 m. Ripples tilt 4 to 10°. So the lamp's sparkle
is confined to a patch almost under the walker, and farther out the water throws the beam
away and looks black. What does come back from out there is whatever stands steep: rain
rings, foam, wet stones, floating leaves. Near the feet, 98 % of the beam enters the water.
In clear shallows it lights the bed; in brown water it lights an amber haze that ends
within a metre, and the haze glows back at the eye because the lamp is beside it.

## 3. How real ocean waves behave at a coast

### 3.1 The waves that arrive

The nearest long record is the buoy off Cape Elizabeth, 131 m of water, west of the Olympic
coast [23]. From its hourly records for 2015 to 2024:

| | Significant height, median (10th to 90th percentile) | Peak period, median | Mean period, median | Wind, median |
|---|---|---:|---:|---:|
| January | 3.05 m (1.83 to 4.91) | 12.9 s | 7.9 s | 7.9 m/s |
| April | 2.13 m (1.20 to 3.42) | 10.8 s | 7.1 s | 5.2 m/s |
| July | 1.16 m (0.72 to 1.89) | 8.3 s | 5.9 s | 4.3 m/s |
| October | 2.21 m (1.02 to 3.91) | 10.8 s | 7.4 s | 5.0 m/s |
| All months | 1.99 m, 99th percentile 5.98 m, largest 9.90 m | | | |

Two things stand out. The sea here is never small: a calm summer day still carries a metre
of swell. And the peak period is far longer than the mean period, which means two seas at
once: long swell from distant storms, with a shorter wind sea riding on it.

Wave heights in a random sea follow a Rayleigh distribution, so about one wave in seven is
higher than the significant height and the largest of a hundred is about 1.5 times it
[24]. They also arrive in groups. Surfers' "sets" are real: successive wave
heights are correlated, more so the narrower the swell's spectrum, and rip currents pulse
with them for 30 s to a minute at a time [25].

### 3.2 Coming in: waves slow, shorten, grow and turn

In deep water a wave's length is 1.56 T² metres for a period of T seconds and its speed is
1.56 T m/s. Once the water is shallower than half a wavelength the wave feels the bed: it
slows, shortens and, after a slight dip, grows, keeping its period [26].
From the dispersion relation:

| Period | Deep water: length, speed | At 10 m depth | At 5 m | At 2 m | Height at 2 m against deep water |
|---:|---|---|---|---|---:|
| 8 s | 100 m, 12.5 m/s | 71 m, 8.9 m/s | 53 m, 6.6 m/s | 35 m, 4.3 m/s | 1.23 |
| 12 s | 225 m, 18.7 m/s | 113 m, 9.4 m/s | 82 m, 6.8 m/s | 53 m, 4.4 m/s | 1.47 |
| 16 s | 400 m, 25.0 m/s | 154 m, 9.6 m/s | 111 m, 6.9 m/s | 71 m, 4.4 m/s | 1.69 |

Close to shore every long wave travels at nearly the same speed, the square root of g times
the depth, whatever its period; crests bunch up; and long swell grows much more than short
waves before it breaks. The shape changes too: crests sharpen and troughs flatten.

Where a crest meets the depth contours at an angle, the end in shallower water moves slower
and the crest turns toward the shore (Snell's law applied to wave speed)
[26]. A 12 s swell that leaves deep water at 45° to the contours is within
10° of parallel to them at 2 m depth; a 6 s wind wave is still at 19°. So swell lines arrive
nearly parallel to the beach, and short chop arrives visibly askew.

Where the bed is not uniform, the same bending sorts the waves along the shore. Wave energy "is
focused on the headlands" and "dispersed in the bays" [27]. How much
depends on how spread the sea is: over a shoal in the laboratory a single-direction swell
grew to nearly 2.5 times its height, and a sea with a realistic spread of directions to 1.1
to 1.4 times [28].

Behind a headland or a stack, waves leak sideways into the shadow. On the line straight
behind the tip a single wave train keeps half its height, and a spread sea about 70 %
[27]. Deeper in, what survives depends on wavelength. From the classical
solution for a wall's end, 200 m behind the tip and 100 m into the shadow, a 4 s chop of
25 m wavelength keeps 14 % of its height and a 14 s swell of 150 m wavelength keeps 30 %.
So the lee of a headland has lost its chop and still heaves with a low, clean swell. A
stack narrower than a wavelength barely shadows the swell at all: "wave energy spreads
behind the entire pile" [27].

Local wind adds chop wherever it blows, and fetch limits it. By the engineering manual's
growth law an 8 m/s wind raises waves 3 cm high and 0.2 m long over 50 m of water, 12 cm
and 1.4 m over a kilometre [29]. Without wind, ripples die by viscosity: a 1 cm
ripple in about a second, a 10 cm one in a minute and a half.

### 3.3 Breaking waves: spilling or plunging, and where

A wave breaks when its height reaches a fraction of the depth under it. The classical
value is 0.78, and it rises with the beach's slope toward twice that [30]. So waves
break in water about 1.3 times as deep as they are high: a 2 m swell in 2.5 m of water.

What kind of breaker it makes is set by the beach's slope against the wave's steepness,
the Iribarren number: the slope divided by the square root of the offshore height over the
deep-water wavelength.

| Breaker | Iribarren number [31] | What it looks like | Broken waves in the surf zone at once [31] |
|---|---|---|---|
| Spilling | Under 0.5 | Foam tumbles down the front of the crest and the wave decays across a wide zone | Two or more |
| Plunging | 0.5 to 3.3 | The crest curls over and falls into the trough ahead: the concave wave | None to two |
| Collapsing, surging | Over 3.3 | The face steepens and rushes up the beach with little foam | One at most |

For this coast's seas, on the slopes of section 4:

| Sea | On 1:100, the flat sand | On 1:67, Day Hike's sea bed | On 1:18, a sand beach's upper face | On 1:12, a pebble face |
|---|---:|---:|---:|---:|
| Summer: 1 m, 9 s | 0.11 | 0.17 | 0.62 | 0.94 |
| Typical: 2 m, 11 s | 0.10 | 0.15 | 0.54 | 0.81 |
| Winter: 3 m, 13 s | 0.09 | 0.14 | 0.52 | 0.78 |
| Storm: 6.5 m, 15 s | 0.07 | 0.11 | 0.41 | 0.61 |

The flat sand spills in every sea, and so does the game's sea bed. The steep faces plunge.
A steep face only sees unbroken waves when the tide is high enough to cover the flat in
front of it, and a big sea breaks far out whatever lies inshore, so the real coast shows
both at once: lines of spilling white water out over the sand, and a concave wave dumping
on the pebbles at high tide. Wind shifts the balance: "onshore winds cause waves to break
in deeper depths and spill, whereas offshore winds cause waves to break in shallower depths
and plunge" [30].

The plunging wave, measured [32], [33], [34]:

- The lip leaves the crest at 1.3 to 1.5 times the wave's speed, more in shallow water,
  and falls nearly as a thrown object does.
- The tube under it, when the lip touches down, is 1.7 to 3.2 times as long as it is
  wide, 2.55 on average, and stretches to as much as 5 within half a second. Its shape
  varies as much from wave to wave as from beach to beach: steeper beds make rounder
  tubes, but slope explains only about a fifth of the variation.
- Between the plunge and the splash ahead of it there is a gap that lasts 1 to 4 s, and
  then a dense mat of foam behind a rolling bore.

Along a crest, breaking starts at one point and runs sideways. Surfers measure the angle:
at about 50° the break runs along the crest at a pace a surfer can follow, and at 0° the
whole crest falls at once [35].

### 3.4 The surf zone and the swash

Once broken, waves are held to a fraction of the depth: their root-mean-square height is
0.42 of it [30]. So bores shrink steadily toward the shore, and near the beach they
all move at about the square root of g times the depth, 3 m/s in a metre of water. Where a
bar lies offshore, "the wave may cease breaking, re-form, and break again on the shore"
[30], which is what makes separate lines of white water with darker water between.
South-west Washington's beaches have two or three bars, their crests 200 to 1,000 m out
and mostly less than 5 m down [36]; the one profile measured off the
Olympic coast's sand shows one.

At the beach a bore collapses into "a thin wedge of water whose tip propagates up the
beach face" [37]. The uprush is faster and shorter than the backwash
[38]. On pebbles, much of the uprush sinks in, so the backwash is weak.
On a flat sand beach in a large swell the waterline does not follow each wave: on the
Oregon coast almost all of the run-up's movement was at periods of minutes, about 230 s at
its peak [39]. The beach floods and drains slowly while small bores ride over
it.

Rip currents are where the white water has a gap. They run at 0.3 to 0.6 m/s, up to
2.4 m/s, are 5 to 90 m wide, and show as "darker, narrow gaps" with foam streaming seaward
[25]. In a bay between headlands they leave along the rocks.

Against rock the rules change. A steep wave that meets a wall without trapping air throws
a jet up at "eight to ten times" the wave's speed, and "sea sprays rising several tens of
meters" are seen at cliffs in storms [40]. Over the surf itself hangs a haze of
salt. At one Californian pier the plume stood 20 to 30 m deep and carried downwind for
kilometres [41].

### 3.5 Sea foam: how long it lasts

| | Measured |
|---|---|
| A whitecap at sea | Lasts 0.2 to 10 s from start to finish [42]. In the laboratory its area dies away with a time constant of 3.85 s in salt water and 2.54 s in fresh [43] |
| How much of the open sea is white | Nothing below about 3.7 m/s of wind; 0.1 to 0.3 % at 7 m/s; about 1 % at 10 m/s; 2 to 4 % at 15 m/s [44], [45] |
| Foam behind a broken wave in the surf | The brightness rises in "a few seconds" and decays "with time scales ≈ 20 s", in water 1.3 to 2.6 m deep under waves of 9 s [46] |
| The mat behind a bore | It appears within seconds. Holes of about 1 m² open in it after a few seconds and grow by about 0.1 m² each second, merging into lace. It is still there when the next wave breaks 14 s later [34] |
| How much of the surf zone is white | On average 0.35 to 0.55 of it, and nearly all of the inner part [47] |
| Its brightness | Foam 0.47 against 0.06 for the water beside it [46] |
| Organic matter from plankton | Makes foam last 1.1 to 1.7 times longer at sea [48] |

Two things follow. Foam outlives the wave that made it, so within a set the surf zone does
not clear between waves; it clears in the lull between sets. And the inner surf is a nearly
continuous cover that each bore renews, not separate patches on clear water.

### 3.6 The sound of surf

Surf is loud and low. Measured on the Baltic, its level rose from 60 dB(A) under waves
0.4 m high to 78 dB(A) under waves of 2 m, and "the energy of the spectra is shifted toward
lower frequencies when waves change from spilling to plunging" [49]. The hiss is
bubbles: one of radius 1 mm rings at about 3.3 kHz, and the pitch falls as the size grows.

A plunging wave has a sound of its own. Recorded from a cliff, every band rose by 5 to
12 dB as a wave broke, most of all at 50 Hz, and plunging waves had "a distinctive
'whoomphing' or bellowing sound that is absent when waves are merely spilling", with peaks
at 34, 48 and 78 Hz from the air trapped in the tube [50].

On a pebble beach the backwash rattles. The pitch is set by the size of the stones: under
water, about 4 kHz for 2 cm stones and 1 kHz for 7.5 cm [51].

Surf carries inland as a rumble that rises and falls with the sets. A long beach is a line
of sound, which fades more slowly with distance than a single source does, and air and
forest take the high frequencies first.

## 4. The coast the game is modelled on

### 4.1 Two kinds of beach, each with two slopes

The National Park Service mapped 174 beaches on the Olympic coast. Sand beaches are the
commonest and cover more ground than every other kind together; cobble beaches cover 0.03 %
of the strip [52]. The sand is fine, 0.20 to 0.25 mm on six of seven beaches
sampled, and the service classes those beaches as intermediate, neither flat and
dissipative nor steep and reflective [53]. The long flat beaches of south-west
Washington, which are often pictured as "the Washington coast", are a different coast.

| | Long sand beach (Kalaloch, Shi Shi) | Pocket beach between headlands (Rialto, Second Beach) |
|---|---|---|
| Upper face, near high water | 1:14 to 1:32, from lidar [54] | 1:9 to 1:17, pebble and mixed sand and gravel, in every season [55] |
| Between the tides | 1:45 to 1:185 at Kalaloch: 150 to 250 m of nearly flat wet sand [55] | "A wide, flat sand beach exposed at low tides" below the pebble face [52]; no slope measured |
| Sea bed beyond | About 1:240, sand, with one bar 2 m high about 350 m out [56] | About 1:50, with rock pinnacles 5 to 13 m tall between 0.6 and 1.2 km out [56] |
| At the top | A strip of pebbles and drift logs at the foot of a bluff | A berm, and logs "1 m or more in diameter" [52] |
| For contrast, south-west Washington | 1:50 at high water [54], with up to four bars, the outermost over 1 km out [57] | |

The slopes from lidar and from the beach surveys are our own reductions of the published
data. One published table of slopes for these beaches was set aside, because the profiles
it rests on fall 9 to 12 m where the largest tide is about 4 m.

The mean tide range at La Push is 1.96 m and the range between the daily extremes is
2.60 m [58]. On the flat sand that moves the waterline 200 to 300 m twice a day;
on a pebble face, about 30 m. The beaches also move with the seasons. At Kalaloch the
shoreline shifted about 50 m over a year; at Rialto about 10 m, and its face kept its slope
[55].

### 4.2 Stacks, fog and cold water

The Coast Pilot lists the heights of the stacks and islands. Most are 20 to 70 m; the
tallest, Jagged Island, is 98 m. The large ones are flat-topped with vertical sides and
carry grass or trees; many bare ones are white with guano; pinnacles run to about 48 m tall
and 18 m thick [59]. The park counts 228 stacks in its strip, most of them rooted
in rock platforms that dry at low tide [52].

Summer is the fog season. At sea, fog cuts visibility below 0.9 km on 3 to 10 days a month
[59]; at Quillayute airport, 5 km inland, heavy fog is recorded on about 42 days a
year, most of them from August to October [60].

The water is cold all year. At La Push it is 11.4 °C in summer, about 3 °C colder than at
the buoy offshore, because summer winds draw deep water up along the shore; the warmest
month at the beach is September [58].

### 4.3 How clear the sea is: nobody has measured it at the shore

We found no record of Secchi depth, or of any light measurement in the water, for the
surf or the first few kilometres of this coast. The marine sanctuary's own review lists
turbidity among the gaps in its data [61]. What exists is farther out. On the
shelf in June 2003, 7 to 40 km offshore, the median chlorophyll at the surface was
7.5 µg/L and a tenth of the stations passed 16.5 µg/L [62]. From space, the
diffuse attenuation at 490 nm within 10 km of shore runs at 0.5 to 1.2 per metre in summer
and 0.24 to 0.31 per metre on the clear days of winter [63]; near shore a
satellite's figure is a guide, not a measurement.

Both say the same thing. In summer the sea off this coast is green and dim, with perhaps 1
to 4 m of visibility into it, not blue and not clear.

## 5. A still forest lake, murky or clear

### 5.1 Which lake is murky, measured

The Olympic Peninsula has three kinds of lake, and only one is murky.

| Kind | Examples | Secchi depth | Colour and carbon |
|---|---|---|---|
| Subalpine lakes in the park, above about 1,200 m | Ferry, Heather, Connie, La Crosse | The bed visible at 5 to 11 m | Dissolved organic carbon 0.1 to 0.65 mg/L: no stain [64] |
| A large, deep lowland lake | Crescent | 15 to 18 m [65] | |
| Lowland forest lakes with marsh at an end | Leland, Gibbs, Crocker, Ozette | 1.5 to 3.8 m; 0.5 m in a bloom [66], [67] | Ozette "a slight tea color"; the streams that feed it several times darker [67] |

So a murky lake is a lowland one, with wetland at its margin and conifers to the bank,
and a lake high on a mountain is clear to its bed. A world with both needs both pictures.
Sections 5.2 to 5.4 are about the first, and section 5.5 about the second.

Crocker Lake, in the third class, was surveyed in detail in 1998 [68]. It
covers 31 ha and is 4.0 m deep at most. Its water was "very muddy brown" and its Secchi
depth about 1.5 m. Ten metres from the shore it is 0.9 m deep. Within that strip the bed is
mostly silt, with sand, a little gravel and sunken wood. Plants grow no deeper than 2 m.
The survey found waterweed "very dense in shallows", yellow pond-lily "in large patches"
and already dying back in early September, cat-tail, bulrush and pondweeds.

With a Secchi depth of 1.5 to 1.8 m, section 2.3's humic lake is the match: the bed shows
through the first few decimetres of water, is dim at 1 m and gone by about 1.5 m. On
Crocker's slope that is a band 5 to 15 m wide along the shore.

### 5.2 What "algae around the sides" is

A lake's margin is zoned by depth. Plants that stand out of the water grow where it is less
than about 1.2 to 1.5 m deep; floating-leaved plants grow in "protected areas where there is
little wave action"; submerged plants reach as far out as the light does, and where the
water is unclear all summer they "will be restricted to shallow areas near shore"
[69]. In a brown lake the whole planted band is a few metres to a few tens of
metres wide.

Four different things get called algae, and they look nothing alike:

| What | How it looks | Where and when |
|---|---|---|
| Filamentous green algae, the "pond scum" | Chains of cells that make "a mat that resembles wet wool" [70]; "green, cotton candy-like clouds floating in shallow waters" [71] | It starts on the bed and on stems in the shallows, then "floats to the surface forming large mats" [70]; after spring runoff and hot spells |
| Cyanobacteria | "Green paint floating on the water", sometimes bluish, brownish or reddish green, "several inches thick near the shoreline" [72] | Summer and autumn, in warm water rich in nutrients; the wind piles it on one shore |
| Periphyton | A film of algae, bacteria and detritus on sunken logs, stones and stems | Everywhere under water, all year |
| Green water | The whole water column tinted, with little to see at the surface | With plankton blooms |

The first is what a walker means by algae around the sides: bright to yellow-green woolly
rafts in the warm shallows, caught among stems and against logs. The mats rise "when
bubbles, generated by its own photosynthesis or respiration, or created by decay of its
tissues, get trapped in the mats and make them buoyant" [73], so they are studded
with bubbles, and an old yellowing mat floats as well as a fresh one. Beside it, in its seasons,
lie the rest of the surface's litter: pollen as "yellow-green dust on the lake in early
summer", foam on "windward shores, coves and in eddies", and the cast skins of hatching
insects as a dark cloud with an oily sheen [71]. All of it is matt. None of it
reflects like water, which is why it reads so strongly on a dark mirror.

### 5.3 Insects: who, where, when, and how they move

| Insect | Size | When | How it moves |
|---|---|---|---|
| Mosquito, female | 3 to 6 mm | Dawn and dusk | Tracks a breath's carbon dioxide from tens of metres, sees a person at 5 to 15 m, and feels warmth only within about 20 cm [74]: a zigzag upwind, a straight approach, then a hover close to the skin |
| Mosquito, males in a swarm | | About 20 minutes after sunset, for about half an hour | Tens of males hold station over a marker on the ground, 1.6 to 2.2 m up, about 13 cm apart, each looping about once a second [75]; nearly every position is within 1 m of the swarm's centre [76] |
| Midges | 2 to 3 mm | Sunset, near still water, over a landmark | The same: "collective behaviour without collective order" [77]. Each midge is bound to the swarm and barely to its neighbours, turning every 38 mm or so [78] |
| Deer flies | A little larger than a house fly | By day, most in June and July, near marshes and pond banks | They "commonly fly around a person's head until they get an opportunity to bite" [79] |
| Dragonflies | | Sunny hours | Males patrol a beat along the water's edge, hovering and perching |
| Water striders | 2 to 12 mm | Sheltered margins | Short glides at a metre a second; their feet dimple the surface |

Two results decide how a swarm should be built. A swarm is not a flock: its members do not
line up with each other, so the flocking rules games use for birds would make it look wrong.
Each insect is pulled toward the swarm's centre and jitters. And a swarm belongs to a place:
"moving the landmark leads to an overall displacement of the swarm" [77].

Swarms are a calm-evening sight. Midge flight fell off above about 2.5 m/s of wind and
stopped above 3 m/s [80]. In Washington and Oregon the mosquito months are July
to September [81].

### 5.4 Sound: the whine is one insect at the ear

A female mosquito's wings beat at about 475 Hz [82]; males beat higher, and raise
their pitch further when they swarm. Midges are lower: in one species about 240 Hz for
females and 434 Hz for males [83]. But a swarm is nearly silent. About 70 swarming males
measured 20 dB at 0.9 m from the swarm's centre [84], which is a whisper at arm's
length. The sound everyone knows is a single insect within a few tens of centimetres of one
ear: it swells, shifts from ear to ear and fades, with almost no change of pitch, because at
half a metre a second the Doppler shift is a fraction of a percent.

So the sound of insects at a lake is a quiet bed and, over it, single passes close to the
head. Around it sits the rest of the pond: on the Olympic Peninsula, the Pacific chorus frog,
whose calls carry energy from about 1.0 to 4.5 kHz and run from an hour before sunset past
midnight, February to May [85].

### 5.5 The clear lake, high on the mountain

Eight subalpine lakes in Olympic National Park, 1,224 to 1,589 m up, were measured in
September 2010 [64]. In seven the Secchi disc was still visible on the
bed, at depths of 4.6 to 10.9 m. Their dissolved organic carbon was 0.12 to 0.65 mg/L and
their chlorophyll at most 0.32 µg/L: no stain and almost no algae. The eighth, fed by a
snowfield, had a Secchi depth of 1.4 m with as little carbon and chlorophyll as the rest.

What changes in the picture follows from section 2.

- **The bed is the subject near the bank.** With the attenuation of section 2.3's very
  clear lake (about 0.2, 0.12 and 0.2 per metre), a bed 2 m down keeps a little under half its
  red and blue and three fifths of its green, and at 5 m a seventh of its red and blue and
  three tenths of its green. The shallows are the colour of their stones, the deeper water green to
  blue-green, and the shape of the basin can be read from the bank.
- **Refraction and caustics show.** The bed appears raised, at three quarters of its depth
  when seen from straight above and less when seen at a slant, and it swims with the
  ripples. In sun the net of caustics lies on it. Neither shows in brown water.
- **The mirror is the same.** Fresnel reflection does not depend on what is under the
  surface, so from 10 m out the lake still shows the sky and the far slope. Where it
  mirrors something dark, the bed shows through instead.
- **The margin is bare.** Without nutrients there are no algal mats or scum, and the cover
  is what falls in: needles, pollen in early summer, sunken wood.


## 6. How shipped games render the ocean and its shore

### 6.1 Offshore is solved: FFT ocean waves

The open sea converged years ago on one recipe. A statistical wave spectrum fills a grid of
frequencies; an inverse FFT turns it into a tileable patch of heights and horizontal
displacements, which sharpen the crests [86]. One patch either repeats visibly
or lacks detail, so several patches of different sizes are summed: four cascades from about
5 m to 1 km in War Thunder [87], one to three bands of 64 to 256 texels a side
in Unity's HDRP [88], eight cascades of 512 texels in Crest [89]. The
mesh is a set of camera-centred rings or a quadtree, with a flat skirt to the horizon.

| System | What runs | GPU | Cost |
|---|---|---|---|
| Crest, high setting [89] | 8 cascades of 512², 224 wave components, a wave simulation, foam, shadows | GTX 1070, 1080p | 1.99 ms to simulate, 0.98 ms to draw, 84 MB |
| Crest, default [89] | 7 to 8 cascades of 256² | GTX 1070 | 0.53 ms to simulate, 0.86 ms to draw, 21 MB |
| War Thunder [87] | 4 FFT cascades, shore waves, foam | GTX 770 | 0.5 ms to simulate, 0.5 ms to draw |
| Far Cry 5, lakes and rivers [90] | noise displacement, screen-space tessellation, foam, one compute pass of lighting | not stated | 1.9 ms, or 1.3 ms with asynchronous compute |

### 6.2 Near shore, engines do the opposite of nature

Real waves grow as the water shallows (section 3.2). Shipped engines shrink them. Crest
multiplies each wave by the depth over half its wavelength, fading it to nothing at the
waterline, and its source says so plainly: "i model 'Deep' water, but then simply ramp down
waves in non-deep water with a linear multiplier" [91]. Unreal's water has a
"wave attenuation water depth" that does the same [92]. It ships because
offshore waves must not run through a beach, and this is the cheapest way to stop them.
Crest's manual is frank about the rest: "Modelling realistic shoreline waves efficiently is
a challenging open problem" [93].

What engines add on top, from least to most physical:

- **Wave trains that follow the shore.** War Thunder bakes depth, distance to shore and the
  direction to shore into one texture of 4k by 4k texels for a map 65 km across, then runs waves whose phase is
  the distance to shore, scaled by depth, with the tops pushed forward to steepen the face,
  a sawtooth driving the foam, and the wet sand shaded as the water rolls back
  [87]. Unity's "shore wave" decal has the same parts, with a breaking range
  and a share of skipped waves to make sets [94]. Crests drawn this way follow the
  coastline's outline, not the paths real waves take: round a stack they radiate outward
  instead of wrapping.
- **Shelter computed from the terrain.** War Thunder also bakes an "openness" value for each
  texel by looking upwind for land, and scales both the ocean's and the shore's waves by it,
  so the lee of an island is calmer without anyone painting it [87]. It is the
  only shipped method we found that works shelter out from the terrain.
- **A shallow-water simulation near the shore.** Crest 5 blends a height-and-velocity grid in
  by depth: below a minimum depth the shape comes from the simulation alone [95].
  Such a simulation does shoal, steepen, turn to the bed and run up the beach. It has no
  dispersion, and as a height field it cannot curl. It is also cheap where it has been
  measured: Tencent's water system reports 0.13 ms for a grid of 512 cells a side with its
  foam on an RTX 3080, and 0.5 ms on a PlayStation 5 with four steps a frame, at one cell a
  metre [96]. The same talk lists shoreline waves by simulation as future work.
  What a grid cannot do is reach: at cells of 0.25 to 1 m, 512 cells cover 130 to 500 m of
  shore.

### 6.3 The plunging breaker is one technique, and it is baked

Horizon Forbidden West draws a true plunging breaker along a long coastline, and it is not
simulated. The observation it rests on is that the curling part of a wave "looks a lot like
it's a constant shape translating along the wavefront", so one animated cross-section serves
every wave [97]. A simulated breaker "needed so much cleanup" that the studio used
a hand-animated curve instead, stored as one texture: across the wave in one axis, time in
the other, with the inside of the tube kept "because you can look into the tube". Artists
draw where the wavefronts are and where each reaches its breaking moment; a compute shader
bends the water's vertices to the cross-section at each wavefront. One artist laid out
every wave in the game. The limits are named in the talk: "the triangle density wasn't high
enough", and foam kept per vertex pops on the wave's face. No cost is given.

Three more parties have published the same construction:

| Where | How the cross-section is made | How it is placed |
|---|---|---|
| Horizon Forbidden West, 2022 [97] | A hand-animated curve | Wavefront curves drawn by an artist |
| Unity's "rolling wave" sample, 2025 [98] | A modelled mesh of slices, baked to a texture of 256 by 138 texels, 8 bits a channel, 10 kB | One decal that slides along a straight line on a loop |
| Fluid Flux, used in Senua's Saga: Hellblade II, 2024 [99], [100] | "A small two-dimensional texture that stores data about the displacement of the mesh in time", made from splines | A distance field of the coastline, with painted masks for wave size |
| Skull and Bones, 2024 [101] | "A curve that can animate over time to give you this sort of shape as it rolls towards the land" | Not stated |

Unity's sample shows two limits of the approach. The texture is sampled by arc length along
the curled surface, so the stretched lip keeps its share of samples; but the engine's normal
is built from a height gradient and clamped to point upward, so the underside of the lip is
lit as if it faced the sky [88]. Hellblade II shows a use worth noting: the same
wave data that moves the mesh tells the sound whether the wave is "coming in or going out"
at the spot where the player stands, and changes the ground's material underfoot as the
water arrives [100].

None of the four gives a cost, because the cost is not the texture's. It is the cost of a
mesh fine enough to draw a lip, which these engines get from hardware tessellation. Unity
reports its whole water system at "approximately 4ms on the GPU on the latest generations"
of console, most of it "due to the important number of vertices required to get nice waves"
[102]. An older answer to the same need suits a game whose player never
leaves the land: Killzone 3 played back an ocean mesh animated ahead of time, 20,000 to
30,000 polygons, its triangles scattered "with the density based on the distance to where
the player could walk" [103].

In research, breaking has been added to a shallow-water simulation by launching sheets of
connected particles from steep wave fronts, so that the top outruns the base and the sheet
overturns; 160,000 to 200,000 cells ran at 40 to 75 frames a second on a 2007 desktop
processor [104].

Nothing shipped chooses the breaker's type from the beach's slope. Where waves plunge is an
artist's decision everywhere we looked.

### 6.4 Foam rendering, five ways

| Method | What it looks like | Where it fails |
|---|---|---|
| Fold detection: foam where the horizontal displacement folds the surface over itself [86], [87] | White fringes on the steepest crests | They flash and vanish with each crest; nothing at a beach |
| A foam buffer that persists: fed by the folds, carried by the flow, faded each frame [105] | Whitecaps that leave drifting streaks | One decay rate for every patch |
| Coverage as a statistic: the chance that a pixel's crests are folded, from the mean and variance of the fold measure [106] | The right grey-white sheen on a distant sea | No memory: the paper says it "does not handle their decay". It also ignores masking, "which is important at grazing angles" |
| A band by depth [93] | A white rim at the waterline | It does not move, and its width changes with the beach's slope. It is what Day Hike has now |
| Foam tied to each wave's breaking phase [87], [94], [97] | A line that breaks, then spreads, as each wave arrives | Drawn on a surface: the bore's tumbling volume is still a texture |

Unity's foam then ages: a lifetime value erodes a foam texture from solid white into lace,
with sharp edges on fresh foam and soft ones on old [88]. Crest adds a second,
bluish layer of bubbles under the surface [107]. Crest's foam buffer costs 0.16 ms
in the high setting above [89]. Sea of Thieves blurs its foam buffer with feedback
"to simulate the foam dispersing" [108].

### 6.5 Shading the water

Every modern system reads the scene's colour and depth behind the water, bends the lookup by
the surface normal, and darkens it with distance through the water [88],
[109]. For reflections the usual answer is screen-space reflection over a sky or
probe fallback (section 7.1). Light through a wave's crest is a shape trick everywhere. Sea of Thieves
blends toward a brighter colour by "a combination of view angle, sun direction and a wave
peak mask" made from the horizontal displacement [108]; none of these is a
volume integral. Skull and Bones sets the water's colour from three amounts, as
oceanographers do: living plankton, which turns water green; sediment, which makes it
opaque; and dissolved "yellow matter", which returns a "reddy brown" [101].

The piece most often missing is the distant glitter. Wave slopes smaller than a pixel either
alias into random sparkle or average away into a mirror with a pinpoint sun. The fix is to
turn the lost slope variance into roughness, which LEAN mapping does with two filterable
textures of slope moments, shown on a two-layer ocean [110], and which Bruneton,
Neyret and Holzschuch built into an ocean that moves from geometry to normals to roughness
with distance [111]. Far Cry 5 builds a
"variance based" smoothness buffer in screen space and calls it "very important for
filtering lighting" [90]. For a walker looking across kilometres of sea toward a
low sun, this decides whether the sea reads as water.

## 7. How shipped games render still water

### 7.1 Water reflections are the hard part, and the studios say so

On a still lake the mirror image is the picture (section 2.1), and every published method
is weakest exactly there.

| Method | What it gets right | Where it fails | Published cost |
|---|---|---|---|
| A second render of the scene, mirrored in the water plane | Everything above the water, in the right place, including what is outside the frame | It is a second render. Epic's advice is to "budget half your frame time for it" [112] | Unreal's open landscape demo went from 31 ms to about 52 ms; a small scene with baked lighting, from 11 ms to about 13 ms [112] |
| Screen-space reflection | It reuses the frame | It cannot reflect what is not on screen. Beside a lake the near water reflects the treetops above the top of the frame, so the mirror is empty where the walker looks | 0.95 to 3.2 ms at 4K on a GTX 1070, by quality [113] |
| Projecting each pixel across the water plane | Sharp and stable for whatever is on screen; exact for a flat plane | The same blind spot, patched with the last frame's result | 0.95 ms at 4K on a GTX 1070 [113]; 0.3 to 0.4 ms on consoles at quarter resolution [114] |
| A cube map or probe | The sky and distant light, nearly free | The far bank does not line up with its reflection | Almost nothing |

Far Cry 5 left the mirrored render for screen space over an environment map, and says why:
it was "difficult to maintain", "often it didn't match up with what was rendered in the
main view", and it allowed only one water height [115]. Its whole water system,
lakes and rivers, costs 1.9 ms on a platform the slide does not name [90].
Avatar: Frontiers of Pandora traces rays for water as a reflection layer of its own, 2.1 to
3.0 ms at quarter resolution, and still warns that the join between the screen-space result
and the coarser traced world shows on "low roughness reflections such as mirror and still
water", so that "artists need to avoid those kind of reflective surfaces" [116].

We found no first-hand account of the water in Red Dead Redemption 2, The Witcher 3, Death
Stranding or Alan Wake 2's lake beyond a line on how its transparency is sorted.

### 7.2 Murk, the edge and what floats

Murk in shipped engines is a fog inside the water with a colour and a density for each
water body. CryEngine's water volume has a fog density, a fog colour and a switch for
shadows on the fog [117]; Unreal's single-layer water has absorption and
scattering coefficients for each colour channel and reads the scene's depth and colour
behind the surface [109]. Neither gives the density a physical unit, which is where
section 2.3's measured coefficients can stand in.

For the contact line, The Last of Us Part II paints a texture of distance from every shore
and object, turns it into travelling ripples with a sine, and gets the normal from the
difference between the texture and a shifted copy of itself. One such texture covered 150 m
at 1024 px. Where ripples from two edges meet they interfere as real ones do, because the
waves are summed [118].

Algae has shipped as part of the water's own material. Far Cry 5's water carries an algae
tiling, an intensity and a falloff from the shoreline, drawn in the same pass as foam
[90]. CryEngine's water shader has a decal slot, and its manual's example is an
algae surface [119]. The Last of Us Part II's water buffers held foam,
churn and an algae normal side by side [118]. Floating leaves in Ghost of Tsushima
are particles: they "land on water surfaces and flow with the current", tens of thousands
on screen at once [120]. We found no account of duckweed or lily pads in a named
game.

### 7.3 Insects and their sound

No published source gives the number of insects a game draws or the distance at which they
appear; those numbers have to come from the animals (section 5.3). What games do publish is
how small creatures react. In Ghost of Tsushima the frogs, crabs and birds are particles
that spawn animated meshes, and they scatter because each character carries a faint sphere
of wind that the particles can sense [120].

In audio middleware the pattern for scattered small sounds is one emitter that spawns
sounds at random positions between a minimum and a maximum distance from itself, at random
intervals, with random pitch and volume and a cap on voices [121].

In a browser the pieces are the Web Audio panner and oscillator. A panner in its HRTF mode
is the costly one: "very expensive", in the words of a browser audio engineer, where the
equal-power mode is "rather cheap" [122]. Chrome runs two convolutions for a still
source and four while it moves, since each step of position starts a cross-fade of about
45 ms [123]. An oscillator's frequency can change at every sample
[124], so a whine can be made with no recording at all. No measurement of a
panner's cost in milliseconds was found.

## 8. What a browser can run: WebGPU and WebGL2

### 8.1 What the two APIs allow

Day Hike draws with WebGPU on its high tier, in Chrome and Edge on macOS and Windows, and
with WebGL2 everywhere else, which includes every Mac in Safari and every phone.

| Needed for | WebGPU | WebGL2 |
|---|---|---|
| An FFT of the wave spectrum | Compute shaders; `rgba16float` can be both written as storage and filtered [125] | No compute: the FFT runs as fragment passes, two for every doubling of the grid, so 16 passes for a grid of 256 |
| Float render targets | Yes | Rendering to float textures is supported on 99.95 % of devices surveyed [126] |
| Filtering 32-bit float textures | An optional feature | Missing on about 45 % of iOS devices and 41 % of Safari [127]; half-float textures filter everywhere, so displacement belongs in `rgba16float` |
| Foam and particle state | Storage textures and buffers | Ping-pong render targets and transform feedback |
| Reflections by projecting pixels across the water plane | Possible: the method needs an atomic maximum, which WGSL has | Not possible: no atomics, no random-access writes |
| A reflection or refraction by a second render of the scene | Yes | Yes |

Almost everything water needs has a WebGL2 form, at a higher cost. What has none is compute,
atomics and random-access writes.

### 8.2 What Babylon.js 9.18 gives

The engine has every building block and no ocean. Its `WaterMaterial` is not a PBR material,
so none of the game's material plugins can attach to it, the fog among them; it renders the
scene three times a frame, its waves are one sine along each axis, and its Fresnel term
cannot reach full reflection at grazing angles. The engine's WebGPU ocean is a demonstration
outside the package [128]: three cascades of 256 texels at 250, 17 and 5 m, a
JONSWAP spectrum, fold-driven foam that accumulates, and a clipmap mesh. By our count of
its source it issues about 230 compute dispatches a frame, because its FFT is one dispatch
for each stage of each of four fields in each cascade.

Two details of the engine bear on reflections. Its planar mirror renders an explicit list of
meshes, with a refresh rate, a blur and cheaper stand-in materials available, which are the
levers for making a mirror affordable. And its clip plane is a `discard` in the fragment
shader, so every material drawn into a mirror compiles a new variant; three.js and
PlayCanvas clip with an oblique projection instead, which needs no shader change
[129], [130]. That method moves the near plane onto the clip
plane "at absolutely no performance cost", but it has "a severe impact on depthbuffer
precision" [131], so nothing drawn into such a mirror may read depth from the
depth buffer. The engine's newest release, 9.28, has neither an oblique mirror nor
hardware clip distances, and no ocean. Since 7.21 a material plugin can be written in
WGSL as well as GLSL [132].

### 8.3 What others have built on the web

| Project | API | Waves | Foam |
|---|---|---|---|
| Babylon.js ocean demo [128] | WebGPU compute | 3 cascades of 256² | Folds, accumulated; contact foam from a depth pass |
| WebTide [133] | WebGPU compute | One 512² tile, Phillips spectrum | None |
| poseidon [134] | WebGPU compute, no fallback | 3 cascades of 256² at 1024, 144 and 24 m | Folds with build-up and decay |
| abyssal-ocean [135] | WebGL2 fragment passes | 3 cascades of 512²; phones default to 256² | Folds, accumulated and diffused |
| SeedOcean [136] | WebGPU FFT; WebGL2 falls back to summed sine waves | 3 cascades of 128² or 256² | Persistent and advected; a surf preset with a foam band by depth |
| three.js `Water` [129] | both | None: a flat plane with four scrolling normal-map taps | None |
| PlayCanvas water [130] | both | Six summed waves | A band by depth |

None of these seven states a frame time. Three newer projects do.

### 8.4 Measured costs of water in a browser

The browser figures below come from single authors' repositories a few weeks old, and
nobody has reproduced them. They are enough to size an experiment and not enough to skip
it.

| What | Where | GPU, resolution | Cost |
|---|---|---|---|
| FFT as fragment passes, 1, 2 and 3 cascades of 256² [137] | Browser, WebGL2 | Apple M5, 1280 by 800 | 1.82, 2.47 and 3.28 ms for the whole frame of an otherwise empty sea: about 0.7 ms a cascade |
| The same, 3 cascades of 512² [137] | Browser, WebGL2 | Apple M5, 1280 by 800 | 12.4 to 14.0 ms for the whole frame |
| FFT in compute, 3 cascades of 128², with a shallow-water step on a 256² grid [138] | Browser, WebGPU | An Apple GPU, chip not named, 1440 by 900 | 0.64 to 0.81 ms to simulate; 5.4 to 7.0 ms to draw the water |
| Shallow-water shore, 241 by 401 cells, two steps [139] | Browser, WebGPU | An NVIDIA GPU, model not named | 3.2 to 3.3 ms an update, waiting on the GPU after each |
| Reflection by a march in the water's own shader, 24 steps [137] | Browser, WebGL2 | Apple M5, 1280 by 800 | About 1.0 ms |
| FFT in compute, 4 cascades of 256², one dispatch for each direction [140] | Native | RTX 4070, 1440p | 0.08 to 0.11 ms to simulate; 0.97 to 3.9 ms to draw |
| Reflection by projecting pixels across the plane, target 256 px high [141] | Native, phones | Adreno 630 and 612 | Under 1 ms, and 1 to 2 ms |

Four things follow.

- **On WebGL2 the FFT is the cost.** Three cascades of 256 texels take over 2 ms on a chip
  newer than any the medium tier is meant for. One cascade fits; so does a sea computed
  ahead of time. Tessendorf's notes give the way to make one loop: round every wave's
  frequency down to a multiple of 2π over the loop's length [86]. The
  rounding is coarsest for the longest waves. In a 20 s loop a swell 200 m long travels
  43 % too slowly, and in a 100 s loop 9 % too slowly, so a loop suits wind chop, and
  swell is better carried by a few analytic waves that need no loop.
- **On WebGPU the simulation is cheap and the drawing is not.** Every source that
  separates the two found the shading and the vertex work as dear as the simulation or
  dearer. Moving the wave textures from 32-bit to 16-bit floats saved one author 1.27 ms of
  drawing and almost nothing of simulation [140].
- **How the FFT is dispatched matters more than its size.** The native figure above runs
  each direction of the transform as one dispatch that works in place. No one has
  published the cost of three cascades of 256 texels in WebGPU compute on Apple silicon.
- **Nobody draws a plunging breaker in a browser.** The one project that tried reports two
  failures, "a folded strip formed a bright cylindrical tube, while a reduced fold formed a
  long horizontal shelf", and keeps a patch that only rounds the crest [138]. Particle
  fluids do run: about 100,000 particles on a laptop's integrated GPU and 300,000 on
  "decent GPUs", by their author's account, in a tank and not at a shore [142].

We found no measured cost, in any browser engine on named hardware, for a mirrored second
render of a scene or for a copy of the scene's colour taken in the middle of a frame.

### 8.5 Measuring it ourselves

Two traps wait for whoever measures. Chrome rounds WebGPU's timestamp queries to steps of
65,536 ns unless its developer features are switched on [143], and a water
pass of 0.1 to 0.8 ms is only 2 to 12 such steps. And on WebGL2 over Metal, timer queries
do not add up: one project's sections summed to 12.6 ms inside a frame of 2.3 ms, and the
queries themselves cost 2 to 7 % of the frame rate [137]. Paired frame times with
the feature on and off are the measure to trust there.

## 9. Water rendering options, system by system

Costs are the published ones from sections 6 to 8, on the hardware their sources name.
"Not measured" means no source gave a figure. None of these has been measured in Day Hike.

### 9.1 The sea's surface

| Option | Against real water | Cost | Needs |
|---|---|---|---|
| A sum of 4 to 8 analytic waves in the vertex shader | Carries swell well: its period, direction, grouping and speed can be set from section 3. Too few waves for a wind sea, which looks periodic | Not measured; no render passes | Nothing new. Runs on every tier |
| An FFT of a wave spectrum, 3 cascades, in compute | A statistically correct wind sea and swell; no bed, no groups unless the spectrum makes them | 0.08 to 0.11 ms for 4 cascades of 256² on an RTX 4070; 0.64 to 0.81 ms for 3 of 128² with a shore grid on an Apple GPU | WebGPU. Float textures the vertex and fragment stages read |
| The same FFT as fragment passes | The same sea | About 0.7 ms a cascade of 256² on an Apple M5; 12 to 14 ms for 3 of 512² | WebGL2 with float render targets |
| A sea computed when the game loads, looped | The same sea, repeating. The loop distorts long waves most, so swell has to come from analytic waves | No cost in the frame beyond texture reads; memory for the frames | A texture array. Runs on every tier |
| Roughness from the slopes the mesh and textures cannot show | The glitter path, vertical streaks and the dark horizon of section 2.2, which no amount of geometry gives at a distance | Two texture reads of slope moments [110]; not measured here | Mipmapped slope textures |

### 9.2 Waves at the shore, and the breaker

| Option | Against real water | Cost | Needs |
|---|---|---|---|
| Fade the offshore waves out by depth | Wrong way round: real waves grow as they shoal. It stops waves running through the beach | One texture read | A depth map of the sea bed, which the terrain function gives exactly |
| Wave trains whose phase is the distance to shore, grown and steepened by depth, in groups | Crests parallel to the beach, arriving in sets, breaking where depth is about 1.3 times their height. Crests follow the coastline's outline, so they radiate from a stack instead of wrapping round it | Within War Thunder's 0.5 ms on a GTX 770 | A baked texture of depth, distance and direction to shore |
| The same, with phase from a field of wave travel time computed from the bed when the world is built | Adds what section 3.2 describes: crests that turn to the bed, wrap round headlands and stacks, and cross behind them | No published example; the bake is ours to write. At run time the same as the row above | The bake, and a texture of it |
| Shelter from the terrain, baked | Smaller waves in the lee of headlands and stacks; ignores the bending of swell into the lee | One texture read | A bake at load |
| A shallow-water simulation in the last hundred metres | Waves that slow, steepen, run up the sand, drain back and carry foam with them. No curl; no dispersion | 0.13 ms for 512² on an RTX 3080; 0.5 ms on a PlayStation 5; 3.2 ms for 241 by 401 in one browser port | Compute on WebGPU; ping-pong float targets on WebGL2. 512 cells at 0.5 m reach 256 m |
| A baked cross-section of a plunging wave, swept along the break line | The concave face, the lip and the tube, with a breaking point that runs along the crest. Where it plunges is set by hand in every shipped use; section 3.3 gives the rule to set it from the bed instead | Not published anywhere. The texture is about 10 kB; the cost is a mesh fine enough to draw the lip | A strip of dense mesh along the break line; normals from baked derivatives |
| Sheets of particles launched from steep fronts | An overturning lip that comes out of a simulation | 40 to 75 frames a second for the whole simulation on a 2007 processor | A shallow-water simulation under it, and a mesh built each frame |

### 9.3 Foam

| Option | Against real water | Cost | Needs |
|---|---|---|---|
| A band by depth, as now | Does not move | Nothing | Nothing |
| Foam where the surface folds, kept in a buffer that fades | Whitecaps offshore that leave streaks. One fade rate stands in for section 3.5's life of a patch | 0.16 ms in Crest on a GTX 1070 | A render target that persists, moved with the camera |
| Foam from each wave's breaking phase, aged by a second value | The line that breaks, spreads and thins to lace. The aging is what section 3.5 asks for | Not separated in any source | The shore waves of section 9.2 |
| Coverage as a statistic at a distance | The right fraction of white in a far pixel | Part of the water's shading | Mipmapped moments of the fold measure |
| Spray as particles at the break and at rocks | The plume, and the haze over the surf | Not measured; the cost is overdraw | A particle system tied to the break events |

### 9.4 Reflection

| Option | Against real water | Cost | Needs |
|---|---|---|---|
| The sky alone, from a probe, taken from 20 to 30° above the horizon on rough water | Right for the open sea in any wind, where the coast is not mirrored at all (section 2.2). Wrong for a lake | One cube map read | Nothing new |
| A march through the frame's depth, in the water's shader | Stacks and headlands in a calm sea. On a lake it loses the treetops above the frame | About 1.0 ms at 1280 by 800 on an Apple M5 for 24 steps | The scene's depth and colour, which no material can read today |
| Projecting pixels across the water plane | Sharp and exact for a flat lake; the same blind spot | 0.3 to 0.4 ms on consoles at quarter resolution; under 1 ms on a 2018 phone at 256 px | WebGPU compute. Not possible on WebGL2 |
| A second, mirrored render of a short list: sky, terrain, tree impostors | The whole mirror, treetops included. What a still lake needs | Not measured in any browser. In Unreal, from 15 % to 79 % of the frame, by how much is drawn | A render target, and either an oblique projection or a clipped variant of each material drawn |

### 9.5 Colour, murk and the bed

| Option | Against real water | Cost | Needs |
|---|---|---|---|
| Depth from the terrain function, with exp(−2 Kd H) in each colour channel and section 2.3's measured Kd | The amber rim of a brown lake, the green filter over sand in the sea, the dark water beyond | Arithmetic | Nothing new |
| Alpha blending with the alpha taken from the same exponential | The same, over whatever the frame already holds; one channel's worth of attenuation unless drawn in two passes | One or two draws | Nothing new |
| A copy of the scene's colour, read with an offset | Refraction: the bed raised and wobbling with the ripples | Not measured in any browser | A copy of the frame, this frame's or the last |
| Wet sand and wet rock in the terrain's shader, in three states | Dry, damp at 0.7 and soaked at 0.4 of dry, with a mirror gloss where water lies | Arithmetic in a shader that already has a wetness term | The waterline's position, which the shore waves give |

### 9.6 The mesh

The sea's rings have cells of 8 m near the camera. Waves shorter than about 16 m cannot be
drawn on them. Every system in section 8 uses cells of 0.25 to 1 m near the viewer, and a
player at the waterline needs the same. Two densities have to be met at once: fine cells
round the camera, wherever it stands, and fine cells along the break line, where a
plunging lip is drawn, however far off the camera is. Killzone 3's mesh, dense where the
player could walk, is the pattern for the second.

### 9.7 The lake's margin and its cover

| Option | Against a real lake | Cost | Needs |
|---|---|---|---|
| A cover mask in the water's material, from depth, distance to shore and the downwind end | Algae rafts in the shallows, scum and pollen on the lee shore, all matt | One texture read; shipped this way in Far Cry 5 and CryEngine | A baked texture for each lake |
| Pond-lily pads, reeds and sedges placed by depth bands | The zoned margin of section 5.2 | The cost of the instances | The game's existing scatter, with depth as an input |
| Ripples from the shore and from every stem and log, from a baked distance texture | The contact line, with true interference | Two texture reads; one 1024 px texture covered 150 m in The Last of Us Part II | A baked texture for each lake |
| Roughness in patches that drift with the gusts, none in the lee | The glassy strip under the upwind trees and the cat's paws beyond | Arithmetic on a noise texture | The game's wind |
| Rings from insects, fish and rain | The surface's small life | A few stamped decals a second | Nothing new |

A clear lake and a murky one are the same material with different attenuation. What moves
is where the effort goes: on a clear lake, to the bed, its refraction and its caustics; on
a murky one, to the cover and the margin.

### 9.8 Insects

| Option | Against real insects | Cost | Needs |
|---|---|---|---|
| Swarms as instanced specks, each pulled to its swarm's centre with jitter, over markers 1.6 to 2.2 m up | What section 5.3 measures: tens of insects, about 13 cm apart, looping about once a second, tied to a place | One draw for every swarm in view | The game's thin instances and its wind; off above 3 m/s |
| Single mosquitoes that come to the player from 5 to 15 m and hover within 20 cm | The approach everyone knows | A handful of instances | The same |
| Dragonflies on a beat along the edge, striders on the surface | Daytime life | A few animated meshes | The game's wildlife system |

### 9.9 Sound

| Option | Against the real thing | Cost | Needs |
|---|---|---|---|
| A quiet bed near the lake, by hour and season: chorus frogs on spring nights, wind in sedges | The pond's soundscape | One looping source | A loop option in the game's audio, which has none yet |
| Single insect passes close to the head, on an HRTF panner | The whine as it is heard: one insect within arm's reach, swelling and crossing between the ears | Four convolutions while the source moves; milliseconds not measured | Recordings, or an oscillator near 475 Hz with harmonics |
| Surf as a line source that rises and falls with the sets, with thuds on the plunges | Section 3.6 | A few looping and one-shot sources | The shore waves' phase, as Hellblade II used it |

Recordings that may ship in a public game are few. The US National Park Service's sound
gallery is in the public domain and holds a recording of surf from Olympic National Park
[144]. On Freesound, recordings of a mosquito at the microphone and of Pacific
chorus frogs in Washington are offered under Creative Commons 0 [145],
[146]. The well-known bird archives license for non-commercial use or under
share-alike terms, which would bind the game's own audio.

## 10. What nobody has measured

What follows is what this survey looked for and did not find. Each is either a measurement
to make in the game or a number to choose by eye.

**In the renderer**

- The cost of three FFT cascades of 256 texels in WebGPU compute on Apple silicon, or on
  an integrated GPU.
- The cost of a mirrored second render in any browser engine, and of a copy of the
  scene's colour taken in the middle of a frame.
- The cost of the mesh that a plunging breaker needs. No shipped use of the technique
  gives a figure.
- Whether a baked field of wave travel time gives crests that read as real round a
  headland. We found no game that does it.
- What an HRTF panner costs for each source, in milliseconds, in Chrome and in Safari.

**In the world**

- How clear the sea is within a few kilometres of the Olympic coast, and in its surf.
- The slope of the sand flat below Rialto's pebble face, and the size of the pebbles.
- How long foam lasts once it is left on the wet sand, and how thick the sheet of water
  is that carries it there.
- How high spray rises at a natural stack. The sources say "several tens of meters" and
  give no measurement.
- The distance at which the published levels of surf sound were taken, and any spectrum
  of pebbles rattling as heard in air.
- When mosquitoes and biting flies are worst on the Olympic Peninsula. The park's own
  pages do not mention them.
- How the water is drawn in Red Dead Redemption 2, The Witcher 3, Death Stranding, Ghost of
  Tsushima and Avatar: Frontiers of Pandora's sea. We found no first-hand account of any.

**Read only in part**

Some papers were read as abstracts, because their publishers refuse automated reading:
Koepke's and Schenck's in section 2.4, Kahma and Donelan's in 2.2, Ruggiero's run-up
paper in 3.4, and Callaghan's and Monahan's whitecap lifetimes in 3.5. Two talks that bear
on the breaker were not readable at all: Guerrilla's 2024 follow-up on simulated rolling
waves, and Sledgehammer's on the sea of Call of Duty: WWII.

## 11. What this means for Day Hike

Three questions in this survey were about the world and not the renderer. We have answered
them, and each answer changes which of section 9's options are worth their cost.

1. **The water is built as if the player can reach it.** Nobody reaches Day Hike's beach
   today, but the water is a system to be reused, in later maps and in other games, where
   the player will stand in the swash. So the last 20 m of the beach are in scope: the
   swash sheet and its mirror on the wet sand, foam thinning to lace, refraction of the bed,
   a fine mesh at the waterline, and with them a shallow-water simulation. What reads from
   a distance is wanted as well: sets, break lines that follow the bed, foam that lives
   20 s, glitter and sound.
2. **The coast gets a steep beach.** On a bed of 1:67 every wave spills, whatever its size.
   A concave wave belongs on a face of about 1:12 reached by unbroken swell, so the world
   gains a pebble pocket beach between two headlands, as this coast has. The flat sand bays
   stay, and keep their lines of spilling white water.
3. **Lakes sit low and high.** A lowland lake with marsh at an end is murky, with algae at
   its margin; a lake high on the mountain is clear to its bed. One lake material serves
   both, with the measured attenuation of section 2.3 as its setting. Either needs a basin
   the terrain does not make today, in ground flat enough to hold a level rim.

The sea bed and the lakes are part of the world every player must agree on, so the second
and third change the world, and are best made together.

Two more questions follow from section 8 and wait for a measurement: whether materials gain
a way to read the scene's depth and colour, which refraction and reflections by marching
need; and whether the water's shader is written in WGSL beside the GLSL the other tiers
use, which would spare it the translation that every other material goes through.

## 12. Sources

1. C. Mobley, "The level sea surface," Ocean Optics Web Book, May 2021. Accessed: Sep. 29, 2026. [Online]. Available: https://www.oceanopticsbook.info/view/surfaces/the-level-sea-surface
2. C. Mobley, "Cox-Munk sea surface slope statistics," Ocean Optics Web Book, May 2021. Accessed: Sep. 29, 2026. [Online]. Available: https://www.oceanopticsbook.info/view/surfaces/cox-munk-sea-surface-slope-statistics
3. C. Cox and W. Munk, "Measurement of the roughness of the sea surface from photographs of the sun's glitter," *J. Opt. Soc. Amer.*, vol. 44, no. 11, pp. 838-850, Nov. 1954. Accessed: Sep. 29, 2026. [Online]. Available: https://userpages.umbc.edu/~martins/phys650/Cox%20and%20Munk%20Glint%20paper.pdf
4. D. K. Lynch, D. S. P. Dearborn, and J. A. Lock, "Glitter and glints on water," *Appl. Opt.*, vol. 50, no. 28, pp. F39-F49, 2011. Accessed: Sep. 29, 2026. [Online]. Available: https://csuohio.elsevierpure.com/ws/portalfiles/portal/39955766/Glitter%20and%20Glints%20on%20Water.pdf
5. Wikipedia contributors, "Capillary wave," Wikipedia. Accessed: Sep. 29, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Capillary_wave
6. Wikipedia contributors, "Beaufort scale," Wikipedia. Accessed: Sep. 29, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Beaufort_scale
7. K. K. Kahma and M. A. Donelan, "A laboratory study of the minimum wind speed for wind wave generation," *J. Fluid Mech.*, vol. 192, pp. 339-364, 1988. Accessed: Sep. 29, 2026. [Online]. Available: https://doi.org/10.1017/S0022112088001892
8. M. Minnaert, *The Nature of Light and Colour in the Open Air*. New York, NY, USA: Dover, 1954. Accessed: Sep. 29, 2026. [Online]. Available: https://archive.org/details/minnaert-light-and-color-in-nature
9. J. A. Shaw, "Glittering light on water," *Opt. Photon. News*, vol. 10, no. 3, pp. 43-45, Mar. 1999. Accessed: Sep. 29, 2026. [Online]. Available: https://psl.noaa.gov/outreach/education/science/glitter/
10. C. D. Markfort, E. L. Resseger, W. Zhang, F. Porté-Agel, and H. G. Stefan, "Wind sheltering of small lakes by complex terrain," presented at the 20th Symp. Boundary Layers and Turbulence, Boston, MA, USA, Jul. 2012. Accessed: Sep. 29, 2026. [Online]. Available: https://ams.confex.com/ams/20BLT18AirSea/webprogram/Manuscript/Paper209465/Wakes_extended_abstract_070912_CMarkfort.pdf
11. Wikipedia contributors, "Langmuir circulation," Wikipedia. Accessed: Sep. 29, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Langmuir_circulation
12. R. M. Pope and E. S. Fry, "Absorption spectrum (380-700 nm) of pure water. II. Integrating cavity measurements," data file, Oregon Medical Laser Center, 1997. Accessed: Sep. 29, 2026. [Online]. Available: https://omlc.org/spectra/water/data/pope97.txt
13. E. Boss, "Colored dissolved organic matter," Ocean Optics Web Book, Jan. 2021. Accessed: Sep. 29, 2026. [Online]. Available: https://www.oceanopticsbook.info/view/optical-constituents-of-the-ocean/colored-dissolved-organic-matter
14. H. Arst et al., "Optical properties of boreal lake waters in Finland and Estonia," *Boreal Environ. Res.*, vol. 13, pp. 133-158, 2008. Accessed: Sep. 29, 2026. [Online]. Available: https://www.borenv.net/BER/archive/pdfs/ber13/ber13-133.pdf
15. F. Henderikx Freitas, G. S. Saldías, M. Goñi, R. K. Shearman, and A. E. White, "Temporal and spatial dynamics of physical and biological properties along the Endurance Array of the California Current ecosystem," *Oceanography*, vol. 31, no. 1, pp. 80-89, 2018. Accessed: Sep. 29, 2026. [Online]. Available: https://par.nsf.gov/servlets/purl/10078647
16. A. Morel, H. Claustre, D. Antoine, and B. Gentili, "Natural variability of bio-optical properties in Case 1 waters: attenuation and reflectance within the visible and near-UV spectral domains, as observed in South Pacific and Mediterranean waters," *Biogeosciences*, vol. 4, no. 5, pp. 913-925, Oct. 2007. Accessed: Sep. 29, 2026. [Online]. Available: https://bg.copernicus.org/articles/4/913/2007/bg-4-913-2007.pdf
17. M. L. Zoffoli, R. Frouin, and M. Kampel, "Water column correction for coral reef studies by remote sensing," *Sensors*, vol. 14, no. 9, pp. 16881-16931, 2014. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC4208206/
18. C. Nolet, A. Poortinga, P. Roosjen, H. Bartholomeus, and G. Ruessink, "Measuring and modeling the effect of surface moisture on the spectral reflectance of coastal beach sand," *PLoS ONE*, vol. 9, no. 11, Art. no. e112151, Nov. 2014. Accessed: Sep. 29, 2026. [Online]. Available: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0112151
19. H. M. Dierssen, "Hyperspectral measurements, parameterizations, and atmospheric correction of whitecaps and foam from visible to shortwave infrared for ocean color remote sensing," *Front. Earth Sci.*, vol. 7, Art. no. 14, Feb. 2019. Accessed: Sep. 29, 2026. [Online]. Available: https://www.frontiersin.org/articles/10.3389/feart.2019.00014/full
20. P. Koepke, "Effective reflectance of oceanic whitecaps," *Appl. Opt.*, vol. 23, no. 11, pp. 1816-1824, 1984. Accessed: Sep. 29, 2026. [Online]. Available: https://opg.optica.org/abstract.cfm?URI=ao-23-11-1816
21. H. Schenck, "On the focusing of sunlight by ocean waves," *J. Opt. Soc. Amer.*, vol. 47, no. 7, pp. 653-657, 1957. Accessed: Sep. 29, 2026. [Online]. Available: https://opg.optica.org/abstract.cfm?URI=josa-47-7-653
22. Wikipedia contributors, "Lux," Wikipedia. Accessed: Sep. 29, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Lux
23. National Data Buoy Center, "Station 46041, Cape Elizabeth: historical standard meteorological data, 2015 to 2024," NOAA. Accessed: Sep. 29, 2026. [Online]. Available: https://www.ndbc.noaa.gov/station_page.php?station=46041
24. Coastal Wiki contributors, "Statistical description of wave parameters," Coastal Wiki, Flanders Marine Institute. Accessed: Sep. 29, 2026. [Online]. Available: https://www.coastalwiki.org/wiki/Statistical_description_of_wave_parameters
25. U.S. National Weather Service, "Rip current science," NOAA. Accessed: Sep. 29, 2026. [Online]. Available: https://www.weather.gov/safety/ripcurrent-science
26. Coastal Wiki contributors, "Shallow-water wave theory," Coastal Wiki, Flanders Marine Institute. Accessed: Sep. 29, 2026. [Online]. Available: https://www.coastalwiki.org/wiki/Shallow-water_wave_theory
27. J. Bosboom and M. J. F. Stive, *Coastal Dynamics*. Delft, The Netherlands: TU Delft OPEN Books, 2023. Accessed: Sep. 29, 2026. [Online]. Available: https://books.open.tudelft.nl/home/catalog/book/202
28. U.S. Army Corps of Engineers, "Estimation of nearshore waves," in *Coastal Engineering Manual*, EM 1110-2-1100, pt. II, ch. 3, Apr. 2002. Accessed: Sep. 29, 2026. [Online]. Available: https://coastalengineeringmanual.tpub.com/Part-II-Chap3/
29. U.S. Army Corps of Engineers, "Meteorology and wave climate," in *Coastal Engineering Manual*, EM 1110-2-1100, pt. II, ch. 2, Jul. 2003. Accessed: Sep. 29, 2026. [Online]. Available: https://coastalengineeringmanual.tpub.com/Part-II-Chap2/
30. U.S. Army Corps of Engineers, "Surf zone hydrodynamics," in *Coastal Engineering Manual*, EM 1110-2-1100, pt. II, ch. 4, Jul. 2003. Accessed: Sep. 29, 2026. [Online]. Available: https://web.archive.org/web/20250824030847/http://www-f1.ijs.si/~rudi/sola/surf-zone.pdf
31. J. A. Battjes, "Surf similarity," in *Proc. 14th Int. Conf. Coastal Eng.*, Copenhagen, Denmark, 1974, pp. 466-480. Accessed: Sep. 29, 2026. [Online]. Available: https://journals.tdl.org/icce/index.php/icce/article/download/2921/2586
32. M. A. Erinin, X. Liu, S. D. Wang, and J. H. Duncan, "Plunging breakers. Part 1. Analysis of an ensemble of wave profiles," arXiv:2210.01925, 2022. Accessed: Sep. 29, 2026. [Online]. Available: https://arxiv.org/pdf/2210.01925
33. A. O'Dea, K. Brodie, and S. Elgar, "Field observations of the evolution of plunging-wave shapes," *Geophys. Res. Lett.*, vol. 48, no. 16, 2021. Accessed: Sep. 29, 2026. [Online]. Available: https://web.archive.org/web/20231210110208/https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2021GL093664
34. C. A. Benbow, "A temporal and spatial analysis of wave-generated foam patterns in the surf zone," M.S. thesis, Naval Postgraduate School, Monterey, CA, USA, Dec. 2015. Accessed: Sep. 29, 2026. [Online]. Available: https://calhoun.nps.edu/handle/10945/47904
35. B. E. Scarfe, T. R. Healy, and H. G. Rennie, "Research-based surfing literature for coastal management and the science of surfing: a review," *J. Coastal Res.*, vol. 25, no. 3, pp. 539-557, May 2009. Accessed: Sep. 29, 2026. [Online]. Available: https://doi.org/10.2112/07-0958.1
36. D. R. Di Leonardo and P. Ruggiero, "Regional scale sandbar variability: observations from the U.S. Pacific Northwest," *Cont. Shelf Res.*, vol. 95, pp. 74-88, 2015. Accessed: Sep. 29, 2026. [Online]. Available: https://ir.library.oregonstate.edu/downloads/s7526f101
37. M. Brocchini and T. E. Baldock, "Recent advances in modeling swash zone dynamics: influence of surf-swash interaction on nearshore hydrodynamics and morphodynamics," *Rev. Geophys.*, vol. 46, no. 3, 2008. Accessed: Sep. 29, 2026. [Online]. Available: https://web.archive.org/web/20250801190206/https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2006RG000215
38. Coastal Wiki contributors, "Swash zone dynamics," Coastal Wiki, Flanders Marine Institute. Accessed: Sep. 29, 2026. [Online]. Available: https://www.coastalwiki.org/wiki/Swash_zone_dynamics
39. P. Ruggiero, R. A. Holman, and R. A. Beach, "Wave run-up on a high-energy dissipative beach," *J. Geophys. Res.*, vol. 109, no. C6, Jun. 2004. Accessed: Sep. 29, 2026. [Online]. Available: https://doi.org/10.1029/2003JC002160
40. Y. Watanabe and D. M. Ingram, "Size distributions of sprays produced by violent wave impacts on vertical sea walls," *Proc. Roy. Soc. A*, vol. 472, no. 2194, Art. no. 20160423, Oct. 2016. Accessed: Sep. 29, 2026. [Online]. Available: https://eprints.lib.hokudai.ac.jp/repo/huscap/all/67295/RSPA_dropstats_f_YW_DMI.pdf
41. A. M. J. van Eijk et al., "Sea-spray aerosol particles generated in the surf zone," *J. Geophys. Res.*, vol. 116, no. D19, 2011. Accessed: Sep. 29, 2026. [Online]. Available: https://publications.tno.nl/publication/34612105/cBMaXz/pub441903.pdf
42. A. H. Callaghan, G. B. Deane, M. D. Stokes, and B. Ward, "Observed variation in the decay time of oceanic whitecap foam," *J. Geophys. Res.*, vol. 117, no. C9, 2012. Accessed: Sep. 29, 2026. [Online]. Available: https://doi.org/10.1029/2012JC008147
43. E. C. Monahan and C. R. Zietlow, "Laboratory comparisons of fresh-water and salt-water whitecaps," *J. Geophys. Res.*, vol. 74, no. 28, pp. 6961-6966, Dec. 1969. Accessed: Sep. 29, 2026. [Online]. Available: https://doi.org/10.1029/JC074i028p06961
44. A. Callaghan, G. de Leeuw, L. Cohen, and C. D. O'Dowd, "Relationship of oceanic whitecap coverage to wind speed and wind history," *Geophys. Res. Lett.*, vol. 35, no. 23, Art. no. L23609, Dec. 2008. Accessed: Sep. 29, 2026. [Online]. Available: https://publications.tno.nl/publication/34634744/GrDGh7/2008-U-P0367.pdf
45. M. F. M. A. Albert, M. D. Anguelova, A. M. M. Manders, M. Schaap, and G. de Leeuw, "Parameterization of oceanic whitecap fraction based on satellite observations," *Atmos. Chem. Phys.*, vol. 16, no. 21, pp. 13725-13751, Nov. 2016. Accessed: Sep. 29, 2026. [Online]. Available: https://acp.copernicus.org/articles/16/13725/2016/acp-16-13725-2016.pdf
46. G. Sinnett, "The nearshore heat budget," Ph.D. dissertation, Univ. California San Diego, La Jolla, CA, USA, 2018. Accessed: Sep. 29, 2026. [Online]. Available: https://escholarship.org/uc/item/7nt521mv
47. J. MacMahan, "Increased aerodynamic roughness owing to surfzone foam," *J. Phys. Oceanogr.*, vol. 47, no. 8, pp. 2115-2122, 2017. Accessed: Sep. 29, 2026. [Online]. Available: https://web.archive.org/web/20250612005904/https://journals.ametsoc.org/view/journals/phoc/47/8/jpo-d-17-0054.1.xml
48. A. H. Callaghan, G. B. Deane, and M. D. Stokes, "A comparison of laboratory and field measurements of whitecap foam evolution from breaking waves," *J. Geophys. Res. Oceans*, vol. 129, no. 1, Jan. 2024. Accessed: Sep. 29, 2026. [Online]. Available: https://web.archive.org/web/20250613093633/https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2023JC020193
49. K. Bolin, "Wind turbine noise and natural sounds: masking, propagation and modeling," Ph.D. dissertation, KTH Roy. Inst. Technol., Stockholm, Sweden, 2009. Accessed: Sep. 29, 2026. [Online]. Available: https://kth.diva-portal.org/smash/get/diva2:217217/FULLTEXT01.pdf
50. C. Dallas and C. Tollefsen, "Physical mechanisms underlying the acoustic signature of breaking waves," *Can. Acoust.*, vol. 43, no. 3, 2015. Accessed: Sep. 29, 2026. [Online]. Available: https://jcaa.caa-aca.ca/index.php/jcaa/article/download/2779/2502/3433
51. T. Petrut, T. Geay, C. Gervaise, P. Belleudy, and S. Zanker, "Passive acoustic measurement of bedload grain size distribution using self-generated noise," *Hydrol. Earth Syst. Sci.*, vol. 22, no. 1, pp. 767-787, Jan. 2018. Accessed: Sep. 29, 2026. [Online]. Available: https://hess.copernicus.org/articles/22/767/2018/hess-22-767-2018.pdf
52. J. Riedel, S. Sarrantonio, and S. Dorsch, "Geomorphology of coastal Olympic National Park," Nat. Park Service, Fort Collins, CO, USA, Natural Resource Rep. NPS/NCCN/NRR-2021/2260, 2021. Accessed: Sep. 29, 2026. [Online]. Available: https://npshistory.com/publications/olym/nrr-2021-2260.pdf
53. S. C. Fradkin and J. R. Boetsch, "Intertidal monitoring in the North Coast and Cascades Network: sand beach monitoring 2010 annual report," Nat. Park Service, Fort Collins, CO, USA, Natural Resource Tech. Rep. NPS/NCCN/NRTR-2012/592, 2012. Accessed: Sep. 29, 2026. [Online]. Available: https://irma.nps.gov/DataStore/DownloadFile/449854
54. A. S. Farris and K. M. Weber, "Beach foreshore slope for the West Coast of the United States," ver. 1.1, U.S. Geological Survey data release, Sep. 2024. Accessed: Sep. 29, 2026. [Online]. Available: https://www.sciencebase.gov/catalog/item/65a0296bd34e5af967a3841d
55. I. Miller, "Shoreline survey data collected at Rialto and Kalaloch Beaches, Washington State, 2018-2019," PANGAEA, 2019. Accessed: Sep. 29, 2026. [Online]. Available: https://doi.org/10.1594/PANGAEA.902570
56. P. Ruggiero, J. Wood, G. Kaminsky, and H. Baron, "2012-2013 Olympic Peninsula open coast beach data collection, analysis, and archiving," Oregon State Univ. and Washington State Dept. Ecology, Jul. 2013. Accessed: Sep. 29, 2026. [Online]. Available: https://ecology.wa.gov/getattachment/4abb6c89-b344-490c-85e0-5194165997a6/ECY_NearshoreBathymetry_QuinaultQuileute.pdf
57. P. Ruggiero et al., "Beach morphology monitoring in the Columbia River littoral cell: 1997-2005," U.S. Geological Survey, Reston, VA, USA, Data Series 260, 2007. Accessed: Sep. 29, 2026. [Online]. Available: https://pubs.usgs.gov/ds/2007/260/ds260.pdf
58. NOAA Center for Operational Oceanographic Products and Services, "Station 9442396, La Push, Quillayute River, WA: datums and water temperature," NOAA. Accessed: Sep. 29, 2026. [Online]. Available: https://tidesandcurrents.noaa.gov/datums.html?id=9442396
59. NOAA Office of Coast Survey, *United States Coast Pilot 10: Oregon, Washington, Hawaii and Pacific Islands*, 2026 ed., ch. 6. Accessed: Sep. 29, 2026. [Online]. Available: https://nauticalcharts.noaa.gov/publications/coast-pilot/files/cp10/CPB10_WEB.pdf
60. N. Bond, "Early autumn fog in WA," Office of the Washington State Climatologist, Oct. 2, 2013. Accessed: Sep. 29, 2026. [Online]. Available: https://climate.uw.edu/2013/10/02/early-autumn-fog-in-wa/
61. Office of National Marine Sanctuaries, "Olympic Coast National Marine Sanctuary condition report: 2008-2019," NOAA, Silver Spring, MD, USA, 2022. Accessed: Sep. 29, 2026. [Online]. Available: https://sanctuaries.noaa.gov/media/docs/2008-2019-ocnms-condition-report.pdf
62. Washington State Dept. Ecology, "Condition of coastal waters of Washington State, 2000-2003: a statistical summary," Olympia, WA, USA, Pub. 07-03-051, Dec. 2007. Accessed: Sep. 29, 2026. [Online]. Available: https://apps.ecology.wa.gov/publications/documents/0703051.pdf
63. NASA Ocean Biology Processing Group, "MODIS-Aqua monthly diffuse attenuation coefficient at 490 nm, 4 km," dataset erdMH1kd490mday, NOAA CoastWatch West Coast Node. Accessed: Sep. 29, 2026. [Online]. Available: https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdMH1kd490mday.html
64. S. C. Fradkin, W. Baccus, R. Glesne, C. Welch, B. Samora, and R. Lofgren, "Mountain lake study sites in the North Coast and Cascades Network: version 1.1," Nat. Park Service, Fort Collins, CO, USA, Natural Resource Data Series NPS/NCCN/NRDS-2012/364.1, 2012. Accessed: Sep. 29, 2026. [Online]. Available: https://irma.nps.gov/DataStore/DownloadFile/456731
65. S. C. Fradkin et al., "Large lowland lakes monitoring protocol: North Coast and Cascades Network," Nat. Park Service, Apr. 2013. Accessed: Sep. 29, 2026. [Online]. Available: https://irma.nps.gov/DataStore/DownloadFile/467558
66. G. Thomason and M. Dawson, "Final report for Jefferson County lakes monitoring water quality assessment," Jefferson County Public Health, Port Townsend, WA, USA, Feb. 2012. Accessed: Sep. 29, 2026. [Online]. Available: https://www.co.jefferson.wa.us/Archive/ViewFile/Item/755
67. G. C. Bortleson and N. P. Dion, "Preferred and observed conditions for sockeye salmon in Ozette Lake and its tributaries, Clallam County, Washington," U.S. Geological Survey, Tacoma, WA, USA, Water-Resources Investigations 78-64, 1979. Accessed: Sep. 29, 2026. [Online]. Available: https://pubs.usgs.gov/wri/1978/0064/report.pdf
68. Washington State Dept. Ecology, "Water quality assessments of selected lakes within Washington State, 1998," Olympia, WA, USA, Pub. 00-03-039, Dec. 2000. Accessed: Sep. 29, 2026. [Online]. Available: https://apps.ecology.wa.gov/publications/documents/0003039.pdf
69. Minnesota Dept. Natural Resources, "Where aquatic plants grow." Accessed: Sep. 29, 2026. [Online]. Available: https://www.dnr.state.mn.us/shorelandmgmt/apg/wheregrow.html
70. Texas A&M AgriLife Extension, "Filamentous algae," AquaPlant. Accessed: Sep. 29, 2026. [Online]. Available: https://aquaplant.tamu.edu/plant-identification/alphabetical-index/filamentous-algae/
71. Maine Dept. Environmental Protection, "Lakes: why does the water look like that?" Accessed: Sep. 29, 2026. [Online]. Available: https://www.maine.gov/dep/water/lakes/surface.html
72. Washington State Dept. Health, "Blue-green algae." Accessed: Sep. 29, 2026. [Online]. Available: https://doh.wa.gov/community-and-environment/contaminants/blue-green-algae
73. Missouri Dept. Conservation, "Filamentous green algae," field guide. Accessed: Sep. 29, 2026. [Online]. Available: https://mdc.mo.gov/discover-nature/field-guide/filamentous-green-algae
74. F. van Breugel, J. Riffell, A. Fairhall, and M. H. Dickinson, "Mosquitoes use vision to associate odor plumes with thermal targets," *Curr. Biol.*, vol. 25, no. 16, pp. 2123-2129, Aug. 2015. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC4546539/
75. S. Butail, N. C. Manoukis, M. Diallo, J. M. C. Ribeiro, and D. A. Paley, "The dance of male Anopheles gambiae in wild mating swarms," *J. Med. Entomol.*, vol. 50, no. 3, pp. 552-559, 2013. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC4780853/
76. N. C. Manoukis et al., "Structure and dynamics of male swarms of Anopheles gambiae," *J. Med. Entomol.*, vol. 46, no. 2, pp. 227-235, 2009. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC2680012/
77. A. Attanasi et al., "Collective behaviour without collective order in wild swarms of midges," *PLoS Comput. Biol.*, vol. 10, no. 7, Art. no. e1003697, Jul. 2014. Accessed: Sep. 29, 2026. [Online]. Available: https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1003697
78. J. G. Puckett, D. H. Kelley, and N. T. Ouellette, "Searching for effective forces in laboratory insect swarms," *Sci. Rep.*, vol. 4, Art. no. 4766, Apr. 2014. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC3996478/
79. P. Pellitteri, "Deer flies and horse flies," Univ. Wisconsin-Madison Extension, rev. Apr. 27, 2004. Accessed: Sep. 29, 2026. [Online]. Available: https://hort.extension.wisc.edu/articles/deer-flies-and-horse-flies/
80. L. Vebrová, A. van Nieuwenhuijzen, V. Kolář, and D. S. Boukal, "Seasonality and weather conditions jointly drive flight activity patterns of aquatic and terrestrial chironomids," *BMC Ecol.*, vol. 18, Art. no. 19, Jun. 2018. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC6006739/
81. J. Snyder, "Mosquitoes," *PNW Pest Press*, no. 12, Pacific Northwest School IPM Consortium, Spring 2014. Accessed: Sep. 29, 2026. [Online]. Available: https://wpcdn.web.wsu.edu/wp-puyallup/uploads/sites/415/2014/12/PNW_PPMosquito_Spring2014.pdf
82. T. Nakata, P. Simões, S. M. Walker, I. J. Russell, and R. J. Bomphrey, "Auditory sensory range of male mosquitoes for detection of female flight sound," *J. Roy. Soc. Interface*, vol. 19, no. 193, Art. no. 20220285, Aug. 2022. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC9399701/
83. Wikipedia contributors, "Chironomus annularius," Wikipedia. Accessed: Sep. 29, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Chironomus_annularius
84. L. Feugère, G. Gibson, N. C. Manoukis, and O. Roux, "Mosquito sound communication: are male swarms loud enough to attract females?" *J. Roy. Soc. Interface*, vol. 18, no. 177, Art. no. 20210121, Apr. 2021. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC8086941/
85. D. V. Nelson, H. Klinck, A. Carbaugh-Rutland, C. L. Mathis, A. T. Morzillo, and T. S. Garcia, "Calling at the highway: the spatiotemporal constraint of road noise on Pacific chorus frog communication," *Ecol. Evol.*, vol. 7, no. 1, pp. 429-440, Jan. 2017. Accessed: Sep. 29, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC5216672/
86. J. Tessendorf, "Simulating ocean water," SIGGRAPH course notes, 2004. Accessed: Sep. 29, 2026. [Online]. Available: https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf
87. T. Tcheblokov, "Ocean simulation and rendering in War Thunder," presented at China Game Developers Conf., Shanghai, China, 2015. Accessed: Sep. 29, 2026. [Online]. Available: https://developer.download.nvidia.com/assets/gameworks/downloads/regular/events/cgdc15/CGDC2015_ocean_simulation_en.pdf
88. Unity Technologies, "High Definition Render Pipeline: water system source," Graphics, GitHub repository, master. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/Unity-Technologies/Graphics/tree/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Water
89. H. Bowles and T. Read-Cutting, "Multi-resolution water rendering in Crest," presented at SIGGRAPH Advances in Real-Time Rendering in Games, Los Angeles, CA, USA, Jul. 2019. Accessed: Sep. 29, 2026. [Online]. Available: https://advances.realtimerendering.com/s2019/CrestSIGGRAPH2019-Final-for_web.pptx
90. B. Grujic and C. Cutocheras, "Water rendering in Far Cry 5," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2018. Accessed: Sep. 29, 2026. [Online]. Available: https://media.gdcvault.com/gdc2018/presentations/Grujic_Branislav_WaterRenderingFarCry5.pdf
91. Wave Harmonic, "GerstnerShared.hlsl," crest, GitHub repository, master. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/wave-harmonic/crest/blob/master/crest/Assets/Crest/Crest/Shaders/OceanInputs/GerstnerShared.hlsl
92. Epic Games, "Water body actors in Unreal Engine," Unreal Engine 5 documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/water-body-actors-in-unreal-engine
93. Wave Harmonic, "Shallows and shorelines," Crest Ocean System documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://crest.readthedocs.io/en/latest/user/shallows-and-shorelines.html
94. Unity Technologies, "Deform a water surface," High Definition Render Pipeline 17.0 manual. Accessed: Sep. 29, 2026. [Online]. Available: https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/water-deform-a-water-surface.html
95. Wave Harmonic, "Shallow water simulation," Crest 5 documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://docs.crest.waveharmonic.com/Components/Inputs/ShallowWaterSimulation.html
96. Z. Mao and K. Wu, "Open-world water rendering and real-time simulation," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2023. Accessed: Sep. 29, 2026. [Online]. Available: https://media.gdcvault.com/gdc2023/Slides/Open-World+Water+Rendering+and+Real-Time+Simulation_Mao_Zhenyu%26Wu_Kui.pdf
97. H. Malan, "Rendering water in Horizon Forbidden West," presented at SIGGRAPH Advances in Real-Time Rendering in Games, Vancouver, BC, Canada, Aug. 2022. Accessed: Sep. 29, 2026. [Online]. Available: https://advances.realtimerendering.com/s2022/SIGGRAPH2022-Advances-Water-Malan.pptx
98. Unity Technologies, "High Definition Render Pipeline: water samples, rolling wave," Graphics, GitHub repository, master. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/Unity-Technologies/Graphics/tree/master/Packages/com.unity.render-pipelines.high-definition/Samples~/WaterSamples
99. Imaginary Blend, "Fluid Flux documentation," Jan. 10, 2025. Accessed: Sep. 29, 2026. [Online]. Available: https://imaginaryblend.com/2025/01/10/fluid-flux-documentation/
100. J. Linneman, A. Battaglia, and W. Judd, "The making of Senua's Saga: Hellblade 2, the Ninja Theory interview," Eurogamer, Aug. 8, 2024. Accessed: Sep. 29, 2026. [Online]. Available: https://www.eurogamer.net/digitalfoundry-2024-the-big-senuas-saga-hellblade-2-tech-interview
101. K. Kirkpatrick, "Making waves for Skull and Bones: advancements in water tech," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2023. Accessed: Sep. 29, 2026. [Online]. Available: https://www.gdcvault.com/play/1029230
102. A. de Tocqueville, "The new Water System in Unity 2022 LTS and 2023.1," Unity Blog, Jun. 28, 2023. Accessed: Sep. 29, 2026. [Online]. Available: https://unity.com/blog/engine-platform/new-hdrp-water-system-in-2022-lts-and-2023-1
103. SideFX, "Guerrilla Games: Killzone 3," customer story, Apr. 27, 2011. Accessed: Sep. 29, 2026. [Online]. Available: https://www.sidefx.com/community/guerrilla-games-killzone-3/
104. N. Thürey, M. Müller-Fischer, S. Schirm, and M. Gross, "Real-time breaking waves for shallow water simulations," in *Proc. Pacific Graphics*, Maui, HI, USA, Oct. 2007, pp. 39-46. Accessed: Sep. 29, 2026. [Online]. Available: https://graphics.ethz.ch/Downloads/Publications/Papers/2007/Thue07b/Thue07b.pdf
105. Wave Harmonic, "UpdateFoam.compute," crest, GitHub repository, master. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/wave-harmonic/crest/blob/master/crest/Assets/Crest/Crest/Shaders/Resources/UpdateFoam.compute
106. J. Dupuy and E. Bruneton, "Real-time animation and rendering of ocean whitecaps," in *SIGGRAPH Asia Tech. Briefs*, Singapore, Nov. 2012. Accessed: Sep. 29, 2026. [Online]. Available: https://web.archive.org/web/20240415195251/https://inria.hal.science/hal-00967078/document
107. H. Bowles, D. Zimmermann, C. Noris, and B. Wang, "Crest: novel ocean rendering techniques in an open source framework," presented at SIGGRAPH Advances in Real-Time Rendering in Games, Los Angeles, CA, USA, Aug. 2017. Accessed: Sep. 29, 2026. [Online]. Available: https://advances.realtimerendering.com/s2017/Ocean_SIGGRAPH17_Final.pptx
108. N. Ang, A. Catling, F. C. Ciardi, and V. Kozin, "The technical art of Sea of Thieves," in *ACM SIGGRAPH Talks*, Vancouver, BC, Canada, Aug. 2018. Accessed: Sep. 29, 2026. [Online]. Available: https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf
109. Epic Games, "Single layer water shading model in Unreal Engine," Unreal Engine 5 documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/single-layer-water-shading-model-in-unreal-engine
110. M. Olano and D. Baker, "LEAN mapping," in *Proc. ACM SIGGRAPH Symp. Interactive 3D Graph. Games*, Washington, DC, USA, 2010. Accessed: Sep. 29, 2026. [Online]. Available: https://www.csee.umbc.edu/~olano/papers/lean/lean.pdf
111. E. Bruneton, F. Neyret, and N. Holzschuch, "Real-time realistic ocean lighting using seamless transitions from geometry to BRDF," *Comput. Graph. Forum*, vol. 29, no. 2, pp. 487-496, May 2010. Accessed: Sep. 29, 2026. [Online]. Available: https://web.archive.org/web/20240417164935/https://inria.hal.science/inria-00443630/document
112. Epic Games, "Planar reflections in Unreal Engine," Unreal Engine 5 documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/planar-reflections-in-unreal-engine
113. A. Cichocki, "Optimized pixel-projected reflections for planar reflectors," presented at SIGGRAPH Advances in Real-Time Rendering in Games, Los Angeles, CA, USA, Aug. 2017. Accessed: Sep. 29, 2026. [Online]. Available: https://advances.realtimerendering.com/s2017/PixelProjectedReflectionsAC_v_1.92_withNotes.pdf
114. R. Génin, "Screen space planar reflections in Ghost Recon Wildlands," Aug. 8, 2017. Accessed: Sep. 29, 2026. [Online]. Available: https://remi-genin.github.io/posts/screen-space-planar-reflections-in-ghost-recon-wildlands/
115. S. McAuley, "The challenges of rendering an open world in Far Cry 5," presented at SIGGRAPH Advances in Real-Time Rendering in Games, Vancouver, BC, Canada, Aug. 2018. Accessed: Sep. 29, 2026. [Online]. Available: https://advances.realtimerendering.com/s2018/The%20Challenges%20of%20Rendering%20an%20Open%20World%20in%20Far%20Cry%205%20(With%20Notes).pdf
116. Q. Kuenlin, "Raytracing in Snowdrop: an optimized raytracing pipeline for consoles," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2024. Accessed: Sep. 29, 2026. [Online]. Available: https://media.gdcvault.com/gdc2024/Slides/GDC+slide+presentations/Kuenlib_Quentin_Raytracing_In_Snowdrop.pdf
117. Crytek, "Water volume," CRYENGINE V manual. Accessed: Sep. 29, 2026. [Online]. Available: https://www.cryengine.com/docs/static/engines/cryengine-5/categories/23756816/pages/36869912
118. W. Ikeda, "Creative and experimental VFX in The Last of Us Part II," presented at Game Developers Conf., Jul. 2021. Accessed: Sep. 29, 2026. [Online]. Available: https://media.gdcvault.com/GDC+2021/GDC21_Creative+and+Experimental+VFX+in+The+Last+of+Us+Part+II.pdf
119. Crytek, "WaterVolume shader," CRYENGINE V manual. Accessed: Sep. 29, 2026. [Online]. Available: https://www.cryengine.com/docs/static/engines/cryengine-5/categories/23756816/pages/29449415
120. M. Vainio, "How stunning visual effects bring Ghost of Tsushima to life," PlayStation Blog, Jan. 12, 2021. Accessed: Sep. 29, 2026. [Online]. Available: https://blog.playstation.com/2021/01/12/how-stunning-visual-effects-bring-ghost-of-tsushima-to-life/
121. Firelight Technologies, "Instrument reference: scatterer instrument," FMOD Studio 2.03 user manual. Accessed: Sep. 29, 2026. [Online]. Available: https://d1s9dnlmdewoh1.cloudfront.net/2.03/studio/instrument-reference.html
122. P. Adenot, "Web Audio API performance and debugging notes." Accessed: Sep. 29, 2026. [Online]. Available: https://padenot.github.io/web-audio-perf/
123. Chromium Authors, "hrtf_panner.cc," Chromium, GitHub repository, main. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/audio/hrtf_panner.cc
124. MDN contributors, "OscillatorNode: frequency property," MDN Web Docs, Mozilla. Accessed: Sep. 29, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode/frequency
125. W3C GPU for the Web Working Group, "WebGPU," specification source, GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/gpuweb/gpuweb/blob/main/spec/index.bs
126. B. Houston, "EXT_color_buffer_float," Web3D Survey, WebGL2 extensions. Accessed: Sep. 29, 2026. [Online]. Available: https://web3dsurvey.com/webgl2/extensions/EXT_color_buffer_float
127. B. Houston, "OES_texture_float_linear," Web3D Survey, WebGL2 extensions. Accessed: Sep. 29, 2026. [Online]. Available: https://web3dsurvey.com/webgl2/extensions/OES_texture_float_linear
128. E. Popov, "OceanDemo," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/Popov72/OceanDemo
129. three.js Authors, "Water.js," three.js, GitHub repository, dev. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water.js
130. PlayCanvas, "water.mjs," PlayCanvas engine, GitHub repository, main. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/playcanvas/engine/blob/main/scripts/esm/water.mjs
131. E. Lengyel, "Oblique view frustum depth projection and clipping," *J. Game Develop.*, vol. 1, no. 2, pp. 5-16, Mar. 2005. Accessed: Sep. 29, 2026. [Online]. Available: https://terathon.com/lengyel/Lengyel-Oblique.pdf
132. Babylon.js Authors, "Material plugins," Babylon.js Documentation, GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/using/materialPlugins.md
133. B. Paleologue, "Ocean simulation with FFT and WebGPU," Mar. 20, 2024. Accessed: Sep. 29, 2026. [Online]. Available: https://barthpaleologue.github.io/Blog/posts/ocean-simulation-webgpu/
134. owenyuwono, "poseidon," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/owenyuwono/poseidon
135. squall01337, "abyssal-ocean," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/squall01337/abyssal-ocean
136. reed-soul, "SeedOcean," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/reed-soul/SeedOcean
137. booherbg, "clean-room-fft-ocean: performance notes," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/booherbg/clean-room-fft-ocean/blob/HEAD/docs/perf.md
138. siliconjungle, "inkwell-webgpu-water," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/siliconjungle/inkwell-webgpu-water
139. SamG-Coder, "coastal-simulation-cuda-webshader," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/SamG-Coder/coastal-simulation-cuda-webshader
140. R. Ryan, "Ocean rendering, part 2: profiling and optimization," Mar. 22, 2026. Accessed: Sep. 29, 2026. [Online]. Available: https://rtryan98.github.io/2026/03/22/ocean-rendering-part-2.html
141. ColinLeung-NiloCat, "UnityURP-MobileScreenSpacePlanarReflection," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/ColinLeung-NiloCat/UnityURP-MobileScreenSpacePlanarReflection
142. matsuoka-601, "WebGPU-Ocean," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/matsuoka-601/WebGPU-Ocean
143. Dawn Authors, "Constants.h," Dawn, GitHub repository, main. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/google/dawn/blob/main/src/dawn/common/Constants.h
144. U.S. National Park Service, "Sound gallery," Natural Sounds. Accessed: Sep. 29, 2026. [Online]. Available: https://www.nps.gov/subjects/sound/gallery.htm
145. bruno.auzet, "real mosquito," Freesound, Creative Commons 0. Accessed: Sep. 29, 2026. [Online]. Available: https://freesound.org/people/bruno.auzet/sounds/742549/
146. onionaire, "frog clip 1 - 04.02.24," Freesound, Creative Commons 0. Accessed: Sep. 29, 2026. [Online]. Available: https://freesound.org/people/onionaire/sounds/852296/

