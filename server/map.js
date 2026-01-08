// server/map.js
// マップ初期化・定数

const { generateMapData } = require('../generateMapData');

const MAJOR_ARCANA = [
    { number: 0, name: 'The Fool' },
    { number: 1, name: 'The Magician' },
    { number: 2, name: 'The High Priestess' },
    { number: 3, name: 'The Empress' },
    { number: 4, name: 'The Emperor' },
    { number: 5, name: 'The Hierophant' },
    { number: 6, name: 'The Lovers' },
    { number: 7, name: 'The Chariot' },
    { number: 8, name: 'Strength' },
    { number: 9, name: 'The Hermit' },
    { number: 10, name: 'Wheel of Fortune' },
    { number: 11, name: 'Justice' },
    { number: 12, name: 'The Hanged Man' },
    { number: 13, name: 'Death' },
    { number: 14, name: 'Temperance' },
    { number: 15, name: 'The Devil' },
    { number: 16, name: 'The Tower' },
    { number: 17, name: 'The Star' },
    { number: 18, name: 'The Moon' },
    { number: 19, name: 'The Sun' },
    { number: 20, name: 'Judgement' },
    { number: 21, name: 'The World' }
];

const MAJOR_ARCANA_BY_AREA = {
    wands: [4, 8, 15, 19],
    pentacles: [5, 9, 12, 16],
    swords: [3, 10, 11, 17],
    cups: [2, 7, 14, 18],
    joker: [0, 1, 6, 13, 20, 21]
};

const FACTION_BY_AREA = {
    wands: 'fire',
    pentacles: 'earth',
    swords: 'wind',
    cups: 'water',
    joker: 'neutral'
};

const FACTION_LABEL_BY_ID = {
    fire: 'Fire',
    earth: 'Earth',
    wind: 'Wind',
    water: 'Water',
    neutral: 'Neutral'
};

const buildMapConfigs = () => {
    const nationMaps = Object.entries(FACTION_BY_AREA).map(([areaId, faction]) => ({
        mapId: areaId,
        mapType: 'nation',
        faction,
        factionLabel: FACTION_LABEL_BY_ID[faction] || faction
    }));

    const majorMaps = [];
    Object.entries(MAJOR_ARCANA_BY_AREA).forEach(([areaId, numbers]) => {
        const faction = FACTION_BY_AREA[areaId] || 'neutral';
        numbers.forEach((num) => {
            const entry = MAJOR_ARCANA.find((item) => item.number === num);
            majorMaps.push({
                mapId: `major_${String(num).padStart(2, '0')}`,
                mapType: 'major',
                faction,
                factionLabel: FACTION_LABEL_BY_ID[faction] || faction,
                cardNumber: num,
                cardName: entry ? entry.name : `Major ${num}`
            });
        });
    });

    return [...nationMaps, ...majorMaps];
};

async function initializeMapData(firestore) {
    console.log('[Map Init] Checking world_map_* collections...');

    const mapConfigs = buildMapConfigs();

    try {
        for (const config of mapConfigs) {
            const collectionName = `world_map_${config.mapId}`;
            const collectionRef = firestore.collection(collectionName);
            const snapshot = await collectionRef.limit(1).get();
            if (!snapshot.empty) {
                console.log(`[Map Init] ${collectionName} already exists. Skipping.`);
                continue;
            }

            console.log(`[Map Init] Generating islands for ${collectionName}...`);
            const islands = generateMapData(config);
            let batch = firestore.batch();
            let batchCount = 0;
            let totalCount = 0;

            for (const island of islands) {
                const docRef = collectionRef.doc(island.id);
                batch.set(docRef, island);
                batchCount += 1;
                totalCount += 1;

                if (batchCount >= 500) {
                    await batch.commit();
                    batch = firestore.batch();
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }

            console.log(`[Map Init] ${collectionName}: ${totalCount} islands created.`);
        }
    } catch (error) {
        console.error('[Map Init] Failed to initialize maps:', error?.message || error);
    }
}

module.exports = {
    MAJOR_ARCANA,
    MAJOR_ARCANA_BY_AREA,
    FACTION_BY_AREA,
    FACTION_LABEL_BY_ID,
    buildMapConfigs,
    initializeMapData
};
