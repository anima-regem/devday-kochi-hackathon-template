import type { LevelDef } from '../world/level';

export const wake: LevelDef = {
  meta: {
    id: 'wake',
    name: 'Wake',
    order: 1,
    floor: 'stone',
    playerHeading: 270,
    rt60: 1.2,
    clicksEnabled: false,
    beacon: true,
    beaconGain: 0.9,
    narration: {
      intro: [
        'You wake up somewhere completely dark.',
        'Hear that? Wind, coming from outside.',
        'Turn your phone slowly until the wind is straight ahead of you.',
        'Then hold two fingers on the screen to walk towards it.',
      ],
      win: "You found your way out. Next, there won't be any wind to follow.",
    },
    hints: [
      'Turn your whole body, holding the phone in front of you, until the wind is centred.',
      'Hold two fingers down to walk. Lift them to stop.',
    ],
  },
  map: `#########
#.......#
#.......#
#...P...E
#.......#
#########`,
};
