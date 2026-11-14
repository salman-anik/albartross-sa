import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const BIRD_SPECIES = [
  { name: "albatross", color: 0xf4f2eb, scale: 1.45, altitude: 32, speed: 0.045, wing: 0.36 },
  { name: "eagle", color: 0x9a7950, scale: 1.35, altitude: 40, speed: 0.04, wing: 0.34 },
  { name: "hawk", color: 0x8f8170, scale: 1.08, altitude: 33, speed: 0.058, wing: 0.42 },
  { name: "falcon", color: 0x82766b, scale: 0.82, altitude: 28, speed: 0.078, wing: 0.55 },
  { name: "parrot", color: 0x49a77c, scale: 0.78, altitude: 18, speed: 0.073, wing: 0.58 },
  { name: "dove", color: 0xd4d4ca, scale: 0.7, altitude: 20, speed: 0.063, wing: 0.47 },
  { name: "swallow", color: 0x424e50, scale: 0.56, altitude: 24, speed: 0.095, wing: 0.62 },
  { name: "sparrow", color: 0xa58d68, scale: 0.52, altitude: 15, speed: 0.07, wing: 0.52 },
  { name: "owl", color: 0x76614e, scale: 0.92, altitude: 17, speed: 0.032, wing: 0.25 },
  { name: "kingfisher", color: 0x3899a1, scale: 0.67, altitude: 13, speed: 0.082, wing: 0.58 },
  { name: "heron", color: 0x828c89, scale: 1.1, altitude: 11, speed: 0.035, wing: 0.3 },
  { name: "duck", color: 0x9b8b68, scale: 0.84, altitude: 7, speed: 0.036, wing: 0.22 },
  { name: "swan", color: 0xe5e4da, scale: 1.18, altitude: 8, speed: 0.028, wing: 0.24 },
  { name: "woodpecker", color: 0xb0573f, scale: 0.7, altitude: 16, speed: 0.055, wing: 0.4 },
];

// Instanced silhouettes; each bird has its own species, speed, altitude,
// flight state, direction, and timer. Only a few draw calls cover the flock.
export class SkyFlocks {
  constructor(scene, seed, groupAt, getHeight, density = 96) {
    this.count = 150;
    this.density = 96;
    this.groupAt = groupAt;
    this.getHeight = getHeight;
    this.birds = [];
    let state = (seed ^ 0x6d2b79f5) >>> 0;
    const rand = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const bodyGeo = new THREE.SphereGeometry(0.24, 6, 4);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.lineTo(0.9, 0.1); wingShape.lineTo(0.5, -0.08); wingShape.lineTo(0.12, -0.12); wingShape.closePath();
    const wingGeo = new THREE.ShapeGeometry(wingShape, 1).rotateX(-Math.PI / 2);
    this.body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), this.count);
    this.wings = new THREE.InstancedMesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }), this.count * 2);
    this.body.frustumCulled = this.wings.frustumCulled = false;
    this.body.castShadow = this.wings.castShadow = false;
    scene.add(this.body, this.wings);
    for (let i = 0; i < this.count; i++) {
      const flock = Math.floor(i / 6), sp = (i * 7 + Math.floor(rand() * 13)) % BIRD_SPECIES.length;
      this.birds.push({
        flock, species: sp, side: (rand() - 0.5) * 12, row: (i % 6) * 2.4,
        phase: rand() * Math.PI * 2, size: BIRD_SPECIES[sp].scale * (0.84 + rand() * 0.32),
        turn: rand() > 0.5 ? 1 : -1, mode: Math.floor(rand() * 3), modeAt: 14 + rand() * 25,
        travel: rand() * 300, branch: rand() * 12, perchSeed: rand(), perch: null,
      });
      const col = new THREE.Color(BIRD_SPECIES[sp].color);
      this.body.setColorAt(i, col); this.wings.setColorAt(i * 2, col); this.wings.setColorAt(i * 2 + 1, col);
    }
    this.flocks = Array.from({ length: 25 }, () => ({ angle: rand() * Math.PI * 2, radius: 65 + rand() * 95, altitude: 12 + rand() * 58, speed: 0.035 + rand() * 0.035, phase: rand() * Math.PI * 2 }));
    this.dummy = new THREE.Object3D();
    this.companion = {
      idx: 0,
      state: "idle",
      until: 300,
      side: 1,
      lateral: 4.5,
      fore: -1.2,
      dy: 0.8,
      pos: new THREE.Vector3(),
      yaw: 0,
    };
    this.setDensity(density);
  }

  setDensity(count) {
    this.density = THREE.MathUtils.clamp(Math.round(count), 0, this.count);
    this.body.count = this.density;
    this.wings.count = this.density * 2;
  }

  update(origin, time, heading = 0, pitchA = 0) {
    const comp = this.companion;
    if (this.density > 0 && time > comp.until) {
      if (comp.state === "idle") {
        comp.idx = Math.floor(Math.random() * this.density);
        if (Math.random() < 0.45) {
          this.birds[comp.idx].species = 0; // albatross companion
          this.birds[comp.idx].size = BIRD_SPECIES[0].scale * (0.9 + Math.random() * 0.2);
          const col = new THREE.Color(BIRD_SPECIES[0].color);
          this.body.setColorAt(comp.idx, col);
          this.wings.setColorAt(comp.idx * 2, col);
          this.wings.setColorAt(comp.idx * 2 + 1, col);
          if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
          if (this.wings.instanceColor) this.wings.instanceColor.needsUpdate = true;
        }
        const portrait = typeof window !== "undefined" && (window.innerWidth < window.innerHeight || window.innerWidth < 700);
        comp.side = Math.random() < 0.5 ? 1 : -1;
        comp.lateral = portrait ? 1.8 + Math.random() * 1.3 : 3.2 + Math.random() * 2.4;
        comp.fore = portrait ? 1.6 + Math.random() * 2.4 : -1.2 + Math.random() * 2.4;
        comp.dy = -0.3 + Math.random() * 1.6;
        const entrySide = comp.side * (portrait ? 16 + Math.random() * 8 : 36 + Math.random() * 16);
        comp.pos.set(
          origin.x + Math.cos(heading) * entrySide - Math.sin(heading) * 14,
          origin.y + 6 + Math.random() * 6,
          origin.z - Math.sin(heading) * entrySide - Math.cos(heading) * 14,
        );
        comp.yaw = heading;
        comp.state = "fly";
        comp.until = time + 20;
      } else if (comp.state === "fly") {
        comp.state = "leave";
        comp.until = time + 5.5;
      } else {
        comp.state = "idle";
        comp.until = time + 300;
      }
    }
    for (let i = 0; i < this.density; i++) {
      const b = this.birds[i], f = this.flocks[b.flock], spec = BIRD_SPECIES[b.species];
      if (comp.state !== "idle" && i === comp.idx) {
        const leaveOut = comp.state === "leave" ? comp.side * 55 : 0;
        const leaveUp = comp.state === "leave" ? 18 : 0;
        const tx = origin.x + Math.cos(heading) * (comp.side * comp.lateral + leaveOut) + Math.sin(heading) * comp.fore;
        const tz = origin.z - Math.sin(heading) * (comp.side * comp.lateral + leaveOut) + Math.cos(heading) * comp.fore;
        const ty = origin.y + comp.dy + leaveUp + Math.sin(time * 1.4 + b.phase) * 0.45;
        const lerpK = comp.state === "leave" ? 0.025 : 0.065;
        comp.pos.x += (tx - comp.pos.x) * lerpK;
        comp.pos.y += (ty - comp.pos.y) * lerpK;
        comp.pos.z += (tz - comp.pos.z) * lerpK;
        const targetYaw = comp.state === "leave" ? heading + comp.side * 0.75 : heading;
        let dYaw = ((targetYaw - comp.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (dYaw < -Math.PI) dYaw += Math.PI * 2;
        comp.yaw += dYaw * 0.08;
        this.dummy.position.copy(comp.pos);
        this.dummy.rotation.set(-pitchA * 0.6, comp.yaw, 0);
        this.dummy.scale.setScalar(b.size);
        this.dummy.updateMatrix();
        this.body.setMatrixAt(i, this.dummy.matrix);
        const flapAmp = pitchA > 0.08 || comp.state === "leave" ? spec.wing * 1.15 : 0.14;
        const flap = Math.sin(time * (pitchA > 0.08 ? 6.5 : 3.2) + b.phase) * flapAmp;
        for (let side = 0; side < 2; side++) {
          this.dummy.position.copy(comp.pos);
          this.dummy.rotation.set(-pitchA * 0.6, comp.yaw, side ? flap : -flap);
          this.dummy.scale.set((side ? -1 : 1) * b.size, b.size, b.size);
          this.dummy.updateMatrix();
          this.wings.setMatrixAt(i * 2 + side, this.dummy.matrix);
        }
        continue;
      }
      if (time > b.modeAt) {
        b.mode = (b.mode + 1 + Math.floor(Math.abs(Math.sin(b.phase + time) * 2))) % 3;
        b.modeAt = time + 14 + Math.abs(Math.sin(b.phase * 1.9 + time * 0.03)) * 24;
        b.turn *= -1;
        if (b.mode === 2 && ["sparrow", "dove", "owl", "woodpecker"].includes(spec.name)) {
          const cx = Math.floor(origin.x / 180), cz = Math.floor(origin.z / 180), trees = [];
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) trees.push(...(this.groupAt(cx + dx, cz + dz).trees ?? []));
          if (trees.length) {
            let best = null, bestD = Infinity;
            for (const tree of trees) {
              const d = Math.hypot(tree.x - origin.x, tree.z - origin.z);
              if (d < bestD && d < 150) { best = tree; bestD = d; }
            }
            if (best) b.perch = { x: best.x, y: this.getHeight(best.x, best.z) + 8 * best.scale, z: best.z };
          }
        }
      }
      const glide = b.mode === 1;
      const angle = f.angle + time * f.speed * b.turn * (glide ? 0.38 : 1) + b.phase * 0.18;
      const radius = f.radius + (b.mode === 2 ? Math.sin(time * 0.25 + b.phase) * 35 : 0);
      const perch = b.mode === 2 && b.perch;
      const x = perch ? b.perch.x + Math.sin(time * 0.3 + b.phase) * 0.25 : origin.x + Math.cos(angle) * radius + Math.sin(angle) * b.row + Math.cos(angle) * b.side + Math.sin(time * 0.08 + b.phase) * b.travel * 0.04;
      const z = perch ? b.perch.z + Math.cos(time * 0.3 + b.phase) * 0.25 : origin.z + Math.sin(angle) * radius - Math.cos(angle) * b.row + Math.sin(angle) * b.side;
      const y = perch ? b.perch.y : origin.y + spec.altitude + Math.sin(time * (glide ? 0.18 : 0.55) + f.phase + b.phase) * (glide ? 1.2 : 2.6);
      const yaw = perch ? b.phase : angle + Math.PI / 2;
      this.dummy.position.set(x, y, z); this.dummy.rotation.set(0, yaw, 0); this.dummy.scale.setScalar(b.size); this.dummy.updateMatrix();
      this.body.setMatrixAt(i, this.dummy.matrix);
      for (let side = 0; side < 2; side++) {
        const flap = perch ? Math.sin(time * 0.5 + b.phase) * 0.025 : glide ? Math.sin(time * 1.8 + b.phase) * 0.08 : Math.sin(time * (5.5 + spec.speed * 35) + b.phase) * spec.wing;
        this.dummy.position.set(x, y, z); this.dummy.rotation.set(0, yaw, side ? flap : -flap);
        this.dummy.scale.set((side ? -1 : 1) * b.size, b.size, b.size); this.dummy.updateMatrix();
        this.wings.setMatrixAt(i * 2 + side, this.dummy.matrix);
      }
    }
    this.body.instanceMatrix.needsUpdate = true; this.wings.instanceMatrix.needsUpdate = true;
  }
}

const ANIMAL_TYPES = ["deer", "rabbit", "fox", "horse", "goat", "duck"];
const ANIMAL_COLOR = { deer: 0x8b6543, rabbit: 0xc3b8a2, fox: 0xb66b3e, horse: 0x6f5541, goat: 0xb4aa8e, duck: 0x66806a };
const ANIMAL_SPEED = { deer: 2.5, rabbit: 3.4, fox: 2.8, horse: 3.1, goat: 1.9, duck: 1.1 };

function animalGeometry(kind) {
  const bits = [];
  const add = (geo, pos, scale, yaw = 0) => {
    geo.scale(...scale); geo.rotateY(yaw); geo.translate(...pos); bits.push(geo);
  };
  const body = kind === "duck" ? [0.46, 0.43, 0.68] : kind === "horse" ? [0.54, 0.62, 0.92] : kind === "rabbit" ? [0.43, 0.42, 0.59] : [0.5, 0.57, 0.76];
  add(new THREE.SphereGeometry(1, 8, 6), [0, body[1] + 0.35, 0], body);
  add(new THREE.SphereGeometry(1, 7, 5), [0, body[1] + 0.6, body[2] * 0.78], kind === "duck" ? [0.25, 0.28, 0.28] : [0.27, 0.3, 0.31]);
  if (kind === "rabbit") for (const x of [-0.13, 0.13]) add(new THREE.ConeGeometry(0.09, 0.48, 5), [x, body[1] + 1.02, body[2] * 0.8], [0.62, 1, 0.62], x * 2);
  if (kind === "goat" || kind === "deer") for (const x of [-0.16, 0.16]) add(new THREE.ConeGeometry(0.075, kind === "goat" ? 0.52 : 0.35, 5), [x, body[1] + 0.98, body[2] * 0.87], [1, 1, 1], x * 1.7);
  if (kind === "fox" || kind === "horse") add(new THREE.ConeGeometry(0.2, 0.72, 6), [0, body[1] + 0.3, -body[2] - 0.28], [1, 1, 1], Math.PI / 2);
  if (kind === "duck") add(new THREE.ConeGeometry(0.11, 0.3, 5), [0, body[1] + 0.57, body[2] + 0.19], [1, 1, 1], Math.PI / 2);
  const legH = kind === "duck" ? 0.35 : 0.62;
  for (const x of [-0.27, 0.27]) for (const z of [-body[2] * 0.56, body[2] * 0.56]) {
    add(new THREE.CylinderGeometry(0.045, 0.07, legH, 5), [x, legH * 0.48, z], [1, 1, 1]);
  }
  const merged = mergeGeometries(bits, false);
  for (const geo of bits) geo.dispose();
  merged.computeVertexNormals();
  return merged;
}

const TASKS = {
  deer: [["graze", 0.32], ["walk", 0.22], ["drink", 0.18], ["rest", 0.16], ["look", 0.12]],
  rabbit: [["graze", 0.28], ["hop", 0.28], ["hide", 0.18], ["rest", 0.12], ["explore", 0.14]],
  fox: [["explore", 0.32], ["search", 0.24], ["observe", 0.18], ["rest", 0.16], ["walk", 0.1]],
  horse: [["graze", 0.28], ["walk", 0.24], ["drink", 0.16], ["rest", 0.14], ["run", 0.18]],
  goat: [["climb", 0.3], ["browse", 0.24], ["walk", 0.2], ["rest", 0.16], ["jump", 0.1]],
  duck: [["swim", 0.36], ["drink", 0.2], ["rest", 0.22], ["forage", 0.22]],
};

// Individual, seeded finite-state behavior. Agents are only simulated near
// the player; every animal keeps its own destination, timer, pace, and state.
export class LandLife {
  constructor(scene, groupAt, getHeight, density = 60) {
    this.groupAt = groupAt; this.getHeight = getHeight; this.density = density;
    this.active = []; this.cell = ""; this.dummy = new THREE.Object3D();
    this.fields = Object.fromEntries(ANIMAL_TYPES.map((type) => {
      const mesh = new THREE.InstancedMesh(animalGeometry(type), new THREE.MeshStandardMaterial({ color: ANIMAL_COLOR[type], roughness: 1, flatShading: true }), 120);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.count = 0; scene.add(mesh);
      return [type, mesh];
    }));
  }

  setDensity(value) { this.density = THREE.MathUtils.clamp(Math.round(value), 0, 120); }

  loadNear(x, z) {
    const cx = Math.floor(x / 180), cz = Math.floor(z / 180), key = `${cx},${cz}`;
    if (key === this.cell) return;
    this.cell = key; this.active.length = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const g = this.groupAt(cx + dx, cz + dz);
      for (const animal of g.fauna ?? []) if (this.active.length < 120) this.active.push({ animal, group: g });
    }
    this.active.sort((a, b) => Math.hypot(a.animal.x - x, a.animal.z - z) - Math.hypot(b.animal.x - x, b.animal.z - z));
  }

  chooseTask(agent, kind, animal, group, player) {
    const tasks = TASKS[kind]; let roll = agent.rand();
    for (const [task, weight] of tasks) { if ((roll -= weight) <= 0) { agent.task = task; break; } }
    const island = group.island, trees = group.trees ?? [];
    let target = { x: animal.x + (agent.rand() - 0.5) * 24, z: animal.z + (agent.rand() - 0.5) * 24 };
    if (["drink", "swim"].includes(agent.task) && island?.rivers?.length) {
      const path = island.rivers[Math.floor(agent.rand() * island.rivers.length)].points;
      const p = path[Math.floor(path.length * (0.55 + agent.rand() * 0.4))]; target = { x: p.x, z: p.z };
    } else if (["rest", "hide", "observe", "search", "browse"].includes(agent.task) && trees.length) {
      const tree = trees[Math.floor(agent.rand() * trees.length)]; target = { x: tree.x, z: tree.z };
    } else if (["climb", "jump"].includes(agent.task) && island?.peaks?.length) {
      const peak = island.peaks[Math.floor(agent.rand() * island.peaks.length)]; target = { x: peak.x, z: peak.z };
    } else if (["walk", "graze", "forage"].includes(agent.task) && agent.rand() < 0.65) {
      const mates = (group.fauna ?? []).filter((other) => other !== animal && other.kind === kind);
      if (mates.length) {
        const mate = mates[Math.floor(agent.rand() * mates.length)];
        target = { x: mate.x + (agent.rand() - 0.5) * 6, z: mate.z + (agent.rand() - 0.5) * 6 };
      } else if (island) {
        const a = agent.rand() * Math.PI * 2, d = Math.sqrt(agent.rand()) * island.r * 0.72;
        target = { x: island.x + Math.sin(a) * d, z: island.z + Math.cos(a) * d };
      }
    } else if (island) {
      const a = agent.rand() * Math.PI * 2, d = Math.sqrt(agent.rand()) * island.r * 0.72;
      target = { x: island.x + Math.sin(a) * d, z: island.z + Math.cos(a) * d };
    }
    if (agent.task === "flee") {
      const dx = animal.x - player.x, dz = animal.z - player.z, d = Math.hypot(dx, dz) || 1;
      target = { x: animal.x + dx / d * (26 + agent.rand() * 22), z: animal.z + dz / d * (26 + agent.rand() * 22) };
    }
    agent.destination = target;
    agent.timer = 5 + agent.rand() * 13;
  }

  update(player, time, delta) {
    this.loadNear(player.x, player.z);
    for (const field of Object.values(this.fields)) field.count = 0;
    for (const { animal: a, group } of this.active.slice(0, this.density)) {
      if (!a.agent) {
        let seed = (a.id ^ 0xa511e9b3) >>> 0;
        a.agent = { task: "", timer: 0, phase: seed % 628 / 100, yaw: 0, rand() { seed = Math.imul(seed ^ (seed >>> 15), 1 | seed); seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed); return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296; } };
        a.x = a.x; a.z = a.z; a.pace = ANIMAL_SPEED[a.kind] * (0.72 + a.agent.rand() * 0.58);
      }
      const A = a.agent, distPlayer = Math.hypot(a.x - player.x, a.z - player.z);
      if (distPlayer > 420) continue;
      if (distPlayer < 21 && A.task !== "flee" && a.kind !== "duck") {
        const dx = a.x - player.x, dz = a.z - player.z, d = Math.hypot(dx, dz) || 1;
        A.task = "flee"; A.timer = 2.2 + A.rand() * 1.8;
        A.destination = { x: a.x + dx / d * (26 + A.rand() * 22), z: a.z + dz / d * (26 + A.rand() * 22) };
      }
      A.timer -= delta;
      let d = A.destination ? Math.hypot(A.destination.x - a.x, A.destination.z - a.z) : 0;
      if (A.timer <= 0 || (d < 1.3 && !["graze", "rest", "look", "observe", "hide"].includes(A.task))) this.chooseTask(A, a.kind, a, group, player);
      const moving = ["walk", "run", "explore", "search", "climb", "jump", "hop", "flee", "swim", "browse"].includes(A.task);
      if (moving && A.destination) {
        d = Math.hypot(A.destination.x - a.x, A.destination.z - a.z);
        if (d > 0.2) {
          const pace = A.task === "flee" || A.task === "run" || A.task === "hop" || A.task === "jump" ? a.pace * 1.85 : a.pace;
          const step = Math.min(d, pace * delta), wantYaw = Math.atan2(A.destination.x - a.x, A.destination.z - a.z);
          A.yaw += THREE.MathUtils.euclideanModulo(wantYaw - A.yaw + Math.PI, Math.PI * 2) - Math.PI;
          A.yaw = THREE.MathUtils.damp(A.yaw, wantYaw, 7, delta);
          a.x += (A.destination.x - a.x) / d * step; a.z += (A.destination.z - a.z) / d * step;
        }
      }
      A.phase += delta * (moving ? 8 : 1.2);
      const bob = a.kind === "rabbit" && moving ? Math.abs(Math.sin(A.phase)) * 0.34 : moving ? Math.sin(A.phase) * 0.035 : Math.sin(A.phase) * 0.012;
      const field = this.fields[a.kind]; if (!field || field.count >= 80) continue;
      const i = field.count++;
      this.dummy.position.set(a.x, this.getHeight(a.x, a.z) + bob, a.z);
      this.dummy.rotation.set(0, A.yaw, 0); this.dummy.scale.setScalar(a.scale); this.dummy.updateMatrix(); field.setMatrixAt(i, this.dummy.matrix);
    }
    for (const field of Object.values(this.fields)) field.instanceMatrix.needsUpdate = true;
  }
}
