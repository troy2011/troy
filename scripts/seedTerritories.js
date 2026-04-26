// scripts/seedTerritories.js
// Firestore territories コレクションの初期データを投入するワンタイムスクリプト。
// 既存ドキュメントは上書きせず、存在しないものだけ作成する。
//
// 実行方法:
//   node scripts/seedTerritories.js
//   node scripts/seedTerritories.js --force   # 全件上書き

require('dotenv').config();
const admin = require('firebase-admin');
const { TERRITORIES } = require('../server/tarotTerritories');

const FORCE = process.argv.includes('--force');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const serviceAccount = serviceAccountJson
    ? JSON.parse(serviceAccountJson)
    : require('../config/firebase-service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://my-liff-app-ee704-default-rtdb.firebaseio.com',
});

const db = admin.firestore();

function buildDocument(territory) {
    const { id, name, element, symbol, isCapital, ownerNation, symbolDef, defaultLevels } = territory;
    return {
        territoryId:    id,
        name,
        element,
        symbol,
        isCapital:      !!isCapital,
        ownerNation:    isCapital ? (ownerNation || null) : null,
        symbolDefId:    symbolDef?.id || null,
        symbolName:     symbolDef?.name || null,
        arcanaName:     symbolDef?.arcana || null,
        symbolMaxHp:    symbolDef?.maxHp || 3000,
        defaultLevels:  defaultLevels || { military: 1, economy: 1, support: 1 },
        levels:         defaultLevels || { military: 1, economy: 1, support: 1 },
        captureCount:   0,
        capturedAt:     null,
        weeklyContest:  null,
        createdAt:      admin.firestore.FieldValue.serverTimestamp(),
    };
}

async function seed() {
    const territoryEntries = Object.values(TERRITORIES);
    const col = db.collection('territories');

    let created = 0;
    let skipped = 0;

    // Firestoreのバッチ上限(500)を考慮して分割
    const BATCH_SIZE = 200;
    for (let i = 0; i < territoryEntries.length; i += BATCH_SIZE) {
        const chunk = territoryEntries.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const territory of chunk) {
            const ref = col.doc(territory.id);

            if (!FORCE) {
                const snap = await ref.get();
                if (snap.exists) {
                    console.log(`  SKIP  ${territory.id} (already exists)`);
                    skipped++;
                    continue;
                }
            }

            batch.set(ref, buildDocument(territory), { merge: FORCE });
            console.log(`  WRITE ${territory.id} — ${territory.name}`);
            created++;
        }

        await batch.commit();
    }

    console.log(`\n完了: ${created} 件作成, ${skipped} 件スキップ`);
    process.exit(0);
}

seed().catch((err) => {
    console.error('シードエラー:', err);
    process.exit(1);
});
