// Migrate world_map_*.ownerNation using PlayFab Nation (fallback to race mapping).
require('dotenv').config();
const admin = require('firebase-admin');
const PlayFab = require('playfab-sdk/Scripts/PlayFab/PlayFab');
const PlayFabServer = require('playfab-sdk/Scripts/PlayFab/PlayFabServer');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let serviceAccount = null;

if (serviceAccountJson) {
    serviceAccount = JSON.parse(serviceAccountJson);
} else {
    serviceAccount = require('../config/firebase-service-account.json');
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://my-liff-app-ee704-default-rtdb.firebaseio.com'
});

const firestore = admin.firestore();

PlayFab.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFab.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

const NATION_GROUP_BY_RACE = {
    Human: { island: 'fire' },
    Goblin: { island: 'water' },
    Orc: { island: 'earth' },
    Elf: { island: 'wind' }
};

function promisifyPlayFab(apiFunction, request) {
    return new Promise((resolve, reject) => {
        apiFunction(request, (error, result) => {
            if (error) return reject(error);
            if (result && result.data) return resolve(result.data);
            if (result) return resolve(result);
            return reject(new Error('PlayFab call returned no error and no result.'));
        });
    });
}

async function getNationForOwner(playFabId, fallbackRace) {
    try {
        const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Nation', 'Race']
        });
        const nation = ro?.Data?.Nation?.Value;
        if (nation) return String(nation).toLowerCase();
        const race = ro?.Data?.Race?.Value || fallbackRace;
        if (race && NATION_GROUP_BY_RACE[race]) {
            return NATION_GROUP_BY_RACE[race].island;
        }
    } catch (e) {
        console.warn('[migrate-owner-nation] PlayFab read failed:', playFabId, e?.errorMessage || e?.message || e);
    }
    if (fallbackRace && NATION_GROUP_BY_RACE[fallbackRace]) {
        return NATION_GROUP_BY_RACE[fallbackRace].island;
    }
    return null;
}

async function run() {
    if (!PlayFab.settings.titleId || !PlayFab.settings.developerSecretKey) {
        console.error('PlayFab credentials are missing. Set PLAYFAB_TITLE_ID and PLAYFAB_SECRET_KEY.');
        process.exit(1);
    }

    const collections = await firestore.listCollections();
    const mapCollections = collections.filter((col) => String(col.id || '').startsWith('world_map'));
    let updated = 0;
    let batch = firestore.batch();
    let batchCount = 0;

    for (const collection of mapCollections) {
        const snapshot = await collection.get();
        for (const doc of snapshot.docs) {
            const data = doc.data() || {};
            const ownerId = data.ownerId || null;
            const ownerNation = data.ownerNation || null;
            if (!ownerId || ownerNation) continue;

            const ownerRace = data.ownerRace || null;
            const nation = await getNationForOwner(ownerId, ownerRace);
            if (!nation) continue;

            batch.update(doc.ref, { ownerNation: nation });
            updated += 1;
            batchCount += 1;
            if (batchCount >= 450) {
                await batch.commit();
                batch = firestore.batch();
                batchCount = 0;
            }
        }
    }

    if (batchCount > 0) {
        await batch.commit();
    }

    console.log(`[migrate-owner-nation] Updated islands: ${updated}`);
    process.exit(0);
}

run().catch((e) => {
    console.error('[migrate-owner-nation] Failed:', e?.errorMessage || e?.message || e);
    process.exit(1);
});
