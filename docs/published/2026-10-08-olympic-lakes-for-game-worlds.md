---
description: How the lakes of Washington's Olympic Peninsula formed, their measured shapes and perched cirque basins, and numeric rules for generating them in a game world.
published: 2026-10-08
---
# Olympic Peninsula lakes for game worlds

**Question:** a game set on Washington's Olympic Peninsula needs lakes, and the usual first
pass is a circle with a clean, even edge. It does not read as a mountain lake. How did the
real lakes form, what shapes do they have, why do some look like a raised rim holding water,
and what numbers can a lake generator aim for?

**Short answer:** the Olympics are not volcanic, so no lake is a crater. Ice, landslides and
rivers made them, in two populations with a near-empty band between: valley-floor and
lowland lakes below about 500 m, and cirque and bench tarns above about 900 m. The high
lakes are small, none over 17 ha, and every natural lake over 25 ha lies below about 220 m.

The typical lake is a cirque tarn shaped like a rounded oval, egg or teardrop: about 1.5
times as long as wide, with a shoreline development index of 1.2 to 1.3. Only one high lake
in four is rounder than 1.3 to 1. Lowland lakes run 2 to 3 to 1, with arms and bays. Nearly
every lake above 900 m is perched on a step: the ground rises about 125 m within 200 m
behind it and falls 40 to 50 m below the water within 200 m past its outlet. That step, not
a crater, is what reads as a rim holding water.

Most of these figures were measured for this page from 936 OpenStreetMap lake polygons and
SRTM elevations. Section 7 turns them into twelve rules for a generator.

## 1. The evidence

The main published source is Water-Supply Bulletin 43, volume 1, a 1976 USGS and
Washington Department of Ecology survey by Bortleson, Dion, McConnell and Nelson [1]. For
each lake it sampled it gives measured shoreline development, depth and bottom slope, with
aerial photographs and bathymetric maps.

The new measurement covers all 1,317 OpenStreetMap water polygons over 500 m² between 47.30
and 48.20° N and 124.75 and 122.95° W [2], 936 of them natural lakes and ponds of at
least 0.1 ha. Each was measured for area, perimeter, length, width, shoreline development,
convexity and the Fourier spectrum of its outline, and its surface and surroundings were
sampled from SRTM 30 m elevations [3]. The prose calls these figures measured; the
tables mark them †. [Section 8](#method-and-caveats) gives the method and its limits.

## 2. How the Olympics got their lakes

The range is uplifted sea-floor basalt and sedimentary rock, scraped off the Juan de Fuca
plate and folded up against North America [4]. Two ice systems shaped its lakes. The
Cordilleran ice sheet's Juan de Fuca lobe flowed west along the Strait and the range's
north edge roughly 16,900 to 14,000 years ago, scouring the low valleys and leaving drift,
moraines and drumlinoid ridges on the northern lowlands [4], [5], [6]. Alpine
glaciers flowed from high cirques down the valleys, advancing 25 to 40 miles down the Hoh,
Queets and Quinault [5].

| Type | In the Olympics | Examples | Elevation |
|---|---|---|---|
| **Cirque tarn**: a rock basin in a glacier-cut bowl, held by a rock lip, a moraine or both | **By far the commonest.** The park holds over 800 lakes, ponds and tarns; nearly all its mountain lakes lie in cirques, and lowland lakes are rare. 117 surveyed mountain lakes run 774 to 1,791 m and 0.1 to 17.1 ha, mean 2.55 ha [7] | Lake Angeles, in a deep cirque with cliffs on three sides [8]; Hoh Lake; Lake Constance; Royal Lake; PJ Lake [9]; Heart Lake; Lake of the Angels; Ferry Glacier Lake | 900 to 2,000 m |
| **Basin groups and paternoster chains**: tarns on the steps of one glaciated basin, joined by one stream [10] | Yes | Seven Lakes Basin (Sol Duc, Long, Lunch, Morgenroth, No Name, Clear, Round, No. 8), the park's largest concentration of glacial lakes [11]; Grand Valley, where Grand (1,442 m), Moose (1,539 m) and Gladys (1,641 m) lakes step up the valley † | 1,100 to 1,700 m |
| **Bench (perched) lake** on a glacial shelf high on a valley wall | Yes; a cirque-floor or shelf lake whose outlet drops steeply to the main valley | Hoh Lake (ground past the outlet falls about 200 m within 500 m), Sol Duc Lake, Lake Constance (about 240 m within about 600 m) † | 1,000 to 1,600 m |
| **Trough, ice-sheet scoured** | North and west lowlands | Lake Crescent, in a valley "plowed and scraped" by the ice [5]; Ozette Lake, carved to about 100 m deep at the lobe's south edge [12] | 10 to 180 m |
| **Trough, moraine-dammed** | Mouths of the big south and west valleys | Lake Quinault, behind a terminal moraine [5]; Lake Cushman before its dam [13] | 50 to 250 m |
| **Landslide-dammed** | Several, and large | Crescent and Sutherland, split by a slide about 8,000 years ago [14], [1]; Lena Lake, dammed by a rockslide about 1,300 years ago, its creek leaving underground [15]; inside Crescent, the Sledgehammer Point slide, about 7.2 million m³, from Mount Storm King around 1100 BCE [16] | 150 to 600 m |
| **Kettle** | Outside the park, on the drift lowlands (Port Angeles to Sequim, the Ozette plain, the Puget lowland edge), whose hollows are ice-cut troughs or kettles left by stagnant ice [1]; kettles are usually round, under 2 km across and 10 m deep [17] | Probably small round lakes such as Beaver Lake (Clallam): 18 ha, SDI 1.2, 11 m deep | Below 300 m |
| **Floodplain pond**: oxbow, side channel, wall-base channel, beaver pond | Floors of the Hoh, Queets, Quinault, Bogachiel and Elwha. The Hoh is a U-shaped trough over 1 km wide [18]; its Allen's Marsh is a 14-acre wetland with beaver dams and deep pools [19] | Mostly unnamed | 50 to 300 m |
| **Reservoir** | Yes | Cushman (a natural lake enlarged), Wynoochee, and the former Mills and Aldwell on the Elwha, dams since removed | n/a |
| **Crater lake** | **No**: no volcanoes | None | None |

### Where the lakes are by elevation

Measured natural lakes, reservoirs excluded:

| Band | Lakes ≥ 0.1 ha | Of which ≥ 1 ha | Typical type |
|---|---|---|---|
| 0 to 150 m | 370 | 76 | Ice-scoured and kettle lakes, floodplain ponds; many small ponds near towns are artificial |
| 150 to 500 m | 165 | 42 | Lowland lakes, landslide lakes (Crescent, Sutherland, Lena), valley-floor ponds |
| **500 to 900 m** | **19** | **9** | **Almost none: the steep forested valley walls** |
| 900 to 1,200 m | 101 | 29 | The lowest cirques and benches |
| 1,200 to 1,500 m | 139 | 42 | Cirque tarns and basins |
| 1,500 to 2,000 m | 120 | 27 | The highest tarns, many by current or former glaciers |

Of the 360 lakes above 900 m, only 98 exceed 1 ha, 22 exceed 5 ha and 5 exceed 10 ha.

## 3. Plan-view shapes

### The typical outline

A tarn's measured medians are a length to width ratio (Feret) of about 1.5 to 1.6, a
shoreline development index (SDI) of 1.2 to 1.3 and a convexity (area over convex-hull area)
of about 0.92. The outline usually has one broad bulge or lobe and one flatter or slightly
indented side. Only about one high lake in four is below 1.3 to 1, and two thirds of high
lakes over 1 ha are not even star-shaped from their centroid: a bend or lobe hides part of
the shore from the middle. Lake Angeles is teardrop-shaped [8]; Heart Lake is named
for its shape [11]; Moose and Royal lakes are long and narrow, about 2.5 to 1; Gladys
Lake is a lobed blob, SDI 2.2 and convexity 0.60.

Lowland and valley lakes are a different family: about 2 to 3 to 1, SDI 1.5 to 2.6, with
arms and bays that follow their trough.

### By formation type

Cirques are about as wide as long. Medians over 1,593 cirques: width over length 1.05,
length 625 m, width 656 m, height range 310 m, wall height 210 m, maximum (headwall)
gradient 57°, plan closure 128° [20]. A tarn fills only the floor, so a tarn of 1 to
10 ha is 100 to 400 m across. Its long axis has no preferred direction: of 108 measured high
lakes at least 1.4 to 1, a third each run along, diagonal to and across the fall line.

| Type | Axis | Lobes, bays, points | L:W | Inlet and outlet | Shoreline |
|---|---|---|---|---|---|
| **Cirque tarn** | Any | 0 to 2 broad lobes; points where talus fans and moraine ridges reach the water | 1.2 to 2.0, median 1.5 | Inlet on the headwall side, often only snowmelt and talus seepage (Blue Lake and Twin Lakes: intermittent [1]). One outlet notch in the lip, facing N to E for 66 % of 141 measured lakes above 1,000 m | SDI 1.1 to 1.2 on bathymetric maps (Blue 1.2, Twin lower and upper 1.1); rough at the metre scale |
| **Paternoster chain** | Chain runs down the valley | Lakes split by rock steps or recessional moraines | 1.3 to 2.5 | Each outlet feeds the next lake [10] | As tarns |
| **Ice-scoured trough** | Along the ice flow: Crescent E to W, Ozette N to S | Crescent a bent ribbon (convexity 0.49) with delta points such as Barnes Point; Ozette irregular, with long arms and three islands | 2 to 2.6 (Feret); length over mean width 4 to 8 | Side-valley inlets along the long shores (Crescent: Barnes, Smith, Aurora creeks); outlet at one end (Lyre River at Crescent's NE, Ozette River at the north) | SDI 2.4 to 2.6 (Ozette 2.6 [1]) |
| **Moraine-dammed trough** (Quinault, Cushman before its dam, Tomyhoi in the North Cascades) | Along the valley | Few lobes; blunt rounded moraine end; delta at the inlet end | Quinault about 1.5; narrow alpine troughs 4 to 6 (Tomyhoi about 6) | Delta inlet up-valley; outlet through the moraine | SDI 1.5 (Quinault †), Tomyhoi 1.7 [1] |
| **Landslide-dammed** | Along the valley; slide end blunt, lumpy, convex into the lake | Sutherland: a broad western basin and narrow eastern arm joined by a waist (1971 aerial [1]) | 1.5 to 2.7 | Inlet up-valley; outlet over or through the slide (Lena's leaves underground) | SDI 1.4 to 1.8 (Sutherland 1.8) |
| **Kettle** | None or weak | Round; merged pits make lobed composites | 1.0 to 1.5 | Often groundwater-fed with no surface inlet (Wentworth Lake: none visible) | SDI 1.0 to 1.3 |
| **Oxbow, floodplain pond** | Curved, along the old channel | Crescent, meander loop or string of beads | 3 to 10 and more | Usually none, or wall-base seepage | Highest SDI of natural lakes [21] |
| **Beaver pond** | Fills the floor behind a straight or curved dam | Fingers up every side channel; dendritic | 1.5 to 4 | Stream at the head; outlet over the dam | High; drowned trees standing in it |

### Named lakes

Length is the longest straight line across the polygon (Feret); mean width is area over
length. † marks a measured area or SDI from the polygon, or an SRTM elevation at the shore;
SDIs in bold are the 1976 survey's.

| Lake | Type | Elev. m (ft) | Area ha (ac) | Length km | Mean width km | L:W | SDI | Max depth m (ft) | Sources |
|---|---|---|---|---|---|---|---|---|---|
| Lake Crescent | Ice-scoured trough, landslide-dammed | 177 (580) | 2,075 (5,127) | 13.0 † | 1.57 | 2.6 | 2.35 † | 182 to 190 (596 to 624); mean 91 | [14] |
| Ozette Lake | Ice-scoured trough | 9 (29) | 2,954 (7,300) [1]; 3,151 (7,787) [22] | 13.3 | 2.3 (max 4.8) | 2.0 | **2.6**; 2.65 with islands † | 98 (320) [1]; 101 (331) [22] | [1], [22] |
| Lake Quinault | Moraine-dammed trough | 58 (190) | 1,509 (3,729) | 6.1 to 6.4 | 2.3 | 1.5 | 1.50 † | 73 (240); mean 41 (133) | [23], [5] |
| Lake Sutherland | Landslide-dammed trough | 160 (525) | 150 (370) | 2.85 | 0.51 | 2.7 | **1.8** | 26 (86); mean 17 | [1] |
| Lake Pleasant | Lowland, drift | 98 (320) | 202 (500) | 3.2 | 0.62 | 2.9 | **1.6** | 15 (50) | [1] |
| Dickey Lake | Lowland, drift | 59 (193) | 202 (500) | 3.0 | 0.70 | 2.3 | **1.6** | 14 (45) | [1] |
| Beaver Lake (Clallam) | Lowland, marsh-fed | 168 (550) | 18 (44) | 0.59 | 0.24 | 1.7 | **1.2** | 11 (35) | [1] |
| Lena Lake | Rockslide-dammed | 556 † | 22 † | 0.83 | 0.27 | 1.5 | 1.39 † | n/a | [15] |
| Lake Angeles | Cirque tarn, island | about 1,290 to 1,300 (4,200 to 4,250) | 8.1 (20); 9.6 † | 0.56 | 0.17 | 2.2 | 1.25; 1.43 with island † | n/a | [8] |
| Sol Duc Lake | Cirque basin | 1,156 † | 11.6 † | 0.50 | 0.23 | 1.4 | 1.21 † | n/a | [11] |
| Hoh Lake | Perched tarn | 1,377 (4,500) | 5.7 † | 0.37 | 0.16 | 1.5 | 1.19 † | n/a | [24] |
| Lunch Lake | Cirque basin | 1,370 † | 5.3 † | 0.36 | 0.15 | 1.5 | 1.35 † | n/a | Measured |
| Long Lake | Cirque basin | 1,192 † | 5.9 † | 0.47 | 0.13 | 2.5 | 1.28 † | n/a | Measured |
| Lake Constance | Perched tarn | 1,423 (4,669) | 4.3 (10.6) | 0.31 | 0.14 | 1.2 | 1.37 † | n/a | [25] |
| Grand Lake | Basin lake | 1,442 † | 5.6 † | 0.39 | 0.15 | 1.3 | 1.47 † | n/a | Measured |
| Moose Lake | Basin lake | 1,539 † | 3.5 † | 0.42 | 0.08 | 2.5 | 1.58 † | n/a | Measured |
| Gladys Lake | Basin lake | 1,641 † | 1.0 † | 0.18 | 0.05 | 1.3 | 2.18 † | n/a | Measured |
| Royal Lake | Cirque basin | 1,560 (OpenStreetMap tag) | 1.0 † | 0.21 | 0.05 | 2.4 | 1.55 † | n/a | Measured |
| Heart Lake (Sol Duc) | Small tarn | 1,458 † | 0.5 † | 0.11 | 0.05 | 1.3 | 1.22 † | n/a | [11] |
| PJ Lake | Subalpine tarn | about 1,300 (about 4,270: trailhead 5,020 ft less a 750 ft descent) | Not mapped by name | | | | | n/a | [9] |

Lake Crescent's published 12 miles [14] is about 50 % longer than its straight-line
length.

### Alpine analogues with measured depths

No published depth was found for an Olympic high lake. The only measured high-lake depths found are
North Cascades lakes in the same bulletin [1]:

| Lake | Type | Elev. m (ft) | Area ha (ac) | SDI | Max depth m (ft) | Mean over max depth | Zr |
|---|---|---|---|---|---|---|---|
| Blue Lake (Whatcom) | Cirque tarn | 1,204 (3,950) | 4.5 (11) | 1.2 | 23 (77) | 0.53 | **9.7 %** |
| Twin Lakes, lower | Cirque tarn | 1,570 (5,150) | 8.1 (20) | 1.1 | 29 (96) | 0.43 | **9.1 %** |
| Twin Lakes, upper | Cirque tarn | 1,577 (5,175) | 6.9 (17) | 1.1 | 28 (91) | 0.48 | **9.3 %** |
| Tomyhoi Lake | Delta-filled alpine trough | 1,134 (3,720) | 30 (75) | 1.7 | 12.5 (41) | 0.41 | 2.0 % |

Zr, the bottom slope, is maximum depth as a percentage of mean diameter, Zm·50√π/√A (pages
193 and 234 to 239). The bulletin's Olympic lowland lakes have a Zr of 0.86 to 2.4 %, so
cirque tarns are about 4 to 10 times deeper for their size. Lake Crescent works out at about
3.7 % and Quinault about 1.7 %.

## 4. Why some lakes look like a rim holding water

These are the landforms that read as a lake on a mound.

**a. A cirque tarn behind a rock lip or moraine.** A cirque has cliffs on three sides and a
fourth side of till forming the lip or sill; erosion deepens the basin, and a moraine may dam
a tarn below it [26]:

```
headwall (cliff, 45-65°)            open side
  \                                  ____ lip / moraine crest (a few m to ~20 m above water)
   \  talus apron                   /    \
    \______  ~~~~~~ water ~~~~~~~ /       \  steep drop to the valley
           \_____ deep basin ____/          \   (100-200 m within 500 m)
           (deepest point toward the headwall / centre)
```

**b. A perched (bench) lake.** A cirque floor or shelf hangs above a main valley that the
trunk glacier cut deeper; the ground falls away past the outlet. At Hoh Lake, Sol Duc Lake
and Lake Constance it falls 150 to 250 m within about half a kilometre of the shore.

**c. A kettle in hummocky moraine**, a round pond among mounds of till [17], rimmed
by only metres, and only on the drift lowlands.

**d. Moraine- and landslide-dammed valley lakes.** Quinault (moraine) and Crescent,
Sutherland and Lena (landslides) have a raised dam at one end only; the rest is valley wall.

**e. True crater lakes**, like Oregon's Crater Lake or Mount St Helens' crater, are
volcanic and absent here.

### Measured cross-sections

For each lake of at least 0.5 ha, SRTM elevations were sampled on 16 bearings at 50, 200 and
500 m beyond the radius of a circle of equal area. Rise is ground minus lake surface:

| Band | n | High side at +200 m: median (IQR) | High side at +500 m | Low side at +200 m | Low side at +500 m | Ground > 20 m below the lake within 500 m (perched) | > 50 m below |
|---|---|---|---|---|---|---|---|
| < 500 m | 23 | +34 m (28 to 84) | +113 m | −3 m | −9 m | 39 % | 13 % |
| 500 to 900 m | 10 | +135 m | +317 m | −2 m | −32 m | 60 % | 50 % |
| 900 to 1,200 m | 38 | +131 m (94 to 154) | +227 m | −39 m | −138 m | **97 %** | 95 % |
| 1,200 to 1,500 m | 67 | +124 m (98 to 144) | +215 m | −49 m | −153 m | **96 %** | 91 % |
| 1,500 to 2,000 m | 50 | +126 m (101 to 145) | +233 m | −51 m | −168 m | **100 %** | 98 % |

- **Nearly every lake above 900 m is perched.** Behind it the ground rises about 125 m within
  200 m and 220 m within 500 m, a headwall averaging roughly 30° and steeper near the top. In
  front it drops 40 to 50 m below the water within 200 m and 140 to 170 m within 500 m.
- The lake sits on a step about half-way up a slope, nearer its base. Walls stand on about
  two thirds of the sides: at +200 m the median share of bearings more than 10 m above the
  lake is 0.69. The high side and the drop are typically 112 to 135° apart.
- Lowland lakes are the opposite: low banks (+30 m at 200 m) and no drop past the outlet.
- **The open side faces N, NE or E for 66 %** of 141 lakes above 1,000 m (N 28, NE 38, E 27,
  SE 10, S 12, SW 4, W 8, NW 14), matching the cirques' aspect: the Cameron Glaciers lie in
  four north to northeast-facing cirques [27].

### Where the deep water is

From the bulletin's bathymetric maps [1]:

- **Twin Lakes, lower** (cirque): one bowl, deepest (over 90 ft) about 40 % of the way
  across, offset toward the steep side, where contours are packed. A shelf under 20 ft
  covers about a third of the lake on the gentle outlet and meadow side.
- **Twin Lakes, upper** (cirque): one oval bowl, deepest (over 90 ft) slightly toward the
  far wall, steep all round.
- **Tomyhoi** (trough): two sub-basins, 40 and 35 ft, at the down-valley end, shoaling
  toward the inlet, where a braided delta fills the last quarter or so with water under
  10 ft.
- **Lake Crescent**: much of the shore drops off steeply, often as a sheer underwater cliff
  [14].

## 5. What makes a shoreline irregular

From the bulletin's 1971 to 1974 aerial photographs and remarks [1]:

| Scale along the shore | Feature | Evidence |
|---|---|---|
| **Whole lake** (k = 2 to 3) | Elongation, bends and arms following the valley or cirque | Crescent's curve, Ozette's arms, Sutherland's waist |
| **0.3 to 1 km on big lakes; 20 to 40 % of the length on tarns** | **Inlet deltas and fans** building points or filling the inlet end, largest where creeks are steep and carry gravel | Barnes Point is a 135-acre delta [28], a bulge of about 55 ha on Crescent's 2,000 ha; Tomyhoi's fan fills its south quarter. Inlets rise 67 % for each doubling of lake area [29] |
| **Tens of metres to about 200 m** | **Talus cones and avalanche fans** bulging the headwall shore; **bedrock knobs and ribs** as small points; moraine ridges entering the water | Tomyhoi (1973): pale fans on the west wall reach the water every 150 to 300 m |
| **Tens of metres** | **The outlet notch**: a low break in the lip, often with a gravel or boulder spit | Every lake with an outlet |
| **Tens of metres, lowland** | **Marsh and emergent plants** blurring the edge; bays half filled with sedge | Plants cover 76 to 100 % of the shore at Beaver, Dickey, Elk, Ozette, Seafield and Wentworth; little or none at Sutherland, Pleasant, Blue, Twin and Tomyhoi |
| **Metres** | **Logs, snags, drowned trees**, boulders, gravel bars at inlets | Many snags and logs at Pleasant and at Seafield (with highly coloured water); several along even alpine Tomyhoi |
| **Metres, alpine** | Boulder and scree margins, late snow and ice on the shaded side, meadow banks cut by rills | Twin Lakes (1973): snowfields and talus reaching the water on the shaded wall |

In terms of the mean radius R: bends and lobes are 0.5 to 2 R, deltas and fans 0.1 to
0.4 R, talus, knob and notch roughness 0.05 to 0.2 R on a tarn. The metre scale is below
what a map captures, but it is what a player on the shore sees.

## 6. Shape measures a generator can target

### Shoreline development index

The SDI, D_L = L / (2√(πA)), is shoreline length over the circumference of a circle of equal
area, so a circle scores 1. Elongate lakes score highest, and high values are common in
lakes along old drainages or behind dammed streams [1]; crater and kettle lakes score
near 1, glacial troughs and oxbows high [21]. A 2022 paper gives medians of 1.67 for
Scandinavian lakes (range 1.11 to 4.54) and 2.17 worldwide (1.14 to 10.24), and warns that
the SDI rises with lake area and map resolution because shorelines are fractal [30].
Compare lakes only at the same size and resolution.

| Group | SDI |
|---|---|
| Alpine cirque tarns, bathymetric maps (Blue, Twin) | 1.1 to 1.2 |
| Olympic high lakes ≥ 1 ha † | Median 1.20 to 1.34 by band; IQR about 1.13 to 1.47 |
| Olympic lakes of 0.1 to 0.5, 0.5 to 2, 2 to 10, 10 to 100, over 100 ha † | 1.20, 1.28, 1.35, 1.42, 1.81 |
| Small lowland lakes (Beaver, Wentworth, Seafield) | 1.2 to 1.3 |
| Mid-sized lowland lakes (Dickey, Pleasant, Elk) | 1.6 to 1.7 |
| Sutherland (landslide-dammed) | 1.8 |
| Big troughs: Crescent †, Ozette | 2.35, 2.6 |
| Reservoirs: Aldwell †, Cushman † | 2.6, 3.0 |

### Elongation and convexity

All measured:

| Group | Feret L:W median | Ellipse aspect (L²/A·π/4): median (IQR) | Convexity median | Convexity p10 |
|---|---|---|---|---|
| High lakes ≥ 1 ha, 900 to 2,000 m | 1.47 to 1.59 | 1.85 to 1.97 (about 1.6 to 2.6) | 0.90 to 0.93 | 0.75 to 0.82 |
| Lowland lakes ≥ 1 ha, < 500 m | 1.98 to 2.24 | 3.0 to 3.4 (about 2.2 to 5.6) | 0.83 | 0.40 to 0.62 |
| Lake Crescent, Ozette Lake | | | 0.49, 0.64 | |

### The outline spectrum

For each lake over 1 ha that is star-shaped from its centroid, the radius r(θ) was sampled
at 256 angles, Fourier-transformed and divided by the mean radius R. Only 20 of 68 high lakes
and 18 of 92 lowland lakes qualify. Median amplitudes as fractions of R:

| Harmonic k (wavelength about 2π/k · R) | High lakes: median (IQR) | Lowland lakes: median (IQR) |
|---|---|---|
| 2 (elongation) | 0.23 (0.16 to 0.34) | 0.39 (0.29 to 0.46) |
| 3 | 0.070 (0.05 to 0.10) | 0.11 (0.07 to 0.13) |
| 4 | 0.076 (0.03 to 0.11) | 0.10 (0.05 to 0.16) |
| 6 | 0.031 (0.02 to 0.05) | 0.052 (0.04 to 0.08) |
| 8 | 0.026 | 0.019 |
| 12 | 0.013 | 0.019 |
| 16 | 0.009 | 0.007 |
| 24 | 0.005 | 0.006 |

The RMS radial deviation by band, high lakes (lowland): k = 2, 0.16 (0.28); k = 3 to 6,
0.10 (0.12); k = 7 to 16, 0.04 (0.05); k = 17 to 32, 0.013 (0.017). From k = 3 to 16 the
amplitude falls as k^−1.4 for high lakes (IQR −1.6 to −1.1) and k^−1.46 for lowland ones.
OpenStreetMap draws a high lake with roughly 20 to 50 vertices, so amplitudes above k ≈ 16
are underestimates.

### Fractal dimension and depth

Percolation theory gives d = 4/3 for unscreened perimeters. Lakes worldwide of at least
0.46 km² give d ≈ 1.4 (the corrected value) and Swedish lakes of at least 4.7 km² d ≈ 1.34
[31], [32]. The slope of US lake perimeter against map resolution is 0.21
(D ≈ 1.21), less than earlier estimates [33]. Aim for D ≈ 1.2 to 1.3 on tarns and
1.3 to 1.4 on big lowland lakes.

In the bulletin's terms [1], volume development (mean over maximum depth) is 0.43 to
0.53 alpine, 0.30 to 0.66 lowland, about 0.48 at Crescent and 0.55 at Quinault: low means a
conical basin, high a steep-sided, flat-bottomed one. Zr is about 9 to 10 % for cirque
tarns, 2 to 4 % for troughs and 1 to 2.4 % for lowland lakes.

## 7. From geomorphology to generator rules

Numbers are measured medians unless marked; ranges are what to sample from.

1. **Two populations with a gap.** In the box about 39 % of lakes of at least 0.1 ha lie
   above 900 m, 2 % between 500 and 900 m and 58 % below 500 m; artificial ponds inflate the
   low share, and inside the park lowland lakes are rare [7]. On a mountain map make
   **about 2 lakes in 3 cirque or bench lakes at 900 to 2,000 m, 1 in 3 valley or lowland
   water below 500 m, and almost none between**, those on benches or behind landslide dams.
   High water is tarns, basin lakes, chains and many tiny moraine ponds, over half of it
   under 0.5 ha. Low water mixes rare large troughs and landslide lakes, round kettle-like
   lakes, common small floodplain and beaver ponds, and marshy lakes (a judgement from the
   types, not a count).
2. **Size by elevation.** High lakes are log-normal: median about 0.4 ha, p90 about 3.5 ha,
   capped at 15 to 20 ha (radius about 35 m, 105 m and 230 m). Only valley-floor lakes may
   be large, 20 to 3,000 ha, and rarely.
3. **No circles.** Draw length to width from a log-normal: tarns median **1.5**, p10 to p90
   about 1.15 to 2.5; valley and trough lakes median **2.2**, range 1.5 to 3, length over
   mean width 4 to 8 for big troughs and 4 to 6 for narrow alpine ones; kettles 1.0 to 1.4.
   Align trough, landslide and moraine lakes with the valley; orient tarns uniformly to the
   fall line.
4. **Outline harmonics, as fractions of R.** Tarns: k = 2 of 0.16 to 0.34, random-phase
   k = 3 to 16 of about 0.07·(k/3)^−1.4, and finer noise bringing k = 17 to 32 to 0.015 to
   0.03 R, erring high because the maps undersample: about **10 % RMS at 2 to 6 lobes, 4 % at
   7 to 16 bumps, 1.5 to 3 % finer**. Lowland lakes: k = 2 of 0.3 to 0.45, k = 3 to 6 of 12 to
   18 %, k = 7 to 16 of 5 to 9 %. At a fixed sampling resolution the SDI should land at **1.2
   to 1.35 for tarns, 1.5 to 1.8 for mid-sized lowland lakes and 2.3 to 2.6 for big troughs**.
5. **Shapes that are not star-shaped.** Two thirds of high lakes over 1 ha and four fifths of
   lowland ones have a bend or lobe radial noise cannot make. Build about 1 tarn in 3, and
   most lowland lakes, from **two or three overlapping ellipses or a bent spine** (a curved
   centreline of varying half-width), then add noise. Make about 1 tarn in 5 clearly
   two-lobed, like Heart or Gladys Lake (a judgement consistent with a convexity p10 to p25
   of 0.77 to 0.85), and big troughs curved ribbons (Crescent) or bodies with 2 to 4 arms
   (Ozette). Convexity: tarns 0.90 to 0.93 (p10 about 0.77), lowland 0.83 (p10 about 0.5).
6. **Perched bowls on a step.** A **headwall** on about two thirds of the perimeter rises
   **about 125 m within 200 m and 220 m within 500 m**, steepest near the top (a cirque's
   maximum is 55 to 65°), over a talus apron of 25 to 35°. The **open side** faces N, NE or E
   two times in three. A **lip** a few metres to about 20 m above the water carries one
   outlet notch, and **beyond it** the ground drops **40 to 50 m within 200 m and 140 to
   170 m within 500 m**. This holds for about 95 % of lakes above 900 m; a bench lake swaps
   the headwall for a gentler valley wall.
7. **Depth.** Tarns: maximum **0.09 to 0.10 of the mean diameter** (23 to 29 m at 4 to 8 ha),
   mean 0.45 to 0.5 of the maximum, deepest 30 to 45 % across toward the headwall, contours
   packed on the headwall and talus side, and a shelf under 6 m over 25 to 35 % of the area on
   the outlet and meadow side. Troughs: 0.02 to 0.04, steep walls, a shoaling inlet delta.
   Lowland lakes: 0.01 to 0.02, with wide shallow mucky margins.
8. **Inlet deltas as shoreline.** Each creek pushes out a rounded fan 0.1 to 0.4 R wide on a
   tarn, up to about 1 km on a big lake (Barnes Point, 55 ha), under 3 m deep for about its
   own width, with gravel and sand bars. A tarn has 0 or 1 permanent inlets, often only
   snowmelt seeps; bigger lakes gain about 67 % more per doubling of area. One trough lake in
   three gets a braided delta over 15 to 25 % of its length (Tomyhoi).
9. **Talus and bedrock bulges.** Where the shore meets a wall, add convex talus or avalanche
   fans every 100 to 300 m (2 to 5 a tarn), each standing out 0.05 to 0.15 R, and sharper
   bedrock knobs every few tens of metres: the main source of k = 7 to 16 roughness.
10. **One outlet, at the low shore.** Put it at the rim's lowest point on the open side;
    lowland and moraine lakes put it down-valley, landslide lakes at the slide, perhaps
    hidden (Lena drains underground). Shape it as a 5 to 20 m narrowing or spit, not a smooth
    arc.
11. **Edges by elevation.** Small and mid-sized lowland lakes: sedge or marsh on 75 to 100 %
    of the shore (little or none on deep, clear or alpine lakes), logs and snags on almost
    every forested shore, drowned trees in beaver ponds and landslide lakes, islands on about
    5 to 10 % of lakes over 1 ha (Angeles, Ozette, Flapjack). Alpine lakes: boulders, scree
    and late snow down to the water on the shaded south or headwall side, meadow on the
    outlet side.
12. **Chains and groups.** **74 %** of water bodies above 900 m have another within 1 km (46 %
    within 0.5 km), and **51 %** of high lakes of at least 0.5 ha have one that size within
    1 km. Put about half the high lakes in **groups of 2 to 8 in one basin** (Seven Lakes
    Basin, Grand Valley, Royal Basin), stepping down one drainage about 100 m at a time
    (Gladys 1,641 m, Moose 1,539 m, Grand 1,442 m), each outlet feeding the next lake.

## 8. Method and caveats

**Polygons.** OpenStreetMap `natural=water` ways and multipolygons in the box were downloaded
through the Overpass API on 2026-10-08, under the ODbL [2]. Rivers, basins, wastewater
ponds and canals were dropped; reservoirs were kept but left out of the statistics. Areas
match published values within a few per cent (Crescent 2,038 against 2,075 ha, Ozette 3,035
against 2,954 to 3,151 ha, Constance 4.35 against 4.29 ha), though Quinault's 1,435 ha is
under the published 1,509 ha.

**Elevations.** SRTM 30 m through OpenTopoData, at a shoreline vertex [3].

**The `ned10m` trap.** OpenTopoData's `ned10m` dataset returns values about 3.3 times too
small (feet treated as metres) over much of the southern and eastern Olympics: Lena Lake
came back at 165 m instead of 556 m. A first pass on it misplaced 195 of the 936 lakes, so
every number here uses SRTM.

**Rings.** Rise and drop use 16 bearings at the equivalent radius plus 50, 200 and 500 m from
the centroid. Some +50 m points on long lakes fall on water, so only +200 and +500 m are
quoted. The lowest ground at +500 m stands in for the outlet direction.

**Resolution.** Lakes under 2 ha are drawn with 14 to 29 vertices, which understates the SDI
and fine roughness: read those numbers as lower bounds.

**Region.** The box includes lowland around Port Angeles, Sequim and Hood Canal, where many
small ponds are artificial. That inflates the lowland count, not the mountain numbers.

### What is still unknown

- **Olympic high-lake depths**: none found; the cirque depths above are North Cascades
  analogues.
- **PJ Lake** is not mapped by name, so it has no measured shape.
- **Kettles**: no source names an Olympic kettle; calling the round lowland lakes kettles
  is an inference.
- **The 2022 SDI medians** come from a search summary, because the paper returned an access
  error.
- **Oxbows**: none is tagged as one in OpenStreetMap here, so they were not measured.

## 9. Sources

1. G. C. Bortleson, N. P. Dion, J. B. McConnell, and L. M. Nelson, "Reconnaissance data on lakes in Washington, vol. 1: Clallam, Island, Jefferson, San Juan, Skagit, and Whatcom Counties," Washington Dept. of Ecology, Water-Supply Bull. 43, 1976. Accessed: Oct. 8, 2026. [Online]. Available: https://apps.ecology.wa.gov/publications/documents/wsb43a.pdf
2. OpenStreetMap contributors, "OpenStreetMap data, ODbL," queried through the Overpass API. Accessed: Oct. 8, 2026. [Online]. Available: https://overpass-api.de
3. Open Topo Data, "SRTM 30 m elevation dataset," Open Topo Data. Accessed: Oct. 8, 2026. [Online]. Available: https://www.opentopodata.org
4. U.S. National Park Service, "Geology of Olympic," Olympic National Park. Accessed: Oct. 8, 2026. [Online]. Available: https://www.nps.gov/olym/learn/nature/geology.htm
5. U.S. National Park Service, "Glaciation," in *NPS Natural History Handbook: Olympic*, NPS History. Accessed: Oct. 8, 2026. [Online]. Available: https://npshistory.com/handbooks/natural/1b/nh1bc.htm
6. HistoryLink.org, "Vashon glacier begins to melt and recede from Puget Sound region and Columbia Basin around 16,900 years ago," HistoryLink.org, essay 5087. Accessed: Oct. 8, 2026. [Online]. Available: https://www.historylink.org/file/5087
7. S. J. Brenkman et al., "Unveiling a legacy of fish introductions to mountain lakes using historical records and eDNA surveys in a National Park," *Front. Conserv. Sci.*, vol. 6, Art. no. 1698619, Jan. 2026. Accessed: Oct. 8, 2026. [Online]. Available: https://www.frontiersin.org/journals/conservation-science/articles/10.3389/fcosc.2025.1698619/full
8. Washington Trails Association, "Lake Angeles," Washington Trails Association. Accessed: Oct. 8, 2026. [Online]. Available: https://www.wta.org/go-hiking/hikes/lake-angeles
9. Washington Trails Association, "PJ Lake," Washington Trails Association. Accessed: Oct. 8, 2026. [Online]. Available: https://www.wta.org/go-hiking/hikes/pj-lake
10. Wikipedia contributors, "Paternoster lake," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Paternoster_lake
11. Wikipedia contributors, "Seven Lakes Basin," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Seven_Lakes_Basin
12. U.S. Geological Survey, "Ozette Lake: A natural seismograph along the northern Cascadia Subduction Zone (video)," U.S. Geological Survey. Accessed: Oct. 8, 2026. [Online]. Available: https://www.usgs.gov/programs/cmhrp/news/ozette-lake-a-natural-seismograph-along-northern-cascadia-subduction-zone-video
13. Wikipedia contributors, "Lake Cushman," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Lake_Cushman
14. Wikipedia contributors, "Lake Crescent," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Lake_Crescent
15. Hiking Project, "Lena Lake," Hiking Project. Accessed: Oct. 8, 2026. [Online]. Available: https://www.hikingproject.com/trail/7001958/lena-lake
16. Wikipedia contributors, "Mount Storm King," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Mount_Storm_King
17. Wikipedia contributors, "Kettle (landform)," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Kettle_(landform)
18. T. Abbe, J. Bountry, G. Ward, L. Piety, M. McBride, and P. Kennard, "Forest influence on floodplain development and channel migration zones," presented at Geol. Soc. Amer. Annu. Meeting, Seattle, WA, USA, Nov. 2003. Accessed: Oct. 8, 2026. [Online]. Available: https://gsa.confex.com/gsa/2003AM/webprogram/Paper64592.html
19. Washington State Recreation and Conservation Office, "Allen's Marsh / Old Joe's Slough fish passage," Salmon Recovery Portal, project 15-1292. Accessed: Oct. 8, 2026. [Online]. Available: https://srp.rco.wa.gov/project/100/40207
20. I. S. Evans and N. J. Cox, "Size and shape of glacial cirques: comparative data in specific geomorphometry," in *Proc. Geomorphometry 2015*, Poznań, Poland, Jun. 2015. Accessed: Oct. 8, 2026. [Online]. Available: https://geomorphometry.org/uploads/pdf/pdf2015/EvansCox2015geomorphometry.pdf
21. Wikipedia contributors, "Shoreline development index," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Shoreline_development_index
22. Wikipedia contributors, "Lake Ozette," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Lake_Ozette
23. LakeLubbers, "Lake Quinault, Washington, USA," LakeLubbers. Accessed: Oct. 8, 2026. [Online]. Available: https://lakelubbers.com/?p=7003
24. Washington Trails Association, "Hoh Lake," Washington Trails Association. Accessed: Oct. 8, 2026. [Online]. Available: https://www.wta.org/go-hiking/hikes/hoh-lake
25. Washington Department of Fish and Wildlife, "Constance," High lakes. Accessed: Oct. 8, 2026. [Online]. Available: https://wdfw.wa.gov/fishing/locations/high-lakes/constance
26. Wikipedia contributors, "Tarn (lake)," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Tarn_(lake)
27. Wikipedia contributors, "Cameron Glaciers," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Cameron_Glaciers
28. Wikipedia contributors, "Barnes Point," Wikipedia. Accessed: Oct. 8, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Barnes_Point
29. D. Seekell, B. Cael, E. Lindmark, and P. Byström, "The fractal scaling relationship for river inlets to lakes," *Geophys. Res. Lett.*, vol. 48, no. 9, Art. no. e2021GL093366, May 2021. Accessed: Oct. 8, 2026. [Online]. Available: https://nora.nerc.ac.uk/id/eprint/530379/
30. D. Seekell, B. B. Cael, and P. Byström, "Problems with the shoreline development index: A widely used metric of lake shape," *Geophys. Res. Lett.*, vol. 49, no. 10, Art. no. e2022GL098499, May 2022. Accessed: Oct. 8, 2026. [Online]. Available: https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2022GL098499
31. B. B. Cael and D. A. Seekell, "The size-distribution of Earth's lakes," *Sci. Rep.*, vol. 6, Art. no. 29633, Jul. 2016. Accessed: Oct. 8, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC4937396/
32. B. B. Cael and D. A. Seekell, "Corrigendum: The size-distribution of Earth's lakes," *Sci. Rep.*, vol. 7, Art. no. 42155, Feb. 2017. Accessed: Oct. 8, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC5304202/
33. L. A. Winslow, J. S. Read, P. C. Hanson, and E. H. Stanley, "Lake shoreline in the contiguous United States: Quantity, distribution and sensitivity to observation resolution," *Freshw. Biol.*, vol. 59, no. 2, pp. 213-223, 2014. Accessed: Oct. 8, 2026. [Online]. Available: https://pubs.usgs.gov/publication/70048525
