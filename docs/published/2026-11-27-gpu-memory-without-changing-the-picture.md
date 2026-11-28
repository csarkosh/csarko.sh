---
description: A browser game's GPU memory fell 116 MB with no visible change to the picture. Six savings that shipped, six ideas that did not, and the numbers behind each.
published: 2026-11-27
categories: Rendering
project: none
closing: Every figure here is Cape Sorrow's own count on its medium tier as of Nov 27, 2026, so the thing to reuse is the method and not the totals. Count the objects the page makes, test one change at a time against the noise between two runs, and price an idea before building it. The streaming arithmetic of section 9 is the part to run again when the town's detail doubles.
asks: How do you cut a browser game's GPU memory without changing its picture?
related: ink-line-from-depth-webgpu, streaming-a-procedural-world-in-the-browser, when-webassembly-is-worth-it
---
# Reduce a browser game's GPU memory, picture unchanged

**Question:** How do you cut the GPU memory of a WebGPU browser game without changing what it draws? And which savings that look obvious turn out not to be worth building?

**Short answer:** Count every buffer and texture the page creates, change one thing at a time, and keep a change only if the picture moves less than two runs of the same build already differ. In Cape Sorrow, a browser game in development, that took the medium tier from 651 MB to 535 MB. The biggest wins were things sized for the worst case or stored twice. Next came smaller storage formats that need no shader change. Half-float animation tables, 8-bit tints and 8-bit normals each failed.

**What that leaves open:** The page's own count is about half of what Chrome's GPU process reports, so these savings are real but smaller than the browser's total. "No change" here means within a measured noise, not identical. By the end you can rebuild the counting, the picture test and the arithmetic that stopped each idea, and see what streaming the town by distance would and would not buy.

The figure sorts the six savings that shipped by what they cost. Look at the green bars: 41.5 MB of the 116 came from memory that was allocated too big or held twice, where no precision was traded at all.

![A horizontal bar chart of six GPU memory savings in megabytes, in two groups. Under "Allocated too big or kept twice", in green: sign atlas 21, identical model images stored once 18, stand-in car released 2.5. Under "Stored smaller, error measured", in grey: vertex formats and 16-bit indices 30, animation tables at two texels a bone 27, material record per vertex 17. The axis runs from 0 to 30.](savings.svg "Six savings add to 115.5 MB. The three that cost no precision at all, the atlas, the repeated images and the stand-in car, are 41.5 MB of it; the other 74 MB were stored in smaller forms, each with its error measured first.")

**In numbers:**

- **116 MB less**, from 651 to 535 MB on the page's own count of GPU buffers and textures, on the medium tier at 1280 by 720 ([section 1](#651-to-535-mb-counted-by-wrapping-the-page-s-own-gpu-calls)).
- **1.12 mm:** how far half-float animation tables moved a character's body, which is why they shipped as two texels a bone in 32-bit floats ([section 3](#27-mb-from-animation-tables-after-half-floats-moved-a-body-by-1-12-mm)).
- **41.5 MB** came from allocations sized for the worst case or kept twice, with no precision change ([section 6](#41-5-mb-from-memory-sized-for-the-worst-case-or-kept-twice)).
- **33 to 36 percent** fewer vertices is what streaming by distance would hold, about 32 to 37 MB of the town's 120 MB of geometry (an estimate) ([section 9](#streaming-by-distance-33-to-36-percent-fewer-vertices-and-a-lot-of-work)).

## 1. 651 to 535 MB, counted by wrapping the page's own GPU calls

This section describes Cape Sorrow as of Nov 27, 2026: a browser game in development, a generated port town on the Washington coast walked and driven at street level on WebGPU, with three graphics tiers called high, medium and low. On the medium tier at 1280 by 720, 110 seconds after load, the page had created 651 MB of GPU memory, about 238 MB of buffers and 415 MB of textures. After the work below the same count reads 535 MB (about 186 and 350), measured on the live site. The low tier ends at 264 MB.

The renderer is a patched build of the open-source Babylon Lite; its three public patches are described in [1] and shipped in the game's engine in three releases [2].

The count comes from a script that loads the game in headless Chrome and wraps the page's own `createBuffer` and `createTexture` calls. Every GPU object is listed with its bytes (texels times bytes a texel, times mip levels, times samples) and the call stack that made it, and a second script groups them by maker, so a line reads "town geometry" and not "buffer 4,117". Both scripts, and one that compares two runs, ship in the game's engine as of its release v0.2.39 [2]. The run waits 110 seconds so the late models are in, with a device pixel ratio of 1 and one fixed seed of the town.

Three limits on the count:

- **It is the page's count and not the browser's.** Chrome's GPU process reported about twice as much: 1,229 MB against 554 counted by the page, medium tier, before the last change.
- **Its megabyte is 1,048,576 bytes,** except where a byte count is given. Each saving was worked out at its own stage, so the six add to 115.5 MB against 116 MB measured end to end.
- **One seed and one window size.** Outside the browser, building the town in Node gave 2,154,874 vertices and 3,459,003 indices in 179 meshes.

A number alone does not say whether a saving was free. That needs a test of the picture.

## 2. A change passes if the picture moves at most 1.3 times the noise

The test is before and after pictures of fixed views with the game's clock held. Two pictures of the same build still differ, because temporal anti-aliasing, which blends each frame with the last ones, shifts the frame by a sub-pixel each time, and a blur's sample disc turns each frame. So every view was taken twice before the change, to measure that noise. A change passed if the picture after it differed from the pictures before by at most 1.3 times the noise, and nothing showed at full size.

The low tier made the test sharper. It has no temporal anti-aliasing, so two runs of one view differ by a mean of only 0.01 to 0.02 of one level out of 255. A change that moves a low-tier picture by a mean of 0.2 of a level shows in the numbers although no eye would see it, so the low tier was the strict comparator. Changes about precision were also proved on the CPU first: the largest displacement in millimetres over every frame and bone, the largest angle error over every normal, the error of every packed field over a whole town.

The first saving is the clearest case of a plan that the measurement overturned.

## 3. 27 MB from animation tables, after half-floats moved a body by 1.12 mm

The game has five animated people. Each one's movements are baked into a table that the vertex shader reads, a row for each frame of every bone's transform: 52 bones by 4 texels wide and 3,214 frames tall, four 32-bit floats a texel, 10,696,192 bytes each and 53 MB for the five.

The obvious saving is 16-bit floats, which halve the tables. I tried it on the CPU first: round every matrix to a 16-bit float and back, then measure how far points on the body move. They moved up to 1.05 to 1.12 mm depending on the person, with almost every frame over 0.5 mm. A 16-bit float keeps 11 bits of precision [3], so between 128 and 256 its steps are 0.125 apart, and a bone's matrix carries a translation of 1.4 to 1.6 m, which the skeleton stores as 137 to 161 in centimetres. The error is relative, so other units would not remove it. The table is read without blending between frames, at about 24 rows of movement a second, so the error would show as a shake. At 1 m from a face on a 1080p frame a pixel is about 1 mm, so 1.12 mm is visible.

What shipped keeps the 32-bit floats and stores fewer of them. Every matrix's fourth row is exactly 0, 0, 0, 1, and the rest is a rotation, a move and one uniform scale. A unit quaternion (four numbers that describe a rotation), a move (three) and a scale (one) make eight numbers, or two texels where the table held four. The vertex shader rebuilds the same 4 by 4 matrix at the one place it reads a bone, so skinning weights and clip blending are untouched code, and a quaternion's sign does not matter because nothing blends texels.

Over every frame and bone at the corners of each model's bounds, a rebuilt matrix moves a point by 0.0015 to 0.055 mm. Three of the five models carry a shear of a few parts in 100,000, which the two-texel form drops, and that is the top of the range. An exact three-texel form was built as a fallback and sits beside it in the patch's option [1]. The fork's note records an interim 51.9 to 34.1 MB, measured while those three models were on the three-texel form; the live site holds all five tables at two texels, and the saving is about 27 MB. People cannot share a table, since each body has its own skeleton.

A table is a few big objects. The next saving is in something that exists two million times.

## 4. 17 MB from a vertex's material record, after an 8-bit tint failed

Each town vertex carries twelve numbers that describe its material: a texture layer, two wear amounts and kinds, a glow, a tint, a clearness and four more. They were twelve 16-bit floats, 24 bytes. They take 16: two 16-bit floats and three 32-bit words of bit fields, unpacked at the top of the vertex shader into the same names, as four vertex attributes (`float16x2` and three `uint32`). I avoided the packed 10-10-10-2 formats to stay on formats every WebGPU browser has.

The first attempt stored the tint in 8 bits a channel, as its square root, and failed. Tints run to 13.9, so 8 bits gave steps of about 3.5 percent near a tint of 0.8, and the low tier moved by a mean of 0.78 of a level, with the 99th percentile at 3. The town's variety comes from each placement's small difference in colour, so coarse steps make it more uniform.

What shipped gives the tint 12 bits a channel, still as its square root, with a range up to 16. Two fields that looked like amounts from 0 to 1 turned out to double as a pane's height and width in metres, up to 2.8 and 8.3 m, so they got 10 bits each with fixed scales. The low tier moved by a mean of 0.21 to 0.24 of a level, with the 99th percentile at 2.0, from wear amounts and glow in 8 bits moving the edge of a wear pattern. The numbers see a shift of that size on a tier with almost no noise, and nothing showed at full size.

With the record at 16 bytes, the rest of the vertex was next.

## 5. 30 MB from vertex formats, after 8-bit normals failed

A town vertex carried 64 bytes: position 12, normal 12, texture coordinate 8 and colour 16, all 32-bit floats, plus the 16-byte record. After the change it carries 52, and 171 of the 179 meshes use 16-bit indices. The town's geometry buffers went from 118.0 to 87.6 MB.

Neither change needs a shader edit, because WebGPU converts a vertex buffer's format to what the shader declares [4]. The specification says a signed normalised format, a whole number read as a value from -1 to 1, can be read as a 32-bit float. So normals became `snorm16x4` (8 bytes), colours `float16x4` (8 bytes), and any batch of fewer than 65,536 vertices takes 16-bit indices. The renderer needed one hook: the maker of a mesh can name a format for a stream, and the pipeline's vertex layout takes it [1].

The cheaper normal failed in the same way as the tint. At `snorm8x4`, 4 bytes, the worst angle error was 0.39 degrees, and on the low tier wet ground moved by a mean of 0.42 of a level against 0.15 of noise. At `snorm16x4` the worst error is 0.0015 degrees and every view was at the noise. One high-tier lit view differed by 1.5 times the noise, on thin edges only, with a signed mean of 0.07 of a level. That is over the 1.3 limit of section 2, and I accepted it because only thin edges moved and the mean shift is that small.

Three other streams do not shrink, each for a number:

- **Colours** cannot be 8-bit. They are a tint that runs to 1.57, and their alpha carries codes.
- **Texture coordinates** run to 3,132 tiles in world units. As `float16x2` the worst error is 512 texels.
- **Positions** in 16-bit floats about a batch's centre are off by up to 31 mm. A 16-bit normalised value over the batch's bounds would be off by 1.4 mm, but needs a scale and offset for each mesh: a shader change.

Those three savings traded some precision and measured the cost. The next group traded none.

## 6. 41.5 MB from memory sized for the worst case or kept twice

The cheapest savings were not smaller formats. They were objects sized for the worst case, objects never released and the same image held many times. All are exact, so the picture is unchanged by construction.

**The sign atlas, 21 MB.** Every painted sign in the town sits in one texture, made at 4096 by 2048 before the town was built, and the test town used 41 percent of it. The signs are laid out as before and packed again, tallest first with the fewest rows, when the town's geometry is done. The texture is made at that height (4096 by 1024 for the test town) and the sign quads' corners are remapped on the CPU before upload. It went from 42.7 to 21.3 MB. A side effect was worth more: the low tier caps the atlas at 2048 by 1024, and the old shelf layout ran out of room in a half-empty texture, so the tier had been silently dropping 87 of its 299 signs. All 299 fit in 2048 by 832.

![Two frames of the same shop front at night on the lowest quality tier, before the change on the left and after on the right. On the left a blank dark blue board hangs over the shop window where the sign should be. On the right the board is orange and reads "arrick Bakery", the first letter hidden by a pole, and a second board reading SALE appears above it.](sign-atlas.png "On the low tier, signs that the old atlas layout dropped came back once the atlas was packed to what it holds: the bakery's board, blank on the left, is lettered on the right, and the atlas itself is half the size. Frames from a development build of Cape Sorrow, November 2026.")

**The stand-in car, 2.5 MB.** A car built in code is shown until its real model loads. When the model landed, the stand-in was hidden and not released.

**The same image, 18 MB.** A model file's images were uploaded once for every model that carried them. Parked vehicles share the same lamp, tyre, underbody and interior maps (70 textures, 24 of them different). A cache keyed by a SHA-256 hash of an image's bytes, its colour space and its size cap gives equal images one GPU texture, at 0.45 ms a megabyte. On the high tier textures fell from 277 to 223 and model textures from 118.5 to 100.4 MB; on the medium tier, from 110.5 to 92.3 MB [1].

One leak was not GPU memory. A memo of ground heights, keyed by position to the millimetre, never forgot an entry: 385,000 when the town's build ended, 566,000 two minutes later, and about 1,400 more a second for as long as the game ran, 39 MB after two minutes at about 69 bytes an entry in a JavaScript `Map`. It is capped at 32,768 entries and emptied when full, which costs the town's build 0.6 percent more height reads.

The textures that remained were the biggest single group, which leaves one more lever.

## 7. 56 MB less on the low tier from a texture cap, with only foliage speckle to show

Most of the models' texture memory, 70 percent by the page's count, is trees and ground clutter at 1024 by 1024. The engine's quality table already had a texture size cap for each tier, and nothing read it.

Reading it was easy because of how the textures are stored: as block-compressed KTX2 files that carry every mip level. A mip level is a copy of the texture at half the width and height, kept so that distant surfaces sample something small. The KTX2 specification stores the levels from the smallest to the largest and does not let a block-compressed file leave them for the loader to make [5], and the glTF extension that carries such files says an image sampled with mipmaps should hold a full pyramid [6]. A cap is then a matter of skipping the biggest levels at upload and keeping the rest, with nothing rescaled [1].

The low tier, whose frame is 853 by 480 to 1280 by 720, caps at 512, and model textures fell from 92.0 to 35.4 MB. Its pictures of people, trees and the forest edge did not visibly change. The one change the numbers found is a speckle in foliage, a mean difference of 0.8 to 1.1 levels.

![Two frames of the same forest edge on the lowest quality tier, before the texture cap on the left and after it on the right. Tall conifer trunks, ferns and a stump fill the foreground with outlines drawn on them, and low buildings and a power line stand in the distance. The two frames look the same.](texture-cap.png "On the low tier, capping model textures at 512 took 56.6 MB from the model textures and left the forest edge looking the same at full size; the speckle in foliage shows only in the numbers. Frames from a development build of Cape Sorrow, November 2026.")

That makes six savings. The ideas I did not build teach as much, because each looked good until it was priced.

## 8. Five ideas measured and not built, with the number that stopped each

**Simplifying what is deep inside rooms seen through shop glass.** Rooms behind glass are drawn out of focus by depth, fully blurred 1.3 m behind the pane, and 83 percent of the rooms' vertices lie deeper than that. Cutting the deep detail saved 111,000 vertices (8 MB at the old vertex size) and changed the picture, because the blurred masses of colour and light are the picture. Keeping each lost thing's mean colour as a flat cell brought the picture back and shrank the saving to 45,600 vertices, about 2.6 MB, with 4 of 21 views still not clearly passing.

**Not building faces no eye can see.** Sampling 10,277 eye positions against the whole town said 9.6 percent of the vertices are never seen, half of them inside rooms. A sampled "never seen" is not a proof, and what can be proved at build time, the backs of things relative to every window, is about 3 MB.

**Block-compressing the town's own material textures.** Two arrays of 22 layers at 512 by 512 are 61.5 MB; at one byte a texel they would be 15.4 MB. The download would grow from 6.2 MB to 10 to 11 MB. The data layers, which pack two normal channels, roughness and ambient occlusion into four unrelated channels, come out at 28 to 33 dB after transcoding to BC7, with single-channel errors up to 75 of 255, while the colour layers hold at 40 to 47 dB (peak signal-to-noise: higher is closer to the original). The renderer library also cannot fill a compressed array in place. Colour layers alone would save 23 MB.

**Instancing the grass tufts.** Tufts are 9.8 percent of the town's vertices, 10,498 tufts with 70,589 blades, and every one is its own shape by hash: 6,729 distinct of 6,846 pieces. Making them alike would save about 11 MB and make them look alike, and nothing in the town should look uniform.

**Cutting the render targets.** At 1280 by 720 they take 88 to 92 MB on the medium and high tiers (about 195 MB at 1920 by 1080) and 24 MB on the low. Scene colour at 4 samples in `rgba16float` is 28.1 MB, its depth 14.1, and two anti-aliasing history frames 14.1. Every option left has a visible cost: 4 samples down to 2 saves 21 MB (47 at 1080p), and a half-size history 5 MB (12).

The biggest idea took the most work to price, and it is the one most often proposed first.

## 9. Streaming by distance: 33 to 36 percent fewer vertices, and a lot of work

The town is 45 cells of 128 m, 415 m by 1.2 km. Fog leaves about 65 percent of contrast at 800 m and the far plane is at 10 km, so every cell can be seen from somewhere, and releasing everything past 500 m frees only 8 to 18 percent of the vertices. The version that would pay is a level of detail: full detail within 200 m and the low tier's detail beyond. That study counted 2.05 million vertices (a different count from section 1's; I give its figures as reported) and the scheme would hold 1.31 to 1.37 million, 33 to 36 percent fewer, or about 30 percent if the streets and sidewalks stay at full detail.

What it needs:

- **A build made of cells.** The street and sidewalk pass is 42 percent of a 2.2 s build and 25 percent of the vertices, and runs over the whole plan at once; only the buildings loop (23 percent) works one item at a time.
- **State that crosses cells, untangled:** a ledger that keeps faces apart, the seams between houses and ground, and the sign atlas. A cell rebuilt alone differs from the whole build by 0.03 to 0.7 percent of its vertices because of it.
- **A worker.** The build runs in plain Node, so it can.
- **Uploads that fit a frame.** A cell is 2.1 MB at the median and 9.9 MB at most, against a shared budget of 2 MB a frame while driving, and costs 42 ms to build at the median and 157 ms at most.

I did not build it for a town this size, and the reason is arithmetic, an estimate and not a measurement. The town's geometry is about 120 MB all in: the 87.6 MB of vertex data and indices plus about 34 MB of material records, and standing things (buildings, props, growth) are about three quarters of it. With full detail held only within 200 m (34 to 41 percent of the vertices at the start and the centre) and the low build beyond, at about 40 percent of full for standing things, the town as of Nov 27, 2026 would hold about 83 to 88 MB: 32 to 37 MB off, for all of the work above.

The case for it is growth. If building detail doubled, an unstreamed town would hold about 210 MB and a streamed one about 120 MB, roughly what the town holds unstreamed. About 60 percent of any detail added later would never be held, provided the far build does not carry it.

What streaming would not buy: it does nothing for the 88 to 92 MB of render targets or for the 350 MB of textures. Nor does it shorten what is drawn in the distance, since beyond 200 m the low build is still drawn; I did not measure that cost.

## 10. Measure first: three plans changed and six ideas were priced and not built

Three of the planned savings changed design after a CPU or picture measurement, and the six ideas of sections 8 and 9 were priced and not built. The table shows the first group.

| First idea | What stopped it | What shipped |
|---|---|---|
| Half-float animation tables | 1.05 to 1.12 mm of body movement | Two texels a bone in 32-bit floats |
| 8-bit tint | 0.78 of a level on the low tier | 12 bits a channel, as a square root |
| 8-bit normals | 0.39 degrees, 0.42 of a level on wet ground | 16-bit normalised normals |

Three more lessons, each tied to a number above. A deterministic render path is a measuring instrument: the low tier has no temporal anti-aliasing, and that made a 0.2-level change measurable. What looks hidden is often the picture: the rooms behind glass were 83 percent deep detail and still could not be cut. And know which count you are moving: the page's count is about half of the browser's GPU process figure, so 116 MB is a saving in what the page controls.

## Sources

1. C. Sarkosh, "DAYHIKE.md: Day Hike's patched build of Babylon Lite," GitHub repository csarkosh/babylon-lite, tag v1.39.3-dayhike.12. Accessed: Nov. 27, 2026. [Online]. Available: https://github.com/csarkosh/babylon-lite/blob/v1.39.3-dayhike.12/DAYHIKE.md
2. C. Sarkosh, "Releases v0.2.34, v0.2.36, v0.2.38 and v0.2.39," GitHub repository csarkosh/engine, Nov. 2026. Accessed: Nov. 27, 2026. [Online]. Available: https://github.com/csarkosh/engine/releases
3. Wikipedia contributors, "Half-precision floating-point format," Wikipedia. Accessed: Nov. 27, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Half-precision_floating-point_format
4. W3C, "WebGPU," W3C Candidate Recommendation Draft, Nov. 16, 2026, section 10.3.7.1, Vertex Formats. Accessed: Nov. 27, 2026. [Online]. Available: https://www.w3.org/TR/webgpu/
5. M. Callow, "KTX File Format Specification," version 2.0.4, Khronos Group, Feb. 20, 2025, section 3.7, levelCount. Accessed: Nov. 27, 2026. [Online]. Available: https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html
6. Khronos Group, "KHR_texture_basisu," glTF extension specification. Accessed: Nov. 27, 2026. [Online]. Available: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md
