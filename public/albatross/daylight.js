// The hours of the day, shared by the field (main.field.js), whose day
// turns as the bird flies, and the scene lab (scene.js), whose slider sets
// it. One number, 0 = night, 1 = full day, blends everything that makes
// the hour: the sky and fog colour, the skylight, the key light and the
// rim, and the foam's white. On the way it passes through a violet
// twilight and an orange sunrise; each stop sits at its `at` along the
// slider and neighbours blend into each other.
import * as THREE from "three";

export const HOURS = [
  {
    at: 0, // night: inky blue-black
    sky: 0x0e1118,
    hemiSky: 0x7a8394,
    hemiGround: 0x1c1f26,
    hemiPower: 0.75,
    sunColor: 0xf4ecd6,
    sunPower: 2.0,
    rimColor: 0x5d6778,
    rimPower: 0.6,
    foam: 0x8f9bb0, // not used at night: the foam keeps its day colour, dimmed (FOAM_DIM)
  },
  {
    at: 0.25, // twilight: the sky just lifting to violet
    sky: 0x2b2940,
    hemiSky: 0x77708e,
    hemiGround: 0x221f28,
    hemiPower: 0.8,
    sunColor: 0xd4d6de, // still the moon
    sunPower: 1.5,
    rimColor: 0x5e6284,
    rimPower: 0.6,
    foam: 0xa9a6c2, // not used at twilight: the foam keeps its day colour, dimmed by half FOAM_DIM
  },
  {
    at: 0.5, // sunrise / sunset: low orange sun, peach sky, cool rim
    sky: 0xe39a68,
    hemiSky: 0xeab08a,
    hemiGround: 0x44342c,
    hemiPower: 0.9,
    sunColor: 0xff9d52,
    sunPower: 2.1,
    rimColor: 0x7a74a4,
    rimPower: 0.6,
    foam: 0xf3d8c2,
  },
  {
    at: 1, // day: bright, pale morning light, kept soft: more skylight and a gentler sun, so shadows are mist-grey rather than cut (the ethereal look; 1.05 and 2.3 were the harder day)
    sky: 0xebe6d6,
    hemiSky: 0xf0ecdd,
    hemiGround: 0x6b6a63,
    hemiPower: 1.3,
    sunColor: 0xfff3da,
    sunPower: 1.7,
    rimColor: 0xcfc9b6,
    rimPower: 0.55,
    foam: 0xf2f7fb, // off-white, a little of the sky in it
  },
];
// The two stops t falls between, and how far along from the first
export function hourSpan(t) {
  let i = 0;
  while (i < HOURS.length - 2 && t > HOURS[i + 1].at) i++;
  const a = HOURS[i],
    b = HOURS[i + 1];
  return [a, b, (t - a.at) / (b.at - a.at)];
}
// The night is not the inky black above on its own: the night sky is the
// sea's colour darkened to night, so the sky and the water are one thing
// after dark. Only the tint moves: the water's colour is first darkened to
// the stop's own brightness, so the night stays as black as it is. Night
// takes the full lean, twilight half, sunrise and day none (nightShare).
// The foam (unlit, so its stops are all the night it has) stays its day
// colour after dark with a couple of shades of the water mixed in, so the
// lace still reads light on the dark water but belongs to it
export const SKY_MIX = 1; // how far the night sky's tint goes toward the water's (0 = the inky blue above as it is, 1 = the water's hue at the night's darkness)
export const FOAM_DIM = 0.3; // how much of the water's colour the foam takes at night (0.3 is about two shades; twilight takes half)
const nightShare = (stop) => Math.max(0, Math.min(1, 1 - stop.at / 0.5)); // 1 at night, 0 from sunrise on
const hourColors = { a: new THREE.Color(), b: new THREE.Color(), day: new THREE.Color() };
const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
// A stop's colour for key, with the day's value standing in at the
// full-day stop; the sky's dark stops leant toward `toward` (the water) at
// their own darkness; the foam's dark stops the day's foam with some of the
// water mixed in
function stopColor(target, stop, key, dayValue, toward) {
  if (stop === HOURS[HOURS.length - 1]) return target.set(dayValue);
  const night = nightShare(stop);
  if (key === "foam" && night > 0) return target.set(dayValue).lerp(hourColors.day.set(toward), FOAM_DIM * night);
  target.set(stop[key]);
  if (key === "sky" && SKY_MIX > 0) {
    const lean = hourColors.day.set(toward);
    lean.multiplyScalar(luminance(target) / Math.max(luminance(lean), 1e-4)); // the water, as dark as this stop
    target.lerp(lean, SKY_MIX * night);
  }
  return target;
}
// The hour's colour for key (sky, hemiSky, hemiGround, sunColor, rimColor,
// foam) into target. `day`, if given, stands in for the full-day stop's
// value of key (the lab's palette colour for the sky or the foam), and
// `toward` is the palette's water: what the sky's dark stops lean toward
// (SKY_MIX) and what the night foam takes a little of (FOAM_DIM)
export function hourColor(target, key, t, day = HOURS[HOURS.length - 1][key], toward = day) {
  const [a, b, f] = hourSpan(t);
  return target.lerpColors(stopColor(hourColors.a, a, key, day, toward), stopColor(hourColors.b, b, key, day, toward), f);
}
// The hour's number for key (hemiPower, sunPower, rimPower)
export function hourValue(key, t) {
  const [a, b, f] = hourSpan(t);
  return THREE.MathUtils.lerp(a[key], b[key], f);
}
