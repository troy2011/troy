const BATTLEFIELD_DEFINITIONS = [
  {
    id: 'moonlit-ruins',
    label: '月影の遺跡',
    imagePath: './assets/tarot-kingdom/moonlit-terrace-vertical-v3.png',
    surface: 'stone',
    shipSide: false
  },
  {
    id: 'coral-island',
    label: '珊瑚の島岸',
    imagePath: './assets/tarot-kingdom/battlefields/coral-island-v1.webp',
    surface: 'coral-stone',
    shipSide: false
  },
  {
    id: 'haunted-marsh',
    label: '亡霊の沼海',
    imagePath: './assets/tarot-kingdom/battlefields/haunted-marsh-v1.webp',
    surface: 'wet-stone',
    shipSide: false
  },
  {
    id: 'blue-grotto',
    label: '青光洞',
    imagePath: './assets/tarot-kingdom/battlefields/blue-grotto-v1.webp',
    surface: 'cave-stone',
    shipSide: false
  },
  {
    id: 'sea-fortress',
    label: '海上砦',
    imagePath: './assets/tarot-kingdom/battlefields/sea-fortress-v1.webp',
    surface: 'fortress-stone',
    shipSide: false
  },
  {
    id: 'ship-side',
    label: '船上迎撃',
    imagePath: './assets/tarot-kingdom/battlefields/ship-side-v1.webp',
    surface: 'ship-deck',
    shipSide: true
  }
];

export const TAROT_KINGDOM_BATTLEFIELDS = Object.freeze(Object.fromEntries(
  BATTLEFIELD_DEFINITIONS.map((entry) => [
    entry.id,
    Object.freeze({
      ...entry,
      version: 1,
      groundStartPercent: 36,
      backgroundPosition: 'center center'
    })
  ])
));

export const TAROT_KINGDOM_DEFAULT_BATTLEFIELD_ID = 'moonlit-ruins';

export const TAROT_KINGDOM_DESTINATION_BATTLEFIELDS = Object.freeze({
  near_sea: 'ship-side',
  palm_islet: 'coral-island',
  coral_lagoon: 'coral-island',
  coral_passage: 'coral-island',
  old_lighthouse: 'sea-fortress',
  sunken_trader: 'haunted-marsh',
  ship_graveyard: 'haunted-marsh',
  pirate_cove: 'sea-fortress',
  deep_maelstrom: 'ship-side',
  megalodon_reef: 'ship-side',
  specter_whale_sea: 'ship-side',
  armored_kraken_nest: 'ship-side',
  phantom_admiral_marsh: 'haunted-marsh',
  abyss_angler_vents: 'blue-grotto',
  cannon_hermit_fort: 'sea-fortress',
  storm_serpent_current: 'ship-side',
  manta_wraith_grotto: 'blue-grotto',
  treasure_hermit_cave: 'blue-grotto'
});

function normalizeId(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function getTarotKingdomBattlefieldById(battlefieldId = '') {
  const id = normalizeId(battlefieldId);
  return TAROT_KINGDOM_BATTLEFIELDS[id]
    || TAROT_KINGDOM_BATTLEFIELDS[TAROT_KINGDOM_DEFAULT_BATTLEFIELD_ID];
}

export function resolveTarotKingdomBattlefield(destinationId = '', preferredBattlefieldId = '') {
  const preferredId = normalizeId(preferredBattlefieldId);
  if (TAROT_KINGDOM_BATTLEFIELDS[preferredId]) {
    return TAROT_KINGDOM_BATTLEFIELDS[preferredId];
  }
  const normalizedDestinationId = normalizeId(destinationId);
  const mappedId = TAROT_KINGDOM_DESTINATION_BATTLEFIELDS[normalizedDestinationId]
    || TAROT_KINGDOM_DEFAULT_BATTLEFIELD_ID;
  return getTarotKingdomBattlefieldById(mappedId);
}

export function createTarotKingdomBattlefieldSnapshot(destinationId = '', preferredBattlefieldId = '') {
  const normalizedDestinationId = normalizeId(destinationId);
  const battlefield = resolveTarotKingdomBattlefield(normalizedDestinationId, preferredBattlefieldId);
  return {
    version: 1,
    id: battlefield.id,
    destinationId: normalizedDestinationId,
    surface: battlefield.surface,
    shipSide: battlefield.shipSide,
    groundStartPercent: battlefield.groundStartPercent
  };
}

export function auditTarotKingdomBattlefieldRegistry() {
  const errors = [];
  const battlefieldIds = new Set(Object.keys(TAROT_KINGDOM_BATTLEFIELDS));
  const groundStarts = new Set();

  Object.values(TAROT_KINGDOM_BATTLEFIELDS).forEach((battlefield) => {
    if (!battlefield.id) errors.push('battlefield id is required');
    if (!battlefield.imagePath) errors.push(`${battlefield.id}: imagePath is required`);
    if (!Number.isFinite(Number(battlefield.groundStartPercent))) {
      errors.push(`${battlefield.id}: groundStartPercent must be finite`);
    }
    groundStarts.add(Number(battlefield.groundStartPercent));
  });

  Object.entries(TAROT_KINGDOM_DESTINATION_BATTLEFIELDS).forEach(([destinationId, battlefieldId]) => {
    if (!battlefieldIds.has(battlefieldId)) {
      errors.push(`${destinationId}: unknown battlefield ${battlefieldId}`);
    }
  });

  if (groundStarts.size !== 1) {
    errors.push('all battlefields must share one groundStartPercent');
  }

  return {
    ok: errors.length === 0,
    errors,
    battlefieldCount: battlefieldIds.size,
    destinationCount: Object.keys(TAROT_KINGDOM_DESTINATION_BATTLEFIELDS).length,
    groundStartPercent: groundStarts.size === 1 ? Array.from(groundStarts)[0] : null
  };
}
