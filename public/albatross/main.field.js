import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLAT, poolTexture } from "./flatlight.js"; // flat, crisp light on every standard material, and the lanterns' lamps and pools; the scene lab sets its numbers
import { STRETCH_FROM, NECK_TAPER, buildHead, breakHead, mulberry32 } from "./heads.js";
import {
  VARIANTS, variantHead, variantParams, RCX, RCZ, RING_R, BURY, MIN_STRETCH, hash as fixedHash, attachAttrs,
  bendLen, spineEnd, makeMaterials, MAX_CURL, CHIN_DEPTH, CLEARANCE, curlLimit, neckStretch,
  moundRadius, moundHeight, moundRise, MOUND,
} from "./statues.js";
import { HANDS, HAND_POSES, POSE_NAMES, armRest, elbowTan, FOREARM, HAND_LONG, WRIST_B, ELBOW_DOWN, buildArm, armSize, thumbSide, handBearing, elbowUp, handPoints } from "./hands.js";
import { TREES, TREE_KINDS, buildTree, treeColours, treeMaterial, treeRadius, loadSavedTrees, pickTreeKind, OBELISKS, buildObelisk, buildLanternGlow, obeliskRadius, obeliskHeight, tallestUnder, loadSavedObelisks, LIT_KINDS, pickStoneKind, DEBRIS, DEBRIS_KINDS, buildDebris } from "./scenery.js";
import { FLOWER_KEYS, savedPalette } from "./palette.js";
import { polygonLobes, makeBeach, makeBeachUniforms, beachShader } from "./beach.js";
import { HOURS, hourColor as blendColor, hourValue as blend } from "./daylight.js";
import { MEADOW_DAISY, buildMeadowDaisy, daisyLooks, pickLook, petalCounts } from "./flowers.js";
import { Sounds } from "./sounds.js";
import { buildAlbatross, loadSavedAlbatross, withVariant, pickVariant } from "./albatross.js";
import { SkyFlocks, LandLife } from "./wildlife.js";
import { CloudDeck } from "./clouds.js";
import { WorldMap } from "./worldmap.js";

// A new map every play: every draw the field makes (the islands, the
// statues, the trees, the stones) is salted with a seed picked at load.
// The heads' shapes are not (statues.js draws them unsalted), nor the labs
const seedParam = new URL(location.href).searchParams.get("seed");
const parsedSeed = seedParam === null ? NaN : Number(seedParam);
const NATURE_MODE = new URL(location.href).searchParams.get("style") !== "original";
const SEED = Number.isSafeInteger(parsedSeed) && parsedSeed >= 0 && parsedSeed <= 0x7fffffff
  ? parsedSeed
  : (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff);
const hash = (x, z, seed) => fixedHash(x, z, seed + SEED);

// The colours are the scene lab's (palette.js): what was last set there,
// over its defaults. The sky and the foam are the day's; the lab's stand
// in at full day and tint the night (daylight.js)
const LAB_PALETTE = savedPalette();

// =====================================================================
// What the pillars lab has set
// =====================================================================
// The mounds and the hands are tuned in the pillars lab
// (pillars.html), which remembers its knobs in the browser. The field reads
// them here, before anything is built, so what stands in the lab's row is
// what stands in the field, with no copy-and-paste in between. With nothing
// saved (or another browser), the code's own values in statues.js and
// hands.js stand. (Paste the lab's "copy ..." blocks into those files to
// make a setting permanent.)
const LAB_KEY = "pillars-lab"; // pillars.js STORE_KEY
// Fill `into` with whatever `from` has for the same keys, as the lab does
const mergeKnown = (into, from) => {
  if (!from || typeof from !== "object") return into;
  for (const key of Object.keys(into)) {
    if (!(key in from)) continue;
    const a = into[key],
      b = from[key];
    if (Array.isArray(a)) {
      if (Array.isArray(b) && b.length === a.length) into[key] = [...b];
    } else if (a && typeof a === "object") mergeKnown(a, b);
    else if (typeof b === typeof a) into[key] = b;
  }
  return into;
};
{
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(LAB_KEY) || "{}") || {};
  } catch {
    saved = {};
  }
  mergeKnown(MOUND, saved.M);
  mergeKnown(HANDS, saved.H);
  if (!(HANDS.pose === "mixed" || POSE_NAMES.includes(HANDS.pose))) HANDS.pose = "mixed";
  // ...and the obelisks lab's (obelisks.html) and the trees lab's (trees.html)
  loadSavedObelisks();
  loadSavedTrees();
}

// =====================================================================
// The heads
// =====================================================================
// Built in heads.js from a set of numbers (HEAD_PARAMS there lists every knob;
// heads.html is a lab for pushing them around). The field bakes a few
// VARIANTS of the head, each drawn from HEAD_RANGES, and every statue
// wears one of them. Paste the lab's "copy ranges" output over HEAD_RANGES
// to change how far the heads roam. Variant 0 is the default head; the rest
// are drawn deterministically, so the field looks the same on every visit.
// HEAD_RANGES and the statue shaders live in statues.js, shared with the
// pillars lab (pillars.html).

// How many of those the field wears (a head is ~0.1 s to build): more on
// a desktop, fewer on a phone, where the load and the memory cost most
const USE = { variants: NATURE_MODE ? 4 : matchMedia("(hover: none) and (pointer: coarse)").matches ? 24 : 48 };

// The loading screen (index.html, #loading): up before this module runs,
// it says what is being built, and offers "fly" once everything is. The
// building yields to the browser between steps so it can paint. Nothing
// flies, and the day stands still, until "fly" is pressed (started).
const loadingEl = document.getElementById("loading"),
  loadingStatus = document.getElementById("loading-status"),
  loadingLine = document.getElementById("loading-line"),
  loadingBar = loadingEl?.querySelector(".loading-bar"),
  loadingPct = document.getElementById("loading-pct");
let started = !loadingEl; // without a loading screen (another page), straight into it
// The bar (index.html .loading-bar, drawn as the settings' bars are): filled
// as far as `done`, 0 – 1, with the share beside it. The page's own script
// (index.html) has already crept it a little way while this module was
// fetched: the building fills the rest, from there, never going back
loadingEl?.setAttribute("data-woke", ""); // stops the creep (index.html)
const woke = parseFloat(loadingBar?.style.getPropertyValue("--p")) / 100 || 0;
const paintLoading = (done) => {
  if (!loadingBar) return;
  const p = Math.round((woke + done * (1 - woke)) * 100);
  loadingBar.style.setProperty("--p", `${p}%`);
  loadingBar.setAttribute("aria-valuenow", p);
  if (loadingPct) loadingPct.textContent = `${p}%`;
};
// What the line over the bar says while it fills: the bird's thoughts, one after another,
// spread over the whole build so the last lands just before "Play". The
// first is already up in index.html while this module is fetched
const LOADING_LINES = [
  "The wind is steady.",
  "It feels nice.",
  "My heart is heavy.",
  "I haven't touched the ground in three hundred days.",
  "I glide and glide.",
  "I embrace the crosswind.",
  "I'm not scared of anything.",
  "I can smell the island now.",
  "I haven't seen him in so long.",
  "I wonder if he'll recognize me.",
];
const loading = async (msg, done = 0) => {
  const p = woke + done * (1 - woke);
  if (loadingLine) loadingLine.textContent = LOADING_LINES[Math.min(LOADING_LINES.length - 1, Math.floor(p * LOADING_LINES.length))];
  paintLoading(done);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
};
const HEADS_SHARE = 0.7; // of the bar the heads fill; the hands and the rest of the field fill the rest in steps (to 0.97, then "Play")

// The variants: each a head
const variants = [];
for (let v = 0; v < USE.variants; v++) {
  await loading(`sculpting head ${v + 1} of ${USE.variants}`, (v / USE.variants) * HEADS_SHARE);
  const built = variantHead(v);
  variants.push({ built, head: built.head, eyes: built.eyes, ring: built.ring });
}

// =====================================================================
// The landscape
// =====================================================================
// A deep blue-hour cast over the whole world, dark enough for stars to read
// but not so dark that the cream heads and green hills lose their colour.
const SKY = 0x0e1118;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
const riverGroup = new THREE.Group();
scene.add(riverGroup);
const riverMaterial = new THREE.MeshStandardMaterial({ color: 0x78b9b5, roughness: 0.22, metalness: 0.04, transparent: true, opacity: 0.9 });
const fallMaterial = new THREE.MeshBasicMaterial({ color: 0x9bd6d2, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false });
// The fog sets in just past where the statues load (RANGE, 252 units) and
// the terrain sheet's rim sinks (RIM), so an island rises out of the haze
// rather than out of bare sea, and the sea's horizon melts into the sky.
// The shaders' fade-in condenses a new statue out of the fog colour.
// The haze: things fade in with distance, so what loads in at the edge
// (statues at RANGE, islands rising at RIM, both around 250 – 300 units)
// comes up out of it rather than popping. Clear inside `near`, gone at `far`.
// SIGHT: how far the bird sees, world units. Everything that loads in at
// the edge is set from it (the statues, RANGE; the haze; the islands'
// rising, RIM; the terrain sheet, SIZE), so one number trades how far you
// see for how much is drawn: the statues go with its square. (It was 252.)
// The haze is gone AT the sight, not past it: the nearest a statue loads in
// is SIGHT along an axis, and it must be wholly fog colour there, or it
// shows as a pale silhouette against ground that is still half seen. It
// then lifts out of the haze as you close, which is its fade-in. (It was
// near 0.48, far 1.35: the far statues came in only 60% hazed, and popped.)
const distanceParam = new URL(location.href).searchParams.get("distance");
const SIGHT = distanceParam === "near" ? 110 : distanceParam === "far" ? 190 : 150;
const HAZE = { near: 0.55 * SIGHT, far: 1.35 * SIGHT };
scene.fog = new THREE.Fog(SKY, HAZE.near, HAZE.far);
// The lanterns' light: their windows, unlit, warm; dim by day, bright at
// night (setDaylight). The material is made with the lanterns, further down
const LANTERN_GLOW = {
  color: new THREE.Color(0xffc56b),
  day: 0.35, // the windows' brightness by day...
  night: 1.15, // ...and lit, in the evening and the night
  dusk: [0.6, 0.25], // daylight (1 noon, 0 midnight) at which they start to light, and are fully lit
  pool: 9, // world units of warm light on the ground round a lantern's foot, at its scale (lit)
  poolStrength: FLAT.pool, // how bright that pool is at its middle, lit (the look's: flatlight.js)
  wake: 26, // world units: a lantern lights as the bird comes this near it (across), and stays lit
  wakeUp: 35, // ...and no more than this many world units above or below its light: flying high over an island leaves the lanterns lost in the haze below asleep (and silent)
  windWake: 0.9, // how much further the wake and the chimes reach in a full wind (0.9: nearly twice as far): a gale shoves the bird about (WIND.push, vane) so it passes wider, and the lanterns should catch it more readily then, not less
  wakeLit: 0.5, // how lit the hour must have the lanterns (G.lit) before one wakes: not while the night's glow is still fading in and none can be seen yet (they pinged unseen at midnight and as the flight began)
  ease: 1.6, // seconds a lantern takes to come most of the way on
  offShade: 0.82, // an unlit lantern's windows: the sky's colour, this much of it (a little darker), by day or night
  lamps: 4, // lit lanterns about the bird that light what's round them (point lights: the nearest that many)
  lampPower: FLAT.lampPower, // each lamp's brightness, lit (the look's: flatlight.js)
  lampReach: 45, // world units a lamp's light carries
  // The wind chimes (sounds.js SOUND.chimes), quietly, over any dense
  // cluster of lanterns, lit or not, day or night: each lantern counts 1
  // within `near` world units of the bird, less out to `far`, none past
  // it; the chimes start at `from` of those and are full at `full`, so a
  // lone lamp or a sparse sea trail stays quiet (was lit ones only, at
  // night, from 6 to 16: so rare it was never heard)
  chimes: { near: 35, far: 90, from: 3, full: 10 },
  pingOnce: false, // one ping per island, as its first lantern lights; false: a note from every lantern as it lights, a run of them across a dense island (SOUND.ping.gap paces them)
  half: { on: false, fade: 8 }, // on: lit only through the first half of the day's cycle (DAY: midnight to noon, as the slider climbs), coming on over `fade` seconds past midnight; off: lit whenever it is dark enough (dusk), so they come on as the day goes to night too (was on: going from light to dark they stayed out)
  mat: null,
  lit: 0, // how lit the lanterns are now: 0 by day, 1 at night (setDaylight)
};
const pingedCells = new Set(); // the islands (coarse cells) that have pinged

// On a phone (a touch screen, mostly held upright) the view is wider and
// further back, so more of the world is seen round the bird on the narrow screen
const PHONE_VIEW = matchMedia("(hover: none) and (pointer: coarse)").matches ? { fov: 72, distance: 20 } : null;
const camera = new THREE.PerspectiveCamera(
  PHONE_VIEW?.fov ?? 60,
  innerWidth / innerHeight,
  0.5, // the bird is never nearer than 3; a nearer plane spends depth precision the foam (0.06 over the water) needs far out
  3000, // the grass skirt runs out to the horizon
);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 0.75));
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
// Adaptive resolution: the frame rate is watched over `window` seconds;
// running slow (on a low battery, the GPU throttled), the view drops to
// the next pixel ratio down, and climbs back a step once it has run fast
// for `raise` seconds. Pixels are most of the cost (the foam, the fog, the
// shadows' soft edges are all worked per pixel), and a step down is hard
// to see. Off: the screen's own ratio, up to 2, always
const QUALITY = {
  on: false, // the settings' "allow low battery mode" switch: off (as it starts), the screen's own ratio always; on, eased down a little when the frames slow
  // Best first, never under three quarters of the screen's own (on a retina
  // screen, 1.5 of its 2: under that it goes soft; it went to 0.85 once, and blurred)
  ratios: (() => {
    const top = Math.min(devicePixelRatio, 2);
    return [...new Set([top, 1.75, 1.5, 1.25, 1].filter((r) => r <= top && r >= top * 0.75))];
  })(),
  slow: 1 / 40, // seconds a frame, on average, past which a window counts as slow (under 40 fps; a browser saving power holds frames to 30, and that alone shouldn't blur it all the way)
  fast: 1 / 52, // ...and under which it counts as running well (over 52 fps)
  window: 2, // seconds averaged
  slowWindows: 2, // slow windows in a row before it steps down (a hitch as new islands load is one)
  raise: 6, // seconds of running well before it steps back up
};
const quality = { level: 0, t: 0, frames: 0, good: 0, slow: 0 };
function setQualityLevel(level) {
  quality.level = level;
  renderer.setPixelRatio(QUALITY.ratios[level]);
  renderer.setSize(innerWidth, innerHeight);
  starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
}
function stepQuality(delta) {
  if (!QUALITY.on) return;
  quality.t += delta;
  quality.frames++;
  if (quality.t < QUALITY.window) return;
  const avg = quality.t / quality.frames,
    was = quality.level;
  quality.t = quality.frames = 0;
  if (avg > QUALITY.slow) {
    quality.good = 0;
    if (++quality.slow >= QUALITY.slowWindows) {
      quality.slow = 0;
      quality.level = Math.min(quality.level + 1, QUALITY.ratios.length - 1);
    }
  } else {
    quality.slow = 0;
    if (avg < QUALITY.fast) {
      quality.good += QUALITY.window;
      if (quality.good >= QUALITY.raise) {
        quality.good = 0;
        quality.level = Math.max(quality.level - 1, 0);
      }
    } else quality.good = 0;
  }
  if (quality.level !== was) setQualityLevel(quality.level);
}

// Skylight from above, a key light from whichever of the sun or moon is up
// (see "Sun and moon" below), and a faint rim from the other side
const hemi = new THREE.HemisphereLight(0x8fa4cc, 0x2c3448, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xf4ecd6, 2.0);
sun.position.set(30, 60, 20);
scene.add(sun);

// Key-light shadows. The light is directional, so its shadow camera is an
// orthographic box; it's re-centred on the player every frame (snapped to
// shadow texels so the shadows don't shimmer as the bird glides) and covers
// the ground around the bird out to where the fog starts swallowing detail.
// SHADOW_MAP sets the texel: 170 units across 4096 is 4 cm. At 2048 (8 cm)
// the edge of a shadow on a head close by, a chin on its neck, stepped along
// the texels, worst at night when the dark skylight leaves nothing to soften
// it. (PCFSoftShadowMap blurs by a fixed couple of texels and ignores
// sun.shadow.radius; finer texels are the only way to a finer edge.)
const SHADOW_REACH = 85;
const SHADOW_MAP = 4096;
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_REACH;
sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_REACH;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.35;
sun.shadow.radius = 3;
scene.add(sun.target);
const SUN_DIR = sun.position.clone().normalize(); // toward the light; aimKey moves it
const SUN_DIST = 120;
const shadowTexel = (SHADOW_REACH * 2) / sun.shadow.mapSize.x;
// The shadow camera's own right and up axes (it looks along -SUN_DIR with
// world-up as its up hint). Snapping has to happen in this frame: a step in
// world x or z is not a whole texel in the oblique shadow map, and a map that
// slides by fractions of a texel makes every shadow edge shimmer as you fly.
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SUN_RIGHT = new THREE.Vector3();
const SUN_UP = new THREE.Vector3();
function aimKey(dir) {
  SUN_DIR.copy(dir);
  SUN_RIGHT.crossVectors(WORLD_UP, SUN_DIR).normalize();
  SUN_UP.crossVectors(SUN_DIR, SUN_RIGHT).normalize();
}
aimKey(SUN_DIR);
const sunSnap = new THREE.Vector3();
function followSun(p) {
  const u = p.dot(SUN_RIGHT),
    v = p.dot(SUN_UP);
  sunSnap
    .copy(p)
    .addScaledVector(SUN_RIGHT, Math.round(u / shadowTexel) * shadowTexel - u)
    .addScaledVector(SUN_UP, Math.round(v / shadowTexel) * shadowTexel - v);
  sun.target.position.copy(sunSnap);
  sun.position.copy(sunSnap).addScaledVector(SUN_DIR, SUN_DIST);
}
const rim = new THREE.DirectionalLight(0x6f8cc4, 0.6);
rim.position.set(-25, 30, -40);
scene.add(rim);

// =====================================================================
// Night sky: twinkling stars and a moon
// =====================================================================
// Everything here lives in a group that is re-centred on the camera every
// frame, so it sits at "infinity" and never gets closer no matter how far
// the bird flies. Nothing in it takes fog.
const skyDome = new THREE.Group();
scene.add(skyDome);
const SKY_RADIUS = 430; // inside the camera's far plane
// The sky itself: a shell round the camera in the fog's colour, drawn
// through the same shader path the fogged ground takes to the screen, so
// where the sea meets the sky at the horizon the two are the same pixel
// value (the renderer's clear colour can land a shade off, and the join
// shows as a line). Drawn first, under everything.
const skyShell = new THREE.Mesh(
  new THREE.SphereGeometry(2500, 24, 12), // inside the camera's far plane
  new THREE.MeshBasicMaterial({ color: SKY, side: THREE.BackSide, fog: false, depthWrite: false }),
);
skyShell.renderOrder = -1;
skyShell.frustumCulled = false;
skyDome.add(skyShell);

// Stars: one point each, scattered over the upper hemisphere. Each star gets
// its own size, twinkle speed and phase so the sky never blinks in unison.
const STAR_COUNT = 1400;
const starPos = new Float32Array(STAR_COUNT * 3);
const starSize = new Float32Array(STAR_COUNT);
const starTwinkle = new Float32Array(STAR_COUNT * 2); // speed, phase
const starTint = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  // Uniform on a sphere, then keep only points comfortably above the horizon
  const u = Math.random() * 2 - 1;
  const y = 0.04 + Math.abs(u) * 0.96;
  const r = Math.sqrt(1 - y * y);
  const a = Math.random() * Math.PI * 2;
  starPos.set([Math.cos(a) * r * SKY_RADIUS, y * SKY_RADIUS, Math.sin(a) * r * SKY_RADIUS], i * 3);
  // Mostly small stars, a few bright ones
  starSize[i] = 0.9 + Math.pow(Math.random(), 4) * 3.2;
  starTwinkle.set([0.6 + Math.random() * 2.4, Math.random() * Math.PI * 2], i * 2);
  // Faint colour cast: most white-blue, some warm
  const warm = Math.random() < 0.2;
  starTint.set(warm ? [1.0, 0.9, 0.75] : [0.85 + Math.random() * 0.15, 0.9 + Math.random() * 0.1, 1.0], i * 3);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));
starGeo.setAttribute("aTwinkle", new THREE.BufferAttribute(starTwinkle, 2));
starGeo.setAttribute("aTint", new THREE.BufferAttribute(starTint, 3));

const starMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uFade: { value: 1 }, // 1 at night, 0 in daylight
  },
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute vec2 aTwinkle;
    attribute vec3 aTint;
    uniform float uTime;
    uniform float uPixelRatio;
    varying float vAlpha;
    varying vec3 vTint;
    void main() {
      // Two out-of-phase sines so the flicker feels irregular, not metronomic
      float t = uTime * aTwinkle.x + aTwinkle.y;
      float tw = 0.55 + 0.45 * (0.6 * sin(t) + 0.4 * sin(t * 2.7 + 1.3));
      vAlpha = tw;
      vTint = aTint;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (0.7 + 0.6 * tw) * uPixelRatio * 2.0;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uFade;
    varying float vAlpha;
    varying vec3 vTint;
    void main() {
      // Soft round dot with a bright core
      float d = length(gl_PointCoord - 0.5) * 2.0;
      if (d > 1.0) discard;
      float core = smoothstep(1.0, 0.0, d);
      float a = core * core * vAlpha * uFade;
      gl_FragColor = vec4(vTint, a);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const stars = new THREE.Points(starGeo, starMat);
stars.frustumCulled = false;
skyDome.add(stars);

// Moon: a painted disc on a sprite, plus a wide soft halo behind it. Where
// it hangs is set with the hour (see "Sun and moon" below).
function moonTexture(size, drawHalo) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;
  if (drawHalo) {
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0, "rgba(220,228,255,0.55)");
    g.addColorStop(0.35, "rgba(200,212,255,0.18)");
    g.addColorStop(1, "rgba(180,196,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else {
    const R = size * 0.42;
    // Body: slightly warm ivory, a little darker toward the lower-left limb
    const g = ctx.createRadialGradient(cx - R * 0.35, cx - R * 0.35, R * 0.1, cx, cx, R);
    g.addColorStop(0, "#fffbee");
    g.addColorStop(0.7, "#efe9d6");
    g.addColorStop(1, "#c9c4b4");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cx, R, 0, Math.PI * 2);
    ctx.fill();
    // Soft edge so it doesn't look cut out
    ctx.globalCompositeOperation = "destination-in";
    const edge = ctx.createRadialGradient(cx, cx, R * 0.9, cx, cx, R * 1.02);
    edge.addColorStop(0, "rgba(0,0,0,1)");
    edge.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const moonHalo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: moonTexture(256, true),
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  }),
);
moonHalo.scale.setScalar(120);
skyDome.add(moonHalo);
const moon = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: moonTexture(256, false),
    transparent: true,
    depthWrite: false,
    fog: false,
  }),
);
moon.scale.setScalar(34);
skyDome.add(moon);

// A soft sun disc follows the same arc as the directional light. Its warm
// rim is strongest at dawn and dusk, and it slips below the horizon at night.
function sunTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  const center = 128;
  const glow = context.createRadialGradient(center, center, 8, center, center, center);
  glow.addColorStop(0, "rgba(255,255,238,1)");
  glow.addColorStop(0.18, "rgba(255,248,220,1)");
  glow.addColorStop(0.28, "rgba(255,220,166,0.92)");
  glow.addColorStop(0.5, "rgba(255,148,100,0.34)");
  glow.addColorStop(1, "rgba(255,125,86,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}
const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
  map: sunTexture(),
  color: 0xfff0d3,
  transparent: true,
  depthWrite: false,
  fog: false,
  blending: THREE.AdditiveBlending,
}));
const SUNSET_SKY = new THREE.Color(0xff805a);
sunDisc.scale.setScalar(88);
skyDome.add(sunDisc);

// =====================================================================
// Day and night
// =====================================================================
// One number, 0 = the night above, 1 = full day, blends everything that
// makes the hour: where the sun and moon hang, the sky and fog colour, the
// skylight, the key light and the rim, and the stars.
// On the way it passes through a violet twilight and an orange sunrise;
// each stop sits at its `at` along the slider and neighbours blend into
// each other. The slider at the top right sets it; the setting is kept
// between visits.
// The hours are daylight.js's (HOURS), shared with the scene lab's slider

// Sun and moon. The sun rides a tilted arc that comes up out of the east:
// the slider runs it from well below the horizon (0, with the moon high in
// the south-east) through rising at about 0.44 and sitting low and orange at
// 0.5, up to its noon height at 1. The moon is full, so it sits opposite the
// sun and sets as the sun rises. The key light comes from whichever is up,
// fading to nothing as they cross the horizon so its shadows swap sides
// unseen, and never comes in lower than KEY_MIN_ELEV so the shadows stay
// long rather than infinite.
const ARC_EAST = new THREE.Vector3(1, 0, 0.35).normalize(); // where it rises
const ARC_TILT = THREE.MathUtils.degToRad(60); // the sun's noon height
const ARC_TOP = new THREE.Vector3(0, Math.sin(ARC_TILT), 0)
  .addScaledVector(new THREE.Vector3().crossVectors(ARC_EAST, WORLD_UP), -Math.cos(ARC_TILT))
  .normalize(); // straight up the arc from ARC_EAST, leaning south
const ARC_FROM = THREE.MathUtils.degToRad(-70); // how far round the sun is at 0
const KEY_MIN_ELEV = 0.12; // sin of the lowest the key light gets (~7°)
const sunDir = new THREE.Vector3();
const moonDir = new THREE.Vector3();
const keyDir = new THREE.Vector3();
function placeSky(t) {
  const a = THREE.MathUtils.lerp(ARC_FROM, Math.PI / 2, t);
  sunDir.copy(ARC_EAST).multiplyScalar(Math.cos(a)).addScaledVector(ARC_TOP, Math.sin(a));
  moonDir.copy(sunDir).negate();
  sunDisc.position.copy(sunDir).multiplyScalar(SKY_RADIUS - 3);
  const sunVisibility = THREE.MathUtils.smoothstep(sunDir.y, -0.06, 0.07);
  sunDisc.visible = sunVisibility > 0;
  sunDisc.material.opacity = sunVisibility;
  const sunset = 1 - THREE.MathUtils.smoothstep(sunDir.y, 0.04, 0.48);
  sunDisc.material.color.set(0xfff3d7).lerp(SUNSET_SKY, sunset * 0.72);

  // The moon sinks out of sight just below the horizon rather than glowing
  // through the ground
  const moonUp = THREE.MathUtils.smoothstep(moonDir.y, -0.04, 0.02);
  moon.position.copy(moonDir).multiplyScalar(SKY_RADIUS - 2);
  moonHalo.position.copy(moonDir).multiplyScalar(SKY_RADIUS);

  // Key light from whichever body is up, clamped off the horizon
  const body = sunDir.y >= 0 ? sunDir : moonDir;
  keyDir.set(body.x, 0, body.z).normalize();
  const elev = Math.max(body.y, KEY_MIN_ELEV);
  keyDir.multiplyScalar(Math.sqrt(1 - elev * elev)).setY(elev);
  aimKey(keyDir);
  // Rim from the far side, a little above
  rim.position.set(-keyDir.x, 0.6, -keyDir.z).normalize().multiplyScalar(50);
  // 0 as the bodies cross the horizon, 1 once one is clear of it
  return { moonUp, keyFade: THREE.MathUtils.smoothstep(Math.abs(sunDir.y), 0, 0.08) };
}

// =====================================================================
// The lab's light
// =====================================================================
// With LAB_LIGHT on, the field is lit as the pillars lab lights its row
// (pillars.js): a warm yellow-white sky, the same skylight, moon and rim,
// always day, and the night sky, its stars and moon, and the day/night
// slider sit out. Off (as now), the hours above run: the slider, the sky,
// the stars and the moon, and the fog in the sky's colour.
const LAB_LIGHT = false;
const LAB = { sky: 0xf3ecd8, hemi: [0x8fa4cc, 0x2c3448, 1.0], sun: [0xf4ecd6, 2.5], rim: [0x6f8cc4, 0.8] };
function applyLabLight() {
  scene.background.set(LAB.sky);
  if (scene.fog) scene.fog.color.set(LAB.sky);
  skyShell.material.color.set(LAB.sky);
  hemi.color.set(LAB.hemi[0]);
  hemi.groundColor.set(LAB.hemi[1]);
  hemi.intensity = LAB.hemi[2];
  sun.color.set(LAB.sun[0]);
  sun.intensity = LAB.sun[1];
  rim.color.set(LAB.rim[0]);
  rim.intensity = LAB.rim[1];
  foamColor.value.set(HOURS[HOURS.length - 1].foam);
  skyDome.visible = false;
  const dn = document.getElementById("daynight");
  if (dn) dn.style.display = "none";
}
// Rain: the "rain" slider at the top right sets how hard it rains (0 dry,
// 1 a downpour), the "wind" slider how hard it blows. Streaks fall in a box
// that rides with the bird, more of them the harder it rains, slanting and
// drifting with the wind; while it rains the sky greys and dims, the haze
// closes in, and cloud hides the stars and the moon. It follows the slider
// over `fade` seconds. In heavy rain the sky flashes now and then with
// lightning (`lightning`), and thunder follows
const RAIN = {
  level: 0, // the slider: how hard it is to rain, 0 – 1
  wind: 0.2, // the wind slider, 0 – 1
  drops: 6000, // streaks in the box in a downpour (fewer, in proportion, in lighter rain)
  box: 140, // world units across the box round the bird
  height: 90, // ...and top to bottom, centred on the bird
  speed: 60, // world units a second they fall
  slant: [0.04, 0.9], // how far they slant, sideways per unit fallen: no wind, full wind
  length: 2.2, // world units a streak is long
  thick: [0.03, 0.09], // its radius at the tail and at the head: a stroke, thicker than a line
  opacity: 0.38, // how much they show (already at full in light rain: it is the count that thins)
  lighten: 0.35, // the streaks: the sky's colour, this much of the way to white
  grey: [0x8b9099, 0.4], // the sky greys toward this colour, by this much
  dim: 0.45, // the sun loses this share of its light (the sky light half as much)
  haze: 0.6, // the fog's near and far, this share of what they are dry
  fade: 4, // seconds the rain takes to come round to the slider, from dry to full
  // Lightning, past `from` of the rain: a flash every `every` seconds (the
  // first number in a downpour, the second just past `from`), give or take
  // a third; each one to three quick pulses lighting the whole sky, not a
  // bolt. `sky`: how far toward white the sky goes at a flash's peak;
  // `light`: how much brighter the sky light gets; `decay`: seconds a pulse
  // takes to die (a third of the way). Thunder follows, sooner and louder
  // the nearer the strike (`thunder`: seconds after, near and far)
  lightning: { from: 0.45, every: [6, 18], pulses: [1, 3], sky: 0.45, light: 1.6, decay: 0.12, thunder: [0.6, 3.5] },
  amount: 0, // how hard it is raining now (stepRain eases it toward `level`)
  flash: 0, // the lightning's flash now, 0 – 1
};
// The wind: how hard it blows is the "wind" slider (RAIN.wind, 0 – 1),
// which way the "dir" slider (a compass bearing it blows toward: 0 along
// +z, 90 along +x). It slants and drifts the rain, sways the trees (their
// tops lean downwind and rock in the gusts, in the shader, treeMat) and
// pushes the bird downwind
const WIND = {
  dir: 60, // degrees: which way it blows (the slider)
  push: 16, // world units a second it drifts the bird at full strength (the bird flies at 11 – 31; was 7, in step with the strength)...
  pushCurve: 1.8, // ...climbing steeply with it: a breeze (0.2) barely nudges (about 0.9), a strong wind (0.5) pushes (about 4.6), a gale shoves
  vane: 0.35, // radians a second a full wind swings the bird's heading round toward downwind (as the square of the strength, so only a storm does much): flying into it takes holding a turn against it
  sway: 2.4, // world units a tree's top leans downwind at full strength, a tree `swayH` tall (taller leans more, shorter less)
  swayH: 40,
  gust: [0.35, 0.7], // how much it gusts (a share of its strength, up and down) and how fast (per second)
  ease: 1.5, // seconds it takes to follow the slider
  // A storm (a strong wind or heavy rain, from `storm[0]` of either, full by
  // `storm[1]`) is chaotic: its way swirls about the slider's, up to `swirl`
  // radians either side, quicker the wilder (`rate`, per second, at full),
  // and its gusts grow by up to `gusty` again. Everything that follows the
  // wind follows the swirl: the trees, the rain, the lines, the bird
  storm: [0.55, 1],
  swirl: 1.1,
  rate: 0.9,
  gusty: 1,
};
let windNow = 0; // how hard it is blowing this moment: the slider, eased, with its gusts
const windDir = new THREE.Vector2(0, 1); // which way, a unit vector in (x, z)
const windUniforms = { uWindDir: { value: new THREE.Vector2(0, 1) }, uWind: { value: 0 }, uWindTime: { value: 0 } };
// Snow: the "snow" bar in the settings, or the weather's snow and
// blizzard. Flakes fall slowly in a box round the bird, drifting with the
// wind and wavering as they go; while it snows the island whitens (`cover`
// builds up, and melts away after), on what faces the sky only: the grass,
// the tops of the trees, the heads' crowns and shoulders, the obelisks'
// caps; nothing under the water. It greys the sky, as rain does, less
const SNOW = {
  level: 0, // the slider: how hard it is to snow, 0 – 1
  amount: 0, // how hard it is snowing now (eased toward `level`)
  cover: 0, // how much has settled: 0 bare, 1 white (shaders' uSnow)
  fade: 4, // seconds the snowfall takes to come round to the slider
  build: 20, // seconds of full snowfall to whiten the island (lighter snow, longer; was 30)
  melt: 12, // seconds it takes to melt away once it stops (was 45: with the weather changing every 15 – 45 seconds, it never cleared)
  flakes: 3500, // flakes in the box in full snow (fewer in lighter)
  box: [130, 80], // world units across the box round the bird, and top to bottom
  size: [0.07, 0.15], // a flake's radius
  speed: [3.5, 6.5], // world units a second they fall
  drift: 9, // world units a second the wind carries them at full strength
  waver: 0.7, // world units they sway side to side as they fall
  opacity: 0.85,
  color: 0xf4f6f9, // what settles: a cool white
  sky: 0.6, // the sky greys as for rain this hard, at full snow
  slope: [0.25, 0.75], // how much a surface must face the sky to hold snow (its normal's y: from none, to all)
  treeSlope: [-0.05, 0.35], // ...the trees' (the cedars are tall spires, their faces nearly upright: at the ground's slope they held none; this dusts them, the undersides kept green)
};
const snowUniforms = { uSnow: { value: 0 }, uSnowColor: { value: new THREE.Color(SNOW.color) } };
// The snow on a material: its colour taken toward the snow's where it faces
// the sky, as much as has settled, above the water. Chained after whatever
// the material already does to its shaders
function addSnow(mat, slope = SNOW.slope) {
  const prev = mat.onBeforeCompile,
    prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, snowUniforms);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vSnowY;").replace(
      "#include <fog_vertex>",
      `#include <fog_vertex>
  {
    vec4 sw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      sw = instanceMatrix * sw;
    #endif
    vSnowY = (modelMatrix * sw).y;
  }`,
    );
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uSnow;\nuniform vec3 uSnowColor;\nvarying float vSnowY;").replace(
      "#include <lights_physical_fragment>",
      `{
    vec3 sn = inverseTransformDirection(normal, viewMatrix);
    float k = uSnow * smoothstep(${slope[0].toFixed(2)}, ${slope[1].toFixed(2)}, sn.y) * smoothstep(${(WATER_Y + 0.3).toFixed(2)}, ${(WATER_Y + 0.9).toFixed(2)}, vSnowY);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, k);
  }
  #include <lights_physical_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => prevKey() + `-snow${slope.join(",")}`;
}
const RAIN_GREY = new THREE.Color(RAIN.grey[0]);
// The foam's colour by the hour (the foam sheet itself is built with the
// sea, further down, and reads this uniform)
const foamColor = { value: new THREE.Color(0xf2f7fb) };
let daylight = 0;
function setDaylight(t) {
  if (LAB_LIGHT) return applyLabLight();
  blendColor(foamColor.value, "foam", t, LAB_PALETTE.foam, LAB_PALETTE.water); // at night, the day's foam with a little of the water in it
  daylight = THREE.MathUtils.clamp(t, 0, 1);
  const { moonUp, keyFade } = placeSky(daylight);
  blendColor(scene.background, "sky", daylight, LAB_PALETTE.sky, LAB_PALETTE.water); // the night sky: the water, darkened
  const wet = Math.max(RAIN.amount, SNOW.sky * SNOW.amount); // rain, or snow (a lighter grey)
  if (wet > 0) scene.background.lerp(RAIN_GREY.clone().multiplyScalar(0.25 + 0.75 * daylight), RAIN.grey[1] * wet); // greyed by the rain (a darker grey by night)
  if (RAIN.flash > 0) scene.background.lerp(MIST_WHITE, RAIN.lightning.sky * RAIN.flash); // lit up by the lightning
  scene.fog.color.copy(scene.background);
  skyShell.material.color.copy(scene.fog.color);
  blendColor(hemi.color, "hemiSky", daylight);
  blendColor(hemi.groundColor, "hemiGround", daylight);
  hemi.intensity = blend("hemiPower", daylight) * (1 - 0.5 * RAIN.dim * wet) * (1 + RAIN.lightning.light * RAIN.flash);
  blendColor(sun.color, "sunColor", daylight);
  sun.intensity = blend("sunPower", daylight) * keyFade * (1 - RAIN.dim * wet);
  blendColor(rim.color, "rimColor", daylight);
  rim.intensity = blend("rimPower", daylight);
  lightLanterns();
  // Stars go as the sky brightens; the moon's glow goes with them, and the
  // moon itself pales as it sets into the dawn
  const dusk = THREE.MathUtils.smoothstep(daylight, 0.1, 0.55);
  starMat.uniforms.uFade.value = (1 - dusk) * (1 - wet); // behind the rain's cloud
  moonHalo.material.opacity = (1 - dusk) * moonUp * (1 - wet);
  moon.material.opacity = (1 - 0.6 * dusk) * moonUp * (1 - wet);
}
// The day turns as the bird flies: night to day and back over DAY.period
// seconds, starting at night. The slider shows where the day has got to,
// and dragging it sets the time of day; the cycle carries on from there.
const DAY = {
  on: true, // false holds the slider's time of day
  period: 240, // seconds a whole day and night takes
};
let dayT = DAY.period * 0.75; // begin at sunset, then keep the existing day/night cycle running
const dayAt = (t) => 0.5 - 0.5 * Math.cos((t / DAY.period) * Math.PI * 2);
const daySlider = document.getElementById("daylight");
// The violin (sounds.js SOUND.moments) as the day/night slider passes its
// middle: the daylight crossing HORIZON, rising (dawn, the sun low and
// orange) or falling (dusk), however it got there; at most once every
// SOUND.moments.sun.gap seconds
const HORIZON = 0.5;
function sunMoment(was) {
  if (started && (was < HORIZON) !== (daylight < HORIZON)) sounds.violin("sun");
}
// ...and every few islands: each island the bird comes in over the grass
// of counts once, and every `every` of them (drawn afresh each time) the
// violin plays (SOUND.moments.island.gap and apart still hold it back)
const ISLAND_VIOLIN = { every: [3, 4] };
let islandLast = null,
  islandsSince = 0,
  islandsDue = 0;
function islandMoment() {
  if (!started || islandField(player.position.x, player.position.z) > 0) return; // over the water
  const cx = Math.floor(player.position.x / GROUP.cell),
    cz = Math.floor(player.position.z / GROUP.cell);
  let isl = null,
    best = Infinity;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const o = groupAt(cx + di, cz + dj).island;
      const d = o ? Math.hypot(o.x - player.position.x, o.z - player.position.z) : Infinity;
      if (d < best) (best = d), (isl = o);
    }
  if (!isl || isl === islandLast) return;
  islandLast = isl;
  islandsDue ||= ISLAND_VIOLIN.every[0] + Math.floor(Math.random() * (ISLAND_VIOLIN.every[1] - ISLAND_VIOLIN.every[0] + 1));
  if (++islandsSince < islandsDue) return;
  islandsSince = islandsDue = 0;
  sounds.violin("island");
}
if (daySlider) {
  daySlider.addEventListener("input", () => {
    // The slider's daylight, on the way up (morning): the cycle goes on from there
    dayT = (Math.acos(1 - 2 * +daySlider.value) / (Math.PI * 2)) * DAY.period;
    const was = daylight;
    setDaylight(+daySlider.value);
    sunMoment(was);
  });
}
function stepDay(delta) {
  if (!DAY.on) return;
  dayT = (dayT + delta) % DAY.period;
  const was = daylight;
  setDaylight(dayAt(dayT));
  sunMoment(was);
  if (daySlider) daySlider.value = daylight;
}
setDaylight(dayAt(dayT));

// The rain's streaks: each a slim tapered stroke (thin at its tail, fat
// at its head, like a drawn raindrop), one instanced mesh for them all, in
// a box round the bird; each falls, slanting with the wind, and starts
// again at the top when it drops out of the bottom, or wraps round when
// the bird leaves it behind. Only their positions change, so the slant is
// built into the stroke (rebuilt when the wind changes) and each frame
// writes just where each one is
const rainPos = new Float32Array(RAIN.drops * 3); // each drop's head, world units
const rainSlant = () => THREE.MathUtils.lerp(RAIN.slant[0], RAIN.slant[1], RAIN.wind);
const rainStroke = (slant, dir) =>
  new THREE.CylinderGeometry(RAIN.thick[0], RAIN.thick[1], RAIN.length, 5, 1)
    .translate(0, RAIN.length / 2, 0) // its head at the origin, its tail above
    .rotateZ(Math.atan(slant)) // leaning back along its fall (downwind is +x here)...
    .rotateY(Math.atan2(-dir.y, dir.x)); // ...turned so downwind is the wind's way
const rainMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
const rain = new THREE.InstancedMesh(rainStroke(rainSlant(), windDir), rainMat, RAIN.drops);
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);
let rainSeeded = false,
  rainSlantNow = rainSlant(),
  rainDirNow = null, // (built for no way in particular: the first rain rebuilds it)
  rainTime = 0,
  nextFlash = 4; // seconds of heavy rain before the first flash
const flashes = []; // pulses to come: the rain's clock when each lights
function stepRain(delta) {
  const R = RAIN,
    L = R.lightning,
    was = R.amount,
    flashWas = R.flash;
  rainTime += delta;
  R.amount += THREE.MathUtils.clamp(R.level - R.amount, -delta / R.fade, delta / R.fade);
  // Lightning, in heavy rain: a flash now and then, more often the harder
  // it rains, each a pulse or a few; thunder after it
  if (R.amount >= L.from) {
    nextFlash -= delta;
    if (nextFlash <= 0) {
      const heavy = (R.amount - L.from) / (1 - L.from);
      nextFlash = THREE.MathUtils.lerp(L.every[1], L.every[0], heavy) * (0.67 + 0.66 * Math.random());
      const n = L.pulses[0] + Math.floor(Math.random() * (L.pulses[1] - L.pulses[0] + 1));
      for (let i = 0, at = rainTime; i < n; i++, at += 0.07 + Math.random() * 0.16) flashes.push(at);
      const near = Math.random();
      setTimeout(() => sounds.thunder(near), THREE.MathUtils.lerp(L.thunder[1], L.thunder[0], near) * 1000);
    }
  } else nextFlash = Math.max(nextFlash, 3);
  R.flash *= Math.exp(-delta / L.decay);
  while (flashes.length && flashes[0] <= rainTime) {
    flashes.shift();
    R.flash = Math.max(R.flash, 0.6 + 0.4 * Math.random());
  }
  if (R.flash < 0.002) R.flash = 0;
  // The sky, the light and the haze follow how hard it rains and the
  // flashes (the day's turn does it each frame anyway, but a beat behind)
  if (R.flash > 0 || flashWas > 0 || (R.amount !== was && (!DAY.on || !started))) setDaylight(daylight);
  const hazeK = THREE.MathUtils.lerp(1, R.haze, Math.max(R.amount, SNOW.amount)); // (snow closes the haze in as rain does)
  scene.fog.near = HAZE.near * hazeK;
  scene.fog.far = HAZE.far * hazeK;
  sounds.rain(R.amount);
  const count = Math.round(R.drops * R.amount);
  rain.visible = count > 0;
  if (!rain.visible) return;
  rain.count = count;
  // The wind: the strokes rebuilt at its slant and its way when either has changed
  const slant = rainSlant();
  const way = Math.atan2(windDir.x, windDir.y);
  if (Math.abs(slant - rainSlantNow) > 1e-3 || rainDirNow === null || Math.abs(wrapAngle(way - rainDirNow)) > 0.03) {
    rain.geometry.dispose();
    rain.geometry = rainStroke(slant, windDir);
    rainSlantNow = slant;
    rainDirNow = way; // (the wind's way as it is, swirls and all: rebuilt when it has turned a couple of degrees)
  }
  rainMat.opacity = R.opacity * Math.min(1, R.amount * 4);
  rainMat.color.copy(scene.fog.color).lerp(MIST_WHITE, R.lighten);
  const c = camera.position,
    half = R.box / 2,
    top = c.y + R.height / 2,
    bottom = c.y - R.height / 2;
  const fall = R.speed * delta;
  const out = rain.instanceMatrix.array;
  for (let i = 0; i < R.drops; i++) {
    const j = i * 3;
    let x = rainPos[j],
      y = rainPos[j + 1],
      z = rainPos[j + 2];
    if (!rainSeeded) {
      x = c.x + (Math.random() * 2 - 1) * half;
      y = bottom + Math.random() * R.height;
      z = c.z + (Math.random() * 2 - 1) * half;
    } else {
      if (i >= count) continue; // (not falling now: it keeps its place for when the rain picks up)
      y -= fall;
      x += fall * slant * windDir.x;
      z += fall * slant * windDir.y;
      if (y < bottom) {
        // From the top again, somewhere new in the box
        y = top - Math.random() * fall;
        x = c.x + (Math.random() * 2 - 1) * half;
        z = c.z + (Math.random() * 2 - 1) * half;
      }
      // Left behind as the bird flies on: round to the box's far side
      if (x < c.x - half) x += R.box;
      else if (x > c.x + half) x -= R.box;
      if (z < c.z - half) z += R.box;
      else if (z > c.z + half) z -= R.box;
      if (y > top) y -= R.height;
    }
    rainPos[j] = x;
    rainPos[j + 1] = y;
    rainPos[j + 2] = z;
    const k = i * 16 + 12; // the instance matrix's translation (the rest stays the identity)
    out[k] = x;
    out[k + 1] = y;
    out[k + 2] = z;
  }
  rainSeeded = true;
  rain.instanceMatrix.needsUpdate = true;
}
// The wind made visible (WIND_FX): faint lines streaming downwind, each
// drawn out as it fades in and taken back as it fades away, and specks of
// something (dust, seed) drifting and bobbing in it; more of both the harder
// it blows, none in a breeze. Each a thin stroke or a mote in a box about
// the bird, living a second or two, then starting again somewhere new in
// the box. Their fade is their own (an alpha per instance), and the fog
// takes them as it does everything else
const WIND_FX = {
  from: 0.18, // wind strength they start to show at; all of them by a full wind
  box: [110, 36], // world units across the box round the bird, and top to bottom
  lines: { count: 120, length: [8, 20], life: [0.9, 2], radius: 0.025, opacity: 0.32, bend: 0.35, twist: 0.25 }, // bend: world units a line bows out at its middle (whatever its length); twist: radians a second it rolls about its own length as it goes, so its bow turns slowly
  specks: { count: 320, size: [0.05, 0.11], life: [1.5, 3.5], opacity: 0.55, bob: 0.6 }, // bob: world units they rise and fall
  speed: [18, 34], // world units a second they ride the wind at full strength (each its own), more slowly in less
  lighten: 0.55, // their colour: the sky's, this much of the way to white
};
const windFxMat = () =>
  new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } }),
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * vAlpha);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
// A field of them: its mesh (a stroke along +x, or a mote) and each one's
// place, age, life, length or size, speed and phase
function windField(geo, n) {
  geo.setAttribute("aAlpha", new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
  const mesh = new THREE.InstancedMesh(geo, windFxMat(), n);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, n, pos: new Float32Array(n * 3), age: new Float32Array(n), life: new Float32Array(n), size: new Float32Array(n), speed: new Float32Array(n), phase: new Float32Array(n) };
}
// A line: a slim tube along a long, gentle bezier arc, one unit long
// down +x (stretched to its length per line, its bow kept the same): nearly
// straight, just bowed, the control point a little off the middle so the
// arc leans like a stroke drawn by hand; turned about its length, each line
// bows its own way
const windCurve = new THREE.QuadraticBezierCurve3(
  new THREE.Vector3(-0.5, 0, 0),
  new THREE.Vector3(0.1, 2 * WIND_FX.lines.bend, 0), // (a quadratic bezier reaches half its control point's height)
  new THREE.Vector3(0.5, 0, 0),
);
// ...tapered: fullest at its middle, drawn to a point at each end, as a brush stroke
const windTube = (() => {
  const tub = 32,
    rad = 3,
    g = new THREE.TubeGeometry(windCurve, tub, WIND_FX.lines.radius, rad, false);
  const pos = g.attributes.position,
    P = new THREE.Vector3(),
    V = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    const u = Math.floor(k / (rad + 1)) / tub; // how far along (TubeGeometry lays its rings out one after another)
    windCurve.getPointAt(u, P);
    V.fromBufferAttribute(pos, k).sub(P).multiplyScalar(Math.pow(Math.sin(Math.PI * u), 0.6)).add(P);
    pos.setXYZ(k, V.x, V.y, V.z);
  }
  return g;
})();
const windLines = windField(windTube, WIND_FX.lines.count);
const windSpecks = windField(new THREE.IcosahedronGeometry(1, 0), WIND_FX.specks.count);
const fxDummy = new THREE.Object3D();
const fxRand = ([lo, hi]) => lo + Math.random() * (hi - lo);
function stepWindField(F, spec, delta, amount, isLine) {
  const live = Math.round(F.n * amount);
  F.mesh.visible = live > 0;
  F.mesh.count = live;
  if (!live) return;
  const c = camera.position,
    [across, tall] = WIND_FX.box;
  F.mesh.material.uniforms.uOpacity.value = spec.opacity;
  F.mesh.material.uniforms.uColor.value.copy(scene.fog.color).lerp(MIST_WHITE, WIND_FX.lighten);
  const alpha = F.mesh.geometry.attributes.aAlpha.array;
  const yaw = Math.atan2(-windDir.y, windDir.x); // +x turned to downwind
  for (let i = 0; i < live; i++) {
    const j = i * 3;
    F.age[i] += delta;
    if (F.life[i] === 0 || F.age[i] >= F.life[i]) {
      const first = F.life[i] === 0;
      // Again, somewhere new in the box
      F.pos[j] = c.x + (Math.random() - 0.5) * across;
      F.pos[j + 1] = c.y + (Math.random() - 0.5) * tall;
      F.pos[j + 2] = c.z + (Math.random() - 0.5) * across;
      F.life[i] = fxRand(spec.life);
      F.age[i] = first ? Math.random() * F.life[i] : Math.random() * 0.2; // (the first lives staggered, so they don't all fade in step)
      F.size[i] = fxRand(isLine ? spec.length : spec.size);
      F.speed[i] = fxRand(WIND_FX.speed);
      F.phase[i] = Math.random() * Math.PI * 2;
    }
    const v = F.speed[i] * Math.max(windNow, 0.2) * delta;
    F.pos[j] += windDir.x * v;
    F.pos[j + 2] += windDir.y * v;
    if (!isLine) F.pos[j + 1] += Math.cos(F.age[i] * 2.4 + F.phase[i]) * spec.bob * 2.4 * delta; // bobbing as it goes
    const fade = Math.sin(Math.PI * Math.min(1, F.age[i] / F.life[i])); // in, then out
    alpha[i] = fade;
    fxDummy.position.set(F.pos[j], F.pos[j + 1], F.pos[j + 2]);
    if (isLine) {
      // Downwind, rolled about its own length (each its own way, and turning
      // over as it goes); drawn out as it comes, taken back as it goes
      fxDummy.rotation.set(F.phase[i] + F.age[i] * spec.twist, yaw, 0, "YXZ");
      fxDummy.scale.set(F.size[i] * (0.3 + 0.7 * fade), 1, 1);
    } else {
      fxDummy.rotation.set(F.phase[i], F.age[i] * 3 + F.phase[i], 0);
      fxDummy.scale.setScalar(F.size[i]);
    }
    fxDummy.updateMatrix();
    F.mesh.setMatrixAt(i, fxDummy.matrix);
  }
  F.mesh.instanceMatrix.needsUpdate = true;
  F.mesh.geometry.attributes.aAlpha.needsUpdate = true;
}
function stepWindFx(delta) {
  const amount = THREE.MathUtils.smoothstep(windNow, WIND_FX.from, 1);
  stepWindField(windLines, WIND_FX.lines, delta, amount, true);
  stepWindField(windSpecks, WIND_FX.specks, delta, amount, false);
}
// The weather on its own (WEATHER.auto, the "auto weather" switch in the
// settings): it comes in presets, one after another, each drawn by its
// weight and lasting `last` seconds, the rain and the wind easing toward
// each new one's over `turn` seconds from nothing to full, the wind's way
// wandering toward a new bearing up to `veer` degrees off the last. It
// starts clear for `first` seconds. The next is drawn as the last begins,
// so the settings can say what is coming, when, and for how long; a
// preset's chip there starts it at once. Moving a weather slider takes the
// weather over (auto off) until the switch is turned on again
const WEATHER = {
  auto: true,
  presets: [
    { name: "clear", weight: 3, rain: [0, 0], wind: [0, 0.05] },
    { name: "breeze", weight: 3, rain: [0, 0], wind: [0.15, 0.3] },
    { name: "windy", weight: 1.5, rain: [0, 0], wind: [0.45, 0.6] },
    { name: "wind storm", weight: 0.6, rain: [0, 0], wind: [0.85, 1] },
    { name: "light rain", weight: 2, rain: [0.15, 0.3], wind: [0.1, 0.25] },
    { name: "heavy rain", weight: 1, rain: [0.75, 0.9], wind: [0.2, 0.5] },
    { name: "storm", weight: 1, rain: [0.45, 0.65], wind: [0.45, 0.65] },
    { name: "hurricane", weight: 0.3, rain: [0.9, 1], wind: [0.95, 1] },
    { name: "snow", weight: 1, rain: [0, 0], wind: [0.1, 0.3], snow: [0.45, 0.65] },
    { name: "heavy snow", weight: 0.7, rain: [0, 0], wind: [0.05, 0.2], snow: [0.85, 1] }, // as thick as a blizzard but nearly still: it comes straight down
    { name: "blizzard", weight: 0.4, rain: [0, 0], wind: [0.8, 1], snow: [0.9, 1] },
  ],
  last: [120, 120], // seconds a preset lasts (2 minutes)
  first: 120, // seconds of clear weather to open with (2 minutes)
  turn: 8, // seconds the rain or the wind takes to go from nothing to full toward a preset's (was 15: with presets this short, a storm would hardly arrive before it left)
  veer: 90, // degrees a preset's wind may come round from the last
  veerRate: 4, // degrees a second it comes round, at most
};
const weatherDraw = ([lo, hi]) => lo + Math.random() * (hi - lo);
// The order they come in: a shuffled deck of every preset, dealt one by
// one and shuffled again when it runs out, never the same one twice
// running (so every kind comes round, in no set order; the weights no
// longer count)
let weatherDeck = [],
  weatherLast = "clear";
function dealPreset() {
  if (!weatherDeck.length) {
    weatherDeck = [...WEATHER.presets];
    for (let i = weatherDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [weatherDeck[i], weatherDeck[j]] = [weatherDeck[j], weatherDeck[i]];
    }
    if (weatherDeck[weatherDeck.length - 1].name === weatherLast) weatherDeck.unshift(weatherDeck.pop()); // (dealt from the end)
  }
  const kind = weatherDeck.pop();
  weatherLast = kind.name;
  return kind;
}
// A front of a preset (by name, or the next dealt), its wind coming round from `fromDir`
function makeFront(name = null, fromDir = WIND.dir) {
  const W = WEATHER;
  const kind = W.presets.find((k) => k.name === name) ?? dealPreset();
  const total = weatherDraw(W.last);
  return { name: kind.name, rain: weatherDraw(kind.rain), wind: weatherDraw(kind.wind), snow: weatherDraw(kind.snow ?? [0, 0]), dir: (fromDir + (Math.random() * 2 - 1) * W.veer + 360) % 360, total, left: total };
}
let front = Object.assign(makeFront("clear"), { total: WEATHER.first, left: WEATHER.first }),
  nextUp = makeFront(null, front.dir);
function startFront(f) {
  front = f;
  nextUp = makeFront(null, front.dir);
  sounds.say?.(`weather: ${front.name} for ${Math.round(front.total)} s (rain ${front.rain.toFixed(2)}, wind ${front.wind.toFixed(2)}); then ${nextUp.name}`);
}
function stepWeather(delta) {
  if (!WEATHER.auto || !started) return;
  front.left -= delta;
  if (front.left <= 0) startFront(nextUp);
  const step = delta / WEATHER.turn;
  RAIN.level += THREE.MathUtils.clamp(front.rain - RAIN.level, -step, step);
  RAIN.wind += THREE.MathUtils.clamp(front.wind - RAIN.wind, -step, step);
  SNOW.level += THREE.MathUtils.clamp(front.snow - SNOW.level, -step, step);
  const d = ((front.dir - WIND.dir + 540) % 360) - 180; // the short way round
  WIND.dir = (WIND.dir + THREE.MathUtils.clamp(d, -WEATHER.veerRate * delta, WEATHER.veerRate * delta) + 360) % 360;
  // The sliders show it as it goes
  if (rainSlider) rainSlider.value = RAIN.level;
  if (windSlider) windSlider.value = RAIN.wind;
  if (snowSlider) snowSlider.value = SNOW.level;
  if (dirSlider) dirSlider.value = WIND.dir;
}
// The settings panel: shut until its button is pressed
const settingsToggle = document.getElementById("settings-toggle"),
  settingsPanel = document.getElementById("settings-panel"),
  autoBox = document.getElementById("weather-auto-on");
// ...and the credits, beside it: one open at a time
const creditsToggle = document.getElementById("credits-toggle"),
  creditsPanel = document.getElementById("credits-panel");
const pops = [
  [settingsToggle, settingsPanel],
  [creditsToggle, creditsPanel],
].filter(([b, p]) => b && p);
for (const [button, panel] of pops)
  button.addEventListener("click", () => {
    const open = panel.hidden;
    for (const [b, p] of pops) {
      p.hidden = !(open && p === panel);
      b.setAttribute("aria-expanded", String(!p.hidden));
    }
    paintSettings();
  });
const setAuto = (on) => {
  if (on && !WEATHER.auto) startFront(nextUp); // handed back: the next preset, now
  WEATHER.auto = on;
  if (autoBox) autoBox.checked = on;
};
// The presets' chips: one starts at once, for its own while, and the
// weather goes on from it on its own
const chips = document.getElementById("weather-chips");
if (chips)
  for (const k of WEATHER.presets) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = k.name;
    b.dataset.preset = k.name;
    b.addEventListener("click", () => {
      startFront(makeFront(k.name));
      setAuto(true);
      paintSettings();
    });
    chips.appendChild(b);
  }
if (autoBox) autoBox.addEventListener("change", () => setAuto(autoBox.checked));
// "Allow low battery mode": the resolution may step down a little when the
// frames slow (QUALITY); off, it is back at full and stays there
const batteryBox = document.getElementById("low-battery-on");
if (batteryBox) {
  batteryBox.checked = QUALITY.on;
  batteryBox.addEventListener("change", () => {
    QUALITY.on = batteryBox.checked;
    if (!QUALITY.on && quality.level) setQualityLevel(0);
  });
}
const graphicsBox = document.getElementById("graphics-quality");
const graphicsLevels = {
  low: { ratio: Math.min(0.75, devicePixelRatio), shadows: false, map: 512 },
  medium: { ratio: Math.min(1.25, devicePixelRatio), shadows: true, map: 1024 },
  high: { ratio: Math.min(1.75, devicePixelRatio), shadows: true, map: 2048 },
  ultra: { ratio: Math.min(2, devicePixelRatio), shadows: true, map: 4096 },
};
function setGraphics(level, save = true) {
  const preset = graphicsLevels[level] ?? graphicsLevels.low;
  renderer.setPixelRatio(preset.ratio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = preset.shadows;
  sun.shadow.mapSize.set(preset.map, preset.map);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  sun.shadow.needsUpdate = true;
  starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  if (graphicsBox) graphicsBox.value = level in graphicsLevels ? level : "low";
  if (save) try { localStorage.setItem("albatross-graphics", level); } catch {}
}
let graphicsChoice = "low";
try {
  const savedGraphics = localStorage.getItem("albatross-graphics");
  graphicsChoice = savedGraphics === "medium" ? "low" : savedGraphics || "low";
} catch {}
setGraphics(graphicsChoice, false);
if (graphicsBox) graphicsBox.addEventListener("change", () => {
  QUALITY.on = false;
  if (batteryBox) batteryBox.checked = false;
  setGraphics(graphicsBox.value);
});
// "Dev tools": the tabs to the labs, hidden unless it is on (style.css body.dev); remembered
const devBox = document.getElementById("dev-on");
if (devBox) {
  const setDev = (on) => document.body.classList.toggle("dev", on);
  try {
    devBox.checked = localStorage.getItem("dev-tools") === "1";
  } catch {}
  setDev(devBox.checked);
  devBox.addEventListener("change", () => {
    setDev(devBox.checked);
    try {
      localStorage.setItem("dev-tools", devBox.checked ? "1" : "0");
    } catch {}
  });
}
// The weather icons: line drawings in the panel's colour, 64 units square
const WX_SVG = (body) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const WX_CLOUD = '<path d="M20 40h26a9 9 0 0 0 0-18 13 13 0 0 0-25-3 10 10 0 0 0-1 21z"/>';
const WX_GUSTS = (y) => `<path d="M10 ${y}h30a6 6 0 1 0-6-6"/><path d="M10 ${y + 10}h38a6 6 0 1 1-6 6"/>`;
const WX_ICONS = {
  clear: WX_SVG('<circle cx="32" cy="32" r="11"/>' + Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<path d="M${32 + 17 * Math.cos(a)} ${32 + 17 * Math.sin(a)}L${32 + 23 * Math.cos(a)} ${32 + 23 * Math.sin(a)}"/>`; }).join("")),
  night: WX_SVG('<path d="M40 14a18 18 0 1 0 12 30 15 15 0 0 1-12-30z"/><path d="M49 13v6M46 16h6" stroke-width="2"/>'),
  breeze: WX_SVG(WX_GUSTS(26)),
  windy: WX_SVG(WX_GUSTS(20) + '<path d="M10 46h20"/>'),
  "wind storm": WX_SVG(WX_GUSTS(16) + '<path d="M10 42h28a5 5 0 1 1-5 5"/><path d="M14 52h12"/>'),
  "light rain": WX_SVG(WX_CLOUD + '<path d="M26 47l-2 5M38 47l-2 5"/>'),
  "heavy rain": WX_SVG(WX_CLOUD + '<path d="M22 46l-3 7M30 46l-3 7M38 46l-3 7M46 46l-3 7"/>'),
  storm: WX_SVG(WX_CLOUD + '<path d="M34 42l-6 9h7l-5 9" stroke-width="2.8"/><path d="M22 47l-2 5M44 47l-2 5"/>'),
  none: WX_SVG('<circle cx="32" cy="32" r="20"/><path d="M18 46L46 18"/>'), // nothing next: a circle struck through
  snow: WX_SVG(WX_CLOUD + '<path d="M24 46v8M20 50h8M40 46v8M36 50h8"/>'),
  "heavy snow": WX_SVG(WX_CLOUD + '<path d="M20 45v6M17 48h6M32 45v6M29 48h6M44 45v6M41 48h6M26 53v6M23 56h6M38 53v6M35 56h6"/>'), // five flakes, falling straight
  blizzard: WX_SVG(WX_CLOUD + '<path d="M22 46v6M19 49h6M34 47v6M31 50h6M46 46v6M43 49h6"/><path d="M8 58h22M36 58h18" stroke-width="2"/>'),
  hurricane: WX_SVG('<circle cx="32" cy="32" r="5"/><path d="M32 13c-12 0-19 9-19 19 0 6 3 10 7 13"/><path d="M32 51c12 0 19-9 19-19 0-6-3-10-7-13"/><path d="M24 20c2-3 5-5 8-6M40 44c-2 3-5 5-8 6"/>'),
};
// The panel's bars and what each is set to, in words: done as they move,
// and each frame while the panel is open (the day and the weather move them)
const words = (v, list) => list.find(([at]) => v < at)?.[1] ?? list[list.length - 1][1];
const settingOut = (id) => document.getElementById(id);
// Which icon the weather shows: the preset's, or (taken over) whichever
// preset the sliders are nearest; clear or a breeze at night, the moon
function weatherIcon() {
  const shown = WEATHER.auto
    ? front.name
    : WEATHER.presets.reduce((best, k) => {
        const sn = k.snow ?? [0, 0];
        const d = Math.hypot(RAIN.level - (k.rain[0] + k.rain[1]) / 2, RAIN.wind - (k.wind[0] + k.wind[1]) / 2, SNOW.level - (sn[0] + sn[1]) / 2);
        return d < best.d ? { d, name: k.name } : best;
      }, { d: Infinity, name: "clear" }).name;
  return daylight < 0.35 && (shown === "clear" || shown === "breeze") ? "night" : shown;
}
const putIcon = (el, icon) => {
  if (el && el.dataset.icon !== icon) {
    el.dataset.icon = icon;
    el.innerHTML = WX_ICONS[icon] ?? WX_ICONS.clear;
  }
};
const miniIcon = document.getElementById("wx-mini"),
  miniName = document.getElementById("wx-mini-name"),
  miniTime = document.getElementById("wx-mini-time");
function paintSettings() {
  const icon = weatherIcon();
  putIcon(miniIcon, icon); // the button's, always: its icon, the weather's name, and how long is left of it
  miniIcon?.classList.toggle("vague", !WEATHER.auto); // custom weather: only a guess at what it is, sketched
  const clock = (sec) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, "0")}`;
  const setText = (el, text) => {
    if (el && el.textContent !== text) el.textContent = text;
  };
  setText(miniName, WEATHER.auto ? front.name : "Custom");
  setText(miniTime, WEATHER.auto ? `${clock(front.left)} left` : "");
  if (!settingsPanel || settingsPanel.hidden) return;
  for (const bar of settingsPanel.querySelectorAll(".bar")) bar.parentElement.style.setProperty("--p", `${((bar.value - bar.min) / (bar.max - bar.min)) * 100}%`); // (on its box: the fill is drawn there)
  const set = (id, text) => {
    const el = settingOut(id);
    if (el && el.textContent !== text) el.textContent = text;
  };
  set("daylight-out", words(daylight, [[0.3, "night"], [0.55, "twilight"], [2, "day"]]));
  set("rain-out", words(RAIN.level, [[0.02, "dry"], [0.4, "drizzle"], [0.7, "rain"], [2, "downpour"]]));
  set("snow-out", words(SNOW.level, [[0.02, "none"], [0.35, "flurries"], [0.75, "snow"], [2, "heavy"]]));
  set("wind-out", words(RAIN.wind, [[0.08, "still"], [0.35, "breeze"], [0.7, "wind"], [2, "gale"]]));
  set("dir-num", `${Math.round(WIND.dir)}°`);
  // The weather now, and what comes next: when, and for how long
  putIcon(settingOut("wx-icon"), icon);
  settingOut("wx-icon")?.classList.toggle("vague", !WEATHER.auto);
  // The box's right side: what comes next, and how soon (dimmed with the auto off)
  settingOut("wx-next-icon")?.parentElement.classList.toggle("off", !WEATHER.auto);
  if (WEATHER.auto) {
    set("weather-out", front.name);
    set("wx-left", `${clock(front.left)} left`);
    set("wx-next-label", "Next");
    putIcon(settingOut("wx-next-icon"), nextUp.name);
    set("wx-next-name", nextUp.name);
    set("wx-next-when", `in ${clock(front.left)}`);
  } else {
    set("weather-out", "Custom");
    set("wx-left", "Indefinitely");
    putIcon(settingOut("wx-next-icon"), "none"); // nothing comes next while it is held
    set("wx-next-label", "Next (Paused)"); // the forecast has stopped (its label says so)...
    set("wx-next-name", "");
    set("wx-next-when", "Tap preset to resume"); // ...and how to start it again
  }
  if (chips) for (const b of chips.children) b.classList.toggle("on", WEATHER.auto && b.dataset.preset === front.name);
}
if (settingsPanel) settingsPanel.addEventListener("input", paintSettings);
// The snowflakes: small motes in a box round the bird, as many as it is
// snowing, each falling at its own pace, drifting downwind and swaying;
// starting again at the top, or round the box's far side, as the rain does
const snowGeo = new THREE.IcosahedronGeometry(1, 0);
const snowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
const snowFlakes = new THREE.InstancedMesh(snowGeo, snowMat, SNOW.flakes);
snowFlakes.frustumCulled = false;
snowFlakes.visible = false;
snowFlakes.count = 0;
scene.add(snowFlakes);
const flakePos = new Float32Array(SNOW.flakes * 3),
  flakeFall = new Float32Array(SNOW.flakes),
  flakePhase = new Float32Array(SNOW.flakes);
let flakesSeeded = false,
  snowT = 0;
function stepSnow(delta) {
  const S = SNOW,
    was = S.amount;
  snowT += delta;
  S.amount += THREE.MathUtils.clamp(S.level - S.amount, -delta / S.fade, delta / S.fade);
  // What settles: building while it snows (the harder, the faster), melting after
  S.cover = THREE.MathUtils.clamp(S.cover + (S.level > 0.05 && S.amount > 0.05 ? S.amount / S.build : -1 / S.melt) * delta, 0, 1); // (melting as soon as the snow is let go, not once the last flakes are down)
  snowUniforms.uSnow.value = THREE.MathUtils.smoothstep(S.cover, 0, 1);
  if (S.amount !== was && (!DAY.on || !started)) setDaylight(daylight); // the sky, held still, greys with it
  const count = Math.round(S.flakes * S.amount);
  snowFlakes.visible = count > 0;
  if (!count) return;
  snowFlakes.count = count;
  snowMat.opacity = S.opacity * Math.min(1, S.amount * 4);
  snowMat.color.copy(scene.fog.color).lerp(MIST_WHITE, 0.75);
  const c = camera.position,
    [across, tall] = S.box,
    half = across / 2,
    top = c.y + tall / 2,
    bottom = c.y - tall / 2;
  const out = snowFlakes.instanceMatrix.array;
  const blow = S.drift * windNow * delta;
  for (let i = 0; i < S.flakes; i++) {
    const j = i * 3;
    let x = flakePos[j],
      y = flakePos[j + 1],
      z = flakePos[j + 2];
    if (!flakesSeeded) {
      x = c.x + (Math.random() * 2 - 1) * half;
      y = bottom + Math.random() * tall;
      z = c.z + (Math.random() * 2 - 1) * half;
      flakeFall[i] = S.speed[0] + Math.random() * (S.speed[1] - S.speed[0]);
      flakePhase[i] = Math.random() * Math.PI * 2;
      const r = S.size[0] + Math.random() * (S.size[1] - S.size[0]);
      out[i * 16] = out[i * 16 + 5] = out[i * 16 + 10] = r; // its size, kept in its matrix
    } else {
      if (i >= count) continue;
      const sway = Math.sin(snowT * 1.3 + flakePhase[i]) * S.waver * delta;
      y -= flakeFall[i] * delta;
      x += windDir.x * blow + sway;
      z += windDir.y * blow + Math.cos(snowT * 1.1 + flakePhase[i]) * S.waver * delta;
      if (y < bottom) {
        y = top;
        x = c.x + (Math.random() * 2 - 1) * half;
        z = c.z + (Math.random() * 2 - 1) * half;
      }
      if (x < c.x - half) x += across;
      else if (x > c.x + half) x -= across;
      if (z < c.z - half) z += across;
      else if (z > c.z + half) z -= across;
      if (y > top) y -= tall;
    }
    flakePos[j] = x;
    flakePos[j + 1] = y;
    flakePos[j + 2] = z;
    const k = i * 16 + 12;
    out[k] = x;
    out[k + 1] = y;
    out[k + 2] = z;
  }
  flakesSeeded = true;
  snowFlakes.instanceMatrix.needsUpdate = true;
}
// The sliders
const rainSlider = document.getElementById("rain-level"),
  windSlider = document.getElementById("wind-level"),
  snowSlider = document.getElementById("snow-level");
if (snowSlider) {
  snowSlider.value = SNOW.level;
  snowSlider.addEventListener("input", () => {
    SNOW.level = +snowSlider.value;
    setAuto(false);
  });
}
if (rainSlider) {
  rainSlider.value = RAIN.level;
  rainSlider.addEventListener("input", () => {
    RAIN.level = +rainSlider.value;
    setAuto(false); // taken over
  });
}
if (windSlider) {
  windSlider.value = RAIN.wind;
  windSlider.addEventListener("input", () => {
    RAIN.wind = +windSlider.value;
    setAuto(false);
  });
}
const dirSlider = document.getElementById("wind-dir"),
  dirArrow = document.getElementById("wind-arrow");
if (dirSlider) {
  dirSlider.value = WIND.dir;
  dirSlider.addEventListener("input", () => {
    WIND.dir = +dirSlider.value;
    setAuto(false);
  });
}
// Each frame: the wind's strength (eased to the slider, gusting) and way,
// handed to the trees' shader; the arrow by the slider shows which way it
// blows as seen from the camera (up: away, ahead of the view)
let windT = 0;
function stepWind(delta) {
  windT += delta;
  // How stormy: the wind or the rain, whichever is wilder
  const storm = THREE.MathUtils.smoothstep(Math.max(RAIN.wind, RAIN.amount), WIND.storm[0], WIND.storm[1]);
  const r = WIND.rate * (0.4 + 0.6 * storm);
  const swirl = storm * WIND.swirl * (0.55 * Math.sin(windT * r + 0.3) + 0.3 * Math.sin(windT * r * 2.7 + 2.1) + 0.15 * Math.sin(windT * r * 6.1 + 4.4));
  const a = THREE.MathUtils.degToRad(WIND.dir) + swirl;
  windDir.set(Math.sin(a), Math.cos(a));
  const gust = 1 + WIND.gust[0] * (1 + WIND.gusty * storm) * (0.6 * Math.sin(windT * WIND.gust[1] * (1 + storm)) + 0.4 * Math.sin(windT * WIND.gust[1] * 2.3 * (1 + storm) + 1.7));
  windNow += (RAIN.wind * gust - windNow) * Math.min(1, delta / WIND.ease);
  windUniforms.uWindDir.value.copy(windDir);
  windUniforms.uWind.value = windNow;
  windUniforms.uWindTime.value = windT;
  sounds.wind(windNow); // its sound, gusts and all (sounds.js SOUND.wind)
  if (dirArrow) dirArrow.style.transform = `rotate(${THREE.MathUtils.radToDeg(heading + lookYaw - a)}deg)`; // a bearing to the view's left turns the arrow left
}

// Ground height: one function everything reads from. The land, plus the
// mound each statue has pushed up around its base (moundAt, further down
// with the statues).
// The land is a sea with islands: each coarse cell that holds a formation
// (groupAt) is an island, a flat disc of grass at y = 0 just big enough for
// its heads' mounds, falling to the seabed
// over a short shore. Everywhere else is seabed under the water. The grass
// itself is flat: the only relief on it is the mound each statue pushes up
// (MOUND in statues.js, tuned in the pillars lab).
// An island is not one disc but a handful of LOBES run together the way
// the dollies' pools are: the core disc that holds the heads, and a few
// more discs of their own sizes thrown out from it, the lot blended by a
// smooth minimum `blend` wide (the exponential one, since it treats any
// number of lobes alike), so two lobes that come near bulge out to meet
// and neck together rather than crossing in a hard corner, and the
// outline is a lumpy, irregular shape standing in the water. Neighbouring
// islands blend the same way. The land, the trees, the tufts and the foam
// all read that one field (islandField), so they agree on where the
// shore is.
const ISLAND = {
  margin: 10, // world units of grass past the outermost mound
  min: 30, // world units: no island's core smaller than this
  shore: 14, // world units the land takes to fall from the grass to the seabed
  depth: 6, // world units the seabed lies under the grass
  blend: 10, // world units wide the lobes melt into each other
  lobes: [5, 9], // lobes thrown out around the core, drawn
  lobeOut: [0.5, 1.1], // how far out a lobe's centre sits, as a fraction of the core's radius
  lobeR: [0.2, 0.55], // a lobe's radius, as a fraction of the core's
};
const WATER_Y = -1.4; // where the sea's surface lies: a little under the grass, so the shore shows a strip of sand
// The islands' joined signed distance at (x, z): negative on the grass,
// 0 at its edge, growing out over the water. The lobes of the 3×3 cells
// about the point, the nearest pulled out first so the sum never underflows.
function islandField(x, z) {
  const cx = Math.floor(x / GROUP.cell),
    cz = Math.floor(z / GROUP.cell);
  let m = Infinity;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const isl = groupAt(cx + di, cz + dj).island;
      if (!isl) continue;
      for (const l of isl.lobes) m = Math.min(m, Math.hypot(l.x - x, l.z - z) - l.r);
    }
  if (m === Infinity) return 1e6;
  const k = ISLAND.blend;
  let sum = 0;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const isl = groupAt(cx + di, cz + dj).island;
      if (!isl) continue;
      for (const l of isl.lobes) sum += Math.exp(-(Math.hypot(l.x - x, l.z - z) - l.r - m) / k);
    }
  return m - k * Math.log(sum);
}
// The beach (beach.js, tuned in the scene lab): the islands' lobes drawn
// as polygons and melted together give the beach line, the grass inside
// it and the sand out; the grass stands BEACH.lift above the sand, a
// rounded patty, and the sand falls to the seabed past the island's round
// edge. The lobes that bear on a point are
// those of the 3×3 cells about it, as islandField has them (in one reused
// array: thousands of points ask)
const nearLobes = [];
function lobesNear(x, z) {
  nearLobes.length = 0;
  const cx = Math.floor(x / GROUP.cell),
    cz = Math.floor(z / GROUP.cell);
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const isl = groupAt(cx + di, cz + dj).island;
      if (isl) for (const l of isl.lobes) nearLobes.push(l);
    }
  return nearLobes;
}
const beach = makeBeach({ lobesNear, islandField, blend: ISLAND.blend, shore: ISLAND.shore, depth: ISLAND.depth });
function landHeight(x, z, g) {
  let height = beach.landHeight(x, z, g);
  const cx = Math.floor(x / GROUP.cell), cz = Math.floor(z / GROUP.cell);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const peaks = groupAt(cx + di, cz + dj).island?.peaks;
    if (!peaks) continue;
    for (const peak of peaks) {
      const d = Math.hypot(x - peak.x, z - peak.z) / peak.radius;
      if (d >= 1) continue;
      const ridge = 1 - THREE.MathUtils.smoothstep(d, 0, 1);
      height = Math.max(height, peak.base + peak.height * ridge);
    }
  }
  return height;
}
// The terrain sheet ends SIZE / 2 out and the sea runs on past it, so
// rather than an island cutting off at the sheet's edge, the land sinks to
// the seabed over an outer rim: islands rise out of the sea as the bird
// comes on. The sinking is done in the vertex shaders (rimSink, with the
// terrain), about the bird's own position every frame, so it never steps
// as the sheet does; the sheet's heights stay the land's truth. Statues are
// kept inside the rim (RANGE), so they always stand on risen ground; the
// trees sink with the land they stand on.
const RIM = [1.03 * SIGHT, 1.55 * SIGHT]; // world units from the bird: where the sinking starts (past RANGE, so statues stand on risen ground) and where it is complete (inside the sheet's half-size, less the step it can lag by); the wider, the slower an island rises as the bird comes on
function getHeight(x, z) {
  return landHeight(x, z) + moundAt(x, z);
}
// Infinite terrain: the mesh follows the player, snapped to its own grid,
// and resamples heights and colors in world space so the ground stays put
const SIZE = 4 * Math.ceil((RIM[1] + 10) / 2), // across (a whole number of cells, an even count): room for the rim (RIM) to be wide, so islands rise slowly, even when the mesh lags the bird by a STEP
  SEGMENTS = SIZE / 2, // 2 units a cell
  CELL = SIZE / SEGMENTS;
const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
terrainGeo.rotateX(-Math.PI / 2);
// The ground as the pillars lab draws it: one smooth green, going to bare
// earth where the mounds rise; no noise, no flat shading
terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(terrainGeo.attributes.position.count * 3), 3));
terrainGeo.setAttribute("aLine", new THREE.Float32BufferAttribute(new Float32Array(terrainGeo.attributes.position.count), 1)); // the beach line's field at each vertex, for the shader (stepTerrain)
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
// The rim sink (RIM): a vertex a rim distance from the bird is let down
// toward the seabed. On the sheet it lowers the vertex itself; on an
// instanced thing (the trees) it lowers the whole instance by what the
// land under its foot sinks, in its own scale
const rimUniforms = { uRimCenter: { value: new THREE.Vector2() }, uRim: { value: new THREE.Vector2(RIM[0], RIM[1]) }, uDepth: { value: ISLAND.depth } };
function rimSink(material, instanced) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rimUniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uRimCenter, uRim;\nuniform float uDepth;")
      .replace(
        "#include <begin_vertex>",
        instanced
          ? `#include <begin_vertex>
  {
    vec4 foot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float d = max(abs(foot.x - uRimCenter.x), abs(foot.z - uRimCenter.y));
    float k = 1.0 - smoothstep(uRim.x, uRim.y, d);
    transformed.y -= (foot.y + uDepth) * (1.0 - k) / length(instanceMatrix[0].xyz);
  }`
          : `#include <begin_vertex>
  {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float d = max(abs(w.x - uRimCenter.x), abs(w.z - uRimCenter.y));
    float k = 1.0 - smoothstep(uRim.x, uRim.y, d);
    transformed.y = -uDepth + (transformed.y + uDepth) * k;
  }`,
      );
  };
}
rimSink(terrain.material, false);
const GRASS = new THREE.Color(LAB_PALETTE.ground),
  EARTH = new THREE.Color(LAB_PALETTE.earth),
  SAND = new THREE.Color(LAB_PALETTE.sand),
  SEABED = new THREE.Color(LAB_PALETTE.seabed),
  PAINT = new THREE.Color(LAB_PALETTE.splotch),
  PAINT2 = new THREE.Color(LAB_PALETTE.splotch2),
  groundColor = new THREE.Color();
// Moss-dark ground: the earth round the statues' feet, and the ground about
// the obelisks, gone to a deep, damp green (the grass's own, darker and a
// touch bluer), as old stone sits in moss
const MOSS_GROUND = {
  color: GRASS.clone().offsetHSL(0.03, 0.06, -0.14),
  statue: 0.9, // how far the mounds go to it (the rest of the way, the earth's tint)
  stone: 0.8, // ...and the ground about an obelisk, at its foot
  reach: 4, // world units past an obelisk's side it reaches, fading, at its scale
  cell: 3, // world units a cell of the lookup grid it's read from
};
// The beach in the ground's shader (beach.js): the sand past the beach
// line with its pebbles, the paint pentagons on the grass
const beachUniforms = makeBeachUniforms(WATER_Y);
beachUniforms.uSand.value.copy(SAND);
beachUniforms.uSeabed.value.copy(SEABED);
beachUniforms.uSplotch.value.copy(PAINT);
beachUniforms.uSplotch2.value.copy(PAINT2);
beachShader(terrain.material, beachUniforms);
terrain.receiveShadow = true;
scene.add(terrain);
// Under and beyond the detailed land, a flat skirt of seabed out to the
// horizon, a hair below the sheet's seabed so it never fights it; it rides
// with the bird
const skirt = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: SEABED, roughness: 1 }));
skirt.position.y = -ISLAND.depth - 0.3;
skirt.receiveShadow = true;
scene.add(skirt);
// The sea: one sheet at WATER_Y out to the horizon, riding with the bird.
// See-through, so the sand shows in the shallows off every shore, and glossy
// enough to catch the moon or sun in a streak.
const WATER = { color: LAB_PALETTE.water, roughness: 1, metalness: 0, opacity: 0.7 }; // matte: no shine, no mirror of the sky
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), // well past the camera's far plane, so its edge never shows against the clip
  new THREE.MeshStandardMaterial({ color: WATER.color, roughness: WATER.roughness, metalness: WATER.metalness, transparent: true, opacity: WATER.opacity, depthWrite: false }),
);
water.position.y = WATER_Y;
water.receiveShadow = true;
scene.add(water);
// Foam on the sea, the way the dollies' ponds wear it: a sheet just over
// the water with patches of white cut out of it by a shader. The patches
// are value noise thresholded with a hard edge (clay, not mist), the
// threshold lowered toward the shore so the lace thickens into a rind
// there, with a solid line right along the waterline, and the whole thing
// drifts slowly. Unlit: foam is white from any angle, so it reads over the
// mirror; it takes the hour's colour (HOURS.foam) and the fog. The shore
// is each island's waterline, handed to the shader as a list of discs
// (updateFoam), so how far out from the nearest shore a point lies is
// worked out per pixel. Where the island has sunk at the rim, so has its
// foam.
const FOAM = {
  headRing: 1.3, // a head standing in the water gathers foam as a shore does, from this many of its neck's radii out (updateFoam)
  bank: 9, // world units in from the shore the lace gathers over
  cover: 0.12, // how much of the open water it laces, 0 none, 1 all of it
  scale: 7, // a patch's size, world units
  drift: 0.5, // how fast the lace wanders, world units a second
  line: 1.6, // how wide the solid line along the waterline is, world units
  edge: 1, // how solid that line is, 0 none
  alpha: 0.85, // how solid the foam is, 1 opaque
  lift: 0.06, // how far the sheet floats over the water
  lobes: 160, // the most island lobes the shader is told about at once
};
// The waterline lies where the shore has fallen WATER_Y under the grass:
// that far along the shore's smoothstep, past the grass's edge
const SHORE_OUT = (() => {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    if (ISLAND.depth * THREE.MathUtils.smoothstep(t, 0, 1) < -WATER_Y) lo = t;
    else hi = t;
  }
  return ISLAND.shore * lo;
})();
const foamMat = new THREE.ShaderMaterial({
  uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), rimUniforms, {
    uLobes: { value: Array.from({ length: FOAM.lobes }, () => new THREE.Vector3()) },
    uCount: { value: 0 },
    uBlend: { value: ISLAND.blend },
    uShoreOut: { value: SHORE_OUT },
    uColor: foamColor,
    uAlpha: { value: FOAM.alpha },
    uBank: { value: FOAM.bank },
    uCover: { value: FOAM.cover },
    uScale: { value: FOAM.scale },
    uLine: { value: FOAM.line },
    uEdge: { value: FOAM.edge },
    uDrift: { value: new THREE.Vector2() },
  }),
  vertexShader: /* glsl */ `
    varying vec2 vWorld;
    #include <fog_pars_vertex>
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xz;
      vec4 mvPosition = viewMatrix * w;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    #define MAXI ${FOAM.lobes}
    uniform vec3 uLobes[MAXI]; // an island lobe: x, z, radius (of the grass's edge)
    uniform int uCount;
    uniform float uBlend, uShoreOut;
    uniform vec3 uColor;
    uniform float uAlpha, uBank, uCover, uScale, uLine, uEdge;
    uniform vec2 uDrift;
    uniform vec2 uRimCenter, uRim;
    varying vec2 vWorld;
    #include <fog_pars_fragment>
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    // Smooth value noise, 0..1
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    // A hard step, one pixel soft so it does not shimmer
    float cut(float at, float x) {
      float w = fwidth(x);
      return smoothstep(at - w, at + w, x);
    }
    void main() {
      // How far out from the nearest shore this point lies: the lobes'
      // smooth-minimum field, as islandField works it out, less the shore's
      // width out to the waterline
      float m = 1e9;
      for (int i = 0; i < MAXI; i++) {
        if (i >= uCount) break;
        vec3 L = uLobes[i];
        m = min(m, length(vWorld - L.xy) - L.z);
      }
      float sum = 0.0;
      for (int i = 0; i < MAXI; i++) {
        if (i >= uCount) break;
        vec3 L = uLobes[i];
        sum += exp(-(length(vWorld - L.xy) - L.z - m) / uBlend);
      }
      float away = m - uBlend * log(sum) - uShoreOut;
      if (away < -1.0) discard; // under the island
      // Two octaves of lace, wandering; the second crawls the other way so
      // the patches change shape as they go rather than sliding whole
      vec2 p = vWorld / uScale;
      float n = 0.65 * noise(p + uDrift) + 0.35 * noise(p * 2.3 - uDrift * 0.7 + 17.0);
      // Thick at the shore, sparse away in the open
      float bank = 1.0 - smoothstep(0.0, uBank, away);
      float open = 1.0 - 0.55 * uCover;
      float lace = cut(mix(open, 0.42, bank), n);
      // The line of foam right along the waterline itself, its width wavering
      float line = uEdge * (1.0 - cut(uLine * (0.8 + 0.4 * noise(p * 3.0 + uDrift)), away));
      float foam = max(lace, line);
      // Sunk with the island at the rim
      float d = max(abs(vWorld.x - uRimCenter.x), abs(vWorld.y - uRimCenter.y));
      foam *= 1.0 - smoothstep(uRim.x, uRim.y, d);
      if (foam <= 0.0) discard;
      gl_FragColor = vec4(uColor, uAlpha * foam);
      #include <fog_fragment>
      #include <colorspace_fragment>
    }`,
  transparent: true,
  depthWrite: false,
  fog: true,
});
const foam = new THREE.Mesh(new THREE.PlaneGeometry(SIZE + 100, SIZE + 100).rotateX(-Math.PI / 2), foamMat);
foam.position.y = WATER_Y + FOAM.lift;
foam.renderOrder = 1; // over the water
foam.frustumCulled = false;

// Ice. The snow freezes the sea: the longer and harder it snows, the
// paler, clearer and glassier the water turns, and floes come out over it
// off the shores, from small chips to great slabs, each growing from
// nothing as it freezes. Once the snow stops it all thaws and the floes
// shrink away to nothing. The icy water mirrors the sky at a grazing look
// (a fresnel toward the fog's colour, which is the sky's). ICE.level is
// how frozen it is. (A sheet of shore ice over the foam was tried and
// dropped: the foam is the shore's edge as it is)
const ICE = {
  level: 0, // 0 open sea, 1 frozen as far as it goes
  from: 0.25, // how hard it must be snowing (SNOW.amount) before the sea starts to freeze
  freeze: 40, // seconds of full snow to freeze all the way (lighter snow, longer)
  thaw: 30, // seconds to thaw all the way once the snow lets up
  water: 0x7fa3b8, // the sea, icy: paler...
  waterAlpha: 0.5, // ...clearer...
  waterRough: 0.3, // ...and glassy: it takes the sun's and the moon's glints
  sky: 0.45, // how much of the sky the icy sea mirrors, looked at edge-on
  floe: 0xf1f6f9, // the floes
  band: 60, // world units out from the waterline the floes are scattered over
  span: 160, // world units round the bird they're kept
  // Two sizes of floe, each on its own grid (a floe at most a square, so
  // none overlap): great slabs far apart, and chips between them (a chip
  // never forms on a slab). Within each, small ones are the most common
  big: { cell: 34, size: [5, 14], chance: 0.55 }, // world units a square, a floe's radius (full grown), the share of squares with one
  small: { cell: 7, size: [0.4, 2.6], chance: 0.8 },
  thick: [0.3, 0.07], // world units thick, full grown: a base, plus this much per unit of radius (a third of it over the water)
  grow: 0.2, // of ICE.level: how long a floe takes to come from nothing to full
  most: 900, // floes drawn at once, at most
};
const iceUniforms = { uIce: { value: 0 }, uIceSky: { value: ICE.sky } };
// The sea, icing over: the mirror, as strong as it is frozen (its colour,
// clearness and gloss are eased in stepIce)
const waterBase = water.material.color.clone(),
  iceWater = new THREE.Color(ICE.water);
water.material.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, iceUniforms);
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uIce, uIceSky;").replace(
    "#include <opaque_fragment>",
    /* glsl */ `
    #ifdef USE_FOG
      float iceFres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
      outgoingLight = mix(outgoingLight, fogColor, iceFres * uIceSky * uIce);
    #endif
    #include <opaque_fragment>`,
  );
};
// The floes: flat slabs of a few ragged outlines, turned and stretched
// each its own way, a third over the water. Each has its own point in the
// freezing (ICE.level) at which it starts to grow, later the further out
// it lies, so the ice spreads out from the shores and draws back to them
const floeGeos = [0, 1, 2].map((v) => {
  const shape = new THREE.Shape(),
    n = 6 + v * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      r = 0.65 + 0.35 * hash(v, i, 331);
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.67, 0); // a unit thick, a third of it up
});
const floeMat = new THREE.MeshStandardMaterial({ color: ICE.floe, roughness: 0.3, metalness: 0, flatShading: true, transparent: true, opacity: 0.93 });
const floeFields = floeGeos.map((g) => {
  const f = new THREE.InstancedMesh(g, floeMat, ICE.most);
  f.count = 0;
  f.frustumCulled = false;
  f.receiveShadow = true;
  f.castShadow = true;
  scene.add(f);
  return f;
});
let floes = [], // the floes that may form about the bird now (placeFloes)
  floeCX = null,
  floeCZ = null,
  floeT = 0;
const floeDummy = new THREE.Object3D();
// Where floes may form: a spot in each square of the two grids about the
// bird, kept if the whole floe lies on the water within the band off a
// shore, clear of anything standing in the sea (and a chip clear of the
// slabs). Every spot is the world's own (hashed from its square), so the
// same floes form wherever the bird comes from. Redone as it crosses a few
// small squares
function placeFloes() {
  const I = ICE,
    cx = Math.floor(player.position.x / (I.small.cell * 4)),
    cz = Math.floor(player.position.z / (I.small.cell * 4));
  if (cx === floeCX && cz === floeCZ) return;
  floeCX = cx;
  floeCZ = cz;
  floes = [];
  // Heads and stones standing out of the water: no floe forms on one
  const standing = [];
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const g = groupAt(Math.floor(player.position.x / GROUP.cell) + di, Math.floor(player.position.z / GROUP.cell) + dj);
      if (g.sea) for (const m of g) standing.push({ x: m.x, z: m.z, r: 1.5 * RING_R * m.s });
    }
  for (const st of liveStones) standing.push(st);
  const slabs = [];
  const deal = (G, seed, keep) => {
    const n = Math.ceil(I.span / G.cell),
      gx = Math.floor(player.position.x / G.cell),
      gz = Math.floor(player.position.z / G.cell);
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        const ix = gx + i,
          iz = gz + j;
        if (hash(ix, iz, seed) > G.chance) continue;
        const r = THREE.MathUtils.lerp(G.size[0], G.size[1], hash(ix, iz, seed + 3) ** 2) * 1.25; // the small ones the most common (as stretched at most: sx, sz)
        // Inside its square, so neighbours never meet
        const room = Math.max(0, G.cell / 2 - r);
        const x = (ix + 0.5) * G.cell + (hash(ix, iz, seed + 1) * 2 - 1) * room,
          z = (iz + 0.5) * G.cell + (hash(ix, iz, seed + 2) * 2 - 1) * room;
        if (Math.hypot(x - player.position.x, z - player.position.z) > I.span) continue;
        const away = islandField(x, z) - SHORE_OUT;
        if (away < r || away > I.band) continue; // wholly on the water, within the band
        if (standing.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r)) continue;
        if (!keep(x, z, r)) continue;
        floes.push({
          x, z, away, r: r / 1.25,
          at: Math.min(1 - I.grow, 0.05 + 0.6 * (away / I.band) + 0.25 * hash(ix, iz, seed + 4)), // when it starts to grow
          yaw: hash(ix, iz, seed + 5) * Math.PI * 2,
          sx: 0.75 + 0.5 * hash(ix, iz, seed + 6),
          sz: 0.75 + 0.5 * hash(ix, iz, seed + 7),
          v: Math.floor(hash(ix, iz, seed + 8) * floeFields.length),
          phase: hash(ix, iz, seed + 9) * Math.PI * 2,
        });
      }
  };
  deal(I.big, 341, (x, z, r) => (slabs.push({ x, z, r }), true));
  deal(I.small, 361, (x, z, r) => slabs.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r));
}
function stepIce(delta) {
  const I = ICE;
  const snowing = SNOW.level > 0.05 && SNOW.amount > I.from;
  I.level = THREE.MathUtils.clamp(I.level + (snowing ? SNOW.amount / I.freeze : -1 / I.thaw) * delta, 0, 1);
  const k = THREE.MathUtils.smoothstep(I.level, 0, 1);
  iceUniforms.uIce.value = k;
  water.material.color.copy(waterBase).lerp(iceWater, k);
  water.material.opacity = THREE.MathUtils.lerp(WATER.opacity, I.waterAlpha, k);
  water.material.roughness = THREE.MathUtils.lerp(WATER.roughness, I.waterRough, k);
  // The floes: each grown as far as the freezing has come past its own
  // point; they rock and wander a little on the swell (the big ones less)
  for (const f of floeFields) f.count = 0;
  if (k <= 0.001) return;
  placeFloes();
  floeT += delta;
  for (const fl of floes) {
    const grow = THREE.MathUtils.smoothstep(k, fl.at, fl.at + I.grow);
    if (grow < 0.02) continue;
    const f = floeFields[fl.v];
    if (f.count >= I.most) continue;
    const s = fl.r * grow,
      t = floeT * 0.4 + fl.phase,
      calm = 1 / (1 + fl.r * 0.3);
    floeDummy.position.set(fl.x + Math.sin(t * 0.3) * 0.6 * calm, WATER_Y + Math.sin(t) * 0.04 * calm, fl.z + Math.cos(t * 0.23) * 0.6 * calm);
    floeDummy.rotation.set(Math.sin(t * 1.1) * 0.02 * calm, fl.yaw + Math.sin(t * 0.15) * 0.15 * calm, Math.cos(t * 0.9) * 0.02 * calm);
    floeDummy.scale.set(s * fl.sx, (I.thick[0] + I.thick[1] * fl.r) * (0.4 + 0.6 * grow), s * fl.sz);
    floeDummy.updateMatrix();
    f.setMatrixAt(f.count++, floeDummy.matrix);
  }
  for (const f of floeFields) f.instanceMatrix.needsUpdate = true;
}
scene.add(foam);

// The wake: while the bird skims the sea it leaves two thin lines of foam
// behind it, one either side, drifting apart as they age (a V, as a boat's)
// and fading. The bird's track is kept as a ring of WAKE.max points; each
// line is drawn as a strip of flat segments between neighbouring points
const WAKE = {
  touch: 0.3, // world units above its lowest skim the bird still counts as touching the water
  every: 0.035, // seconds between points along the track
  life: 0.7, // seconds a line lasts
  width: 0.2, // world units across the strip each line is drawn in (the line itself is a pixel wide)
  apart: [0.35, 1.6], // world units each line sits from the track as it's laid, and as it fades
  behind: 0.8, // world units behind the bird the lines start
  hold: 0.15, // fraction of its life a line stays fully opaque before it starts to fade
};
WAKE.max = Math.ceil(WAKE.life / WAKE.every) + 2;
const wakeAge = new THREE.InstancedBufferAttribute(new Float32Array(WAKE.max * 2).fill(1), 1); // per segment: two lines, one segment per point
const wakeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // x along the segment, z across
wakeGeo.setAttribute("aAge", wakeAge);
const wake = new THREE.InstancedMesh(
  wakeGeo,
  new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uColor: foamColor, uHold: { value: WAKE.hold } }),
    vertexShader: /* glsl */ `
      attribute float aAge;
      varying float vAge;
      varying vec2 vLocal; // world units from the segment's centre: x along it, y across
      varying vec2 vHalf; // the segment's half-length and half-width
      #include <fog_pars_vertex>
      void main() {
        vAge = aAge;
        vHalf = 0.5 * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
        vLocal = 2.0 * position.xz * vHalf;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uHold;
      varying float vAge;
      varying vec2 vLocal;
      varying vec2 vHalf;
      #include <fog_pars_fragment>
      void main() {
        // How far this pixel is from the track between the segment's two
        // points (the strip runs half a width past each, so the ends round)
        float r = vHalf.y;
        float d = length(vec2(max(abs(vLocal.x) - (vHalf.x - r), 0.0), vLocal.y));
        // A crisp line a pixel wide right along the track
        float px = fwidth(d);
        float edge = 1.0 - smoothstep(0.5 * px, 1.5 * px, d);
        // Laid opaque, held so for a moment, then eased away to nothing
        float fade = 1.0 - smoothstep(uHold, 1.0, vAge);
        float a = edge * fade;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  }),
  WAKE.max * 2,
);
wake.frustumCulled = false;
wake.renderOrder = 2; // over the foam
scene.add(wake);
// The track: where the bird was, the way across it (unit, to its left), and
// whether it follows on from the point before (false after a lift-off)
const wakePts = Array.from({ length: WAKE.max }, () => ({ x: 0, z: 0, ax: 0, az: 0, age: 1, joined: false }));
let wakeNext = 0,
  wakeWait = 0,
  wakeWas = false;
const wakeDummy = new THREE.Object3D();
function stepWake(delta, pos, dir, skimY) {
  const touching = pos.y <= skimY + WAKE.touch && getHeight(pos.x, pos.z) < WATER_Y;
  wakeWait -= delta;
  if (touching && wakeWait <= 0) {
    wakeWait = WAKE.every;
    const p = wakePts[wakeNext];
    const flat = Math.hypot(dir.x, dir.z) || 1;
    p.x = pos.x - (dir.x / flat) * WAKE.behind;
    p.z = pos.z - (dir.z / flat) * WAKE.behind;
    p.ax = -dir.z / flat;
    p.az = dir.x / flat;
    p.age = 0;
    p.joined = wakeWas;
    wakeNext = (wakeNext + 1) % WAKE.max;
  }
  wakeWas = touching;
  for (const p of wakePts) p.age = Math.min(1, p.age + delta / WAKE.life);
  const y = WATER_Y + FOAM.lift + 0.02;
  // Each point and the one laid before it make a segment of each line
  for (let i = 0; i < WAKE.max; i++) {
    const p = wakePts[i],
      q = wakePts[(i - 1 + WAKE.max) % WAKE.max];
    const live = p.joined && p.age < 1 && q.age < 1 && i !== wakeNext; // wakeNext is the oldest: its "before" is the newest
    for (const side of [1, -1]) {
      const j = i * 2 + (side > 0 ? 0 : 1);
      if (!live) {
        wakeDummy.scale.setScalar(0);
        wakeAge.setX(j, 1);
      } else {
        const off = (a) => side * THREE.MathUtils.lerp(WAKE.apart[0], WAKE.apart[1], Math.sqrt(a));
        const x1 = p.x + p.ax * off(p.age),
          z1 = p.z + p.az * off(p.age),
          x0 = q.x + q.ax * off(q.age),
          z0 = q.z + q.az * off(q.age);
        const len = Math.hypot(x1 - x0, z1 - z0);
        wakeDummy.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        wakeDummy.rotation.set(0, Math.atan2(-(z1 - z0), x1 - x0), 0); // the plane's x along the segment
        wakeDummy.scale.set(len + WAKE.width, 1, WAKE.width); // a little over, so the segments meet
        wakeAge.setX(j, (p.age + q.age) / 2);
      }
      wakeDummy.updateMatrix();
      wake.setMatrixAt(j, wakeDummy.matrix);
    }
  }
  wakeAge.needsUpdate = true;
  wake.instanceMatrix.needsUpdate = true;
  return touching;
}
// The islands the shader is told about: those of the coarse cells around
// the bird, nearest first, refilled when the bird changes coarse cell
let foamCX = null,
  foamCZ = null;
function updateFoam() {
  const cx = Math.floor(player.position.x / GROUP.cell),
    cz = Math.floor(player.position.z / GROUP.cell);
  if (cx === foamCX && cz === foamCZ) return;
  foamCX = cx;
  foamCZ = cz;
  const near = [];
  for (let di = -SCENERY_REACH; di <= SCENERY_REACH; di++)
    for (let dj = -SCENERY_REACH; dj <= SCENERY_REACH; dj++) {
      const isl = groupAt(cx + di, cz + dj).island;
      if (isl) near.push(isl);
    }
  near.sort((a, b) => Math.hypot(a.x - player.position.x, a.z - player.position.z) - Math.hypot(b.x - player.position.x, b.z - player.position.z));
  const list = foamMat.uniforms.uLobes.value;
  let n = 0;
  // Only the shores near enough to show: past the haze they're lost in the
  // fog, and every lobe told costs every pixel of water two more turns of
  // the shader's loops. The list is redone only as the bird changes coarse
  // cell, so the reach is the haze plus a cell's worth of flying
  const reach = HAZE.far + GROUP.cell;
  const within = (x, z, r) => Math.hypot(x - player.position.x, z - player.position.z) - r < reach;
  for (const isl of near) for (const l of isl.lobes) if (n < list.length && within(l.x, l.z, l.r)) list[n++].set(l.x, l.z, l.r);
  // ...and the heads standing in the water: each a lobe of its own, its
  // radius set so the foam's waterline is at the neck's wall (the shader
  // puts it SHORE_OUT past a lobe's edge), so the lace gathers about it as
  // it does along a shore
  for (let di = -SCENERY_REACH; di <= SCENERY_REACH; di++)
    for (let dj = -SCENERY_REACH; dj <= SCENERY_REACH; dj++) {
      const g = groupAt(cx + di, cz + dj);
      if (!NATURE_MODE && g.sea) for (const m of g) if (n < list.length && within(m.x, m.z, 0)) list[n++].set(m.x, m.z, FOAM.headRing * RING_R * m.s - SHORE_OUT);
    }
  foamMat.uniforms.uCount.value = n;
}

// =====================================================================
// Ground mist
// =====================================================================
// Mist pools in the hollows. Each layer is a coarse grid that rides with the
// terrain: where the ground sits below the layer's level the vertex floats
// at that level and carries a thickness (how deep the mist is there); where
// the ground rises through it the vertex hugs the ground with zero thickness.
// So the mist thins out smoothly against every slope with no hard
// intersection line, and heads standing in a hollow rise out of it.
// The fragment shader then breaks the sheet up with drifting noise.
// Retuned for the sea: the sheets float over the water (whose bed lies
// ISLAND.depth down, so the mist is deep there) and hug the islands and
// their mounds where these rise through them. They are clear near the bird
// and thicken with distance (MIST_NEAR), so the water close by stays
// plain and the islands out at the rim come up out of mist rather than
// out of nothing. They take the sky's colour.
const MIST_ON = false; // the ground mist is off: the haze (HAZE, with the fog) does the fading in
const MIST_SIZE = 840, // across: past the rim (RIM) where the islands rise
  MIST_SEGS = 68;
const MIST_NEAR = [110, 240]; // world units from the bird: where the mist starts, and where it is full
const MIST_LAYERS = [
  // level: the height the sheet floats at; depth: how much ground-below-level
  // it takes to reach full density; opacity: the sheet's peak alpha
  { level: 1.0, depth: 6.0, opacity: 0.6, scale: 0.02, speed: 0.6 },
  { level: 3.0, depth: 9.0, opacity: 0.35, scale: 0.012, speed: 0.4 },
];
const mistVert = /* glsl */ `
  attribute float aThick;
  varying float vThick;
  varying vec3 vWorld;
  void main() {
    vThick = aThick;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const mistFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uMoonColor;
  uniform vec3 uCenter;
  uniform float uOpacity;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uFadeFar;
  uniform vec2 uNear;
  varying float vThick;
  varying vec3 vWorld;

  // Cheap value noise + 3-octave fbm, enough for soft mist banks
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = p * 2.1 + vec2(17.3, 9.1);
      a *= 0.5;
    }
    return v;
  }
  void main() {
    if (vThick <= 0.001) discard;
    // Two noise fields drifting in different directions, so the banks roll
    // and tear instead of sliding as one sheet
    vec2 p = vWorld.xz * uScale;
    float t = uTime * uSpeed;
    float n1 = fbm(p + vec2(t * 0.045, t * 0.02));
    float n2 = fbm(p * 1.7 - vec2(t * 0.03, -t * 0.05) + 31.0);
    float n = n1 * 0.65 + n2 * 0.35;
    float bank = smoothstep(0.32, 0.72, n);
    // Clear near the bird, full from uNear.y out; gone at the sheet's edge
    float dist = length(vWorld.xz - uCenter.xz);
    float near = smoothstep(uNear.x, uNear.y, dist);
    float far = 1.0 - smoothstep(uFadeFar * 0.9, uFadeFar, dist);
    float a = vThick * bank * near * far * uOpacity;
    if (a < 0.005) discard;
    // Thin wisps catch a little moonlight; the deep pools stay blue-grey
    vec3 col = mix(uColor, uMoonColor, bank * 0.35);
    gl_FragColor = vec4(col, a);
  }`;
const MIST_WHITE = new THREE.Color(0xffffff);
const mistLayers = MIST_LAYERS.map((L) => {
  const geo = new THREE.PlaneGeometry(MIST_SIZE, MIST_SIZE, MIST_SEGS, MIST_SEGS);
  geo.rotateX(-Math.PI / 2);
  geo.setAttribute(
    "aThick",
    new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1),
  );
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x8797b8) },
      uMoonColor: { value: new THREE.Color(0xc9d3e8) },
      uCenter: { value: new THREE.Vector3() },
      uOpacity: { value: L.opacity },
      uScale: { value: L.scale },
      uSpeed: { value: L.speed },
      uFadeFar: { value: MIST_SIZE * 0.5 },
      uNear: { value: new THREE.Vector2(MIST_NEAR[0], MIST_NEAR[1]) },
    },
    vertexShader: mistVert,
    fragmentShader: mistFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = MIST_ON;
  mesh.frustumCulled = false;
  mesh.renderOrder = 10; // after everything opaque and after the sky
  scene.add(mesh);
  return { ...L, geo, mat, mesh };
});
// Called with the terrain's resample: the heights come from its finished
// buffer (nextY), the seabed past its edge, so this costs nothing to speak of
function updateMist(cx, cz) {
  const x0 = cx - SIZE / 2,
    z0 = cz - SIZE / 2;
  const heightAt = (x, z) => {
    const c = Math.round((x - x0) / CELL),
      r = Math.round((z - z0) / CELL);
    return c < 0 || r < 0 || c > SEGMENTS || r > SEGMENTS ? -ISLAND.depth : nextY[r * N1 + c];
  };
  for (const L of mistLayers) {
    L.mesh.position.set(cx, 0, cz);
    const pos = L.geo.attributes.position,
      th = L.geo.attributes.aThick;
    for (let i = 0; i < pos.count; i++) {
      const h = heightAt(pos.getX(i) + cx, pos.getZ(i) + cz);
      const below = L.level - h; // how far the ground is under the sheet
      if (below > 0) {
        pos.setY(i, L.level);
        th.setX(i, Math.min(1, below / L.depth));
      } else {
        pos.setY(i, h + 0.02);
        th.setX(i, 0);
      }
    }
    pos.needsUpdate = true;
    th.needsUpdate = true;
  }
}

// The mound height at every terrain vertex, painted on statue by statue
// (each only touches the vertices under its own mound) rather than asked for
// vertex by vertex, which would mean checking every cell around each one
const moundBuf = new Float32Array(terrainGeo.attributes.position.count);
const N1 = SEGMENTS + 1; // vertices per row; the grid is row-major, z by row and x by column
function paintMounds(cx, cz) {
  if (NATURE_MODE) { moundBuf.fill(0); return; }
  moundBuf.fill(0);
  const x0 = cx - SIZE / 2,
    z0 = cz - SIZE / 2; // world position of vertex (0, 0)
  const g0x = Math.floor(x0 / SPACING) - MOUND_REACH,
    g1x = Math.floor((x0 + SIZE) / SPACING) + MOUND_REACH;
  const g0z = Math.floor(z0 / SPACING) - MOUND_REACH,
    g1z = Math.floor((z0 + SIZE) / SPACING) + MOUND_REACH;
  for (let gx = g0x; gx <= g1x; gx++) {
    for (let gz = g0z; gz <= g1z; gz++) {
      const st = statueAt(gx, gz);
      if (!st) continue;
      for (const { x, z, r: R, h: H } of moundsOf(gx, gz, st)) {
        const c0 = Math.max(0, Math.ceil((x - R - x0) / CELL)),
          c1 = Math.min(SEGMENTS, Math.floor((x + R - x0) / CELL));
        const r0 = Math.max(0, Math.ceil((z - R - z0) / CELL)),
          r1 = Math.min(SEGMENTS, Math.floor((z + R - z0) / CELL));
        for (let r = r0; r <= r1; r++) {
          const dz = z0 + r * CELL - z;
          for (let c = c0; c <= c1; c++) {
            const dx = x0 + c * CELL - x;
            const t = 1 - Math.hypot(dx, dz) / R;
            if (t > 0) moundBuf[r * N1 + c] += H * moundRise(t); // the same dome as moundAt
          }
        }
      }
    }
  }
}
// Resampling the terrain (every vertex's height, colour and normal) is
// spread over several frames into scratch buffers, then swapped in at once
// with the mesh's move, so the ground never hitches as the bird crosses a
// step. Normals come from the mound heights around each vertex, so there is
// no whole-mesh normal pass at the end. The first time, it runs to the end
// at once, so there is ground under the bird from the first frame.
const nextY = new Float32Array(terrainGeo.attributes.position.count),
  nextCol = new Float32Array(terrainGeo.attributes.position.count * 3),
  nextNor = new Float32Array(terrainGeo.attributes.position.count * 3);
const TERRAIN_BUDGET = 16000; // vertices a frame, for the heights and again for the normals (160k vertices: a step is about 20 frames in all, a third of a second, in which the bird flies less than half a STEP)
// The land under each vertex (its height without the mounds, and the beach
// line's field) is the dear part now: the beach line asks every lobe's
// every side. It never changes for a spot of the world, and the mesh moves
// in whole cells, so it is kept from one step to the next: the arrays are
// shifted by the mesh's move, and only the strip of vertices new to the
// sheet is worked out (landKnown says which)
const landBuf = new Float32Array(terrainGeo.attributes.position.count),
  lineBuf = new Float32Array(terrainGeo.attributes.position.count),
  landKnown = new Uint8Array(terrainGeo.attributes.position.count);
let landCX = null,
  landCZ = null; // where the cache's mesh stood
function shiftLand(cx, cz) {
  if (landCX === null) landKnown.fill(0);
  else {
    const sx = Math.round((cx - landCX) / CELL),
      sz = Math.round((cz - landCZ) / CELL); // the new vertex (r, c) is the old (r + sz, c + sx)
    if (sx || sz) {
      // Row by row, in the order that never overwrites a row still to be read
      const rows = sz > 0 ? Array.from({ length: N1 }, (_, r) => r) : Array.from({ length: N1 }, (_, r) => N1 - 1 - r);
      for (const r of rows) {
        const ro = r + sz;
        if (ro < 0 || ro >= N1) {
          landKnown.fill(0, r * N1, (r + 1) * N1);
          continue;
        }
        const c0 = Math.max(0, -sx),
          c1 = Math.min(N1, N1 - sx); // the columns with an old vertex to take from
        if (c0 < c1) {
          landBuf.copyWithin(r * N1 + c0, ro * N1 + c0 + sx, ro * N1 + c1 + sx);
          lineBuf.copyWithin(r * N1 + c0, ro * N1 + c0 + sx, ro * N1 + c1 + sx);
          landKnown.copyWithin(r * N1 + c0, ro * N1 + c0 + sx, ro * N1 + c1 + sx);
        }
        landKnown.fill(0, r * N1, r * N1 + c0);
        landKnown.fill(0, r * N1 + c1, (r + 1) * N1);
      }
    }
  }
  landCX = cx;
  landCZ = cz;
}
let terrainJob = null; // { cx, cz, i, n } while a resample is under way: i vertices' heights done, n vertices' normals done
function startTerrain(cx, cz, atOnce = false) {
  paintMounds(cx, cz);
  shiftLand(cx, cz);
  terrainJob = { cx, cz, i: 0, n: 0 };
  if (atOnce) stepTerrain(Infinity);
}
function stepTerrain(budget = TERRAIN_BUDGET) {
  const J = terrainJob;
  if (!J) return;
  const pos = terrainGeo.attributes.position;
  if (J.i < pos.count) {
    const end = Math.min(pos.count, J.i + budget);
    for (let i = J.i; i < end; i++) {
      const mound = moundBuf[i];
      if (!landKnown[i]) {
        const x = pos.getX(i) + J.cx,
          z = pos.getZ(i) + J.cz;
        lineBuf[i] = beach.lineField(x, z);
        landBuf[i] = landHeight(x, z, lineBuf[i]);
        landKnown[i] = 1;
      }
      const land = landBuf[i];
      nextY[i] = land + mound;
      // Grass, going to a dark moss on the mounds (a little of the lab's
      // earth tint under it) and about the obelisks; the sand and the
      // seabed are the shader's, from the line field
      const mossy = Math.max(THREE.MathUtils.clamp(mound / 1.2, 0, 1) * MOSS_GROUND.statue, stoneMossAt(pos.getX(i) + J.cx, pos.getZ(i) + J.cz) * MOSS_GROUND.stone);
      const rock = THREE.MathUtils.smoothstep(land, 7, 23);
      const snow = THREE.MathUtils.smoothstep(land, 30, 44);
      groundColor.copy(GRASS)
        .lerp(EARTH, THREE.MathUtils.clamp(mound / 1.5, 0, 0.7) * 0.35)
        .lerp(ROCK_GROUND, rock)
        .lerp(SNOW_GROUND, snow)
        .lerp(MOSS_GROUND.color, mossy * (1 - rock));
      nextCol[i * 3] = groundColor.r;
      nextCol[i * 3 + 1] = groundColor.g;
      nextCol[i * 3 + 2] = groundColor.b;
    }
    J.i = end;
    if (end < pos.count) return;
  }
  // The slope from the heights either side, for the normals: the shores
  // and the mounds (a pass over the finished heights, spread out the same way)
  const end = Math.min(pos.count, J.n + budget);
  for (let i = J.n; i < end; i++) {
    const r = Math.floor(i / N1),
      c = i - r * N1;
    const dx = (nextY[r * N1 + Math.min(SEGMENTS, c + 1)] - nextY[r * N1 + Math.max(0, c - 1)]) / (2 * CELL);
    const dz = (nextY[Math.min(SEGMENTS, r + 1) * N1 + c] - nextY[Math.max(0, r - 1) * N1 + c]) / (2 * CELL);
    const inv = 1 / Math.hypot(dx, 1, dz);
    nextNor[i * 3] = -dx * inv;
    nextNor[i * 3 + 1] = inv;
    nextNor[i * 3 + 2] = -dz * inv;
  }
  J.n = end;
  if (end < pos.count) return;
  // Finished: swap it all in and move the mesh
  const col = terrainGeo.attributes.color,
    nor = terrainGeo.attributes.normal,
    line = terrainGeo.attributes.aLine;
  for (let i = 0; i < pos.count; i++) pos.setY(i, nextY[i]);
  col.array.set(nextCol);
  nor.array.set(nextNor);
  line.array.set(lineBuf);
  pos.needsUpdate = true;
  col.needsUpdate = true;
  nor.needsUpdate = true;
  line.needsUpdate = true;
  terrain.position.set(J.cx, 0, J.cz);
  terrainJob = null;
  updateMist(J.cx, J.cz);
}
const STEP = CELL * 8; // the mesh moves in steps of whole cells (so its vertices stay put in the world), and only every so often: resampling it is the dear part
const snap = (v) => Math.round(v / STEP) * STEP;
let lastCX = null,
  lastCZ = null;

// =====================================================================
// Heads scattered across the landscape
// =====================================================================
// Each statue is one piece: the head with its neck extruded into the ground.
// The top of the neck can BEND: a vertex shader curves the last stretch of it
// like a drooping stem, and carries the head rigidly to the curve's tip. Far
// away they stand tall; walk up close and the neck arcs over so the face comes
// down and points straight at you, inspecting.
const SPACING = 14,
  RANGE = Math.round(SIGHT / SPACING); // fine cells out from the bird the statues are kept: SIGHT, inside the terrain sheet's rim (RIM), so every statue stands on risen ground
const MAX_HEADS = (RANGE * 2 + 1) ** 2;

const { plaster, dark, headDepth } = makeMaterials();
// The statues in the lab's colours
plaster.color.set(LAB_PALETTE.stone);
dark.color.set(LAB_PALETTE.eyes);
// New statues appear at the edge of the field, well inside the fog's reach,
// so rather than popping they blend up out of the fog colour over a moment
const FADE_IN = 6; // seconds: about 90 units of flight at cruise, so a statue is still condensing as its island finishes rising

const field = (g, material) => {
  const f = new THREE.InstancedMesh(g, material, MAX_HEADS);
  f.visible = !NATURE_MODE;
  f.frustumCulled = false;
  f.receiveShadow = true;
  f.attrs = attachAttrs(g, MAX_HEADS);
  scene.add(f);
  return f;
};
// headFields[v], eyeFields[v]
const headFields = variants.map((v) => {
  const f = field(v.head, plaster);
  f.customDepthMaterial = headDepth;
  f.castShadow = true;
  return f;
});
const eyeFields = variants.map((v) => field(v.eyes, dark)); // eyes sit inside the head's shadow, no need to cast
// The arms (hands.js, tuned in the pillars lab): stone arms reaching out of
// the earth around each foot, one instanced mesh per pose and side, in the
// head's stone and through the neck shaders (the upper arm is stretched and
// bent at the elbow per instance, like a neck).
const MAX_ARMS = MAX_HEADS * Math.max(1, HANDS.count);
const armField = (g, material, casts) => {
  const f = new THREE.InstancedMesh(g, material, MAX_ARMS);
  f.visible = !NATURE_MODE;
  f.frustumCulled = false;
  f.receiveShadow = true;
  if (casts) {
    f.castShadow = true;
    f.customDepthMaterial = headDepth;
  }
  f.attrs = attachAttrs(g, MAX_ARMS);
  scene.add(f);
  return f;
};
// armGeos[pose][side] (side 0 = right, 1 = left). Every pose is built from
// the same pieces in the same order, so vertex n of one pose is vertex n of
// any other: a hand changing pose is drawn by the mesh for that pair of
// poses, its shape eased from one to the other in the shader (aMorph, per
// arm), as in the pillars lab
await loading("shaping the hands", HEADS_SHARE);
const armGeos = HANDS.count > 0 ? Object.fromEntries(POSE_NAMES.map((name) => [name, [1, -1].map((side) => buildArm(name, side, { x: RCX, z: RCZ }))])) : {};
const morphing = (src) => {
  const m = src.clone();
  const prevKey = src.customProgramCacheKey.bind(src),
    prevCompile = src.onBeforeCompile;
  m.customProgramCacheKey = () => prevKey() + "-morph";
  m.onBeforeCompile = (shader) => {
    prevCompile(shader);
    // Everything after reads the blended shape (the bend, the weathering)
    shader.vertexShader =
      "attribute vec3 aPosB;\nattribute vec3 aNorB;\nattribute float aMorph;\n" +
      "#define position mix(position, aPosB, aMorph)\n#define normal normalize(mix(normal, aNorB, aMorph))\n" +
      shader.vertexShader;
  };
  return m;
};
const handMat = morphing(plaster),
  handDepth = morphing(headDepth);
const handPairs = new Map(); // "from>to>side" → its instanced mesh, made when first needed
function handMesh(from, to, which) {
  if (armGeos[from][which].attributes.position.count !== armGeos[to][which].attributes.position.count) to = from; // can't blend: swap in a frame
  const key = `${from}>${to}>${which}`;
  let f = handPairs.get(key);
  if (!f) {
    const a = armGeos[from][which].attributes,
      b = armGeos[to][which].attributes;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", a.position);
    g.setAttribute("normal", a.normal);
    g.setAttribute("aPosB", b.position);
    g.setAttribute("aNorB", b.normal);
    f = armField(g, handMat, true);
    f.count = 0; // an InstancedMesh starts full: made mid-frame, the hand it was made for was skipped (count >= MAX_ARMS) and blinked out for that frame
    f.customDepthMaterial = handDepth;
    f.morph = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ARMS), 1);
    g.setAttribute("aMorph", f.morph);
    handPairs.set(key, f);
  }
  return f;
}
const allFields = [...headFields, ...eyeFields];
const fieldsNow = () => [...allFields, ...handPairs.values()]; // the hand meshes are made as poses pair up

const dummy = new THREE.Object3D();

// The field is open: clusters of statues (CLUSTER), each dealt once for a
// coarse cell of GROUP.cell world units, well apart from the next. Every
// statue still lives in a fine cell of SPACING units (its key, its mound):
// a fine cell holds the one head of a nearby cluster that lands in it, or
// nothing. Heads keep at least 20 units apart, so no fine cell holds two.
const GROUP = {
  cell: 180, // world units of coarse grid per group: one island at most a cell (a dense island reaches ~70 from its centre, a special isle ~90, so neighbours only rarely join) (was 210; 150 before the bird sped up)
  chance: 0.3, // how often a coarse cell holds a formation (an island) at all (was 0.225: islands came about 440 apart on average, now about 330, so there is nearly always one in sight; 0.35 for a moment, which with the bigger crowds doubled what the field drew, and it slowed)
  jitter: 0.15, // how far a formation wanders from its cell's centre, as a fraction of half the cell
};
const ROCK_GROUND = new THREE.Color(0x77786e);
const SNOW_GROUND = new THREE.Color(0xe2e8e4);
// The three sizes of head (head scale; a head is about two units tall per
// unit of scale), a ladder: each about 1.7 times the last, with a gap
// between them so a tier always reads as its tier, and each used wherever
// a head of that order is dealt (the clusters, the special isles, the sea).
// Nothing in the field is smaller than SMALL
const SMALL = [3.6, 4.4], // (was BIG 4 – 5.5) the crowd: many to an island, on long necks
  LARGE = [6.4, 7.6], // (was MASSIVE 6 – 7.5) the elder: one to an island at most
  COLOSSAL = [11, 13]; // (was 10 – 13) rare, and a different order of thing: alone on its own isle, or out at sea
// Necks, in head units (so a giant's neck is as tall for its size as a
// small head's). The bigger the tier, the shorter its necks on average:
// the giants sit low
const LANKY = [3, 6.5], // (was 2 – 6) the small heads: tall necks, most of them spindly (SPINDLY), standing among the stones
  STOCKY = [0.6, 2.4], // the large heads
  SQUAT = [0, 0]; // no neck at all, the head sitting on the earth (the neck's floor keeps its chin just off it); no tier uses it now
// The tall ones are skinny, small-headed things: a neck taller than `from`
// head units shrinks its head (and so the neck's girth, which goes with
// it) by up to `by` at `to`, the neck keeping its height in world units
const SPINDLY = { from: 3, to: 5.5, by: 0.4 };
// A cluster: a crowd of small heads scattered about the cell's centre, each
// its own neck, keeping their distance from one another: no two clusters
// alike. Some islands have an elder too (ELDER): one large head among
// them. What a cluster holds is a property of the island, not a roll per
// head, so an island reads as a kind of island: the dense ones, as the
// graves at Okunoin, are all small heads among stones and trees
const CLUSTER = {
  count: [5, 8], // heads per cluster (was 7 – 12, cut to 70% for the frame rate; 4 – 8 before that): a crowd, so many turn at once
  radius: 45, // world units from the centre the heads scatter over: a loose knot (was 42, widened for the count)
  tiers: [
    [SMALL, 1, LANKY], // a size range, how much of the field is that size, and its necks (head units). (was BIG 0.8, MASSIVE 0.17, COLOSSAL 0.03: the big ones are dealt by the island now, ELDER and SPECIAL)
  ],
  apart: [8, 1.6], // world units two heads keep between them: a base, plus this much per unit of their sizes added (the base keeps the smallest pair past 20, so no fine cell holds two)
  tries: 40, // spots tried for a head before it is left out
};
// The elder: some dense islands hold one large head among their crowd,
// dealt first, at the island's middle-ish like the rest. null for none
const ELDER = {
  chance: 0.4, // of the dense islands
  s: LARGE,
  neck: STOCKY, // head units of neck
};
// A special isle, rarely: a wide, bare island about one colossus, the only
// kind with arms, with a ring of small heads at its feet, planted facing
// it and deaf to the bird (attendants), and the field's lone arms (LONE),
// which gather here and nowhere else; a few obelisks standing alone, few
// trees, no flowers. Dealt on a block of cells rather than a cell
// (`every`), so two are never neighbours: the rarity is spaced, and the
// dense islands between are the way to the next one. (was a shrine isle
// on 14% of the held cells, 8 – 10, in a wood, and a strange giant on
// 20% of them, 10 – 12, on a dense island: nearly the same thing twice)
const SPECIAL = {
  every: 3, // coarse cells: one special isle at most in each block this many cells square (630 world units)
  chance: 0, // of those blocks that hold one (was 0.5; 0: none. The colossi with hands on land were tacky: the field is clustered islands, now and then a knot of heads in the water, and rarely a whale)
  s: COLOSSAL, // the statue's size
  neck: [0.8, 1.6], // head units of neck
  min: 20, // world units: the island's core, at least (its mound and a margin decide the rest)
  margin: 14, // world units of grass past the outermost mound: open ground (was 6)
  lobes: [2, 4], // lobes thrown out round it
  trees: 0.3, // times the trees an island usually has for its size: a few (was 2.6, a wood)
  stones: [3, 6], // obelisks dealt over it, standing alone (was 4 – 10)
  arms: [12, 20], // lone arms (LONE) dealt over it, reaching for the bird with the colossus
  attendants: {
    count: [3, 5], // small heads in a ring at the colossus's feet; [0, 0] for none
    s: SMALL,
    neck: [1, 2], // head units of neck: low, kneeling
    ring: 1.35, // how far out they stand, in the colossus's mound radius plus their own: off its earth
    gaze: -0.35, // their necks' curl at rest: tipped back, looking up at it (0 level, negative up)
  },
};
// Out at sea, now and then, where no island is: a colossus's head sitting
// half under the water, or a knot of small heads on long necks, with arms
// reaching up out of the sea about it (which reach for the bird, as the
// lone arms on land do). They stand on the seabed (ISLAND.depth under the
// grass), with no mound of their own
// Out at sea, rarely: a whale, a head bigger than anything on land, that
// comes up out of the water very slowly, turning as it rises, and sinks
// back as the bird goes; or a knot of smaller heads on long necks. Both
// rumble as they move (sounds.js rumble). A head sits at rest with its
// origin `sunk` scales under the water: where the seabed is too shallow
// for that, its foot is set below the bed (cand.ground), so its neck
// stays short and the head sinks as far as it should
const SEA = {
  chance: 0.24, // of the cells that hold no island (was 0.1: with the map new each load, a typical start had some 3 in the first half minute where the old fixed map had 8; 0.15 and 0.3 before that, when the sea held more colossi than the islands held anything)
  colossus: 0.2, // share of them that are a whale (the rest, a knot of heads) (was 0.25)
  whale: {
    s: [16, 20], // its size: past the land's colossal (11 – 13) (was 10 – 13)
    sunk: 2.2, // its origin this many of its scales under the water at rest: wholly under, a shadow in the water (was 0.7: its brow and crown out)
    above: [CHIN_DEPTH + 0.8, CHIN_DEPTH + 1.8], // ...and this many above it risen: the whole head out, its chin clear and a stretch of neck under it (was 0.5 – 1: its chin under)
    lean: [0.1, 0.4], // radians its neck leans, at rest and watching: nearly upright, a head
  },
  // A knot: heads standing on the seabed with their heads their necks'
  // height over the water, as the land's stand over their grass; they
  // never rise or sink, and bend as the land's do (was: half under at
  // rest, lifting out on super long necks as the bird came over)
  heads: [3, 6], // heads in a knot
  s: [2.4, 3.6], // their size
  big: LARGE, // ...but the first of a knot is a large one (was 6 – 9: a colossus as often as not)
  neck: [2.5, 5], // head units of neck over the water, the small ones (the land's small heads: LANKY)
  bigNeck: [0.8, 2], // ...and the large one (the land's: STOCKY)
  radius: 22, // world units a knot spreads over
  arms: [0, 0], // arms up out of the sea about it (was 4 – 9: no hands in the water)
  armScale: [2, 3.4], // their scale
  emerge: [1, 2.6], // arm units of each out of the water, to the wrist
  armRadius: 30, // world units they spread over
  bend: 18, // head units the whale's neck's bend may run (the land's run 6 at most); it has next to no neck, so this hardly shows
  curl: 2.8, // radians the whale's neck may bend through, at most (the land's 1.75); the seabed is under water, so not kept clear of
  trail: { gap: [45, 70], wander: 5, reach: 2, above: 4 }, // its lanterns: a line out to the nearest island, one each gap world units (was 22 – 30), wandering this much side to side, looking this many cells out; each a lantern kind and height drawn, but at least `above` world units of it out of the water
  wake: [30, 6], // world units from the bird a head starts rising at: a base, plus this much per unit of its scale (a knot's small heads ~50, a whale ~140, so it has time to come up); an arm changes its pose at the base (was 45 for all)
  rate: 0.5, // how a neck rises and sinks: eased toward where it is going at this rate (per second)... (was 0.9)
  climb: 5, // ...but never faster than this many world units a second: a whale takes fifteen seconds or so to come up (was 3, when it rose half as far)
  // Once up, a whale stays up while the bird can see it: it sinks only
  // once the bird is past the haze (HAZE.far) by this many of its scales,
  // and then at once, lost in the fog, so it is never seen going down
  hidden: 1,
  turn: [0.8, 1.6], // radians a head turns about its foot, either way, between sunk and risen: it comes round as it comes up
};
// How far out from its foot a sea head can reach, its neck risen and bent
// right over (the bend's furthest reach, about 0.73 of its length, plus
// the head)
function seaReach(riseLen, s, bend = SEA.bend) {
  return 0.73 * bendLen(riseLen / s + STRETCH_FROM, bend) * s + 1.6 * s;
}
// How quickly a head follows the bird: its rate is drawn from `range` for a
// head of scale `at`, and is slower in proportion as the head is bigger (a
// colossus of 12 turns at a third the rate of a small head of 4), so mass
// shows in time as well as size; the top speeds of the turn and the nod
// scale the same way. Off: 0.8 – 3, whatever the size (as it was)
const TEMPO = { on: true, at: 4, range: [1.4, 2.6] };
// Trees: dotted over every island, alone and in clumps, off the mounds
const WOOD = {
  per: [42, 78], // dense forests across the islands
  clumped: 0.65, // share of them dealt in clumps rather than alone
  clump: [5, 11], // trees to a clump
  spread: 28, // world units a clump spreads over
  // (each tree's scale is its kind's, TREES[kind].scale in scenery.js, the trees lab's to slide)
  mound: 0.25, // world units of mound under a tree at most: they keep off the heads' earth
  reach: 0.4, // head units of room past where a bent head can reach (its bend, plus the head itself)
};
// Obelisks (scenery.js buildObelisk): stone markers of every size, as the
// graves stand at Okunoin, mostly in groves, among the trees
const STONES = {
  per: [63, 105], // obelisks an island of radius 60 is dealt; a bigger or smaller island gets its share by area: dense (was 90 – 150, cut to 70% for the frame rate)
  grove: 0.85, // share of them dealt in groves rather than alone
  groves: [12, 30], // obelisks to a grove
  spread: 18, // world units a grove spreads over
  scale: 1, // every obelisk's scale: one thickness for all; their heights differ (OBELISKS.heights)
  bias: 1.4, // how strongly the heights drawn lean short (1 = evenly)
  mound: 2.5, // world units of mound under one at most: they may stand on the heads' earth (an armed head's reach keeps them off its own)
  // Around each tall, skinny, armless head (a neck of SPINDLY.from head
  // units or more): a stand of obelisks of its own, close in, so they
  // stand among the stones
  around: [6, 12], // obelisks tried about it
  ring: [1.6, 5], // how far out, in its head's scales from its foot
  clear: 1.4, // how far an armless head keeps them off, in its scales (an armed one keeps them out of its whole reach)
};
// Lone hands: a few per island, each a column of stone out of the ground
// with an open hand on top, reaching for the sky, belonging to no head,
// standing among the obelisks (dealt beside one of them). Drawn by the
// statues' arm meshes, still
// Lone arms: disembodied arms coming up out of the ground, scattered over
// the islands, each its own pose, size and slant; some lie along the ground
// Each is a broken-off hand: the hand with a short stump of forearm under
// it, lying on the grass or set upright on its stump, wholly out of the
// ground (none of it buried; a lying one is lifted so none of it is under
// the grass, lyingLift). Now and then an island has one giant hand
const LONE = {
  per: [6, 12], // hands an island of radius 60 is dealt; a bigger or smaller island gets its share by area (was 10 – 20, then 0 while the special isles had them all; they are bigger now, so fewer)
  scale: [3.5, 6.7], // a hand's scale (world units per arm unit) (was 2.2 – 4.2: too small)
  out: [0.25, 0.6], // arm units of stump under the wrist (was 1.2 – 2.8 of column coming up out of the ground)
  slant: [0, 0.25], // radians an upright one leans off upright, drawn (was 0 – 0.55)
  lying: 0, // share of them lying along the ground... (was 0.6, 0.35 before: none now, they never sat right on the grass)
  lie: [1.2, 1.5], // ...this far over (radians off upright) (was 1.3 – 1.45)
  lean: [0.05, 0.3], // radians the hand leans off the forearm at the wrist
  giant: {
    chance: 0.12, // of the islands: one giant hand, lying or upright as the rest
    scale: [10, 16], // its scale
    tries: 8, // spots tried for it (it needs a wide clear patch among the stones)
  },
};
// Rubble (scenery.js buildDebris): pebbles, shards and paving discs strewn
// over every island's grass, alone and in scatters, and the discs of a
// broken walkway or two running in from the shore. Cheap: a few low-poly
// instanced meshes, casting no shadow
const RUBBLE = {
  per: [80, 160], // pieces an island of radius 60 is dealt, besides its walkways; a bigger or smaller island gets its share by area
  kinds: [
    ["pebble", 0.6], // a kind, and how much of the strew is that kind
    ["shard", 0.3],
    ["disc", 0.1],
  ],
  scale: { pebble: [0.25, 0.7], shard: [0.4, 1.1], disc: [0.8, 1.5] }, // world units across (a piece is built about one across)
  clumped: 0.6, // share dealt in scatters rather than alone
  clump: [4, 10], // pieces to a scatter
  spread: 4, // world units a scatter spreads over
  sink: [0.15, 0.5], // share of a piece's height sunk into the ground, drawn
  tilt: 0.3, // radians a piece may lie off level, at most
  tint: 0.15, // ± lightness, drawn per piece
  shade: 0.85, // the rubble's stone against the statues' (LAB_PALETTE.stone): a little darker
  walkway: {
    chance: 0.7, // of the islands
    count: [1, 2], // walkways on one
    gap: [1.6, 2.6], // world units from one disc to the next, times their scale
    scale: [1.1, 1.8], // the discs' size
    length: [0.4, 0.95], // how far in from the shore it runs, of the island's core radius
    wander: 0.6, // world units a disc may stray off the line, either way
    missing: 0.3, // share of the discs gone
    sink: [0.3, 0.8], // share of a disc's height sunk: flush with the grass, more or less
  },
};
// Fallen heads: broken off their necks long ago, lying on the broken face
// on an island's grass. Stone like the rest: they never move, nor turn to
// the bird. Each is one of a few broken shapes (breakHead in heads.js)
const FALLEN = {
  per: [1, 3], // heads an island of radius 60 is dealt; a bigger or smaller island gets its share by area
  shapes: 6, // broken heads built at startup, the field's own heads broken
  minCut: 0.25, // head units² of broken face, at least, for one to lie on (fewer and a shape is broken again)
  scale: [2.6, 4.4], // world units per head unit: about the crowd's heads (SMALL)
  sink: [0.05, 0.3], // head units it lies sunk in the ground
  clear: 1.4, // head units about it kept clear of trees and obelisks
};
// Necks standing with no head: each broken a little under where the head
// was, its flare to the skull still on it. A head that came off lies close
// by (FALLEN's shapes): what the fallen heads fell from
const STUMPS = {
  per: [1, 2], // an island of radius 60; a bigger or smaller island gets its share by area
  shapes: 4, // built at startup (~0.15 s each)
  neck: [1, 3.5], // head units of neck left standing
  into: [0.05, 0.4], // head units under the head's join the break runs (never above it: the neck's top edge was closed by the skull)
  level: [0, 0.6], // how far the break turns from the join's slant (0) toward level (1)
  head: [3, 5], // head units from the stump its head lies
};
// None stands taller than a giant statue: the least of the strange giants
// on its shortest neck (a head is about 2 units tall per unit of scale)
const STONE_TOP = SPECIAL.s[0] * (SPECIAL.neck[0] + 2); // (the special isle's colossus)
const MAX_SIZE = Math.max(SPECIAL.s[1], SEA.whale.s[1], ELDER ? ELDER.s[1] : 0, ...CLUSTER.tiers.map(([r]) => r[1]));
// Which coarse cells hold a formation: a cell its hash gives one (GROUP.chance),
// and the one cell of each SPECIAL.every-square block that the block's
// hash picks, when the block holds a special isle at all (SPECIAL.chance)
function specialCell(cx, cz) {
  const n = SPECIAL.every,
    bx = Math.floor(cx / n),
    bz = Math.floor(cz / n);
  if (hash(bx, bz, 120) >= SPECIAL.chance) return false;
  return cx === bx * n + Math.floor(hash(bx, bz, 121) * n) && cz === bz * n + Math.floor(hash(bx, bz, 122) * n);
}
// Whatever the seed, the flight opens on islands: the bird sets off from
// the origin heading -z (heading π), and these two cells always hold one,
// the first ahead and to the left (some 130 units off), the next ahead and
// to the right (some 280), so there are statues and lanterns from the start
const startCell = (cx, cz) => (cx === -1 && cz === -1) || (cx === 0 && cz === -2);
const cellHeld = (cx, cz) => startCell(cx, cz) || hash(cx, cz, 101) <= GROUP.chance || specialCell(cx, cz);
// The group a coarse cell holds, if any: its members in world units
const groupMemo = new Map();
function groupAt(cx, cz) {
  const key = (cx + 0x8000) * 0x10000 + (cz + 0x8000);
  let g = groupMemo.get(key);
  if (g !== undefined) return g;
  // The heads (an empty list for a cell without a formation), with the
  // cell's island and trees hung on the list
  g = [];
  if (groupMemo.size > 512) groupMemo.delete(groupMemo.keys().next().value);
  const heading = hash(cx, cz, 103) * Math.PI * 2;
  const half = GROUP.cell / 2;
  const ox = (cx + 0.5) * GROUP.cell + (hash(cx, cz, 104) * 2 - 1) * GROUP.jitter * half,
    oz = (cz + 0.5) * GROUP.cell + (hash(cx, cz, 105) * 2 - 1) * GROUP.jitter * half;
  const c = Math.cos(heading),
    sn = Math.sin(heading);
  const at = (x, z) => ({ x: ox + x * c - z * sn, z: oz + x * sn + z * c });
  const special = specialCell(cx, cz);
  const held = special || cellHeld(cx, cz);
  const draw = (i, seed) => hash(cx * 16 + i, cz, seed);
  const between = ([lo, hi], i, seed) => lo + draw(i, seed) * (hi - lo);
  g.special = special;
  g.sea = !NATURE_MODE && !held && hash(cx, cz, 111) < SEA.chance;
  if (!NATURE_MODE && g.sea) {
    // Out at sea, on the seabed: a colossus's head half under the water, or a knot of heads on long necks
    const bed = -ISLAND.depth,
      deep = WATER_Y - bed; // how deep the water is
    // A head's foot: on the seabed, or below it where the head must sit
    // deeper than the bed allows (a short neck's length under its rest)
    const foot = (restOrigin) => Math.min(bed, restOrigin - 0.2);
    if (hash(cx, cz, 112) < SEA.colossus) {
      const W = SEA.whale;
      const size = between(W.s, 0, 106);
      const ground = foot(WATER_Y - W.sunk * size);
      g.push({ ...at(0, 0), s: size, bendMost: SEA.bend, lean: between(W.lean, 0, 113), ground, neckLen: WATER_Y - W.sunk * size - ground, riseLen: WATER_Y + between(W.above, 0, 107) * size - ground, sea: true });
    } else {
      const n = Math.round(between(SEA.heads, 0, 108));
      for (let i = 0; i < n; i++) {
        const size = between(i === 0 ? SEA.big : SEA.s, i, 106); // the first, a big one
        const neckLen = WATER_Y + between(i === 0 ? SEA.bigNeck : SEA.neck, i, 107) * size - bed; // standing on the bed, its head over the water
        const reach = seaReach(neckLen, size, undefined); // bent as a land head bends
        for (let t = 0; t < CLUSTER.tries; t++) {
          const a = draw(i, 200 + t * 2) * Math.PI * 2,
            d = i === 0 ? 0 : reach + g[0].reach + Math.sqrt(draw(i, 201 + t * 2)) * SEA.radius * 2.5; // the big one in the middle; the rest out past its reach
          const spot = at(Math.sin(a) * d, Math.cos(a) * d);
          if (g.every((o) => Math.hypot(o.x - spot.x, o.z - spot.z) >= o.reach + reach)) { // bent right over toward each other, they still don't meet
            g.push({ ...spot, s: size, reach, ground: bed, neckLen, riseLen: neckLen, still: true, sea: true }); // still: it stands as it is
            break;
          }
        }
      }
    }
  } else if (!NATURE_MODE && special) {
    // The special isle's one colossus, armed, and its attendants in a ring
    // at its feet: each planted facing it (`face`), deaf to the bird
    // (`devout`), its neck tipped back to look up at it (`lean`, as the
    // sea heads lean)
    const size = between(SPECIAL.s, 0, 106);
    g.push({ ...at(0, 0), s: size, neckLen: between(SPECIAL.neck, 0, 107) * size, armed: true });
    const A = SPECIAL.attendants;
    const n = Math.round(between(A.count, 0, 108));
    for (let i = 1; i <= n; i++) {
      const as = between(A.s, i, 106);
      const d = A.ring * (moundRadius(size) + moundRadius(as));
      const a = ((i - 1 + 0.5 + (draw(i, 109) - 0.5) * 0.5) / n) * Math.PI * 2; // evenly round, each a little off its place
      const spot = at(Math.sin(a) * d, Math.cos(a) * d);
      if (!g.every((o) => Math.hypot(o.x - spot.x, o.z - spot.z) >= CLUSTER.apart[0] + CLUSTER.apart[1] * (o.s + as))) continue;
      g.push({ ...spot, s: as, neckLen: between(A.neck, i, 107) * as, devout: true, face: { x: ox, z: oz }, lean: A.gaze });
    }
  } else if (!NATURE_MODE && held) {
    // A cluster: heads one by one, each at the first spot that keeps its
    // distance from those already placed; the elder first, when the island
    // has one
    const n = Math.round(between(CLUSTER.count, 0, 108));
    const elder = ELDER && draw(0, 115) < ELDER.chance;
    for (let i = 0; i < n; i++) {
      let pick = draw(i, 109),
        tier = CLUSTER.tiers[0][0],
        necks = CLUSTER.tiers[0][2];
      for (const [range, share, neckRange] of CLUSTER.tiers) {
        tier = range;
        necks = neckRange;
        if ((pick -= share) < 0) break;
      }
      if (elder && i === 0) [tier, necks] = [ELDER.s, ELDER.neck];
      // Its neck first (head units of its drawn size); a tall one's head then
      // shrinks (SPINDLY), the neck keeping its height
      const drawn = between(tier, i, 106),
        neckHU = between(necks, i, 107);
      const size = drawn * (1 - SPINDLY.by * THREE.MathUtils.clamp((neckHU - SPINDLY.from) / (SPINDLY.to - SPINDLY.from), 0, 1)),
        neckWorld = neckHU * drawn;
      for (let t = 0; t < CLUSTER.tries; t++) {
        const a = draw(i, 200 + t * 2) * Math.PI * 2,
          d = Math.sqrt(draw(i, 201 + t * 2)) * CLUSTER.radius; // even over the disc
        const spot = at(Math.sin(a) * d, Math.cos(a) * d);
        if (g.every((o) => Math.hypot(o.x - spot.x, o.z - spot.z) >= CLUSTER.apart[0] + CLUSTER.apart[1] * (o.s + size))) {
          g.push({ ...spot, s: size, neckLen: neckWorld });
          break;
        }
      }
    }
  }
  // The island under it all: a core disc about the formation's centre,
  // just big enough to hold every mound with a margin of grass, and the
  // lobes thrown out around it (ISLAND.lobes), the core first
  g.island = null;
  if (held) {
    let r = Math.max(special ? SPECIAL.min : ISLAND.min, between([90, 140], 0, 134));
    for (const m of g) r = Math.max(r, Math.hypot(m.x - ox, m.z - oz) + moundRadius(m.s) + (special ? SPECIAL.margin : ISLAND.margin));
    const lobes = [{ x: ox, z: oz, r }];
    const n = Math.round(between(special ? SPECIAL.lobes : ISLAND.lobes, 0, 130));
    for (let i = 0; i < n; i++) {
      const a = draw(i, 131) * Math.PI * 2,
        d = between(ISLAND.lobeOut, i, 132) * r;
      lobes.push({ x: ox + Math.sin(a) * d, z: oz + Math.cos(a) * d, r: between(ISLAND.lobeR, i, 133) * r });
    }
    polygonLobes(lobes, (i, n) => draw(i, 300 + n)); // each lobe as a polygon too, for the beach line (beach.js)
    const peaks = Array.from({ length: 2 + Math.floor(draw(0, 135) * 3) }, (_, i) => {
      const a = draw(i, 136) * Math.PI * 2;
      const d = Math.sqrt(draw(i, 137)) * r * 0.42;
      return {
        x: ox + Math.sin(a) * d,
        z: oz + Math.cos(a) * d,
        radius: r * between([0.22, 0.4], i, 138),
        height: between([14, 34], i, 139),
        base: 1.2,
      };
    });
    const rivers = peaks.slice(0, 1 + Math.floor(draw(0, 140) * 2)).map((peak, i) => {
      const a = draw(i, 141) * Math.PI * 2;
      const length = r * 0.68;
      const points = Array.from({ length: 19 }, (_, j) => {
        const t = j / 18;
        const bend = Math.sin(t * Math.PI * 2 + draw(i, 142) * 6) * r * 0.055 * t;
        return {
          x: peak.x + Math.cos(a) * length * t - Math.sin(a) * bend,
          z: peak.z + Math.sin(a) * length * t + Math.cos(a) * bend,
        };
      });
      return { points, source: { x: peak.x, z: peak.z }, waterfall: peak.height / length > 0.48 ? 6 : -1 };
    });
    const gardenAngle = draw(0, 144) * Math.PI * 2;
    // A broader open meadow beside the island's centre, so each new island
    // gets a visible flower field rather than a small patch of daisies.
    const gardenOffset = r * 0.3;
    const gardenRadius = Math.min(r * 0.4, 52);
    g.island = {
      x: ox, z: oz, r, lobes, peaks, rivers,
      garden: {
        x: ox + Math.sin(gardenAngle) * gardenOffset,
        z: oz + Math.cos(gardenAngle) * gardenOffset,
        r: gardenRadius,
      },
    };
    // A dense island's heads notice the bird as one island (NOTICE.island)
    if (!special) for (const m of g) m.isle = g.island;
  }
  // Trees, dealt over the island (none where there is no island); whether
  // the land under each is clear of mounds, and above the water, is checked
  // where they are placed (updateScenery), since the mounds ask this very
  // cell for its heads
  g.trees = [];
  g.fauna = [];
  const ir = g.island ? g.island.r : 0;
  const wood = g.island ? Math.round(between(WOOD.per, 0, 180) * (ir / 60) ** 2 * (special ? SPECIAL.trees : 1)) : 0;
  const spot = (n, seed) => {
    if (NATURE_MODE && seed === 154 && g.island?.rivers?.length && hash(cx * 32 + n, cz, 156) < 0.34) {
      const river = g.island.rivers[Math.floor(hash(cx * 32 + n, cz, 157) * g.island.rivers.length)];
      const point = river.points[Math.floor(hash(cx * 32 + n, cz, 158) * (river.points.length - 1))];
      const a = hash(cx * 32 + n, cz, 159) * Math.PI * 2, d = 4 + hash(cx * 32 + n, cz, 160) * 13;
      return { x: point.x + Math.cos(a) * d, z: point.z + Math.sin(a) * d };
    }
    // anywhere on the island's grass, evenly
    const a = hash(cx * 32 + n, cz, seed) * Math.PI * 2,
      d = Math.sqrt(hash(cx * 32 + n, cz, seed + 1)) * (ir - 4);
    return { x: ox + Math.sin(a) * d, z: oz + Math.cos(a) * d };
  };
  for (let i = 0; i < wood; ) {
    const clumped = draw(i, 151) < WOOD.clumped;
    const n = clumped ? Math.round(between(WOOD.clump, i, 152)) : 1;
    const { x: x0, z: z0 } = spot(i, 154);
    for (let j = 0; j < n && i < wood; j++, i++) {
      const a = draw(i, 156) * Math.PI * 2,
        d = clumped ? Math.sqrt(draw(i, 157)) * WOOD.spread : 0;
      const kind = pickTreeKind(draw(i, 153)); // each tree its own kind (TREE_KINDS, by the kinds' shares), so every kind stands everywhere, clumps mixed
      const x = x0 + Math.sin(a) * d, z = z0 + Math.cos(a) * d;
      const garden = g.island?.garden;
      if (garden && Math.hypot(x - garden.x, z - garden.z) < garden.r + 8) continue;
      g.trees.push({ x, z, yaw: draw(i, 158) * Math.PI * 2, scale: between(TREES[TREE_KINDS[kind]].scale, i, 159), kind, shape: Math.floor(draw(i, 160) * TREES.shapes) });
    }
  }
  if (NATURE_MODE) {
    g.hands = [];
    if (g.island) {
      const count = 8 + Math.floor(draw(0, 193) * 10);
      const species = ["deer", "rabbit", "fox", "horse", "goat", "duck"];
      for (let i = 0; i < count; i++) {
        let kind = species[Math.floor(draw(i, 194) * species.length)];
        if (kind === "goat" && Math.max(...g.island.peaks.map((p) => p.height)) < 24) kind = "deer";
        if (kind === "duck" && !g.island.rivers.length) kind = "rabbit";
        const a = draw(i, 195) * Math.PI * 2;
        const d = Math.sqrt(draw(i, 196)) * g.island.r * 0.66;
        g.fauna.push({
          id: (Math.imul(cx + 65536, 73856093) ^ Math.imul(cz + 65536, 19349663) ^ Math.imul(i + 1, 83492791)) >>> 0,
          kind, x: ox + Math.sin(a) * d, z: oz + Math.cos(a) * d,
          scale: between(kind === "rabbit" ? [0.62, 0.92] : kind === "horse" ? [1.0, 1.28] : [0.78, 1.12], i, 197),
        });
      }
    }
    g.stones = [];
    g.fallen = [];
    g.rubble = [];
    groupMemo.set(key, g);
    return g;
  }
  // Obelisks, dealt the same way: alone or in groves, over the island
  g.stones = [];
  const stones = !g.island ? 0 : special ? Math.round(between(SPECIAL.stones, 0, 170)) : Math.round(between(STONES.per, 0, 170) * (ir / 60) ** 2);
  for (let i = 0; i < stones; ) {
    const inGrove = !special && draw(i, 171) < STONES.grove; // a special isle's few stand alone
    const n = inGrove ? Math.round(between(STONES.groves, i, 172)) : 1;
    const { x: x0, z: z0 } = spot(i, 173);
    for (let j = 0; j < n && i < stones; j++, i++) {
      const a = draw(i, 175) * Math.PI * 2,
        d = inGrove ? Math.sqrt(draw(i, 176)) * STONES.spread : 0;
      // A kind, and a height leaning short, never above a giant: the tallest that fits if it would be
      const kind = pickStoneKind(draw(i, 280), draw(i, 174)); // a lantern of some kind (OBELISKS.lit of them), or a plain stone
      const k = Math.min(Math.floor(Math.pow(draw(i, 179), STONES.bias) * OBELISKS.heights), tallestUnder(kind, STONES.scale, STONE_TOP));
      g.stones.push({ x: x0 + Math.sin(a) * d, z: z0 + Math.cos(a) * d, yaw: draw(i, 177) * Math.PI * 2, scale: STONES.scale, kind, k });
    }
  }
  // Out at sea: lanterns standing in the water in a line from the
  // formation to the nearest island, to guide the bird on (the islands'
  // cells found by their hashes alone, as groupAt deals them, so no cell
  // asks another); those that would stand on land are left out (placedStones).
  // Each of the standing lantern kinds (a fallen one would lie under the
  // water), at a height of its own: never so short its light is drowned
  const seaLit = OBELISKS.kinds.filter((kind) => LIT_KINDS.includes(kind) && kind !== "fallen");
  if (g.sea && seaLit.length) {
    let to = null,
      best = Infinity;
    const R = SEA.trail.reach;
    for (let di = -R; di <= R; di++)
      for (let dj = -R; dj <= R; dj++) {
        const nx = cx + di,
          nz = cz + dj;
        if ((!di && !dj) || !cellHeld(nx, nz)) continue;
        const x = (nx + 0.5) * GROUP.cell + (hash(nx, nz, 104) * 2 - 1) * GROUP.jitter * half,
          z = (nz + 0.5) * GROUP.cell + (hash(nx, nz, 105) * 2 - 1) * GROUP.jitter * half;
        const d = Math.hypot(x - ox, z - oz);
        if (d < best) [best, to] = [d, { x, z }];
      }
    if (to) {
      const ux = (to.x - ox) / best,
        uz = (to.z - oz) / best;
      const water = WATER_Y + ISLAND.depth; // how deep the water stands over the seabed
      for (let d = 18, i = 0; d < best - 20; d += between(SEA.trail.gap, i, 231), i++) {
        const side = (draw(i, 232) * 2 - 1) * SEA.trail.wander;
        const kind = seaLit[Math.floor(draw(i, 234) * seaLit.length)];
        const top = tallestUnder(kind, STONES.scale, STONE_TOP);
        let low = 0; // the shortest of this kind that stands `above` out of the water
        while (low < top && obeliskHeight(kind, low) * STONES.scale < water + SEA.trail.above) low++;
        const k = low + Math.floor(draw(i, 235) * (top - low + 1));
        g.stones.push({ x: ox + ux * d - uz * side, z: oz + uz * d + ux * side, yaw: draw(i, 233) * Math.PI * 2, scale: STONES.scale, kind, k, sea: true });
      }
    }
  }
  // Fallen heads, anywhere on the island's grass
  g.fallen = [];
  if (g.island) {
    const n = Math.round(between(FALLEN.per, 0, 270) * (ir / 60) ** 2);
    for (let i = 0; i < n; i++) {
      const { x, z } = spot(i, 271);
      g.fallen.push({ x, z, k: Math.floor(draw(i, 273) * FALLEN.shapes), scale: between(FALLEN.scale, i, 274), yaw: draw(i, 275) * Math.PI * 2, sink: between(FALLEN.sink, i, 276) });
    }
    // The necks they fell from, each with its head lying by it, the same size
    const m = Math.round(between(STUMPS.per, 0, 290) * (ir / 60) ** 2);
    for (let i = 0; i < m; i++) {
      const { x, z } = spot(i, 291),
        scale = between(FALLEN.scale, i, 292),
        away = between(STUMPS.head, i, 293) * scale,
        dir = draw(i, 294) * Math.PI * 2;
      g.fallen.push({ x, z, stump: true, k: Math.floor(draw(i, 295) * STUMPS.shapes), scale, yaw: draw(i, 296) * Math.PI * 2, sink: between(FALLEN.sink, i, 297) });
      g.fallen.push({ x: x + Math.cos(dir) * away, z: z + Math.sin(dir) * away, k: Math.floor(draw(i, 298) * FALLEN.shapes), scale, yaw: draw(i, 299) * Math.PI * 2, sink: between(FALLEN.sink, i, 300) });
    }
  }
  // Rubble, over the island: alone and in scatters, and its walkways
  g.rubble = [];
  if (g.island) {
    const n = Math.round(between(RUBBLE.per, 0, 240) * (ir / 60) ** 2);
    for (let i = 0; i < n; ) {
      const clumped = draw(i, 241) < RUBBLE.clumped;
      const m = clumped ? Math.round(between(RUBBLE.clump, i, 242)) : 1;
      const { x: x0, z: z0 } = spot(i, 243);
      for (let j = 0; j < m && i < n; j++, i++) {
        let pick = draw(i, 244),
          kind = RUBBLE.kinds[0][0];
        for (const [name, share] of RUBBLE.kinds) {
          kind = name;
          if ((pick -= share) < 0) break;
        }
        const a = draw(i, 245) * Math.PI * 2,
          d = clumped ? Math.sqrt(draw(i, 246)) * RUBBLE.spread : 0;
        g.rubble.push({ x: x0 + Math.sin(a) * d, z: z0 + Math.cos(a) * d, kind, k: Math.floor(draw(i, 247) * DEBRIS.shapes), scale: between(RUBBLE.scale[kind], i, 248), yaw: draw(i, 249) * Math.PI * 2, tilt: draw(i, 250) * RUBBLE.tilt, tiltDir: draw(i, 251) * Math.PI * 2, sink: between(RUBBLE.sink, i, 252) });
      }
    }
    // The walkways: each a line of discs from a point on the core's rim in
    // toward the middle, wandering a little, with gaps where discs are gone
    const W = RUBBLE.walkway;
    const ways = draw(0, 253) < W.chance ? Math.round(between(W.count, 0, 254)) : 0;
    for (let w = 0; w < ways; w++) {
      const a = draw(w, 255) * Math.PI * 2,
        len = between(W.length, w, 256) * ir,
        sc = between(W.scale, w, 257);
      const ux = -Math.sin(a),
        uz = -Math.cos(a); // inward
      const sx = ox + Math.sin(a) * (ir - 2),
        sz = oz + Math.cos(a) * (ir - 2);
      for (let d = 0, i = 0; d < len && i < 200; i++) {
        const s = 1000 + w * 256 + i;
        d += between(W.gap, s, 258) * sc;
        if (draw(s, 259) < W.missing) continue;
        const side = (draw(s, 260) - 0.5) * 2 * W.wander;
        g.rubble.push({ x: sx + ux * d - uz * side, z: sz + uz * d + ux * side, kind: "disc", k: Math.floor(draw(s, 261) * DEBRIS.shapes), scale: sc * (0.85 + 0.3 * draw(s, 262)), yaw: draw(s, 263) * Math.PI * 2, tilt: draw(s, 264) * RUBBLE.tilt * 0.5, tiltDir: draw(s, 265) * Math.PI * 2, sink: between(W.sink, s, 266) });
      }
    }
  }
  // Lone arms, anywhere on the island's grass: the special isle's own
  // count, any other island its share by area (LONE.per: none, now)
  g.hands = [];
  const lone = !g.island ? 0 : special ? Math.round(between(SPECIAL.arms, 0, 196)) : Math.round(between(LONE.per, 0, 196) * (ir / 60) ** 2);
  const dealHand = (i, scale, spots) => {
    const lying = draw(i, 198) < LONE.lying;
    g.hands.push({
      ...spots[0],
      spots, // where it may go: the first that is clear (placedLoneHands)
      yaw: draw(i, 200) * Math.PI * 2, // which way its hand faces
      tip: draw(i, 205) * Math.PI * 2, // which way it slants
      slant: lying ? between(LONE.lie, i, 206) : between(LONE.slant, i, 206),
      lying,
      out: between(LONE.out, i, 201),
      sc: between(scale, i, 202),
      lean: between(LONE.lean, i, 203),
      side: draw(i, 204) < 0.5 ? 0 : 1,
      name: POSE_NAMES[Math.floor(draw(i, 207) * POSE_NAMES.length)], // its own pose, any
    });
  };
  for (let i = 0; i < lone; i++) dealHand(i, LONE.scale, [spot(i, 197)]);
  // ...and, now and then, one giant hand, tried at a few spots
  if (g.island && draw(0, 270) < LONE.giant.chance) dealHand(900, LONE.giant.scale, Array.from({ length: LONE.giant.tries }, (_, t) => spot(900 + t, 197)));
  // Out at sea: arms reaching up out of the water about the formation
  if (g.sea)
    for (let i = 0, n = Math.round(between(SEA.arms, 0, 210)); i < n; i++) {
      const a = draw(i, 211) * Math.PI * 2,
        d = Math.sqrt(draw(i, 212)) * SEA.armRadius;
      const sc = between(SEA.armScale, i, 213);
      g.hands.push({
        x: ox + Math.sin(a) * d, z: oz + Math.cos(a) * d,
        yaw: draw(i, 214) * Math.PI * 2, tip: draw(i, 215) * Math.PI * 2, slant: between(LONE.slant, i, 216) * 0.6, lying: false,
        out: (WATER_Y + ISLAND.depth) / sc + between(SEA.emerge, i, 217), // up through the water, and its emerge out of it
        sc, lean: between(LONE.lean, i, 218), side: draw(i, 219) < 0.5 ? 0 : 1,
        name: POSE_NAMES[Math.floor(draw(i, 220) * POSE_NAMES.length)], sea: true,
      });
    }
  // ...and a stand of them close about each tall, skinny, armless head
  g.forEach((m, mi) => {
    if (m.s >= HANDS.minSize || m.neckLen / m.s < SPINDLY.from) return;
    const n = Math.round(between(STONES.around, mi, 190));
    for (let j = 0; j < n; j++) {
      const i = 4000 + mi * 32 + j;
      const a = draw(i, 191) * Math.PI * 2,
        d = between(STONES.ring, i, 192) * m.s;
      const kind = pickStoneKind(draw(i, 281), draw(i, 193));
      const k = Math.min(Math.floor(Math.pow(draw(i, 194), STONES.bias) * OBELISKS.heights), tallestUnder(kind, STONES.scale, STONE_TOP));
      g.stones.push({ x: m.x + Math.sin(a) * d, z: m.z + Math.cos(a) * d, yaw: draw(i, 195) * Math.PI * 2, scale: STONES.scale, kind, k });
    }
  });
  groupMemo.set(key, g);
  return g;
}
const worldMap = new WorldMap(document.getElementById("mini-map"), groupAt, GROUP.cell);
// The member of a nearby group that lands in this fine cell, if one does
function cellStatue(gx, gz) {
  const cx = Math.floor((gx * SPACING) / GROUP.cell),
    cz = Math.floor((gz * SPACING) / GROUP.cell);
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const g = groupAt(cx + di, cz + dj);
      if (!g) continue;
      for (const m of g) if (Math.floor(m.x / SPACING) === gx && Math.floor(m.z / SPACING) === gz) return m;
    }
  return null;
}
// The statue a cell holds, if it holds one, remembered: the terrain asks for
// every cell around every vertex, so this is asked far more than it changes
const cellMemo = new Map();
function statueAt(gx, gz) {
  const key = (gx + 0x8000) * 0x10000 + (gz + 0x8000);
  let st = cellMemo.get(key);
  if (st === undefined) {
    if (cellMemo.size > 40000) cellMemo.clear();
    st = cellStatue(gx, gz);
    cellMemo.set(key, st);
  }
  return st;
}

// Heads sprout from the ground: each pushes up a mound of earth around its
// base (MOUND in statues.js, tuned in the pillars lab). Mounds of neighbours add up.
// The mounds a cell's statue bakes into the ground: the head's. (An arm's
// mound is not baked: it rides with the arm as a dome of its own, set down
// on this ground; see the arm fill in placeHeads.) Everything that sums or
// paints mounds reads this one list
function moundsOf(gx, gz, cand) {
  if (cand.sea) return (cand.mounds ??= []); // a statue out at sea heaps no mound on the seabed
  return (cand.mounds ??= [{ x: cand.x, z: cand.z, r: moundRadius(cand.s), h: moundHeight(cand.s) }]);
}
const MAX_MOUNDED = Math.max(SPECIAL.s[1], ELDER ? ELDER.s[1] : 0, ...CLUSTER.tiers.map(([r]) => r[1])); // the biggest head that heaps a mound (the sea's heap none, and the whale is bigger than any of these: counting it made every mound lookup search 81 cells rather than 49)
const MOUND_REACH = Math.ceil(moundRadius(MAX_MOUNDED) / SPACING); // cells the biggest mound spans
function moundAt(x, z) {
  if (NATURE_MODE) return 0;
  const gx = Math.floor(x / SPACING),
    gz = Math.floor(z / SPACING);
  let h = 0;
  for (let di = -MOUND_REACH; di <= MOUND_REACH; di++) {
    for (let dj = -MOUND_REACH; dj <= MOUND_REACH; dj++) {
      const st = statueAt(gx + di, gz + dj);
      if (!st) continue;
      for (const m of moundsOf(gx + di, gz + dj, st)) {
        const t = 1 - Math.hypot(m.x - x, m.z - z) / m.r;
        if (t > 0) h += m.h * moundRise(t);
      }
    }
  }
  return h;
}


const poses = new Map();
const statues = [];
// Statues that have left their cell to follow the bird (see FOLLOW below):
// key → { gx, gz }. Their cell may fall out of range while they're still
// right behind you, so updateHeads keeps them wherever they've got to.
const followers = new Map();
// Built once per cell and kept (statueMemo): the list of statues in range
// is rebuilt every time the bird crosses a cell, and building one (ground
// lookups, clearance, dealing its arms) is what used to make that a hitch
// An armless head among the obelisks bends no further, either way, than
// keeps it short of the nearest one: its head (1.25 of its scale about the
// end of the bend) never reaches past that obelisk's side. The bend's reach
// out from the neck's axis is read off the spine (spineEnd), and the most
// curl that keeps it in found by halving
function stoneBend(h) {
  if (h.s >= HANDS.minSize) return; // the armed ones keep the stones out of their whole reach instead
  const cx = Math.floor(h.x / GROUP.cell),
    cz = Math.floor(h.z / GROUP.cell);
  let room = Infinity;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++)
      for (const st of placedStones(groupAt(cx + di, cz + dj), cx + di, cz + dj)) room = Math.min(room, Math.hypot(st.x - h.x, st.z - h.z) - st.r);
  if (!Number.isFinite(room)) return;
  const B = bendLen(neckStretch(h.neckLen, h.mound, h.s).stretch, h.bendMost);
  const reach = (c) => (spineEnd(c, B).fwd + 1.25) * h.s;
  let lo = 0,
    hi = MAX_CURL;
  if (reach(hi) <= room) return; // it can bend all the way and still not reach one
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) <= room) lo = mid;
    else hi = mid;
  }
  h.curlHi = Math.min(h.curlHi, lo);
  h.curlLo = Math.max(h.curlLo, -lo);
}
const statueMemo = new Map();
function makeStatue(gx, gz, cand, key) {
  let st = statueMemo.get(key);
  if (!st) {
    if (statueMemo.size > 6000) statueMemo.clear();
    statueMemo.set(key, (st = buildStatue(gx, gz, cand, key)));
  }
  // A follower (or one that has followed and come to rest) is where it got to
  const f = st.pose.follow;
  if (f) {
    st.x = f.x;
    st.z = f.z;
    st.ground = f.ground;
    st.mound = f.mound;
    st.neckLen = f.neckLen;
    st.curlHi = curlLimit(st, MAX_CURL);
    st.curlLo = curlLimit(st, -0.9);
  }
  return st;
}
function buildStatue(gx, gz, cand, key) {
  const { x, z } = cand;
  let pose = poses.get(key);
  if (!pose) {
    // Planted facing the bird as it first comes in sight; an attendant, its colossus
    const facing = cand.face ? Math.atan2(cand.face.x - x, cand.face.z - z) : Math.atan2(player.position.x - x, player.position.z - z);
    pose = {
      turn: facing, // where the head faces
      // The statue itself never turns: its foot keeps the facing it was
      // planted with, and every turn since
      // wrings the head round on its neck (the twist lane). Kept unwrapped, so
      // the neck never snaps through a half turn. (A sea head is the one
      // exception: it turns about its foot as it rises, from yaw0)
      yaw: facing,
      yaw0: facing,
      twistTurn: 0,
      curl: 0.1,
      born: performance.now() / 1000,
    };
    poses.set(key, pose);
  }
  // The neck is in world units; its floor just keeps the chin off the ground
  const s = cand.s;
  // (x, z) is the foot of the neck: the mound is centred on it, the arms
  // are dealt round it, the ground and its slope are read there, and the
  // head's origin is set back from it by RCZ (updateHeads, headSpot)
  const st = {
    x,
    z,
    pose,
    ground: cand.ground ?? getHeight(x, z), // (out at sea, the foot may be set below the bed: SEA)
    mound: moundAt(x, z), // how much of that is mound: the foot is buried this much deeper
    s,
    neckLen: cand.sea ? cand.neckLen : Math.max(cand.neckLen, CHIN_DEPTH * s + CLEARANCE), // (out at sea, the head may sit as low as the water has it)
    sea: cand.sea ? { still: !!cand.still, sunk: cand.neckLen, rise: cand.riseLen, turn: (hash(gx, gz, 23) < 0.5 ? -1 : 1) * (SEA.turn[0] + hash(gx, gz, 24) * (SEA.turn[1] - SEA.turn[0])) } : null,
    bendMost: cand.bendMost, // out at sea, a longer bend (SEA.bend)
    leanCurl: cand.lean ?? 0, // out at sea: its neck at rest, half under, and lifted out as the bird comes over (placeHeads); an attendant's, looking up at its colossus
    devout: !!cand.devout, // an attendant: it never heeds the bird
    isle: cand.isle ?? null, // the dense island it stands on: it notices the bird with the island (NOTICE.island)
    tempo: TEMPO.on ? TEMPO.at / s : 1, // how fast it may turn and nod, against the top speeds (TEMPO)
    speed: TEMPO.on ? (TEMPO.range[0] + hash(gx, gz, 7) * (TEMPO.range[1] - TEMPO.range[0])) * (TEMPO.at / s) : 0.8 + hash(gx, gz, 7) * 2.2,
    variant: Math.floor(hash(gx, gz, 9) * variants.length),
    id: 1 + Math.floor(hash(gx, gz, 22) * 1000), // the shaders' per-statue hashes key on this, so its stains stay put however the instance moves
    key,
    gx,
    gz,
    twist: 0,
    taper: 0,
    wobble: 0,
  };
  const whale = st.sea && !st.sea.still;
  st.curlHi = whale ? SEA.curl : curlLimit(st, MAX_CURL); // the whale, as far as it likes: what it would bump is under water; a knot's head keeps its chin off the bed, as a land head keeps off its grass
  st.curlLo = whale ? -0.9 : curlLimit(st, -0.9);
  stoneBend(st); // an armless head bends no further than its nearest obelisk
  st.arms = armsOf(gx, gz, cand, pose.yaw); // in front of the face, as planted
  // The statues close enough that this head could bend onto their arms (or they onto its): their keys, for capsNear
  st.neighbours = [];
  for (const o of othersNear(gx, gz, cand)) if (Math.hypot(o.x - x, o.z - z) < st.neckLen + 4 * s + 8 * o.s) st.neighbours.push(o.gx + "," + o.gz);
  return st;
}
// The arms around a statue's foot, dealt once from its cell (so they never
// move): a pair, one each side of the face, reaching forward the way the
// statue was planted facing. Dealt exactly as the pillars lab deals them:
// HANDS.count arms, each with its own pose (HANDS.pose, or any when
// "mixed"), side, bearing round the foot, facing and reach. Each stands
// on its elbow at the pose's height with the upper arm stretched down into
// the earth, and is kept clear of the head as it stands upright (a bent
// head may still come down over one).
// The hands reach for the bird, as the head watches it: while it is within
// the statue's notice (NOTICE), each forearm turns toward it and folds to
// point at its height, reaching again as it moves round, sometimes changing
// pose as it starts, and shifting every few seconds even when it hangs
// still. Further out they hold where they are.
const sounds = new Sounds(); // the statues' grinding and scraping (sounds.js); M mutes
const HANDS_MOVE = true; // false holds the hands in their rest pose
// J toggles the jitter log: once a second it prints how many times, over
// all the arms, a fold (the move), a press, a lift (the ground) or a turn
// reversed direction between one frame and the next, and the same for the
// heads' nod (curl) and turn. A shimmer is made of reversals, so the count
// says which part is shaking, with no screenshot. Off, it costs nothing.
let jitterLog = false;
const jitter = { curl: 0, press: 0, lift: 0, yaw: 0, nod: 0, turn: 0, at: 0 };
// How far off a statue notices the bird. Within its radius it watches,
// bends after it and its hands reach for it; outside it stands as planted.
// Bigger statues notice from further: the radius grows with the head's size.
const NOTICE = {
  radius: [30, 8], // world units: a base, plus this much per unit of head scale (a small head ~62, a large ~86, a colossus ~126)
  edge: 0.25, // the outer share of the radius over which its attention fades in, so there is no line to flicker across
  island: true, // a dense island's heads measure the bird from the island's edge, not each from itself, so the whole crowd notices it in the same moment (the elder, with its longer radius, a little before). Off: each from itself, a wave across the island
};
const noticeRadius = (s) => NOTICE.radius[0] + NOTICE.radius[1] * s;
const REST_CURL = 0.1; // the neck's curl with nothing to look at (what a statue is planted with)
// How a hand goes after the bird (the arm fill in placeHeads): it turns
// about the wrist to face it, tips toward its height, and closes its
// fingers as it comes near; the arm itself never moves
const GRAB = {
  swing: 1.6, // radians either way of its rest the hand may turn
  follow: 2.5, // per second: how quickly it follows the bird
  settle: 0.8, // per second: how quickly it settles back to the sky after
  speed: 1.8, // radians a second it turns or tips, at most
  open: 2.5, // arm scales from the wrist (an arm scale is about a tenth of a big statue: ~10 world units): the bird further than this, the hand is open
  close: 1, // ...and nearer than this, closed fast (was 6 and 1.8: the hands sat clenched whenever the bird was about)
  close_rate: 4, // per second: how quickly the fingers follow
  pose: "fist", // what the fingers close to
};
// A head coming down over a hand presses it flat (hands.js HANDS.press,
// pressRate, pressRelax, tuned in the pillars lab): the hand folds further
// at the elbow so the forearm and hand lower toward the ground. The elbow
// never moves and the hand is never pushed forward or lifted: it only
// turns about the elbow, and only as far as lying on the ground. As the
// head lifts away the hand eases back up to where its move had it.
const segDist = (ax, ay, az, bx, by, bz, px, py, pz) => {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / Math.max(1e-9, dx * dx + dy * dy + dz * dz), 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t, pz - az - dz * t);
};
// The closest two capsules come, less their radii (< 0: they overlap).
// Each is { ax, ay, az, tx, ty, tz, r }: a segment and its thickness
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _rr = new THREE.Vector3();
function capGap(A, C) {
  _d1.set(A.tx - A.ax, A.ty - A.ay, A.tz - A.az);
  _d2.set(C.tx - C.ax, C.ty - C.ay, C.tz - C.az);
  _rr.set(A.ax - C.ax, A.ay - C.ay, A.az - C.az);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_rr);
  let sA, sC;
  if (a < 1e-9 && e < 1e-9) (sA = 0), (sC = 0);
  else if (a < 1e-9) (sA = 0), (sC = THREE.MathUtils.clamp(f / e, 0, 1));
  else {
    const c = _d1.dot(_rr);
    if (e < 1e-9) (sC = 0), (sA = THREE.MathUtils.clamp(-c / a, 0, 1));
    else {
      const b = _d1.dot(_d2), den = a * e - b * b;
      sA = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      sC = (b * sA + f) / e;
      if (sC < 0) (sC = 0), (sA = THREE.MathUtils.clamp(-c / a, 0, 1));
      else if (sC > 1) (sC = 1), (sA = THREE.MathUtils.clamp((b - c) / a, 0, 1));
    }
  }
  const dx = A.ax + _d1.x * sA - (C.ax + _d2.x * sC),
    dy = A.ay + _d1.y * sA - (C.ay + _d2.y * sC),
    dz = A.az + _d1.z * sA - (C.az + _d2.z * sC);
  return Math.hypot(dx, dy, dz) - A.r - C.r;
}
const armDummy = new THREE.Object3D();
// The arms are dealt once per cell and kept on the cell's member, since
// the mounds they push up (moundsOf) are part of the ground itself
function armsOf(gx, gz, cand, facing) {
  if (!cand.arms || cand.arms.facing !== facing) {
    cand.arms = dealArms(gx, gz, cand, cand.s, facing);
    cand.arms.facing = facing;
  }
  return cand.arms;
}
// The head's own mound under a spot (a statue's arms are dealt against
// this rather than the whole ground, which would ask for the arms' own
// mounds and go round in a circle)
function ownMound(cand, px, pz) {
  const t = 1 - Math.hypot(cand.x - px, cand.z - pz) / moundRadius(cand.s);
  return t > 0 ? moundHeight(cand.s) * moundRise(t) : 0;
}
// How much each statue's arms differ from the lab's deal (HANDS): each
// statue draws its own spread and turn for its whole set, and each
// arm more play in its bearing and its elbow than the lab gives
const HAND_GROW = 1.4; // how much bigger a statue's hands are than the lab's size for its head (the lone hands have their own scale, LONE.scale)
const ARM_VARY = {
  spread: [0.4, 1.7], // times HANDS.spread, per statue: hands close in under the chin, or thrown wide
  turn: 0.5, // radians the whole set may sit round from the facing, either way, per statue
  loose: 2, // times HANDS.loose, per arm
  curl: 0.45, // radians either way the elbow's rest bend may differ from its pose's, per arm
};
const ARM_SOLID = [[0, 0.35], [0.75, 0.3], [FOREARM, 0.35], [FOREARM + 0.7, 0.55]]; // what the bird bumps into above the column: [head units up from the wrist, radius] (FOREARM is 0: the joint is the wrist), the wrist to the middle of the hand
const pickIn = ([lo, hi], u) => lo + u * (hi - lo); // a range at a draw (the cell's own, so the deal never changes)
// The other statues in the cells about a statue's (NEIGHBOUR_CELLS out), each with its cell
const NEIGHBOUR_CELLS = 3;
function othersNear(gx, gz, cand) {
  const out = [];
  for (let i = -NEIGHBOUR_CELLS; i <= NEIGHBOUR_CELLS; i++)
    for (let j = -NEIGHBOUR_CELLS; j <= NEIGHBOUR_CELLS; j++) {
      const o = (i || j) && statueAt(gx + i, gz + j);
      if (o && o !== cand) out.push({ ...o, gx: gx + i, gz: gz + j });
    }
  return out;
}
function dealArms(gx, gz, cand, s, facing) {
  const arms = [];
  if (!HANDS.count || !(HANDS.onStatues || cand.armed) || s < HANDS.minSize) return arms; // the small heads have none (and, onStatues off, no head has: the arms come up out of the ground on their own)
  const { x, z } = cand;
  const neckLen = Math.max(cand.neckLen, CHIN_DEPTH * s + CLEARANCE);
  const ground = landHeight(x, z) + ownMound(cand, x, z);
  // The head, upright, as a sphere: what the arms keep clear of at rest
  const head = { x, y: ground + neckLen - 0.1 * s, z, r: 1.25 * s }; // upright, the head sits over the foot
  // The neighbours as they stand upright: each neck as a post from its
  // ground, and its head over it; an arm is dealt clear of those too
  const others = othersNear(gx, gz, cand).map((o) => {
    const og = landHeight(o.x, o.z),
      on = Math.max(o.neckLen, CHIN_DEPTH * o.s + CLEARANCE);
    return { x: o.x, z: o.z, g: og, top: og + on - 0.1 * o.s, neckR: RING_R * o.s, headR: 1.25 * o.s };
  });
  // The arms already standing about it, at rest: its neighbours' that are
  // built (whichever statue comes second keeps clear of the first), and
  // this statue's own as they're dealt
  const standing = [];
  for (const o of othersNear(gx, gz, cand)) for (const arm of statueMemo.get(o.gx + "," + o.gz)?.arms ?? []) standing.push(arm.post, arm.rest);
  const sc = s * armSize() * 0.85 * HAND_GROW; // a hand (1.45 head units long as built) about as long as the face at size 1, and never under HAND_MIN of the head; then grown (HAND_GROW)
  const own = (n) => hash(gx, gz, 90 + n); // the statue's own draws, shared by its arms
  const H = { ...HANDS, spread: HANDS.spread * pickIn(ARM_VARY.spread, own(0)), loose: HANDS.loose * ARM_VARY.loose };
  const setFacing = facing + (own(1) * 2 - 1) * ARM_VARY.turn;
  // Each arm's pose and rest bend, dealt first: the hands all stand the
  // same distance from the foot, as far out as the most folded one needs
  // (its elbow sits furthest back), so that is known before any is placed
  const plans = Array.from({ length: HANDS.count }, (_, k) => {
    const draw = (n) => hash(gx, gz, 40 + n + k * 8); // each arm its own draws
    const rest = armRest(HANDS, draw(1), draw(5), ARM_VARY.curl); // reaching for the sky, or its own pose (HANDS.sky)
    const name = rest.name,
      curl = THREE.MathUtils.clamp(rest.curl, HANDS.sky ? 0.05 : 0.15, MAX_CURL);
    return { draw, name, curl };
  });
  const reachFrom = Math.max(...plans.map((p) => (RING_R + HANDS.gap) * s + 0.35 * sc + Math.sin(p.curl) * FOREARM * sc));
  // each arm its own reach (below), the statue its one rise
  for (let k = 0; k < HANDS.count; k++) {
    const { draw, name, curl } = plans[k];
    const hp = HAND_POSES[name];
    // The hand at any bearing round the foot, facing roughly away from the
    // neck, give or take; clear of the neck's wall by its own radius, then
    // the reach (the lab's draws)
    const { a, yaw } = handBearing(k, setFacing, draw, H); // a pair in front of the face, toed in a little
    const reachAt = reachFrom + pickIn(HANDS.reach, draw(3)) * s; // this arm's own distance out
    const up = elbowUp(hp, neckLen / s, own(3)); // the elbow, head units above the ground, at rest (lifted with the neck by HANDS.rise)
    const sy = Math.sin(yaw),
      cy = Math.cos(yaw);
    // The spot is the hand's: the wrist stands here whatever the pose, and
    // the elbow sits back from it under the forearm (as the lab places
    // them). Nudged outward a few times if the arm would meet the head.
    // The elbow sits back from the hand's spot by the folded forearm's run
    // along the ground, and the upper arm comes up out of the earth there:
    // HANDS.gap out from the neck's wall, plus its own radius, so no arm
    // comes up through the neck. (Without
    // this a flat hand at the shortest reach had its elbow behind the
    // neck's axis, the upper arm up through the neck itself.) The reach is
    // measured from there: from the furthest any of the statue's arms needs
    // (reachFrom), so every hand stands as far out as the others.
    const back = Math.sin(curl) * FOREARM * sc;
    for (let d = reachAt, t = 0; t < 6; d += 0.35 * s, t++) {
      const hx = x + Math.sin(a) * d,
        hz = z + Math.cos(a) * d;
      const ax = hx - sy * back,
        az = hz - cy * back;
      const g = landHeight(ax, az) + ownMound(cand, ax, az);
      const ey = g + up * sc; // the elbow, world
      // The arm at rest as a capsule: from the ground under the elbow, up to
      // the elbow, then along the folded forearm and hand to the fingertip
      const L = FOREARM + 1.45; // and a hand, head units
      const tx = ax + sy * Math.sin(curl) * L * sc,
        ty = ey + Math.cos(curl) * L * sc,
        tz = az + cy * Math.sin(curl) * L * sc;
      const armR = 0.5 * sc;
      const clear =
        segDist(ax, g, az, ax, ey, az, head.x, head.y, head.z) > head.r + armR &&
        segDist(ax, ey, az, tx, ty, tz, head.x, head.y, head.z) > head.r + armR &&
        others.every(
          (o) =>
            segDist(ax, ey, az, tx, ty, tz, o.x, o.top, o.z) > o.headR + armR && // their head
            Math.hypot(ax - o.x, az - o.z) > o.neckR + armR && // their neck, against the upper arm...
            (Math.min(ey, ty) > o.top || Math.max(ey, ty) < o.g || segDist(ax, 0, az, tx, 0, tz, o.x, 0, o.z) > o.neckR + armR), // ...and the forearm, seen from above where their heights meet
        );
      if (!clear) continue;
      const post = { ax, ay: g, az, tx: ax, ty: ey, tz: az, r: armR }, // the upper arm, out of the earth to the elbow
        rest = { ax, ay: ey, az, tx, ty, tz, r: armR }; // the forearm and hand, at rest
      if (!standing.every((c) => capGap(post, c) > 0 && capGap(rest, c) > 0)) continue;
      standing.push(post, rest);
      arms.push({
        post,
        rest,
        name, // the pose at rest
        side: thumbSide(hx - x, hz - z, yaw), // whichever hand puts its thumb toward the neck
        hx, hz, sc, yaw, up, curl, // the hand's spot, its scale, and its rest
        elbow: elbowTan(HANDS, draw(7)), // its fixed elbow lean (the lane's tangent), its own
        ex: ax, ez: az, // where the upper arm comes out of the earth at rest: its mound is here
      });
      break;
    }
  }
  return arms;
}
function updateHeads(tx, tz) {
  if (NATURE_MODE) return;
  statues.length = 0;
  const keep = new Set();
  for (let i = -RANGE; i <= RANGE; i++) {
    for (let j = -RANGE; j <= RANGE; j++) {
      const gx = tx + i,
        gz = tz + j;
      const cand = statueAt(gx, gz);
      if (!cand) continue;
      const { x, z } = cand;
      if (x * x + z * z < 64) continue;
      const key = gx + "," + gz;
      keep.add(key);
      statues.push(makeStatue(gx, gz, cand, key));
    }
  }
  // Followers out of their cell's range: kept while they're near the bird
  for (const [key, { gx, gz }] of followers) {
    if (keep.has(key)) continue;
    const f = poses.get(key)?.follow;
    if (!f || Math.hypot(f.x - player.position.x, f.z - player.position.z) > RANGE * SPACING) {
      followers.delete(key);
      continue;
    }
    keep.add(key);
    statues.push(makeStatue(gx, gz, statueAt(gx, gz), key));
  }
  for (const key of poses.keys()) if (!keep.has(key)) poses.delete(key);
}

await loading("waking the followers", 0.78); // a step of the bar, so it does not sit still through the rest of the field

// =====================================================================
// Followers
// =====================================================================
// Every so often a few statues take an interest and come after the bird.
// Runners pull their necks in to a stump and come bounding over the ground,
// hopping with each stride and waddling as they go. Floaters lift clean out
// of the earth, their root pinched to a point beneath them, and drift up
// after you into the sky, wringing their necks slowly as they hang there.
// After a while they lose interest: they stop where they are, fade away into
// the haze, and condense back on their own mound as if they had never left.
// They keep out of each other's way, and out of everyone else's, by pushing
// apart from anything they'd overlap. Everything they do goes through the
// same rigid placement and shader attributes as any statue.
const MAX_TWIST = 1.3; // radians the head can wring either side of its planted facing (about 75°)
const FOLLOW = {
  on: false, // off: nothing leaves its mound (the hands do the reaching now)
  every: 45, // seconds, on average, between one group giving up and the next setting off
  count: [3, 5], // how many at a time
  duration: [25, 50], // seconds a group keeps it up
  fade: 3, // seconds to fade away once it has lost interest
  pick: [20, 90], // world units from the bird a statue may be picked from
  apart: 1.4, // how much room they keep from anything else, per unit of the two sizes added
  maxSize: 5.5, // the big ones may come after you; the massive and colossal stay put
  run: {
    speed: [6, 11], // world units per second
    distance: 5, // how close they come (plus their size)
    hop: 0.3, // hop height, per unit of head size
    stride: 2.6, // hops per second
    waddle: 0.18, // radians of side-to-side turn per hop
    lean: 0.35, // extra curl forward while running
    neck: 0.5, // world units of neck left above the chin clearance
  },
  float: {
    height: [2, 6], // world units above the bird they hang
    distance: 7, // how far behind (plus their size)
    ease: 0.9, // how quickly they close on where they want to be (per second)
    bob: 0.5, // world units of slow rise and fall
    neck: 2.5, // world units of root they lift out with
    twist: 0.7, // radians the head wrings away from the root, back and forth
    rise: 4, // world units per second lifting off, and sinking back
    taper: 1, // the root pinched to a point
  },
};
const between = ([lo, hi]) => lo + Math.random() * (hi - lo);
let nextFollowAt = between([15, FOLLOW.every]);
function maybeStartFollowing(now) {
  if (!FOLLOW.on || now < nextFollowAt) return;
  if (followers.size) return; // one group at a time
  const picks = statues.filter((h) => {
    const d = Math.hypot(h.x - player.position.x, h.z - player.position.z);
    return !h.pose.follow && !h.sea && h.s <= FOLLOW.maxSize && d >= FOLLOW.pick[0] && d <= FOLLOW.pick[1] && now - h.pose.born > FADE_IN;
  });
  if (picks.length < FOLLOW.count[0]) {
    nextFollowAt = now + 5;
    return;
  }
  const n = Math.min(picks.length, Math.round(between(FOLLOW.count)));
  const until = now + between(FOLLOW.duration);
  for (let k = 0; k < n; k++) {
    const h = picks.splice(Math.floor(Math.random() * picks.length), 1)[0];
    // a mix: the first two split one each way, the rest choose
    const kind = k === 0 ? "run" : k === 1 ? "float" : Math.random() < 0.5 ? "run" : "float";
    h.pose.follow = {
      kind,
      x: h.x,
      z: h.z,
      ground: h.ground,
      mound: h.mound,
      neckLen: h.neckLen,
      until,
      phase: Math.random() * Math.PI * 2,
      speed: between(FOLLOW.run.speed),
      hang: between(FOLLOW.float.height),
      lifted: 0, // floaters: how far their base has left the ground
      gone: 0, // how far through its fade-out it is
    };
    followers.set(h.key, { gx: h.gx, gz: h.gz });
  }
  nextFollowAt = until + between([FOLLOW.every * 0.5, FOLLOW.every * 1.5]);
}
// Keep a follower out of everything else: pushed straight away from any
// statue it would overlap, unless one stands wholly above the other
function keepApart(h, f) {
  for (const o of statues) {
    if (o === h || o.gone) continue;
    const dx = f.x - o.x,
      dz = f.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = FOLLOW.apart * (h.s + o.s);
    if (d >= min) continue;
    if (f.ground > o.ground + o.neckLen + 1.5 * o.s) continue; // it hangs above the other's head
    if (o.ground > f.ground + f.neckLen + 1.5 * h.s) continue; // the other hangs above it
    if (d < 1e-3) {
      f.x += min * Math.cos(f.phase);
      f.z += min * Math.sin(f.phase);
    } else {
      f.x += (dx / d) * (min - d);
      f.z += (dz / d) * (min - d);
    }
  }
}
// Back on its own mound, condensing out of the haze there (or simply gone,
// when home is out of range: updateHeads brings it back with the cell)
function goHome(h, pose, now) {
  pose.follow = undefined;
  followers.delete(h.key);
  const cand = statueAt(h.gx, h.gz);
  h.x = cand.x;
  h.z = cand.z;
  h.ground = getHeight(h.x, h.z);
  h.mound = moundAt(h.x, h.z);
  h.neckLen = Math.max(cand.neckLen, CHIN_DEPTH * h.s + CLEARANCE);
  h.twist = h.taper = h.wobble = h.leanCurl = 0;
  h.fadeMul = 1;
  h.curlHi = curlLimit(h, MAX_CURL);
  h.curlLo = curlLimit(h, -0.9);
  stoneBend(h);
  pose.born = now;
  pose.curl = 0.1;
  if (Math.hypot(h.x - player.position.x, h.z - player.position.z) > RANGE * SPACING) {
    h.gone = true;
    poses.delete(h.key);
  }
}
// One follower's step: moves the statue, and sets its neck, twist, taper and gait
function stepFollow(h, f, delta, now) {
  const R = FOLLOW.run,
    F = FOLLOW.float;
  const stumpNeck = CHIN_DEPTH * h.s + CLEARANCE + (f.kind === "run" ? R.neck : F.neck);
  const keen = now < f.until;
  f.neckLen += (stumpNeck - f.neckLen) * Math.min(1, delta * 1.5);
  let above = 0; // how far its base sits over the ground
  if (f.kind === "run") {
    // Neck in, then run; when it's lost interest, finish the hop and stand
    const dx = player.position.x - f.x,
      dz = player.position.z - f.z;
    const d = Math.hypot(dx, dz);
    const want = R.distance + h.s;
    const running = keen && d > want && Math.abs(stumpNeck - f.neckLen) < 0.5;
    const stride = delta * R.stride * Math.PI;
    if (running) {
      const step = Math.min(f.speed * delta, d - want);
      f.x += (dx / d) * step;
      f.z += (dz / d) * step;
      f.phase += stride;
    } else {
      f.phase = Math.min(Math.ceil(f.phase / Math.PI) * Math.PI, f.phase + stride);
    }
    above = R.hop * h.s * Math.abs(Math.sin(f.phase));
    h.wobble = running ? R.waddle * Math.sin(f.phase) : 0;
    h.leanCurl = running ? R.lean : 0;
    h.twist = 0;
    h.taper = 0;
  } else {
    // Lift off, then hang above and behind the bird; when it's lost
    // interest it just hangs where it is
    const dx = f.x - player.position.x,
      dz = f.z - player.position.z;
    const d = Math.max(Math.hypot(dx, dz), 1e-3);
    const want = F.distance + h.s;
    const landY = getHeight(f.x, f.z);
    if (keen) {
      const tx = player.position.x + (dx / d) * want,
        tz = player.position.z + (dz / d) * want;
      const k = Math.min(1, delta * F.ease);
      f.x += (tx - f.x) * k;
      f.z += (tz - f.z) * k;
    }
    // ease toward the height it wants, never faster than `rise`
    const ty = player.position.y + f.hang + F.bob * Math.sin(now * 0.9 + f.phase);
    const dl = Math.max(0, ty - landY) - f.lifted;
    f.lifted += THREE.MathUtils.clamp(dl * Math.min(1, delta * 1.5), -F.rise * delta, F.rise * delta);
    above = f.lifted;
    const up = Math.min(1, f.lifted / 2); // twist and taper come in as it leaves the ground
    h.twist = F.twist * Math.sin(now * 0.7 + f.phase) * up;
    h.taper = F.taper * up;
    h.wobble = 0;
    h.leanCurl = 0;
  }
  f.ground = getHeight(f.x, f.z) + above;
  keepApart(h, f);
  f.ground = getHeight(f.x, f.z) + above;
  f.mound = moundAt(f.x, f.z);
  // Lost interest: fade away, then home
  if (!keen) f.gone = Math.min(1, f.gone + delta / FOLLOW.fade);
  h.fadeMul = 1 - f.gone;
  h.x = f.x;
  h.z = f.z;
  h.ground = f.ground;
  h.mound = f.mound;
  if (Math.abs(h.neckLen - f.neckLen) > 1e-4) {
    h.neckLen = f.neckLen;
    h.curlHi = curlLimit(h, MAX_CURL);
    h.curlLo = curlLimit(h, -0.9);
  }
  if (f.kind === "float" && f.lifted > 0.5) {
    h.curlHi = MAX_CURL; // nothing under it to bump
    h.curlLo = -0.9;
  }
  if (f.gone >= 1) goHome(h, h.pose, now);
}

const fwdDir = new THREE.Vector3();
// The bird this visit: one of albatross.js's VARIANTS at random, laid over
// ALBATROSS as the albatross tab last set it
const BIRD = withVariant(loadSavedAlbatross(), pickVariant());
const BIRD_R = 0.7 * BIRD.size; // the bird's collision radius

// Where a point localZ along the head's forward axis lands in world x/z: the
// foot faces pose.yaw, and the head is wrung round from it by the twist about
// the neck's own axis (RCZ), so the offset turns about that axis, not the
// origin. (h.x, h.z) is that axis, the foot: the point is measured from it
function headSpot(h, pose, localZ, out) {
  const th = pose.twistTurn + h.wobble,
    lz = localZ - RCZ;
  const ox = Math.sin(th) * lz,
    oz = Math.cos(th) * lz;
  const cy = Math.cos(pose.yaw),
    sy = Math.sin(pose.yaw);
  return out.set(h.x + (ox * cy + oz * sy) * h.s, 0, h.z + (-ox * sy + oz * cy) * h.s);
}
// A point on the statue's spine in world space, for collision and aiming
function spinePoint(h, curl, B, t, out) {
  const sp = spineEnd(curl, B, t);
  const localY = STRETCH_FROM - B + sp.up;
  const localZ = RCZ + sp.fwd;
  headSpot(h, h.pose, localZ, out);
  out.y = h.ground + h.neckLen + localY * h.s;
  return out;
}
// Push the bird out of a sphere, if it's inside
const toBird = new THREE.Vector3(),
  probe = new THREE.Vector3();
function pushOut(center, radius) {
  toBird.subVectors(player.position, center);
  const d = toBird.length();
  if (d >= radius || d === 0) return;
  player.position.addScaledVector(toBird, (radius - d) / d);
}

// Arms and heads keep out of each other. An arm is a capsule from its
// elbow along the forearm to the fingertips (S.cap, refreshed each frame);
// a head is the sphere the bird bumps (1.25 of its scale) and the top of
// its bend. A head won't take a step that drives it further into any arm
// near it, its own or a neighbour's (h.neighbours), and an arm reaches only
// where it clears its own head as it stands.
const ARM_LEN = FOREARM + 1.45, // elbow to fingertips, head units
  ARM_R = 0.5; // the capsule's radius, of the arm's scale
const clashHead = new THREE.Vector3(),
  clashBend = new THREE.Vector3();
function capsNear(h) {
  const caps = [];
  for (const S of h.pose.arms ?? []) if (S.cap) caps.push(S.cap);
  for (const key of h.neighbours) for (const S of poses.get(key)?.arms ?? []) if (S.cap) caps.push(S.cap);
  return caps;
}
// How far the head, as its pose stands, is into the deepest of `caps` (<= 0: clear)
function clashDepth(h, B, caps) {
  const end = spineEnd(h.pose.curl, B);
  const c = Math.cos(h.pose.curl),
    si = Math.sin(h.pose.curl);
  headSpot(h, h.pose, RCZ + end.fwd - STRETCH_FROM * si - RCZ * c, clashHead);
  clashHead.y = h.ground + h.neckLen + (STRETCH_FROM - B + end.up - STRETCH_FROM * c + RCZ * si) * h.s;
  spinePoint(h, h.pose.curl, B, 0.8, clashBend);
  let worst = -Infinity;
  for (const k of caps) {
    worst = Math.max(
      worst,
      1.25 * h.s + k.r - segDist(k.ax, k.ay, k.az, k.tx, k.ty, k.tz, clashHead.x, clashHead.y, clashHead.z),
      0.8 * h.s + k.r - segDist(k.ax, k.ay, k.az, k.tx, k.ty, k.tz, clashBend.x, clashBend.y, clashBend.z),
    );
  }
  return worst;
}
// An arm's capsule at a yaw and fold, its elbow at (ax, ay, az)
function armCap(arm, ax, ay, az, yaw, curl, out = {}) {
  const fs = Math.sin(curl) * arm.sc * ARM_LEN;
  out.ax = ax;
  out.ay = ay;
  out.az = az;
  out.tx = ax + Math.sin(yaw) * fs;
  out.ty = ay + Math.cos(curl) * arm.sc * ARM_LEN;
  out.tz = az + Math.cos(yaw) * fs;
  out.r = ARM_R * arm.sc;
  return out;
}
// What a statue's arms keep out of as they turn: the arms about it (its
// own and its neighbours', as capsules), and the obelisks and lanterns in
// their reach, each a capsule from its foot to its top
function armBlockers(h) {
  const caps = capsNear(h);
  if (!h.arms.length) return caps;
  const far = Math.max(...h.arms.map((a) => Math.hypot(a.ex - h.x, a.ez - h.z) + (ELBOW_DOWN + ARM_LEN + ARM_R) * a.sc));
  for (const st of liveStones)
    if (Math.hypot(st.x - h.x, st.z - h.z) < far + st.r) caps.push((st.cap ??= { ax: st.x, ay: st.y, az: st.z, tx: st.x, ty: st.y + obeliskHeight(st.kind, st.k) * st.s, tz: st.z, r: st.r }));
  return caps;
}
// How far an arm, turned and folded so, is into the deepest of `caps`
// (<= 0: clear): its column, out of the earth to the wrist, and the hand
// from the wrist to the fingertips. `self` (its own capsule) is skipped
const _colCap = {},
  _handCap = {};
function armClash(arm, base, turn, curl, caps, self) {
  const yaw = arm.yaw + turn,
    lean = arm.elbow * ELBOW_DOWN * arm.sc;
  const wx = arm.ex + Math.sin(yaw) * lean,
    wy = base + arm.up * arm.sc,
    wz = arm.ez + Math.cos(yaw) * lean;
  Object.assign(_colCap, { ax: arm.ex, ay: base, az: arm.ez, tx: wx, ty: wy, tz: wz, r: ARM_R * arm.sc });
  armCap(arm, wx, wy, wz, yaw, curl, _handCap);
  let worst = -Infinity;
  for (const c of caps) if (c !== self) worst = Math.max(worst, -capGap(_colCap, c), -capGap(_handCap, c));
  return worst;
}

function placeHeads(delta) {
  if (NATURE_MODE) return;
  for (const f of fieldsNow()) f.count = 0; // refilled below, each mesh in its own order
  const now = performance.now() / 1000;
  if (jitterLog && now - jitter.at >= 1) {
    console.log(`arm reversals: fold ${jitter.curl}  press ${jitter.press}  lift ${jitter.lift}  turn ${jitter.yaw}   head reversals: nod ${jitter.nod}  turn ${jitter.turn}`);
    jitter.curl = jitter.press = jitter.lift = jitter.yaw = jitter.nod = jitter.turn = 0;
    jitter.at = now;
  }
  maybeStartFollowing(now);
  statues.forEach((h) => {
    const pose = h.pose;
    if (pose.follow) stepFollow(h, pose.follow, delta, now);
    if (h.gone) return;
    const age = now - pose.born;
    // Eased in and out, so the statue neither pops nor lingers; a follower
    // that has lost interest fades the other way
    const fade = THREE.MathUtils.smoothstep(age, 0, FADE_IN) * (h.fadeMul ?? 1);
    // Out at sea: the head sits under the water until the bird comes near
    // (SEA.wake), then its neck lifts it out, slowly (SEA.climb), turning
    // about its foot as it comes (SEA.turn), and rumbling as it moves
    if (h.sea && !h.sea.still) {
      const d = Math.hypot(h.x - player.position.x, h.z - player.position.z);
      if (d < SEA.wake[0] + SEA.wake[1] * h.s) h.sea.up = true;
      const gone = d > HAZE.far + SEA.hidden * h.s; // past seeing
      if (gone) h.sea.up = false;
      const was = h.neckLen;
      if (gone) h.neckLen = h.sea.sunk; // back under at once, unseen
      else {
        const step = ((h.sea.up ? h.sea.rise : h.sea.sunk) - h.neckLen) * (1 - Math.exp(-delta * SEA.rate));
        h.neckLen += THREE.MathUtils.clamp(step, -SEA.climb * delta, SEA.climb * delta);
      }
      const risen = THREE.MathUtils.clamp((h.neckLen - h.sea.sunk) / Math.max(1e-6, h.sea.rise - h.sea.sunk), 0, 1);
      pose.yaw = pose.yaw0 + h.sea.turn * risen;
      sounds.rumble(h.key, h.x, h.ground + h.neckLen, h.z, h.s, gone ? 0 : Math.abs(h.neckLen - was) / Math.max(delta, 1e-3) / SEA.climb); // (silent, dropping back out of sight)
    }
    const { stretch, bury } = neckStretch(h.neckLen, h.mound, h.s); // world length → shader units, the buried foot included
    const B = bendLen(stretch, h.bendMost);

    // Where the face is right now (mirror of the shader's spine, in head units):
    // curve end + the head's own offset, rotated by the curl
    const end = spineEnd(pose.curl, B);
    const c = Math.cos(pose.curl),
      si = Math.sin(pose.curl);
    const relY = -STRETCH_FROM,
      relZ = -RCZ; // head origin, relative to the bend pivot
    const localY = STRETCH_FROM - B + end.up + relY * c - relZ * si;
    const localZ = RCZ + end.fwd + relY * si + relZ * c;
    headSpot(h, pose, localZ, fwdDir);
    const headX = fwdDir.x;
    const headZ = fwdDir.z;
    const headY = h.ground + h.neckLen + localY * h.s;

    // Aim. The yaw comes from the statue's BASE to the bird, not from the head:
    // with the bird hovering right under a bent head, the head→bird direction
    // whips around with every small movement, but the base→bird direction stays
    // steady — that was the main source of the close-range jitter.
    const dx = player.position.x - headX,
      dz = player.position.z - headZ;
    const flat = Math.hypot(dx, dz);
    const dist3 = Math.hypot(flat, player.position.y - headY);
    const targetTurn = Math.atan2(
      player.position.x - h.x,
      player.position.z - h.z,
    );
    // The pitch uses the head, with the horizontal distance floored so the angle
    // can't spike when the bird slips directly underneath
    const aimCurl = THREE.MathUtils.clamp(
      Math.atan2(headY - player.position.y, Math.max(flat, 2)),
      h.curlLo,
      h.curlHi,
    );
    // Personal space: fade the curl down across a band around the standoff
    // distance (a smooth ramp, not a hard edge, so there's no boundary to
    // oscillate across), leaving the face hanging at the bubble's edge
    const standoff = 2.25 + 0.9 * h.s; // 25% closer than before
    const room = THREE.MathUtils.smoothstep(
      dist3,
      standoff * 0.6,
      standoff * 1.3,
    );
    const watchCurl = THREE.MathUtils.clamp(aimCurl * (0.25 + 0.75 * room) + (h.leanCurl || 0), h.curlLo, h.curlHi);

    // How much of its attention the bird has: all of it inside the statue's
    // notice radius (NOTICE: the bigger the statue, the further it notices),
    // none past it, fading over the outer edge. With none, the head eases
    // back to the facing and curl it was planted with.
    const notice = noticeRadius(h.s);
    const from = NOTICE.island && h.isle ? Math.max(0, Math.hypot(h.isle.x - player.position.x, h.isle.z - player.position.z) - h.isle.r) : flat; // from the island's edge, or from itself
    const heed = h.devout ? 0 : 1 - THREE.MathUtils.smoothstep(from, notice * (1 - NOTICE.edge), notice);
    const restCurl = THREE.MathUtils.clamp(REST_CURL + (h.leanCurl || 0), h.curlLo, h.curlHi);
    const targetCurl = THREE.MathUtils.lerp(restCurl, watchCurl, heed);
    // Sensitive tracking, but rate-limited: they turn eagerly up close, yet
    // never faster than a fixed top speed — a moving target can't make them
    // vibrate, only chase
    const urgency = 1 + 5 * THREE.MathUtils.clamp(1 - flat / notice, 0, 1);
    const ease = Math.min(1, delta * h.speed * urgency);
    // The neck only wrings so far from the planted facing (the hands stand
    // before it, and a head turned right round would have them at its
    // back): the head follows the bird within MAX_TWIST either side, and
    // sits at the limit while the bird is behind
    const was = { twist: pose.twistTurn, curl: pose.curl };
    const wantTwist = heed * THREE.MathUtils.clamp(wrapAngle(targetTurn - pose.yaw), -MAX_TWIST, MAX_TWIST);
    const turnStep = THREE.MathUtils.clamp((wantTwist - pose.twistTurn) * ease, -2.5 * h.tempo * delta, 2.5 * h.tempo * delta);
    pose.twistTurn += turnStep;
    pose.turn = pose.yaw + pose.twistTurn;
    const curlStep =
      (targetCurl - pose.curl) *
      Math.min(1, delta * h.speed * (1 + (2 * (urgency - 1)) / 5));
    if (Math.abs(targetCurl - pose.curl) > 0.008) {
      pose.curl += THREE.MathUtils.clamp(curlStep, -1.4 * h.tempo * delta, 1.4 * h.tempo * delta);
    }
    // Not into a hand: a step that leaves the head deeper in one than it was is taken back
    const caps = capsNear(h);
    if (caps.length) {
      const after = clashDepth(h, B, caps);
      if (after > 0) {
        const to = { twist: pose.twistTurn, curl: pose.curl };
        pose.twistTurn = was.twist;
        pose.curl = was.curl;
        if (after <= clashDepth(h, B, caps)) {
          pose.twistTurn = to.twist; // no deeper than before: let it go (it may be working its way out)
          pose.curl = to.curl;
        }
        pose.turn = pose.yaw + pose.twistTurn;
      }
    }
    // The sound of it, from the head: a grind as the neck turns, a drag as
    // it unsticks, a scrape or a drag as it reverses (sounds.js)
    sounds.neck(h.key, headX, headY, headZ, h.s, pose.twistTurn - was.twist, pose.curl - was.curl, delta);
    if (jitterLog) {
      const d = { nod: pose.curl - was.curl, turn: pose.twistTurn - was.twist };
      pose.jd ??= {};
      for (const k in d) {
        if (Math.abs(d[k]) < 1e-4) continue;
        if (pose.jd[k] && Math.sign(pose.jd[k]) !== Math.sign(d[k])) jitter[k]++;
        pose.jd[k] = d[k];
      }
    }

    // One rigid placement: the statue stands with its foot (the neck's axis,
    // RCZ behind the head's origin) on its spot, where its mound is centred
    // and its arms were dealt; the origin sits back from it along the
    // facing (as the arms' do, below). All the motion (stretch, curl, the
    // head riding the curve) happens in the shader
    dummy.position.set(h.x - RCZ * h.s * Math.sin(pose.yaw), h.ground + h.neckLen, h.z - RCZ * h.s * Math.cos(pose.yaw));
    dummy.rotation.set(0, pose.yaw, 0); // planted facing: the turn and the wobble wring the neck instead (twist, below)
    dummy.scale.setScalar(h.s);
    dummy.updateMatrix();
    for (const f of [headFields[h.variant], eyeFields[h.variant]]) {
      const i = f.count++;
      f.setMatrixAt(i, dummy.matrix);
      f.attrs.stretch.setX(i, stretch);
      f.attrs.mound.setX(i, bury);
      f.attrs.curl.setX(i, pose.curl);
      f.attrs.fade.setX(i, fade);
      // The shader's twist turns the section clockwise seen from above
      // (the opposite sense to rotation.y), so the lane takes the negative
      f.attrs.twist.setX(i, -(h.twist + pose.twistTurn + h.wobble));
      f.attrs.taper.setX(i, h.taper);
      f.attrs.bendCap.setX(i, h.bendMost ? -h.bendMost : 0); // negative: a longer bend
      f.attrs.id.setX(i, h.id);
    }
    // The hands. Each arm stands planted where it comes up from the ground;
    // at rest it reaches for the sky. With the bird about (in the statue's
    // notice), the whole arm turns about its base to face it (column, elbow
    // and hand as one: the wrist never twists or bends), following it smoothly
    // every frame, and its fingers close the nearer the bird comes (the
    // pose blend, toward GRAB.pose), as if to catch it; once the bird has
    // gone it settles back to the sky. Its state lives with the statue's
    // pose, so it outlasts cell changes
    const armStates = (pose.arms ??= []);
    let blockers = null; // what its arms keep out of (armBlockers), gathered when one first moves
    h.arms.forEach((arm, k) => {
      const S = (armStates[k] ??= { turn: 0, curl: arm.curl, grip: 0, g: undefined });
      S.g ??= getHeight(arm.ex, arm.ez); // the land the column comes up from
      const base = S.g;
      // Where the wrist stands: over the column, out along the elbow's lean,
      // which turns with the arm
      const ry = Math.sin(arm.yaw + S.turn),
        rc = Math.cos(arm.yaw + S.turn);
      const lean = arm.elbow * ELBOW_DOWN * arm.sc;
      const wx = arm.ex + ry * lean,
        wy = base + arm.up * arm.sc,
        wz = arm.ez + rc * lean;
      // What the hand is after: the bird, if it's about; else the sky
      const near = Math.hypot(player.position.x - h.x, player.position.z - h.z) < noticeRadius(h.s);
      let turnTo = 0,
        curlTo = arm.curl,
        gripTo = 0;
      if (HANDS_MOVE && near) {
        const bx = player.position.x - wx,
          by = player.position.y - wy,
          bz = player.position.z - wz;
        turnTo = THREE.MathUtils.clamp(wrapAngle(Math.atan2(bx, bz) - arm.yaw), -GRAB.swing, GRAB.swing); // it turns to face the bird; it never tips at the wrist (curlTo stays its rest)
        gripTo = 1 - THREE.MathUtils.smoothstep(Math.hypot(bx, by, bz) / arm.sc, GRAB.close, GRAB.open);
      }
      // Followed smoothly (eased, and no faster than GRAB.speed), quicker
      // reaching than settling back
      const rate = near ? GRAB.follow : GRAB.settle,
        k1 = 1 - Math.exp(-delta * rate),
        most = GRAB.speed * delta;
      const was = { turn: S.turn, curl: S.curl };
      S.turn += THREE.MathUtils.clamp((turnTo - S.turn) * k1, -most, most);
      S.curl += THREE.MathUtils.clamp((curlTo - S.curl) * k1, -most, most);
      // ...but never into another arm, an obelisk or a lantern: a step that
      // would take it deeper into one isn't taken (as a head won't step into
      // an arm), so it stops against it rather than passing through
      if (S.turn !== was.turn || S.curl !== was.curl) {
        blockers ??= armBlockers(h);
        if (armClash(arm, base, S.turn, S.curl, blockers, S.cap) > Math.max(0, armClash(arm, base, was.turn, was.curl, blockers, S.cap))) {
          S.turn = was.turn;
          S.curl = was.curl;
        }
      }
      S.grip += (gripTo - S.grip) * (1 - Math.exp(-delta * GRAB.close_rate));
      // Stone on stone for as long as it moves (sounds.js)
      sounds.arm(`${h.key}:arm${k}`, wx, wy, wz, h.s, S.turn - was.turn, S.curl - was.curl, 0, delta);
      // The instance: the column stretched from the wrist down to BURY
      // under the ground, its axis pinned over the spot it comes up at,
      // turned as the arm has turned; the wrist's drop (B - up) taken back
      // out so the wrist stands at arm.up
      const stretch = Math.max(MIN_STRETCH, arm.up + BURY / arm.sc);
      const B = Math.min(bendLen(stretch), WRIST_B),
        { up } = spineEnd(S.curl, B);
      armDummy.position.set(arm.ex - RCZ * arm.sc * ry, base + arm.up * arm.sc + (B - up - STRETCH_FROM) * arm.sc, arm.ez - RCZ * arm.sc * rc);
      armDummy.rotation.set(0, arm.yaw + S.turn, 0); // the whole arm, turned about its base
      armDummy.scale.setScalar(arm.sc);
      armDummy.updateMatrix();
      const handYaw = arm.yaw + S.turn;
      S.cap = armCap(arm, wx, wy, wz, handYaw, S.curl, S.cap); // for the heads near it to keep out of
      // Solid: the hand, by a few spheres up from the wrist (ARM_SOLID),
      // and the column under it, from the ground up to the wrist
      if (Math.hypot(player.position.x - wx, player.position.y - wy, player.position.z - wz) < 4 * arm.sc + BIRD_R) {
        const fs = Math.sin(S.curl) * arm.sc,
          fc = Math.cos(S.curl) * arm.sc,
          hy = Math.sin(handYaw),
          hc = Math.cos(handYaw);
        for (const [along, r] of ARM_SOLID) pushOut(probe.set(wx + hy * fs * along, wy + fc * along, wz + hc * fs * along), r * arm.sc + BIRD_R);
      }
      {
        const dy = player.position.y - base,
          colR = 0.32 * HANDS.column * arm.sc + BIRD_R;
        const cx = player.position.x - arm.ex,
          cz = player.position.z - arm.ez,
          cd = Math.hypot(cx, cz);
        if (dy > -BIRD_R && dy < wy - base && cd < colR && cd > 0) {
          player.position.x = arm.ex + (cx / cd) * colR;
          player.position.z = arm.ez + (cz / cd) * colR;
        }
      }
      {
        const f = handMesh(arm.name, GRAB.pose, arm.side); // its own pose, closing toward a fist as it grabs
        if (f.count >= MAX_ARMS) return;
        const i = f.count++;
        f.morph?.setX(i, S.grip);
        f.setMatrixAt(i, armDummy.matrix);
        f.attrs.stretch.setX(i, stretch);
        f.attrs.mound.setX(i, (stretch - arm.up) * arm.sc - BURY); // so the shaders' ground is the ground under it
        f.attrs.curl.setX(i, S.curl);
        f.attrs.fade.setX(i, fade);
        f.attrs.twist.setX(i, 0); // the wrist never twists: the arm turns whole (above)
        f.attrs.taper.setX(i, 0);
        f.attrs.bendCap.setX(i, WRIST_B); // it bends at the wrist only
        f.attrs.elbow.setX(i, arm.elbow); // ...over a slight, fixed elbow, its own
        f.attrs.id.setX(i, 1 + ((h.id * 7 + k * 13) % 1000)); // its own, stable
      }
    });

    // ---- Solid: keep the bird out of this statue ----
    // The straight shaft: a vertical cylinder from its foot to where the bend
    // starts (a floater's foot hangs in the air: nothing to hit beneath it)
    const shaftTop = h.ground + h.neckLen + (STRETCH_FROM - B) * h.s;
    if (player.position.y < shaftTop + 0.5 && player.position.y > h.ground - BURY - h.mound) {
      const rx = player.position.x - h.x,
        rz = player.position.z - h.z;
      const rd = Math.hypot(rx, rz),
        rr = 0.75 * Math.max(1, 1 - NECK_TAPER) * h.s + BIRD_R; // the shaft's widest, at the base
      if (rd < rr && rd > 0) {
        player.position.x += (rx / rd) * (rr - rd);
        player.position.z += (rz / rd) * (rr - rd);
      }
    }
    // The curved part: a few spheres along the bend, then the head itself
    pushOut(spinePoint(h, pose.curl, B, 0.45, probe), 0.8 * h.s + BIRD_R);
    pushOut(spinePoint(h, pose.curl, B, 0.8, probe), 0.8 * h.s + BIRD_R);
    pushOut(probe.set(headX, headY, headZ), 1.25 * h.s + BIRD_R);
  });
  // The lone hands, each morphing from its pose toward its target (another pose, or a fist as it grabs: stepLoneArms), in the arms' meshes
  for (const lh of liveHands) {
    const f = handMesh(lh.name, lh.target ?? GRAB.pose, lh.side);
    if (f.count >= MAX_ARMS) continue;
    const i = f.count++;
    f.morph?.setX(i, lh.S.grip);
    f.setMatrixAt(i, lh.matrix);
    f.attrs.stretch.setX(i, lh.stretch);
    f.attrs.mound.setX(i, lh.mound);
    f.attrs.curl.setX(i, lh.curl);
    f.attrs.fade.setX(i, 1);
    f.attrs.twist.setX(i, 0);
    f.attrs.taper.setX(i, 0);
    f.attrs.bendCap.setX(i, WRIST_B);
    f.attrs.elbow.setX(i, lh.elbow);
    f.attrs.id.setX(i, lh.id);
  }
  for (const f of fieldsNow()) {
    if (f.morph) f.morph.needsUpdate = true;
    f.instanceMatrix.needsUpdate = true;
    f.attrs.stretch.needsUpdate = true;
    f.attrs.curl.needsUpdate = true;
    f.attrs.fade.needsUpdate = true;
    f.attrs.twist.needsUpdate = true;
    f.attrs.taper.needsUpdate = true;
    f.attrs.id.needsUpdate = true;
  }
}
let lastTX = null,
  lastTZ = null;

await loading("growing the trees", 0.85); // a step of the bar, so it does not sit still through the rest of the field

// =====================================================================
// Scenery: trees (scenery.js builds them)
// =====================================================================
// Dealt with each cell (groupAt) and refilled whenever the bird changes
// coarse cell, from the SCENERY_REACH coarse cells around it. A tree is a
// plain instanced mesh in its own colours.
const SCENERY_REACH = 1; // one cell covers the visible islands; the rest is hidden by fog
const MAX_TREES = 700; // per shape and kind
const TREE_TINT = { warmth: 0.08, lightness: 0.12 }; // how far each tree's green is nudged: every value a ± fraction, drawn per tree (warmth toward yellow-green or blue-green)
const treeMat = treeMaterial();
rimSink(treeMat, true); // the trees sink with the land at the rim
// ...and sway in the wind (WIND): each vertex pushed downwind by the
// square of its height up the tree (the foot planted, the crown leaning
// most), rocking with the gusts, each tree a little out of step with the
// next (a phase from where it stands). The shadows stay as they stood
{
  const rimCompile = treeMat.onBeforeCompile;
  treeMat.onBeforeCompile = (sh, r) => {
    rimCompile(sh, r);
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
uniform vec2 uWindDir;
uniform float uWind, uWindTime;`)
      .replace("#include <project_vertex>", `{
    float s = length(instanceMatrix[0].xyz);
    vec4 foot = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float h = max(transformed.y, 0.0) * s / ${WIND.swayH.toFixed(1)};
    float phase = foot.x * 0.13 + foot.z * 0.17;
    float rock = 0.75 + 0.25 * sin(uWindTime * 1.7 + phase) + 0.1 * sin(uWindTime * 4.3 + phase * 2.0);
    vec3 lean = vec3(uWindDir.x, 0.0, uWindDir.y) * (${WIND.sway.toFixed(2)} * uWind * rock * h * h);
    // a world offset, taken back into the tree's own frame (its turn and size undone)
    transformed += transpose(mat3(instanceMatrix)) * lean / (s * s);
  }
  #include <project_vertex>`);
  };
}
// treeFields[kind][shape]
const treeLook = treeColours(LAB_PALETTE.trees, LAB_PALETTE.bark); // the lab's canopy and bark colours
const treeFields = TREE_KINDS.map((kind) =>
  Array.from({ length: TREES.shapes }, (_, k) => {
    const f = new THREE.InstancedMesh(buildTree(kind, k, treeLook), treeMat, MAX_TREES);
    f.setColorAt(0, new THREE.Color(1, 1, 1)); // the per-tree tints, there from the first frame
    f.frustumCulled = false;
    f.castShadow = true;
    f.receiveShadow = true;
    f.count = 0;
    scene.add(f);
    return f;
  }),
);
const sceneryDummy = new THREE.Object3D();
// How far out from its foot a statue can reach (world units): its mound,
// or its head bent right over, whichever is further
function statueReach(h) {
  const { stretch } = neckStretch(Math.max(h.neckLen, CHIN_DEPTH * h.s + CLEARANCE), moundAt(h.x, h.z), h.s);
  const B = bendLen(stretch, h.bendMost);
  const fwd = spineEnd(MAX_CURL, B).fwd; // from the neck's axis, which is the spot
  return Math.max(moundRadius(h.s), (fwd + 1.25 + WOOD.reach) * h.s);
}
// A cell's trees, placed once: the land and mound under each read here
// (the dear part); left out are those off the grass, on a head's earth or
// within a head's reach, and any whose canopy would overlap another's
// (earlier in the cell wins; across a border, the lower cell wins)
function placedTrees(g, cx, cz) {
  if (g.placed) return g.placed;
  g.placed = [];
  const heads = [];
  const others = []; // neighbouring cells' trees that outrank this cell's
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const n = groupAt(cx + di, cz + dj);
      if (!NATURE_MODE) for (const h of n) heads.push({ x: h.x, z: h.z, r: statueReach(h) });
      if (di < 0 || (di === 0 && dj < 0)) for (const tr of n.trees) others.push({ x: tr.x, z: tr.z, r: treeRadius(TREE_KINDS[tr.kind], tr.scale) });
    }
  const placed = [];
  for (const tr of g.trees) {
    const r = treeRadius(TREE_KINDS[tr.kind], tr.scale);
    const clear = (o) => Math.hypot(o.x - tr.x, o.z - tr.z) >= o.r + r;
    if (!heads.every(clear) || !others.every(clear) || !placed.every(clear)) continue;
    const mound = moundAt(tr.x, tr.z);
    if (mound > WOOD.mound) continue; // on a head's earth
    if (!beach.onGrass(tr.x, tr.z)) continue; // off the grass: a clump's stray, on the beach or in the sea
    const land = landHeight(tr.x, tr.z);
    placed.push({ x: tr.x, z: tr.z, r });
    sceneryDummy.position.set(tr.x, land + mound, tr.z);
    sceneryDummy.rotation.set(0, tr.yaw, 0);
    sceneryDummy.scale.setScalar(tr.scale);
    sceneryDummy.updateMatrix();
    // Each tree its own green, nudged as the tufts are (TREE_TINT)
    const warm = (hash(Math.round(tr.x * 10), Math.round(tr.z * 10), 176) * 2 - 1) * TREE_TINT.warmth,
      light = 1 + (hash(Math.round(tr.x * 10), Math.round(tr.z * 10), 177) * 2 - 1) * TREE_TINT.lightness;
    const tint = new THREE.Color(light * (1 + warm), light * (1 + 0.3 * warm), light * (1 - warm));
    const f = treeFields[tr.kind][tr.shape];
    g.placed.push({ f, matrix: sceneryDummy.matrix.clone(), tint, x: tr.x, y: land + mound, z: tr.z, yaw: tr.yaw, s: tr.scale, r, solid: f.geometry.userData.solid });
  }
  return g.placed;
}
// The rubble: one instanced mesh per kind and shape, in a plain stone
// (no weathering: there is a lot of it and it is small), each piece its
// own shade; it sinks with the land at the rim, and casts no shadow
const MAX_RUBBLE = 1200; // per kind and shape
const rubbleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(LAB_PALETTE.stone).multiplyScalar(RUBBLE.shade), roughness: 1, flatShading: true });
rimSink(rubbleMat, true);
const rubbleFields = new Map(); // "kind:k" → its mesh
for (const kind of DEBRIS_KINDS)
  for (let k = 0; k < DEBRIS.shapes; k++) {
    const f = new THREE.InstancedMesh(buildDebris(kind, k), rubbleMat, MAX_RUBBLE);
    f.setColorAt(0, new THREE.Color(1, 1, 1));
    f.frustumCulled = false;
    f.castShadow = false;
    f.receiveShadow = true;
    f.count = 0;
    scene.add(f);
    rubbleFields.set(`${kind}:${k}`, f);
  }
let liveRubble = 0; // pieces drawn now
// A cell's rubble, placed once: on the grass, on the ground (mounds and
// all), sunk and tilted as dealt
function placedRubble(g) {
  if (g.placedRubble) return g.placedRubble;
  g.placedRubble = [];
  for (const p of g.rubble) {
    if (!beach.onGrass(p.x, p.z)) continue;
    const f = rubbleFields.get(`${p.kind}:${p.k}`);
    sceneryDummy.position.set(p.x, landHeight(p.x, p.z) + moundAt(p.x, p.z) - p.sink * f.geometry.userData.height * p.scale, p.z);
    sceneryDummy.rotation.set(Math.sin(p.tiltDir) * p.tilt, p.yaw, Math.cos(p.tiltDir) * p.tilt);
    sceneryDummy.scale.setScalar(p.scale);
    sceneryDummy.updateMatrix();
    const light = 1 + (hash(Math.round(p.x * 10), Math.round(p.z * 10), 267) * 2 - 1) * RUBBLE.tint;
    g.placedRubble.push({ f, matrix: sceneryDummy.matrix.clone(), tint: new THREE.Color(light, light, light) });
  }
  return g.placedRubble;
}
// The fallen heads: one instanced mesh per shape, each a field head broken
// (seeded, so the same every visit) until it has a broken face big enough to
// lie on, turned onto it with that face at y = 0. Plain stone in the statues'
// colours, unweathered; they sink with the land at the rim
const fallenMat = new THREE.MeshStandardMaterial({ color: LAB_PALETTE.stone, roughness: 0.95 });
const fallenEyes = new THREE.MeshStandardMaterial({ color: LAB_PALETTE.eyes, roughness: 1 });
rimSink(fallenMat, true);
rimSink(fallenEyes, true);
const MAX_FALLEN = 200; // per shape
const fallenFields = [];
for (let k = 0; k < FALLEN.shapes; k++) {
  const P = variantParams(1 + (k % (VARIANTS - 1)));
  let built, cut;
  for (let seed = k * 101 + 1; ; seed++) {
    built = breakHead(buildHead(P, { neck: false }), mulberry32(seed));
    cut = built.cuts.reduce((a, b) => (b.area > a.area ? b : a));
    if (cut.area >= FALLEN.minCut || seed > k * 101 + 50) break;
  }
  const down = new THREE.Quaternion().setFromUnitVectors(cut.n, new THREE.Vector3(0, -1, 0));
  for (const geo of [built.head, built.eyes]) geo.applyQuaternion(down).translate(0, cut.d, 0);
  const geo = mergeGeometries([built.head, built.eyes], true);
    const f = new THREE.InstancedMesh(geo, [fallenMat, fallenEyes], MAX_FALLEN);
    f.visible = !NATURE_MODE;
  f.setColorAt(0, new THREE.Color(1, 1, 1));
  f.frustumCulled = false;
  f.castShadow = true;
  f.receiveShadow = true;
  f.count = 0;
  scene.add(f);
  fallenFields.push(f);
}
// The stumps (STUMPS): a field head's neck alone, cut by a plane a little
// under where the head joined it (its slant, turned toward level by
// `level`), what is left capped with a flat broken face as the fallen heads
// have. Its foot a head unit under y = 0, about the neck's axis
function neckStump(P, rnd) {
  const pick = ([lo, hi]) => lo + rnd() * (hi - lo);
  const bottom = STRETCH_FROM - pick(STUMPS.neck);
  const built = buildHead(P, { neckBottom: bottom });
  const nape = built.shape.planes[built.shape.napeIdx]; // the head's join, its normal out of the head (down the neck)
  const n = nape.n.clone().lerp(new THREE.Vector3(0, -1, 0), pick(STUMPS.level));
  n.add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.3)).normalize();
  const c = built.ring.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(built.ring.length);
  const q = c.clone().addScaledVector(nape.n, -(nape.n.dot(c) - nape.d)); // the join, over the neck's middle
  // Kept: n·x > d. Never above any of the neck's top edge, so the cut takes it all
  const d = Math.max(n.dot(q) + pick(STUMPS.into), ...built.collar.map((col) => n.dot(col[col.length - 1].p) + 0.03));
  const src = built.neck.attributes,
    out = [],
    nor = [],
    cut = []; // the cut's edges, a pair of points each
  const at = (i) => [new THREE.Vector3().fromBufferAttribute(src.position, i), new THREE.Vector3().fromBufferAttribute(src.normal, i)];
  const push = (...vs) => {
    for (const [p, m] of vs) out.push(p.x, p.y, p.z), nor.push(m.x, m.y, m.z);
  };
  for (let t = 0; t < src.position.count; t += 3) {
    const v = [at(t), at(t + 1), at(t + 2)],
      s = v.map(([p]) => n.dot(p) - d);
    if (s.every((x) => x > 0)) push(...v);
    if (s.every((x) => x > 0) || s.every((x) => x <= 0)) continue;
    // Across the cut: the triangle clipped to its kept side, and fanned
    const poly = [],
      hits = [];
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      if (s[a] > 0) poly.push(v[a]);
      if (s[a] > 0 !== s[b] > 0) {
        const f = s[a] / (s[a] - s[b]);
        const h = [v[a][0].clone().lerp(v[b][0], f), v[a][1].clone().lerp(v[b][1], f).normalize()];
        poly.push(h);
        hits.push(h[0]);
      }
    }
    for (let j = 1; j < poly.length - 1; j++) push(poly[0], poly[j], poly[j + 1]);
    if (hits.length === 2) cut.push(hits);
  }
  // The broken face: a fan from the cut's middle over each of its edges, facing out of the cut
  const mid = cut.flat().reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(cut.length * 2),
    up = n.clone().negate(),
    e = new THREE.Vector3(),
    f = new THREE.Vector3();
  for (let [a, b] of cut) {
    if (e.subVectors(a, mid).cross(f.subVectors(b, mid)).dot(up) < 0) [a, b] = [b, a];
    push([mid, up], [a, up], [b, up]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return g.translate(-c.x, -(bottom + 1), -c.z);
}
const stumpFields = [];
for (let k = 0; k < STUMPS.shapes; k++) {
  const f = new THREE.InstancedMesh(neckStump(variantParams(1 + ((k * 7 + 2) % (VARIANTS - 1))), mulberry32(k * 53 + 11)), fallenMat, MAX_FALLEN);
  f.visible = !NATURE_MODE;
  f.setColorAt(0, new THREE.Color(1, 1, 1));
  f.frustumCulled = false;
  f.castShadow = true;
  f.receiveShadow = true;
  f.count = 0;
  scene.add(f);
  stumpFields.push(f);
}
// A cell's fallen heads (and the stumps), placed once, as its obelisks are: left out are those
// off the grass, on a head's earth or in its reach, and any that would lie in
// a tree, an obelisk or another fallen head
function placedFallen(g, cx, cz) {
  if (g.placedFallen) return g.placedFallen;
  g.placedFallen = [];
  const keepOut = [];
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const n = groupAt(cx + di, cz + dj);
      for (const h of n) keepOut.push({ x: h.x, z: h.z, r: statueReach(h) });
      if (di < 0 || (di === 0 && dj < 0)) for (const o of n.placedFallen ?? []) keepOut.push(o);
    }
  for (const t of placedTrees(g, cx, cz)) keepOut.push({ x: t.x, z: t.z, r: t.r * 0.5 });
  for (const st of placedStones(g, cx, cz)) keepOut.push({ x: st.x, z: st.z, r: st.r ?? 2 });
  for (const p of g.fallen) {
    const r = FALLEN.clear * p.scale;
    const clear = (o) => Math.hypot(o.x - p.x, o.z - p.z) >= o.r + r;
    if (!keepOut.every(clear) || !g.placedFallen.every(clear)) continue;
    const mound = moundAt(p.x, p.z);
    if (mound > STONES.mound) continue;
    if (!beach.onGrass(p.x, p.z)) continue;
    sceneryDummy.position.set(p.x, landHeight(p.x, p.z) + mound - p.sink * p.scale, p.z);
    sceneryDummy.rotation.set(0, p.yaw, 0);
    sceneryDummy.scale.setScalar(p.scale);
    sceneryDummy.updateMatrix();
    const light = 1 + (hash(Math.round(p.x * 10), Math.round(p.z * 10), 277) * 2 - 1) * STONE_TINT;
    g.placedFallen.push({ x: p.x, z: p.z, r, f: (p.stump ? stumpFields : fallenFields)[p.k], matrix: sceneryDummy.matrix.clone(), tint: new THREE.Color(light, light, light) });
  }
  return g.placedFallen;
}
// The obelisks: one instanced mesh per kind and height, in the statues'
// own stone (plaster: its weathering paints them, each its own stains),
// each a little its own shade; they sink with the land at the rim, as the
// trees do. The stone's shaders read the statues' lanes: an obelisk has no
// neck, stands unbent, and its mound lane says where its ground is (the
// soil stain at its foot)
const MAX_STONES = 2500; // per kind and height
const STONE_TINT = 0.12; // ± lightness, drawn per obelisk
const stoneMat = plaster.clone();
{
  const prev = plaster.onBeforeCompile,
    prevKey = plaster.customProgramCacheKey.bind(plaster);
  rimSink(stoneMat, true); // sets its onBeforeCompile: the rim's sink...
  const rim = stoneMat.onBeforeCompile;
  stoneMat.onBeforeCompile = (sh) => {
    prev(sh); // ...after the bend and the weathering
    rim(sh);
  };
  stoneMat.customProgramCacheKey = () => prevKey() + "-rim";
}
const stoneFields = new Map(); // "kind:k" → its mesh
for (const kind of OBELISKS.kinds)
  for (let k = 0; k < OBELISKS.heights; k++) {
    const g = buildObelisk(kind, k);
    const f = new THREE.InstancedMesh(g, stoneMat, MAX_STONES);
    f.visible = !NATURE_MODE;
    f.attrs = attachAttrs(g, MAX_STONES);
    f.customDepthMaterial = headDepth;
    f.setColorAt(0, new THREE.Color(1, 1, 1));
    f.frustumCulled = false;
    f.castShadow = true;
    f.receiveShadow = true;
    f.count = 0;
    scene.add(f);
    stoneFields.set(`${kind}:${k}`, f);
  }
// The lanterns' windows: an unlit mesh a height, at each lantern's matrix
LANTERN_GLOW.mat = new THREE.MeshBasicMaterial({ color: LANTERN_GLOW.color.clone(), fog: true });
rimSink(LANTERN_GLOW.mat, true);
// The pool of light on the ground round each lantern's foot, added over
// the ground (lit lanterns only): a disc fading out from its middle, or a
// flat disc, as the look has it (flatlight.js poolTexture)
const poolMat = new THREE.MeshBasicMaterial({ color: LANTERN_GLOW.color.clone(), map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 });
rimSink(poolMat, true);
LANTERN_GLOW.poolMat = poolMat;
const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), poolMat, MAX_STONES);
pools.frustumCulled = false;
pools.count = 0;
pools.visible = !NATURE_MODE;
pools.renderOrder = 1;
scene.add(pools);
// The lamps: a few real lights, moved to the lanterns nearest the bird
const lamps = Array.from({ length: LANTERN_GLOW.lamps }, () => {
  const l = new THREE.PointLight(LANTERN_GLOW.color, 0, LANTERN_GLOW.lampReach, 2);
  l.visible = !NATURE_MODE;
  scene.add(l);
  return l;
});
const liveLanterns = []; // the lanterns standing now: where each lamp sits, world units
// How lit the lanterns are, from the daylight: the windows, the pools and the lamps
function lightLanterns() {
  const G = LANTERN_GLOW;
  G.lit = 1 - THREE.MathUtils.smoothstep(daylight, G.dusk[1], G.dusk[0]);
  // Only in the first half of the day's cycle (midnight on to noon: the
  // night and the dawn); through the second half, however dark, they stay
  // out. Coming on over `fade` seconds past midnight, so there is no pop
  if (G.half.on) G.lit *= dayT < DAY.period / 2 ? THREE.MathUtils.smoothstep(dayT, 0, G.half.fade) : 0;
  // The windows' two colours, each lantern's between them by its own on
  // (shadeLantern): lit, the warm light as bright as the hour has it; unlit,
  // a shade darker than the sky. The material itself stays white
  (G.onColor ??= new THREE.Color()).copy(G.color).multiplyScalar(THREE.MathUtils.lerp(G.day, G.night, G.lit));
  (G.offColor ??= new THREE.Color()).copy(scene.background).multiplyScalar(G.offShade);
  if (G.mat) G.mat.color.setRGB(1, 1, 1);
  if (G.poolMat) G.poolMat.opacity = G.poolStrength * G.lit;
  G.reshade?.(); // every standing lantern, to the new colours (once they exist)
}
lightLanterns(); // as lit as the hour has them, now the pools exist
// A lantern's windows and pool as lit as it is (its own on, 0 – 1): the
// windows from a shade darker than the sky up to their light, the pool
// from nothing
const lanternTint = new THREE.Color();
function shadeLantern(L) {
  const G = LANTERN_GLOW,
    on = L.st.on;
  L.glow.setColorAt(L.gi, lanternTint.copy(G.offColor).lerp(G.onColor, on));
  pools.setColorAt(L.pi, lanternTint.setScalar(on));
}
// As the hour turns the sky and the light change, so every lantern is
// shaded again (lightLanterns calls this)
LANTERN_GLOW.reshade = () => {
  if (!liveLanterns.length) return;
  for (const L of liveLanterns) shadeLantern(L);
  for (const f of glowFields.values()) if (f.instanceColor) f.instanceColor.needsUpdate = true;
  if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
};
// Each frame: every lantern the bird comes near lights, easing on, and
// stays lit until the lit half of the cycle ends; the lamps go to the lit
// ones nearest the bird
function stepLanterns(delta) {
  if (NATURE_MODE) return;
  const G = LANTERN_GLOW,
    k = 1 - Math.exp(-delta / (G.ease / 3));
  let changed = false;
  // Lanterns only wake once lightLanterns has them well lit (wakeLit: with
  // G.half, in the first half of the cycle, the slider climbing left to
  // right, and the night's glow up enough to see); when it has them out
  // every lantern goes out, and silently, and lights and pings afresh when
  // the bird passes again in a lit half. The bird must be near it across
  // and about its height, at night: one passed by day or at dusk stays dark
  // (it used to remember the pass, due, and light once night came, so
  // lanterns flown by in the evening lit up long after)
  const open = G.lit > 0.01,
    wakes = G.lit >= G.wakeLit,
    blown = 1 + G.windWake * THREE.MathUtils.clamp(windNow, 0, 1); // the harder it blows, the further they reach (windWake)
  for (const L of liveLanterns) {
    if (!open) L.st.lit = L.st.rang = false;
    else if (!L.st.lit && wakes && Math.hypot(L.x - player.position.x, L.z - player.position.z) < G.wake * blown && Math.abs(player.position.y - L.y) < G.wakeUp * blown) L.st.lit = true;
    if (L.st.lit && !L.st.rang) {
      L.st.rang = true; // (once a lighting: cleared as it goes out)
      // A sonar ping as it lights (sounds.js SOUND.ping): from the first
      // lantern of its island (coarse cell) to light, once; the rest of
      // that island's light in silence (an island has dozens, and one each
      // was a stream of pings all the way across it)
      const cell = `${Math.floor(L.x / GROUP.cell)},${Math.floor(L.z / GROUP.cell)}`;
      if (!G.pingOnce) sounds.ping(L.key, L.x, L.y, L.z, L.id, true);
      else if (!pingedCells.has(cell)) {
        pingedCells.add(cell);
        sounds.ping(cell, L.x, L.y, L.z, L.id, true);
      }
    }
    const want = L.st.lit ? 1 : 0;
    if (Math.abs(want - L.st.on) < 1e-3) continue;
    L.st.on += (want - L.st.on) * k;
    if (Math.abs(want - L.st.on) < 1e-3) L.st.on = want;
    shadeLantern(L);
    changed = true;
  }
  if (changed) {
    for (const f of glowFields.values()) if (f.instanceColor) f.instanceColor.needsUpdate = true;
    if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
  }
  const near = liveLanterns.filter((l) => l.st.on > 0.01).map((l) => ({ l, d: (l.x - player.position.x) ** 2 + (l.z - player.position.z) ** 2 })).sort((a, b) => a.d - b.d);
  // The chimes: how many lanterns are about the bird, the near ones
  // counting most
  const C = G.chimes;
  let crowd = 0;
  for (const L of liveLanterns) {
    const d = Math.hypot(L.x - player.position.x, L.z - player.position.z);
    if (d < C.far * blown) crowd += 1 - THREE.MathUtils.smoothstep(d, C.near * blown, C.far * blown);
  }
  sounds.chimes(THREE.MathUtils.smoothstep(crowd, C.from, C.full));
  // Always there, and dark when unused: a light that comes and goes changes
  // how many lights every material's shader is built for, and they all
  // recompile (the frame freezes); one at zero costs next to nothing
  lamps.forEach((lamp, i) => {
    const n = near[i];
    if (!n || G.lit <= 0.01) {
      lamp.intensity = 0;
      return;
    }
    lamp.position.set(n.l.x, n.l.y, n.l.z);
    lamp.intensity = G.lampPower * G.lit * n.l.st.on;
  });
}
const glowFields = new Map(); // "lantern:k" → its mesh
for (const kind of OBELISKS.kinds)
  if (LIT_KINDS.includes(kind))
    for (let k = 0; k < OBELISKS.heights; k++) {
      const g = buildLanternGlow(kind, k);
      if (!g) continue;
      const f = new THREE.InstancedMesh(g, LANTERN_GLOW.mat, MAX_STONES);
      f.visible = !NATURE_MODE;
      f.frustumCulled = false;
      f.count = 0;
      scene.add(f);
      glowFields.set(`${kind}:${k}`, f);
    }
// The stone shader's ground for an obelisk at a scale: the mound lane that
// puts the soil line at its foot (an unstretched lane of 1, as attachAttrs leaves it)
const stoneGround = (s) => (1 - STRETCH_FROM) * s - BURY;
// A cell's obelisks, placed once, as its trees are: left out are those off
// the grass, on a head's earth or in its reach, and any that would stand in
// a tree or another obelisk
function placedStones(g, cx, cz) {
  if (g.placedStones) return g.placedStones;
  g.placedStones = [];
  const keepOut = [];
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const n = groupAt(cx + di, cz + dj);
      for (const h of n) keepOut.push({ x: h.x, z: h.z, r: h.s < HANDS.minSize ? STONES.clear * h.s : statueReach(h) }); // an armless head keeps only a small clearing; an armed one, its arms' and head's whole reach
      if (di < 0 || (di === 0 && dj < 0)) for (const st of n.placedStones ?? []) keepOut.push(st);
    }
  for (const t of placedTrees(g, cx, cz)) keepOut.push({ x: t.x, z: t.z, r: t.r * 0.5 }); // clear of the trunk and the lower boughs
  for (const st of g.stones) {
    const r = obeliskRadius(st.scale, OBELISKS, st.kind);
    const clear = (o) => Math.hypot(o.x - st.x, o.z - st.z) >= o.r + r;
    if (!keepOut.every(clear) || !g.placedStones.every(clear)) continue;
    const mound = moundAt(st.x, st.z);
    if (mound > STONES.mound) continue;
    if (st.sea ? islandField(st.x, st.z) < ISLAND.shore : !beach.onGrass(st.x, st.z)) continue; // (out at sea, from the seabed, and never up on an island's shore)
    const y = landHeight(st.x, st.z) + mound - 0.05; // its foot a touch into the ground
    sceneryDummy.position.set(st.x, y, st.z);
    sceneryDummy.rotation.set(0, st.yaw, 0);
    sceneryDummy.scale.setScalar(st.scale);
    sceneryDummy.updateMatrix();
    const k = 1 + (hash(Math.round(st.x * 10), Math.round(st.z * 10), 181) * 2 - 1) * STONE_TINT;
    const f = stoneFields.get(`${st.kind}:${st.k}`);
    g.placedStones.push({ f, kind: st.kind, k: st.k, matrix: sceneryDummy.matrix.clone(), tint: new THREE.Color(k, k, k), x: st.x, y, z: st.z, r, s: st.scale, solid: f.geometry.userData.solid });
  }
  return g.placedStones;
}
const liveStones = []; // the obelisks in the meshes now
// How mossy the ground is at (x, z) from the obelisks (0 – 1): read off a
// grid each cell keeps (MOSS_GROUND.cell units a square), each square the
// most any of its obelisks gives it, fading out MOSS_GROUND.reach past its
// side. Built when the terrain first asks, from the cell's placed obelisks
function stoneMossAt(x, z) {
  const cx = Math.floor(x / GROUP.cell),
    cz = Math.floor(z / GROUP.cell);
  const g = groupAt(cx, cz);
  if (!g.mossGrid) {
    const M = MOSS_GROUND;
    g.mossGrid = new Map();
    for (const st of placedStones(g, cx, cz)) {
      const R = st.r + M.reach * st.s;
      for (let ix = Math.floor((st.x - R) / M.cell); ix <= Math.floor((st.x + R) / M.cell); ix++)
        for (let iz = Math.floor((st.z - R) / M.cell); iz <= Math.floor((st.z + R) / M.cell); iz++) {
          const d = Math.hypot((ix + 0.5) * M.cell - st.x, (iz + 0.5) * M.cell - st.z);
          const v = THREE.MathUtils.clamp(1 - (d - st.r) / (R - st.r), 0, 1);
          const key = ix * 100003 + iz;
          if (v > (g.mossGrid.get(key) ?? 0)) g.mossGrid.set(key, v);
        }
    }
  }
  return g.mossGrid.get(Math.floor(x / MOSS_GROUND.cell) * 100003 + Math.floor(z / MOSS_GROUND.cell)) ?? 0;
}
// A cell's lone arms, placed once: left out are those off the grass, in a
// head's reach, or in an obelisk or a tree. Each is set up as an arm is
// (straight up, its wrist `out` arm units over the ground), turned (yaw),
// then slanted over toward `tip` about where it comes out of the earth
// (loneMatrix); they reach for the bird from there (stepLoneArms)
const tiltM = new THREE.Matrix4(),
  tiltR = new THREE.Matrix4(),
  tiltBack = new THREE.Matrix4(),
  tiltAxis = new THREE.Vector3();
function loneMatrix(L, tip, slant, yaw, out) {
  const sy = Math.sin(yaw),
    cy = Math.cos(yaw);
  sceneryDummy.position.set(L.rx - RCZ * L.sc * sy, L.y + L.out * L.sc + L.drop * L.sc, L.rz - RCZ * L.sc * cy); // upright, its axis over its root
  sceneryDummy.rotation.set(0, yaw, 0);
  sceneryDummy.scale.setScalar(L.sc);
  sceneryDummy.updateMatrix();
  tiltAxis.set(Math.cos(tip), 0, -Math.sin(tip));
  tiltM.makeTranslation(L.rx, L.y, L.rz).multiply(tiltR.makeRotationAxis(tiltAxis, slant)).multiply(tiltBack.makeTranslation(-L.rx, -L.y, -L.rz));
  return out.multiplyMatrices(tiltM, sceneryDummy.matrix);
}
function placedLoneHands(g, cx, cz) {
  if (g.placedHands) return g.placedHands;
  g.placedHands = [];
  const keepOut = [];
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const n = groupAt(cx + di, cz + dj);
      for (const h of n) keepOut.push({ x: h.x, z: h.z, r: h.s < HANDS.minSize ? STONES.clear * h.s : statueReach(h) });
      for (const st of placedStones(n, cx + di, cz + dj)) keepOut.push(st);
      if (di < 0 || (di === 0 && dj < 0)) for (const lh of n.placedHands ?? []) keepOut.push(lh);
    }
  for (const t of placedTrees(g, cx, cz)) keepOut.push({ x: t.x, z: t.z, r: t.r * 0.5 });
  for (const lh of g.hands) {
    const len = (lh.out + HAND_LONG) * lh.sc; // root to fingertips, world units
    const reachOut = Math.sin(lh.slant) * len; // how far over the ground it reaches from its root
    const r = reachOut * 0.5 + handSpan(lh.lean) * lh.sc; // room for the widest pose it can take, not just the one it's dealt
    // Its spot: the first of those it was dealt (one, or a giant's few) that is clear
    let mx, mz, found = false;
    for (const sp of lh.spots ?? [lh]) {
      mx = sp.x + Math.sin(lh.tip) * reachOut * 0.5;
      mz = sp.z + Math.cos(lh.tip) * reachOut * 0.5; // its middle, over the ground
      const clear = (o) => Math.hypot(o.x - mx, o.z - mz) >= o.r + r;
      if (!keepOut.every(clear) || !g.placedHands.every(clear)) continue;
      if (!lh.sea && (!beach.onGrass(sp.x, sp.z) || !beach.onGrass(mx, mz))) continue; // (out at sea, from the seabed)
      lh.x = sp.x;
      lh.z = sp.z;
      found = true;
      break;
    }
    if (!found) continue;
    // A broken-off piece: the stump is all there is under the wrist, none of it buried (was out + BURY / sc: a column coming up out of the earth)
    const stretch = Math.max(MIN_STRETCH, lh.out);
    const B = Math.min(bendLen(stretch), WRIST_B);
    const L = {
      x: mx, z: mz, r, // for keeping things apart
      rx: lh.x, rz: lh.z, y: getHeight(lh.x, lh.z), // its root
      sc: lh.sc, out: lh.out, len,
      drop: B - spineEnd(lh.lean, B).up - STRETCH_FROM, // the wrist's bend, taken back out (as the arms have it)
      sea: !!lh.sea, // out at sea: holds still, never reaching
      name: lh.name, side: lh.side, stretch, mound: (stretch - lh.out) * lh.sc - BURY, curl: lh.lean,
      rest: { tip: lh.tip, slant: lh.slant, yaw: lh.yaw },
      S: { tip: lh.tip, slant: lh.slant, yaw: lh.yaw, grip: 0 }, // where it is now
      elbow: elbowTan(HANDS, hash(Math.round(lh.x * 10), Math.round(lh.z * 10), 206)),
      id: 1 + Math.floor(hash(Math.round(lh.x * 10), Math.round(lh.z * 10), 205) * 1000),
    };
    L.matrix = loneMatrix(L, L.S.tip, L.S.slant, L.S.yaw, new THREE.Matrix4());
    if (lh.lying) {
      // Lying along the ground, it lies on it: lifted so that no part of
      // it, column or hand, is under the grass (lyingLift); one that would
      // have to float to manage it is left out
      const lie = lieFlat(L);
      if (lie.lift > lie.rc + LIE.most * lh.sc) continue;
      L.y += Math.max(0, lie.lift);
      L.S.yaw = L.rest.yaw = lie.yaw; // turned about its own axis to lie on its flattest side
      L.lying = true;
      loneMatrix(L, L.S.tip, L.S.slant, L.S.yaw, L.matrix);
    }
    g.placedHands.push(L);
  }
  return g.placedHands;
}
// A lying hand lies on the ground: it is turned about its own axis (its
// yaw, LIE.yaws tried) to whichever way needs the least lift to have no
// part of it under the grass, and lifted that much: it rests on its
// flattest side, as a dropped hand would, the stump's end on the ground.
// The lowest point is found off the mesh itself: the column's underside
// (its true radius, read off the geometry) at either end of its axis, and
// every corner of the hand's hull, folded at the wrist as the shader folds
// it. The ground is taken as flat under it (the islands' grass is; a hand
// never lies on a mound), checked at the root, the wrist and the hand
const LIE = {
  clear: 0.04, // world units of air under the lowest point
  yaws: 12, // ways round its axis tried
  most: 0.35, // arm units the stump's end may be off the ground for the hand's sake, at most: past that the hand is left out
};
const loneShapes = {}; // "name:side" → { hull: the hand's corners about the wrist, rc: the column's radius }
const _lp = new THREE.Vector3(),
  _lieM = new THREE.Matrix4();
function armShape(name, side) {
  const geo = armGeos[name][side],
    pos = geo.attributes.position;
  let rc = 0;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < STRETCH_FROM - 0.15) rc = Math.max(rc, Math.hypot(pos.getX(i) - RCX, pos.getZ(i) - RCZ));
  return { hull: handPoints(geo, { x: RCX, z: RCZ }).points, rc };
}
function lieFlat(L) {
  const shape = (loneShapes[`${L.name}:${L.side}`] ??= armShape(L.name, L.side));
  const rc = shape.rc * L.sc;
  const c = Math.cos(L.curl),
    s = Math.sin(L.curl);
  let best = null;
  for (let k = 0; k < LIE.yaws; k++) {
    const yaw = L.rest.yaw + (k / LIE.yaws) * Math.PI * 2;
    const M = loneMatrix(L, L.rest.tip, L.rest.slant, yaw, _lieM);
    const w = _lp.set(RCX, STRETCH_FROM, RCZ).applyMatrix4(M); // the wrist, on the axis
    const wx = w.x, wy = w.y, wz = w.z;
    const len = Math.hypot(wx - L.rx, wy - L.y, wz - L.rz),
      dy = len > 1e-6 ? (wy - L.y) / len : 1;
    let low = Math.min(L.y, wy) - rc * Math.sqrt(Math.max(0, 1 - dy * dy)); // the column's underside at its lower end
    let ground = Math.max(getHeight(L.rx, L.rz), getHeight(wx, wz));
    let hx = 0, hz = 0;
    for (const p of shape.hull) {
      _lp.set(p.x + RCX, p.y * c - p.z * s + STRETCH_FROM, p.y * s + p.z * c + RCZ).applyMatrix4(M);
      low = Math.min(low, _lp.y);
      hx += _lp.x / shape.hull.length;
      hz += _lp.z / shape.hull.length;
    }
    ground = Math.max(ground, getHeight(hx, hz));
    const lift = ground + LIE.clear - low;
    if (!best || lift < best.lift) best = { yaw, lift, rc };
  }
  return best;
}
// How far any part of a lone hand stands off its column's axis (arm
// units), folded `lean` at the wrist, in whichever pose it is in: every
// pose it may morph to and the fist are measured, so its footprint holds
// all of them and a change of pose never reaches into its neighbours
const handSpans = new Map();
function handSpan(lean) {
  const key = lean.toFixed(2);
  if (handSpans.has(key)) return handSpans.get(key);
  const c = Math.cos(lean),
    s = Math.sin(lean);
  let most = 0;
  for (const name of POSE_NAMES)
    for (const side of [0, 1]) {
      const shape = (loneShapes[`${name}:${side}`] ??= armShape(name, side));
      most = Math.max(most, shape.rc);
      for (const p of shape.hull) most = Math.max(most, Math.hypot(p.x, p.y * s + p.z * c));
    }
  handSpans.set(key, most);
  return most;
}
// Each frame: a lone arm the bird comes near reaches up, straightening
// in its own plane (it never swings round, so never sweeps the ground), and
// flexes its fingers, closing them when the bird is right by it; once the
// bird has gone it settles back as it lay
// A hand the bird comes near takes up another pose (and another every
// `change` seconds while it stays), morphing to it; right by the bird it
// closes to a fist (GRAB), and opens again as the bird draws off. An
// upright one straightens too. (It used to flex its fingers open and shut
// over and over instead: flex and flexBy, 0 now)
const LONE_REACH = { near: 40, up: 0.08, flex: 0, flexBy: 0, change: 3.5, ease: 1.6 }; // world units from its root it notices the bird at; radians off upright it straightens to; flexes a second, and how far the fingers close in a flex; seconds between one pose and the next; how quickly it morphs (per second)
function stepLoneArms(delta) {
  if (NATURE_MODE) return;
  for (const L of liveHands) {
    const bx = player.position.x - L.rx,
      bz = player.position.z - L.rz,
      by = player.position.y - (L.y + L.out * L.sc);
    if (L.sea) {
      // Out at sea: no reaching; it morphs to another pose each time the bird comes over
      const over = HANDS_MOVE && Math.hypot(bx, bz) < SEA.wake[0];
      if (over && !L.over) {
        const others = POSE_NAMES.filter((n) => n !== L.name && n !== GRAB.pose);
        L.to = others[Math.floor(Math.random() * others.length)] ?? L.name;
      }
      L.over = over;
      stepPose(L, L.to ?? null, delta);
      continue;
    }
    const near = HANDS_MOVE && Math.hypot(bx, bz) < LONE_REACH.near;
    const S = L.S;
    // Its pose: another as the bird arrives, and every `change` seconds
    // while it stays; a fist while the bird is right by it (stepPose
    // morphs to whichever it is after, without a jump)
    if (near && !L.near) L.changeT = LONE_REACH.change;
    L.near = near;
    let want = null;
    if (near) {
      L.changeT += delta;
      if (L.changeT >= LONE_REACH.change) {
        L.changeT = 0;
        const others = POSE_NAMES.filter((n) => n !== L.name && n !== GRAB.pose);
        L.to = others[Math.floor(Math.random() * others.length)] ?? L.name;
      }
      const close = 1 - THREE.MathUtils.smoothstep(Math.hypot(bx, by, bz) / L.sc, GRAB.close, GRAB.open); // right by it: shut
      L.fist = close > (L.fist ? 0.35 : 0.65); // a gap between shutting and opening, so it can't flicker at the line
      want = L.fist ? GRAB.pose : L.to;
    } else L.fist = false;
    stepPose(L, want, delta);
    if (L.lying) continue; // lying along the ground, it lies there: it never straightens
    const slantTo = near ? Math.min(L.rest.slant, LONE_REACH.up) : L.rest.slant;
    const k1 = 1 - Math.exp(-delta * (near ? GRAB.follow : GRAB.settle)),
      most = GRAB.speed * delta;
    const was = S.slant;
    S.slant += THREE.MathUtils.clamp((slantTo - S.slant) * k1, -most, most); // its tip and yaw stay as they lay
    if (Math.abs(S.slant - was) > 1e-5) {
      loneMatrix(L, S.tip, S.slant, S.yaw, L.matrix);
      sounds.arm(`lone${L.id}:${L.rx.toFixed(0)}`, L.rx, L.y, L.rz, L.sc, 0, S.slant - was, 0, delta);
    }
  }
}
// A lone hand's morph, from its pose (`name`) toward `target`, S.grip of
// the way (the mesh for that pair blends the two). It only ever runs to one
// end or the other: asked for a third pose mid-morph, it finishes to
// whichever end is nearer and sets off from there, so the shape never
// jumps. It goes at a steady pace eased at both ends, so it lands exactly
// and the next morph starts from rest. A fist is held, never taken up as
// its pose: once the bird draws off it opens back to the pose it had
const MORPH = { pose: 1.2, fist: 0.5 }; // seconds end to end: to another pose, to a fist
function stepPose(L, want, delta) {
  const S = L.S;
  if (want === L.name) want = null;
  if (!L.target) {
    if (!want) return;
    L.target = want;
    S.u = 0;
  }
  const keeps = L.target !== GRAB.pose; // a pose it arrives at becomes its own
  const toward = want === L.target || (want && keeps && S.u >= 0.5) ? 1 : 0;
  const time = keeps ? MORPH.pose : MORPH.fist;
  S.u = THREE.MathUtils.clamp(S.u + Math.sign(toward - S.u) * (delta / time), 0, 1);
  S.grip = S.u * S.u * (3 - 2 * S.u);
  if (S.u === 1 && keeps) {
    L.name = L.target; // arrived: the same shape, now its pose
    L.target = null;
    S.u = S.grip = 0;
  } else if (S.u === 0 && toward === 0) L.target = null; // back at its pose
}
const liveHands = []; // the lone hands drawn now
let sceneryCX = null,
  sceneryCZ = null;
const riverForward = new THREE.Vector3(0, 0, 1),
  riverNormal = new THREE.Vector3(),
  riverQuat = new THREE.Quaternion();
function rebuildRivers(cx, cz) {
  for (const child of riverGroup.children) {
    riverGroup.remove(child);
    child.geometry?.dispose();
  }
  for (let di = -SCENERY_REACH; di <= SCENERY_REACH; di++)
    for (let dj = -SCENERY_REACH; dj <= SCENERY_REACH; dj++) {
      const g = groupAt(cx + di, cz + dj), island = g.island;
      if (!island || Math.hypot(island.x - player.position.x, island.z - player.position.z) > HAZE.far + island.r) continue;
      for (const river of island.rivers) {
        const points = river.points.map((p) => new THREE.Vector3(p.x, landHeight(p.x, p.z) + 0.16, p.z));
        const curve = new THREE.CatmullRomCurve3(points);
        const stream = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, Math.max(0.55, island.r * 0.008), 6, false), riverMaterial);
        stream.frustumCulled = false;
        riverGroup.add(stream);
        const spring = new THREE.Mesh(new THREE.CircleGeometry(Math.max(3.5, island.r * 0.045), 12), riverMaterial);
        spring.rotation.x = -Math.PI / 2;
        spring.position.copy(points[0]).y += 0.08;
        riverGroup.add(spring);
        if (river.waterfall < 0) continue;
        const i = river.waterfall, a = points[i], b = points[i + 1];
        const drop = a.y - b.y;
        if (drop < 0.7) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        riverNormal.set(dz, 0, -dx).normalize();
        riverQuat.setFromUnitVectors(riverForward, riverNormal);
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(2.4, island.r * 0.035), Math.max(2.2, drop * 1.8)), fallMaterial);
        sheet.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        sheet.quaternion.copy(riverQuat);
        sheet.frustumCulled = false;
        riverGroup.add(sheet);
      }
    }
}
function updateScenery() {
  const cx = Math.floor(player.position.x / GROUP.cell),
    cz = Math.floor(player.position.z / GROUP.cell);
  if (cx === sceneryCX && cz === sceneryCZ) return; // the same cells as last time
  sceneryCX = cx;
  sceneryCZ = cz;
  rebuildRivers(cx, cz);
  for (const f of treeFields.flat()) f.count = 0;
  liveTrees.length = 0;
  for (let di = -SCENERY_REACH; di <= SCENERY_REACH; di++)
    for (let dj = -SCENERY_REACH; dj <= SCENERY_REACH; dj++)
      for (const t of placedTrees(groupAt(cx + di, cz + dj), cx + di, cz + dj))
        if (t.f.count < MAX_TREES) {
          t.slot = t.f.count;
          t.f.setColorAt(t.f.count, t.tint);
          t.f.setMatrixAt(t.f.count++, t.shake ? shakeMatrix(t) : t.matrix);
          liveTrees.push(t);
        }
  for (const f of treeFields.flat()) {
    f.instanceMatrix.needsUpdate = true;
    f.instanceColor.needsUpdate = true;
  }
  // ...the rubble
  for (const f of rubbleFields.values()) f.count = 0;
  liveRubble = 0;
  for (let di = -SCENERY_REACH; di <= SCENERY_REACH; di++)
    for (let dj = -SCENERY_REACH; dj <= SCENERY_REACH; dj++)
      for (const p of placedRubble(groupAt(cx + di, cz + dj)))
        if (p.f.count < MAX_RUBBLE) {
          p.f.setColorAt(p.f.count, p.tint);
          p.f.setMatrixAt(p.f.count++, p.matrix);
          liveRubble++;
        }
  for (const f of rubbleFields.values()) {
    f.instanceMatrix.needsUpdate = true;
    f.instanceColor.needsUpdate = true;
  }
  if (NATURE_MODE) return;
  // ...the fallen heads
  for (const f of [...fallenFields, ...stumpFields]) f.count = 0;
  for (let di = -SCENERY_REACH; di <= SCENERY_REACH; di++)
    for (let dj = -SCENERY_REACH; dj <= SCENERY_REACH; dj++)
      for (const p of placedFallen(groupAt(cx + di, cz + dj), cx + di, cz + dj))
        if (p.f.count < MAX_FALLEN) {
          p.f.setColorAt(p.f.count, p.tint);
          p.f.setMatrixAt(p.f.count++, p.matrix);
        }
  for (const f of [...fallenFields, ...stumpFields]) {
    f.instanceMatrix.needsUpdate = true;
    f.instanceColor.needsUpdate = true;
  }
  // ...and the obelisks
  for (const f of [...stoneFields.values(), ...glowFields.values()]) f.count = 0;
  pools.count = 0;
  liveLanterns.length = 0;
  liveStones.length = 0;
  for (let di = -SCENERY_REACH; di <= SCENERY_REACH; di++)
    for (let dj = -SCENERY_REACH; dj <= SCENERY_REACH; dj++)
      for (const st of placedStones(groupAt(cx + di, cz + dj), cx + di, cz + dj))
        if (st.f.count < MAX_STONES) {
          st.f.setColorAt(st.f.count, st.tint);
          st.f.attrs.mound.setX(st.f.count, stoneGround(st.s));
          st.f.setMatrixAt(st.f.count++, st.matrix);
          const glow = glowFields.get(`${st.kind}:${st.k}`); // a lit kind's windows (LIT_KINDS)
          if (glow && glow.count < MAX_STONES) {
            const gi = glow.count++;
            glow.setMatrixAt(gi, st.matrix);
            // its pool of light on the ground, and where a lamp would sit in it
            sceneryDummy.position.set(st.x, st.y + 0.12, st.z);
            sceneryDummy.rotation.set(0, 0, 0);
            sceneryDummy.scale.setScalar(LANTERN_GLOW.pool * st.s);
            sceneryDummy.updateMatrix();
            const pi = pools.count++;
            pools.setMatrixAt(pi, sceneryDummy.matrix);
            // Off until the bird has come by (st.on, kept with the lantern, eased on in stepLanterns)
            if (st.on === undefined) {
              st.on = 0;
              // One the bird is already by when it first appears (at the start: nothing else appears that close) is lit as found, with no ping
              if (Math.hypot(st.x - player.position.x, st.z - player.position.z) < LANTERN_GLOW.wake) st.on = st.lit = st.rang = 1;
            }
            const L = {
              st, glow, gi, pi, x: st.x, y: st.y + glow.geometry.userData.light * st.s, z: st.z,
              key: `${st.x.toFixed(1)},${st.z.toFixed(1)}`, id: Math.floor(hash(Math.round(st.x), Math.round(st.z), 61) * 1e6), // for its pings: which, and when
            };
            shadeLantern(L);
            liveLanterns.push(L);
          }
          liveStones.push(st);
        }
  for (const f of stoneFields.values()) {
    f.instanceMatrix.needsUpdate = true;
    f.instanceColor.needsUpdate = true;
    f.attrs.mound.needsUpdate = true;
  }
  for (const f of glowFields.values()) {
    f.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  }
  pools.instanceMatrix.needsUpdate = true;
  if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
  // ...and the lone hands (drawn with the arms, every frame: placeHeads)
  liveHands.length = 0;
  for (let di = -SCENERY_REACH; di <= SCENERY_REACH; di++)
    for (let dj = -SCENERY_REACH; dj <= SCENERY_REACH; dj++) liveHands.push(...placedLoneHands(groupAt(cx + di, cz + dj), cx + di, cz + dj));
}

// Trees are solid, and shake when the bird bumps them. The trunk is a
// leaning cylinder, the canopy its blobs as spheres (scenery.js
// buildTree's geometry.userData.solid); a bump tips the tree away from the
// bird about its foot, and it sways back and forth, settling
const TREE_SHAKE = {
  tilt: 0.02, // radians the first sway tips the tree: a gentle rustle
  sway: 14, // how fast it sways, radians of phase per second: a quick flutter, not a rock
  settle: 3, // how fast the sway dies away, per second
};
const liveTrees = []; // the placed trees in the meshes now, each with its slot
const shaking = new Set();
const shakeQ = new THREE.Quaternion(),
  shakeAxis = new THREE.Vector3(),
  shakeM = new THREE.Matrix4();
// A shaking tree's matrix: its rest matrix tipped about its foot
function shakeMatrix(t) {
  const { dx, dz, age } = t.shake;
  const a = TREE_SHAKE.tilt * Math.exp(-age * TREE_SHAKE.settle) * Math.cos(age * TREE_SHAKE.sway);
  shakeQ.setFromAxisAngle(shakeAxis.set(dz, 0, -dx), a); // tips toward (dx, dz)
  sceneryDummy.position.set(t.x, t.y, t.z);
  sceneryDummy.rotation.set(0, t.yaw, 0);
  sceneryDummy.quaternion.premultiply(shakeQ);
  sceneryDummy.scale.setScalar(t.s);
  sceneryDummy.updateMatrix();
  return shakeM.copy(sceneryDummy.matrix);
}
// Push the bird out of a tree (in the tree's own frame); true if it touched
const inTree = new THREE.Vector3();
function bumpTree(t) {
  const S = t.solid;
  const c = Math.cos(t.yaw),
    sn = Math.sin(t.yaw),
    br = BIRD_R / t.s;
  // The bird in the tree's frame: foot at the origin, unscaled, unturned
  const wx = player.position.x - t.x,
    wz = player.position.z - t.z;
  inTree.set((wx * c - wz * sn) / t.s, (player.position.y - t.y) / t.s, (wx * sn + wz * c) / t.s);
  let hit = false;
  // The trunk, its axis leaning over to (lean) at its top
  if (inTree.y < S.h + 1) {
    const up = THREE.MathUtils.clamp(inTree.y / S.h, 0, 1);
    const rx = inTree.x - S.lean[0] * up,
      rz = inTree.z - S.lean[1] * up;
    const rd = Math.hypot(rx, rz),
      rr = S.girth + br;
    if (rd < rr && rd > 0) {
      inTree.x += (rx / rd) * (rr - rd);
      inTree.z += (rz / rd) * (rr - rd);
      hit = true;
    }
  }
  for (const b of S.blobs) {
    const d = inTree.distanceTo(b.c),
      rr = b.r + br;
    if (d < rr && d > 0) {
      inTree.lerp(b.c, 1 - rr / d); // out along the line from the blob's centre
      hit = true;
    }
  }
  if (!hit) return false;
  // Back to the world
  player.position.set(t.x + (inTree.x * c + inTree.z * sn) * t.s, t.y + inTree.y * t.s, t.z + (-inTree.x * sn + inTree.z * c) * t.s);
  return true;
}
function stepTrees(delta) {
  // The lone arms are solid: a few balls along each, from its root to its hand, as it leans now
  for (const lh of liveHands) {
    if (Math.hypot(player.position.x - lh.rx, player.position.z - lh.rz) > lh.len + 2 + BIRD_R) continue;
    const st = Math.sin(lh.S.slant),
      ct = Math.cos(lh.S.slant),
      sx = Math.sin(lh.S.tip),
      sz = Math.cos(lh.S.tip);
    for (let t = 0.15; t <= 1.001; t += 0.2) pushOut(probe.set(lh.rx + sx * st * lh.len * t, lh.y + ct * lh.len * t, lh.rz + sz * st * lh.len * t), (t > 0.8 ? 0.55 : 0.35) * lh.sc + BIRD_R);
  }
  // The obelisks are solid too, and don't shake: the bird is put back out
  // of the plinth, or the shaft above it, sideways
  for (const st of liveStones) {
    const S = st.solid,
      dy = player.position.y - st.y;
    if (dy > S.top * st.s + BIRD_R || dy < -BIRD_R) continue;
    const rr = (dy < 0.7 * st.s ? S.r : S.shaftR) * st.s + BIRD_R;
    const dx = player.position.x - st.x,
      dz = player.position.z - st.z,
      d = Math.hypot(dx, dz);
    if (d < rr && d > 0) {
      player.position.x = st.x + (dx / d) * rr;
      player.position.z = st.z + (dz / d) * rr;
    }
  }
  for (const t of liveTrees) {
    if (Math.hypot(player.position.x - t.x, player.position.z - t.z) > t.r + BIRD_R) continue;
    if (!bumpTree(t)) continue;
    // A fresh shake, unless it's still swaying hard from the last one
    if (t.shake && Math.exp(-t.shake.age * TREE_SHAKE.settle) > 0.5) continue;
    const dx = t.x - player.position.x,
      dz = t.z - player.position.z,
      d = Math.hypot(dx, dz) || 1;
    t.shake = { dx: dx / d, dz: dz / d, age: 0 };
    shaking.add(t);
  }
  for (const t of shaking) {
    t.shake.age += delta;
    const settled = Math.exp(-t.shake.age * TREE_SHAKE.settle) < 0.01;
    if (settled) {
      t.shake = null;
      shaking.delete(t);
    }
    if (!liveTrees.includes(t)) continue; // streamed out: nothing to redraw
    t.f.setMatrixAt(t.slot, settled ? t.matrix : shakeMatrix(t));
    t.f.instanceMatrix.needsUpdate = true;
  }
}

await loading("planting the flowers", 0.92); // a step of the bar, so it does not sit still through the rest of the field

// =====================================================================
// Flowers on the islands
// =====================================================================
// The mound under a spot, from the heads of the 3×3 cells about it (the
// same sum as moundAt, without its cell-by-cell lookups: thousands of
// spots are asked per island)
function moundNear(x, z, cx, cz) {
  let h = 0;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++)
      for (const m of groupAt(cx + di, cz + dj)) {
        const gx = Math.floor(m.x / SPACING),
          gz = Math.floor(m.z / SPACING);
        for (const md of moundsOf(gx, gz, m)) {
          const t = 1 - Math.hypot(md.x - x, md.z - z) / md.r;
          if (t > 0) h += md.h * moundRise(t);
        }
      }
  return h;
}
// Flowers in the grass: little clusters of daisies scattered over each
// island, each cluster one colour (flowers.js DAISY_LOOKS, the wildflower
// colours) with its petal counts and cups mixed, kept off the heads' earth
// placed once per cell and kept (like the trees), refilled when the bird
// changes coarse cell. One mesh per look; they take shadows and cast none.
// The daisy itself, its size, and how many to a cluster and how close are
// flowers.js MEADOW_DAISY's, shared with the scene lab
const MEADOW = {
  ...MEADOW_DAISY,
  shape: "tulip",
  stem: 0.46,
  tulip: { petals: 5, width: 0.075, depth: 0.075, height: 0.17, spread: 0.055, stalk: 0.014, leafLength: 0.34, leafWidth: 0.09, leafThickness: 0.035 },
  scale: [2.6, 3.5],
  mound: 0.35, // world units of mound under a daisy at most: the earth above that is bare
  lean: 0.2, // radians a stem may lean off upright
  count: [2000, 2400], // flowers & creeps across each island's open garden clearing
  max: 2400, // per look: bounded GPU instance storage
  reach: 1, // coarse cells out from the bird's the meadow is filled (the trees go SCENERY_REACH): a flower is lost in the haze long before that
};
// The lab's colours stay customizable, but the garden boosts their saturation
// and lets pink lead, with sunny, warm and cool patches between the blooms.
const gardenColour = (hex) => {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.max(0.72, hsl.s), Math.max(0.48, hsl.l));
  return color.getHex();
};
const meadowLooks = daisyLooks({ colors: FLOWER_KEYS.map((key, i) => ({
  petal: gardenColour(LAB_PALETTE[key]),
  heart: LAB_PALETTE.hearts,
  weight: [4.2, 1.1, 0.9, 0.8][i] ?? 1,
})) });
const meadowMat = treeMaterial(); // vertex-coloured
rimSink(meadowMat, true);
const meadowFields = meadowLooks.map((look) => {
  const g = buildMeadowDaisy(look);
  const f = new THREE.InstancedMesh(g, meadowMat, MEADOW.max);
  f.frustumCulled = false;
  f.castShadow = false;
  f.receiveShadow = false;
  f.count = 0;
  scene.add(f);
  return f;
});
function placedMeadow(g, cx, cz) {
  if (g.meadow) return g.meadow;
  g.meadow = [];
  const isl = g.island;
  if (!isl || g.special || !isl.garden) return g.meadow; // no flowers on a special isle
  const garden = isl.garden;
  const draw = (i, seed) => hash(cx * 64 + (i & 63), cz * 4096 + (i >> 6), seed);
  // The obelisks standing in this cell and its neighbours: no flower grows into one
  const stones = [];
  if (!NATURE_MODE) for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) stones.push(...placedStones(groupAt(cx + di, cz + dj), cx + di, cz + dj), ...placedLoneHands(groupAt(cx + di, cz + dj), cx + di, cz + dj));
  const nPetals = petalCounts().length;
  for (let c = 0; c < 1; c++) {
    const ox = garden.x, oz = garden.z;
    if (!beach.onGrass(ox, oz)) continue;
    const spread = garden.r;
    const count = MEADOW.count[0] + Math.floor(draw(c, 184) * (MEADOW.count[1] - MEADOW.count[0] + 1));
    for (let k = 0; k < count; k++) {
      const i = c * 64 + k;
      const fa = draw(i, 185) * Math.PI * 2,
        fd = Math.sqrt(draw(i, 186)) * spread;
      const x = ox + Math.sin(fa) * fd,
        z = oz + Math.cos(fa) * fd;
      if (!beach.onGrass(x, z)) continue; // off the grass
      const land = landHeight(x, z);
      const mound = moundNear(x, z, cx, cz);
      if (mound > MEADOW.mound) continue; // on a head's earth
      if (!NATURE_MODE && stones.some((st) => Math.hypot(st.x - x, st.z - z) < st.r + MEADOW.leaves.length * MEADOW.scale[1])) continue; // in an obelisk, leaves and all
      sceneryDummy.position.set(x, land + mound - 0.02, z);
      sceneryDummy.rotation.set((draw(i, 187) * 2 - 1) * MEADOW.lean, draw(i, 188) * Math.PI * 2, (draw(i, 189) * 2 - 1) * MEADOW.lean, "YXZ");
      const scale = MEADOW.scale[0] + draw(i, 190) * (MEADOW.scale[1] - MEADOW.scale[0]);
      sceneryDummy.scale.setScalar(scale);
      sceneryDummy.updateMatrix();
      // Dense garden plants naturally overlap leaves while the light, low-poly
      // tulip heads remain individually instanced on the GPU.
      const look = pickLook(meadowLooks, draw(i, 191));
      g.meadow.push({ f: meadowFields[look], matrix: sceneryDummy.matrix.clone() });
    }
  }
  return g.meadow;
}
let meadowCX = null,
  meadowCZ = null;
function updateMeadow() {
  const cx = Math.floor(player.position.x / GROUP.cell),
    cz = Math.floor(player.position.z / GROUP.cell);
  if (cx === meadowCX && cz === meadowCZ) return;
  meadowCX = cx;
  meadowCZ = cz;
  for (const f of meadowFields) f.count = 0;
  for (let di = -MEADOW.reach; di <= MEADOW.reach; di++)
    for (let dj = -MEADOW.reach; dj <= MEADOW.reach; dj++)
      for (const { f, matrix } of placedMeadow(groupAt(cx + di, cz + dj), cx + di, cz + dj)) if (f.count < MEADOW.max) f.setMatrixAt(f.count++, matrix);
  for (const f of meadowFields) f.instanceMatrix.needsUpdate = true;
}

await loading("finding the bird", 0.97); // a step of the bar, so it does not sit still through the rest of the field

// =====================================================================
// The player: a low-poly albatross
// =====================================================================
// Built in albatross.js (white body, long narrow wings with dark outer panels,
// pale pink beak) from ALBATROSS's knobs, as the albatross tab last set them.
// It always glides forward; you steer.
const bird = buildAlbatross(BIRD);
const { player, body } = bird; // player: its place and heading; body: its bank and pitch
scene.add(player);
const cloudDeck = new CloudDeck(scene, hash, GROUP.cell);
const wildlife = new SkyFlocks(scene, SEED, groupAt, getHeight, 96);
const landLife = new LandLife(scene, groupAt, getHeight, 60);

// ---- Flight ----
const CRUISE = 18; // gliding speed
const PACE = 0.75; // the whole flight's speed, cruise, dive and climb alike, of the speeds below (1: as first tuned)
const BANK = 55; // degrees the bird banks in a full held turn, inside wing down (was 31.5, and the wrong way: the outside wing dropped)
let heading = Math.PI; // which way it's flying
let pitchA = 0; // climb (+) / dive (−)
let roll = 0; // banking, for the body and wings
player.position.set(0, Math.max(getHeight(0, 0), WATER_Y) + 9, 0);

// Follow camera: orbits the cube, drag to look, scroll to zoom
// The camera trails the bird: it sits behind the heading, so turning with
// the keys swings the view too. Dragging looks around from there, and the
// view eases back behind the bird once the drag ends.
const CAMERA = {
  settle: 1.5, // per second: how quickly a drag's look-around eases back behind the bird (0 = it stays)
};
let lookYaw = 0, // the drag's turn away from straight behind
  pitch = 0.45, // a little more from above (was 0.35)
  distance = PHONE_VIEW?.distance ?? 15, // world units behind the bird: a wider look round it (was 7)
  dragging = false;
// On a touch screen a drag steers instead of looking round: how far the
// finger has gone from where it came down turns the bird (right, right)
// and climbs it (up, up), as the keys do but by degrees; let go, and it
// levels out. The camera is already behind the heading, so it follows
const TOUCH = {
  reach: 55, // px the finger goes from where it came down for a full turn (or climb)
  holdMs: 200, // ms of touch-and-hold before speed boost activates
};
const touchSteer = { id: null, x: 0, y: 0, turn: 0, climb: 0 };
const activeTouches = new Map();
renderer.domElement.addEventListener("pointerdown", (e) => {
  renderer.domElement.setPointerCapture(e.pointerId);
  if (e.pointerType === "touch") {
    activeTouches.set(e.pointerId, performance.now());
    if (touchSteer.id === null) Object.assign(touchSteer, { id: e.pointerId, x: e.clientX, y: e.clientY });
    return;
  }
  dragging = true;
});
const endTouchSteer = (e) => {
  activeTouches.delete(e.pointerId);
  if (e.pointerId === touchSteer.id) Object.assign(touchSteer, { id: null, turn: 0, climb: 0 });
};
renderer.domElement.addEventListener("pointerup", (e) => {
  endTouchSteer(e);
  if (e.pointerType !== "touch") dragging = false;
});
renderer.domElement.addEventListener("pointercancel", endTouchSteer);
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerId === touchSteer.id) {
    touchSteer.turn = THREE.MathUtils.clamp((e.clientX - touchSteer.x) / TOUCH.reach, -1, 1);
    touchSteer.climb = THREE.MathUtils.clamp(-(e.clientY - touchSteer.y) / TOUCH.reach, -1, 1);
    return;
  }
  if (!dragging) return;
  lookYaw -= e.movementX * 0.005;
  pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.005, 0.05, 1.3);
});
renderer.domElement.addEventListener(
  "wheel",
  (e) => {
    distance = THREE.MathUtils.clamp(distance + e.deltaY * 0.01, 3, 20);
  },
  { passive: true },
);

const keys = {};
addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Space") e.preventDefault();
  if (e.code === "KeyJ" && !e.repeat) {
    jitterLog = !jitterLog;
    jitter.at = performance.now() / 1000;
    console.log(`arm jitter log ${jitterLog ? "on: reversals a second, over all arms" : "off"}`);
  }
  if (e.code === "KeyP" && !e.repeat) {
    perfLog = !perfLog;
    console.log(`perf log ${perfLog ? "on: once a second, frames a second and what is drawn" : "off"}`);
  }
});
// P toggles the perf log: once a second, the frame rate (and the slowest
// frame), and how many statues, arms, obelisks, trees and lone arms are
// placed, and how many stone sounds play: which says what the field is
// carrying when it slows
let perfLog = false;
const perf = { frames: 0, worst: 0, at: 0 };
function logPerf(delta, now) {
  perf.frames++;
  perf.worst = Math.max(perf.worst, delta);
  if (now - perf.at < 1) return;
  const fps = perf.frames / (now - perf.at);
  const heap = performance.memory?.usedJSHeapSize;
  console.log(`${fps.toFixed(0)} fps (slowest ${(perf.worst * 1000).toFixed(0)} ms) · draw calls ${renderer.info.render.calls}, triangles ${renderer.info.render.triangles}, geometries ${renderer.info.memory.geometries}, trees ${liveTrees.length}, birds ${wildlife.density}, animals ${Math.min(landLife.active.length, landLife.density)}${heap ? `, JS heap ${(heap / 1048576).toFixed(0)} MB` : ""}`);
  perf.frames = 0;
  perf.worst = 0;
  perf.at = now;
}
addEventListener("keyup", (e) => (keys[e.code] = false));

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
});

// Shortest-path angle interpolation, so turning never spins the long way around
// An angle brought into (-π, π]
function wrapAngle(a) {
  let d = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const moveDir = new THREE.Vector3(),
  camTarget = new THREE.Vector3(),
  camOffset = new THREE.Vector3(),
  lookTarget = new THREE.Vector3();
camera.position.set(
  0,
  player.position.y + Math.sin(pitch) * distance,
  Math.cos(pitch) * distance,
);
camOffset.subVectors(camera.position, player.position);

const clock = new THREE.Clock();
// Snow settles on the land, the trees and the meadow, the statues (their
// heads and hands), the obelisks and the rubble (SNOW, addSnow)
for (const m of [terrain.material, meadowMat, plaster, handMat, stoneMat, rubbleMat, fallenMat]) addSnow(m);
addSnow(treeMat, SNOW.treeSlope); // (the spires take it on their steep faces too)

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  if (perfLog) logPerf(delta, performance.now() / 1000);
  if (started && !document.hidden) stepQuality(delta); // the resolution follows how the frames are keeping up (not on the loading screen, which is light)

  // Steering: A/D turn, W climb, S dive, or a finger's drag (TOUCH). The bird never stops gliding.
  const climb = THREE.MathUtils.clamp(
    (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + touchSteer.climb,
    -1,
    1,
  );
  const turn = THREE.MathUtils.clamp(
    (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchSteer.turn,
    -1,
    1,
  );

  heading -= turn * 1.5 * delta;
  pitchA += (climb * 0.72 - pitchA) * Math.min(1, delta * 3);

  // Diving trades height for speed, climbing bleeds it off
  const nowMs = performance.now();
  let touchHoldBoost = false;
  for (const downAt of activeTouches.values()) {
    if (nowMs - downAt >= TOUCH.holdMs) {
      touchHoldBoost = true;
      break;
    }
  }
  const boost = keys.Space || touchHoldBoost ? 1.7 : 1;
  const speed = THREE.MathUtils.clamp(CRUISE - pitchA * 11, 11, 31) * PACE * boost;
  moveDir.set(
    Math.sin(heading) * Math.cos(pitchA),
    Math.sin(pitchA),
    Math.cos(heading) * Math.cos(pitchA),
  );
  if (started) player.position.addScaledVector(moveDir, speed * delta); // held on the loading screen
  if (started) {
    // Pushed downwind (WIND), much harder the harder it blows; and in a
    // strong wind turned toward downwind, faster the further off it the
    // bird is heading (the turn's sign takes the short way round)
    const push = WIND.push * Math.pow(Math.max(windNow, 0), WIND.pushCurve);
    player.position.x += windDir.x * push * delta;
    player.position.z += windDir.y * push * delta;
    const off = wrapAngle(Math.atan2(windDir.x, windDir.y) - heading); // from the heading round to downwind
    heading += WIND.vane * windNow * windNow * Math.sin(off) * delta;
  }

  // Never fly into a hill or the sea: skim just above the ground instead
  const floorY = Math.max(getHeight(player.position.x, player.position.z), WATER_Y) + 1.4;
  if (player.position.y < floorY) {
    player.position.y = floorY;
    if (pitchA < 0) pitchA *= 0.5; // the dive flattens out
  }
  const skimming = stepWake(delta, player.position, moveDir, WATER_Y + 1.4); // foam behind the bird while it skims the sea

  player.rotation.y = heading;

  // Body language: bank into turns, nose follows the climb
  roll += (turn * THREE.MathUtils.degToRad(BANK) - roll) * Math.min(1, delta * 4); // +z rotation drops the right (-x) wing, the inside of a D turn
  body.rotation.z = roll;
  body.rotation.x = -pitchA * 0.7;

  // Wings: a slow glide bow most of the time, real flapping when climbing
  bird.beat(delta, pitchA);

  // Camera trails behind, and never sinks into a hill
  if (!dragging) lookYaw *= Math.max(0, 1 - delta * CAMERA.settle); // back behind the bird
  const camYaw = heading + Math.PI + lookYaw; // straight behind the heading, plus the look-around
  camTarget.set(
    player.position.x + Math.sin(camYaw) * Math.cos(pitch) * distance,
    player.position.y + Math.sin(pitch) * distance,
    player.position.z + Math.cos(camYaw) * Math.cos(pitch) * distance,
  );
  // Eased as an offset from the bird, not as a position chasing it: a
  // chase lags by speed × frame time, so uneven frames shook the bird on
  // screen. The offset only swings as the heading and look change.
  camOffset.lerp(camTarget.sub(player.position), 1 - Math.exp(-delta * 6));
  camera.position.copy(player.position).add(camOffset);
  const minY = Math.max(getHeight(camera.position.x, camera.position.z), WATER_Y) + 0.5;
  if (camera.position.y < minY) camera.position.y = minY;
  lookTarget.copy(player.position).y += 0.5;
  camera.lookAt(lookTarget);

  // Stream the world in around the player
  const cx = snap(player.position.x),
    cz = snap(player.position.z);
  if ((cx !== lastCX || cz !== lastCZ) && !terrainJob) {
    startTerrain(cx, cz, lastCX === null);
    lastCX = cx;
    lastCZ = cz;
  }
  stepTerrain();
  rimUniforms.uRimCenter.value.set(player.position.x, player.position.z);
  const tx = Math.floor(player.position.x / SPACING),
    tz = Math.floor(player.position.z / SPACING);
  if (tx !== lastTX || tz !== lastTZ) {
    updateHeads(tx, tz);
    updateScenery();
    updateFoam();
    updateMeadow();
    lastTX = tx;
    lastTZ = tz;
  }
  // The sea, its bed and its foam ride with the bird every frame (moved in
  // steps, their far edges jumped against the horizon)
  skirt.position.x = water.position.x = foam.position.x = player.position.x;
  skirt.position.z = water.position.z = foam.position.z = player.position.z;
  // The lace wanders a little across and a little along, in world units,
  // scaled into noise space by the patch size
  foamMat.uniforms.uDrift.value.x += (FOAM.drift * 0.8 * delta) / FOAM.scale;
  foamMat.uniforms.uDrift.value.y += (FOAM.drift * 0.6 * delta) / FOAM.scale;
  if (started) stepDay(delta); // the day turns as the bird flies
  stepWeather(delta); // the weather comes and goes on its own (unless taken over)
  paintSettings(); // the settings' bars follow the day and the weather (only while open; the button's icon always)
  stepWind(delta); // the wind gusts, and the trees lean with it
  stepWindFx(delta); // its lines and specks stream past
  stepRain(delta); // the rain comes and goes with its box, and falls round the bird
  stepSnow(delta); // the snow falls, and settles, and melts
  stepIce(delta); // ...and the sea freezes out from the shores, and thaws
  sounds.listen(camera); // where the ear is, and grinds that have stopped fade out
  // The sea's sound: how far the bird is from the water, across to the
  // waterline (the shore has fallen to the water SHORE_OUT past the grass's
  // edge) and up from its surface, whether it is skimming it, and its height (sounds.js)
  const toWater = Math.max(0, SHORE_OUT - islandField(player.position.x, player.position.z));
  sounds.sea(Math.hypot(toWater, Math.max(0, player.position.y - WATER_Y)), skimming, player.position.y - WATER_Y);
  islandMoment(); // every few islands, the violin
  placeHeads(delta); // the heads keep turning to watch the bird
  stepTrees(delta); // the trees are solid, and shake when bumped
  stepLanterns(delta); // lanterns light as the bird comes by; the nearest lit ones light what's round them
  stepLoneArms(delta); // the arms out of the ground reach for the bird as it passes

  // The sky rides with the camera so stars and moon stay at infinity
  skyDome.position.copy(camera.position);
  cloudDeck.update(player, clock.elapsedTime, daylight, scene.background);
  starMat.uniforms.uTime.value = clock.elapsedTime;

  // The key light and its shadow box follow the bird; the mist drifts
  wildlife.update(player.position, clock.elapsedTime, heading, pitchA);
  landLife.update(player.position, clock.elapsedTime, delta);
  worldMap.draw(player.position.x, player.position.z, heading, clock.elapsedTime);
  followSun(player.position);
  for (const L of mistLayers) {
    L.mat.uniforms.uTime.value = clock.elapsedTime;
    L.mat.uniforms.uCenter.value.copy(player.position);
    L.mat.uniforms.uColor.value.copy(scene.fog.color); // the sky's colour, whatever the hour
    L.mat.uniforms.uMoonColor.value.copy(scene.fog.color).lerp(MIST_WHITE, 0.35);
  }

  renderer.render(scene, camera);
});

// Built: the loading bar becomes the "Play" button. The press (or any key
// but M, which mutes) starts the flight and, being a gesture, the sound; the
// screen fades away.
function fly() {
  if (started) return;
  started = true;
  sounds.start();
  loadingEl.classList.add("gone");
  setTimeout(() => loadingEl.remove(), 1500);
}
if (loadingEl) {
  loadingEl.classList.add("ready");
  loadingStatus.textContent = "Play";
  paintLoading(1);
  if (loadingPct) loadingPct.textContent = ""; // the bar is full: "Play" alone, centred (style.css #loading.ready)
  if (loadingBar) {
    loadingBar.setAttribute("role", "button");
    ["aria-valuemin", "aria-valuemax", "aria-valuenow"].forEach((a) => loadingBar.removeAttribute(a));
    loadingBar.tabIndex = 0;
    loadingBar.addEventListener("click", fly);
  }
  const anyKey = (e) => {
    if (e.code === "KeyM") return;
    removeEventListener("keydown", anyKey);
    fly();
  };
  addEventListener("keydown", anyKey);
}
// The Music popover's switches: the music, and the sound effects (everything else)
const musicBox = document.getElementById("music-on"),
  sfxBox = document.getElementById("sfx-on");
if (musicBox) musicBox.addEventListener("change", () => sounds.playMusic(musicBox.checked));
if (sfxBox) sfxBox.addEventListener("change", () => sounds.playSfx(sfxBox.checked));
