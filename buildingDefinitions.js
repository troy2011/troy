// buildingDefinitions.js
// 島に建設可能な施設の定義（シンプル化版）

/**
 * 施設のカテゴリ定義
 */
const buildingCategories = {
    military: {
        name: '軍事',
        icon: '⚔️',
        description: '防衛と攻撃に関する施設'
    },
    economic: {
        name: '経済',
        icon: '💰',
        description: '資源生産と交易に関する施設'
    },
    support: {
        name: '補助',
        icon: '🛠️',
        description: 'サポートとユーティリティ施設'
    }
};

/**
 * 施設の定義
 *
 * slotsRequired: 必要なスロット数（1=小施設、2=中施設、4=大施設）
 * buildTime: 建設時間（秒）
 * cost: 建設コスト（PlayFab仮想通貨コード）
 *   - PT: Ps（メイン通貨）
 * tileIndex: スプライトシート上のフレーム番号（buildings.png、32x32、32列）
 * sizeLogic: 占有サイズ（スロット単位）{ x, y }
 * sizeVisual: 見た目サイズ（スロット単位）{ x, y }
 * effects: 施設の効果
 */
const buildings = {
    capital: {
        id: 'capital',
        name: '首都',
        category: 'support',
        slotsRequired: 4,
        buildTime: 0,
        cost: { PT: 0 },
        tileIndex: 576,
        sizeLogic: { x: 3, y: 3 },
        sizeVisual: { x: 3, y: 3 },
        nationTileOffset: true,
        effects: {},
        description: '各国の中枢となる首都です。'
    },
    // ========================================
    // 軍事施設（Military）
    // ========================================
    watchtower: {
        id: 'watchtower',
        name: '見張り台',
        category: 'military',
        slotsRequired: 1,
        buildTime: 1800, // 30分
        cost: { PT: 200 },
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            visionRange: 10,
            earlyWarning: true
        },
        description: '周囲の海域を監視し、敵の接近を早期発見します。',
        levelLabel: false,
        levels: {
            1: {
                tileIndex: 833,
                sizeVisual: { x: 1, y: 1 },
                maxHp: 100,
                stats: { visionRange: 10 }
            },
            2: {
                tileIndex: 897,
                sizeVisual: { x: 1, y: 2 },
                maxHp: 140,
                stats: { visionRange: 14 }
            },
            3: {
                tileIndex: 898,
                sizeVisual: { x: 1, y: 3 },
                maxHp: 200,
                stats: { visionRange: 18 }
            }
        }
    },

    coastal_battery: {
        id: 'coastal_battery',
        name: '沿岸砲台',
        category: 'military',
        slotsRequired: 1,
        buildTime: 3600, // 1時間
        cost: { PT: 500 },
        tileIndex: 18,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            defenseBonus: 30,
            attackRange: 5,
            damage: 50
        },
        description: '島を防衛する強力な砲台。敵船を迎撃します。'
    },

    fortress: {
        id: 'fortress',
        name: '要塞',
        category: 'military',
        slotsRequired: 2,
        buildTime: 7200, // 2時間
        cost: { PT: 1000 },
        tileIndex: 19,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: {
            defenseBonus: 100,
            garrisonCapacity: 50,
            repairSpeed: 1.5
        },
        description: '島全体を守る堅固な要塞。多数の兵を駐屯できます。'
    },

    shipyard: {
        id: 'shipyard',
        name: '造船所',
        category: 'military',
        slotsRequired: 4,
        buildTime: 10800, // 3時間
        cost: { PT: 2000 },
        tileIndex: 20,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 3 },
        effects: {
            shipProduction: true,
            productionSpeed: 1.0,
            maxQueueSize: 3
        },
        description: '新しい船を建造できる大規模な造船所。'
    },

    // ========================================
    // 経済施設（Economic）
    // ========================================
    warehouse: {
        id: 'warehouse',
        name: '倉庫',
        category: 'economic',
        slotsRequired: 1,
        buildTime: 1800, // 30分
        cost: { PT: 300 },
        tileIndex: 21,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            storageCapacity: 1000,
            protection: 0.5
        },
        description: '資源を安全に保管します。略奪されにくくなります。'
    },

    farm: {
        id: 'farm',
        name: '農園',
        category: 'economic',
        slotsRequired: 1,
        buildTime: 2400, // 40分
        cost: { PT: 400 },
        tileIndex: 22,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            foodProduction: 50,
            crewMorale: 10
        },
        description: '食料を生産します。'
    },

    trading_post: {
        id: 'trading_post',
        name: '交易所',
        category: 'economic',
        slotsRequired: 2,
        buildTime: 5400, // 1.5時間
        cost: { PT: 1000 },
        tileIndex: 23,
        sizeLogic: { x: 2, y: 1 },
        sizeVisual: { x: 2, y: 2 },
        effects: {
            tradeBonus: 0.2,
            tradeSlots: 2,
            taxReduction: 0.1
        },
        description: '他のプレイヤーと交易を行えます。収入が増加します。'
    },

    mine: {
        id: 'mine',
        name: '鉱山',
        category: 'economic',
        slotsRequired: 2,
        buildTime: 7200, // 2時間
        cost: { PT: 1500 },
        tileIndex: 24,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: {
            stoneProduction: 30,
            ironProduction: 20,
            goldProduction: 10
        },
        description: '鉱物資源を採掘します。'
    },

    grand_market: {
        id: 'grand_market',
        name: '大市場',
        category: 'economic',
        slotsRequired: 4,
        buildTime: 14400, // 4時間
        cost: { PT: 3000 },
        tileIndex: 25,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 3, y: 3 },
        effects: {
            tradeBonus: 0.5,
            tradeRoutes: 5,
            marketPriceControl: true
        },
        description: '広範囲の交易ネットワークを構築できる巨大市場。'
    },

    // ========================================
    // 補助施設（Support）
    // ========================================
        // ========================================
    // 住居・商業施設
    // ========================================
    my_house: {
        id: 'my_house',
        name: 'マイハウス',
        category: 'support',
        slotsRequired: 1,
        buildTime: 900, // 15分
        cost: { PT: 200 },
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            comfort: 5
        },
        description: '自分専用の住居。拠点としての利便性が向上します。',
        nationTileOffset: true,
        buildable: false,
        levelLabel: true,
        levels: {
            1: {
                buildTime: 900,
                cost: { PT: 200 },
                tileIndex: 588,
                effects: { comfort: 5 },
                maxHp: 120,
                stats: { comfort: 5 }
            },
            2: {
                buildTime: 1800,
                cost: { PT: 400 },
                tileIndex: 524,
                effects: { comfort: 10 },
                maxHp: 160,
                stats: { comfort: 10 }
            },
            3: {
                buildTime: 3600,
                cost: { PT: 700 },
                tileIndex: 528,
                effects: { comfort: 18, storageBonus: 50 },
                maxHp: 220,
                stats: { comfort: 18, storageBonus: 50 }
            },
            4: {
                buildTime: 5400,
                cost: { PT: 1100 },
                tileIndex: 532,
                effects: { comfort: 25, storageBonus: 100 },
                maxHp: 280,
                stats: { comfort: 25, storageBonus: 100 }
            },
            5: {
                buildTime: 7200,
                cost: { PT: 1600 },
                tileIndex: 564,
                effects: { comfort: 35, storageBonus: 200, moraleBonus: 5 },
                maxHp: 360,
                stats: { comfort: 35, storageBonus: 200, moraleBonus: 5 }
            }
        }
    },

    weapon_shop: {
        id: 'weapon_shop',
        name: '武器屋',
        category: 'economic',
        slotsRequired: 1,
        buildTime: 1800, // 30分
        cost: { PT: 500 },
        tileIndex: 736,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            weaponSupply: true,
            tradeBonus: 0.05
        },
        description: '武器を扱う店。装備の調達がしやすくなります。',
        nationTileOffset: true
    },

    armor_shop: {
        id: 'armor_shop',
        name: '防具屋',
        category: 'economic',
        slotsRequired: 1,
        buildTime: 1800, // 30分
        cost: { PT: 500 },
        tileIndex: 740,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            armorSupply: true,
            defenseBonus: 5
        },
        description: '防具を扱う店。防衛準備が整いやすくなります。',
        nationTileOffset: true
    },

    item_shop: {
        id: 'item_shop',
        name: '道具屋',
        category: 'economic',
        slotsRequired: 1,
        buildTime: 1500, // 25分
        cost: { PT: 400 },
        tileIndex: 744,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            itemSupply: true,
            tradeBonus: 0.04
        },
        description: '消耗品を扱う店。遠征準備がしやすくなります。',
        nationTileOffset: true
    },

       tavern: {
        id: 'tavern',
        name: '酒場',
        category: 'support',
        slotsRequired: 1,
        buildTime: 1200, // 20分
        cost: { PT: 300 },
        tileIndex: 752,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            crewRecruitment: true,
            morale: 15,
            recruitmentSpeed: 1.2
        },
        description: '乗組員を募集できます。',
        nationTileOffset: true
    },

    inn: {
        id: 'inn',
        name: '宿屋',
        category: 'support',
        slotsRequired: 1,
        buildTime: 2400, // 40分
        cost: { PT: 600 },
        tileIndex: 748,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            restBonus: 0.2,
            moraleBonus: 8
        },
        description: '休息施設。乗組員の疲労回復が早まります。',
        nationTileOffset: true
    },

    repair_dock: {
        id: 'repair_dock',
        name: '修理ドック',
        category: 'support',
        slotsRequired: 1,
        buildTime: 3600, // 1時間
        cost: { PT: 800 },
        tileIndex: 792,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 2, y: 2 },
        effects: {
            repairSpeed: 2.0,
            repairCostReduction: 0.3,
            simultaneousRepairs: 2
        },
        description: '船を素早く修理できます。戦闘後の復帰が早くなります。',
        nationTileOffset: true
    },

    lighthouse: {
        id: 'lighthouse',
        name: '灯台',
        category: 'support',
        slotsRequired: 1,
        buildTime: 2400, // 40分
        cost: { PT: 500 },
        tileIndex: 28,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 3 },
        effects: {
            navigationBonus: 0.2,
            fogOfWarReduction: 10,
            safetyBonus: true
        },
        description: '航海を安全にし、船の速度を向上させます。'
    },

    temple: {
        id: 'temple',
        name: '神殿',
        category: 'support',
        slotsRequired: 4,
        buildTime: 18000, // 5時間
        cost: { PT: 5000 },
        tileIndex: 29,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 3, y: 4 },
        effects: {
            blessings: true,
            healingRate: 2.0,
            divineProtection: 0.2
        },
        description: '神の加護を得られる神聖な建造物。全能力が向上します。'
    }
};

function parseLevelFromId(buildingId) {
    const raw = String(buildingId || '');
    const match = /^(.*)_lv(\d+)$/.exec(raw);
    if (!match) return null;
    return { baseId: match[1], level: Number(match[2]) };
}

function resolveBuildingDefinition(base, level) {
    if (!base) return null;
    const resolvedLevel = Number.isFinite(Number(level))
        ? Math.max(1, Math.trunc(Number(level)))
        : Math.max(1, Math.trunc(Number(base.defaultLevel || 1)));
    const levelDef = base.levels ? base.levels[resolvedLevel] : null;
    const name = base.levelLabel ? `${base.name} LV${resolvedLevel}` : base.name;
    const merged = {
        ...base,
        ...(levelDef || {}),
        id: base.id,
        level: resolvedLevel,
        name: name,
        levels: base.levels
    };
    return merged;
}

function getBuildingMetaMap() {
    const map = {};
    Object.entries(buildings).forEach(([key, building]) => {
        if (!building) return;
        const id = building.id || key;
        const nationTileOffset = building.nationTileOffset === true;
        const meta = { id, nationTileOffset };
        map[key] = meta;
        if (id && !map[id]) map[id] = meta;
        if (building.levels) {
            Object.keys(building.levels).forEach((levelKey) => {
                const legacyId = `${id}_lv${levelKey}`;
                if (!map[legacyId]) map[legacyId] = meta;
            });
        }
    });
    return map;
}

/**
 * 建物IDから定義を取得
 * @param {string} buildingId - 建物ID
 * @param {number} level - レベル
 * @returns {Object|null} 建物定義
 */
function getBuildingById(buildingId, level = null) {
    if (!buildingId) return null;
    const direct = buildings[buildingId];
    if (direct) return resolveBuildingDefinition(direct, level);
    const parsed = parseLevelFromId(buildingId);
    if (parsed && buildings[parsed.baseId]) {
        return resolveBuildingDefinition(buildings[parsed.baseId], parsed.level);
    }
    const fallback = Object.values(buildings).find(b => b && b.id === buildingId) || null;
    return resolveBuildingDefinition(fallback, level);
}

/**
 * スロット数に応じて建設可能な施設を取得
 * @param {number} slotsRequired - 必要スロット数
 * @param {string} category - カテゴリ（オプション）
 * @returns {Array} 建設可能な施設の配列
 */
function getBuildingsForSlots(slotsRequired, category = null) {
    let filtered = Object.values(buildings).filter(b => b.slotsRequired === slotsRequired);

    if (category) {
        filtered = filtered.filter(b => b.category === category);
    }

    return filtered.map(b => resolveBuildingDefinition(b, null));
}

/**
 * カテゴリで建物をフィルタリング
 * @param {string} category - カテゴリ名
 * @returns {Array} 建物の配列
 */
function getBuildingsByCategory(category) {
    return Object.values(buildings)
        .filter(b => b.category === category)
        .map(b => resolveBuildingDefinition(b, null));
}

/**
 * 全建物リストを取得
 * @returns {Array} 全建物の配列
 */
function getAllBuildings() {
    return Object.values(buildings).map(b => resolveBuildingDefinition(b, null));
}

module.exports = {
    buildingCategories,
    buildings,
    getBuildingById,
    getBuildingsForSlots,
    getBuildingsByCategory,
    getAllBuildings,
    getBuildingMetaMap
};
