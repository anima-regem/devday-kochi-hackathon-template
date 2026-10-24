import { cellIndex, walkableCell, type CellPos, type Level } from './level';
import { lineOfSight } from './grid';

const DIRS = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

export interface BfsField {
  /** Path distance in cells from the source; -1 unreachable. */
  dist: Int32Array;
  /** Parent cell index pointing back toward the source; -1 for the source/unreachable. */
  parent: Int32Array;
  width: number;
  height: number;
}

/** BFS over walkable cells from (col,row). 4-connected. */
export function bfsField(l: Level, col: number, row: number): BfsField {
  const n = l.width * l.height;
  const dist = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  if (!walkableCell(l, col, row)) return { dist, parent, width: l.width, height: l.height };
  const q = new Int32Array(n);
  let head = 0, tail = 0;
  const s = cellIndex(l, col, row);
  dist[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const cur = q[head++];
    const cc = cur % l.width;
    const cr = (cur / l.width) | 0;
    for (const d of DIRS) {
      const nc = cc + d.dc;
      const nr = cr + d.dr;
      if (!walkableCell(l, nc, nr)) continue;
      const ni = cellIndex(l, nc, nr);
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1;
      parent[ni] = cur;
      q[tail++] = ni;
    }
  }
  return { dist, parent, width: l.width, height: l.height };
}

export function fieldDist(f: BfsField, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= f.width || row >= f.height) return -1;
  return f.dist[row * f.width + col];
}

/** Cells from `from` back to the field source (inclusive), or null if unreachable. */
export function fieldPath(f: BfsField, from: CellPos): CellPos[] | null {
  let i = from.row * f.width + from.col;
  if (from.col < 0 || from.row < 0 || from.col >= f.width || from.row >= f.height || f.dist[i] === -1) {
    return null;
  }
  const out: CellPos[] = [];
  while (i !== -1) {
    out.push({ col: i % f.width, row: (i / f.width) | 0 });
    i = f.parent[i];
  }
  return out; // ends at the source
}

/** A* (4-connected, Manhattan). Returns cells from start→goal inclusive, or null. */
export function astar(l: Level, start: CellPos, goal: CellPos): CellPos[] | null {
  if (!walkableCell(l, start.col, start.row) || !walkableCell(l, goal.col, goal.row)) return null;
  const n = l.width * l.height;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (c: number, r: number) => Math.abs(c - goal.col) + Math.abs(r - goal.row);
  // Simple binary heap of [f, index].
  const heap: number[] = [];
  const push = (f: number, i: number) => {
    heap.push(f, i);
    let c = heap.length / 2 - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p * 2] <= heap[c * 2]) break;
      for (const k of [0, 1]) {
        const tmp = heap[p * 2 + k]; heap[p * 2 + k] = heap[c * 2 + k]; heap[c * 2 + k] = tmp;
      }
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[1];
    const lf = heap[heap.length - 2], li = heap[heap.length - 1];
    heap.length -= 2;
    if (heap.length > 0) {
      heap[0] = lf; heap[1] = li;
      let p = 0;
      for (;;) {
        let c = p;
        const lft = p * 2 + 1, rgt = p * 2 + 2;
        if (lft * 2 < heap.length && heap[lft * 2] < heap[c * 2]) c = lft;
        if (rgt * 2 < heap.length && heap[rgt * 2] < heap[c * 2]) c = rgt;
        if (c === p) break;
        for (const k of [0, 1]) {
          const tmp = heap[p * 2 + k]; heap[p * 2 + k] = heap[c * 2 + k]; heap[c * 2 + k] = tmp;
        }
        p = c;
      }
    }
    return top;
  };

  const si = cellIndex(l, start.col, start.row);
  const gi = cellIndex(l, goal.col, goal.row);
  g[si] = 0;
  push(h(start.col, start.row), si);
  while (heap.length > 0) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === gi) {
      const out: CellPos[] = [];
      let i = cur;
      while (i !== -1) {
        out.push({ col: i % l.width, row: (i / l.width) | 0 });
        i = parent[i];
      }
      return out.reverse();
    }
    const cc = cur % l.width;
    const cr = (cur / l.width) | 0;
    for (const d of DIRS) {
      const nc = cc + d.dc;
      const nr = cr + d.dr;
      if (!walkableCell(l, nc, nr)) continue;
      const ni = cellIndex(l, nc, nr);
      if (closed[ni]) continue;
      const ng = g[cur] + 1;
      if (ng < g[ni]) {
        g[ni] = ng;
        parent[ni] = cur;
        push(ng + h(nc, nr), ni);
      }
    }
  }
  return null;
}

export interface ApparentSource {
  /** Apparent world position of the sound as heard by the player. */
  x: number;
  y: number;
  /** Effective travel distance (metres) for gain. */
  distance: number;
  /** True when the sound reached the player around corners (low-passed). */
  occluded: boolean;
}

/**
 * Where a source at (sx,sy) appears to be for a listener at (px,py), given the
 * BFS field rooted at the player's cell. Direct line of sight → the source
 * itself; otherwise the furthest path cell still visible to the player.
 */
export function apparentPosition(l: Level, field: BfsField, px: number, py: number, sx: number, sy: number): ApparentSource | null {
  const scol = Math.floor(sx);
  const srow = Math.floor(sy);
  const pathDist = fieldDist(field, scol, srow);
  if (pathDist === -1) return null;

  if (lineOfSight(l, px, py, sx, sy)) {
    return { x: sx, y: sy, distance: Math.hypot(sx - px, sy - py), occluded: false };
  }

  // Path from the source back toward the player, reversed = player→source.
  const chain = fieldPath(field, { col: scol, row: srow });
  if (!chain || chain.length === 0) return null;
  const ordered = chain.slice().reverse(); // player cell … source cell
  let best: CellPos | null = null;
  let bestSteps = 0;
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    const cx = c.col + 0.5;
    const cy = c.row + 0.5;
    if (lineOfSight(l, px, py, cx, cy)) {
      best = c;
      bestSteps = i;
    }
  }
  if (!best) return null;
  // Path length player→apparent corner plus remaining path to the source.
  const remaining = pathDist - bestSteps;
  const distance = Math.hypot(best.col + 0.5 - px, best.row + 0.5 - py) + remaining;
  return { x: best.col + 0.5, y: best.row + 0.5, distance, occluded: true };
}
