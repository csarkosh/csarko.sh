---
description: A Rust port of a game's terrain maths ran twice as fast in a benchmark and matched to the bit, yet only 1.09 times in place. How to tell before you port.
published: 2026-11-21
categories: Worlds and terrain, Rendering, Tooling
project: day-hike
pill: See the mountain in Day Hike
project-line: The game measured here is Day Hike, a co-op horror game that runs in your browser. Its mountain is computed from a seed by the terrain maths this doc ported to Rust, and its bark is decoded by the WebAssembly the game does ship.
closing: Open Day Hike and look at the ground under your feet and the bark on the nearest trunk. As of Nov 21, 2026, the ground is computed by the game's TypeScript, which the Rust kernel of sections 1 to 3 matches to the bit but does not replace, and the bark was decoded by the WebAssembly transcoders of section 5, in a worker beside the page.
asks: When is WebAssembly worth it for speed in the browser?
related: streaming-a-procedural-world-in-the-browser, webgpu-vs-webgl2, profiling-a-phone-game-over-wi-fi
---
# When WebAssembly is worth it in the browser

**Question:** You have hot code in a browser app or game, maths that runs thousands of times a frame, and you wonder whether moving it to WebAssembly will make it faster. When is that worth it, and how can you tell before you port it?

**Short answer:** It pays when the hot code is plain arithmetic over arrays of numbers, each call does a lot of work, and that code is a large share of the time, or when a mature C, C++ or Rust library already does the job, such as a texture codec. Before porting, profile: twice as fast saves half that share and no more. Then write the JavaScript without an object per call, which often closes much of the gap, and measure the port in place.

**What that leaves open:** The test case is a browser game's terrain maths. Ported to Rust and compiled to WebAssembly, it returned the same bits on four browser engines and ran about twice as fast in a benchmark, yet wired into the game it was 1.09 times as fast, and as of Nov 21, 2026 it is still switched off. The game's renderer has changed since that measurement, so the verdict may be stale, and we have not measured it again. By the end you can run the same checks on your own code.

The figure sets the benchmark beside the measurement in place. They come from different machines, named on the figure, so read each bar as a ratio to the game's TypeScript on the same machine, and look at how far the last bar falls short of the dashed line.

![Three horizontal bars of speed against the game's TypeScript. Benchmark on a MacBook Air M4 in headless Chrome 157: TypeScript with no object made per call 1.56 times, Rust in WebAssembly one call a sample 2.05 times. In the game on a cloud Windows machine in Chrome: 1.09 times. A dashed line marks 1.5 times, the bar set for switching it on.](speedups.svg "In a benchmark the Rust port ran a terrain sample 2.05 times as fast as the game's TypeScript, and TypeScript with no object made per call reached 1.56; wired into the game one call a sample, it was 1.09 times as fast, under the 1.5 the game had asked for.")

**In numbers:**

- **2.05 times** as fast per terrain sample, Rust in WebAssembly against the game's TypeScript, with **0 of 150,000** samples different ([section 1](#half-the-time-a-sample-and-the-same-bits)).
- **2.0 ns** to call into WebAssembly from JavaScript, against about **300 ns** of work in a sample: the crossing was not the cost ([section 1](#half-the-time-a-sample-and-the-same-bits)).
- **1.09 times** in place, against the **1.5** set in advance, so the port was never switched on ([section 3](#in-place-1-09-times-why-the-port-is-still-off)).
- **598 KB** of WebAssembly ships in the game, all of it someone else's texture transcoders ([section 5](#where-webassembly-does-ship-598-kb-of-texture-transcoders)).

## 1. Half the time a sample, and the same bits

This section describes Day Hike as of Nov 21, 2026. Its world has no map file. The ground is computed from the hike's seed wherever something asks for it: noise makes a broad uplift, warps it, adds relief, then erodes the ridges and lays loose rock at the foot of steep faces. Every peer in a co-op hike computes the same mountain for itself, so the ground never crosses the network. One terrain sample, a height and its slope in two directions, is the game's hottest maths: it runs for the collision under each player, for every ring of terrain the renderer streams, and for the forest and ground cover that read the slope.

On Nov 13, 2026 we ported that pipeline to Rust, statement for statement, compiled it to WebAssembly, and timed it against the game's own TypeScript on a 256 by 256 grid at 1 m spacing. The rounds were interleaved and the results are medians, taken on a MacBook Air M4 under Node 22 and headless Chrome 157. A laptop doing other work is never quiet enough for an absolute time to mean much, so read the last column, not the nanoseconds.

| Chrome 157, MacBook Air M4 | ns a sample | Times as fast |
|---|---|---|
| The game's TypeScript | 626 | 1.00 |
| TypeScript with no object made per call | 401 | 1.56 |
| Rust in WebAssembly, one call a sample | 305 | 2.05 |
| Rust in WebAssembly, one call a grid | 310 | 2.02 |
| Rust in WebAssembly, one call a grid, height only | 186 | 3.36 |

Node gave the same order, 2.13 times for a call a sample. Over three seeds, none of the 150,000 samples differed from the TypeScript's in height or in either slope.

Two rows matter most. The second: the game's TypeScript returns a small object from each noise call, and a version that writes into one preallocated array instead got 1.56 of the 2.05, with no new language, no build step and no WebAssembly. And the last: computing only the height, which skips the slopes, nearly doubled the speed again. What a call computed mattered more than how it was called.

The boundary itself was cheap. In the same Chrome, a call from JavaScript into an exported WebAssembly function took 2.0 ns, less than a call between two JavaScript functions at 3.4 ns, and a call from WebAssembly out to a JavaScript function took 7.2 ns. Against about 300 ns of work in a sample, the crossing is under 1%. That fits what engine teams have reported since 2018, when Firefox made calls between the two faster than calls between JavaScript functions that the engine has not inlined [1].

A faster port is only safe in a co-op game if it is also exactly equal. That was the part we expected to be hard.

## 2. The same bits on four engines, by one arithmetic rule

Peers never send each other the ground. If two browsers computed a hill a millionth of a millimetre apart, a player predicting their own movement would disagree with the host. So the simulation keeps a rule, held by a test that reads its source: it may add, subtract, multiply, divide, floor and take square roots, and nothing else. No sine, no cosine, no `Math.pow`. Where it needs the sine of an angle, it uses a polynomial of its own.

The rule exists because JavaScript does not fix those functions. The ECMAScript specification defines addition and the other basic operations by IEEE 754 double-precision arithmetic [2], defines `Math.sqrt` as the exact square root rounded to a double, and says of `sin`, `cos`, `exp`, `pow` and the rest that their behaviour "is not precisely specified", leaving the choice of approximation to each engine [3]. We checked: digests of 14 `Math` functions over 4,000 inputs differed between Chrome and Firefox on the same Mac; `pow` agreed between those two but not with Safari; `sqrt` was the same in all three.

WebAssembly makes the same promise for the same operations. Its floating point follows IEEE 754, rounds to nearest with ties to even, and its square root is the true root rounded [4]. Its exception is the sign and payload of a NaN result, which the specification leaves open [4]; the kernel makes no NaN from finite input, and its tests would catch one, since they compare doubles with `Object.is`. WebAssembly has no sine of its own, so code that needs one ships its own, the same on every engine. Relaxed SIMD is the deliberate exception, a set of vector instructions allowed to give different results on different platforms [5].

So the rule that kept browsers agreeing in TypeScript is also what made a bit-exact port possible. The Rust crate does the same operations in the same order, turns seeds into 32-bit integers exactly where JavaScript does, and holds none of its own settings: the pipeline's tunable numbers are written into it from the same record the game's level id is made from. The result was one digest of 2,092,608 doubles, the kernel's equal to the TypeScript's, on Chrome 157, Firefox 160 and Safari 26.6.2 on the Mac and Chrome 157 on an Android 10 phone. On that phone the check took 620 ms in TypeScript and 273 ms in Rust, in one run.

The kernel went into the repository on Nov 14, 2026 ([the commit](https://github.com/csarkosh/game-dayhike/commit/2fc00c37)). It was proven faster and exactly equal. The next step was to switch it on.

## 3. In place, 1.09 times: why the port is still off

The same day, the kernel was wired in where the game samples the terrain, one call a sample, with the TypeScript kept for a browser without WebAssembly ([the unmerged commit](https://github.com/csarkosh/game-dayhike/commit/05f58714)). Its tests compared samples, collision chunks, terrain rings and steep-face patches byte for byte with the TypeScript's, and the game's test workflow passed. The bar for merging it had been written into the plan before: in place, at least 1.5 times the TypeScript, and the field code's share of the main thread down by at least a third.

It was measured on the game's test machine, a cloud Windows computer (an AWS g4dn.xlarge, with an NVIDIA T4 GPU) running Chrome: a 30 second sprint through the forest at medium settings under a CPU profile, the build without the kernel and with it in the order A, B, B, A. The game then drew with Babylon.js 9.18.

| 30 s sprint, cloud Windows machine | Frame mean | Field code on the main thread | Share of busy time |
|---|---|---|---|
| A, TypeScript | 22.56 and 22.41 ms | 6.05 and 5.82 ms a frame | 26.0% and 25.1% |
| B, the Rust kernel | 22.44 and 21.73 ms | 5.88 and 5.56 ms a frame | 25.4% and 24.7% |

The kernel's 2.0 s of WebAssembly replaced about 2.2 s of TypeScript: 1.09 times as fast. The share fell by a fortieth, not a third. By the rule set beforehand the wiring was not merged, and as of Nov 21, 2026 nothing in the game calls the kernel. It sits in the repository, built, and tested against the TypeScript on every change.

Why 1.09 and not 2? The note written that day gives two reasons. In place, each sample is its own call that returns three numbers through memory and then builds the object the rest of the game expects, so the cost the benchmark's fast TypeScript had removed came back on the JavaScript side. And the coastal terrain the game plays on wraps each sample in more TypeScript, the coast, the road and the lakes' bowls, which the kernel does not cover, so only part of the field code moved. What the note does not settle is how much the machine mattered: the benchmark ran on an Apple M4 and the sprint on the cloud machine's processor, and the benchmark was never repeated there.

The ceiling decided the rest. The field code was about a quarter of the sprint's busy main thread, about 6 ms of a 22 ms frame. Had all of it run twice as fast, the frame would have gained about 3 ms. We kept the kernel off, with an order for later: if the field code still bound the frame once the renderer had moved, first make the TypeScript allocation-free, and only then try a kernel that samples whole grids or chunks, the coast included.

That was a verdict under one renderer. The renderer changed five days later.

## 4. Since then: a lighter renderer, and a phone that waits on the terrain

This section describes Day Hike as of Nov 21, 2026. Section 3's numbers were taken when Babylon.js took about half of the main thread's busy time: in a profile of a 60 second sprint on the same machine, on a build of Nov 9, Babylon's code was 48 to 52% of it. On Nov 19 the game moved to Babylon Lite, a smaller renderer that draws with WebGPU only. In the draw benchmark of section 6, Lite spent 0.16 µs of main thread a draw against 2.35 µs for Babylon as the game had set it. With most of the renderer's share gone, the field code is a larger part of what is left, so the premise of the 1.09 verdict, a quarter of the frame, is likely stale. We have not measured the kernel against the new renderer.

The phone says the same more sharply. On a Pixel 9 after the switch, in the main thread's busiest stretches (over 30 ms), 57% of the time went to sampling the terrain, 21% to handing results to the GPU, 13% to building arrays and 4% to collecting garbage, as [the streaming doc](/research/streaming-a-procedural-world-in-the-browser#what-a-share-cannot-cut-and-what-a-worker-could-take) reports. That is all of the terrain's sampling, not only the part the kernel covers.

The fix that shipped for the phone did not make the maths faster. It spread the same work over frames, each slice ended by the clock, and cut the phone's slow frames by 98% across four views. The next step named there is a worker, a second thread beside the page, which takes sampling off the page's thread without changing its speed. A worker and the kernel are not rivals: the kernel loads the same way on a page, in a worker and under Node, and could run in one. But neither the kernel in a worker nor the allocation-free TypeScript has been built or measured.

So the honest state is this. WebAssembly won the benchmark, lost the first measurement in place on a machine where the maths was a quarter of the frame, and has not been tried on the two setups where it may matter more.

## 5. Where WebAssembly does ship: 598 KB of texture transcoders

The WebAssembly Day Hike runs is not ours. The forest's trunks wear four scanned bark sets and a moss, each a colour map, a normal map and a map of occlusion and roughness: 27 files and 67 MB in all, stored as KTX2, a container for GPU textures, in UASTC, a compressed form built to be turned quickly into the formats GPUs read directly, with zstd compression over it. A GPU cannot sample UASTC. Something has to turn it, on the player's machine, into the block-compressed format that GPU takes: BC7 on most desktops, ASTC on phones and Apple's GPUs.

That something is the Basis Universal transcoder, C++ compiled to WebAssembly by its authors [6], vendored from Babylon's KTX2 decoder package (version 9.18.0) and served from the game's own host, so nothing is fetched from a CDN. Babylon Lite runs it in a pool of workers: the page hands over a file's bytes and takes back the GPU-ready levels. The files it ships:

| File | Bytes | What it does |
|---|---|---|
| `uastc_bc7.wasm` | 14,650 | UASTC to BC7 |
| `uastc_astc.wasm` | 12,212 | UASTC to ASTC |
| four `uastc_r8`, `rg8` and `rgba8` files | 86,029 | UASTC to uncompressed pixels, for a GPU with neither |
| `zstddec.wasm` | 29,232 | the zstd layer |
| `msc_basis_transcoder.wasm` | 455,582 | the general transcoder, for Basis's other form, ETC1S |
| two JavaScript files | 116,501 | the decoder, and the general transcoder's glue |

What it buys is GPU memory, and work not done on the page. A 2,048 by 2,048 map with its smaller levels is about 22 MB as plain 8-bit RGBA and about 5.6 MB in BC7 or 4 by 4 ASTC, which store 8 bits a pixel [6]. Basis Universal calls the step from UASTC to ASTC and BC7 "particularly fast and simple" [6]. This is the case WebAssembly was made for: a mature native library, pure computation on bytes, a lot of work per call, run off the main thread.

What it costs, and what we have not measured. The general transcoder is three quarters of the bytes, and every one of the game's KTX2 files is UASTC, which the decoder hands to the small transcoders; we have not checked a session's network log to confirm the large one is never fetched. We have not timed the transcode on a desktop or a phone, nor measured the GPU memory the bark takes. And vendoring has its own price: the files are pinned to one package version and are copied again by hand when it moves.

## 6. Drawing from WebAssembly: no faster than JavaScript

The last probe asked whether a renderer written in Rust would draw more cheaply. One scene was drawn by every candidate: 4,000 boxes, each with its own buffers and transform, 16 materials, two lights, at 1280 by 720, in headless Chrome 157 on the MacBook Air M4, 240 timed frames after 90 warm ones, three interleaved rounds. The time is the main thread's inside the frame call; the GPU's own work is not in it.

| 4,000 draws | Still, µs a draw | Moving, µs a draw |
|---|---|---|
| Babylon.js 9.18, as the game had set it | 2.35 | 2.93 |
| Babylon Lite 1.39.3 | 0.16 | 0.75 |
| WebGPU by hand in JavaScript, encoded every frame | 0.25 | 0.29 |
| wgpu 30 in Rust, in WebAssembly, encoded every frame | 0.28 | 0.34 |
| WebGPU by hand, one render bundle | 0.01 | 0.08 |
| wgpu in WebAssembly, one render bundle | 0.02 | 0.09 |

wgpu, the Rust graphics library that is also Firefox's WebGPU implementation, reaches the browser's WebGPU through JavaScript bindings [7]. So every WebGPU call from WebAssembly takes one more step than the same call from JavaScript, and it was 12 to 17% slower a draw when the draws were encoded each frame. What made drawing cheap was recording the draws once, as a render bundle, in either language, and a renderer that does less bookkeeping a draw. The change Day Hike made was from Babylon.js to Babylon Lite, both JavaScript. A whole engine in Rust was not measured.

## 7. What WebAssembly is good at in 2026, and what it is not

Our case is one game. The wider picture, from the engine teams' and browser makers' own writing:

**Near native, not native.** WebAssembly arrives already typed and compiled to a low-level form, so its speed is predictable without warm-up. On the SPEC CPU benchmarks in 2019 it ran on average 45% slower than native code in Firefox and 55% slower in Chrome [8]; engines have improved since, and we found no newer study of that scale. The strongest public results are ports of large native codebases: Figma's C++ editor loaded more than three times faster after moving from asm.js to WebAssembly in 2017 [9], and Photoshop came to the web from its C++ code, leaning on threads and SIMD [10].

**Not a way to reach the page.** WebAssembly cannot touch the DOM; it calls JavaScript, which calls the web API [11]. GPU calls go the same way, as section 6 found.

**Garbage-collected languages arrived.** WasmGC, garbage-collected objects inside WebAssembly, shipped in Chrome 119 in late 2023 with Firefox 120 following [12], and in Safari 18.2 in December 2024 [13], so Kotlin, Dart and Java compile to it without shipping their own collector. Google Sheets moved its Java calculation engine to it: the first build was about twice as slow as the JavaScript it replaced, and after tuning about twice as fast [14]. In 2025 V8 added speculative inlining for WebAssembly, worth 1.59 times on Dart microbenchmarks and 1 to 8% on larger programs [15]. None of this changes much for C, C++ or Rust, which manage their own memory.

**SIMD everywhere, threads behind headers.** Fixed 128-bit SIMD shipped in Chrome 91 and Firefox 89 [16] and in Safari 16.4 [17]. Relaxed SIMD is in Chrome and Firefox and behind a flag in Safari, per the WebAssembly project's feature data as of Nov 21, 2026 [18]. Threads need shared memory, which browsers grant only to a page made cross-origin isolated by two response headers, `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` [19]; Emscripten's threaded builds "will not work in deployed environment unless these headers are correctly set" [20]. The same headers limit what the page can embed from other sites.

**Memory grows and never shrinks.** A 32-bit WebAssembly memory tops out at 4 GB, which V8 allowed from 2020 [21]. 64-bit memories shipped in Chrome 133 and Firefox 134; SpiderMonkey's team measured them 10% to more than 100% slower, for their bounds checks, and advises them only for more than 4 GB [22]; Safari has them behind a flag [18]. A memory grows in 64 KiB pages, has no way to shrink, and every growth detaches the JavaScript views on it [23], so code that reads results through a typed array must take a new view after any growth. Day Hike's kernel never grows its memory, so its views stay valid for its life.

**The standard caught up.** WebAssembly 3.0, finished in September 2025, took in 64-bit memory, multiple memories, garbage collection, typed references, tail calls, exception handling, relaxed SIMD and string functions built into the JavaScript interface [24]. JSPI, which lets WebAssembly code written for blocking calls wait on a JavaScript promise, is listed for Chrome 137 and Firefox 153 in the same feature data [18].

**The tooling moved.** The Rust WebAssembly working group's GitHub organisation was wound down in 2025: wasm-bindgen went to a new organisation with new maintainers, and the other tools were archived or handed to their maintainers [25]. Day Hike's kernel uses none of them: plain exported functions over one memory, built by Cargo with a pinned compiler, 24,093 bytes. The built module is committed as base64 text inside a TypeScript file, so the game's builds, tests and dev server need no Rust, a page compiles it synchronously with no fetch, and a check fails when the committed module is not what the sources build to. For a large module the usual advice runs the other way: stream it with `WebAssembly.instantiateStreaming` [26], which lets V8 compile it while it downloads [27].

**Debugging is better than it was, and still behind JavaScript's.** Chrome's DevTools can show C and C++ variables in WebAssembly from DWARF debug information, though in 2020 it could not evaluate more complex expressions [28]; we found no primary source on the state for Rust. We needed none: the TypeScript is the kernel's oracle, and a test compares every double of every function with it, so a mistake shows as the first differing bit, not as a session in a debugger.

## 8. Six questions to ask before you port

From our case and the sources, in the order that saves the most work:

1. **What share of the time is it?** Profile in place first. Code that is a quarter of a frame, made twice as fast, saves an eighth of the frame. Our ceiling was about 3 ms of 22.
2. **Is the JavaScript allocation-free?** An object made per call is often most of the gap. Ours closed 1.56 of 2.05 with no new language.
3. **Can one call do a lot of work?** A grid, a chunk, a buffer. A call that does little leaves the cost of preparing and unpacking it on the JavaScript side, though the crossing itself is a few nanoseconds.
4. **Would a worker do instead?** If the trouble is a busy main thread rather than total work, a worker moves the work off it in the language it is already in. The two also combine.
5. **Is there a native library that already does it?** A codec, a physics engine, a transcoder: that is where WebAssembly is strongest, and the port is someone else's.
6. **Can you afford the toolchain?** A compiler to pin, a build step, a bundle that grows, threads that need isolation headers, memory that never shrinks and debugging weaker than JavaScript's. Keep the JavaScript as an oracle and test the port against it.

If the answers are a large share, already allocation-free, whole batches a call and still too slow in a worker, port it, and measure the port in place against a bar you set before you see the result. Setting the bar first is what kept us from merging a 1.09.

## 9. What we have not measured

- The kernel against Babylon Lite: the field code's share of a desktop sprint since Nov 19, 2026, with and without it.
- The kernel in a worker, or one that samples whole grids or chunks with the coast's composition inside it.
- The allocation-free TypeScript in place.
- The benchmark on the cloud machine's processor, which would separate the machine from the shape of the calls.
- Anything on an iPhone: the four-engine check had Safari on a Mac, and no iPhone.
- The KTX2 transcode's time, which transcoders a session fetches, and the bark's GPU memory.
- A whole engine in Rust, which the draw probe did not cover.

## Sources

1. L. Clark, "Calls between JavaScript and WebAssembly are finally fast," Mozilla Hacks, Oct. 8, 2018. Accessed: Nov. 21, 2026. [Online]. Available: https://hacks.mozilla.org/2018/10/calls-between-javascript-and-webassembly-are-finally-fast-%f0%9f%8e%89/
2. Ecma International, "ECMAScript Language Specification: The Number Type (6.1.6.1)," ECMA-262. Accessed: Nov. 21, 2026. [Online]. Available: https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html
3. Ecma International, "ECMAScript Language Specification: Function Properties of the Math Object (21.3.2)," ECMA-262. Accessed: Nov. 21, 2026. [Online]. Available: https://tc39.es/ecma262/multipage/numbers-and-dates.html
4. WebAssembly Community Group, "Numerics," WebAssembly Specification, release 3.0. Accessed: Nov. 21, 2026. [Online]. Available: https://webassembly.github.io/spec/core/exec/numerics.html
5. WebAssembly Community Group, "Relaxed SIMD proposal: Overview," GitHub repository. Accessed: Nov. 21, 2026. [Online]. Available: https://github.com/WebAssembly/relaxed-simd/blob/main/proposals/relaxed-simd/Overview.md
6. Binomial LLC, "basis_universal README," GitHub repository, v2.5. Accessed: Nov. 21, 2026. [Online]. Available: https://github.com/BinomialLLC/basis_universal/blob/master/README.md
7. F. Beaufort and C. Wallez, "Capturing the WebGPU ecosystem," Chrome for Developers, Nov. 9, 2023, updated Sep. 16, 2025. Accessed: Nov. 21, 2026. [Online]. Available: https://developer.chrome.com/blog/webgpu-ecosystem/
8. A. Jangda, B. Powers, E. D. Berger, and A. Guha, "Not So Fast: Analyzing the Performance of WebAssembly vs. Native Code," presented at USENIX Annu. Tech. Conf., Renton, WA, USA, Jul. 2019. Accessed: Nov. 21, 2026. [Online]. Available: https://www.usenix.org/conference/atc19/presentation/jangda
9. E. Wallace, "WebAssembly cut Figma's load time by 3x," Figma Blog, Jun. 8, 2017. Accessed: Nov. 21, 2026. [Online]. Available: https://www.figma.com/blog/webassembly-cut-figmas-load-time-by-3x/
10. N. Al-Shamma and T. Nattestad, "Photoshop's journey to the web," web.dev. Accessed: Nov. 21, 2026. [Online]. Available: https://web.dev/articles/ps-on-the-web
11. MDN contributors, "WebAssembly concepts," MDN Web Docs. Accessed: Nov. 21, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts
12. A. Zakai, "A new way to bring garbage collected programming languages efficiently to WebAssembly," V8 Blog, Nov. 1, 2023. Accessed: Nov. 21, 2026. [Online]. Available: https://v8.dev/blog/wasm-gc-porting
13. WebKit, "WebKit Features in Safari 18.2," WebKit Blog, Dec. 9, 2024. Accessed: Nov. 21, 2026. [Online]. Available: https://webkit.org/blog/16301/webkit-features-in-safari-18-2/
14. M. Thomas and T. Steiner, "Google Sheets: WasmGC," web.dev case study. Accessed: Nov. 21, 2026. [Online]. Available: https://web.dev/case-studies/google-sheets-wasmgc
15. D. Lehmann and M. Liedtke, "Speculative Optimizations for WebAssembly using Deopts and Inlining," V8 Blog, Jun. 24, 2025. Accessed: Nov. 21, 2026. [Online]. Available: https://v8.dev/blog/wasm-speculative-optimizations
16. V8, "Fast, parallel applications with WebAssembly SIMD," V8 Features, Jan. 30, 2020, updated Nov. 6, 2022. Accessed: Nov. 21, 2026. [Online]. Available: https://v8.dev/features/simd
17. WebKit, "WebKit Features in Safari 16.4," WebKit Blog, Mar. 27, 2023. Accessed: Nov. 21, 2026. [Online]. Available: https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
18. WebAssembly Community Group, "features.json," WebAssembly website, GitHub repository. Accessed: Nov. 21, 2026. [Online]. Available: https://github.com/WebAssembly/website/blob/main/features.json
19. E. Kitamura, "Use COOP and COEP to set up a cross-origin isolated environment," web.dev, Apr. 13, 2020, updated Jun. 21, 2022. Accessed: Nov. 21, 2026. [Online]. Available: https://web.dev/articles/coop-coep
20. Emscripten Contributors, "Pthreads support," Emscripten Documentation. Accessed: Nov. 21, 2026. [Online]. Available: https://emscripten.org/docs/porting/pthreads.html
21. A. Haas, J. Kummerow, and A. Zakai, "Up to 4GB of memory in WebAssembly," V8 Blog, May 14, 2020. Accessed: Nov. 21, 2026. [Online]. Available: https://v8.dev/blog/4gb-wasm-memory
22. B. Visness, "Is Memory64 actually worth using?," SpiderMonkey Blog, Jan. 15, 2025. Accessed: Nov. 21, 2026. [Online]. Available: https://spidermonkey.dev/blog/2025/01/15/is-memory64-actually-worth-using.html
23. MDN contributors, "WebAssembly.Memory.prototype.grow()," MDN Web Docs. Accessed: Nov. 21, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/grow
24. A. Rossberg, "Wasm 3.0 Completed," WebAssembly News, Sep. 17, 2025. Accessed: Nov. 21, 2026. [Online]. Available: https://webassembly.org/news/2025-09-17-wasm-3.0/
25. A. Crichton, "Sunsetting the rustwasm GitHub org," Inside Rust Blog, Jul. 21, 2025. Accessed: Nov. 21, 2026. [Online]. Available: https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org
26. MDN contributors, "WebAssembly.instantiateStreaming()," MDN Web Docs. Accessed: Nov. 21, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static
27. C. Backes, "Liftoff: a new baseline compiler for WebAssembly in V8," V8 Blog, Aug. 20, 2018. Accessed: Nov. 21, 2026. [Online]. Available: https://v8.dev/blog/liftoff
28. I. Stepanyan, "Debugging WebAssembly with modern tools," Chrome for Developers, 2020. Accessed: Nov. 21, 2026. [Online]. Available: https://developer.chrome.com/blog/wasm-debugging-2020
