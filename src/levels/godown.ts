import type { LevelDef } from '../world/level';

export const godown: LevelDef = {
  meta: {
    id: 'godown',
    name: 'Godown',
    order: 4,
    floor: 'stone',
    playerHeading: 180,
    rt60: 1.3,
    clicksEnabled: true,
    beacon: true,
    beaconGain: 0.25,
    narration: {
      intro: [
        'An old spice warehouse in Mattancherry.',
        'Sacks soak up sound. Water splashes. Not every opening leads somewhere.',
      ],
      win: "One more. Somewhere in the dark, you won't be alone.",
    },
  },
  map: `##################
#P...#......S....#
#....#..SS..S....#
#....#..SS.......#
#........~~~..#..#
#####....~~~..#..#
#...S....~~~..####
#...S..#.........#
#......#..WWW....#
#......#..WWW....E
#..SS..#.........#
##################`,
};
