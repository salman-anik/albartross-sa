// The scene's palette: every colour the scene lab (scene.html) lets you
// pick, as the lab last set them (pasted back from its "copy palette"). The lab saves the colours
// you set in the browser; the field reads them back (savedPalette), so
// what is tuned in the lab is what the field wears, with no copying.
// Sky and foam are the day's in the field (HOURS in main.field.js); the
// trees' and flowers' colours are baked into their geometry by the
// field's own builders, so those four stay the lab's alone for now.
export const PALETTE_KEY = "scene-lab"; // where the lab keeps its state in localStorage
export const PALETTE = {
  // Sampled from the case study's camera-roll carousel (2026-10-16): the
  // dusk sea and sky, the Okunoin cedar path, the azalea park, the lit
  // house and the clay vessel
  sky: 0xa9c7d1, // pale coastal daylight
  water: 0x356775, // muted coastal blue-green
  foam: 0xe6e0d7, // the lace on the sea: the dusk sky, lifted; at night it takes a little of the water (daylight.js FOAM_DIM)
  seabed: 0x39494a,
  sand: 0xc7b995,
  ground: 0x526543,
  earth: 0x604a35,
  splotch: 0x526146,
  splotch2: 0x45553f,
  stone: 0x99978f,
  eyes: 0x121c26, // the vessel's case, near black
  trees: 0x506345,
  bark: 0x554638,
  // The wildflowers: four petal colours, each cluster one of them, and one heart
  flowers: 0xb87872,
  flowers2: 0xc9bca6,
  flowers3: 0xc28c5b,
  flowers4: 0x788d8c,
  hearts: 0xb88a53,
};
export const FLOWER_KEYS = ["flowers", "flowers2", "flowers3", "flowers4"]; // the petal colours, in the palette's order
// The palette as the lab last saved it, over the defaults for anything it
// didn't (or if there is no saved lab, or no storage)
export function savedPalette() {
  const C = { ...PALETTE };
  try {
    const saved = JSON.parse(localStorage.getItem(PALETTE_KEY) || "{}")?.C;
    if (saved && typeof saved === "object") for (const key of Object.keys(PALETTE)) if (Number.isInteger(saved[key])) C[key] = saved[key];
  } catch {
    /* no storage: the defaults */
  }
  return C;
}
