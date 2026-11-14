// Flowers: for now, daisies (the field's and the scene lab's meadows).
//
//   FLOWER_PARAMS            every knob: their shape and colours
//   buildDaisy(stemH, petalL, params) → a coloured geometry for one daisy, at the
//                            origin, pointing up (+y), with its stem's foot at 0
//
// The meadows decide where each flower grows; this file only says what a
// flower is. Sizes are in head units (a head is about two units tall).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { V, clean, mulberry32 } from "./heads.js";

export const FLOWER_PARAMS = {
  // How they sit
  tilt: 0.8, // how far a flower can lean off the surface normal (radians)
  // The stem
  stem: [0.046, 0.139], // stem height, drawn from this range
  stemRadius: 0.008,
  // The petals
  petals: [5, 8], // how many, drawn from this range (whole numbers; more petals, more triangles)
  petal: [0.05, 0.153], // petal length, drawn from this range
  petalWidth: 0.31, // half-width at the widest, as a fraction of the length
  petalInner: 0.25, // where a petal starts, as a fraction of its length from the centre
  petalSmooth: 0, // rounding passes on the petal's outline (0 = a pointed kite)
  petalThickness: 0.004, // the petal's thickness (0 = paper-thin)
  cup: [0.25, 1], // petals rise this much of their length toward the tip, drawn from this range: low is a flat daisy, 1 stands them up into a tulip
  // The heart
  heartWidth: 0.3, // radius, as a fraction of the petal length
  heartHeight: 0.18, // how far it domes up, as a fraction of the petal length
  // No leaves here: the meadow's have them (main.field.js MEADOW.leaves;
  // buildDaisy says what the keys are)
  // Colours
  stemColor: 0x36541c,
  petalColor: 0xe9d25d,
  heartColor: 0xf0c33c,
};

// The colours a flower can take, beyond FLOWER_PARAMS's own: a wildflower
// bunch, each with a heart that suits it. `weight` is how often a colour is
// picked.
export const DAISY_LOOKS = {
  colors: [
    { petal: 0xf6f4ea, heart: 0xf0c33c, weight: 2 }, // white, gold heart
    { petal: 0xd9412f, heart: 0x2b1a1a, weight: 1.5 }, // poppy red, black heart
    { petal: 0xf2cf3c, heart: 0x8a4a14, weight: 1.5 }, // buttercup yellow, brown heart
    { petal: 0x5b7fd6, heart: 0xf0d060, weight: 1.2 }, // cornflower blue
    { petal: 0x8e5bb8, heart: 0xf2d676, weight: 1.2 }, // violet
    { petal: 0xf08a2e, heart: 0x7a3a10, weight: 1 }, // marigold orange
    { petal: 0xe86aa0, heart: 0xf6e37a, weight: 1 }, // campion pink
  ],
};
// The petal counts FLOWER_PARAMS.petals allows: every whole number in its range
export const petalCounts = (P = FLOWER_PARAMS) => {
  const [lo, hi] = Array.isArray(P.petals) ? P.petals : [P.petals, P.petals];
  return Array.from({ length: Math.max(1, Math.round(hi) - Math.round(lo) + 1) }, (_, i) => Math.round(lo) + i);
};
// Every look: each colour with each petal count, its own cup drawn from
// P.cup's range (the same draw every time, so the field looks the same on
// every visit), and how often it's picked. Colour-major, so look i's colour
// is floor(i / petalCounts(P).length)
export const daisyLooks = (L = DAISY_LOOKS, P = FLOWER_PARAMS) => {
  const counts = petalCounts(P);
  const [cupLo, cupHi] = Array.isArray(P.cup) ? P.cup : [P.cup, P.cup];
  const rnd = mulberry32(0x5eed);
  return L.colors.flatMap((c) =>
    counts.map((n) => ({ petals: n, cup: cupLo + rnd() * (cupHi - cupLo), petalColor: c.petal, heartColor: c.heart, weight: c.weight / counts.length })),
  );
};
// A look from a 0..1 draw, by weight
export function pickLook(looks, u) {
  let w = u * looks.reduce((sum, l) => sum + l.weight, 0);
  for (let i = 0; i < looks.length; i++) if ((w -= looks[i].weight) <= 0) return i;
  return looks.length - 1;
}

// The heart's dome: a low-poly hemisphere, shared by every daisy
const hemisphere = clean(
  new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2),
);

const fillColor = (count, hex) => {
  const c = new THREE.Color(hex);
  return new THREE.Float32BufferAttribute(
    Array(count)
      .fill(0)
      .flatMap(() => [c.r, c.g, c.b]),
    3,
  );
};

// The outline of one petal of length L (u along it, v across), as a closed
// polygon in order around it: a kite of control points, rounded off by
// P.petalSmooth passes of corner-cutting (each pass replaces every corner
// with two points a quarter of the way along its edges). No passes leaves
// the kite pointed.
function petalOutline(L, P) {
  const s = L * P.petalInner, // where the petal starts
    e = L * 1.15, // its tip
    w = L * P.petalWidth, // half-width at the widest
    span = e - s;
  let pts = [
    [s, 0],
    [s + span * 0.25, w * 0.8],
    [s + span * 0.6, w],
    [e - span * 0.12, w * 0.55],
    [e, 0],
    [e - span * 0.12, -w * 0.55],
    [s + span * 0.6, -w],
    [s + span * 0.25, -w * 0.8],
  ];
  for (let pass = 0; pass < P.petalSmooth; pass++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = out;
  }
  return pts;
}

// A daisy: a square stem, a ring of rounded petals tilted a touch upward like
// a cup, each with a little thickness (or paper-thin and faced both ways),
// and a domed heart on top. Vertex colours carry the stem, petal and heart
// colours, so the whole flower draws with one vertex-coloured material.
// Leaves on the stem only if the params ask (FLOWER_PARAMS doesn't; the
// meadow's daisies do, main.field.js MEADOW.leaves):
//   leaves      how many, spaced up the middle of the stem and round it (about 64 triangles each)
//   leafLength  as a fraction of the petal length
//   leafWidth   half-width at the widest, as a fraction of the leaf's length
//   leafLift    how far a leaf points up from level (radians)
export function buildDaisy(stemH, petalL, P = FLOWER_PARAMS, look = null) {
  if (look) P = { ...P, ...look }; // a look (daisyLooks) overrides the petal count, the cup and the colours
  // Without a look, a ranged petal count or cup is taken at its middle
  const mid = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);
  const nPetals = Math.max(3, Math.round(mid(P.petals))),
    cup = mid(P.cup);
  const tris = [];
  const tri = (a, b, c) => tris.push(...a, ...b, ...c);
  const quad = (a, b, c, d) => (tri(a, b, c), tri(a, c, d));
  const r = P.stemRadius;
  for (let i = 0; i < 4; i++) {
    const a0 = (i * Math.PI) / 2,
      a1 = a0 + Math.PI / 2;
    const p0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r],
      p1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
    quad(p0, [p0[0], stemH, p0[2]], [p1[0], stemH, p1[2]], p1);
  }
  const half = P.petalThickness / 2; // petals and leaves alike
  // A blade (a petal or a leaf) from its outline: u along it, v across, in
  // the frame `at` gives. The same outline top and bottom, with walls between
  // them if it has any thickness.
  const blade = (outline, at) => {
    const centreU = outline.reduce((sum, [u]) => sum + u, 0) / outline.length;
    const centre = (y) => at(centreU, 0, y);
    const m = outline.length;
    for (let j = 0; j < m; j++) {
      const [u0, v0] = outline[j],
        [u1, v1] = outline[(j + 1) % m];
      tri(centre(half), at(u0, v0, half), at(u1, v1, half)); // top, facing up
      tri(centre(-half), at(u1, v1, -half), at(u0, v0, -half)); // underside, facing down
      if (half > 0)
        quad(at(u0, v0, -half), at(u1, v1, -half), at(u1, v1, half), at(u0, v0, half));
    }
  };
  // The leaves: P.leaves blades up the middle of the stem, each a turn on
  // round it from the last, petal-shaped from the stem out (the petal's
  // rounding and thickness), pointing out and lifted P.leafLift off level.
  // Built before the petals, so they take the stem's green.
  const leaves = P.leaves ?? 0;
  if (leaves > 0) {
    const leafOutline = petalOutline(petalL * P.leafLength, { ...P, petalInner: 0, petalWidth: P.leafWidth });
    const cl = Math.cos(P.leafLift),
      sl = Math.sin(P.leafLift);
    for (let i = 0; i < leaves; i++) {
      const a = i * 2.4 + 0.7,
        ca = Math.cos(a),
        sa = Math.sin(a);
      const base = stemH * (0.3 + (0.4 * (i + 0.5)) / leaves);
      blade(leafOutline, (u, v, y) => {
        const x = u * cl - y * sl,
          h = u * sl + y * cl;
        return [ca * x - sa * v, base + h, sa * x + ca * v];
      });
    }
  }
  const stemCount = tris.length / 3;
  // One petal's outline, in its own plane: u along the petal from its start
  // to its tip, v across it
  const outline = petalOutline(petalL, P);
  const cupAt = (u) => u * cup; // the petal rises with its length
  for (let i = 0; i < nPetals; i++) {
    const a = (i / nPetals) * Math.PI * 2,
      ca = Math.cos(a),
      sa = Math.sin(a);
    blade(outline, (u, v, y) => [ca * u - sa * v, stemH + cupAt(u) + y, sa * u + ca * v]);
  }
  const petalCount = tris.length / 3 - stemCount;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  const stem = new THREE.Color(P.stemColor),
    petal = new THREE.Color(P.petalColor);
  const colors = [];
  for (let i = 0; i < stemCount; i++) colors.push(stem.r, stem.g, stem.b);
  for (let i = 0; i < petalCount; i++) colors.push(petal.r, petal.g, petal.b);
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const heart = hemisphere.clone();
  heart.setAttribute(
    "color",
    fillColor(heart.attributes.position.count, P.heartColor),
  );
  heart.applyMatrix4(
    new THREE.Matrix4().compose(
      V(0, stemH - petalL * 0.05, 0),
      new THREE.Quaternion(),
      V(petalL * P.heartWidth, petalL * P.heartHeight, petalL * P.heartWidth),
    ),
  );
  return mergeGeometries([g, heart]);
}

// Do two daisies run into each other? Each is taken as a ball for its head
// (as wide as the petals reach, which covers the cup and the lean) on a
// stem from its foot, as thick as the stem or as far as its leaves reach:
// head against head, each stem against the other's head, stem against
// stem. The field skips a daisy that would meet one
// already placed, so no two clip.
//   { foot, head, r, stemR }   Vector3s, the head's radius (daisyReach), the stem's
export const daisyReach = (petalL) => petalL * 1.15; // the petal's tip
export function daisiesMeet(a, b) {
  return (
    a.head.distanceToSquared(b.head) < (a.r + b.r) ** 2 ||
    segmentGap2(a.foot, a.head, b.head, b.head) < (a.stemR + b.r) ** 2 ||
    segmentGap2(b.foot, b.head, a.head, a.head) < (b.stemR + a.r) ** 2 ||
    segmentGap2(a.foot, a.head, b.foot, b.head) < (a.stemR + b.stemR) ** 2
  );
}
// The squared distance between the nearest points of two segments
const sg = { d1: V(), d2: V(), r: V(), c1: V(), c2: V() };
function segmentGap2(p1, q1, p2, q2) {
  const { d1, d2, r, c1, c2 } = sg;
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  r.subVectors(p1, p2);
  const a = d1.dot(d1),
    e = d2.dot(d2),
    f = d2.dot(r),
    eps = 1e-12;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  let s, t;
  if (a <= eps && e <= eps) return r.dot(r);
  if (a <= eps) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1.dot(r);
    if (e <= eps) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1.dot(d2),
        denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  c1.copy(p1).addScaledVector(d1, s);
  c2.copy(p2).addScaledVector(d2, t);
  return c1.distanceToSquared(c2);
}

// The meadow's flowers (the field's and the scene lab's), one of three
// shapes: a dandelion clock (a faceted puff on a thin stalk), the low flat
// daisy (M.flat), or a smooth ball of colour on a low rosette of leaves.
// World units, before each flower's own scale
export const MEADOW_DAISY = {
  shape: "puff", // "puff": the dandelion clock; "flat": the low daisy (M.flat); "ball": the ball on its leaves
  stem: 0.42, // how high the ball's (the puff's) centre sits over the ground (the ball-on-leaves shape sat at 0.16)
  bloom: 0.12, // the ball's (the puff's) radius
  // The dandelion clock: the puff a faceted ball (an icosahedron, `facets`
  // times subdivided: 0 is twenty faces, 1 eighty) on a four-sided stalk
  // this thick, in the leaves' green; no leaves
  puff: { stalk: 0.012, facets: 1 },
  // The leaves under it: how many, each a smooth blade out from the middle,
  // how long, how wide and how thick, and how far its tip lifts off level (radians)
  leaves: { count: 4, length: 0.42, width: 0.16, thick: 0.035, lift: 0.2 },
  leafColor: 0x36541c,
  // Flat: a low flower sitting just up off the grass, a ring of slightly
  // puffy petals tipped up about a domed heart, no leaves and no stem
  flat: {
    petals: 5, // petals round
    length: 0.42, // a petal, root to tip (world units at scale 1)
    width: 0.2, // ...and across at its widest
    thick: 0.08, // its thickness: a little puffy, not a paper disc
    inner: 0.12, // where a petal's root sits out from the middle
    heart: 0.14, // the heart's radius
    heartPuff: 0.11, // how far the heart domes up
    rise: 0.06, // how far the whole flower sits up off the grass
    cup: 0.18, // how far each petal tips up from level (radians)
  },
  scale: [1.5, 2.3], // each flower's size, drawn
  patches: [7, 10], // patches on an island, drawn (whole numbers)
  apart: 14, // world units at least between two patches' centres
  per: [45, 60], // daisies tried in a patch (any that would overlap one already there, leaves and all, is left out); under 64
  spread: [4, 6], // world units across a patch, drawn per patch
};
// A meadow flower's reach for keeping them apart (daisiesMeet), at a scale:
// its puff on its thin stalk, its flat petals, or its ball and its leaves
// round the middle, so no two overlap
export const meadowCap = (foot, head, scale, M = MEADOW_DAISY) =>
  M.shape === "flat"
    ? { foot, head, r: (M.flat.inner + M.flat.length) * scale, stemR: (M.flat.inner + M.flat.length) * scale }
    : M.shape === "puff"
      ? { foot, head, r: M.bloom * scale, stemR: M.puff.stalk * scale }
      : { foot, head, r: M.bloom * scale, stemR: M.leaves.length * scale };
// One meadow flower in a look (daisyLooks / { petalColor, heartColor }):
// the puff on its stalk; flat (M.flat), its petals round its heart on the
// ground; or its leaves, turned evenly round, and its ball in the look's
// petal colour
export function buildMeadowDaisy(look, M = MEADOW_DAISY) {
  const L = M.leaves;
  const painted = (g, hex) => {
    const out = clean(g);
    out.deleteAttribute("uv");
    const c = new THREE.Color(hex);
    const col = new Float32Array(out.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return out;
  };
  const parts = [];
  if (M.shape === "puff") {
    const stalk = new THREE.CylinderGeometry(M.puff.stalk, M.puff.stalk, M.stem, 4, 1, true).translate(0, M.stem / 2, 0);
    parts.push(painted(stalk, M.leafColor));
    parts.push(painted(new THREE.IcosahedronGeometry(M.bloom, M.puff.facets).translate(0, M.stem, 0), look.petalColor));
    return mergeGeometries(parts);
  }
  if (M.shape === "flat") {
    const F = M.flat;
    for (let i = 0; i < F.petals; i++) {
      const petal = new THREE.SphereGeometry(1, 10, 5)
        .scale(F.length / 2, F.thick / 2, F.width / 2)
        .translate(F.inner + F.length / 2, 0, 0) // its root just out from the middle
        .rotateZ(F.cup ?? 0) // tipped up a little, like a shallow cup
        .translate(0, (F.rise ?? 0) + F.thick / 2, 0)
        .rotateY((i * Math.PI * 2) / F.petals); // evenly round
      parts.push(painted(petal, look.petalColor));
    }
    const puff = F.heartPuff ?? F.thick * 0.8;
    parts.push(painted(new THREE.SphereGeometry(1, 10, 5).scale(F.heart, puff, F.heart).translate(0, (F.rise ?? 0) + F.thick * 0.6, 0), look.heartColor ?? look.petalColor));
    return mergeGeometries(parts);
  }
  if (M.shape === "tulip") {
    const T = M.tulip;
    const stem = new THREE.CylinderGeometry(T.stalk * 0.8, T.stalk, M.stem, 4, 1, true)
      .translate(0, M.stem / 2, 0);
    parts.push(painted(stem, M.leafColor));
    // Two tapered leaf-like blades, with only a few segments; thousands of
    // these flowers stay inexpensive while the field still reads as foliage.
    for (let i = 0; i < 2; i++) {
      const leaf = new THREE.SphereGeometry(1, 6, 3)
        .scale(T.leafLength / 2, T.leafThickness / 2, T.leafWidth / 2)
        .translate(T.leafLength / 2, M.stem * (i ? 0.22 : 0.42), 0)
        .rotateZ(i ? -0.32 : 0.3)
        .rotateY(i * Math.PI + 0.4);
      parts.push(painted(leaf, M.leafColor));
    }
    for (let i = 0; i < T.petals; i++) {
      const a = (i * Math.PI * 2) / T.petals;
      const petal = new THREE.SphereGeometry(1, 6, 4)
        .scale(T.width, T.height / 2, T.depth)
        .translate(Math.cos(a) * T.spread, M.stem + T.height * 0.46, Math.sin(a) * T.spread);
      parts.push(painted(petal, look.petalColor));
    }
    return mergeGeometries(parts);
  }
  for (let i = 0; i < L.count; i++) {
    const leaf = new THREE.SphereGeometry(1, 8, 4)
      .scale(L.length / 2, L.thick / 2, L.width / 2)
      .translate(L.length / 2, L.thick / 2, 0) // its root at the middle
      .rotateZ(L.lift)
      .rotateY((i * Math.PI * 2) / L.count + 0.3 * Math.sin(i * 2.7)); // evenly round, a little uneven
    parts.push(painted(leaf, M.leafColor));
  }
  parts.push(painted(new THREE.SphereGeometry(M.bloom, 12, 8).translate(0, M.stem, 0), look.petalColor));
  return mergeGeometries(parts);
}
