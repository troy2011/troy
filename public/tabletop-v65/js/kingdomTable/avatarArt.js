// Upper-right tentacle: redraw only this foreground curl over the real cards.
const KRAKEN_GRIP_MASK = [
    [0.51, 0.44], [0.545, 0.331], [0.60, 0.285], [0.662, 0.273],
    [0.74, 0.282], [0.799, 0.268], [0.867, 0.229], [0.89, 0.273],
    [0.902, 0.381], [0.848, 0.439], [0.619, 0.495], [0.52, 0.492],
].map(Object.freeze);

export function avatarGripClip(points, {x = 0, y = 0, width = 1, height = 1, unit = '%'} = {}) {
    return 'polygon(' + points.map(([px, py]) => {
        const scale = unit === '%' ? 100 : 1;
        return (x + px * width) * scale + unit + ' ' + (y + py * height) * scale + unit;
    }).join(',') + ')';
}

const entries = [
    ['fool','愚者',439,361,158,{opponentAngle:160,fanScale:0.82,fanStep:6,spacingRatio:0.09}], ['magician','魔術師',497,416,12,{opponentAngle:16,fanScale:0.85,fanStep:5,spacingRatio:0.10}],
    ['high-priestess','女教皇',313,192,-55], ['empress','女帝',353,279,-59],
    ['emperor','皇帝',365,410,-15], ['hierophant','教皇',352,301,-22],
    ['lovers','恋人',358,337,-30,{}], ['chariot','戦車',328,323,-19],
    ['strength','力',360,354,-17,{}], ['hermit','隠者',371,312,-15],
    ['wheel-of-fortune','運命の輪',399,352,20], ['justice','正義',365,300,-17],
    ['hanged-man','吊るされた男',392,307,-17], ['death','死神',299,315,-18],
    ['temperance','節制',395,332,-17], ['devil','悪魔',428,335,-15],
    ['tower','塔',428,228,-12,{localX:0.735,opponentAngle:-12,fanStep:5,spacingRatio:0.10,gripMask:KRAKEN_GRIP_MASK}], ['star','星',492,178,76,{fanStep:4,spacingRatio:0.07}],
    ['moon','月',377,264,-18], ['sun','太陽',304,392,-12,{}],
    ['judgement','審判',448,214,-20], ['world','世界',453,241,-18],
];

const gripRegistrations = {
  "1": {
    "x": 456.3,
    "y": 426,
    "angle": 2,
    "mask": [
      [
        432.3,
        410.1
      ],
      [
        446.3,
        406.1
      ],
      [
        471.3,
        409.1
      ],
      [
        481.3,
        419.1
      ],
      [
        476.3,
        434
      ],
      [
        434.3,
        434
      ]
    ]
  },
  "2": {
    "x": 294.4,
    "y": 226.1,
    "angle": -1,
    "mask": [
      [
        270.4,
        211.6
      ],
      [
        284.4,
        207.6
      ],
      [
        309.4,
        210.6
      ],
      [
        319.4,
        220.6
      ],
      [
        314.4,
        234.1
      ],
      [
        272.4,
        234.1
      ]
    ]
  },
  "3": {
    "x": 369.4,
    "y": 295.7,
    "angle": -1,
    "mask": [
      [
        345.4,
        289.4
      ],
      [
        359.4,
        285.4
      ],
      [
        384.4,
        288.4
      ],
      [
        394.4,
        298.4
      ],
      [
        389.4,
        303.7
      ],
      [
        347.4,
        303.7
      ]
    ]
  },
  "4": {
    "x": 396.7,
    "y": 383.4,
    "angle": -1,
    "mask": [
      [
        372.7,
        376.4
      ],
      [
        386.7,
        372.4
      ],
      [
        411.7,
        375.4
      ],
      [
        421.7,
        385.4
      ],
      [
        416.7,
        391.4
      ],
      [
        374.7,
        391.4
      ]
    ]
  },
  "5": {
    "x": 377.1,
    "y": 325.2,
    "angle": -8,
    "mask": [
      [
        353.1,
        309.3
      ],
      [
        367.1,
        305.3
      ],
      [
        392.1,
        308.3
      ],
      [
        402.1,
        318.3
      ],
      [
        397.1,
        333.2
      ],
      [
        355.1,
        333.2
      ]
    ]
  },
  "6": {
    "x": 352.3,
    "y": 353.2,
    "angle": 0,
    "mask": [
      [
        328.3,
        332.8
      ],
      [
        342.3,
        328.8
      ],
      [
        367.3,
        331.8
      ],
      [
        377.3,
        341.8
      ],
      [
        372.3,
        361.2
      ],
      [
        330.3,
        361.2
      ]
    ]
  },
  "7": {
    "x": 352,
    "y": 339.4,
    "angle": -12,
    "mask": [
      [
        328,
        306.9
      ],
      [
        342,
        302.9
      ],
      [
        367,
        305.9
      ],
      [
        377,
        315.9
      ],
      [
        372,
        347.4
      ],
      [
        330,
        347.4
      ]
    ]
  },
  "8": {
    "x": 369,
    "y": 344.3,
    "angle": 0,
    "mask": [
      [
        345,
        334.5
      ],
      [
        359,
        330.5
      ],
      [
        384,
        333.5
      ],
      [
        394,
        343.5
      ],
      [
        389,
        352.3
      ],
      [
        347,
        352.3
      ]
    ]
  },
  "9": {
    "x": 337.8,
    "y": 305.6,
    "angle": 12,
    "mask": [
      [
        313.8,
        291.3
      ],
      [
        327.8,
        287.3
      ],
      [
        352.8,
        290.3
      ],
      [
        362.8,
        300.3
      ],
      [
        357.8,
        313.6
      ],
      [
        315.8,
        313.6
      ]
    ]
  },
  "10": {
    "x": 369,
    "y": 406.5,
    "angle": 0,
    "mask": [
      [
        345,
        388.5
      ],
      [
        359,
        384.5
      ],
      [
        384,
        387.5
      ],
      [
        394,
        397.5
      ],
      [
        389,
        414.5
      ],
      [
        347,
        414.5
      ]
    ]
  },
  "11": {
    "x": 401.4,
    "y": 327,
    "angle": 4,
    "mask": [
      [
        377.4,
        302.8
      ],
      [
        391.4,
        298.8
      ],
      [
        416.4,
        301.8
      ],
      [
        426.4,
        311.8
      ],
      [
        421.4,
        335
      ],
      [
        379.4,
        335
      ]
    ]
  },
  "12": {
    "x": 403.7,
    "y": 320.1,
    "angle": 0,
    "mask": [
      [
        379.7,
        298.6
      ],
      [
        393.7,
        294.6
      ],
      [
        418.7,
        297.6
      ],
      [
        428.7,
        307.6
      ],
      [
        423.7,
        328.1
      ],
      [
        381.7,
        328.1
      ]
    ]
  },
  "13": {
    "x": 262.2,
    "y": 358.8,
    "angle": 1,
    "mask": [
      [
        238.2,
        322.5
      ],
      [
        252.2,
        318.5
      ],
      [
        277.2,
        321.5
      ],
      [
        287.2,
        331.5
      ],
      [
        282.2,
        366.8
      ],
      [
        240.2,
        366.8
      ]
    ]
  },
  "14": {
    "x": 367.3,
    "y": 333.8,
    "angle": 8,
    "mask": [
      [
        343.3,
        316.9
      ],
      [
        357.3,
        312.9
      ],
      [
        382.3,
        315.9
      ],
      [
        392.3,
        325.9
      ],
      [
        387.3,
        341.8
      ],
      [
        345.3,
        341.8
      ]
    ]
  },
  "15": {
    "x": 392.3,
    "y": 354,
    "angle": 1,
    "mask": [
      [
        368.3,
        319.8
      ],
      [
        382.3,
        315.8
      ],
      [
        407.3,
        318.8
      ],
      [
        417.3,
        328.8
      ],
      [
        412.3,
        362
      ],
      [
        370.3,
        362
      ]
    ]
  },
  "18": {
    "x": 362.9,
    "y": 272.8,
    "angle": 0,
    "mask": [
      [
        338.9,
        258.7
      ],
      [
        352.9,
        254.7
      ],
      [
        377.9,
        257.7
      ],
      [
        387.9,
        267.7
      ],
      [
        382.9,
        280.8
      ],
      [
        340.9,
        280.8
      ]
    ]
  },
  "19": {
    "x": 287,
    "y": 386.3,
    "angle": -11,
    "mask": [
      [
        263,
        374.7
      ],
      [
        277,
        370.7
      ],
      [
        302,
        373.7
      ],
      [
        312,
        383.7
      ],
      [
        307,
        394.3
      ],
      [
        265,
        394.3
      ]
    ]
  },
  "20": {
    "x": 478,
    "y": 197.6,
    "angle": -1,
    "mask": [
      [
        454,
        183.9
      ],
      [
        468,
        179.9
      ],
      [
        493,
        182.9
      ],
      [
        503,
        192.9
      ],
      [
        498,
        205.6
      ],
      [
        456,
        205.6
      ]
    ]
  },
  "21": {
    "x": 456.1,
    "y": 235.4,
    "angle": 8,
    "mask": [
      [
        432.1,
        219.2
      ],
      [
        446.1,
        215.2
      ],
      [
        471.1,
        218.2
      ],
      [
        481.1,
        228.2
      ],
      [
        476.1,
        243.4
      ],
      [
        434.1,
        243.4
      ]
    ]
  }
};

export const avatars = Object.freeze(entries.map(([slug, name, x, y, angle, placement], id) => {
    const folder = '/tabletop-v65/assets/tarot-kingdom-table/avatars-v1/' + String(id).padStart(2, '0') + '-' + slug;
    const reg = gripRegistrations[id];
    const framedStar = id === 17;
    return Object.freeze({id, name, redrawn: !!placement || !!reg, ...placement, x: framedStar ? (x - 105) / 496 : (reg?.x ?? x) / 640, y: framedStar ? y / 434 : (reg?.y ?? y) / 560, angle: reg?.angle ?? angle,
        ...(framedStar ? { localGripMask: [[474,177],[484,169],[502,168],[517,174],[527,187],[525,203],[509,213],[494,204],[482,191]].map(([px,py])=>[(px-105)/496,py/434]), victoryStill: folder + '/table-portrait.png?v=standing-v31' } : {}),
        ...(reg ? { registeredGrip: true, localX: reg.x / 640, opponentAngle: reg.angle, fanStep: 5, fanScale: 0.92, spacingRatio: 0.095, gripMask: reg.mask.map(([px,py]) => [px / 640, py / 560]) } : {}), icon: folder + '/player-icon.png' + ([6, 16, 19].includes(id) ? '?v=face-icons-v36' : ''),
        portrait: id === 16 ? '/tabletop-v65/assets/tarot-kingdom-table/roster-preview/16-kraken-three-arms.png?v=ink-grip-v1' : framedStar ? '/tabletop-v65/assets/tarot-kingdom-table/roster-preview/17-original-upper.png?v=original-wet-v1' : reg ? '/tabletop-v65/assets/tarot-kingdom-table/roster-preview/' + String(id).padStart(2,'0') + '.png?v=grips-v1' : folder + (id === 16 ? '/table-portrait-kraken.png' : '/table-portrait.png' + (placement ? '?v=standing-v31' : '')),
        ...(id === 16 ? { ...{"registeredGrip":true,"localX":0.5825583133971292,"x":0.5825583133971292,"y":0.29440789473684215,"angle":-9,"opponentAngle":-9,"fanStep":5,"fanScale":0.9,"spacingRatio":0.095,"gripMask":[[0.5366365131578947,0.3080143540669857],[0.5440066786283891,0.2963516746411483],[0.5746212121212121,0.29052033492822965],[0.5984325159489633,0.284688995215311],[0.619976076555024,0.2859848484848485],[0.6301809210526316,0.29311204146730463],[0.6398188297448166,0.30477472089314195],[0.6307478568580542,0.317085326953748],[0.5916292862838916,0.32162081339712917],[0.5593139453748006,0.32291666666666663]]}, victoryStill: folder + '/table-portrait.png?v=standing-v31'} : {}), victory: folder + '/victory.gif'});
}));
export const getAvatar = id => Number.isInteger(id) && id >= 0 && id < avatars.length ? avatars[id] : null;

export function avatarImage(src, className, alt = '', lazy = false) {
    const image = document.createElement('img');
    image.className = className;
    image.alt = alt;
    image.decoding = 'async';
    image.draggable = false;
    if (lazy) image.loading = 'lazy';
    image.src = src;
    return image;
}

// Right extent of the rotated fan; the grip is the origin and stays fixed when fitting.
export function opponentFanRightEdge(count, angle, angleStep, spacing) {
    const radians = Math.PI / 180;
    const fanAngle = angle * radians;
    const fanCos = Math.cos(fanAngle), fanSin = Math.sin(fanAngle);
    let extent = 0;
    for (let index = 0; index < count; index += 1) {
        const offset = index - (count - 1) / 2;
        const turn = fanAngle + offset * angleStep * radians;
        // A card is 1 wide × 1.5 tall, turning about its bottom center.
        const edge = offset * spacing * fanCos + Math.abs(Math.cos(turn)) / 2 +
            1.5 * Math.max(0, Math.sin(turn));
        extent = Math.max(extent, edge);
    }
    return extent;
}

export function fitOpponentFanWidth(width, available, count, angle, angleStep, spacing) {
    const extent = opponentFanRightEdge(count, angle, angleStep, spacing);
    return extent ? Math.min(width, Math.max(0, available) / extent) : width;
}

export function createLocalAvatar(back) {
    const seat = document.getElementById('ktAvatarSeat');
    const stage = seat.firstElementChild;
    let previous = null, previousCount = -1;
    const masks = {
        0: [[422,354],[440,350],[453,354],[450,363],[429,370],[415,368]],
        1: [],
        6: [[332,343],[352,333],[371,338],[380,351],[367,366],[347,373],[330,366]],
        8: [[354,371],[363,371],[374,374],[387,376],[408,384],[421,399],[402,403],[378,390],[350,380]],
        17: [[474,177],[484,169],[502,168],[517,174],[527,187],[525,203],[509,213],[494,204],[482,191]],
        19: [[241,389],[250,380],[262,377],[282,373],[295,377],[305,387],[306,394],[288,392],[277,402],[266,417],[247,424],[236,419]],
    };
    const clip = avatar => (avatar.localGripMask || avatar.gripMask) ? avatarGripClip(avatar.localGripMask || avatar.gripMask) : masks[avatar.id] ? (masks[avatar.id].length
        ? 'polygon(' + masks[avatar.id].map(([x,y]) => (x / 6.4) + '% ' + (y / 5.6) + '%').join(',') + ')'
        : 'inset(100%)')
        : 'polygon(' + (avatar.x * 100 - 2) + '% ' + (avatar.y * 100 + 1) + '%,' +
            (avatar.x * 100 + 3.5) + '% ' + (avatar.y * 100 - 0.5) + '%,' +
            (avatar.x * 100 + 4) + '% ' + (avatar.y * 100 + 4) + '%,' +
            (avatar.x * 100 - 3) + '% ' + (avatar.y * 100 + 5) + '%)';
    return {
        paint(avatar, count) {
            seat.hidden = !avatar;
            if (!avatar) { if (previous) stage.replaceChildren(); previous = null; return; }
            if (previous !== avatar) {
                previous = avatar;
                previousCount = -1;
                stage.style.setProperty('--kt-avatar-x', (avatar.localX ?? avatar.x) * 100 + '%');
                stage.style.setProperty('--kt-avatar-y', avatar.y * 100 + '%');
                stage.style.setProperty('--kt-avatar-clip', clip(avatar));
                const fan = document.createElement('div');
                fan.className = avatar.registeredGrip ? 'kt-avatar-fan kt-avatar-fan-registered' : 'kt-avatar-fan';
                stage.replaceChildren(avatarImage(avatar.portrait, 'kt-avatar-portrait'), fan, avatarImage(avatar.portrait, 'kt-avatar-fingers'));
            }
            if (previousCount === count) return;
            previousCount = count;
            stage.children[1].replaceChildren(...Array.from({length:count}, (_, index) => {
                const card = avatarImage(back, 'kt-avatar-back');
                const step = (index - (count - 1) / 2) * Math.min(1, 10 / count);
                const tight = avatar.id === 2 || avatar.id === 3;
                card.style.setProperty('--kt-avatar-angle', (avatar.angle + step * (avatar.fanStep ?? (tight ? 4 : 8))) + 'deg');
                card.style.setProperty('--kt-avatar-offset', (step * (avatar.spacingRatio ? 12 * avatar.spacingRatio : 2)) + 'px');
                if (tight || avatar.fanScale) card.style.setProperty('--kt-avatar-back-scale', String(avatar.fanScale ?? 0.88));
                return card;
            }));
        }
    };
}
