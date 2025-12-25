// buildingDefinitions.js
// 島に建設可能な施設の定義

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
 * cost: 建設コスト
 * effects: 施設の効果
 */
const buildings = {
    // ========================================
    // 軍事施設（Military）
    // ========================================
    watchtower: {
        id: 'watchtower',
        name: '見張り台',
        category: 'military',
        slotsRequired: 1,
        buildTime: 1800, // 30分
        cost: {
            wood: 100,
            stone: 50,
            gold: 200
        },
        effects: {
            visionRange: 10, // 視界範囲+10グリッド
            earlyWarning: true // 敵接近時に通知
        },
        description: '周囲の海域を監視し、敵の接近を早期発見します。',
        biomeRestrictions: [] // どのバイオームでも建設可能
    },

    coastal_battery: {
        id: 'coastal_battery',
        name: '沿岸砲台',
        category: 'military',
        slotsRequired: 1,
        buildTime: 3600, // 1時間
        cost: {
            wood: 50,
            stone: 200,
            iron: 150,
            gold: 500
        },
        effects: {
            defenseBonus: 30, // 防衛力+30
            attackRange: 5, // 攻撃範囲5グリッド
            damage: 50 // ダメージ50
        },
        description: '島を防衛する強力な砲台。敵船を迎撃します。',
        biomeRestrictions: [] // どのバイオームでも建設可能
    },

    fortress: {
        id: 'fortress',
        name: '要塞',
        category: 'military',
        slotsRequired: 2,
        buildTime: 7200, // 2時間
        cost: {
            wood: 200,
            stone: 500,
            iron: 300,
            gold: 1000
        },
        effects: {
            defenseBonus: 100, // 防衛力+100
            garrisonCapacity: 50, // 駐屯兵+50
            repairSpeed: 1.5 // 船の修理速度1.5倍
        },
        description: '島全体を守る堅固な要塞。多数の兵を駐屯できます。',
        biomeRestrictions: [] // どのバイオームでも建設可能
    },

    shipyard: {
        id: 'shipyard',
        name: '造船所',
        category: 'military',
        slotsRequired: 4,
        buildTime: 10800, // 3時間
        cost: {
            wood: 1000,
            stone: 500,
            iron: 500,
            gold: 2000
        },
        effects: {
            shipProduction: true, // 船の建造が可能
            productionSpeed: 1.0, // 建造速度1.0倍
            maxQueueSize: 3 // 同時建造キュー3隻
        },
        description: '新しい船を建造できる大規模な造船所。',
        biomeRestrictions: ['beach', 'rocky'] // 海岸と岩山のみ
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
        cost: {
            wood: 200,
            stone: 100,
            gold: 300
        },
        effects: {
            storageCapacity: 1000, // 保管容量+1000
            protection: 0.5 // 略奪時の保護率50%
        },
        description: '資源を安全に保管します。略奪されにくくなります。',
        biomeRestrictions: [] // どのバイオームでも建設可能
    },

    farm: {
        id: 'farm',
        name: '農園',
        category: 'economic',
        slotsRequired: 1,
        buildTime: 2400, // 40分
        cost: {
            wood: 150,
            stone: 50,
            gold: 400
        },
        effects: {
            foodProduction: 50, // 食料生産+50/時
            crewMorale: 10 // 乗組員士気+10
        },
        description: '食料を生産します。森林バイオームでボーナスがあります。',
        biomeRestrictions: ['forest', 'jungle'] // 森林とジャングルのみ
    },

    trading_post: {
        id: 'trading_post',
        name: '交易所',
        category: 'economic',
        slotsRequired: 2,
        buildTime: 5400, // 1.5時間
        cost: {
            wood: 300,
            stone: 200,
            gold: 1000
        },
        effects: {
            tradeBonus: 0.2, // 交易収入+20%
            tradeSlotsRequired: 2, // 交易ルート+2
            taxReduction: 0.1 // 税金-10%
        },
        description: '他のプレイヤーと交易を行えます。収入が増加します。',
        biomeRestrictions: [] // どのバイオームでも建設可能
    },

    mine: {
        id: 'mine',
        name: '鉱山',
        category: 'economic',
        slotsRequired: 2,
        buildTime: 7200, // 2時間
        cost: {
            wood: 500,
            stone: 300,
            iron: 200,
            gold: 1500
        },
        effects: {
            stoneProduction: 30, // 石材生産+30/時
            ironProduction: 20, // 鉄鉱生産+20/時
            goldProduction: 10 // 金貨生産+10/時
        },
        description: '鉱物資源を採掘します。岩山や火山バイオームで最適です。',
        biomeRestrictions: ['rocky', 'volcanic'] // 岩山と火山のみ
    },

    grand_market: {
        id: 'grand_market',
        name: '大市場',
        category: 'economic',
        slotsRequired: 4,
        buildTime: 14400, // 4時間
        cost: {
            wood: 1000,
            stone: 800,
            gold: 3000
        },
        effects: {
            tradeBonus: 0.5, // 交易収入+50%
            tradeRoutes: 5, // 交易ルート+5
            marketPriceControl: true // 市場価格に影響を与える
        },
        description: '広範囲の交易ネットワークを構築できる巨大市場。',
        biomeRestrictions: [] // どのバイオームでも建設可能
    },

    // ========================================
    // 補助施設（Support）
    // ========================================
    tavern: {
        id: 'tavern',
        name: '酒場',
        category: 'support',
        slotsRequired: 1,
        buildTime: 1200, // 20分
        cost: {
            wood: 150,
            stone: 50,
            gold: 300
        },
        effects: {
            crewRecruitment: true, // 乗組員の募集が可能
            morale: 15, // 士気+15
            recruitmentSpeed: 1.2 // 募集速度1.2倍
        },
        description: '乗組員を募集できます。砂浜バイオームで建設時間短縮。',
        biomeRestrictions: [] // どのバイオームでも建設可能
    },

    repair_dock: {
        id: 'repair_dock',
        name: '修理ドック',
        category: 'support',
        slotsRequired: 2,
        buildTime: 3600, // 1時間
        cost: {
            wood: 400,
            stone: 200,
            iron: 200,
            gold: 800
        },
        effects: {
            repairSpeed: 2.0, // 修理速度2.0倍
            repairCostReduction: 0.3, // 修理コスト-30%
            simultaneousRepairs: 2 // 同時修理2隻
        },
        description: '船を素早く修理できます。戦闘後の復帰が早くなります。',
        biomeRestrictions: ['beach', 'rocky'] // 海岸と岩山のみ
    },

    lighthouse: {
        id: 'lighthouse',
        name: '灯台',
        category: 'support',
        slotsRequired: 1,
        buildTime: 2400, // 40分
        cost: {
            wood: 100,
            stone: 300,
            gold: 500
        },
        effects: {
            navigationBonus: 0.2, // 航海速度+20%
            fogOfWarReduction: 10, // 視界範囲+10グリッド
            safetyBonus: true // 嵐ダメージ軽減
        },
        description: '航海を安全にし、船の速度を向上させます。',
        biomeRestrictions: ['beach', 'rocky'] // 海岸と岩山のみ
    },

    temple: {
        id: 'temple',
        name: '神殿',
        category: 'support',
        slotsRequired: 4,
        buildTime: 18000, // 5時間
        cost: {
            wood: 500,
            stone: 1000,
            gold: 5000
        },
        effects: {
            blessings: true, // 祝福効果（全ステータス+10%）
            healingRate: 2.0, // HP回復速度2.0倍
            divineProtection: 0.2 // 被ダメージ-20%
        },
        description: '神の加護を得られる神聖な建造物。全能力が向上します。',
        biomeRestrictions: [] // どのバイオームでも建設可能
    }
};

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

    return filtered;
}

/**
 * バイオームに応じて建設可能な施設かチェック
 * @param {string} buildingId - 施設ID
 * @param {string} biome - バイオーム
 * @returns {boolean} 建設可能かどうか
 */
function canBuildOnBiome(buildingId, biome) {
    return biome == null;
}

/**
 * バイオームボーナスを適用した建設時間を計算
 * @param {string} buildingId - 施設ID
 * @param {string} biome - バイオーム
 * @returns {number} ボーナス適用後の建設時間（秒）
 */
function calculateBuildTime(buildingId, biome) {
    const building = buildings[buildingId];
    if (!building) return 0;

    return Math.floor(building.buildTime);
}

module.exports = {
    buildingCategories,
    buildings,
    getBuildingsForSlots,
    canBuildOnBiome,
    calculateBuildTime
};
