(() => {
  'use strict';
  const WIDTH = 100, HEIGHT = 60, RADIUS = 3;
  const DRAG = 135, STEP = 1 / 180, REST = .15;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const distance = (p, lateral = 1) => Math.round(Math.hypot(p.x - WIDTH / 2, (p.y - HEIGHT / 2) * lateral) * 10);

  // Positions use one fixed board in every orientation. Replay uses fixed substeps
  // and is independent of rendering frame rate, clock, or pointer event frequency.
  function shot(parked, launch, range, { lateral = 1, radius = RADIUS } = {}) {
    const power = Math.sqrt(2 * DRAG * clamp(range, 0, 180));
    const coins = parked.map(p => ({ ...p, y: p.y * lateral, vx: 0, vy: 0, out: false }));
    coins.push({ ...launch, y: launch.y * lateral, vx: Math.cos(launch.angle) * power, vy: Math.sin(launch.angle) * power, out: false });
    const snapshot = () => coins.map(({ id, seat, x, y, out }) => ({ id, seat, x, y: y / lateral, out }));
    const frames = [snapshot()];
    const contacts = new Set();
    for (let i = 0; i < 240; i++) {
      if (!coins.some(p => !p.out && Math.hypot(p.vx, p.vy) > REST)) break;
      for (const p of coins) {
        if (p.out) continue;
        const speed = Math.hypot(p.vx, p.vy), after = Math.max(0, speed - DRAG * STEP);
        if (speed) {
          const scale = (speed + after) / (2 * speed) * STEP;
          p.x += p.vx * scale; p.y += p.vy * scale;
          p.vx *= after / speed; p.vy *= after / speed;
        }
      }
      // Two passes resolve a chain of adjacent coins without allowing overlap.
      for (let k = 0; k < 2; k++) for (let a = 0; a < coins.length; a++) for (let b = a + 1; b < coins.length; b++) {
        const p = coins[a], q = coins[b];
        if (p.out || q.out) continue;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d >= radius * 2) continue;
        let ux = dx / d, uy = dy / d;
        if (d < .0001) {
          const vx = p.vx - q.vx, vy = p.vy - q.vy, speed = Math.hypot(vx, vy);
          if (!speed) continue;
          ux = vx / speed; uy = vy / speed;
        }
        const correction = (2 * radius - d) / 2;
        p.x -= ux * correction; p.y -= uy * correction;
        q.x += ux * correction; q.y += uy * correction;
        const closing = (p.vx - q.vx) * ux + (p.vy - q.vy) * uy;
        if (closing <= 0) continue;
        const impulse = .94 * closing;
        p.vx -= ux * impulse; p.vy -= uy * impulse;
        q.vx += ux * impulse; q.vy += uy * impulse;
        contacts.add(p.id); contacts.add(q.id);
      }
      for (const p of coins) if (p.x < 0 || p.x > WIDTH || p.y < 0 || p.y > HEIGHT * lateral) p.out = true;
      if (i % 5 === 4) frames.push(snapshot());
    }
    const result = snapshot();
    frames.push(result);
    return { frames, result, contacts: [...contacts], frameMs: STEP * 5000 };
  }
  function project(x, y, mode) {
    if (mode === 'portrait-table') return { x: y * WIDTH, y: x * HEIGHT };
    if (mode === 'portrait-counter') return { x: y * WIDTH, y: (1 - x) * HEIGHT };
    return { x: x * WIDTH, y: y * HEIGHT };
  }

  const engine = { WIDTH, HEIGHT, RADIUS, distance, shot, project };
  if (typeof module !== 'undefined') module.exports = engine;
  else window.tavernCurlPhysics = Object.freeze(engine);
})();
