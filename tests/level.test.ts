import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/world/level';
import { bfsField, fieldDist } from '../src/world/path';
import { LEVEL_DEFS } from '../src/levels';

describe('levels', () => {
  for (const def of LEVEL_DEFS) {
    it(`${def.meta.id}: parses, one P, E reachable from P`, () => {
      const l = parseLevel(def);
      // Equal row lengths is enforced by parseLevel (throws on ragged rows).
      const pCount = def.map.split('').filter((c) => c === 'P').length;
      const eCount = def.map.split('').filter((c) => c === 'E').length;
      expect(pCount).toBe(1);
      expect(eCount).toBeGreaterThanOrEqual(1);
      const field = bfsField(l, l.playerStart.col, l.playerStart.row);
      for (const e of l.exits) {
        expect(fieldDist(field, e.col, e.row)).toBeGreaterThanOrEqual(0);
      }
      if (l.creatureSpawn) {
        expect(fieldDist(field, l.creatureSpawn.col, l.creatureSpawn.row)).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it('rejects ragged rows', () => {
    expect(() => parseLevel({
      meta: LEVEL_DEFS[0].meta,
      map: '###\n#.#\n#####',
    })).toThrow();
  });

  it('rejects missing P', () => {
    expect(() => parseLevel({
      meta: LEVEL_DEFS[0].meta,
      map: '###\n#.#\n###',
    })).toThrow(/P/);
  });

  it('rejects missing E', () => {
    expect(() => parseLevel({
      meta: LEVEL_DEFS[0].meta,
      map: '###\n#P#\n###',
    })).toThrow(/E/);
  });
});
