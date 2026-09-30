---
description: Text-to-speech for a game's radio call in 2026: the models that take direction, what gives them away, the radio chain, licences, cost, cloning your own voice.
published: 2026-09-29
---
# Synthetic voices for a radio call

**Question:** Day Hike's opening film is a sixty-second drive with a radio call: a park ranger,
dry and close, and a dispatcher heard through a two-way radio, ten lines and about 95 words,
routine with wrong notes. The voices are to be synthetic for now, and later the ranger may be
recut in the author's own cloned voice. Which text-to-speech models have real emotional range
and human-like delivery today, how are they directed, what still gives them away and what
hides it, what do the licences and the money look like for a shipped game, and what does it
take to clone one's own voice?

**Short answer:** the top of the field in September 2026 is close and moves monthly. On the
blind-listening board that lets each vendor pick its voices, ElevenLabs' Eleven v4 (released
2026-09-28) leads at an Elo of 1316, then Cartesia's Sonic 3.6 at 1275, Google's Gemini 3.8
Flash TTS at 1268, Alibaba's Qwen-Audio-3.0-TTS-Plus at 1258 and Inworld's Realtime TTS-2 at
1247; on the board where every model must speak with the same cloned voices, Qwen 3.1 comes
first and Gemini falls to thirteenth, so part of a score is the voices a vendor supplies [1],
[2]. Every one of them takes direction, either as inline tags or a style instruction, and every
vendor says the same thing: generate several takes and choose by ear [3]. Listeners catch
synthesis in prosody, not timbre: pauses, rhythm, stress and breathing, and they were only 59
percent accurate in a 2025 study [4]. A radio channel hides the timbre and none of the timing,
so the timing gets edited by hand and the dispatcher is passed through a real chain. The
generation costs cents; what costs money is the plan that grants commercial rights, from about
five dollars a month, and the free tiers mostly do not [5], [6]. A professional clone of one's
own voice takes thirty minutes to three hours of clean recording and stays on the vendor's
service [7], [8]; a clone that is one's own to keep is a fine-tune of an open model, of which
the Apache and MIT ones are the only safe choices for a shipped game. Day Hike's first cut,
Eleven v4 on two stock voices, was good enough to keep and is built from one manifest so that
any line, voice or model can be redone alone.

## 1. The field in September 2026

Artificial Analysis runs a blind arena: each model generates one sample of about 500
characters per prompt, clips are loudness-normalised, listeners must play at least three
seconds of each before voting, and the votes are fit with Bradley-Terry and anchored at 1,000
with 95 percent confidence intervals [9]. There are two boards. On the provider-voice board
each vendor chooses eight neutral voices; on the controlled-voice board the same eight cloned
voices are used for every model, to separate a listener's taste in a voice from the model's
own quality [9].

| Model | Provider board Elo | Controlled board | Directed by | Output |
| --- | --- | --- | --- | --- |
| Eleven v4, ElevenLabs, 2026-09-28 | 1316 | 1154 | inline tags, stackable; stability and similarity settings; no SSML [10] | up to 48 kHz |
| Sonic 3.6, Cartesia, 2026-08-27 | 1275 | 1139 | reads the text's emotion; an emotion parameter in beta [11] | up to 48 kHz |
| Gemini 3.8 Flash TTS, Google, 2026-09-23 | 1268 | 1048 | a style field plus inline angle-bracket tags; two speakers a request [12] | 24 kHz |
| Qwen-Audio-3.0-TTS-Plus, Alibaba, 2026-07-21 | 1258 | 1184 (3.1) | a plain-language instruction plus 86 inline tags [13] | 48 kHz promised |
| Realtime TTS-2, Inworld, 2026-08-31 | 1247 | 1143 | a natural-language tag at the start plus a few non-verbal tags [14] | up to 48 kHz |
| Simba 3.2, Speechify, 2026-07-08 | 1241 | | SSML and emotion control, English only [15] | |
| Luna, VUI Labs, 2026-06 | 1230 | | emotion and non-verbal tokens [16] | 24 kHz |
| Breeze TTS 2, BreezeBlue, open weights, 2026-08-25 | 1207 | | an instruction; non-commercial weights [17] | 24 kHz |

Adjacent leaders overlap within their intervals (1275 and 1268 with 16 each way), and nearly
every vendor claimed first place at its own launch [11], [13], [14]. The Hugging Face arena,
where listeners type their own sentence, ranks other names first and had not listed the three
newest models on 2026-09-29 [18]. A benchmark paper found no statistically significant
difference among the better systems [19]. So the arenas answer "which family is near the top",
not "which model will read this line best".

Below the commercial leaders, the open models that a game may use commercially sit 150 to 300
Elo lower: Step-Audio-EditX at 1093, Kokoro at 1064, Maya1 at 1045, Chatterbox at 1023, Zonos
at the 1,000 anchor, Qwen3-TTS at 930 [1]. Their licences are the reason to know them (section 6).

## 2. How they take direction

The field has settled on two layers: a sustained instruction for a whole line, and momentary
tags for a breath, a sigh, a pause. Eleven v4 puts both inline as bracketed tags such as
`[tired]`, `[under his breath]` and `[sighs]`, which it reads as direction rather than words,
and several can be stacked and are followed in sequence; punctuation does real work, an
ellipsis for a trailing pause, a line break for a longer beat, capitals for emphasis; there
are no style or speed sliders and SSML is not supported [10], [20]. Its guide warns that a tag
lands only when that delivery is already in the voice's training, so the choice of voice is
the main control, and that a tag can be performed as a sound effect by mistake [3]. Gemini's
current docs treat the text as a verbatim transcript, put sustained delivery in a `style`
field and momentary events inline as `<sigh>` or `<short pause>`, and warn that long stage
directions make the voice drift [12]. Hume's acting instructions work best under 100
characters, with precise emotions ("melancholy", not "sad") paired with a delivery ("excited
but whispering") [21]. Cartesia calls its emotion control experimental, especially mid-line,
and recommends one generation per emotion [11]. OpenAI takes a free-text `instructions` field
[22]. Chatterbox, open weights, has two knobs, `exaggeration` and `cfg_weight` [23].

Two things follow for a radio call. The ranger's flatness belongs in the text: radio
procedure is already flat, call sign, "copy", clipped clauses, and a stable setting with the
tags kept for the one or two lines where the wrong note lands. And the lines are short, ten
words each, which Eleven's own guide says makes output less consistent; the vendors'
`previous_text` and `next_text` fields, or generating each speaker's whole side and cutting it
into lines, give the model context [24]. The most controllable direction of all is not a tag:
speech-to-speech conversion keeps the timing, pauses and emphasis of a recording the director
performs and swaps only the voice [25], which is also the path to a clone later.

## 3. What gives synthesis away, and the radio chain

Models trained to average over the many ways a sentence could be said produce flat, evenly
stressed prosody; the ACL paper on over-smoothness names it [26]. In a 2025 perception study
listeners were 59 percent accurate at telling synthetic speech from real, and reported using
intonation, rhythm, fluency, pauses, speed, breathing and laughter rather than the sound of the
voice itself [4]. Breathing was named as a sign of a human by both language groups in that
study, which is why breath prediction is now built into some systems [27].

That favours this scene. A two-way radio passes about 300 Hz to 3 kHz [28], the band that
removes most of a voice's timbre, and it compresses the breaths away. What survives the channel
is pacing and stress, so those are edited by hand on the clean take before it is degraded:
gaps between clauses tightened or opened, the onset of a word clipped, the pause before the
important word placed. Then the chain: a band-pass of 300 Hz to 3 kHz at 12 to 24 dB an
octave, a fast compressor or limiter and mild clipping, a key click of 100 to 250 ms before the
first word, and after the last a squelch tail of 5 to 100 ms on an analogue set, or a hard cut
on a digital one, both of which real radios produce [29], [30]. Walter Murch's "worldizing"
adds the last step: play the treated voice through a small speaker in a real space and record
it again, as he did twice for the radio in American Graffiti, so the dispatcher sits in the cab
rather than on top of the picture [31].

The break-up itself is a choice. On analogue FM a weak signal degrades into hiss the listener
can half-hear through; on the digital P25 radios that park services have moved to, it
degrades into warble and then silence, the "digital cliff" [32], [33]. Hiss lets the player
almost hear the word that matters; the cliff is colder and more accurate. Either way the
dropouts are cut on the syllable boundaries of the words to be lost, so they are clearly lost
and not randomly glitched. The ranger, close and untreated, is the voice the channel does not
hide, and gets room tone, a de-esser and hand-tuned gaps.

The precedents are not all synthetic. Portal's GLaDOS is a human performance made to sound
synthetic: the actress listened to text-to-speech samples, performed flatly, and the lines were
pitch-corrected with the modulation suppressed [34]. Firewatch's two actors recorded at the
same time over a phone call, so the radio's timing is a real conversation's [35].

## 4. Choosing a take

The measures that exist are made for comparing systems, not takes. MOS and CMOS are the
subjective scales, and a 2023 survey found most papers do not report the scale labels or
instructions, which change the scores [36]; a 2025 study found claims of human parity on CMOS
do not hold under Turing-style tests [37]. The objective proxies of the Seed-TTS convention,
word error rate from a transcription model and speaker similarity from a verification
embedding, are pass-or-fail filters: a clean take should transcribe with no misread word, and
a clone's takes should not drift from its reference [38].

At ten lines the decision is which of five to twenty takes has the right subtext, and no
metric measures "routine with wrong notes". The protocol that works is a blind pairwise choice:
the same text and seeds for every model, five or more takes each, loudness-matched, every take
passed through the final radio chain before judging, the files renamed so the model is not
known, chosen in pairs over the picture on headphones and on a laptop's speakers, the names
revealed after. Listeners report hearing prosody first, so the pause before the key word, where
the stress lands and whether each line's final fall sounds scripted are the things to listen
for.

## 5. Licences, cost and disclosure

For this job the generation is a few cents on any service: 95 words, three takes, two voices
is about 2,100 to 4,000 characters and three to six minutes of audio, which is under a dollar
at every list price, from a few cents at Gemini's nine dollars per million output tokens to
about 30 cents at Eleven's eight cents per thousand characters [39], [40]. What is actually
paid is the minimum plan that grants commercial rights. ElevenLabs' free plan forbids
commercial use and requires a credit, and its paid plans start at six dollars a month; output
made on a paid plan stays usable after the subscription ends [5], [41]. Cartesia's Pro plan
is five dollars [6]. Inworld includes a commercial licence on its free tier, which is
uncommon [42]. Google claims no ownership of Gemini's output, reviews free-tier use by
humans, and requires the paid tier for European users [43]. OpenAI requires telling users that
a voice is synthetic [22].

Open weights are where the licences bite. Breeze TTS 2, the best open model on the board, is
non-commercial [17]; Higgs Audio's grant excludes embedding in a product made available to
third parties [44]; F5-TTS's weights and Fish's are non-commercial; Coqui's XTTS closed in
January 2024 with no commercial licence to buy [45]. The Apache and MIT models are the safe
set: Qwen3-TTS, Chatterbox (which watermarks every output), Dia, Orpheus, Zonos, Maya1,
Step-Audio-EditX, Kokoro [23], [46], [47], [48], [49], [50], [51].

The games context has hardened. The SAG-AFTRA video-game strike of 2024 to 2025 ended with an
agreement, ratified by 95 percent, that requires clear, specific written consent for each use of
a digital replica and pays per line; it binds signatory producers, and it set the public norm
[52]. Embark shipped consented, actor-based synthetic voices in The Finals and Arc Raiders, drew
criticism where the voices carried a scene rather than a ping, re-recorded many lines with
actors, and its chief executive said in 2026 that a real professional actor is better [53],
[54]. Steam has required disclosure of shipped synthetic content, voice included, since its
rules were revised on 2026-01-16 [55]; the EU AI Act's Article 50 applies from 2026-08-02,
with a lighter duty for evidently fictional works [56]. The plain course is to disclose in the
credits and on any store page, keep the licence of every library voice, and not imitate a
recognisable real voice.

## 6. Cloning your own voice

An instant clone takes seconds of audio, ten at Eleven v4 by its launch note and one to two
minutes by its docs, and copies everything including the pace, the breathing and the mouth
clicks: a monotone sample makes a monotone clone [57]. A professional clone needs at least
thirty minutes and ideally two to three hours in a treated room, an XLR microphone, levels
between −23 and −18 dB RMS, no reverb or music, a voice-captcha check, and only one's own voice
may be cloned this way; it fine-tunes in three to six hours and the speaking style of the
samples is the style of the clone [7]. Microsoft and Google require a recorded consent statement
in the vendor's words [58], [59]. And the clone stays where it was made: ElevenLabs says clones
cannot be exported and advises keeping the source recordings [8].

To own the model, fine-tune an open one. Orpheus asks for about fifty examples and suggests
three hundred per speaker [48]; a guide fine-tunes Orpheus, Sesame CSM and others with LoRA
from about three hours of clips in one to two hours on a free 16 GB Colab GPU, and notes that
zero-shot cloning captures tone and timbre but not the full expressive range, while a fine-tune
captures the phrasing and the quirks [60].

Whichever path, the recording is the asset: close-miked, dry, flat and procedural in the
ranger's register, with a fifth of it wider (tired, uneasy) so the wrong note is inside the
model's range, the room added back in the mix and never in the training data, and the
performances of the ten lines kept as reference recordings, so a later recut is one
speech-to-speech pass onto the clone.

## 7. What Day Hike does

The first cut was made the day the model shipped: Eleven v4, two stock voices (Chris for the
ranger, Matilda for dispatch), one take a line with a fixed seed, one tag a line, the
neighbouring lines passed as context, dispatch through a first radio chain of band-pass,
compression, key click and squelch tail. It was good enough to keep. Two things it showed: the
ten lines ran 35 s of speech against the 21 s the film's shots give the call, so pace and the
tags are the first levers and the words the last; and the voices will be revisited, so they are
built to be redone line by line. One manifest holds the model, each role's voice and settings,
and per line the text with its tags, the seed and the take chosen; a tool regenerates any line
alone, never overwrites a take, and the mix reads only the chosen takes. Swapping a voice, a
model, or the ranger for a clone of the author's own voice is an edit to that file and a rerun
of the lines that changed; the picture is never re-recorded.

## Sources

1. Artificial Analysis, "Text to speech leaderboard: provider voice," Artificial Analysis. Accessed: Sep. 29, 2026. [Online]. Available: https://artificialanalysis.ai/text-to-speech/leaderboard
2. Artificial Analysis, "Text to speech leaderboard: controlled voice," Artificial Analysis. Accessed: Sep. 29, 2026. [Online]. Available: https://artificialanalysis.ai/text-to-speech/leaderboard/controlled-voice
3. ElevenLabs, "Text to speech best practices," ElevenLabs Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
4. M. San Segundo, S. López-Jareño, X. Wang, and J. Yamagishi, "Human perception of audio deepfakes," arXiv:2512.09221, Dec. 2025. Accessed: Sep. 29, 2026. [Online]. Available: https://arxiv.org/abs/2512.09221
5. ElevenLabs, "Can I publish the content I generate on the platform?," ElevenLabs Help Center. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform
6. Cartesia, "Pricing," Cartesia. Accessed: Sep. 29, 2026. [Online]. Available: https://cartesia.ai/pricing
7. ElevenLabs, "Professional voice cloning," ElevenLabs Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning
8. ElevenLabs, "Can I export my voice clones?," ElevenLabs Help Center. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/docs/help-center/product/voices/voice-cloning/can-i-export-my-voice-clones
9. Artificial Analysis, "Text to speech methodology," Artificial Analysis. Accessed: Sep. 29, 2026. [Online]. Available: https://artificialanalysis.ai/text-to-speech/methodology
10. ElevenLabs, "Eleven v4," ElevenLabs Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4
11. Cartesia, "Introducing Sonic 3.6," Cartesia, Aug. 2026. Accessed: Sep. 29, 2026. [Online]. Available: https://www.cartesia.ai/blog/sonic-3.6
12. Google, "Speech generation," Gemini API documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/speech-generation
13. Alibaba Cloud, "Qwen-Audio-3.0-TTS: more multilingual, easier to direct," Alibaba Cloud Blog, Jul. 2026. Accessed: Sep. 29, 2026. [Online]. Available: https://www.alibabacloud.com/blog/qwen-audio-3-0-tts-more-multilingual-easier-to-direct_603379
14. Inworld, "Realtime TTS-2," Inworld, Aug. 2026. Accessed: Sep. 29, 2026. [Online]. Available: https://inworld.ai/blog/realtime-tts-2
15. Speechify, "Models," Speechify Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://docs.speechify.ai/build/guides/concepts/models
16. VUI Labs, "Luna-TTS technical report," arXiv:2608.11593, Aug. 2026. Accessed: Sep. 29, 2026. [Online]. Available: https://arxiv.org/html/2608.11593
17. BreezeBlue, "Breeze-TTS-2," Hugging Face model card. Accessed: Sep. 29, 2026. [Online]. Available: https://huggingface.co/BreezeBlue/Breeze-TTS-2
18. TTS-AGI, "TTS Arena V2," Hugging Face Spaces. Accessed: Sep. 29, 2026. [Online]. Available: https://huggingface.co/spaces/TTS-AGI/TTS-Arena-V2
19. C. Minixhofer, O. Klejch, and P. Bell, "TTSDS: text-to-speech distribution score," arXiv:2407.12707, Jul. 2024. Accessed: Sep. 29, 2026. [Online]. Available: https://arxiv.org/pdf/2407.12707
20. ElevenLabs, "Audio tags 101: directing emotional TTS in Eleven v3," ElevenLabs Blog. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/blog/v3-audiotags
21. Hume AI, "Acting instructions," Hume Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://dev.hume.ai/docs/text-to-speech-tts/acting-instructions
22. OpenAI, "Text to speech," OpenAI API documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://developers.openai.com/api/docs/guides/text-to-speech
23. Resemble AI, "Chatterbox," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/resemble-ai/chatterbox
24. ElevenLabs, "Request stitching," ElevenLabs Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching
25. ElevenLabs, "Voice changer," ElevenLabs Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/docs/eleven-creative/playground/voice-changer
26. Y. Ren et al., "Revisiting over-smoothness in text to speech," in *Proc. ACL*, 2022. Accessed: Sep. 29, 2026. [Online]. Available: https://aclanthology.org/2022.acl-long.564/
27. D. Yang, T. Koriyama, and Y. Saito, "Frame-wise breath detection with self-training for breathing-aware speech synthesis," arXiv:2402.00288, Feb. 2024. Accessed: Sep. 29, 2026. [Online]. Available: https://arxiv.org/abs/2402.00288
28. Avid Pro Audio Community, "Walkie talkie vocal effect," Avid. Accessed: Sep. 29, 2026. [Online]. Available: https://duc.avid.com/home/forum/pro-tools-software/tips-tricks/114081-walkie-talkie-vocal-effect
29. 344 Audio, "Creative dialogue processing: essential methods for futzing and worldizing dialogue," 344 Audio. Accessed: Sep. 29, 2026. [Online]. Available: https://www.344audio.com/post/article-creative-dialogue-processing-essential-methods-for-futzing-worldizing-dialogue
30. Repeater Builder, "Squelch tails and reverse burst," Repeater Builder. Accessed: Sep. 29, 2026. [Online]. Available: https://www.repeater-builder.com/micor/andsquelch.html
31. Designing Sound, "Walter Murch special: the concept of worldizing," Designing Sound, Oct. 2009. Accessed: Sep. 29, 2026. [Online]. Available: https://designingsound.org/2009/10/07/walter-murch-special-the-concept-of-worldizing/
32. Wikipedia contributors, "Project 25," Wikipedia. Accessed: Sep. 29, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Project_25
33. RadioReference forums, "P25 voice is way inferior compared to analog," RadioReference. Accessed: Sep. 29, 2026. [Online]. Available: https://forums.radioreference.com/threads/p25-voice-is-way-inferior-compared-to-analog.342660/
34. Wikipedia contributors, "GLaDOS," Wikipedia. Accessed: Sep. 29, 2026. [Online]. Available: https://en.wikipedia.org/wiki/GLaDOS
35. Hardcore Gamer, "Cissy Jones on being the voice of Firewatch," Hardcore Gamer. Accessed: Sep. 29, 2026. [Online]. Available: https://hardcoregamer.com/features/interviews/cissy-jones-on-being-the-voice-of-firewatch/190152/
36. A. Kirkland, S. Mehta, H. Lameris, G. E. Henter, É. Székely, and J. Gustafson, "Stuck in the MOS pit: a critical analysis of MOS test methodology in TTS evaluation," in *Proc. Speech Synthesis Workshop*, 2023. Accessed: Sep. 29, 2026. [Online]. Available: https://www.isca-archive.org/ssw_2023/kirkland23_ssw.html
37. P. Varadhan et al., "The state of TTS: human fooling rates," arXiv:2508.04179, Aug. 2025. Accessed: Sep. 29, 2026. [Online]. Available: https://arxiv.org/abs/2508.04179
38. P. Anastassiou et al., "Seed-TTS: a family of high-quality versatile speech generation models," arXiv:2406.02430, Jun. 2024. Accessed: Sep. 29, 2026. [Online]. Available: https://arxiv.org/html/2406.02430v1
39. Google, "Gemini API pricing," Gemini API documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/pricing
40. ElevenLabs, "API pricing," ElevenLabs. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/pricing/api
41. ElevenLabs, "Pricing," ElevenLabs. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/pricing
42. Inworld, "Pricing," Inworld. Accessed: Sep. 29, 2026. [Online]. Available: https://inworld.ai/pricing
43. Google, "Gemini API additional terms of service," Google. Accessed: Sep. 29, 2026. [Online]. Available: https://ai.google.dev/gemini-api/terms
44. Boson AI, "higgs-audio-v3-tts-4b," Hugging Face model card. Accessed: Sep. 29, 2026. [Online]. Available: https://huggingface.co/bosonai/higgs-audio-v3-tts-4b
45. Coqui, "XTTS-v2 licence," Hugging Face. Accessed: Sep. 29, 2026. [Online]. Available: https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt
46. Qwen Team, "Qwen3-TTS," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/QwenLM/Qwen3-TTS
47. Nari Labs, "Dia," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/nari-labs/dia
48. Canopy Labs, "Orpheus TTS," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/canopyai/Orpheus-TTS
49. Zyphra, "Zonos," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/Zyphra/Zonos
50. Maya Research, "maya1," Hugging Face model card. Accessed: Sep. 29, 2026. [Online]. Available: https://huggingface.co/maya-research/maya1
51. StepFun, "Step-Audio-EditX," GitHub repository. Accessed: Sep. 29, 2026. [Online]. Available: https://github.com/stepfun-ai/Step-Audio-EditX
52. SAG-AFTRA, "2025 interactive media (video game) agreement," SAG-AFTRA. Accessed: Sep. 29, 2026. [Online]. Available: https://www.sagaftra.org/contracts-industry-resources/interactive/2025-interactive-media-video-game-agreement
53. Game Developer, "Embark Studios' The Finals uses text-to-speech AI for in-game voices," Game Developer. Accessed: Sep. 29, 2026. [Online]. Available: https://www.gamedeveloper.com/business/embark-studios-i-the-finals-i-uses-text-to-speech-ai-for-in-game-voices
54. Kotaku, "Arc Raiders replaced AI-generated content with human-recorded dialogue," Kotaku, Mar. 2026. Accessed: Sep. 29, 2026. [Online]. Available: https://kotaku.com/arc-raiders-replaced-ai-generated-content-human-recorded-dialogue-voices-2000678774
55. Game Developer, "Valve tweaks and clarifies AI disclosure rules for Steam," Game Developer, Jan. 2026. Accessed: Sep. 29, 2026. [Online]. Available: https://www.gamedeveloper.com/business/valve-tweaks-and-clarifies-ai-disclosure-rules-for-steam
56. European Commission, "Transparency obligations under Article 50 of the AI Act: FAQ," Shaping Europe's digital future. Accessed: Sep. 29, 2026. [Online]. Available: https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act
57. ElevenLabs, "Instant voice cloning," ElevenLabs Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning
58. Microsoft, "Create a consent statement for personal voice," Microsoft Learn. Accessed: Sep. 29, 2026. [Online]. Available: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-create-consent
59. Google, "Voice replication," Gemini API documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://ai.google.dev/gemini-api/docs/voice-replication
60. Unsloth, "Text-to-speech (TTS) fine-tuning," Unsloth Documentation. Accessed: Sep. 29, 2026. [Online]. Available: https://unsloth.ai/docs/basics/text-to-speech-tts-fine-tuning
