// Fighting. The player punches on foot, and can shoot once the second
// mission unlocks the gun. Hits show floating damage numbers, targets get
// knocked down for a short time, and the player dying ends the run wasted.
// Damage numbers float up and fade; this module steps them each frame.
export function makeCombat() {
  const hits = [];

  function addNumber(x, y, text) {
    hits.push({ x, y, text, life: 0.9 });
  }

  function inReach(ax, ay, bx, by, dist) {
    return Math.hypot(bx - ax, by - ay) <= dist;
  }

  return {
    hits,
    clearHits() {
      hits.length = 0;
    },
    hitCount() {
      return hits.length;
    },
    punch(attacker, target) {
      if (!target || target.down) return false;
      if (!inReach(attacker.x, attacker.y, target.x, target.y, 56)) return false;
      const hurt = target.damage ? target.damage(12) : true;
      if (target.x !== undefined) {
        const a = Math.atan2(target.y - attacker.y, target.x - attacker.x);
        target.x += Math.cos(a) * 10;
        target.y += Math.sin(a) * 10;
      }
      addNumber(target.x, target.y - 20, '-12');
      return hurt;
    },
    shoot(from, angle, targets, allowed) {
      if (!allowed) return false;
      let best = null;
      let bestD = 520;
      for (const t of targets) {
        if (!t || t.down || t.health <= 0) continue;
        const dx = t.x - from.x;
        const dy = t.y - from.y;
        const d = Math.hypot(dx, dy);
        if (d > bestD) continue;
        const along = Math.cos(angle) * dx + Math.sin(angle) * dy;
        if (along < 0) continue;
        const across = Math.abs(-Math.sin(angle) * dx + Math.cos(angle) * dy);
        if (across > 16) continue;
        best = t;
        bestD = d;
      }
      if (!best) return false;
      best.damage(25);
      addNumber(best.x, best.y - 20, '-25');
      if (best.health <= 0) this.knockDown(best);
      return true;
    },
    knockDown(target) {
      target.down = true;
      target.downTimer = 2;
    },
    update(dt) {
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        h.y -= 34 * dt;
        h.life -= dt;
        if (h.life <= 0) hits.splice(i, 1);
      }
    },
  };
}
