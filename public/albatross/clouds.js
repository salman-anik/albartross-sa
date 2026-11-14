import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const CLOUDS_PER_CELL = 3;
const ACTIVE_CELLS = 2;
const MAX_CLOUDS = (ACTIVE_CELLS * 2 + 1) ** 2 * CLOUDS_PER_CELL;
const WHITE = new THREE.Color(0xfffaf6);
const SUNSET = new THREE.Color(0xffab8a);

function buildCloudShape() {
  const puff = (x, y, z, sx, sy, sz) =>
    new THREE.SphereGeometry(1, 8, 5).scale(sx, sy, sz).translate(x, y, z);
  const geometry = mergeGeometries([
    puff(0, -0.12, 0, 1.45, 0.27, 0.78),
    puff(-0.63, -0.01, 0.02, 0.72, 0.34, 0.64),
    puff(0.58, 0.01, 0.06, 0.77, 0.38, 0.67),
    puff(-0.16, 0.12, -0.15, 0.59, 0.43, 0.53),
    puff(0.33, 0.12, 0.16, 0.58, 0.4, 0.5),
  ]);
  geometry.computeBoundingSphere();
  return geometry;
}

export class CloudDeck {
  constructor(scene, hash, cellSize) {
    this.hash = hash;
    this.cellSize = cellSize;
    this.cellX = Infinity;
    this.cellZ = Infinity;
    this.instances = [];
    this.lastMotion = -1;
    this.dummy = new THREE.Object3D();
    this.material = new THREE.MeshBasicMaterial({
      color: WHITE,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(buildCloudShape(), this.material, MAX_CLOUDS);
    this.mesh.name = "Albatross drifting cloud banks";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  rebuild(cellX, cellZ) {
    this.cellX = cellX;
    this.cellZ = cellZ;
    this.instances.length = 0;
    const draw = (x, z, i, salt) => this.hash(x * 17 + i, z * 31 - i, 41000 + salt);
    for (let dx = -ACTIVE_CELLS; dx <= ACTIVE_CELLS; dx++) {
      for (let dz = -ACTIVE_CELLS; dz <= ACTIVE_CELLS; dz++) {
        const x = cellX + dx;
        const z = cellZ + dz;
        for (let i = 0; i < CLOUDS_PER_CELL; i++) {
          this.instances.push({
            x: (x + draw(x, z, i, 1)) * this.cellSize,
            z: (z + draw(x, z, i, 2)) * this.cellSize,
            y: 26 + draw(x, z, i, 3) * 44,
            sx: 20 + draw(x, z, i, 4) * 20,
            sy: 7 + draw(x, z, i, 5) * 9,
            sz: 13 + draw(x, z, i, 6) * 16,
            yaw: draw(x, z, i, 7) * Math.PI * 2,
            phase: draw(x, z, i, 8) * Math.PI * 2,
          });
        }
      }
    }
    this.lastMotion = -1;
  }

  update(player, time, daylight, skyColor) {
    const cellX = Math.floor(player.position.x / this.cellSize);
    const cellZ = Math.floor(player.position.z / this.cellSize);
    if (cellX !== this.cellX || cellZ !== this.cellZ) this.rebuild(cellX, cellZ);

    // Keep clouds in the local flight band while their horizontal positions
    // stay world-anchored, so the bird naturally passes through each bank.
    this.mesh.position.set(0, player.position.y, 0);
    const motionStep = Math.floor(time * 2);
    if (motionStep !== this.lastMotion) {
      this.lastMotion = motionStep;
      for (let i = 0; i < this.instances.length; i++) {
        const cloud = this.instances[i];
        const drift = time * 0.018 + cloud.phase;
        this.dummy.position.set(
          cloud.x + Math.sin(drift) * 4,
          cloud.y + Math.sin(drift * 0.7) * 1.2,
          cloud.z + Math.cos(drift) * 4,
        );
        this.dummy.rotation.set(0, cloud.yaw, 0);
        this.dummy.scale.set(cloud.sx, cloud.sy, cloud.sz);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.mesh.count = this.instances.length;
      this.mesh.instanceMatrix.needsUpdate = true;
    }

    const twilight = 1 - Math.min(1, Math.abs(daylight - 0.5) * 2);
    this.material.color.copy(WHITE).lerp(SUNSET, twilight * 0.42);
    if (skyColor?.isColor) this.material.color.lerp(skyColor, 0.18 * (1 - daylight));
    this.material.opacity = 0.22 + daylight * 0.12;
  }
}
