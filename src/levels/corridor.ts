import type { LevelDef } from '../world/level';

export const corridor: LevelDef = {
  meta: {
    id: 'corridor',
    name: 'Corridor',
    order: 3,
    floor: 'stone',
    playerHeading: 90,
    rt60: 1.6,
    clicksEnabled: true,
    beacon: true,
    beaconGain: 0.35,
    narration: {
      intro: [
        'A long corridor. Follow the openings.',
        'Listen to the walls change. Stone rings sharp and bright. Wood sounds dull and soft.',
        "The wind is faint, but it's there.",
      ],
      win: 'Good. Your ears are learning.',
    },
  },
  map: `################
#P............##
#.............##
############..##
###########W..W#
###########W..W#
###########W..W#
###########W..W#
E.............##
#.............##
################`,
};
