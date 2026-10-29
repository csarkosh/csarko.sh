---
description: AWS, Azure and GCP price a T4 GPU within 3%. Fanning out shader recording and tests, not switching clouds, cuts a 4.5-hour graphics change to about 30 minutes.
published: 2026-10-29
categories: Tooling, Distributed systems, Rendering
related: parallel-gpu-browser-rigs, webgpu-vs-webgl2
---
# Cloud rigs for graphics work: fan out, not a cheaper cloud

**Question:** A graphics change to a browser game, one that changes which shaders it compiles, took 4 h 24 min from its code commit to a passing CI run, and most of that was waiting. Would GCP, Azure, Modal or another provider beat the rented AWS GPU machine on price or start-up time without losing measurement quality, and what would make the change faster?

**Short answer:** No provider beats AWS on demand for this machine. AWS and Azure both charge $0.526 an hour for a Linux T4 and about $0.71 for Windows, GCP is within 3 %, and AWS starts fastest. The time went to tools running one after another on one busy laptop: 34 [shader corpus](#term "The set of exact shader texts the game's pages ask the GPU to compile, recorded from real pages and translated ahead of time so a first visit finds them ready.") recordings in a row, a local test gate that never finished, and a [WGSL map](#term "The file of shaders translated ahead of time to WebGPU's shading language, one for each quality tier, which the game downloads and which must stay under a 10 MiB ceiling.") size ceiling that only CI checks. Recording on several machines at once, running the tests on GitHub's free runners and checking the map size before the commit would bring the same change to about 25 to 35 minutes, for about $50 to $60 a month.

![Horizontal bars of commit-to-live time: 4 h 27 min as it ran, about 1 h 50 min on a quiet machine, 25 to 35 min under the recommended pipeline](commit-to-live.svg "The shadow-map change took 4 h 27 min of working time from code commit to live. The same steps one after another on a quiet machine would take about 1 h 50 min; run side by side, about 30.")

**In numbers:**

- **$0.526 an hour** for a Linux T4 on both AWS and Azure, and **$0.715 against $0.71** for Windows ([section 2](#aws-is-neither-slower-nor-dearer-on-demand-for-a-t4)).
- **34 recordings, one at a time:** about 54 minutes of work that took 2 h 32 min, with two crashes and a 1.5-hour hang ([section 1](#4-h-24-min-to-a-green-ci-run-most-of-it-waiting-on-tools)).
- **11.5 MB** high-tier map against a 10 MiB ceiling, caught only by a 14-minute CI run ([section 1](#4-h-24-min-to-a-green-ci-run-most-of-it-waiting-on-tools)).
- **$0 and 5 to 7 minutes** for the test workflow on GitHub's free public-repository runners at 10 to 16 shards ([section 4](#the-test-gate-is-free-and-parallel-on-github-most-faster-runners-need-an-organisation)).
- **25 to 35 minutes** from code commit to live under the recommended pipeline ([section 6](#about-30-minutes-from-commit-to-live-for-about-50-to-60-a-month)).
- **$599** for a Mac mini, which pays for itself in about four months against renting Apple silicon ([section 5](#apple-silicon-work-has-no-cloud-answer-cheaper-than-a-second-mac)).

## 1. 4 h 24 min to a green CI run, most of it waiting on tools

The worked example is Day Hike, a co-op hiking game in the browser built on Babylon.js, whose source is public [1]. On its WebGPU path the game ships its shaders translated ahead of time: a recording tool loads 17 pages at two quality tiers in Chrome, saves every GLSL stage the pages ask for (the corpus, keyed by a hash of each stage's exact text), and the build translates the corpus to WGSL and packs one map for each tier, with a ceiling of 10,485,760 bytes. On Oct 28, 2026, a change dropped the sun's shadow map on the medium and high tiers. That changes which shaders the game compiles, so the corpus had to be recorded again and the map rebuilt.

Every step ran on one M4 MacBook Air except the CI workflow, which is started by hand. As the change ran, in Eastern time:

| Time | Step |
|---|---|
| Oct 28, 17:45 | Code commit |
| 17:44 to 18:25 | 25 of the 34 recordings, about 98 s each |
| 18:25 to 20:04 | The recorder hung on one page for about 1.5 hours and crashed twice |
| 20:03 to 20:16 | The last 9 recordings |
| 20:17 | Recording commit |
| about 20:20 to 21:35 | The local test gate: 75 minutes at a load average of 86, unfinished, stopped |
| 21:36 to 21:50 | First CI run: fails, the high tier's map is 11.5 MB |
| 21:54 | A commit retires the stages that sampled the dropped shadow, and the map is under the ceiling |
| 21:55 to 22:09 | Second CI run: green |
| Oct 29, 08:37 to 08:40 | Deploy and verify, after an overnight wait for approval |

So the change took 4 h 24 min of working time to a green CI run and 4 h 27 min with the deploy. On the project's own quiet-machine numbers, the same steps run one after another come to about 1 h 50 min: the recording 53 minutes (17 pages, 2 tiers, 90 s each), the local gate "half an hour or more" by its own documentation, the CI workflow about 15 minutes and the deploy a few. The difference between 1 h 50 min and 4 h 27 min is friction, and three tools made it.

- **The recorder runs 34 independent jobs one at a time and cannot fail a page.** `tools/wgsl/record.mjs` loops over tiers and pages and starts one Chrome at a time. Its small DevTools client settles a request only when the matching reply arrives and has no handler for the socket closing, so a Chrome that dies mid-request leaves a promise that never settles and Node exits with code 13, "unsettled top-level await" (inferred from the code, not reproduced). That fits the two crashes and the hang.
- **The local gate competes with everything else on the laptop.** It runs typecheck, lint and three test suites in sequence; with the recorder and other work on the same machine it ran 75 minutes and never finished.
- **Nothing local checks the map's size.** The ceiling is checked by the production build, which the CI workflow runs and the local gate does not. The overflow was foreseeable: on Oct 27, 2026, the high map stood at 9,815,440 bytes, 93.6 % of the ceiling, before the change added 139 stages of about 9,700 bytes each (inferred from the map's size and the per-stage figure).

| Step | Where it ran | Quiet-machine number | As it ran, Oct 28 | What it needs | Why it is serial |
|---|---|---|---|---|---|
| Frame-time measurements, flicker captures | the Air, windowed Chrome | about 1 min a page load | tens of minutes | Apple's Metal GPU at the device pixel ratio players use, with nothing else drawing | the problem: another page drawing on the same GPU voids every row |
| Code, named tests, docs | the Air | | fast | Node | not serial |
| Corpus recording | the Air, 34 Chromes one after another | 53 min | 2 h 32 min with two crashes and a hang | a WebGPU adapter the page accepts, a base URL | the tool: pages are independent files, merged afterwards |
| Map build and ceiling | the CI build job and the deploy | 35 s on an M4 and 54 s on a runner for 421 stages; unmeasured for the 1,098 as of Oct 29, 2026 | the high map refused at 11.5 MB | Node and worker threads, no GPU | already threaded |
| Local gate | the Air | half an hour or more | 75 min, unfinished | Node, Git LFS, a quiet machine | the tool: typecheck, lint, then three suites |
| CI workflow | GitHub, 9 jobs | about 15 min | 14 min (failed), 14 min (green) | nothing local | already parallel |
| Wall-clock tests | the Air | minutes | minutes; one file flaky under load | a quiet machine | one worker by design |
| Deploy and verify | the Air (Docker, gcloud) | minutes | 3 min, 93 checks passed | Docker, gcloud, Git LFS | server then client, by choice |

Two facts frame the rest. The two rented Windows GPU machines, an AWS `g4dn.xlarge` with an NVIDIA T4 and a GCP `g2-standard-4` with an L4, have only ever measured frame times: as of Oct 29, 2026, no run, doc or script records one recording the corpus, running tests or building. And the push gate has a hook for an outside runner (`DAYHIKE_GATE`, "the same commands, and the client's build as the deploy builds it, on other machines") that nobody has built a runner for. The [Oct 22 rig study](/research/parallel-gpu-browser-rigs) recommended N stopped copies of the AWS Windows machine for frame-time rounds, and most of what it proposed shipped by Oct 24, 2026: up to 32 copies from one sysprepped image, a queue over their tunnels, an idle watchdog. Its rule of one experiment per GPU is a rule for timing; it does not bind a recording of shader text.

## 2. AWS is neither slower nor dearer on demand for a T4

The question assumed AWS was the slow, expensive choice, so the table puts the rigs' own prices beside what other providers charge for the same GPU class, as observed on Oct 29, 2026, from vendor pages and, where those render only with script, price aggregators.

| Machine (US region) | GPU | Linux on demand, $/h | Windows on demand, $/h | Spot or preemptible, $/h | Billing | Sources |
|---|---|---|---|---|---|---|
| AWS `g4dn.xlarge`, 4 vCPU | T4 16 GB | 0.526 | **0.715** with its IPv4 address (the rig's own figure from AWS's Price List API, Sep 25, 2026) | 0.26 to 0.29 | per second, 60 s minimum | [2], [3], [4] |
| Azure `NC4as_T4_v3`, 4 vCPU | T4 16 GB | 0.526 | **0.71** | 0.15 to 0.18 (observed July 2026) | per whole minute | [5], [6], [7] |
| GCP `n1-standard-4` with a T4 | T4 16 GB | 0.19 + 0.35 = 0.54 (summed) | plus $0.046 a vCPU-hour for Windows and $0.20 for the virtual workstation licence | T4 spot "60 to 91 % off" | per second, 1 min minimum | [8], [9] |
| GCP `g2-standard-4` (the GCP rig) | L4 24 GB | 0.7068 | **1.0972** with the workstation and Windows licences | 0.423 (licences not discounted) | per second | [10] |
| AWS `g6.xlarge` | L4 24 GB | 0.805 | 0.9888 | 0.56 to 0.62 | per second | [11] |
| OCI `VM.GPU.A10.1`, 15 OCPU | A10 24 GB | 2.00 | not found | 1.00 (a flat 50 %) | | [12], [13] |

On the T4, the GPU both rigs' calibration depends on, **AWS and Azure charge the same $0.526 for Linux and about the same $0.71 for Windows**, and GCP's T4 lands within 3 % before its licences. The Windows premium is the same $0.18 an hour for 4 vCPU on both. On the L4, GCP is 12 % cheaper than AWS on demand and 31 % cheaper on spot; on a spot T4, Azure is about half of AWS. So the assumption is false for the machine the project runs, mildly true for the L4, and strongly true only for spot capacity, which is the wrong purchase for frame timing anyway: a two-minute reclaim notice on AWS, and 30 s on Azure and GCP [14], lands inside a 25-minute experiment. OCI has no T4 or L4 virtual machine at all, only an A10 at $2.00 an hour, with no GPU quota on a new tenancy and a support ticket that "typically takes a few days" [15]. Azure's GPU quota on developer plans has documented refusals, and a moderator's advice to ask one to three months ahead [16].

Start-up tells the same story. The one 2026 cross-cloud provisioning dataset found (ProvisioningIQ: Linux, create to provisioned, January to April 2026) puts **AWS fastest at about 34 s, Azure at about 74 s and GCP at about 139 s** [17]. Weight it lightly: its author built the tool, and its posts returned 404 on Oct 29, 2026, so the numbers come from the search index. The rig study's own measurements agree where they overlap: from stopped to Chrome answering, **AWS about 45 s and GCP 66 s**; from a public Windows image, about ten minutes on both; from a sysprepped image, 467 s on AWS and 55 s on GCP.

What *is* slower on AWS is housekeeping: a stop took **6 min 37 s** against GCP's 27 s, and an image **34 min 12 s** against 6 min 38 s. Those are the waits a person sits through when tearing a machine down or re-imaging it, which is likely where the impression came from. Neither is on the path of a graphics change: the rig's watchdog stops it after 15 idle minutes, and the image is made once. No hyperscaler ships a Windows image with NVIDIA's GRID driver installed. AWS points at Marketplace images and requires Sysprep for a custom one [18], GCP at a script that "runs for several minutes" [19], and Azure at a manual installer and a reboot [20]. So the ten-minute first boot is universal, and a sysprepped image of one's own is the answer to it.

Two of the AWS rig's costs would not change with the provider. **The Windows licence is about a quarter of the hourly bill**, and it is paid because Chrome on Windows draws through ANGLE on Direct3D 11 and Dawn on Direct3D 12 [21], [22], which is what Windows players run; Linux would give Vulkan under both, a different instrument. The one native-game comparison found puts Windows about 10 % ahead of Linux on the same NVIDIA card for DirectX titles and near parity for native Vulkan ones [23], and no WebGL or WebGPU comparison exists, so Linux numbers are a separate series, not a cheaper copy. **The other cost is the shape:** a whole machine for one Chrome, paid by the hour and idle while a page settles. For frame timing that shape is the measurement's precondition, and the rig study priced it at about $0.30 an experiment on AWS. For recording it is no precondition at all.

## 3. Shader recording can fan out, and three kinds of machine could hold it

Nothing in the recorder needs one page to finish before the next starts. Each recording owns its Chrome, a fresh profile, its own debugging port and its own output file, and the merge tool accepts any set of recordings (inferred from the code, not from a run). The page needs a WebGPU adapter that passes the game's limit checks, and the shadow drop lowered the one limit that mattered, `maxInterStageShaderVariables`, from 22 to the default 16. The map need not exist on the recording machine, since the page records a stage whether the map had it or not, so a recorder can load the live site or a preview channel and needs no dev server.

Sharing one GPU among several Chromes risks completeness, not correctness: a page that draws more slowly reaches fewer scene states in its fixed 90 s. So the first step, before any cloud, is one page per process with a time limit (which worked first time during the change) and three or four recordings at once on the Air. The cloud question is which other machines ask for the same GLSL text the Air does.

| Recording machine | WebGPU backend | Gets an adapter | Draws a canvas | Same stage text as the Air? | Parallelism | Cost of 34 recordings | Status |
|---|---|---|---|---|---|---|---|
| Copies of the Windows T4 rig (AWS, the existing image) | Dawn on Direct3D 12 | yes, on the game's own policy for Windows | yes, windowed | **unknown**: Direct3D 12's adapter features may differ from Metal's | up to 32 copies, a quota of 192; stopped to Chrome in 45 s | 10 copies for about 10 min, about 1.7 machine-hours, **about $1.20** (computed) | machine verified, text match not |
| A Linux NVIDIA container (Modal, RunPod, Cloud Run, Azure Container Apps) | Dawn on Vulkan | yes, with the unsafe-WebGPU and Vulkan flags and Dawn's adapter blocklist turned off [24], [25] | **not in headless Chrome**: three separate reports of blank WebGPU canvases; headed Chrome under Xvfb works [26], [27], [28] | **unknown, with one known gap**: `shader-f16` is missing on NVIDIA Linux below driver 615.71 [29], [30] | Modal Starter 10 GPUs; Cloud Run 3 L4s a region by default [31]; RunPod 5 workers by default [32] | Modal L4, 34 runs of 120 s: **about $0.91**, plus about $0.18 of CPU and memory, inside the $30 monthly Starter credit [33] | recipe partly verified by others, never on this game |
| Bare-metal Apple silicon (a Mac mini M4 at home, Scaleway, MacStadium) | Dawn on Metal, ANGLE on Metal | yes, windowed | yes | **the Air's own backend**; the mini's 10-core GPU against the Air's 8 changes speed, not text | one Chrome per Mac, or a few sharing a GPU | a mini once, $599 [34]; Scaleway €5.28 a day | **unknown**: whether Chrome gets the GPU with nobody at the screen |
| CPU only, SwiftShader (any CI runner) | Dawn on SwiftShader's Vulkan | yes; its inter-stage limit of 30 clears the 16 needed (computed from [35]) | under Xvfb | **no `shader-f16`**, an 8192 texture cap, marked as a fallback adapter; slow | unlimited, free on GitHub | $0 | possible in principle, text match unknown |

The text-match column is the whole question, and it is subtler than "same GPU or not". Babylon's WebGPU engine takes its limit-derived capabilities from the device's limits, which are WebGPU's defaults on every adapter unless the app asks for more, so those are identical on SwiftShader, a T4 and an M4. What differs between adapters is the feature-driven set: texture compression formats, filterable 32-bit float textures, `shader-f16`, dual-source blending, and anything the game's own tier logic reads from the adapter [36]. Because the corpus is keyed by each stage's exact text, a difference would show up as extra stages, never wrong ones; the risk is map growth against the ceiling, not a broken shader.

> **The finding that matters beyond speed:** the game runs WebGPU for players on macOS *and* Windows. If a Direct3D 12 Chrome asks for text a Metal Chrome does not, the corpus recorded on the Air alone is already missing what Windows players compile on a first visit, and recording on the Windows rigs is a correctness fix, not just a speed-up (inferred, not measured). The map format anticipates it: a tier that outgrows its ceiling "is split further, by platform".

One recording of one page on the Air, a Windows rig and a Linux container, with the stage hashes and the adapters' features compared, settles it for about a dollar.

**Linux GPU containers are the cheapest and quickest to start on paper.** Modal documents containers that boot "in about one second", billed per second, and an independent benchmark in September 2026 measured a 1.8 s median cold start over 500 calls [37], [38]. Cloud Run's L4 is usable "in approximately 5 seconds" [31]. Azure Container Apps' T4, at $0.000073 a second (about $0.26 an hour), is the cheapest GPU-second found [39]. Against that:

- **WebGPU on Linux is on by default only in narrow cases:** Intel Gen12 and later since Chrome 144 (Jan 7, 2026), and NVIDIA on Wayland since Chrome 147 and 148 (Apr 22, 2026), never on X11, Xvfb or headless [40], [41].
- **The container has to carry the graphics driver.** It must mount NVIDIA's graphics libraries (toolkit 1.12 or later injects the Vulkan driver [42]) and install a `libnvidia-gl` package matching the host driver exactly: 610.57.04 on Modal's hosts [43], 580 on Cloud Run, 570 moving to 580 on Azure. None of the three documents this for its own runtime.
- **Dawn's blocklist refuses drivers from 570 up** until `--enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist` is passed [25].
- **Headless Chrome does not present a WebGPU canvas,** by every source that tested it; headed Chrome under `xvfb-run` is the path that works.
- **The one provider with a verified Chrome-on-GPU container recipe, Fly.io, retired its GPUs** after Aug 1, 2026 [44].

The rig study's Modal verdict, Chrome on a software renderer, was a symptom of this missing plumbing, not a property of Modal. A working Linux recipe is plausible and about a day's work. Its first run must check that the adapter is not a fallback and that the renderer string does not say SwiftShader before trusting anything [45], and even then the recorded text needs the comparison above because of `shader-f16`. It is the third machine to try, not the first.

For frame timing, Linux containers and GPU marketplaces stay out. A Linux T4 is a different translation stack from the Windows machine the budgets were calibrated on. Shared or fractional GPUs vary host, driver and temperature from one listing to the next. Even a dedicated cloud T4 drops its clocks under a light, frame-paced load, which flipped a 60-frame average between 2 ms and 4 to 6 ms in one careful Vulkan benchmark [46]. Whether `nvidia-smi -lgc` may lock the clocks inside a `g4dn` guest is **unknown**; the T4's default application clock is 585 MHz with "no auto boost" [47]. And Chrome rounds WebGPU timestamp queries to 100 µs unless `--enable-webgpu-developer-features` is set [48], which the rig's per-pass readout should be checked for.

## 4. The test gate is free and parallel on GitHub; most faster runners need an organisation

The fastest form of the gate is the one the repository already has and starts by hand: the CI workflow on GitHub's standard runners, which for a **public repository are free, unlimited and 4 vCPU with 16 GB** [49], [50], with 20 jobs at once on the Free plan and 40 on Pro [51]. It already does what the local gate cannot: a clean checkout, five client shards, the real production build and the map ceiling check. Its 14 minutes against 75 unfinished local ones is parallelism and an idle machine, not faster hardware; the workflow's own comment calls the runners "shared machines slower than the development one".

The lever still free is finer sharding. Vitest assigns test files to shards by a hash of their path; the longest of five shards takes about 5 minutes (7 at worst) against 17 minutes unsharded. At 10 to 16 shards the compute floor is three to four minutes, plus each job's checkout and install: realistically **5 to 7 minutes end to end** (computed from the workflow's measured figures and the 20-job cap). Smaller changes compound it. TypeScript 7.0, released Jul 8, 2026, replaces `tsc` with a native compiler that is "8x to 12x" faster on full builds [52]. ESLint's content cache with `--concurrency auto` makes lint nearly free on a small commit [53]. Vitest's docs call `pool: 'threads'` with `isolate: false` "the fastest option" for Node-environment suites, and warn that one Vite server thread limits a big machine, which is why many 4-vCPU shards beat one 32-vCPU box [54].

The paid options were priced on a model of 220 vCPU-minutes a gate (an estimate from the shard timings, not a measurement) and 300 gates a month, far above this project's pace, so their monthly figures are ceilings.

| Option | Needs an organisation? | $ a vCPU-minute | A month at 66,000 vCPU-min | Wall clock | Catch | Sources |
|---|---|---|---|---|---|---|
| GitHub standard runners, public repository | no | 0 | **$0** | 15 min as of Oct 29, 2026; 5 to 7 at 10 to 16 shards (computed) | 20 jobs at once on Free; a 10 GB cache | [49], [51] |
| GitHub larger runners (16-core x64, $0.042 a minute) | **yes**, Team or Enterprise, and billed on public repositories | 0.0026 | about $175 | 3 to 5 min | not available to a personal account | [55], [56] |
| Depot (16 vCPU, $0.048 a minute) | **yes**: "only support repositories owned by GitHub organizations" | 0.003 | $194 to 278 | 3 to 5 min | organisations only | [57], [58] |
| Blacksmith ($0.004 a minute per 2 vCPU) | **yes**: "not available for personal repositories" | 0.002 | about $120 | 3 to 5 min | organisations only; an open-source programme by application | [59], [60] |
| BuildJet | | | | | **shut down Mar 31, 2026** | [61] |
| Namespace (16 vCPU, $0.016 to 0.024 a minute) | not stated | 0.002 to 0.003 | $100 Team, $198 pay as you go | 2 jobs at once | the free plan's 32-vCPU cap defeats five shards | [62] |
| Ubicloud standard 16 vCPU ($0.010 a minute) | not stated | 0.000625 | **about $39** | 3 to 5 min | a "premium" tier on by default at twice the price; 30 vCPU at most | [63] |
| RunsOn on one's own AWS account, 16-vCPU spot | no (a free licence for open source) | about 0.0003 | about $26, plus boot time | 4 to 6 min (40 to 60 s to boot a job) | one CloudFormation stack; spot interruptions | [64], [65] |
| Modal functions as the `DAYHIKE_GATE` runner (5 of 8 vCPU) | no | about 0.00066 with memory | about $44, **about $14 after the $30 credit**; $0 at this project's pace | 3 to 5 min plus seconds to start | a Python driver and a named image; Sandboxes cost 3 times as much | [33], [66] |
| Cloud Run jobs | no | about 0.0012 with memory | about $80 after the free tier | 3 to 5 min plus the image pull | an image per run, or a clone step | [67] |
| Hetzner CCX43, 16 vCPU | no | about 0.00053 if billed by the minute | about $35, far more if by the hour | 4 to 6 min plus boot | US prices more than doubled in June 2026; no spot | [68], [69] |

**The structural fact: the two best-known runner services and GitHub's own larger runners all need the repository to belong to an organisation**, and a personal repository does not, so the "three times faster" tier of the market is closed to it as it stands. What stays open and cheap is Ubicloud (a label change, about $39 a month at ten times this project's pace), RunsOn on one's own AWS account, and Modal through the gate's runner hook. That hook's contract maps directly onto a Python driver that pushes the working tree to a Modal volume, maps `vitest run --shard=i/N --reporter=blob` over the shard numbers with typecheck, lint and the production build as parallel calls, and merges the reports locally with `vitest run --merge-reports` [54], [70]. It would be the first runner to include the build and its ceiling check, the gap this change fell through.

But it is a second step. The first is to make the free workflow the gate's default form: started from the push gate rather than by hand, split into more shards, with `node_modules` and ESLint's cache kept between runs. The second is a local **map-headroom check right after the corpus merge**. Building the map is pure Node that took 35 s for 421 stages on an M4, so about 90 to 130 s for 1,098 to 1,538 stages (scaled, not measured). That one step, run before the recording commit, would have caught the 11.5 MB map in two minutes instead of after a push and a 14-minute run.

## 5. Apple silicon work has no cloud answer cheaper than a second Mac

Frame-time measurements under the conditions players see on a Mac (Apple's Metal, a device pixel ratio of 2, the Air as the medium tier's reference) and the flicker captures cannot move to an NVIDIA machine. The frame-budget tooling's rules, "Never a rig number as a Mac number" and "Another page drawing on this Mac's GPU voids every row", tie them to one idle Apple GPU. As of Oct 29, 2026, that GPU is the development laptop, which is why the measurement, the recording and the tests fought over one machine.

Renting Apple silicon by the hour is possible, but Apple's licence makes it awkward:

- **Scaleway's Mac mini M4-S:** €0.22 an hour with a 24-hour minimum, so €5.28 a day, in Paris only, created in "up to 120 minutes", and out of stock on every macOS type on Sep 28 and 29, 2026 [71].
- **AWS `mac-m4.metal`:** $1.23 an hour on a Dedicated Host with a 24-hour minimum, so $29.52 a day; host release scrubs of 50 minutes to 3 hours were documented for the `mac1` generation [72], [73], [74].
- **MacStadium's hosted M4.S:** $149 a month, prepaid, with no hourly option [75]. MacWeb's M4 Pro in Silicon Valley is $249 a month [76].

Virtual Macs are cheaper by the minute: GitHub's `macos-15-xlarge` M2 Pro runner at $0.102 a minute with "GPU hardware acceleration enabled by default" [77], Codemagic's M4 at $0.114 a minute [78], Cirrus at $150 a month, Orka. They run Metal through Apple's paravirtual GPU, which benchmarks at about **92 % of the host's Geekbench Metal score** but reports a conservative capability profile and refused two of Apple's own Metal demos [79], [80], [81]. What ANGLE and Dawn see inside such a VM is **unknown**; nobody has published a `chrome://gpu` page from one. So a corpus recorded there is a risk, and frame times from a shared VM slice are regression signals, not a player's numbers. GitHub's standard macOS runner (M1, 3 cores) is **free on a public repository** and the obvious home for a Node test shard on Apple cores, its GPU unverified [82].

Against all of that, a base **Mac mini M4 at $599** [34] is bare metal, the Air's own GPU generation (10 cores against 8, with a fan, so faster but the same backend), on the same network, available in seconds, and about $13 a year of electricity at its 2.4 to 2.8 W idle and New York's 29.93 ¢ a kWh in May 2026 [83], [84]. It pays for itself against Scaleway in about four months of daily use, and against MacStadium in four. A report that the 256 GB model was discontinued at a $799 start [85] conflicts with retailer listings and is unresolved. As a GitHub self-hosted runner it also becomes the dedicated machine the wall-clock tests need, and a second Chrome for recording. The open question it shares with Scaleway is whether Chrome gets the Metal GPU with nobody logged in at the screen and no display attached; the recorder's own note, "headless Chrome on a Mac gives no WebGPU", makes it concrete. At home the probe costs an afternoon and perhaps a display-emulator dongle, and it is the first thing to run.

## 6. About 30 minutes from commit to live, for about $50 to $60 a month

What runs where, in order, with everything that can overlap overlapping:

| Stage | Runs on | Starts | Takes (computed unless marked) | What changes |
|---|---|---|---|---|
| 1. Frame-time measurements, flicker captures | the Air, then a Mac mini on the network once probe A passes; per-pass GPU costs on the AWS T4 rig as before | before the change | tens of minutes | the development laptop stays free; a build is still compared on one Mac only |
| 2. Code, named tests, docs | the Air | | human time | |
| 3a. Corpus recording | first the Air, one page per process with a time limit and 3 or 4 at once; then 8 to 10 stopped AWS Windows rig copies, each recording 3 to 5 pages from a preview channel (after probe B); later Modal under Xvfb (after probes B and C) | at the code commit | the Air at 4 at once about 15 min; 10 rigs 45 s to start and 4 pages of about 105 s, about 8 min plus the merge; Modal Starter 4 waves, about 9 min | 53 min serial (2 h 32 min as it ran) to about 10 to 15; the recorder fails a page when its Chrome dies, not the whole run |
| 3b. Typecheck, lint, 10 to 16 client shards, server and tools suites | GitHub standard runners, started by the push gate | at the code commit, beside 3a | 5 to 7 min (15 as of Oct 29, 2026) | the hand-started workflow becomes the gate's default form |
| 3c. Wall-clock tests | the Mac mini as a self-hosted runner (the Air until then) | at the code commit, beside 3a | minutes | a quiet machine, and no more flaky files under load |
| 4. Merge and map headroom | the Air: merge the recordings, then build the map with the ceiling check | when 3a ends | about 2 min (scaled, not measured) | the oversized map is caught here, not after a push |
| 5. Build with the ceiling check | the GitHub build job on the recording commit | at the recording commit | 5 to 7 min | the real build runs before every deploy that changes the corpus |
| 6. Deploy and verify | the Air (Docker, gcloud) | when 5 is green | about 5 min | |

From the code commit to verified live that is **about 25 to 35 minutes**: 3a, 3b and 3c together for 10 to 15 minutes, then 2 for step 4, 5 to 7 for step 5 and 5 for step 6. The change as it ran took 4 h 27 min of working time, and 1 h 50 min would have been its floor with the same tools on a quiet machine. About three-quarters of the saving is the recording fan-out and a recorder that fails one page instead of the run; the rest is gate parallelism and the ceiling check moving earlier. None of it depends on a new provider, and the Air's one remaining serial duty is the Apple-silicon measurement, which a Mac mini can take over.

Monthly cost, with the cost as of Oct 29, 2026, beside it:

| Item | As of Oct 29, 2026 | Recommended | Basis |
|---|---|---|---|
| GitHub Actions, standard runners, public repository | $0 | **$0** at any sharding within 20 jobs at once | [49] |
| AWS Windows rig: stopped disks and image | $4.00 a month for one 50 GB disk; the image $1.25 to 1.75 | 8 to 10 stopped copies, **$32 to 40**, plus the image | the rig's README (prices Sep 25, 2026) and the rig study |
| AWS rig hours: measurement days | about $12.58 for a month of four days | the same, plus **about $1.20 a recording day** (1.7 machine-hours at $0.715) | computed |
| GCP Windows rig | $5.00 a month for its disk; $1.0972 an hour running | retire it, or keep it stopped at $5: a one-GPU quota, stock-outs on Sep 28, 2026, and the T4's end of support on Aug 1, 2027 [86] | the rig's README |
| Modal (optional, after probes B and C) | | **$0 net**: about $1.10 a recording run and $0.15 a gate against $30 a month of credit | [33], computed |
| Mac mini M4 | | **about $600 to 665 once** with New York sales tax, about $1 a month of power | [34], [83] |
| Scaleway M4-S, for a second Mac only when a result needs confirming | | €5.28 a day of use | [71] |
| **Recurring total** | **about $18 to 25** | **about $50 to 60** with ten stopped rigs and four measurement days; about $20 to 25 with two rigs | the rows above |

## 7. Eight probes settle the unknowns; A and B first

The unknowns are few, and each is a one-off probe. None needs a new account except, optionally, Modal's free tier.

| Probe | Settles | How | Cost |
|---|---|---|---|
| A. Does Chrome get the Metal GPU on an unattended Mac? | whether a Mac mini, or Scaleway, can record and measure with nobody at the screen | on the mini, start Chrome over SSH with no login session, with auto-login and no display, and with a display-emulator dongle; print WebGL2's unmasked renderer (the Air reads `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, ...)`) and the WebGPU adapter's info | an afternoon, a dongle at most |
| B. Does a corpus recorded on NVIDIA match the Air's stage text? | whether Windows rigs and Linux containers can record, and whether the Air-only corpus already misses Windows players' stages | record one page (`forest`, high tier) on the Air, on a Windows T4 rig and, after probe C, in a Linux container; compare the stage hashes and save each adapter's features, limits and info into the recording; repeat on SwiftShader | about $1 of rig time |
| C. Can a Linux GPU container present a WebGPU canvas? | whether Modal, Cloud Run or Azure Container Apps can hold a recorder at all | a Modal image with Chrome, `libnvidia-gl-610`, the Vulkan loader and tools, and Xvfb; check that `vulkaninfo --summary` lists the NVIDIA device, run Chrome under `xvfb-run` with the WebGPU flags and Dawn's blocklist off, and check for a non-fallback adapter and a canvas that is not blank | under $1, inside the free credit |
| D. May `nvidia-smi -lgc` lock the clocks on a `g4dn`? | whether locked clocks can tighten the rig's frame-time spread | on the AWS rig, `nvidia-smi -pm 1` then `nvidia-smi -lgc 585,585` (the T4's application clock), read the error if any, then compare a measurement at locked and unlocked clocks | one rig hour, $0.72 |
| E. Is `--enable-webgpu-developer-features` set on the rigs and the Air? | whether per-pass timestamps are rounded to 100 µs | read the harness's Chrome flags; compare a run with and without | minutes |
| F. How long does the production build take on the 1,098-stage corpus? | the real cost of steps 4 and 5 | time the map build and the CI build job on the Air and on a runner; the only figure is 35 s and 54 s for 421 stages | minutes |
| G. Does recording several pages at once on the Air change what is recorded? | the safe number at once for step 3a's first form | record one page alone and with three others running; compare the stage hashes and the page's hit and miss report | 10 minutes |
| H. What does Chrome see on GitHub's macOS runners? | whether the free M1 runner or the $0.102-a-minute M2 Pro one can hold a shard or a probe | a workflow that prints the unmasked renderer and the WebGPU adapter on `macos-15` and `macos-15-xlarge` | $0, and about $2 |

> **Recommendation:** keep the AWS Windows rig; it is the right instrument at a market price. Fan the recording out, first on the Air and then on rig copies; make the free CI workflow the gate, with more shards; check the map's headroom before the recording commit; and move the Apple-silicon measurements to a Mac on the desk. Run probes A and B first: an afternoon and a dollar, and together they decide whether the recording fleet is Macs, Windows rigs or both.

Every provider that looked cheaper or quicker on paper either cannot hold this work as of Oct 29, 2026 (Linux containers until a WebGPU canvas is shown to draw, virtual Macs until their Metal profile is known), cannot be bought by a personal account (Depot, Blacksmith, GitHub's larger runners), or is cheaper only on spot, which timing cannot use. The cheapest path to a half-hour graphics change is almost all tooling the repository already has: the rig copies, the sysprepped image, the corpus merge, the CI workflow and the gate's runner hook, plus one Mac so the laptop stops being the bottleneck for its own measurements.

## Sources

1. C. Sarkosh, "game-dayhike," GitHub repository. Accessed: Oct. 29, 2026. [Online]. Available: https://github.com/csarkosh/game-dayhike
2. Vantage, "g4dn.xlarge pricing and specs," Vantage Instances. Accessed: Oct. 29, 2026. [Online]. Available: https://instances.vantage.sh/aws/ec2/g4dn.xlarge
3. Spare Cores, "g4dn.xlarge," Spare Cores server navigator. Accessed: Oct. 29, 2026. [Online]. Available: https://sparecores.com/server/aws/g4dn.xlarge
4. Amazon Web Services, "Amazon EC2 On-Demand Pricing," AWS. Accessed: Oct. 29, 2026. [Online]. Available: https://aws.amazon.com/ec2/pricing/
5. cloudprice.net, "Standard_NC4as_T4_v3 pricing," cloudprice.net. Accessed: Oct. 29, 2026. [Online]. Available: https://cloudprice.net/vm/Standard_NC4as_T4_v3
6. Spare Cores, "Standard_NC4as_T4_v3," Spare Cores server navigator. Accessed: Oct. 29, 2026. [Online]. Available: https://sparecores.com/server/azure/Standard_NC4as_T4_v3
7. Microsoft, "Windows Virtual Machines Pricing," Microsoft Azure. Accessed: Oct. 29, 2026. [Online]. Available: https://azure.microsoft.com/en-us/pricing/details/virtual-machines/windows/
8. Spare Cores, "n1-standard-4," Spare Cores server navigator. Accessed: Oct. 29, 2026. [Online]. Available: https://sparecores.com/server/gcp/n1-standard-4
9. Google, "GPU pricing," Google Cloud. Accessed: Oct. 29, 2026. [Online]. Available: https://cloud.google.com/compute/gpus-pricing
10. Spare Cores, "g2-standard-4," Spare Cores server navigator. Accessed: Oct. 29, 2026. [Online]. Available: https://sparecores.com/server/gcp/g2-standard-4
11. Vantage, "g6.xlarge pricing and specs," Vantage Instances. Accessed: Oct. 29, 2026. [Online]. Available: https://instances.vantage.sh/aws/ec2/g6.xlarge
12. Holori, "VM.GPU.A10.1 pricing," Holori cloud calculator. Accessed: Oct. 29, 2026. [Online]. Available: https://calculator.holori.com/oci/vm/VM.GPU.A10.1
13. Oracle, "Announcing preemptible instances, a new kind of compute instance available at a 50% discount," Oracle Cloud Infrastructure Blog. Accessed: Oct. 29, 2026. [Online]. Available: https://blogs.oracle.com/cloud-infrastructure/post/announcing-preemptible-instances-a-new-kind-of-compute-instance-available-at-a-50-discount
14. CAST AI, "Kubernetes spot instances: cost optimization," CAST AI blog. Accessed: Oct. 29, 2026. [Online]. Available: https://cast.ai/blog/kubernetes-spot-instances-cost-optimization/
15. Thunder Compute, "Oracle Cloud (OCI) GPU pricing," Thunder Compute blog, Oct. 1, 2026. Accessed: Oct. 29, 2026. [Online]. Available: https://thundercompute.com/blog/oracle-cloud-oci-gpu-pricing
16. Microsoft, "Azure virtual machine GPU vCPU quota increase unable to be approved," Microsoft Q&A. Accessed: Oct. 29, 2026. [Online]. Available: https://learn.microsoft.com/en-us/answers/questions/2201001/azure-virtual-machine-gpu-vcpu-quota-increase-unab
17. ProvisioningIQ, "I built a tool that benchmarks cloud provisioning speed across AWS, Azure and GCP," DEV Community. Accessed: Oct. 29, 2026. [Online]. Available: https://dev.to/biz_dev_5bfcf2eb4cb185fe9/i-built-a-tool-that-benchmarks-cloud-provisioning-speed-across-aws-azure-and-gcp-11bh
18. Amazon Web Services, "AMIs with NVIDIA drivers preinstalled," Amazon EC2 User Guide. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/preinstalled-nvidia-driver.html
19. Google, "Install GRID drivers for virtual workstations," Compute Engine documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.cloud.google.com/compute/docs/gpus/install-grid-drivers
20. Microsoft, "Install NVIDIA GPU drivers on N-series VMs running Windows," Microsoft Learn. Accessed: Oct. 29, 2026. [Online]. Available: https://learn.microsoft.com/en-us/azure/virtual-machines/windows/n-series-driver-setup
21. ANGLE Authors, "ANGLE README," Chromium source. Accessed: Oct. 29, 2026. [Online]. Available: https://chromium.googlesource.com/angle/angle/+show/main/README.md
22. Dawn Authors, "Dawn, commit 249dcd8," Dawn source. Accessed: Oct. 29, 2026. [Online]. Available: https://dawn.googlesource.com/dawn/+/249dcd8f87d749251a8a9dc905a4c2156b9aa725
23. M. Larabel, "NVIDIA GeForce on Windows 11 vs. Ubuntu 23.04," Phoronix, Apr. 2023. Accessed: Oct. 29, 2026. [Online]. Available: https://www.phoronix.com/review/nvidia-windows11-ubuntu2304/2
24. GPU for the Web Community Group, "Implementation status," gpuweb wiki, GitHub. Accessed: Oct. 29, 2026. [Online]. Available: https://github.com/gpuweb/gpuweb/wiki/implementation-status
25. T. Abrodi, "How to get WebGPU in headless Chrome on cloud GPUs," Tiger Abrodi blog. Accessed: Oct. 29, 2026. [Online]. Available: https://tigerabrodi.blog/how-to-get-webgpu-in-headless-chrome-on-cloud-gpus
26. J. Mayes, "headless-chrome-nvidia-t4-gpu-support," GitHub repository. Accessed: Oct. 29, 2026. [Online]. Available: https://github.com/jasonmayes/headless-chrome-nvidia-t4-gpu-support
27. vis.gl, "luma.gl issue #2874," GitHub. Accessed: Oct. 29, 2026. [Online]. Available: https://github.com/visgl/luma.gl/issues/2874
28. agent-browser, "WebGPU," agent-browser documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://agent-browser.dev/webgpu
29. Dawn Authors, "PhysicalDeviceVk.cpp," Dawn source, GitHub. Accessed: Oct. 29, 2026. [Online]. Available: https://raw.githubusercontent.com/google/dawn/main/src/dawn/native/vulkan/PhysicalDeviceVk.cpp
30. Google, "WebGPU news," Chrome for Developers. Accessed: Oct. 29, 2026. [Online]. Available: https://developer.chrome.com/docs/web-platform/webgpu/news
31. Google, "GPU support for services," Cloud Run documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.cloud.google.com/run/docs/configuring/services/gpu
32. RunPod, "Serverless workers overview," RunPod documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.runpod.io/serverless/workers/overview
33. Modal Labs, "Pricing," Modal. Accessed: Oct. 29, 2026. [Online]. Available: https://modal.com/pricing
34. Neowin, "Apple launches redesigned $599 Mac mini with M4 and M4 Pro options," Neowin. Accessed: Oct. 29, 2026. [Online]. Available: https://www.neowin.net/amp/apple-launches-redesigned-599-mac-mini-with-m4-and-m4-pro-options/
35. SwiftShader Authors, "VkPhysicalDevice.cpp," SwiftShader source, GitHub. Accessed: Oct. 29, 2026. [Online]. Available: https://raw.githubusercontent.com/google/swiftshader/master/src/Vulkan/VkPhysicalDevice.cpp
36. Babylon.js Authors, "webgpuEngine.pure.ts," Babylon.js source, GitHub. Accessed: Oct. 29, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/dev/core/src/Engines/webgpuEngine.pure.ts
37. Modal Labs, "Cold start performance," Modal documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://modal.com/docs/guide/cold-start
38. Serverless GPU Bench, "Serverless GPU cold start benchmark," serverlessgpubench.com. Accessed: Oct. 29, 2026. [Online]. Available: https://serverlessgpubench.com/
39. Microsoft, "Azure Retail Prices API: Azure Container Apps, East US," Microsoft Azure. Accessed: Oct. 29, 2026. [Online]. Available: https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20%27Azure%20Container%20Apps%27%20and%20armRegionName%20eq%20%27eastus%27
40. Google, "What's New in WebGPU (Chrome 144)," Chrome for Developers. Accessed: Oct. 29, 2026. [Online]. Available: https://developer.chrome.com/blog/new-in-webgpu-144
41. Google, "What's New in WebGPU (Chrome 147 and 148)," Chrome for Developers. Accessed: Oct. 29, 2026. [Online]. Available: https://developer.chrome.com/blog/new-in-webgpu-147-148
42. NVIDIA, "NVIDIA Container Toolkit 1.12.0 release notes," NVIDIA documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/1.12.0/release-notes.html
43. Modal Labs, "Using CUDA on Modal," Modal documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://modal.com/docs/guide/cuda
44. Fly.io, "GPU migration: Fly.io GPUs will be deprecated as of July 31, 2026," Fly.io community. Accessed: Oct. 29, 2026. [Online]. Available: https://community.fly.io/t/gpu-migration-fly-io-gpus-will-be-deprecated-as-of-july-31-2026/27110
45. Chromium Authors, "gpu_adapter.cc," Chromium source, GitHub. Accessed: Oct. 29, 2026. [Online]. Available: https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/webgpu/gpu_adapter.cc
46. M. Ropert, "Benchmarking Vulkan," Jan. 29, 2026. Accessed: Oct. 29, 2026. [Online]. Available: https://mropert.github.io/2026/01/29/benchmarking_vulkan
47. NVIDIA Developer Forums, "Nsight Compute slows down Tesla T4 processor clock during profiling," NVIDIA Developer Forums. Accessed: Oct. 29, 2026. [Online]. Available: https://forums.developer.nvidia.com/t/nsight-compute-slows-down-tesla-t4-processor-clock-during-profiling/122331
48. Google, "WebGPU developer features," Chrome for Developers. Accessed: Oct. 29, 2026. [Online]. Available: https://developer.chrome.com/docs/web-platform/webgpu/developer-features
49. GitHub, "About billing for GitHub Actions," GitHub Docs. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions
50. GitHub, "GitHub-hosted runners reference," GitHub Docs. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
51. GitHub, "Actions limits," GitHub Docs. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.github.com/en/actions/reference/limits
52. Microsoft, "Announcing TypeScript 7.0," TypeScript blog, Microsoft Dev Blogs. Accessed: Oct. 29, 2026. [Online]. Available: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
53. ESLint, "Command Line Interface Reference," ESLint documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://eslint.org/docs/latest/use/command-line-interface
54. Vitest, "Improving Performance," Vitest documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://vitest.dev/guide/improving-performance
55. GitHub, "Actions runner pricing," GitHub Enterprise Cloud Docs. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.github.com/en/enterprise-cloud@latest/billing/reference/actions-runner-pricing
56. GitHub, "Larger runners," GitHub Docs. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.github.com/en/actions/reference/runners/larger-runners
57. Depot, "Depot GitHub Actions runners," Depot documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://depot.dev/docs/github-actions/overview
58. Depot, "Pricing," Depot. Accessed: Oct. 29, 2026. [Online]. Available: https://depot.dev/pricing
59. Blacksmith, "Quickstart," Blacksmith documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.blacksmith.sh/introduction/quickstart
60. Blacksmith, "Pricing," Blacksmith. Accessed: Oct. 29, 2026. [Online]. Available: https://www.blacksmith.sh/pricing
61. WarpBuild, "BuildJet is shutting down," WarpBuild blog. Accessed: Oct. 29, 2026. [Online]. Available: https://www.warpbuild.com/blog/buildjet-shutting-down
62. Namespace, "Pricing," Namespace. Accessed: Oct. 29, 2026. [Online]. Available: https://namespace.so/pricing
63. Ubicloud, "Pricing," Ubicloud documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://www.ubicloud.com/docs/about/pricing
64. RunsOn, "Pricing," RunsOn. Accessed: Oct. 29, 2026. [Online]. Available: https://runs-on.com/pricing/
65. RunsOn, "Changelog v1.5.0," RunsOn. Accessed: Oct. 29, 2026. [Online]. Available: https://runs-on.com/changelog/v1.5.0/
66. Modal Labs, "Sandboxes," Modal documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://modal.com/docs/guide/sandbox
67. Google, "Cloud Run pricing," Google Cloud. Accessed: Oct. 29, 2026. [Online]. Available: https://cloud.google.com/run/pricing
68. Spare Cores, "ccx43," Spare Cores server navigator. Accessed: Oct. 29, 2026. [Online]. Available: https://sparecores.com/server/hcloud/ccx43
69. webhosting.today, "Hetzner's price increases reached 209%: the 30% headline applied to a different tier," webhosting.today, Jun. 18, 2026. Accessed: Oct. 29, 2026. [Online]. Available: https://webhosting.today/2026/06/18/hetzners-price-increases-reached-209-the-30-headline-applied-to-a-different-tier/
70. Modal Labs, "Scaling out," Modal documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://modal.com/docs/guide/scale
71. Scaleway, "Apple silicon pricing," Scaleway. Accessed: Oct. 29, 2026. [Online]. Available: https://www.scaleway.com/en/pricing/apple-silicon/
72. Vantage, "mac-m4.metal pricing and specs," Vantage Instances. Accessed: Oct. 29, 2026. [Online]. Available: https://instances.vantage.sh/aws/ec2/mac-m4.metal
73. Amazon Web Services, "Amazon EC2 Dedicated Hosts pricing," AWS. Accessed: Oct. 29, 2026. [Online]. Available: https://aws.amazon.com/ec2/dedicated-hosts/pricing/
74. Amazon Web Services, "Implementing autoscaling for EC2 Mac instances," AWS Compute Blog. Accessed: Oct. 29, 2026. [Online]. Available: https://aws.amazon.com/blogs/compute/implementing-autoscaling-for-ec2-mac-instances
75. MacStadium, "Pricing," MacStadium. Accessed: Oct. 29, 2026. [Online]. Available: https://www.macstadium.com/pricing
76. MacWeb, "Mac mini hosting," MacWeb. Accessed: Oct. 29, 2026. [Online]. Available: https://macweb.com/macmini
77. GitHub, "GitHub Actions now offers M2 Pro powered hosted runners in public preview," GitHub Changelog, Jul. 17, 2025. Accessed: Oct. 29, 2026. [Online]. Available: https://github.blog/changelog/2025-07-17-github-actions-now-offers-m2-pro-powered-hosted-runners-in-public-preview
78. Codemagic, "Pricing," Codemagic documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.codemagic.io/billing/pricing/
79. H. Oakley, "Virtualisation on Apple silicon Macs is different," The Eclectic Light Company, Apr. 29, 2026. Accessed: Oct. 29, 2026. [Online]. Available: https://eclecticlight.co/2026/04/29/virtualisation-on-apple-silicon-macs-is-different/
80. H. Oakley, "How good is GPU access for Apple silicon virtual machines?," The Eclectic Light Company, Oct. 26, 2023. Accessed: Oct. 29, 2026. [Online]. Available: https://eclecticlight.co/2023/10/26/how-good-is-gpu-access-for-apple-silicon-virtual-machines/
81. Cua, "GPU passthrough for macOS VMs," Cua blog. Accessed: Oct. 29, 2026. [Online]. Available: https://cua.ai/blog/gpu-passthrough-macos-vms
82. GitHub, "Actions runner pricing," GitHub Docs. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.github.com/en/billing/reference/actions-runner-pricing
83. ENERGY STAR, "Apple Mac mini (M4) certified computer data sheet," ENERGY STAR. Accessed: Oct. 29, 2026. [Online]. Available: https://www.energystar.gov/productfinder/product/certified-computers/details/4513881/export/pdf
84. Empire Center, "New York electricity prices, May 2026," Empire Center for Public Policy. Accessed: Oct. 29, 2026. [Online]. Available: https://www.empirecenter.org/?p=60817
85. Seeking Alpha, "Apple discontinues 256GB Mac mini, starting price climbs to $799," Seeking Alpha. Accessed: Oct. 29, 2026. [Online]. Available: https://seekingalpha.com/news/4584299-apple-discontinues-256gb-mac-mini-starting-price-climbs-to-799
86. Google, "Allocation quotas and resource usage," Compute Engine documentation. Accessed: Oct. 29, 2026. [Online]. Available: https://docs.cloud.google.com/compute/resource-usage
