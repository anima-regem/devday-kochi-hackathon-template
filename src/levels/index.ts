import { parseLevel, type Level } from '../world/level';
import { wake } from './wake';
import { walls } from './walls';
import { corridor } from './corridor';
import { godown } from './godown';
import { hold } from './hold';
import { sandbox } from './sandbox';

export const LEVEL_DEFS = [wake, walls, corridor, godown, hold, sandbox];

const cache = new Map<string, Level>();

export function getLevel(id: string): Level | null {
  const def = LEVEL_DEFS.find((d) => d.meta.id === id);
  if (!def) return null;
  let l = cache.get(id);
  if (!l) {
    l = parseLevel(def);
    cache.set(id, l);
  }
  return l;
}

/** Campaign levels in menu order (sandbox excluded). */
export function campaignLevels(): Level[] {
  return LEVEL_DEFS
    .filter((d) => d.meta.order < 90)
    .sort((a, b) => a.meta.order - b.meta.order)
    .map((d) => getLevel(d.meta.id)!);
}
