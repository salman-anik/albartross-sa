export class WorldMap {
  constructor(canvas, groupAt, cellSize) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d");
    this.groupAt = groupAt;
    this.cellSize = cellSize;
    this.range = 520;
    this.lastDraw = -Infinity;
    this.centerCell = "";
    this.cells = [];
  }

  cacheCells(x, z) {
    const cx = Math.floor(x / this.cellSize), cz = Math.floor(z / this.cellSize);
    const key = `${cx},${cz}`;
    if (key === this.centerCell) return;
    this.centerCell = key;
    const reach = Math.ceil(this.range / this.cellSize) + 1;
    this.cells = [];
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
      const island = this.groupAt(cx + dx, cz + dz).island;
      if (island) this.cells.push(island);
    }
  }

  draw(x, z, heading, time, partner = null) {
    const ctx = this.ctx;
    if (!ctx || time - this.lastDraw < 0.18) return;
    this.lastDraw = time;
    this.cacheCells(x, z);
    const size = this.canvas.width, c = size / 2, radius = this.range, scale = (size * 0.44) / radius;
    const px = (wx) => c + (wx - x) * scale;
    const py = (wz) => c + (wz - z) * scale;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(11, 18, 23, .86)";
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, size * 0.44, 0, Math.PI * 2); ctx.clip();
    // Keep the player marker fixed at the top of the map and rotate the world
    // beneath it. The flight heading uses π for north (-Z), so subtract that
    // baseline to make the map north-up when the player faces north.
    ctx.translate(c, c);
    ctx.rotate(heading - Math.PI);
    ctx.translate(-c, -c);
    ctx.strokeStyle = "rgba(208, 224, 211, .14)"; ctx.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(c, c, size * 0.44 * r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, size); ctx.moveTo(0, c); ctx.lineTo(size, c); ctx.stroke();
    for (const island of this.cells) {
      for (const lobe of island.lobes) {
        const lx = px(lobe.x), ly = py(lobe.z), lr = lobe.r * scale;
        if (lx + lr < 0 || lx - lr > size || ly + lr < 0 || ly - lr > size) continue;
        ctx.beginPath(); ctx.ellipse(lx, ly, lr, lr * 0.86, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#48674f"; ctx.fill();
        ctx.strokeStyle = "rgba(190, 211, 167, .32)"; ctx.lineWidth = 1; ctx.stroke();
      }
      for (const peak of island.peaks ?? []) {
        const mx = px(peak.x), my = py(peak.z);
        ctx.beginPath(); ctx.arc(mx, my, Math.max(1.4, peak.radius * scale * 0.18), 0, Math.PI * 2);
        ctx.fillStyle = peak.height > 27 ? "#d7e1d9" : "#a5ad8b"; ctx.fill();
      }
      for (const river of island.rivers ?? []) {
        ctx.beginPath();
        river.points.forEach((p, i) => i ? ctx.lineTo(px(p.x), py(p.z)) : ctx.moveTo(px(p.x), py(p.z)));
        ctx.strokeStyle = "#83c8cf"; ctx.lineWidth = Math.max(1.5, island.r * scale * 0.014); ctx.lineCap = "round"; ctx.stroke();
        if (river.waterfall >= 0) {
          const p = river.points[river.waterfall];
          ctx.beginPath(); ctx.arc(px(p.x), py(p.z), 2.6, 0, Math.PI * 2); ctx.fillStyle = "#e1f4ee"; ctx.fill();
        }
      }
    }
    ctx.restore();
    if (partner) {
      const dx = partner.x - x, dz = partner.z - z;
      const cos = Math.cos(heading - Math.PI), sin = Math.sin(heading - Math.PI);
      const rx = (dx * cos - dz * sin) * scale;
      const rz = (dx * sin + dz * cos) * scale;
      const maxR = size * 0.41;
      const d = Math.hypot(rx, rz);
      const mx = c + (d > maxR ? (rx / d) * maxR : rx);
      const my = c + (d > maxR ? (rz / d) * maxR : rz);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.atan2(rx, -rz));
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(4.2, 4.5); ctx.lineTo(0, 2); ctx.lineTo(-4.2, 4.5);
      ctx.closePath();
      ctx.fillStyle = "#ff8fb8";
      ctx.fill();
      ctx.strokeStyle = "#fff0f6";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(230, 235, 220, .55)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c, c, size * 0.44, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(c, c);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath();
    ctx.fillStyle = "#f2ead7"; ctx.fill(); ctx.restore();
  }
}
