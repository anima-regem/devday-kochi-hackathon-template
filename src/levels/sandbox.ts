import type { LevelDef } from '../world/level';

export const sandbox: LevelDef = {
  meta: {
    id: 'sandbox',
    name: 'Sandbox',
    order: 99,
    floor: 'stone',
    playerHeading: 90,
    rt60: 1.4,
    clicksEnabled: true,
    beacon: true,
    beaconGain: 0.5,
    narration: {
      intro: ['Sandbox.'],
      win: 'Done.',
    },
  },
  map: `###############
#......W......#
#......W......#
#.P....W......#
#......W......#
#.............#
#......W......#
#......W......#
#......W......#
#.............#
#.............#
#..SS..W......#
#..SS..W......E
#......W......#
###############`,
};
