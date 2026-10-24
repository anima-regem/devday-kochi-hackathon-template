import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/world/level';
import { apparentPosition, astar, bfsField, fieldDist, fieldPath } from '../src/world/path';
import { hold } from '../src/levels/hold';

const L = parseLevel(hold);

describe('BFS field', () => {
  const f = bfsField(L, L.playerStart.col, L.playerStart.row);
  it('source cell has distance 0', () => {
    expect(fieldDist(f, L.playerStart.col, L.playerStart.row)).toBe(0);
  });
  it('adjacent cell has distance 1', () => {
    expect(fieldDist(f, L.playerStart.col + 1, L.playerStart.row)).toBe(1);
  });
  it('exit and creature spawn reachable', () => {
    for (const e of L.exits) expect(fieldDist(f, e.col, e.row)).toBeGreaterThan(0);
    expect(fieldDist(f, L.creatureSpawn!.col, L.creatureSpawn!.row)).toBeGreaterThan(0);
  });
  it('wall cells unreachable', () => {
    expect(fieldDist(f, 0, 0)).toBe(-1);
  });
  it('fieldPath walks back to the source', () => {
    const p = fieldPath(f, L.creatureSpawn!)!;
    expect(p).not.toBeNull();
    const last = p[p.length - 1];
    expect(last).toEqual(L.playerStart);
    expect(p.length - 1).toBe(fieldDist(f, L.creatureSpawn!.col, L.creatureSpawn!.row));
  });
});

describe('A*', () => {
  it('routes C → P around interior walls', () => {
    const p = astar(L, L.creatureSpawn!, L.playerStart);
    expect(p).not.toBeNull();
    expect(p![0]).toEqual(L.creatureSpawn);
    expect(p![p!.length - 1]).toEqual(L.playerStart);
    const manhattan = Math.abs(L.creatureSpawn!.col - L.playerStart.col)
      + Math.abs(L.creatureSpawn!.row - L.playerStart.row);
    expect(p!.length - 1).toBeGreaterThanOrEqual(manhattan);
    // Every cell walkable and steps 4-connected.
    for (let i = 0; i < p!.length; i++) {
      expect(L.walls[p![i].row * L.width + p![i].col]).toBeNull();
      if (i > 0) {
        const d = Math.abs(p![i].col - p![i - 1].col) + Math.abs(p![i].row - p![i - 1].row);
        expect(d).toBe(1);
      }
    }
  });
  it('returns null for unreachable goals', () => {
    expect(astar(L, L.playerStart, { col: 0, row: 0 })).toBeNull();
  });
});

describe('apparentPosition (around corners)', () => {
  it('direct line of sight → source position, unoccluded', () => {
    const f = bfsField(L, 2, 2);
    const a = apparentPosition(L, f, 2.5, 2.5, 5.5, 2.5)!;
    expect(a.occluded).toBe(false);
    expect(a.x).toBeCloseTo(5.5);
    expect(a.distance).toBeCloseTo(3);
  });
  it('behind a wall → apparent corner cell, occluded', () => {
    // Corridor layout: player left of a wall, source right of it.
    const m = parseLevel({
      meta: { ...hold.meta, id: 't' },
      map: `E######
#.....#
#.P##.#
#...#.#
#...#.#
#...#.#
#.....#
#######`,
    });
    const f = bfsField(m, 2, 2);
    // Source at (5,2) — right of the wall column at col 3-4.
    const a = apparentPosition(m, f, 2.5, 2.5, 5.5, 2.5);
    expect(a).not.toBeNull();
    expect(a!.occluded).toBe(true);
    // Apparent position is NOT the true source position.
    expect(Math.hypot(a!.x - 5.5, a!.y - 2.5)).toBeGreaterThan(0.5);
  });
});
