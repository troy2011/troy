// generateMapData.js
// MMO戦略ゲーム「海賊陣取りゲーム」の初期マップデータ生成スクリプト

// 島のサイズごとのグリッド数を定義（モジュールスコープ）
const islandGridSize = {
    'small': { width: 3, height: 3 },
    'medium': { width: 3, height: 4 },
    'large': { width: 4, height: 4 },
    'giant': { width: 5, height: 5 }
};

// 島のサイズごとの建設スロット数を定義（モジュールスコープ）
const buildingSlots = {
    'small': { layout: '1x1', slots: 1 },   // 1マス
    'medium': { layout: '1x2', slots: 2 },  // 横並び2マス
    'large': { layout: '2x2', slots: 4 },   // 正方形4マス
    'giant': { layout: '3x3', slots: 9 }    // 首都用9マス
};

// バイオーム（地形タイプ）の定義（モジュールスコープ）
const biomePoolsByFaction = {
    fire: [{ biome: 'volcanic', frame: 32 }],
    earth: [{ biome: 'rocky', frame: 33 }],
    wind: [{ biome: 'mushroom', frame: 34 }],
    water: [{ biome: 'lake', frame: 35 }]
};


// 守護獣（島の守り手）の定義（モジュールスコープ）
const guardianTypes = {
    'crab_giant': { name: '巨大カニ', hp: 100, attack: 15, defense: 20, difficulty: 'easy' },
    'skeleton_warrior': { name: 'スケルトン戦士', hp: 150, attack: 25, defense: 15, difficulty: 'medium' },
    'sea_serpent': { name: '海蛇', hp: 200, attack: 30, defense: 25, difficulty: 'hard' },
    'kraken': { name: 'クラーケン', hp: 300, attack: 40, defense: 30, difficulty: 'very_hard' }
};

/**
 * 初期マップデータを生成する
 * @returns {Array} 全島の配列
 */
function generateMapData() {
    const islands = [];
    let idCounter = 1;

    // マップ全体サイズ
    const MAP_WIDTH = 500;  // グリッド数
    const MAP_HEIGHT = 500; // グリッド数
    // ★ 仕様: 1グリッド = 32ピクセル（マップ全体は 500×500グリッド = 16,000×16,000ピクセル）

    // ========================================
    // 1. 中央エリア（聖域）
    // ========================================
    const centerX = Math.floor(MAP_WIDTH / 2);
    const centerY = Math.floor(MAP_HEIGHT / 2);

    // 世界樹（中心固定オブジェクト）
    islands.push({
        id: `world_tree`,
        type: 'world_tree',
        size: 'giant',
        coordinate: { x: centerX, y: centerY },
        name: '世界樹',
        faction: 'neutral',
        ownerRace: null,
        ownerId: null,
        buildings: [],
        biome: 'sacred', // 神聖な地
        buildingSlots: buildingSlots['giant'],
        guardian: null, // 守護獣なし
        occupationStatus: 'sacred' // 聖域（占領不可）
    });

    // ========================================
    // 2. 四隅エリア（4大国の領土）
    // ========================================
    const corners = [
        { name: '火の国', faction: 'fire', color: 'red', centerX: 10, centerY: MAP_HEIGHT - 10, resource: '紅蓮鉄' },
        { name: '水の国', faction: 'water', color: 'blue', centerX: MAP_WIDTH - 10, centerY: MAP_HEIGHT - 10, resource: '深海サンゴ' },
        { name: '地の国', faction: 'earth', color: 'green', centerX: 10, centerY: 10, resource: '黒曜石' },
        { name: '風の国', faction: 'wind', color: 'purple', centerX: MAP_WIDTH - 10, centerY: 10, resource: '世界樹の枝' }
    ];

    // 国エリア（四隅の矩形）: サーバー側のホーム島生成エリアと一致させる
    function getNationBounds(faction) {
        switch (faction) {
            case 'earth': return { minX: 0, maxX: 120, minY: 0, maxY: 120 };
            case 'wind': return { minX: 380, maxX: 499, minY: 0, maxY: 120 };
            case 'fire': return { minX: 0, maxX: 120, minY: 380, maxY: 499 };
            case 'water': return { minX: 380, maxX: 499, minY: 380, maxY: 499 };
            default: return { minX: 0, maxX: MAP_WIDTH - 1, minY: 0, maxY: MAP_HEIGHT - 1 };
        }
    }

    /**
     * ランダムにバイオームを選択
     */
    function shouldAssignBiome() {
        return Math.random() < 0.3;
    }

    /**
     * 島のサイズに応じて守護獣を選択
     */
    function getGuardianForIsland(size) {
        if (size === 'small') {
            return Math.random() < 0.5 ? 'crab_giant' : 'skeleton_warrior';
        } else if (size === 'medium') {
            return Math.random() < 0.7 ? 'skeleton_warrior' : 'sea_serpent';
        } else {
            return Math.random() < 0.6 ? 'sea_serpent' : 'kraken';
        }
    }


    // 既存の島が占めるすべてのグリッド座標をセットに保存（重複チェック用）
    const occupiedPositions = new Set();
    islands.forEach(island => {
        const gridSize = islandGridSize[island.size] || { width: 3, height: 3 };
        const halfWidth = Math.floor(gridSize.width / 2);
        const halfHeight = Math.floor(gridSize.height / 2);
        for (let dy = -halfHeight; dy <= halfHeight; dy++) {
            for (let dx = -halfWidth; dx <= halfWidth; dx++) {
                occupiedPositions.add(`${island.coordinate.x + dx},${island.coordinate.y + dy}`);
            }
        }
    });

    corners.forEach(corner => {
        // 首都島（超巨大、占領不可）
        islands.push({
            id: `capital_${corner.faction}`,
            type: 'capital',
            size: 'giant',
            coordinate: { x: corner.centerX, y: corner.centerY },
            name: `${corner.name}首都`,
            faction: corner.faction,
            ownerRace: corner.faction,
            ownerId: `npc_${corner.faction}`,
            buildings: [
                {
                    buildingId: `nation_building_${corner.color}`,
                    tileIndex: (() => {
                        switch (corner.color) {
                            case 'red': return 576;
                            case 'green': return 579;
                            case 'yellow': return 582;
                            case 'blue': return 585;
                            default: return 800;
                        }
                    })(),
                    status: 'completed',
                    level: 1,
                    width: 3,
                    height: 3,
                    visualWidth: 3,
                    visualHeight: 3,
                    maxHp: 900,
                    currentHp: 900
                }
            ],
            biome: null,
            biomeFrame: null,
            buildingSlots: buildingSlots['giant'],
            guardian: null, // 首都は守護獣なし
            occupationStatus: 'capital' // 首都（占領不可）
        });

        // 首都が占めるグリッドを登録
        const capitalGridSize = islandGridSize['giant'];
        const halfWidth = Math.floor(capitalGridSize.width / 2);
        const halfHeight = Math.floor(capitalGridSize.height / 2);
        for (let dy = -halfHeight; dy <= halfHeight; dy++) {
            for (let dx = -halfWidth; dx <= halfWidth; dx++) {
                occupiedPositions.add(`${corner.centerX + dx},${corner.centerY + dy}`);
            }
        }

        // 国エリア（四隅の矩形）内に島を配置（小島中心）
        const islandsPerNation = 10;
        const bounds = getNationBounds(corner.faction);

        for (let i = 0; i < islandsPerNation; i++) {
            let x, y, size;
            let attempts = 0;
            const maxAttempts = 100;
            let canPlace = false;

            do {
                // 国エリア内のランダムな位置
                x = Math.floor(Math.random() * (bounds.maxX - bounds.minX + 1)) + bounds.minX;
                y = Math.floor(Math.random() * (bounds.maxY - bounds.minY + 1)) + bounds.minY;
                size = 'small';

                // この島が占めるグリッド範囲をチェック
                const gridSize = islandGridSize[size];
                const halfW = Math.floor(gridSize.width / 2);
                const halfH = Math.floor(gridSize.height / 2);

                // 島が占めるすべてのグリッドが空いているかチェック
                canPlace = true;
                for (let dy = -halfH; dy <= halfH && canPlace; dy++) {
                    for (let dx = -halfW; dx <= halfW && canPlace; dx++) {
                        const checkX = x + dx;
                        const checkY = y + dy;
                        if (checkX < 0 || checkX >= MAP_WIDTH || checkY < 0 || checkY >= MAP_HEIGHT ||
                            occupiedPositions.has(`${checkX},${checkY}`)) {
                            canPlace = false;
                        }
                    }
                }

                attempts++;
            } while (!canPlace && attempts < maxAttempts);

            if (attempts >= maxAttempts) continue;

            // 島が占めるすべてのグリッドを occupiedPositions に登録
            const gridSize = islandGridSize[size];
            const halfW = Math.floor(gridSize.width / 2);
            const halfH = Math.floor(gridSize.height / 2);
            for (let dy = -halfH; dy <= halfH; dy++) {
                for (let dx = -halfW; dx <= halfW; dx++) {
                    occupiedPositions.add(`${x + dx},${y + dy}`);
                }
            }

            // 資源島と無人島をランダムに配置（資源島の確率30%）
            const isResourceIsland = (size === 'small' && shouldAssignBiome());
            const type = isResourceIsland ? 'resource' : 'barren';

            // バイオームと守護獣を決定
            const biomeData = isResourceIsland
                ? (biomePoolsByFaction[corner.faction]?.[0] || { biome: null, frame: null })
                : { biome: null, frame: null };
            const guardianType = getGuardianForIsland(size);

            islands.push({
                id: `${corner.faction}_${String(idCounter).padStart(3, '0')}`,
                type: type,
                size: size,
                coordinate: { x, y },
                name: isResourceIsland ? `${corner.resource}の島${idCounter}` : `${corner.name}の島${idCounter}`,
                faction: corner.faction,
                ownerRace: corner.faction,
                ownerId: `npc_${corner.faction}`,
                buildings: [],
                // 新規フィールド
                biome: biomeData.biome,
                biomeFrame: biomeData.frame,
                buildingSlots: buildingSlots[size],
                guardian: {
                    type: guardianType,
                    defeated: true // NPC国の島は既に守護獣を倒している
                },
                occupationStatus: 'occupied' // 占領済み
            });
            idCounter++;
        }
    });


    // ========================================
    // 3. 外洋エリア（ランダム配置）
    // ========================================
    // マップを4分割して各エリアに250個ずつ配置
    const halfWidth = Math.floor(MAP_WIDTH / 2);
    const halfHeight = Math.floor(MAP_HEIGHT / 2);

    const quadrants = [
        { name: '左上', minX: 0, maxX: halfWidth, minY: 0, maxY: halfHeight },
        { name: '右上', minX: halfWidth, maxX: MAP_WIDTH, minY: 0, maxY: halfHeight },
        { name: '左下', minX: 0, maxX: halfWidth, minY: halfHeight, maxY: MAP_HEIGHT },
        { name: '右下', minX: halfWidth, maxX: MAP_WIDTH, minY: halfHeight, maxY: MAP_HEIGHT }
    ];

    const islandsPerQuadrant = 250;

    quadrants.forEach(quadrant => {
        console.log(`[マップ生成] ${quadrant.name}エリアに${islandsPerQuadrant}個の島を配置中...`);

        for (let i = 0; i < islandsPerQuadrant; i++) {
            let x, y, size;
            let attempts = 0;
            const maxAttempts = 100;
            let canPlace = false;

            // 重複しない位置を探す（各エリア内のみ）
            do {
                x = Math.floor(Math.random() * (quadrant.maxX - quadrant.minX)) + quadrant.minX;
                y = Math.floor(Math.random() * (quadrant.maxY - quadrant.minY)) + quadrant.minY;

                // サイズをランダムに決定（小島60%, 中島30%, 大島10%）
                const rand = Math.random();
                if (rand < 0.60) size = 'small';
                else if (rand < 0.90) size = 'medium';
                else size = 'large';

                // この島が占めるグリッド範囲をチェック
                const gridSize = islandGridSize[size];
                const halfW = Math.floor(gridSize.width / 2);
                const halfH = Math.floor(gridSize.height / 2);

                // 島が占めるすべてのグリッドが空いているかチェック
                canPlace = true;
                for (let dy = -halfH; dy <= halfH && canPlace; dy++) {
                    for (let dx = -halfW; dx <= halfW && canPlace; dx++) {
                        const checkX = x + dx;
                        const checkY = y + dy;
                        // マップ範囲外、または既に占有されている場合は配置不可
                        if (checkX < 0 || checkX >= MAP_WIDTH || checkY < 0 || checkY >= MAP_HEIGHT ||
                            occupiedPositions.has(`${checkX},${checkY}`)) {
                            canPlace = false;
                        }
                    }
                }

                attempts++;
            } while (!canPlace && attempts < maxAttempts);

            if (attempts >= maxAttempts) continue; // 配置場所が見つからない場合はスキップ

            // 島が占めるすべてのグリッドを occupiedPositions に登録
            const gridSize = islandGridSize[size];
            const halfW = Math.floor(gridSize.width / 2);
            const halfH = Math.floor(gridSize.height / 2);
            for (let dy = -halfH; dy <= halfH; dy++) {
                for (let dx = -halfW; dx <= halfW; dx++) {
                    occupiedPositions.add(`${x + dx},${y + dy}`);
                }
            }

            // 資源島と無人島をランダムに配置（資源島の確率20%）
            const isResourceIsland = (size === 'small' && shouldAssignBiome());
            const type = isResourceIsland ? 'resource' : 'barren';

            // バイオームと守護獣を決定
            const biomeData = isResourceIsland ? { biome: 'forest', frame: 36 } : { biome: null, frame: null };
            const guardianType = getGuardianForIsland(size);

            islands.push({
                id: `random_${String(idCounter).padStart(3, '0')}`,
                type: type,
                size: size,
                coordinate: { x, y },
                name: isResourceIsland ? `資源の島${idCounter}` : `無人島${idCounter}`,
                faction: 'neutral',
                ownerRace: null,
                ownerId: null,
                buildings: [],
                // 新規フィールド
                biome: biomeData.biome,
                biomeFrame: biomeData.frame,
                buildingSlots: buildingSlots[size],
                guardian: {
                    type: guardianType,
                    defeated: false // 無人島の守護獣は未討伐
                },
                occupationStatus: 'wild' // 野生状態（未占領）
            });
            idCounter++;
        }
    });

    console.log(`[マップ生成] 合計 ${islands.length} 個の島を生成しました。`);
    return islands;
}


module.exports = {
    generateMapData,
    guardianTypes
};
