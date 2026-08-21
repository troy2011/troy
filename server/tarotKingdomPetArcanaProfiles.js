function freezeWeights(Wand, Cup, Sword, Pentacle) {
    return Object.freeze({ Wand, Cup, Sword, Pentacle });
}

const PET_ARCANA_SUIT_WEIGHTS = Object.freeze({
    WAND: freezeWeights(0.55, 0.15, 0.15, 0.15),
    CUP: freezeWeights(0.15, 0.55, 0.15, 0.15),
    SWORD: freezeWeights(0.15, 0.15, 0.55, 0.15),
    PENTACLE: freezeWeights(0.15, 0.15, 0.15, 0.55),
    FIRE: freezeWeights(0.64, 0.12, 0.12, 0.12),
    WATER: freezeWeights(0.12, 0.64, 0.12, 0.12),
    ARCANE: freezeWeights(0.1, 0.42, 0.38, 0.1),
    NATURE: freezeWeights(0.1, 0.3, 0.1, 0.5),
    SHADOW: freezeWeights(0.1, 0.38, 0.42, 0.1),
    WARRIOR: freezeWeights(0.45, 0.1, 0.1, 0.35),
    SWIFT: freezeWeights(0.3, 0.1, 0.5, 0.1),
    TOXIC: freezeWeights(0.1, 0.38, 0.1, 0.42),
    STONE: freezeWeights(0.12, 0.12, 0.12, 0.64),
    VOID: freezeWeights(0.1, 0.35, 0.45, 0.1)
});

function profile(majorArcanaNumber, suitWeights, evolvesIntoRaidBossId = '') {
    return Object.freeze({
        majorArcanaNumber,
        suitWeights,
        ...(evolvesIntoRaidBossId ? { evolvesIntoRaidBossId } : {})
    });
}

const W = PET_ARCANA_SUIT_WEIGHTS;

const TAROT_KINGDOM_PET_ARCANA_PROFILES = Object.freeze({
    'ismartal-vol1-monster-01': profile(8, W.WARRIOR),
    'ismartal-vol1-monster-02': profile(1, W.ARCANE),
    'ismartal-vol1-monster-03': profile(13, W.SHADOW),
    'ismartal-vol1-monster-04': profile(4, W.STONE),
    'ismartal-vol1-monster-05': profile(2, W.ARCANE, 'ismartal-vol2-monster-16'),
    'ismartal-vol1-monster-06': profile(15, W.VOID),
    'ismartal-vol1-monster-07': profile(18, W.TOXIC),
    'ismartal-vol1-monster-08': profile(3, W.NATURE),
    'ismartal-vol1-monster-09': profile(19, W.FIRE),
    'ismartal-vol1-monster-10': profile(9, W.ARCANE),
    'ismartal-vol1-monster-11': profile(8, W.WARRIOR),
    'ismartal-vol1-monster-12': profile(7, W.SWIFT),
    'ismartal-vol1-monster-13': profile(13, W.TOXIC),
    'ismartal-vol1-monster-14': profile(18, W.WATER),
    'ismartal-vol1-monster-15': profile(13, W.NATURE),
    'ismartal-vol1-monster-16': profile(18, W.SWIFT),
    'ismartal-vol1-monster-17': profile(7, W.SWIFT),
    'ismartal-vol1-monster-18': profile(10, W.CUP),
    'ismartal-vol1-monster-19': profile(12, W.PENTACLE),
    'ismartal-vol1-monster-20': profile(17, W.WATER),

    'ismartal-vol2-monster-01': profile(14, W.WATER),
    'ismartal-vol2-monster-02': profile(6, W.ARCANE),
    'ismartal-vol2-monster-03': profile(18, W.SWORD),
    'ismartal-vol2-monster-04': profile(4, W.STONE),
    'ismartal-vol2-monster-05': profile(1, W.ARCANE),
    'ismartal-vol2-monster-06': profile(3, W.NATURE),
    'ismartal-vol2-monster-08': profile(15, W.WAND),
    'ismartal-vol2-monster-09': profile(15, W.SHADOW),
    'ismartal-vol2-monster-10': profile(11, W.SWORD),
    'ismartal-vol2-monster-11': profile(7, W.SWIFT),
    'ismartal-vol2-monster-12': profile(18, W.WATER),
    'ismartal-vol2-monster-13': profile(15, W.VOID, 'ismartal-vol2-monster-15'),
    'ismartal-vol2-monster-14': profile(8, W.WARRIOR, 'ismartal-vol2-monster-07'),
    'ismartal-vol2-monster-17': profile(4, W.PENTACLE),
    'ismartal-vol2-monster-18': profile(19, W.FIRE),
    'ismartal-vol2-monster-19': profile(10, W.PENTACLE),
    'ismartal-vol2-monster-20': profile(18, W.SHADOW),

    'ismartal-vol3-monster-01': profile(4, W.STONE),
    'ismartal-vol3-monster-02': profile(16, W.FIRE),
    'ismartal-vol3-monster-03': profile(10, W.SWORD),
    'ismartal-vol3-monster-04': profile(2, W.WATER),
    'ismartal-vol3-monster-05': profile(18, W.WATER),
    'ismartal-vol3-monster-06': profile(13, W.SHADOW),
    'ismartal-vol3-monster-07': profile(13, W.TOXIC),
    'ismartal-vol3-monster-08': profile(3, W.NATURE),
    'ismartal-vol3-monster-09': profile(15, W.SHADOW),
    'ismartal-vol3-monster-10': profile(18, W.VOID)
});

module.exports = {
    PET_ARCANA_SUIT_WEIGHTS,
    TAROT_KINGDOM_PET_ARCANA_PROFILES
};
