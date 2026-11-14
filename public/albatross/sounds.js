// The stone creatures' sounds: stone grinding on stone as they move.
//
//   sounds.listen(camera, ear?)                      once a frame, before the statues are placed
//   sounds.neck(key, x, y, z, s, dTwist, dCurl, dt)  a statue's neck turned this much this frame
//                                                    (radians of twist and of curl): a grind follows
//                                                    its speed, a drag plays as it unsticks after
//                                                    standing still, and as it reverses — side to
//                                                    side a short scrape, up and down a drag
//   sounds.scrape(x, y, z, s)                        a hand sets off on a move: one long scrape
//   sounds.sea(dist, touching, height)               once a frame: how far the bird is from the water
//                                                    (world units, across to the waterline or up from
//                                                    the surface, whichever way is nearer), whether it
//                                                    is skimming it, and how high it is above the
//                                                    surface. The ocean's wash comes up as it nears and
//                                                    dies as it leaves; the surf comes up while it
//                                                    skims; as it touches down, a splash if it dove in
//                                                    from a great height, a wash of surf if it came in low
//   sounds.arm(key, x, y, z, s, dYaw, dCurl, dUp, dt) an arm swung this much this frame (radians
//                                                    round and of fold, head units up): a grind
//                                                    follows its speed, as a neck's does
//   sounds.ping(key, x, y, z, id, now?)              a lantern: a sonar ping from it as it lights (now), and
//                                                    every so often while the bird is near (SOUND.ping)
//   sounds.rumble(key, x, y, z, s, speed)            a sea head rising or sinking this fast (its share of
//                                                    its fastest): the rumbles loop under it (SOUND.rumble)
//
// Everything is placed: silent at the edge of a hearing range that grows
// with the statue's size, swelling in to full at the statue, panned by its
// bearing from the camera, and pitched down the bigger the statue. Every
// sound has an attack and a release, so nothing clicks on or off. Nothing
// plays until the first key or click (browsers won't start audio before
// one); M mutes.
//
// The clips (sounds/): five stone scrapes, stone-scrape-01 to -05, 1.2 to
// 2.3 s each, and nothing else. Every sound is one of them: a neck's grind
// is a stream of short slices of them, overlapping, each from a different
// clip at a different point (SOUND.grind.grain; it looped one clip's middle
// once, and a scrape a second or two long, looped, came round and round and
// read as an echo of itself), the hands and
// the side-to-side reversals play a long one through, and unsticking and the
// up-and-down reversals a short one. Each clip's gain evens the recordings
// to one level (their means ran from -22 to -27 dB); LEVEL sets each use
// against the others. To trim a clip of its silence:
//   ffmpeg -i in.mp3 -ss <start> -to <end> -c:a libmp3lame -b:a 160k out.mp3
import * as THREE from "three";

const RELAXING_MUSIC_TRACKS = [
  "sounds/bgm.mp3",
  "sounds/bgm-floating-cities.mp3",
  "sounds/bgm-clean-soul.mp3",
  "sounds/bgm-air-prelude.mp3",
  "sounds/bgm-almost-in-f.mp3",
  "sounds/bgm-deep-haze.mp3",
];

function pickRandomTrack(excludeFile = null) {
  const pool = excludeFile && RELAXING_MUSIC_TRACKS.length > 1
    ? RELAXING_MUSIC_TRACKS.filter((f) => f !== excludeFile)
    : RELAXING_MUSIC_TRACKS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const SOUND = {
  volume: 0.8, // the master, 0 – 1
  music: {
    file: "sounds/bgm.mp3", // "Ambient Samurai", Ichiro Nakagawa (Music For Dictionary Apps): looped under everything
    gain: 0.3, // its level against the stone (the recording is loud: -16 dB mean, the scrapes -22 to -27, evened)
    fadeIn: 5, // seconds it takes to come up at the start
  },
  // The sea (sounds/ambient-ocean, surf, surf-2: streamed like the music,
  // looped, through the master so M mutes them too)
  sea: {
    file: "sounds/ambient-ocean.mp3", // the wash: quiet, and heard whenever the bird is near the water
    gain: 0.35, // its level at the water (the recording's mean is -34.5 dB: this brings it to about -43, a bed under the music; was 0.8, about -36, and it read as rain under everything)
    near: 35, // world units from the water, across or up, at which the wash starts to be heard; full at the water (was 60: over this sea, nearly always)
    swell: 1.5, // 1 = evenly from the edge, higher = quiet most of the way in and swelling over the last stretch
    fade: 2, // seconds the wash takes to come up as the bird nears, or die as it leaves
    // The surf, while the bird skims the water: every clip at once, each at its own level
    surf: [
      { file: "sounds/surf.mp3", gain: 0.45 }, // 37 s, mean -29 dB (was 0.8)
    ],
    dive: [0.6, 2.5], // seconds the surf takes to come up as the bird touches the water, and to die away after it lifts off
    // As the bird touches down, one clip played through: a splash if it came
    // from high, surf if low. "From" is the highest it has been lately, which
    // sinks by `forget` units a second, so a slow glide down counts as low and
    // only a dive (about 9 units a second at its steepest) keeps its height
    high: 20, // world units above the water at or over which the touchdown is a splash
    forget: 4, // world units a second the remembered height sinks
    landing: 0.55, // its level against the wash and the surf (was 0.9)
  },
  // The lanterns (sounds/ping-1 to -4: sonar pings): one plays, from the
  // lantern, as it lights with the bird coming near (main.field.js
  // stepLanterns), at its own pitch, whatever the hour
  ping: {
    level: 0.85, // its level against the stone: under the music, a part of it rather than over it (was 1.6; 0.7 before that)
    hear: 120, // world units it is heard over, silent past it (the bird lights a lantern from LANTERN_GLOW.wake, 26, so a ping starts well inside this); each ping swells and fades with the bird's distance as it sounds (was 90)
    gap: 0, // seconds between one ping and the next in the whole field, at least: none, every lantern that lights sounds (was 1.2)
    spacing: 0, // world units: a lantern lighting within this of one that pinged in the last `quiet` seconds lights without a note: none, every one sounds (was 40, a grove a note or two)
    quiet: 6, // seconds
    every: 0, // seconds: a lit lantern with the bird within its hearing pings again this often (give or take a fifth, each its own), louder the nearer the bird; 0 = only as it lights (4 was tried: the lamps kept beeping)
    // Each ping plays on one of these, never the same twice running (a
    // note listed twice comes up twice as often): the music's notes, the D
    // major pentatonic (D E F# A B), D and A, its strongest, most; and now
    // and then a colour from outside it, strange but bright, never dark:
    // G# (the raised fourth, the Lydian's: dreamy, floating) and C# (the
    // major seventh, the music's own leading tone). No F, Bb or Eb: those
    // turn it minor, and eerie
    notes: ["D5", "D5", "E5", "F#5", "A5", "A5", "B4", "B5", "D5", "E5", "A5", "F#5", "G#5", "C#5"],
    // The lamps (sounds/2_lamp-1, 3_lamp-2, 4_lamp-3: long, bell-like) the
    // same, about their own register. Each plays an octave up from where it
    // was recorded (`up`, semitones; a clip's own `up` may say otherwise),
    // out of the music's bass, and is let go after `tail` seconds rather
    // than ringing on under the next
    lampNotes: ["D5", "D5", "E5", "F#5", "A5", "A5", "B4", "D5", "E5", "A5", "F#5", "G#5", "C#5"],
    up: 12,
    tail: 3,
  },
  // A sea head rising or sinking (main.field.js SEA): the two rumbles
  // (sounds/rumble-1, -2) looped over each other, from the head, as loud
  // as it is moving, pitched down the bigger it is
  rumble: {
    level: 1.2, // its level against the stone
    full: 0.7, // the share of SEA.climb (the fastest a head moves) at which it is at full volume
    curve: 0.5, // how the volume climbs with speed below that: 1 = in step with it, lower = a slow rise still rumbles
    attack: 1.5, // seconds it takes to swell
    release: 2.5, // ...and to die away once the head has stopped
  },
  // Wind chimes and bells (sounds/chimes.mp3, alex_jauk on Pixabay, 107 s):
  // streamed and looped like the sea, silent until the bird is over a
  // dense cluster of lanterns (main.field.js LANTERN_GLOW.chimes says how
  // much: 0 – 1, by how many there are how near the bird), fading in as it
  // comes among them and out as it leaves. Kept low: a hint, under the rest
  chimes: {
    file: "sounds/chimes.mp3",
    gain: 0.4, // its level, full (the recording's mean is -35.9 dB, about the sea's wash; was 1.1)
    attack: 3, // seconds it takes to swell in
    release: 6, // ...and to fade away
    dip: 0.3, // seconds a fade still under way drops to silence before the chimes jump to a new spot and come in again
    shift: 2, // semitones it is played up: the recording rings on C (with D, F#, A, B), a whole step under the music's D; up two, it is D (and E, G#, B, C#): the pentatonic and its two colours
  },
  // The wind (main.field.js WIND: the slider's strength, eased, with its
  // gusts): three recordings streamed and looped like the sea, crossfaded
  // by how hard it blows. Each has a band of strength it sounds in (`in`:
  // where it starts to come up and where it is full; `out`: where it starts
  // to go and where it is gone, null to stay to the top), and its level
  // there, evened to the others; all of it swells and drops with the gusts
  wind: {
    layers: [
      { file: "sounds/wind-soft.mp3", gain: 0.37, in: [0.02, 0.15], out: [0.45, 0.65] }, // storegraphic, 8 s, mean -27.4 dB: a breeze
      { file: "sounds/wind-mid.mp3", gain: 0.66, in: [0.3, 0.5], out: [0.75, 0.95] }, // soundreality, 43 s, mean -32.4 dB: a steady wind
      { file: "sounds/wind-strong.mp3", gain: 0.3, in: [0.65, 0.9], out: null }, // jci, 36 s, mean -20.5 dB: a gale
    ],
    level: 1, // all of it, against the rest (each layer sits about -36 dB at its full, the gale a little over, under the music)
    fade: 0.6, // seconds it takes to follow the wind (the gusts are already eased)
  },
  // The rain (sounds/rain.mp3, liecio on Pixabay, 109 s, streamed and
  // looped like the sea) as loud as it is raining (main.field.js RAIN:
  // the slider, eased), and thunder (sounds/thunder.mp3, 11 s) after a
  // flash of lightning in heavy rain, further off the longer it takes
  rain: {
    file: "sounds/rain.mp3",
    gain: 0.35, // its level in full rain (the recording's mean is -19.7 dB: this brings it to about -29, under the music)
    curve: 0.7, // how it climbs with the rain: under 1, light rain is already heard
    fade: 1.5, // seconds it takes to follow the rain
    thunder: 0.9, // the thunder's level, a near strike (a far one, less)
  },
  // Moments (main.field.js says when): the violin as the sun rises and as
  // it sets, and every few islands the bird comes over (ISLAND_VIOLIN).
  // A gap after each in which it won't play again. (It once played over
  // every island and as a crowd of heads turned on it, too often; a voice,
  // "oooh", is dropped)
  moments: {
    level: 0.5, // their level against the rest (was 0.8)
    fadeIn: 7, // seconds a violin swells in from silence (a short take: at most `share` of it)
    fadeOut: 9, // seconds it dies away over at the end of its take (likewise)
    share: 0.45, // of a take, the most either fade may take up
    sun: { gap: 100 }, // seconds between one violin and the next, at least: the slider's middle is passed twice a day (dawn and dusk, about two minutes apart), and a slider dragged back and forth over it plays once
    island: { gap: 30 }, // ...and for the islands
    apart: 40, // seconds between any two violins, whichever moment: the takes run 14 – 38 s, so one has mostly faded before the next begins
  },
  hear: [30, 8], // world units a statue is heard over: a base, plus this much per unit of head scale; silent past it (the same as its notice radius, NOTICE in main.field.js: heard as far as it notices)
  swell: 2, // how the sound grows as the bird comes in: 1 = evenly from the edge, higher = quiet most of the way and swelling over the last stretch
  pitch: [1.15, 0.55], // playback rate at the smallest head scale and the largest (SOUND.scale): the big ones grind lower
  scale: [4, 26], // the head scales those pitches are for
  attack: 0.03, // seconds a one-shot takes to come in
  release: 0.08, // ...and to die away at its end
  grind: {
    full: 0.5, // radians a second of neck turn (twist and curl together) at which a grind is at full volume
    curve: 0.4, // how the volume climbs with speed between SOUND.still and that: 1 = in step with it, lower = slow turns still grind (at 0.4, a tenth of the way up is 0.4 of full volume). Silent under SOUND.still (it wasn't: a neck settling, under the still mark, ground on at a third of full)
    voices: 16, // necks and arms that may grind at once (the nearest moving ones)
    attack: 0.15, // seconds the grind takes to swell as the neck speeds up
    release: 0.1, // ...and to die as it slows
    // The grind itself: slices of the scrapes, one starting every `every`
    // seconds (drawn between the two), each `length` seconds long (the same),
    // faded in and out over `fade`, so two or three sound at once and no
    // two are the same stretch of the same clip
    grain: {
      length: [0.3, 0.6],
      every: [0.12, 0.25],
      fade: 0.1,
      level: 0.6, // the slices overlap two or three deep: this brings that down to about one scrape's level
    },
  },
  still: 0.03, // radians a second under which a neck counts as standing still
  unstick: 2, // seconds a neck must have stood still for its next move to start with a drag
  reverse: {
    speed: 0.08, // radians a second a neck must be moving, in the new direction, for a reversal to count (slower is just settling)
    gap: 0.5, // seconds between one reversal sound and the next on the same neck, at least
  },
};

// The clips, each with the gain that brings its recording to the others' level
const CLIPS = {
  scrape1: { file: "sounds/stone-scrape-01.mp3", gain: 0.9 }, // 2.3 s
  scrape2: { file: "sounds/stone-scrape-02.mp3", gain: 1.5 }, // 1.4 s
  scrape3: { file: "sounds/stone-scrape-03.mp3", gain: 1.6 }, // 1.5 s
  scrape4: { file: "sounds/stone-scrape-04.mp3", gain: 1.05 }, // 1.2 s
  scrape5: { file: "sounds/stone-scrape-05.mp3", gain: 1.05 }, // 2.0 s
  // The touchdowns (SOUND.sea): evened to the louder recordings' -26 dB
  splash1: { file: "sounds/splash.mp3", gain: 1 }, // 5.9 s, mean -25.8 dB
  splash2: { file: "sounds/splash-2.mp3", gain: 2.8 }, // 8.4 s, mean -35.0 dB
  splash3: { file: "sounds/splash-2-2.mp3", gain: 2.4 }, // 5.7 s, mean -33.5 dB
  splash4: { file: "sounds/splash-3.mp3", gain: 2.4 }, // 6.9 s, mean -33.5 dB
  surf1: { file: "sounds/surf-3.mp3", gain: 1.3 }, // 8.8 s, mean -28.1 dB
  surf2: { file: "sounds/surf-2-2.mp3", gain: 2.8 }, // 4.3 s, mean -35.0 dB
  surf3: { file: "sounds/surf-3-2.mp3", gain: 3.2 }, // 4.6 s, mean -36.0 dB
  // The lanterns' ping (SOUND.ping), evened to about -26 dB, and tuned to
  // the music: `pitch` is the tone the recording sounds (a MIDI note, with
  // its cents as a fraction, measured off its spectrum), `note` the note it
  // is played as, by playback rate. The music (bgm.mp3) sits on an A drone
  // over a D bass and uses the notes D E F# A B (the D major pentatonic,
  // A the strongest, then D, B, E, F#): any of those rings in the key.
  // Change `note` to retune it. (Three other pings were tried and dropped:
  // one hummed, one echoed inside its own recording)
  // The lamps (2026-10-09): three takes, the lanterns' sound now, taking
  // turns; each evened to about -26 dB, its `pitch` measured off its
  // spectrum as the ping's was. All three sound D already (the music's root)
  lamp1: { file: "sounds/2_lamp-1.mp3", gain: 1.33, pitch: 50 }, // 6.9 s, mean -28.5 dB; sounds D3
  lamp2: { file: "sounds/3_lamp-2.mp3", gain: 2.29, pitch: 62 }, // 6.9 s, mean -33.2 dB; sounds D4
  lamp3: { file: "sounds/4_lamp-3.mp3", gain: 2.57, pitch: 62, up: 0 }, // 6.9 s, mean -34.2 dB; sounds D4. Played an octave below the other lamps (up 0, not SOUND.ping.up): lower, its warble reads as a slow shimmer
  // The moments (SOUND.moments), evened to about -26 dB and put in the
  // music's key: `pitch` as measured, `note` what it plays as
  // The violins (2026-10-09): four takes, taking turns (they replace
  // 5_violin.mp3, which played as D3 from C3). Pitches measured to the
  // semitone off their spectra
  violin1: { file: "sounds/1_1_violin.ogg.mp3", gain: 0.65, pitch: 50, note: "D3" }, // 13.8 s, mean -22.2 dB; sounds D3 (with E): in key as it is
  violin2: { file: "sounds/2_1_violin.ogg.mp3", gain: 0.72, pitch: 52, note: "E3" }, // 20.6 s, mean -23.1 dB; sounds E3: in key as it is
  violin3: { file: "sounds/3_1_violin.ogg.mp3", gain: 0.92, pitch: 52, note: "E3" }, // 30.9 s, mean -25.3 dB; sounds E3 and F3 about equally. Left as it is: no shift puts both in key, and its F rubs a little against the music's F#
  violin4: { file: "sounds/4_1_violin.ogg.mp3", gain: 1.22, pitch: 49, note: "D3" }, // 37.8 s, mean -27.7 dB; rooted on C#3 (with A#, G#, D#): up a half step to D, and those land on B, A, E
  ping1: { file: "sounds/ping-1.mp3", gain: 0.3, pitch: 77.23, note: "E5" }, // (no longer played: the lamps took over) 0.5 s, mean -15.3 dB (a loud recording); sounds F5 +23 cents. The sonar ping (freesound sonarping-38269), cut to the dry ping alone on 2026-10-08: the recording went on to echo its own ping back at 0.57 s, and an echo in a clip is an echo in the field
  // The sea heads' rumbles (SOUND.rumble), evened to about -26 dB
  rumble1: { file: "sounds/rumble-1.mp3", gain: 0.09 }, // 42 s, mean -4.8 dB (a loud recording), earth rumble
  rumble2: { file: "sounds/rumble-2.mp3", gain: 0.2 }, // 30 s, mean -12.1 dB, bass rumble
  // Thunder after lightning (SOUND.rain.thunder)
  thunder: { file: "sounds/thunder.mp3", gain: 0.6 }, // 11.5 s, mean -24.4 dB, peak -1.2 (a big clap)
};
// A note name ("F#5", "Bb3") as a MIDI number, and the playback rate that
// takes a clip from the tone it sounds (`pitch`) to the note it is to play
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const noteMidi = (name) => {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  return 12 * (+m[3] + 1) + NOTE_INDEX[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
};
const tuneRate = (clip, note = clip.note) => (note ? 2 ** ((noteMidi(note) - clip.pitch) / 12) : 1);
// The same, but the note taken in whichever octave lies nearest the clip's
// own pitch (raised `up` semitones), so a low clip plays the scale low
// rather than being sped up two octaves (within a half octave either way)
const tuneNear = (clip, note, up = 0) => {
  if (!note) return 1;
  let d = noteMidi(note) - clip.pitch - up;
  while (d > 6) d -= 12;
  while (d < -6) d += 12;
  return 2 ** ((d + up) / 12);
};
// Which clips each use draws from, and how loud it plays against the others
const USE = {
  grind: ["scrape1", "scrape2", "scrape3", "scrape4", "scrape5"], // a neck or an arm turning: one looped
  long: ["scrape1", "scrape5"], // the hands, and the side-to-side reversals
  short: ["scrape2", "scrape3", "scrape4"], // unsticking, and the up-and-down reversals
  splash: ["splash1", "splash2", "splash3", "splash4"], // touching down from high
  surf: ["surf1", "surf2", "surf3"], // touching down from low
  ping: ["lamp1", "lamp2", "ping1", "lamp3"], // a lantern lighting, in this turn: the lamps, with the old sonar ping among them (lamp3 an octave down: two detuned Ds and a D#, it warbled up high)
  violin: ["violin1", "violin2", "violin3", "violin4"], // the sun rising and setting: the four takes in turn
  rumble: ["rumble1", "rumble2"], // a sea head rising: all of them at once
};
// A phone (a touch screen): the few things it needs to sound at all, below,
// are done for it alone; a computer goes on exactly as it did
const PHONE = matchMedia("(hover: none) and (pointer: coarse)").matches;
// On a phone the sound effects play this much of their level, and the whole
// mix goes through a limiter: on an iPhone's speaker, everything at once
// distorted and the effects drowned the music
const PHONE_SOUND = { sfx: 0.5, limit: -6 }; // limit: dB the limiter holds the mix under
const LEVEL = { grind: 1, scrape: 0.9, drag: 0.8 };
const LOOP_TRIM = 0.12; // seconds cut off each end of a clip when it loops as a grind, so the attack and the tail don't repeat
const pick = (names) => names[Math.floor(Math.random() * names.length)];

const pitchFor = (s) => THREE.MathUtils.lerp(SOUND.pitch[0], SOUND.pitch[1], THREE.MathUtils.clamp((s - SOUND.scale[0]) / (SOUND.scale[1] - SOUND.scale[0]), 0, 1));

export class Sounds {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.voices = new Map(); // statue key → its grind
    this.necks = new Map(); // statue key → what its neck was doing (for the drag and the reversals)
    this.playing = new Set(); // the one-shots under way, to keep placed as the bird moves
    this.tick = 0;
    this.muted = false;
    this.hiddenAudioWasRunning = false;
    this.ear = new THREE.Vector3();
    this.right = new THREE.Vector3(1, 0, 0);
    this.v = new THREE.Vector3();
    const pauseHiddenAudio = () => {
      if (!this.ctx || this.ctx.state === "closed") return;
      if (this.ctx.state === "running") this.hiddenAudioWasRunning = true;
      if (!this.hiddenAudioWasRunning) return;
      this.music?.tag.pause();
      this.ctx.suspend().catch(() => {});
    };
    const resumeVisibleAudio = () => {
      if (!this.hiddenAudioWasRunning || !this.ctx || this.ctx.state === "closed") return;
      this.hiddenAudioWasRunning = false;
      this.ctx.resume().then(() => {
        if ((this.musicOn ?? true) && this.music && !document.hidden) this.music.tag.play().catch(() => {});
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseHiddenAudio();
      else resumeVisibleAudio();
    });
    addEventListener("pagehide", pauseHiddenAudio);
    addEventListener("pageshow", () => {
      if (!document.hidden) resumeVisibleAudio();
    });
    // Audio can only start from a gesture
    this.musicTrack = pickRandomTrack();
    const start = () => this.start();
    if (!PHONE) {
      addEventListener("pointerdown", start, { once: true });
      addEventListener("keydown", start, { once: true });
      const unlockPending = () => {
        if (!this.ctx) return;
        if (this.ctx.state === "suspended" && !document.hidden) this.ctx.resume().catch(() => {});
        if ((this.musicOn ?? true) && this.music?.tag.paused && !document.hidden) {
          this.music.tag.play().catch(() => {});
        }
      };
      addEventListener("pointerdown", unlockPending, { passive: true });
      addEventListener("keydown", unlockPending);
    } else {
      // On a phone a touch counts as a gesture only as it lifts (started as
      // the finger landed, the sound was refused, and stayed off for the
      // visit). So it starts on the lift, and each touch tries again until
      // the clock runs and the music plays. The music is fetched from now,
      // while the field builds, so a slow connection has it ready sooner
      this.musicTag = new Audio(this.musicTrack);
      this.musicTag.preload = "auto";
      const gestures = ["touchend", "pointerup", "click"];
      const wantsMusic = () => this.music?.tag.paused && (this.musicOn ?? true);
      const unlock = () => {
        this.start();
        if (this.ctx?.state !== "running") this.ctx?.resume();
        if (wantsMusic()) this.music.tag.play().catch(() => {});
        if (this.ctx?.state === "running" && !wantsMusic()) gestures.forEach((g) => removeEventListener(g, unlock));
      };
      gestures.forEach((g) => addEventListener(g, unlock));
    }
    addEventListener("keydown", (e) => {
      if (e.code === "KeyM") this.mute(!this.muted);
      if (e.code === "KeyL" && !e.repeat) {
        this.logOn = !this.logOn;
        console.log(`sound log ${this.logOn ? "on: every sound as it starts" : "off"}`);
        if (this.logOn) this.sayNow();
      }
    });
  }
  async start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !document.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    // Two buses: everything but the music through `master` (the sfx, on
    // and off with playSfx), it and the music into `main` (the volume, M mutes)
    this.main = ctx.createGain();
    this.main.gain.value = this.muted ? 0 : SOUND.volume;
    if (PHONE) {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = PHONE_SOUND.limit;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.main.connect(limiter).connect(ctx.destination);
    } else this.main.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.sfxOn ?? true ? (PHONE ? PHONE_SOUND.sfx : 1) : 0;
    this.master.connect(this.main);
    if (ctx.state === "suspended") ctx.resume();
    // The music and the sea: streamed from <audio> elements (5 minutes
    // decoded would be 100 MB), looped, each through its own gain into the
    // master so M mutes them with the rest
    const stream = (file, gain0 = 0, to = this.master, tag = new Audio(file)) => {
      tag.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gain0, ctx.currentTime);
      ctx.createMediaElementSource(tag).connect(gain).connect(to);
      return { tag, gain };
    };
    if (SOUND.music.file && !this.music) {
      const M = SOUND.music;
      const track = this.musicTrack ?? pickRandomTrack();
      this.musicTrack = track;
      const tag = this.musicTag ?? new Audio(track);
      this.music = stream(track, 0, this.main, tag); // (not through the sfx bus; a phone's fetched early)
      this.music.tag.loop = false;
      this.music.tag.addEventListener("ended", () => this.nextMusic());
      this.music.gain.gain.linearRampToValueAtTime(M.gain, ctx.currentTime + M.fadeIn);
      if ((this.musicOn ?? true) && !document.hidden) this.music.tag.play().catch(() => {});
    }
    if (!this.windStreams) {
      // Silent until wind() brings them up
      this.windStreams = SOUND.wind.layers.map((L) => {
        const v = stream(L.file);
        v.tag.play().catch(() => {});
        return v;
      });
    }
    if (SOUND.rain.file && !this.rainStream) {
      // Silent until rain() brings it up
      this.rainStream = stream(SOUND.rain.file);
      this.rainStream.tag.play().catch(() => {});
    }
    if (SOUND.chimes.file && !this.chimeStream) {
      // Silent until chimes() brings it up
      this.chimeStream = stream(SOUND.chimes.file);
      // Retuned into the music's key (SOUND.chimes.shift): played faster,
      // with the pitch let go up rather than held
      const tag = this.chimeStream.tag;
      tag.preservesPitch = tag.mozPreservesPitch = tag.webkitPreservesPitch = false;
      tag.playbackRate = 2 ** (SOUND.chimes.shift / 12);
      this.chimeStream.tag.play().catch(() => {});
    }
    if (!this.ocean) {
      // Silent until sea() brings them up; a browser that refuses just stays quiet
      this.ocean = stream(SOUND.sea.file);
      this.ocean.tag.play().catch(() => {});
      this.surf = SOUND.sea.surf.map((c) => {
        const v = stream(c.file);
        v.tag.play().catch(() => {});
        return v;
      });
    }
    // A clip that won't load or decode (an export that came out empty) is
    // dropped, with a warning, rather than keeping every sound silent
    await Promise.all(
      Object.entries(CLIPS).map(async ([name, c]) => {
        try {
          const data = await (await fetch(c.file)).arrayBuffer();
          this.buffers[name] = await ctx.decodeAudioData(data);
        } catch (e) {
          console.warn(`sounds: ${c.file} (${name}) won't play: ${e.message ?? e}`);
          delete CLIPS[name];
          for (const list of Object.values(USE)) {
            const i = list.indexOf(name);
            if (i >= 0) list.splice(i, 1);
          }
        }
      }),
    );
    this.ready = true;
  }
  nextMusic() {
    this.musicOn = true;
    const musicBox = document.getElementById("music-on");
    if (musicBox && !musicBox.checked) musicBox.checked = true;
    this.musicTrack = pickRandomTrack(this.musicTrack);
    if (!this.ctx) {
      this.start();
      return;
    }
    if (this.ctx.state === "suspended" && !document.hidden) this.ctx.resume().catch(() => {});
    if (this.music) {
      this.music.tag.src = this.musicTrack;
      this.music.tag.currentTime = 0;
      if (!document.hidden) this.music.tag.play().catch(() => {});
    }
  }
  mute(on) {
    this.muted = on;
    if (this.main) this.main.gain.setTargetAtTime(on ? 0 : SOUND.volume, this.ctx.currentTime, 0.05);
  }
  // The sound effects on or off (everything but the music)
  playSfx(on) {
    this.sfxOn = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? (PHONE ? PHONE_SOUND.sfx : 1) : 0, this.ctx.currentTime, 0.1);
  }
  // The music on or off (the stone keeps sounding either way)
  playMusic(on) {
    this.musicOn = on;
    if (!this.music) return;
    if (on && !document.hidden) this.music.tag.play().catch(() => {});
    else this.music.tag.pause();
  }
  // The sea, once a frame: the wash by how near the bird is to the water,
  // the surf while it skims it, and a splash or a wash of surf as it touches down
  sea(dist, touching, height) {
    if (!this.ocean) return;
    const S = SOUND.sea,
      t = this.ctx.currentTime;
    this.from = Math.max(height, (this.from ?? height) - S.forget * (t - (this.seaT ?? t)));
    this.seaT = t;
    if (touching && !this.wasTouching && this.ready) {
      const name = pick(this.from >= S.high ? USE.splash : USE.surf);
      this.say(`touchdown: ${name} (${CLIPS[name].file})`);
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      const gain = this.ctx.createGain();
      gain.gain.value = CLIPS[name].gain * S.landing;
      src.connect(gain).connect(this.master);
      src.start();
    }
    this.wasTouching = touching;
    const nearness = Math.pow(THREE.MathUtils.clamp(1 - dist / S.near, 0, 1), S.swell);
    if (nearness > 0.05 && !(this.washWas > 0.05)) this.say("ocean wash coming in (near the water)");
    if (touching && !this.wasSkimming) this.say("surf: skimming the water");
    this.washWas = nearness;
    this.wasSkimming = touching;
    this.ocean.gain.gain.setTargetAtTime(nearness * S.gain, t, S.fade / 3); // setTargetAtTime is most of the way there after three time constants
    this.surf.forEach((v, i) => v.gain.gain.setTargetAtTime(touching ? S.surf[i].gain : 0, t, (touching ? S.dive[0] : S.dive[1]) / 3));
  }
  // The chimes, once a frame: how much (0 – 1) the bird is among
  // lanterns. They swell in over `attack` and fade over `release`. Every
  // time they start (the level rising from nothing) they jump to somewhere
  // new in the recording, so no two clusters ring the same; if the last
  // cluster's are still fading out, they dip to silence over `dip` seconds
  // first, so the jump is never heard
  chimes(level) {
    const C = this.chimeStream;
    if (!C) return;
    const S = SOUND.chimes,
      t = this.ctx.currentTime,
      g = C.gain.gain;
    const was = this.chimeLevel ?? 0;
    this.chimeLevel = level;
    if (level > 0.01 && was <= 0.01) {
      const jump = () => {
        if (C.tag.duration) C.tag.currentTime = Math.random() * C.tag.duration * 0.85;
      };
      this.say(`chimes coming in (level ${level.toFixed(2)})`);
      if (g.value < 0.01) jump();
      else {
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + S.dip);
        this.chimeDip = t + S.dip;
        setTimeout(jump, S.dip * 1000);
      }
    }
    if (this.chimeDip && t < this.chimeDip) return; // let the dip finish, then swell in from there
    if (Math.abs(level - was) > 1e-3 || level === 0) g.setTargetAtTime(level * S.gain, Math.max(t, this.chimeDip ?? 0), (level > was ? S.attack : S.release) / 3);
  }
  // The wind, once a frame: how hard it is blowing (0 – 1, a gust a
  // little over), each layer by its band
  wind(w) {
    if (!this.windStreams) return;
    const W = SOUND.wind,
      t = this.ctx.currentTime;
    W.layers.forEach((L, i) => {
      const up = THREE.MathUtils.smoothstep(w, L.in[0], L.in[1]),
        down = L.out ? 1 - THREE.MathUtils.smoothstep(w, L.out[0], L.out[1]) : 1;
      const want = L.gain * W.level * up * down;
      const v = this.windStreams[i];
      if (Math.abs(want - (v.was ?? -1)) < 1e-3) return;
      if (want > 0.01 && !(v.was > 0.01)) this.say(`wind coming in: ${L.file}`);
      v.was = want;
      v.gain.gain.setTargetAtTime(want, t, W.fade / 3);
    });
  }
  // The rain, once a frame: how hard it is raining (0 – 1)
  rain(amount) {
    if (!this.rainStream) return;
    const R = SOUND.rain;
    const want = R.gain * Math.pow(THREE.MathUtils.clamp(amount, 0, 1), R.curve);
    if (Math.abs(want - (this.rainWas ?? -1)) < 1e-3) return;
    this.rainWas = want;
    if (want > 0.01 && !(this.rainHeard > 0.01)) this.say(`rain coming in (${amount.toFixed(2)})`);
    this.rainHeard = want;
    this.rainStream.gain.gain.setTargetAtTime(want, this.ctx.currentTime, R.fade / 3);
  }
  // Thunder, once: `near` 0 – 1 (1 right overhead: loud and bright; less,
  // further off: quieter and a little lower, as the high end dies with distance)
  thunder(near = 1) {
    if (!this.ready || !CLIPS.thunder) return;
    this.say(`thunder (near ${near.toFixed(2)})`);
    const t = this.ctx.currentTime;
    const voice = this.wire(this.buffers.thunder, 0.85 + 0.15 * near);
    voice.gain.gain.setValueAtTime(CLIPS.thunder.gain * SOUND.rain.thunder * (0.35 + 0.65 * near), t);
    voice.src.start();
  }
  // What is going on now, as the log is turned on: the loops' levels, and
  // the grinds and rumbles under way
  sayNow() {
    if (!this.ctx) return console.log("[sound] no sound yet: it starts with the first key or click");
    const lvl = (v) => (v ? v.gain.gain.value.toFixed(2) : "-");
    console.log(`[sound now] music ${lvl(this.music)}  ocean wash ${lvl(this.ocean)}  surf ${this.surf?.map(lvl).join(",") ?? "-"}  wind ${this.windStreams?.map(lvl).join(",") ?? "-"}  rain ${lvl(this.rainStream)}  chimes ${lvl(this.chimeStream)}  grinds+rumbles ${this.voices.size}${this.voices.size ? ": " + [...this.voices.keys()].join(" ") : ""}`);
  }
  // The sound log (L): each sound as it starts, by name, with the time
  say(what) {
    if (this.logOn) console.log(`[sound ${(this.ctx?.currentTime ?? 0).toFixed(1)}s] ${what}`);
  }
  get ready() {
    return !!this.ctx && Object.keys(CLIPS).every((name) => this.buffers[name]);
  }

  // Where the listener is this frame (the camera, or `ear` if given: the
  // pillars lab listens from its circling target); grinds not fed since
  // last frame fade out, and the one-shots under way follow the bird's
  // distance and bearing
  listen(camera, ear = null) {
    this.ear.copy(ear ?? camera.position);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    this.tick++;
    for (const [key, voice] of this.voices)
      if (voice.tick < this.tick - 1) this.stop(key);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.playing) {
      if (t < v.until || t >= v.fadeAt) continue; // still in its attack, or letting go: leave the ramp alone
      const { gain, pan } = this.place(v.x, v.y, v.z, v.s, v.hear); // over its own hearing range (a lantern's, a voice's), not a statue's
      v.gain.gain.setTargetAtTime(gain * v.base, t, SOUND.grind.attack);
      v.pan.pan.setTargetAtTime(pan, t, SOUND.grind.attack);
    }
  }
  // A sound's gain and pan for where it is: silent at the edge of its hearing
  // range, swelling all the way in to full at the statue (SOUND.swell shapes
  // the curve), and panned by its bearing from the camera
  place(x, y, z, s, hear = SOUND.hear[0] + SOUND.hear[1] * s) {
    const d = this.v.set(x, y, z).sub(this.ear).length();
    const gain = Math.pow(THREE.MathUtils.clamp(1 - d / hear, 0, 1), SOUND.swell);
    const pan = d > 1e-3 ? THREE.MathUtils.clamp((this.v.dot(this.right) / d) * 0.8, -1, 1) : 0;
    return { gain, pan };
  }
  // A source through its own gain and pan into the master
  wire(buffer, rate) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    src.connect(gain).connect(pan).connect(this.master);
    return { src, gain, pan };
  }

  // ---- the neck ---------------------------------------------------------
  neck(key, x, y, z, s, dTwist, dCurl, delta) {
    if (!this.ready) return;
    let N = this.necks.get(key);
    if (!N) this.necks.set(key, (N = { still: 0, side: 0, updown: 0, lastAt: -Infinity }));
    const dt = Math.max(delta, 1e-3),
      now = this.ctx.currentTime;
    const turning = (Math.abs(dTwist) + 1.5 * Math.abs(dCurl)) / dt;
    // Unsticking: a drag as it starts moving after standing still a while,
    // and a fresh start for the reversals (its first move after is a move, not a reverse)
    if (turning < SOUND.still) N.still += dt;
    else {
      if (N.still >= SOUND.unstick) {
        this.drag(x, y, z, s);
        N.side = N.updown = 0;
        N.lastAt = now;
      }
      N.still = 0;
    }
    // Reversals: the neck moving the other way from the way it last moved,
    // fast enough to be a move and not just settling
    for (const [axis, v, play] of [
      ["side", dTwist / dt, () => this.scrape(x, y, z, s, "short")],
      ["updown", dCurl / dt, () => this.drag(x, y, z, s)],
    ]) {
      if (Math.abs(v) < SOUND.reverse.speed) continue;
      const dir = Math.sign(v);
      if (N[axis] && dir !== N[axis] && now - N.lastAt >= SOUND.reverse.gap) {
        play();
        N.lastAt = now;
      }
      N[axis] = dir;
    }
    this.grind(key, x, y, z, s, turning);
  }
  // An arm on the move: its grind follows how fast it swings round, folds
  // and lifts, like a neck's follows its turn
  arm(key, x, y, z, s, dYaw, dCurl, dUp, delta) {
    if (!this.ready) return;
    const dt = Math.max(delta, 1e-3);
    this.grind(key, x, y, z, s, (Math.abs(dYaw) + 1.5 * Math.abs(dCurl) + 2 * Math.abs(dUp)) / dt);
  }
  // The grind: a voice per moving neck or arm, its volume following its
  // speed: one gain and pan, and through them a stream of slices of the
  // scrapes (SOUND.grind.grain), scheduled a little ahead each frame while
  // it is heard. The pitch already drops with the statue's size. Silent
  // under SOUND.still: a neck that counts as standing still makes no sound
  grind(key, x, y, z, s, speed) {
    const G = SOUND.grind;
    const { gain, pan } = this.place(x, y, z, s);
    const level = gain * Math.pow(THREE.MathUtils.clamp((speed - SOUND.still) / (G.full - SOUND.still), 0, 1), G.curve);
    const t = this.ctx.currentTime;
    let voice = this.voices.get(key);
    if (!voice) {
      if (level < 0.01 || this.voices.size >= G.voices || !USE.grind.length) return;
      const ctx = this.ctx,
        g = ctx.createGain(),
        p = ctx.createStereoPanner();
      g.gain.value = 0;
      g.connect(p).connect(this.master);
      voice = { gain: g, pan: p, rate: pitchFor(s), base: LEVEL.grind * G.grain.level, level: 0, nextAt: t };
      this.say(`grind: ${key} turning`);
      this.voices.set(key, voice);
    }
    // Its slices, a quarter second ahead; none while it can't be heard
    if (level >= 0.01)
      while (voice.nextAt < t + 0.25) {
        const at = Math.max(voice.nextAt, t);
        this.grain(voice, at);
        voice.nextAt = at + THREE.MathUtils.lerp(G.grain.every[0], G.grain.every[1], Math.random());
      }
    voice.gain.gain.setTargetAtTime(level * voice.base, t, level > voice.level ? G.attack : G.release);
    voice.pan.pan.setTargetAtTime(pan, t, G.attack);
    voice.level = level;
    voice.tick = this.tick;
  }
  // One slice of a grind, at `at`: any of the scrapes (the stone scrapes
  // only: it drew from every clip once, when the scrapes were all there
  // were, and as the splashes, the thunder, the lamps and the violin joined
  // them, turning heads played those too), from a point of its own past the
  // attack and short of the tail, faded in and out, into the voice's gain
  grain(voice, at) {
    const G = SOUND.grind.grain,
      ctx = this.ctx;
    const name = pick(USE.grind),
      clip = CLIPS[name],
      buffer = this.buffers[name];
    const length = THREE.MathUtils.lerp(G.length[0], G.length[1], Math.random()), // seconds it is heard for
      fade = Math.min(G.fade, length / 2),
      span = length * voice.rate; // seconds of the clip that covers, at this pitch
    const from = LOOP_TRIM + Math.random() * Math.max(0, buffer.duration - 2 * LOOP_TRIM - span);
    const src = ctx.createBufferSource(),
      g = ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = voice.rate;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(clip.gain, at + fade);
    g.gain.setValueAtTime(clip.gain, at + length - fade);
    g.gain.linearRampToValueAtTime(0, at + length);
    src.connect(g).connect(voice.gain);
    src.onended = () => g.disconnect();
    src.start(at, from, span);
  }
  stop(key) {
    const voice = this.voices.get(key);
    if (!voice) return;
    this.voices.delete(key);
    const t = this.ctx.currentTime;
    const release = voice.release ?? SOUND.grind.release;
    voice.gain.gain.setTargetAtTime(0, t, release);
    for (const src of voice.srcs ?? []) src.stop(t + release * 4 + 0.5); // (a grind's slices end on their own, under its gain, within the second)
  }
  // The rumble: a sea head on the move (speed: its share of the fastest it
  // moves, SEA.climb), both rumbles looped over each other through one
  // gain, placed and pitched as a grind is, and stopped like one when it is
  // no longer fed (listen)
  rumble(key, x, y, z, s, speed) {
    if (!this.ready || !USE.rumble.length) return;
    const R = SOUND.rumble;
    key += ":rumble";
    const { gain, pan } = this.place(x, y, z, s);
    const level = gain * Math.pow(THREE.MathUtils.clamp(speed / R.full, 0, 1), R.curve);
    let voice = this.voices.get(key);
    if (!voice) {
      if (level < 0.01 || this.voices.size >= SOUND.grind.voices) return;
      const ctx = this.ctx,
        rate = pitchFor(s);
      const g = ctx.createGain(),
        p = ctx.createStereoPanner();
      g.gain.value = 0;
      g.connect(p).connect(this.master);
      const srcs = USE.rumble.map((name) => {
        const buffer = this.buffers[name],
          src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = rate;
        src.loop = true;
        src.loopStart = LOOP_TRIM;
        src.loopEnd = buffer.duration - LOOP_TRIM;
        const cg = ctx.createGain();
        cg.gain.value = CLIPS[name].gain;
        src.connect(cg).connect(g);
        src.start(0, src.loopStart + Math.random() * (src.loopEnd - src.loopStart));
        return src;
      });
      voice = { srcs, gain: g, pan: p, base: R.level, level: 0, release: R.release };
      this.say(`rumble: a sea head moving (scale ${s.toFixed(1)})`);
      this.voices.set(key, voice);
    }
    const t = this.ctx.currentTime;
    voice.gain.gain.setTargetAtTime(level * voice.base, t, level > voice.level ? R.attack : R.release);
    voice.pan.pan.setTargetAtTime(pan, t, R.attack);
    voice.level = level;
    voice.tick = this.tick;
  }

  // ---- one-shots --------------------------------------------------------
  // One clip, once, through, at `level` of its evened gain: in over the
  // attack, out over the release at its end. Heard over the statue's
  // range and pitched for its size unless `hear` and `rate` say otherwise
  once(name, x, y, z, s, level = 1, hear = undefined, rate = pitchFor(s), tail = Infinity) {
    if (!this.ready) return;
    const clip = CLIPS[name];
    if (!clip) return; // (every clip of that use dropped)
    const { gain, pan } = this.place(x, y, z, s, hear);
    if (gain < 0.01) return;
    const base = clip.gain * level;
    const voice = this.wire(this.buffers[name], rate);
    const full = voice.src.buffer.duration / rate; // seconds the clip runs
    const t = this.ctx.currentTime;
    voice.gain.gain.setValueAtTime(0, t);
    voice.gain.gain.linearRampToValueAtTime(gain * base, t + SOUND.attack);
    // Its end: the clip's own, released over SOUND.release; or, cut short
    // at `tail` seconds, let go over a second from there
    const cut = tail < full,
      fadeAt = t + Math.max(SOUND.attack, cut ? tail - 1 : full - SOUND.release);
    voice.gain.gain.setTargetAtTime(0, fadeAt, (cut ? 1 : SOUND.release) / 3);
    voice.pan.pan.value = pan;
    Object.assign(voice, { x, y, z, s, hear, base, until: t + SOUND.attack, fadeAt });
    this.playing.add(voice);
    voice.src.onended = () => this.playing.delete(voice);
    voice.src.start();
    if (cut) voice.src.stop(t + tail + 0.5); // (after start: a source told to stop before it has started throws, and a throw here froze the whole field)
  }
  // A scrape: a long one (the hands) or a short one (a side-to-side reversal)
  scrape(x, y, z, s, which = "long") {
    this.say(`scrape (${which})`);
    this.once(pick(USE[which]), x, y, z, s, LEVEL.scrape);
  }
  // A drag: a short scrape, as a neck unsticks or reverses up and down
  drag(x, y, z, s) {
    this.say("drag");
    this.once(pick(USE.short), x, y, z, s, LEVEL.drag);
  }
  // A ping from a lantern: its own of the pings (by its id), tuned to its
  // note (CLIPS), heard over SOUND.ping.hear and louder the nearer the
  // bird. Once as it lights (`now`), then, called every frame while it is
  // lit, again every SOUND.ping.every seconds while the bird is within
  // hearing; no more than one ping in the field each SOUND.ping.gap
  ping(key, x, y, z, id, now = false) {
    if (!this.ready || !USE.ping.length) return;
    const P = SOUND.ping,
      t = this.ctx.currentTime;
    this.pings ??= new Map(); // lantern key → its last ping, and its own spacing
    let N = this.pings.get(key);
    if (!N) {
      if (this.pings.size > 4000) this.pings.clear();
      this.pings.set(key, (N = { at: -Infinity, name: USE.ping[id % USE.ping.length], every: P.every * (0.8 + 0.4 * ((id % 97) / 97)) }));
    }
    if (!now) {
      if (!P.every || t - N.at < N.every) return;
      if (this.v.set(x, y, z).sub(this.ear).length() > P.hear) return;
    }
    if (t - (this.pingAt ?? -Infinity) < P.gap) return;
    // Not near one that just sounded (the recent pings' places, the stale ones dropped)
    this.recentPings = (this.recentPings ?? []).filter((r) => t - r.t < P.quiet);
    if (this.recentPings.some((r) => Math.hypot(r.x - x, r.z - z) < P.spacing)) return;
    this.recentPings.push({ x, z, t });
    N.at = t;
    this.pingAt = t;
    // Its clip: the lamps take turns, one after another across the field
    this.pingTurn = ((this.pingTurn ?? -1) + 1) % USE.ping.length;
    const name = USE.ping[this.pingTurn];
    // Its note: one of the scale's, not the one before. The sonar ping
    // plays the notes where they are written, as it always did; a lamp
    // plays from its own list, an octave up from its recording, cut short
    const lamp = name !== "ping1";
    const notes = (lamp ? P.lampNotes : P.notes).filter((n) => n !== this.lastNote);
    const note = notes.length ? pick(notes) : CLIPS[name].note;
    this.lastNote = note;
    this.say(`lantern: ${name} on ${note}`);
    this.once(name, x, y, z, 0, P.level, P.hear, lamp ? tuneNear(CLIPS[name], note, CLIPS[name].up ?? P.up) : tuneRate(CLIPS[name], note), lamp ? P.tail : Infinity);
  }
  // A violin, everywhere at once (not from a place): the next take of the
  // two, swelling in and playing through. `which` is the moment's kind,
  // for its gap
  violin(which) {
    if (!this.ready || !USE.violin.length) return;
    const M = SOUND.moments,
      t = this.ctx.currentTime;
    this.momentAt ??= {};
    if (t - (this.momentAt[which] ?? -Infinity) < M[which].gap || t - (this.violinAt ?? -Infinity) < M.apart) return;
    this.momentAt[which] = t;
    this.violinAt = t;
    this.say(`violin (${which})`);
    this.violinTurn = ((this.violinTurn ?? -1) + 1) % USE.violin.length;
    const name = USE.violin[this.violinTurn],
      clip = CLIPS[name];
    const voice = this.wire(this.buffers[name], tuneRate(clip));
    const length = voice.src.buffer.duration / tuneRate(clip);
    // Swelled in from silence and died away at the end, each along a
    // half-cosine (gentle at both ends, no corner to hear), neither longer
    // than M.share of the take
    const level = clip.gain * M.level,
      fadeIn = Math.min(M.fadeIn, length * M.share),
      fadeOut = Math.min(M.fadeOut, length * M.share);
    const ease = (from, to) => Float32Array.from({ length: 32 }, (_, i) => from + (to - from) * (0.5 - 0.5 * Math.cos((Math.PI * i) / 31)));
    voice.gain.gain.setValueCurveAtTime(ease(0, level), t, fadeIn);
    voice.gain.gain.setValueCurveAtTime(ease(level, 0), t + length - fadeOut, fadeOut);
    voice.src.start();
  }
}
