import { floorAt, inBounds, wallAt, type Level } from './level';
import type { WallMaterial } from './materials';

export interface RayHit {
  dist: number;
  material: WallMaterial;
  normal: { x: number; y: number };
  x: number;
  y: number;
}

/**
 * DDA grid traversal from (x,y) along `angle` (world heading convention:
 * 0 = north/-y, increasing clockwise) up to maxDist. Returns the first solid
 * cell hit with its axis-aligned face normal, or null if the ray leaves the
 * map or exceeds maxDist.
 */
export function castRay(l: Level, x: number, y: number, angle: number, maxDist: number): RayHit | null {
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  if (dx === 0 && dy === 0) return null;

  let col = Math.floor(x);
  let row = Math.floor(y);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;

  let tMaxX = dx !== 0
    ? (dx > 0 ? (col + 1 - x) : (x - col)) / Math.abs(dx)
    : Infinity;
  let tMaxY = dy !== 0
    ? (dy > 0 ? (row + 1 - y) : (y - row)) / Math.abs(dy)
    : Infinity;

  // Starting cell already solid: treat as an immediate hit facing the ray.
  const startWall = inBounds(l, col, row) ? wallAt(l, col, row) : null;
  if (startWall) {
    return { dist: 0, material: startWall, normal: { x: -dx, y: -dy }, x, y };
  }

  let t = 0;
  // Guard against pathological loops.
  for (let i = 0; i < 1024; i++) {
    let nx = 0, ny = 0;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      col += stepX;
      nx = -stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      row += stepY;
      ny = -stepY;
    }
    if (t > maxDist) return null;
    if (!inBounds(l, col, row)) return null; // open void
    const wall = wallAt(l, col, row);
    if (wall) {
      return {
        dist: t,
        material: wall,
        normal: { x: nx, y: ny },
        x: x + dx * t,
        y: y + dy * t,
      };
    }
  }
  return null;
}

/**
 * True when the straight segment (x0,y0)→(x1,y1) does not cross a solid cell.
 * Endpoints may sit inside walkable cells on the map boundary.
 */
export function lineOfSight(l: Level, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return true;
  const angle = Math.atan2(dx, -dy); // world convention
  const dxn = dx / len;
  const dyn = dy / len;

  let col = Math.floor(x0);
  let row = Math.floor(y0);
  const stepX = dxn > 0 ? 1 : dxn < 0 ? -1 : 0;
  const stepY = dyn > 0 ? 1 : dyn < 0 ? -1 : 0;
  const tDeltaX = dxn !== 0 ? Math.abs(1 / dxn) : Infinity;
  const tDeltaY = dyn !== 0 ? Math.abs(1 / dyn) : Infinity;
  let tMaxX = dxn !== 0 ? (dxn > 0 ? col + 1 - x0 : x0 - col) / Math.abs(dxn) : Infinity;
  let tMaxY = dyn !== 0 ? (dyn > 0 ? row + 1 - y0 : y0 - row) / Math.abs(dyn) : Infinity;
  void angle;

  if (inBounds(l, col, row) && wallAt(l, col, row)) return false;

  let t = 0;
  for (let i = 0; i < 1024 && t < len; i++) {
    if (tMaxX < tMaxY) {
      t = tMaxX; tMaxX += tDeltaX; col += stepX;
    } else {
      t = tMaxY; tMaxY += tDeltaY; row += stepY;
    }
    if (t >= len) break;
    if (inBounds(l, col, row) && wallAt(l, col, row)) return false;
    // Leaving the map = void, not a wall; keep walking (the target may be an E on the boundary).
  }
  return true;
}

/**
 * Circle vs solid cells. Returns a corrected position. Resolve one axis at a
 * time from the caller for wall sliding.
 */
export function resolveCircle(l: Level, x: number, y: number, r: number): { x: number; y: number; hit: boolean; hitDir: { x: number; y: number } } {
  let hit = false;
  let hx = 0, hy = 0;
  const minCol = Math.floor(x - r);
  const maxCol = Math.floor(x + r);
  const minRow = Math.floor(y - r);
  const maxRow = Math.floor(y + r);
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const solid = !inBounds(l, col, row) || wallAt(l, col, row) !== null;
      if (!solid) continue;
      const cx = Math.max(col, Math.min(x, col + 1));
      const cy = Math.max(row, Math.min(y, row + 1));
      const ddx = x - cx;
      const ddy = y - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < r * r) {
        const d = Math.sqrt(d2);
        hit = true;
        if (d > 1e-9) {
          const push = (r - d) / d;
          x += ddx * push;
          y += ddy * push;
          hx += -ddx / d;
          hy += -ddy / d;
        } else {
          // Centre inside the cell: push toward the nearest open side.
          y += (y - (row + 0.5)) >= 0 ? r : -r;
        }
      }
    }
  }
  const hl = Math.hypot(hx, hy) || 1;
  return { x, y, hit, hitDir: { x: hx / hl, y: hy / hl } };
}

/** True when the circle overlaps any solid (or out-of-bounds) cell. */
export function circleHitsWall(l: Level, x: number, y: number, r: number): boolean {
  const minCol = Math.floor(x - r);
  const maxCol = Math.floor(x + r);
  const minRow = Math.floor(y - r);
  const maxRow = Math.floor(y + r);
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (inBounds(l, col, row) && wallAt(l, col, row) === null) continue;
      const cx = Math.max(col, Math.min(x, col + 1));
      const cy = Math.max(row, Math.min(y, row + 1));
      const ddx = x - cx;
      const ddy = y - cy;
      if (ddx * ddx + ddy * ddy < r * r) return true;
    }
  }
  return false;
}

export function floorAtPos(l: Level, x: number, y: number) {
  return floorAt(l, Math.floor(x), Math.floor(y));
}

export function onExit(l: Level, x: number, y: number): boolean {
  const col = Math.floor(x);
  const row = Math.floor(y);
  return l.exits.some((e) => e.col === col && e.row === row);
}
