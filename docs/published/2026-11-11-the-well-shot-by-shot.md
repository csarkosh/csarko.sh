---
description: An award-winning AI short measured shot by shot: 122 shots, two reused camera set-ups, straight cuts only, a human score, and the record of how it was made.
published: 2026-11-11
categories: AI, Film
series: AI short films
related: reverse-engineering-an-ai-horror-short, horror-sequences-shot-by-shot, how-horror-directors-make-sound-carry-the-fear
---
# The Well: how an AI short reads as cinema

**Question:** "The Well" by Dorian & Daniel took Gold at Runway's AI Festival 2026: five and a half
minutes of snowbound crime drama played by a hare, a lynx, a wolf and a family of goats, with
dialogue that sounds acted and pictures that look photographed. How was it made, and which choices
of shot, cut, light and sound make it read as a studio film and not as a run of generated clips?

**Short answer:** less of it is generated than the label suggests, and almost none of its craft
is new. The only tools on record are ComfyUI, Nano Banana and Kling 3.0, used over years by two
award-winning commercial directors, and the film's own credits give the music and the sound to a
composer and an engineer at a commercial music house. The film is built the way a studio
interrogation scene is built: a few camera
[set-ups](#term "One camera position and framing. A scene is covered from a handful of them and cut between.")
reused many times, straight cuts only, a very dark frame lit from lamps and windows, a quiet room
set against loud memories. And it never asks a model for what models do badly: no human face, no
long physical action, no shot over 9.3 seconds.

![A timeline of The Well. A strip of 122 bars, one per shot, coloured by where the picture is: the present, the family's story, the sheriff's theory, or photographs. Below it, the loudness of the soundtrack second by second, with peaks at the torch flash, the break-in and the wall opening, and near silence before the blow.](timeline.svg "The whole film on one line. In the office scene the picture keeps leaving the room for a witness's story, the sheriff's theory and photographs; the sound is quiet in the room, loud in the memories, and almost silent just before the blow.")

**In numbers:**

- **122 shots in 5 minutes 14 seconds:** a mean of 2.57 s and a median of 2.29 s. Four shots run
  past 6 s, and each is a face at a turn in the story
  ([shot length](#122-shots-at-2-6-seconds-with-almost-no-long-takes)).
- **Two single set-ups carry 26 of the 39 shots** inside the office. The two-shot
  [master](#term "A wide shot that holds everyone in the scene and shows where they stand.")
  appears three times, and a low angle is held back until the sheriff has the answer
  ([coverage](#two-singles-carry-the-office-and-a-low-angle-waits-for-the-answer)).
- **41% of the three-minute conversation** is spent away from the room, in a witness's story, the
  sheriff's theory and photographs
  ([time layers](#41-of-the-conversation-is-somewhere-else)).
- **No dissolve, wipe or fade** until the credits: scenes join on a word, an object or a light
  ([joins](#every-join-is-a-straight-cut-hooked-on-a-word-an-object-or-a-light)).
- **A mean frame brightness of 34 on a scale of 0 to 255,** under half the darkest feature in a
  160-film study ([light](#half-as-bright-as-the-darkest-studio-feature-one-palette-per-place)).
- **About five seconds of near silence** before the killing blow, in a track whose loud passages
  sit 11 to 14 dB over its dialogue
  ([sound](#a-quiet-room-loud-memories-and-five-seconds-of-hush)).
- **Three tools named, none of them Runway's,** and a score and a mix by two people at a
  commercial music house
  ([the record](#on-record-three-tools-years-of-work-and-a-human-score)).

This is a companion to [Reverse engineering an AI horror short](/research/reverse-engineering-an-ai-horror-short).
That doc took a 45 second clip apart to find its recipe; this one takes a festival film apart and
sets its numbers against published measurements of studio films. Every figure about the film was
measured from Runway's upload of it [1], as it stood on Nov 11, 2026; the last section
says how.

## A Grimm tale turned inside out, in three parts

The film opens on a card, "Inspired by the Brothers Grimm: The Wolf and the Seven Young Goats".
In the tale a wolf eats the kids, the mother cuts them out, and the wolf drowns in a well. Here a
hare sheriff and a lynx detective stand over a wolf found dead at the bottom of a well in a
trailer park. The festival's synopsis: "A tragic accident - or so they say. But when a
sharp-witted hare starts to investigate, the truth shifts" [2]. The goats are the criminals and
the wolf is the victim.

| Part | Time | Shots | Mean shot | What happens | Speech |
|---|---|---|---|---|---|
| Opening | 0:00 to 0:49 | 16 | 3.06 s | A drive, the titles, the arrival, the body | 20 words of narration |
| Office | 0:49 to 4:03 | 80 | 2.43 s | The two argue the case over the photographs | 283 words |
| Finale | 4:03 to 5:14 | 26 | 2.73 s | The hare goes back alone, climbs down, and finds out | none |
| Credits | 5:14 to 5:29 | | | Black, then one last picture | none |

## On record: three tools, years of work and a human score

**The makers.** Dorian Lebherz and Daniel Titz are commercial directors, represented in the US,
the UK, Germany and France [3], who met at film school in 2012 and are based in Berlin and
Vancouver [4]. Their agent's biography lists five D&AD pencils, four Clios and three Cannes
Lions for one Samsung campaign [4]. They are not newcomers who found a model; they are
directors with a decade of paid work who picked up a new camera.

**The tools.** One sentence is on record, a reporter's paraphrase of an interview: "The project
took years to make, evolving along with the technology; first, using early platform ComfyUI, then
more recent image generators Kling 3.0 and Nano Banana" [5]. Kling is a video model and
Nano Banana an image model, so the likely reading is stills first, then stills animated, which is
how the duo described making an earlier short: an image workflow in ComfyUI on FLUX, a custom
[LoRA](#term "A small add-on trained on a few dozen pictures so that an image model keeps drawing the same character or style.")
for the lead, Daniel Titz's own photographs "to guide the light and style", and Photoshop to
finish each still [6]. No Runway model is named anywhere, and the festival did not ask for
one: its rules call for video made with "tools similar to Runway's" [7].

**The score and the sound.** The makers' own uploads carry no credits, and the festival page
lists only the directors. The film's end cards do carry two: "Music by Bernhard Pausch, Supreme
Music" and "Sound by Moritz Irion, Supreme Music". Supreme Music is a German company that makes
music and sound for advertising and film; Pausch is a composer and producer on its staff
[8] and Irion an audio engineer in its post-production division [9].
So the two things a viewer hears under the voices, the score and the mix, are human work from the
same commercial world the directors come from.

**The volume of work.** No count is published for this film. A collaborator of the duo finished
her own short the same spring, with tools that include the two named last for The Well, and
published hers: about 2,490 images
and 2,010 videos generated for 192 shots in the cut, over about 205 hours [10]. That is 13
stills and 10 clips made for each shot kept. "99.9% of video clips started from an image, not
from text alone" [10].

As of Nov 11, 2026, nothing else is published: no voice credit, no editor, no grade, no team size.

## The voices: a human in the chain, most likely

Nothing is on record about the voices, and no cast is credited. Three things can be said.

**The faces move with the words.** On the lynx's longest close-up (7.5 s), the frame-to-frame
change in the face tracks the loudness of the speech with a correlation of 0.73 and no lag; on
the hare's longest (9.3 s) it is 0.65. The face moves about twice as much while a line is spoken
as between lines. A silent clip with a voice laid over it afterwards would not show that. A shot
generated together with its line would, and so would a shot driven by a recorded performance.

**The tool can do either.** Runway's model list describes Kling 3.0 Pro as image to video
of 3 to 15 seconds "with optional audio" [11], and its motion-control mode "transfers full-body movement,
hand gestures, and facial expressions from the reference video to the character in your image"
[12].

**The nearest precedents put a person in the chain.** On the duo's previous short, the same
collaborator "recorded real voice performances and ran them through ElevenLabs' voice changer to
get human-grounded dialogue" [10]. The festival's Grand Prix winner went the other way
round: its festival listing, read here from a search excerpt, describes dialogue generated with the
picture and then redubbed through a voice tool so that one character keeps one voice
[13]. The vendor's own
documents say why a read beats a script: its voice changer keeps "the performance nuances of the
original" [14], while the tags that steer its text-to-speech model are "not perfect yet"
[15].

So the honest answer is that the method is unknown, and the likely one is a recorded read, by an
actor or by the directors, somewhere under each line.

What can be measured is the delivery. The office scene has 283 words in 190 seconds, 89 words for
each minute of the scene, with 17 gaps of more than three seconds between words and three of
about eight. A study of subtitle timings puts the typical gap between lines in recent films at
about two seconds, half what it was in the early 1960s [16]. The film talks like an older
film. Editor Chris McCaleb's phrase for it is "spending some time in that silence" [17].

## 122 shots at 2.6 seconds, with almost no long takes

- **Fast for a feature.** Average shot length in Hollywood films fell "to below 4 s after 2000"
  [18]; David Bordwell finds it not "uncommon to find films with average shot lengths
  of 2-4 seconds" [19]. One editor's count gives David Fincher's features a mean of 3.87 s, with The
  Girl with the Dragon Tattoo at 3.2 s [20]. The Well's 2.57 s is quicker than all of them.
- **No long tail.** In Barry Salt's examples the median shot is about half the mean, because a few
  long takes pull the mean up [21]. Here the median is 0.89 of the mean. 82 of the 122 shots
  last between one and three seconds, eight are under a second, and four are over six.
- **The four long shots are faces at turns in the story:** the hare working it out (9.3 s), the
  lynx's "just another dead crackhead" (7.5 s), the hare walking into the hidden room (6.3 s),
  the lynx's "how did he end up down there dead?" (6.0 s). Fincher's editor Kirk Baxter describes
  the same spending: "move closer in as we get to the point of a scene, and then deliver your
  punch-in-the-nose in a big fat close up" [22].
- **Every shot fits inside one generated clip.** The longest is 9.3 s; Kling 3.0 clips run to 15 s
  [11]. Nothing in the film needed two clips joined.

| Size | Shots | Seconds |
|---|---|---|
| Medium close-up | 26 | 68 |
| Close-up | 25 | 74 |
| Medium | 25 | 61 |
| Insert (an object, a photograph, feet) | 23 | 44 |
| Wide | 18 | 51 |
| Extreme wide | 3 | 13 |
| Extreme close-up (both are eyes) | 2 | 3 |

The camera is nearly still. About 15 shots are locked off, about 30 drift slightly, about a
third carry a slow push in, and nine are handheld: the wolf's break-in, his exit and his fall. There is no whip pan and no zoom. Camera operator Peter Rosenfeld on working for
Fincher: "The camera never moves unless it's motivated" [23].

## Two singles carry the office, and a low angle waits for the answer

The office scene is 39 shots of two characters in one room, covered from eight positions:

| Set-up | Uses | Time |
|---|---|---|
| Hare alone, from below, window behind | 15 | 42.6 s |
| Lynx alone, close, map out of focus behind | 11 | 32.8 s |
| Lynx in profile, lamp behind | 3 | 5.8 s |
| Both, wide and locked off (the master) | 3 | 6.0 s |
| From the ceiling, through a fan | 1 | 1.5 s |
| Hare from the front, bending over the desk | 1 | 2.6 s |
| Hare from desk height, ceiling light behind | 3 | 14.8 s |
| Lynx from desk height | 2 | 7.7 s |

- **This is the studio norm.** Bordwell, on a 1998 studio comedy: "Nearly every line or reaction
  ... gets a shot to itself", and the "sustained two shot is
  practically an endangered species" [19]. The master appears at
  three changes of direction in the argument and nowhere else.
- **The low angle is saved.** Neither desk-height set-up is seen until 3:26, when the hare says
  "The ice down there. It was thin." From there to the scene's last shot the room is seen only
  from below.
- **The line leads the picture.** One question runs over three pictures: "And they didn't" (a
  case file), "see or hear" (the master), "the fight?" (the hare). Baxter: "I try to let the
  dialogue lead the picture edits"; cut on every line and "it ends up looking like a porno"
  [22].
- **Eight of the 39 shots are silent looks,** three of them in a row (6.4 s) before "I'm not
  buying it."
- **The hare stays frame left and the lynx frame right** for the whole scene.

For a generated film the table has a second meaning. A set-up used 15 times is one framing, one
light and one background to get right once, and it is the same picture every time the film
returns to it.

## 41% of the conversation is somewhere else

| Where the picture is | Shots | Time |
|---|---|---|
| The office | 39 | 113.8 s |
| The family's story, as the lynx repeats it | 20 | 41.1 s |
| The sheriff's theory | 12 | 24.3 s |
| Photographs and file pages | 9 | 14.9 s |

- **It is an old device.** Bordwell describes the flashback that is "a sort of visual
  illustration of what is told", often "testimony in a trial or investigation" [24],
  and, in Knives Out, a detective's own reconstruction of the same night with one action changed
  [25].
- **The room is never left alone for long.** The longest unbroken stay in the office is 24.9
  seconds; most are under ten.
- **The voice carries on over the pictures.** The lynx's account of the break-in runs 44 seconds
  across 22 shots, and five of them are his own face.
- **The picture arrives on its noun.** "That guy who was chopping wood nearby" and the boar is on
  screen; "on the couch watching TV" and the television is. Bordwell calls a line answered by a
  picture a "dialogue hook" [26].
- **Each version has its own look.** The room is green-grey, locked off and quiet. The family's
  story is the warmest and loudest thing in the film, and its violence is handheld. The sheriff's
  theory is cold, still, and at one point two cuts of a third of a second each. Mindhunter's
  colourist describes the habit: "let each scene or location live as a 'postcard' unto itself"
  [27].

## Every join is a straight cut, hooked on a word, an object or a light

Cutting's measurements of Hollywood films found, in Bordwell's summary, "the absence of
'lingering' punctuation by fade-outs or dissolves" [28]. The Well has none before its
credits. What it uses instead:

1. **A light and an object (0:44).** The torch finds the body at the bottom of the well; from
   inside the well the torch swings into the lens and whites out the frame (0.4 s); the body
   appears as a photographic negative (0.5 s); then as a print on a desk; then the office from
   the ceiling. Place and time change on one object. Bordwell: "An image can hook to an image.
   This is rarer" [26]. The sound falls 16 to 19 dB across it.
2. **A word.** The dialogue hooks above.
3. **A photograph.** A print sits between the room and the event it records, in both directions.
4. **A thought (3:35).** Paws hit the ice (0.4 s), the ice stars (0.3 s), blood, the wolf's head:
   the sheriff's idea at the speed he has it.
5. **A line to a landscape (4:03).** "I got to go." Cut to the forest from the air. Bordwell's
   example of the same join is a line, then "the dome of the Library of Congress" [26].
6. **Black (5:14).** A push into the goat father's glasses on a crescendo, then black and digital
   silence.

One picture returns five times: the disc of light at the top of the well, seen from below under
the opening credit, in the family's story and when the hare climbs down, and from above when the
body is found and under the last credit.

## Half as bright as the darkest studio feature, one palette per place

- **The frame** is 2.40 to 1, letterboxed.
- **The darkness.** Cutting's group measured the median pixel value of every frame of 160 films
  and averaged it; the darkest was a 2010 Harry Potter film at 72.1 on a scale of 0 to 255
  [18]. By the same measure The Well is 33.8: 49.0 in the opening, 32.5 in the office,
  26.9 in the finale. (Their films were measured from DVDs and this one from a YouTube encode, so
  the comparison is approximate.)
- **The sources.** Every interior has its light in the frame or just outside it: a window behind
  the hare, a lamp behind the lynx, a ceiling fixture in the low angles, the mouth of the well.
  Neither detective is lit from the front. Erik Messerschmidt on Mindhunter: "Let the room light
  the actors" [29]. Jeff Cronenweth on Fight Club: "Faces were generally underexposed
  1 and 1/2 to 2 stops" [30]. Roger Deakins: "as though somebody sitting in a room by a
  lamp is being lit by that lamp" [31].
- **The palettes.** Exteriors are cyan and drained, with the red of a patrol car's light as the
  only warm colour. The office is green-grey with one tungsten lamp. The trailer in the family's
  story is amber. The well and what is under it are blue-black. Darius Khondji on Seven: "a
  practical is usually orange with a ¼ to full CTO or a very cool green" [32].
- **The focus.** Shallow on the singles, deep on the wides.

Darkness is also kind to a generator. A face half in shadow has half as much to get wrong, and
the file pages on the desk carry scribble under one readable word, on screen for under two seconds.

## A quiet room, loud memories and five seconds of hush

- **The level.** The upload measures -16.3 LUFS with a loudness range of 14.7 LU. YouTube plays
  back at a reference of -14 LUFS [33], so it is not turned down. Netflix's guidance for a
  programme's range is 4 to 18 LU [34]; the EBU notes that The Matrix at 25 LU "is probably
  challenging for most living rooms" [35]. This is a film mix sized for a laptop.
- **The room.** Voices sit in the centre over a thin held score and room tone. Between lines the
  track falls to about -35 dBFS. There is almost no bass in the office.
- **The memories.** The break-in runs at -7 to -15 dBFS for 25 seconds, with the bass 15 to 25 dB
  above the room's. The film's loudness follows its time layers.
- **The hush.** From 4:58 to 5:02 the goat father comes into focus behind the hare and the film
  cuts to the hare's eyes. The track drops to between -43 and -54 dBFS, its quietest point. The
  blow lands at -12. Sound editor Katie Maynard: "we'll usually cut out of anything we can to give
  a breath of silence before a huge hit" [36]. Mixer Michael Babcock: "you're pulling things
  out. So the next thing has a moment to really read" [37].
- **The end.** The last crescendo reaches -9 dBFS and is cut to black; two seconds later the
  track is at -79.

A generated film is in the position of an animated one. David Kamp, who scores and designs sound
for animated shorts: "I usually start from silence since animation has no production sound"
[38]. Everything heard in The Well was put there.

## A fair clue, a chance word and a last act without words

- **The clue is shown before it is named.** The ice at the bottom of the well is on screen at
  0:44, in the torch beam, and again as a print at 1:19. It becomes a clue at 3:16. S. S. Van
  Dine's first rule: "The reader must have equal opportunity with the detective for solving the
  mystery" [39]. Bordwell on the same tradition: information planted to be "neglected by the
  reader ('I should have noticed that!')" [25].
- **A word solves it.** "Just another dead crackhead." "Crack? ... The ice." The pun is doing
  double work, since ice is also what is being cooked under the well. The hare's shot for
  "Crack? ... The ice." lasts 5.7 seconds.
- **The tale is planted in the film.** The goat kids are watching an old cartoon of a wolf chasing
  kids when the wolf comes through the door.
- **The last 71 seconds have no words.** The hare walks, climbs, looks, presses a stone, and
  understands; the picture carries all of it.
- **The end returns to the start.** Under the last credit, a body lies at the bottom of the well,
  seen from above, as the wolf's was. Baxter on Gone Girl: "there's actually a lot of bookending
  ... You visually see it blocked and staged the same way" [40].

## The film never asks a model for what models do badly

Read off the shot log:

- **No human face and no human hand.** A paw holds a notebook, a torch and a bat, each in one
  short shot.
- **No long action.** The killing is a wind-up (1.3 s), a blur (0.46 s), a follow-through (1.5 s)
  and a body on the floor.
- **Nobody talks while moving through a space.**
- **No text to read** beyond one header.
- **The fastest motion is the hardest to inspect:** handheld, backlit, full of dust, under three
  seconds a shot.

Other film-makers say this aloud. Yonatan Dor: "We on purpose select styles that are destroyed in
the first place" [41]. Léo Cannone set a festival film inside a child's camcorder, "overexposed,
sun-bleached, slightly soft" [42]. And the volume is real work: the Grand Prix winner's
"biggest lesson has been that prompting is not directing" [43]; of a Sundance short made
with Google's models, "No final shots were 'one-click' generations" [44].

## A recipe to take from it

These are inferences from the measurements, not the makers' statements.

1. **Write for the tools.** Characters whose faces forgive, a story of talk and stillness, action
   that happens in the cut.
2. **Plan set-ups, not shots.** List the six to nine camera positions a scene needs, make one
   reference still for each, and return to them.
3. **Give every line a picture.** Decide for each phrase whether the film is on the speaker, on
   the listener, or on the thing being named.
4. **Mark the holds first.** Keep most shots between one and three seconds and spend the few long
   ones on faces at turns.
5. **Cut straight, and choose a hook for every scene change:** a word, an object, a light, or
   black.
6. **One palette for each place and each version of events,** one visible source of light, faces
   kept under.
7. **Put a person under every line.** Record the read, convert the voice if it must change, and
   make the picture to the recording.
8. **Compose the track.** A score written to the cut, dialogue as the anchor, a bed of room tone
   under everything, the loud passages placed, and silence spent before the hit.
9. **Budget for selection.** About 13 stills and 10 clips for each shot kept, on the one
   comparable film with published counts [10].

## How this was measured, and what is not known

- **Cuts.** ffmpeg's scene-change score on every frame of the 1080p upload [1], then a
  second pass on contrast-equalised frames, which found four cuts hidden in the dark scenes. Each
  of the 122 shots was then read from its first, middle and last frame and tagged by hand for
  size, angle, set-up and time layer.
- **Camera movement** is an estimate from feature tracking between frames and is the least
  certain figure here; a moving subject can pass for a moving camera.
- **Sound.** EBU R 128 loudness, and RMS level for each half second in five frequency bands.
  Levels in dBFS are RMS, not peaks. The words and their times are from YouTube's automatic
  captions.
- **Brightness.** The median luma of every third frame inside the picture area, averaged.
- **Not known:** how the voices were made, who edited and graded the film, how many images and
  clips were generated, and which image model ran inside ComfyUI. The festival asked each entrant
  for "a short, written description of the AI techniques used" [7]; as of Nov 11, 2026,
  that description is unpublished.
- **Another account exists.** A third-party article of Sep 16, 2026 covers the film's tools from
  the same magazine sentence [45]. The numbers here were made independently of it.

## Sources

1. Runway, "The Well, Dorian & Daniel | Runway AI Festival 2026," YouTube, Jun. 19, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://www.youtube.com/watch?v=yBs_pMUDrrk
2. Runway, "AIF 2026," Runway AI Festival. Accessed: Nov. 11, 2026. [Online]. Available: https://aif.runwayml.com/
3. D. Lebherz and D. Titz, "About," Dorian & Daniel. Accessed: Nov. 11, 2026. [Online]. Available: https://doriandaniel.com/about.html
4. Wanda, "Dorian & Daniel: bio," Wanda Productions. Accessed: Nov. 11, 2026. [Online]. Available: https://wanda.net/directors/dorian-and-daniel/bio
5. A. Kaufman, "Putting the Art in Artificial," Filmmaker Magazine, Aug. 12, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://filmmaker.substack.com/p/putting-the-art-in-artificial
6. D. Titz, "Crafting Ava - an AI Short Film," Idlespace, Mar. 31, 2025. Accessed: Nov. 11, 2026. [Online]. Available: https://idlespace.ca/ava-chapter-one/
7. Runway, "Runway 2026 AI Festival Official Rules - Film," Runway AI Festival. Accessed: Nov. 11, 2026. [Online]. Available: https://aif.runwayml.com/terms-film
8. Supreme Music, "Bernhard Pausch: Composer," Supreme Music. Accessed: Nov. 11, 2026. [Online]. Available: https://www.suprememusic.de/crew/bernhard-pausch
9. Supreme Music, "Moritz Irion: Audio Engineer," Supreme Music. Accessed: Nov. 11, 2026. [Online]. Available: https://www.suprememusic.de/de/crew/moritz-irion
10. C. Kiessling, "How I purposefully shot myself in the foot making my latest short film," Idlespace, Apr. 20, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://idlespace.ca/how-i-purposefully-shot-myself-in-the-foot-making-my-latest-short-film/
11. Runway, "Available AI Models," Runway API documentation. Accessed: Nov. 11, 2026. [Online]. Available: https://docs.dev.runwayml.com/guides/models/
12. Runway, "Creating with Kling 3.0 Motion Control," Runway Help Center, Mar. 26, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://help.runwayml.com/hc/en-us/articles/50280558448147-Creating-with-Kling-3-0-Motion-Control
13. R. Gaudette, "A Face Only A Mother Could Love," FilmFreeway. Accessed: Nov. 11, 2026. [Online]. Available: https://filmfreeway.com/AFaceOnlyAMotherCouldLove
14. ElevenLabs, "Voice changer," ElevenLabs documentation. Accessed: Nov. 11, 2026. [Online]. Available: https://elevenlabs.io/docs/capabilities/voice-changer
15. ElevenLabs, "Prompting Eleven v3," ElevenLabs documentation. Accessed: Nov. 11, 2026. [Online]. Available: https://elevenlabs.io/docs/best-practices/prompting/eleven-v3
16. S. Follows, "Has the way movies use dialogue changed?," Stephen Follows, Apr. 21, 2025. Accessed: Nov. 11, 2026. [Online]. Available: https://stephenfollows.com/p/has-the-way-movies-use-dialogue-changed
17. Y. Baranovsky, "How To Edit With Silence, From TV Editor Chris McCaleb," Frame.io Insider, May 8, 2017. Accessed: Nov. 11, 2026. [Online]. Available: https://blog.frame.io/2017/05/08/edit-with-silence/
18. J. E. Cutting, K. L. Brunick, J. E. DeLong, C. Iricinschi, and A. Candan, "Quicker, faster, darker: Changes in Hollywood film over 75 years," *i-Perception*, vol. 2, no. 6, pp. 569-576, 2011. Accessed: Nov. 11, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC3485803/
19. D. Bordwell, "Intensified continuity revisited," Observations on Film Art, May 27, 2007. Accessed: Nov. 11, 2026. [Online]. Available: https://www.davidbordwell.net/blog/2007/05/27/intensified-continuity-revisited/
20. V. Nedomansky, "Revealing Every Single Shot in 'Gone Girl' & 'Girl With the Dragon Tattoo' in 1 Image," VashiVisuals, Aug. 7, 2017. Accessed: Nov. 11, 2026. [Online]. Available: https://vashivisuals.com/?p=6888
21. B. Salt, "Graphs and Numbers," Cinemetrics. Accessed: Nov. 11, 2026. [Online]. Available: https://cinemetrics.uchicago.edu/article/4bae8cac-cceb-452a-b6e6-1aa2df4fa76a
22. S. Hullfish, "Art of the Cut on editing Mindhunter with Kirk Baxter, ACE and Tyler Nelson," ProVideo Coalition, Dec. 21, 2017. Accessed: Nov. 11, 2026. [Online]. Available: https://www.provideocoalition.com/aotc-mindhunter
23. J. Light, "Camera Operating for David Fincher: 40 Takes and No Pans," No Film School, Oct. 13, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://nofilmschool.com/david-fincher-never-pans
24. D. Bordwell, "Grandmaster flashback," Observations on Film Art, Jan. 27, 2009. Accessed: Nov. 11, 2026. [Online]. Available: https://www.davidbordwell.net/blog/2009/01/27/grandmaster-flashback/
25. D. Bordwell, "Enter Benoît Blanc: KNIVES OUT as murder mystery," Observations on Film Art, Aug. 4, 2022. Accessed: Nov. 11, 2026. [Online]. Available: https://davidbordwell.net/blog/?p=48988
26. D. Bordwell, "The Hook: Scene Transitions in Classical Cinema," David Bordwell's website on cinema, Jan. 2008. Accessed: Nov. 11, 2026. [Online]. Available: https://www.davidbordwell.net/essays/hook.php
27. FilmLight, "Creating a unique HDR look for 'Mindhunter': A Q&A with producer Peter Mavromates and colourist Eric Weidt," FilmLight, 2017. Accessed: Nov. 11, 2026. [Online]. Available: https://www.filmlight.ltd.uk/pdf/casestudies/CS_Mindhunter.pdf
28. D. Bordwell, "Movies by the numbers," Observations on Film Art, Jul. 14, 2022. Accessed: Nov. 11, 2026. [Online]. Available: https://www.davidbordwell.net/blog/?p=48879
29. H. DuBois, "Why David Fincher's 'Mindhunter' DP Believes 'There Are No Rules' in Lighting," No Film School, Oct. 13, 2017. Accessed: Nov. 11, 2026. [Online]. Available: https://nofilmschool.com/2017/10/mindhunter-dp-discusses-how-there-are-no-rules-lighting
30. C. Probst, "Fight Club: Anarchy in the U.S.A.," American Cinematographer, Nov. 1999. Accessed: Nov. 11, 2026. [Online]. Available: https://theasc.com/articles/flashback-fight-club
31. NPR, "Roger Deakins, Keeping An Eye On The Small Things," All Things Considered, Oct. 29, 2009. Accessed: Nov. 11, 2026. [Online]. Available: https://www.npr.org/2009/10/29/114249616/roger-deakins-keeping-an-eye-on-the-small-things
32. D. E. Williams, "Seven: Sins of a Serial Killer," American Cinematographer, Oct. 1995. Accessed: Nov. 11, 2026. [Online]. Available: https://theasc.com/articles/flashback-seven-1995
33. I. Shepherd, "YouTube Changes Loudness Reference to -14 LUFS," MeterPlugs, Sep. 18, 2019. Accessed: Nov. 11, 2026. [Online]. Available: https://www.meterplugs.com/blog/2019/09/18/youtube-changes-loudness-reference-to-14-lufs.html
34. Auphonic, "Dialog loudness normalization," Auphonic Blog, Oct. 8, 2020. Accessed: Nov. 11, 2026. [Online]. Available: https://auphonic.com/blog/2020/10/08/dialog-loudness-normalization/
35. European Broadcasting Union, "Guidelines for production of programmes in accordance with EBU R 128," EBU Tech 3343, ver. 4, Nov. 2023. Accessed: Nov. 11, 2026. [Online]. Available: https://tech.ebu.ch/docs/tech/tech3343.pdf
36. T. Vindigni, "Lesson Learned: The Power In Less," Boom Box Post, Mar. 3, 2020. Accessed: Nov. 11, 2026. [Online]. Available: https://boombox-post.squarespace.com/blog/2020/2/27/wip
37. J. Light, "How 'Heretic's Sound Team Plays with Fear and Silence," No Film School, Nov. 20, 2024. Accessed: Nov. 11, 2026. [Online]. Available: https://nofilmschool.com/heretic-sound-design
38. R. Munday, "The Importance of Sound with David Kamp," Short of the Week, Jul. 24, 2023. Accessed: Nov. 11, 2026. [Online]. Available: https://www.shortoftheweek.com/news/the-importance-of-sound-david-kamp
39. S. S. Van Dine, "Twenty Rules for Writing Detective Stories," The American Magazine, Sep. 1928. Accessed: Nov. 11, 2026. [Online]. Available: https://www.umsl.edu/~gradyf/film/vandinerules.htm
40. I. Failes, "Maintaining the mystery: editor Kirk Baxter on Gone Girl," fxguide, Oct. 2, 2014. Accessed: Nov. 11, 2026. [Online]. Available: https://www.fxguide.com/fxfeatured/maintaining-the-mystery-editor-kirk-baxter-on-gone-girl/
41. W. Smith, "The Dor Brothers Generate Fifty Clips and Keep Two," The Daring Creatives, Sep. 23, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://www.thedaringcreatives.com/creator-stories/the-dor-brothers-fifty-clips-keep-two/
42. W. Smith, "Léo Cannone Tells His AI Stories Through a Child's Camera," The Daring Creatives, Oct. 14, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://www.thedaringcreatives.com/creator-stories/leo-cannone-nonna-gigante-ai-series/
43. D. Allegretti, "'Prompting is not directing': how Robert Gaudette turned a drawer full of scripts into an AI film sweeping awards," Envato Elements, Jul. 29, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://elements.envato.com/learn/a-face-only-a-mother-could-love
44. VP Land, "Google Premieres AI-Animated Short at Sundance, Demonstrates New Workflow for Creative Control," VP Land, Jan. 29, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://www.vp-land.com/stories/google-premieres-ai-animated-short-at-sundance-demonstrates-new-workflow-for-creative-control
45. W. Smith, "Dorian & Daniel Started The Well in ComfyUI and Finished It in Kling," The Daring Creatives, Sep. 16, 2026. Accessed: Nov. 11, 2026. [Online]. Available: https://www.thedaringcreatives.com/creator-stories/dorian-daniel-the-well-ai-short-film/
