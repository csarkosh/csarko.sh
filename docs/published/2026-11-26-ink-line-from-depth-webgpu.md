---
description: An ink line found from the second difference of inverse depth outlines objects, ignores texture and glancing walls, and costs five depth reads a pixel.
published: 2026-11-26
categories: Rendering
project: none
asks: How do you draw an ink outline from depth in WebGPU?
related: scene-depth-for-a-post-process-webgpu-vs-webgl2, stylized-shader-looks, a-painted-look-over-a-photoreal-render-webgpu-vs-webgl2
---
# An ink line in WebGPU that outlines shapes, not textures

**Question:** How do you draw an ink line over a realistic 3D scene in WebGPU, so that it outlines objects and does not trace every brick? And where in the frame does it go so that it does not shimmer?

**Short answer:** Find the line from depth, not from the picture. Take the inverse of each pixel's distance, add its four neighbours, subtract four times the centre, and divide by the largest of the five. That number is zero on any flat surface at any angle and large where one object ends in front of another. Ease it between two thresholds and darken the colour by it. Do it in a full-screen pass before temporal anti-aliasing, which then steadies the line.

**What that leaves open:** The line only sees steps in distance, so it misses a crease between two walls and anything a texture merely paints. It was not timed by itself, and it draws straight through glass. By the end you can say what will and will not get a line at a given distance, and what that asks of the models.

The figure is the same wall in the same late sun, drawn twice. Look at the brick: on the left every mortar joint carries a line, and on the right only the window frames, the pole and the sign do.

![Two crops of the same brick shopfront in low sun. In the left crop a dark line follows every mortar joint, every stain and the lettering, so the wall reads as a mesh of black marks. In the right crop the brick is clean and lines sit only on the window frames, the utility pole, the sign boards and the roof line.](brightness-against-depth.png "The same wall with the line found from brightness (left) and from depth (right). A brightness edge cannot tell a mortar joint from the edge of a window, and a depth edge can. Frames from a development build of Cape Sorrow, November 2026.")

**In numbers:**

- **5 depth reads a pixel**, in a pass that already ran, with no new render target and no new pass ([section 4](#reading-depth-in-webgpu-resolve-the-samples-yourself)).
- **0 on any flat plane:** what the second difference of inverse depth gives, whatever the viewing angle ([section 3](#the-second-difference-of-inverse-depth-is-zero-on-any-plane)).
- **1 percent to 5 percent:** the step in distance, as a share of the distance behind the edge, over which the line fades in ([section 6](#what-it-draws-and-what-it-misses-steps-over-1-percent-of-distance)).
- **11 bits:** the precision of the 16-bit float the distance is kept in, which leaves a noise floor about five times under the lower threshold ([section 6](#what-it-draws-and-what-it-misses-steps-over-1-percent-of-distance)).

## 1. A line from brightness inks every mortar joint

The first version of this line was quick to write. The last full-screen pass of the frame already had the finished picture, so it read four neighbours of each pixel, compared their brightness on a log scale, and darkened the pixel where the difference was large. Under an overcast sky it looked right: windows, cars, wires and roof lines all picked up a thin grey line. The scene is a port town from Cape Sorrow, a detective game in development on a forward-rendered WebGPU engine with photographic textures, which is what makes the next part a problem.

Then the sun came out. A sunlit brick wall is nothing but brightness edges, and the left half of the figure above is what the filter made of it. Raising the threshold removes the mortar and the window frames together, because to this filter they are the same thing: a place where the picture gets darker.

This is the standard colour-based edge filter, and its input is the tell. The Sobel shader that ships with three.js says in its own source that the operator expects a greyscale image [1]. A greyscale image holds what the scene looks like, with nothing in it about where one object stops. The fix is to ask a buffer that does know: depth.

## 2. Depth alone still fails on a wall seen along its length

Finding lines from geometry is as old as deferred shading. Saito and Takahashi's 1990 paper introduced geometric buffers, per-pixel depth and normals kept beside the colour, and drew its lines by image processing on those [2]. The same idea runs through real-time work since: Nienhaus and Doellner obtain edges by detecting discontinuities in the normal buffer and the z-buffer [3].

The obvious depth filter compares a pixel's depth with its neighbours' and draws where they differ by more than a threshold. It has a well-known fault. On a floor running to the horizon, or a wall seen along its length, neighbouring pixels are far apart in depth even though nothing ends there, and the filter draws a false line across the surface. One widely read Unity tutorial describes exactly this and scales its depth threshold up by how steeply the surface faces away from the camera [4]. Another names "unwanted edges" at grazing angles and masks them with a fresnel term [5]. Both fixes need the surface normal at every pixel.

Lucas Pope met the limits of this family on Return of the Obra Dinn. He tried the engine's depth and normal edge detection, found "missing edges and thick lines", and instead gave each face a flat colour by object and facing and drew lines between colours [6]. That gives the artist control, at the price of drawing the scene's faces into a buffer of their own.

The engine here is a forward renderer with no normal buffer and no id buffer, and neither was on offer: each costs a render target the size of the screen. So the question became whether depth alone can tell a slope from a step.

## 3. The second difference of inverse depth is zero on any plane

It can, with one change of variable. Take a flat surface in front of the camera. Its distance along the view, z, is not a straight line across the screen: perspective bends it, which is why a comparison of raw distances fires on a slope. But the inverse of that distance is straight. As Nathan Reed puts it, "1/z is linear in screen space" [7]. It is the same fact that lets a rasteriser interpolate depth across a triangle: the value stored in a depth buffer is a function of 1/z [8], and it is inverse z, not z, that is interpolated across the pixels [9].

The step from there is short, and it is this doc's own, not a citation. If a quantity is a straight line across a patch of screen, then its second difference is zero: the left neighbour plus the right neighbour is exactly twice the centre, and the same up and down. So for w = 1/z:

```wgsl
let second = wLeft + wRight + wDown + wUp - 4.0 * wCentre;
```

`second` is zero everywhere on a plane, at any tilt and any distance, with no normal needed. It is far from zero where a neighbour belongs to something else. Dividing by the largest of the five readings turns it into a pure ratio, so one pair of thresholds serves the whole depth range:

```wgsl
const LINE_LOW: f32 = 0.01;
const LINE_HIGH: f32 = 0.05;

fn lineEdge(uv: vec2<f32>) -> f32 {
  let texel = 1.0 / vec2<f32>(textureDimensions(depthTexture));
  // A clamped read at the border would repeat a neighbour and fake a slope.
  // The reads below use textureSampleLevel, which WGSL allows after a branch.
  if (any(uv < texel) || any(uv > vec2<f32>(1.0) - texel)) { return 0.0; }
  let c = inverseDistance(uv);
  let l = inverseDistance(uv - vec2<f32>(texel.x, 0.0));
  let r = inverseDistance(uv + vec2<f32>(texel.x, 0.0));
  let d = inverseDistance(uv - vec2<f32>(0.0, texel.y));
  let u = inverseDistance(uv + vec2<f32>(0.0, texel.y));
  let second = l + r + d + u - 4.0 * c;
  let largest = max(max(max(l, r), max(d, u)), c);
  return smoothstep(LINE_LOW, LINE_HIGH, abs(second) / largest);
}

// colour = mix(colour, colour * lineColour, lineEdge(uv) * lineStrength);
```

The sky needs no special case. A pixel where nothing was drawn is given a very large distance, so its inverse is close to zero, and a patch of pure sky sums to zero. A roof against that sky gives a ratio near one, which is a full line.

The filter is settled. What remains is getting a distance per pixel that a full-screen pass is allowed to read.

## 4. Reading depth in WebGPU: resolve the samples yourself

WebGPU makes this harder than it sounds when the scene is drawn with multisampling. A colour attachment can name a resolve target and the pass averages the samples for you. A depth attachment cannot: the depth-stencil attachment has no resolve target in the specification [10]. A depth format is also never plainly filterable; its sample types are "depth" and "unfilterable-float" [10].

What the specification does give is a way to read one sample of a multisampled depth texture at an integer pixel: `textureLoad` on a `texture_depth_multisampled_2d` takes the coordinates and a sample index [11]. So the engine runs a small pass after the scene. For each pixel it loads the four samples, turns each stored depth into a distance along the view with the projection's two depth terms, and writes their mean into an `r16float` colour texture, with zero where nothing was drawn. `r16float` is renderable and filterable without any optional feature [10], so every later pass reads it with an ordinary sampler. An earlier doc here, [Scene depth for a post process](/research/scene-depth-for-a-post-process-webgpu-vs-webgl2), covers a different arrangement, a prepass that writes depth as one of several colour targets; the resolve pass replaced it in this engine.

That pass existed before the line did, for the haze over what is far. The line is five more reads of its output, the centre and four neighbours a texel away, inside a full-screen pass that was already reading the centre. The offset comes from `textureDimensions` [11], so when the engine lowers its render resolution under load the line follows the buffer it reads.

The line's cost was not timed by itself as of Nov 26, 2026. What can be said is what it adds: five texture reads and a dozen arithmetic operations a pixel, no render target and no pass.

One choice in that paragraph matters more than the rest: which full-screen pass.

## 5. Draw the line before temporal anti-aliasing

Temporal anti-aliasing moves the whole scene by a fraction of a pixel each frame, by an offset added to the projection matrix, and blends the frames back together [12]. The depth buffer moves with it, and nothing puts it back: Brian Karis's slides on the technique say it in four words, "Can't unjitter depth buffer" [12].

So a line computed from depth after the blend is computed from an image that shifts every frame, laid over a picture that does not. Unity's documentation warns of the same thing for effects placed after its post-processing: those that use the depth buffer show jitter [13].

The line here goes in the first full-screen pass, ahead of the anti-aliasing. It darkens the scene's colour while that colour is still jittered in step with the depth, and the temporal blend then treats the line as part of the picture and smooths it along with everything else. It also means the line is drawn in linear light before tone mapping, as a multiplier: the colour is mixed toward itself times a dark blue-grey, so a line over a bright wall and a line over a dark car both read as ink and neither is a black stripe.

In play the line holds steady as the camera moves. That is an observation from walking the town, not a measurement.

![A street of brick shopfronts and two parked cars under an overcast sky, with thin grey lines along the roof line, the window frames, the cars' edges, the overhead wires and a utility pole, and fine film grain over the frame.](midday.png "The finished line at midday, with film grain and a slightly darker frame edge over it. The line is thin and grey, not black: it multiplies the colour under it. A development build of Cape Sorrow, November 2026.")

With the line placed, the thresholds decide what it draws.

## 6. What it draws and what it misses: steps over 1 percent of distance

At an edge where a near surface ends in front of a far one, the ratio works out to the gap between them divided by the far distance. The two thresholds are therefore a rule anyone can apply to a scene: **a step is drawn when the gap behind it is more than 1 percent of the distance to what is behind, and at full strength over 5 percent.**

Some cases, by that rule:

| Edge | Gap over distance | Line |
|---|---|---|
| A car 3 m in front of a wall, seen from 20 m | 0.13 | Full |
| A roof against the sky | about 1 | Full |
| A window set 10 cm into a wall, from 4 m | 0.024 | Partial |
| The same window from 15 m | 0.007 | None |
| A square corner where two walls meet | about 0.001 | None |

Two things follow. The line thins out with distance by itself, with no fade written for it: fine relief loses its line as the camera backs away, and silhouettes keep theirs. And a crease gets nothing. Where two flat walls meet there is no step, only a change of slope, and a change of slope moves the second difference by about the angle one pixel covers, near a thousandth. That is ten times under the lower threshold, so inside corners and the fold of a roof are left to the lighting.

The lower threshold cannot simply be dropped to catch them. The distance is kept in a 16-bit float, which has 11 bits of precision [14], about one part in two thousand. Five readings of it can disagree by about 0.002 on a perfectly flat wall, and a threshold near that would speckle. At 0.01 the line stays five times clear of it.

Three limits were found in the frames as of Nov 26, 2026 and are not solved:

- **Glass.** Blended glass writes no depth, so the line outlines the furniture in a room behind a shop window as sharply as the window's own frame.
- **Width.** The line is two texels wide, one each side of the edge, so it thickens on screen when the render resolution drops.
- **Low-end devices.** The engine's lowest tier has no full-screen passes at all, and so no line.

![Four frames of the same street: late afternoon under a clear sky, dusk under cloud, dusk in rain, and night. The same thin lines sit on the same edges in all four, while the colour and brightness of the frame change from warm daylight to deep blue.](hours.png "The line is the same at every hour and in every weather, because it never reads the picture. A development build of Cape Sorrow, November 2026.")

That leaves the question the filter cannot answer by itself: what the models should look like to suit it.

## 7. What the line asks of the art

A depth line is a statement about relief, so the way to get more ink is to model more relief, not to paint more detail. A window frame that stands 3 cm proud of its wall has a line only from a couple of metres away; one set 15 cm into the wall has a line from across the street. The table above doubles as a modelling rule: decide from how far a feature should read as drawn, and give it a step of a few percent of that distance.

The opposite route is the one Borderlands took. Its heavy outer outlines were generated in the engine, and its artists also painted ink strokes by hand into the textures themselves [15]. Painted ink is cheap and fully under the artist's control. It does not move with the light or the view, and on a photographic texture it brings back the mortar problem from section 1 by hand.

The middle route is Pope's: tell the filter where lines belong with a buffer of ids [6]. It catches creases and material changes that depth cannot, and it is the natural next step for an engine that can spare the render target.

## Sources

1. mrdoob et al., "SobelOperatorShader.js," three.js, GitHub repository, dev branch. Accessed: Nov. 26, 2026. [Online]. Available: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/shaders/SobelOperatorShader.js
2. T. Saito and T. Takahashi, "Comprehensible rendering of 3-D shapes," *Comput. Graph.*, vol. 24, no. 4, pp. 197-206, Aug. 1990. Accessed: Nov. 26, 2026. [Online]. Available: https://doi.org/10.1145/97879.97901
3. M. Nienhaus and J. Doellner, "Blueprint rendering and sketchy drawings," in GPU Gems 2, ch. 15, NVIDIA Developer, 2005. Accessed: Nov. 26, 2026. [Online]. Available: https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-15-blueprint-rendering-and-sketchy
4. Roystan, "Unity outline shader tutorial," roystan.net. Accessed: Nov. 26, 2026. [Online]. Available: https://roystan.net/articles/outline-shader/
5. A. Ameye, "5 ways to draw an outline," ameye.dev, Aug. 2021. Accessed: Nov. 26, 2026. [Online]. Available: https://ameye.dev/notes/rendering-outlines/
6. L. Pope, "Return of the Obra Dinn," development log, reply 23, TIGSource Forums, May 24, 2014. Accessed: Nov. 26, 2026. [Online]. Available: https://web.archive.org/web/2020/https://forums.tigsource.com/index.php?topic=40832.15
7. N. Reed, "Depth precision visualized," reedbeta.com, Jul. 3, 2015. Accessed: Nov. 26, 2026. [Online]. Available: https://www.reedbeta.com/blog/depth-precision-visualized/
8. J. de Vries, "Depth testing," LearnOpenGL. Accessed: Nov. 26, 2026. [Online]. Available: https://learnopengl.com/Advanced-OpenGL/Depth-testing
9. Scratchapixel, "The visibility problem, the depth buffer algorithm and depth interpolation," Scratchapixel. Accessed: Nov. 26, 2026. [Online]. Available: https://scratchapixel.com/lessons/3d-basic-rendering/rasterization-practical-implementation/visibility-problem-depth-buffer-depth-interpolation.html
10. W3C, "WebGPU," W3C Candidate Recommendation Draft, Nov. 16, 2026. Accessed: Nov. 26, 2026. [Online]. Available: https://www.w3.org/TR/webgpu/
11. W3C, "WebGPU Shading Language," W3C Candidate Recommendation Draft, Nov. 26, 2026. Accessed: Nov. 26, 2026. [Online]. Available: https://www.w3.org/TR/WGSL/
12. B. Karis, "High quality temporal supersampling," presented at SIGGRAPH Advances in Real-Time Rendering in Games course, Vancouver, BC, Canada, Aug. 2014. Accessed: Nov. 26, 2026. [Online]. Available: https://advances.realtimerendering.com/s2014/epic/TemporalAA.pptx
13. Unity Technologies, "Injection points," High Definition Render Pipeline 17.0 manual. Accessed: Nov. 26, 2026. [Online]. Available: https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/Custom-Pass-Injection-Points.html
14. Wikipedia contributors, "Half-precision floating-point format," Wikipedia. Accessed: Nov. 26, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Half-precision_floating-point_format
15. K. Moltenbrey, "A fine line," *Comput. Graph. World*, vol. 32, no. 11, Nov. 2009. Accessed: Nov. 26, 2026. [Online]. Available: https://cgw.com/Publications/CGW/2009/Volume-32-Issue-11-Nov-2009-/A-Fine-Line.aspx
