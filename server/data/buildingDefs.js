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
 * slotsRequired: 必要なスロット数（1=小施設、2=中施設、4=大施設、9=巨大施設）
 * buildTime: 建設時間（秒）
 * cost: 建設コスト（PlayFab仮想通貨コード）
 *   - PS: Ps（メイン通貨）
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
        cost: { PS: 0 },
        tileIndex: 576,
        sizeLogic: { x: 3, y: 3 },
        sizeVisual: { x: 3, y: 3 },
        nationTileOffset: true,
        effects: {},
        description: '各国の中枢となる首都です。',
        buildable: false
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
        cost: { PS: 200 },
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            visionRange: 10,
            earlyWarning: true,
            watchRadius: 6,
            watchNotify: true,
            watchNotifyScope: 'nation'
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
        cost: { PS: 500 },
        tileIndex: 896,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            defenseBonus: 30,
            attackRange: 5,
            damage: 50,
            autoAttackTier: 'small',
            autoAttackRadius: 3
        },
        description: '島を防衛する強力な砲台。敵船を迎撃します。'
    },

    dragon_gate: {
        id: 'dragon_gate',
        name: '竜撃砲門',
        category: 'military',
        slotsRequired: 4,
        buildTime: 7200, // 2時間
        cost: { PS: 1000 },
        tileIndex: 961,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: {
            defenseBonus: 120,
            attackRange: 6,
            damage: 70,
            autoAttackTier: 'medium',
            autoAttackRadius: 4
        },
        description: '竜撃砲を備えた防衛門。'
    },

    shipyard: {
        id: 'shipyard',
        name: '造船所',
        category: 'military',
        slotsRequired: 4,
        buildTime: 10800, // 3時間
        cost: { PS: 2000 },
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
    farm: {
        id: 'farm',
        name: '農園',
        category: 'economic',
        slotsRequired: 1,
        buildTime: 2400, // 40分
        cost: { PS: 400 },
        tileIndex: 22,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            foodProduction: 50,
            crewMorale: 10
        },
        description: '食料を生産します。'
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
        cost: { PS: 200 },
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
                cost: { PS: 200 },
                tileIndex: 588,
                effects: { comfort: 5 },
                maxHp: 120,
                stats: { comfort: 5 }
            },
            2: {
                buildTime: 1800,
                cost: { PS: 400 },
                tileIndex: 524,
                effects: { comfort: 10 },
                maxHp: 160,
                stats: { comfort: 10 }
            },
            3: {
                buildTime: 3600,
                cost: { PS: 700 },
                tileIndex: 528,
                effects: { comfort: 18, storageBonus: 50 },
                maxHp: 220,
                stats: { comfort: 18, storageBonus: 50 }
            },
            4: {
                buildTime: 5400,
                cost: { PS: 1100 },
                tileIndex: 532,
                effects: { comfort: 25, storageBonus: 100 },
                maxHp: 280,
                stats: { comfort: 25, storageBonus: 100 }
            },
            5: {
                buildTime: 7200,
                cost: { PS: 1600 },
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
        cost: { PS: 500 },
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
        cost: { PS: 500 },
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
        cost: { PS: 400 },
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
        cost: { PS: 300 },
        tileIndex: 748,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            crewRecruitment: true,
            morale: 15,
            recruitmentSpeed: 1.2,
            timedBuffId: 'tavern'
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
        cost: { PS: 600 },
        tileIndex: 752,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            restBonus: 0.2,
            moraleBonus: 8,
            paidHealHp: true
        },
        description: '休息施設。乗組員の疲労回復が早まります。',
        nationTileOffset: true
    },

    hot_spring: {
        id: 'hot_spring',
        name: '温泉',
        category: 'support',
        slotsRequired: 1,
        buildTime: 1800, // 30分
        cost: { PS: 500 },
        tileIndex: 756,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            restBonus: 0.25,
            moraleBonus: 10,
            paidHealMp: true
        },
        description: '温泉施設。疲労回復と士気が少し上がります。',
        nationTileOffset: true
    },

    repair_dock: {
        id: 'repair_dock',
        name: '修理ドック',
        category: 'support',
        slotsRequired: 1,
        buildTime: 3600, // 1時間
        cost: { PS: 800 },
        tileIndex: 792,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 2, y: 2 },
        effects: {
            repairSpeed: 2.0,
            repairCostReduction: 0.3,
            simultaneousRepairs: 2,
            repairCurrency: 'PS'
        },
        description: '船を素早く修理できます。戦闘後の復帰が早くなります。',
        nationTileOffset: true
    },

    temple: {
        id: 'temple',
        name: '神殿',
        category: 'support',
        slotsRequired: 1,
        buildTime: 18000, // 5時間
        cost: { PS: 5000 },
        tileIndex: 769,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            blessings: true,
            healingRate: 2.0,
            divineProtection: 0.2,
            areaBuffRadius: 5,
            areaBuffLevelScale: true
        },
        description: '神の加護を得られる神聖な建造物。全能力が向上します。',
        levelLabel: true,
        levels: {
            1: { tileIndex: 769, sizeVisual: { x: 1, y: 1 } },
            2: { tileIndex: 770, sizeVisual: { x: 1, y: 1 } },
            3: { tileIndex: 802, sizeVisual: { x: 1, y: 1 } }
        }
    },

    goddess_statue: {
        id: 'goddess_statue',
        name: '女神像',
        category: 'support',
        slotsRequired: 1,
        buildTime: 5400, // 1.5時間
        cost: { PS: 1500 },
        tileIndex: 801,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: {
            blessings: true,
            areaHealRadius: 4
        },
        description: '女神を祀る像。'
    },

    // ========================================
    // 大アルカナ施設
    // ========================================
    arcana_fool_tavern: {
        id: 'arcana_fool_tavern',
        name: '海賊酒場',
        category: 'support',
        slotsRequired: 1,
        buildTime: 3600,
        cost: { PS: 800 },
        tileIndex: 832,
        sizeLogic: { x: 1, y: 1 },
        sizeVisual: { x: 1, y: 1 },
        effects: { 'ちから': 1, 'かしこさ': 1, 'きようさ': 1, 'みのまもり': 1 },
        description: '全能力が少し上がる海賊酒場。',
        buildCondition: { mapId: 'major_00', requiresOccupation: true, matchNation: true }
    },
    arcana_magician_school: {
        id: 'arcana_magician_school',
        name: '魔法学校',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2000 },
        tileIndex: 720,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { 'かしこさ': 2 },
        description: 'かしこさが上がる魔法学校。',
        buildCondition: { mapId: 'major_01', requiresOccupation: true, matchNation: true }
    },
    arcana_priestess_fountain_palace: {
        id: 'arcana_priestess_fountain_palace',
        name: '聖泉宮殿',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2000 },
        tileIndex: 656,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { 'きようさ': 2 },
        description: 'きようさが上がる噴水の宮殿。',
        buildCondition: { mapId: 'major_02', requiresOccupation: true, matchNation: true }
    },
    arcana_empress_garden: {
        id: 'arcana_empress_garden',
        name: '温室庭園',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2000 },
        tileIndex: 712,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { 'みのまもり': 2 },
        description: 'みのまもりが上がる温室庭園。',
        buildCondition: { mapId: 'major_03', requiresOccupation: true, matchNation: true }
    },
    arcana_emperor_training: {
        id: 'arcana_emperor_training',
        name: '訓練所',
        category: 'military',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2000 },
        tileIndex: 728,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { 'ちから': 2 },
        description: 'ちからが上がる訓練所。',
        buildCondition: { mapId: 'major_04', requiresOccupation: true, matchNation: true }
    },
    arcana_hierophant_lab: {
        id: 'arcana_hierophant_lab',
        name: '魔法研究所',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2200 },
        tileIndex: 704,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { 'かしこさ': 4 },
        description: 'かしこさが大きく上がる魔法研究所。',
        buildCondition: { mapId: 'major_05', requiresOccupation: true, matchNation: true }
    },
    arcana_lovers_palace: {
        id: 'arcana_lovers_palace',
        name: '恋人の宮殿',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2200 },
        tileIndex: 664,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { 'きようさ': 4 },
        description: 'きようさが大きく上がる宮殿。',
        buildCondition: { mapId: 'major_06', requiresOccupation: true, matchNation: true }
    },
    arcana_chariot_factory: {
        id: 'arcana_chariot_factory',
        name: '戦車工廠',
        category: 'military',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2200 },
        tileIndex: 648,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { 'みのまもり': 4 },
        description: 'みのまもりが大きく上がる工廠。',
        buildCondition: { mapId: 'major_07', requiresOccupation: true, matchNation: true }
    },
    arcana_strength_fortress: {
        id: 'arcana_strength_fortress',
        name: '城塞',
        category: 'military',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2200 },
        tileIndex: 600,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 3 },
        effects: { 'ちから': 4 },
        description: 'ちからが大きく上がる城塞。',
        buildCondition: { mapId: 'major_08', requiresOccupation: true, matchNation: true }
    },
    arcana_hermit_lodge: {
        id: 'arcana_hermit_lodge',
        name: '隠者の館',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2400 },
        tileIndex: 995,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 3 },
        effects: { 'かしこさ': 3 },
        description: '賢者の庵。知恵が磨かれます。',
        buildCondition: { mapId: 'major_09', requiresOccupation: true, matchNation: true }
    },
    arcana_wheel_casino: {
        id: 'arcana_wheel_casino',
        name: '地下カジノ',
        category: 'economic',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2400 },
        tileIndex: 837,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 3 },
        effects: { gambleBonus: 1 },
        description: 'ギャンブルが盛んな地下カジノ。',
        clearGroundTiles: true,
        buildCondition: { mapId: 'major_10', requiresOccupation: true, matchNation: true }
    },
    arcana_justice_court: {
        id: 'arcana_justice_court',
        name: '裁判所',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2400 },
        tileIndex: 933,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 3 },
        effects: { lawOrder: 1 },
        description: '秩序を守る裁判所。',
        buildCondition: { mapId: 'major_11', requiresOccupation: true, matchNation: true }
    },
    arcana_hanged_altar: {
        id: 'arcana_hanged_altar',
        name: '供物台',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2400 },
        tileIndex: 997,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { sacrificeBonus: 1, allyDeathBuffRadius: 5 },
        description: '供物を捧げる儀式の台。',
        buildCondition: { mapId: 'major_12', requiresOccupation: true, matchNation: true }
    },
    arcana_death_mausoleum: {
        id: 'arcana_death_mausoleum',
        name: '納骨堂',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2400 },
        tileIndex: 807,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 2 },
        effects: { soulWard: 1, enemyDeathPrisonRadius: 4 },
        description: '魂を鎮める霊廟。',
        buildCondition: { mapId: 'major_13', requiresOccupation: true, matchNation: true }
    },
    arcana_temperance_spring: {
        id: 'arcana_temperance_spring',
        name: '癒しの泉',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2400 },
        tileIndex: 903,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 3 },
        effects: { healingBonus: 1, respawnFullHeal: true },
        description: '癒しの力を宿す泉。',
        buildCondition: { mapId: 'major_14', requiresOccupation: true, matchNation: true }
    },
    arcana_devil_black_market: {
        id: 'arcana_devil_black_market',
        name: '黒市',
        category: 'economic',
        slotsRequired: 9,
        buildTime: 10800,
        cost: { PS: 3500 },
        tileIndex: 999,
        sizeLogic: { x: 3, y: 3 },
        sizeVisual: { x: 3, y: 3 },
        effects: { blackMarket: true },
        description: '禁制品が集まる闇市。',
        buildCondition: { mapId: 'major_15', requiresOccupation: true, matchNation: true }
    },
    arcana_tower_judgement: {
        id: 'arcana_tower_judgement',
        name: '裁きの塔',
        category: 'military',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2600 },
        tileIndex: 873,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 4 },
        effects: { defenseBonus: 10, autoAttackTier: 'large', autoAttackRadius: 5 },
        description: '防衛力を高める裁きの塔。',
        buildCondition: { mapId: 'major_16', requiresOccupation: true, matchNation: true }
    },
    arcana_star_observatory: {
        id: 'arcana_star_observatory',
        name: '天文台',
        category: 'support',
        slotsRequired: 9,
        buildTime: 10800,
        cost: { PS: 3500 },
        tileIndex: 843,
        sizeLogic: { x: 3, y: 3 },
        sizeVisual: { x: 3, y: 3 },
        effects: { visionRange: 5, watchGlobal: true, watchMinimap: true },
        description: '星を観測する天文台。',
        buildCondition: { mapId: 'major_17', requiresOccupation: true, matchNation: true }
    },
    arcana_moon_shrine: {
        id: 'arcana_moon_shrine',
        name: '氷霧の社',
        category: 'support',
        slotsRequired: 9,
        buildTime: 10800,
        cost: { PS: 3500 },
        tileIndex: 846,
        sizeLogic: { x: 3, y: 3 },
        sizeVisual: { x: 3, y: 3 },
        effects: { stealthBonus: 1, fogSlowRadius: 5, slowTier: 'medium' },
        description: '幻術と隠密に通じる社。',
        buildCondition: { mapId: 'major_18', requiresOccupation: true, matchNation: true }
    },
    arcana_sun_temple: {
        id: 'arcana_sun_temple',
        name: '太陽神殿',
        category: 'support',
        slotsRequired: 4,
        buildTime: 7200,
        cost: { PS: 2600 },
        tileIndex: 1002,
        sizeLogic: { x: 2, y: 2 },
        sizeVisual: { x: 2, y: 4 },
        effects: { blessing: 1 },
        description: '祝福の光を宿す神殿。',
        buildCondition: { mapId: 'major_19', requiresOccupation: true, matchNation: true }
    },
    arcana_judgement_belltower: {
        id: 'arcana_judgement_belltower',
        name: '鐘楼',
        category: 'support',
        slotsRequired: 9,
        buildTime: 10800,
        cost: { PS: 3600 },
        tileIndex: 942,
        sizeLogic: { x: 3, y: 3 },
        sizeVisual: { x: 3, y: 3 },
        effects: { revivalBoost: 1 },
        description: '告示と復活を司る鐘楼。',
        buildCondition: { mapId: 'major_20', requiresOccupation: true, matchNation: true }
    },
    arcana_world_tree: {
        id: 'arcana_world_tree',
        name: '世界樹',
        category: 'support',
        slotsRequired: 9,
        buildTime: 14400,
        cost: { PS: 5000 },
        tileIndex: 1009,
        sizeLogic: { x: 3, y: 3 },
        sizeVisual: { x: 4, y: 8 },
        effects: { allBlessing: 2 },
        description: '世界を支える大樹。',
        buildCondition: { mapId: 'major_21', requiresOccupation: true, matchNation: true }
    }
};

function scaleEffects(effects, multiplier) {
    const src = effects || {};
    const scaled = {};
    Object.entries(src).forEach(([key, value]) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            scaled[key] = Math.round(value * multiplier * 100) / 100;
        } else {
            scaled[key] = value;
        }
    });
    return scaled;
}

function buildDefaultLevels(building) {
    const levels = {};
    const baseEffects = building.effects || {};
    for (let level = 1; level <= 5; level += 1) {
        const multiplier = 1 + 0.2 * (level - 1);
        levels[level] = {
            tileIndex: building.tileIndex,
            sizeVisual: building.sizeVisual,
            effects: scaleEffects(baseEffects, multiplier),
            stats: scaleEffects(baseEffects, multiplier),
            maxHp: Math.round(100 * multiplier)
        };
    }
    return levels;
}

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
    const levels = base.levels || buildDefaultLevels(base);
    const levelDef = levels ? levels[resolvedLevel] : null;
    const name = base.levelLabel ? `${base.name} LV${resolvedLevel}` : base.name;
    const merged = {
        ...base,
        ...(levelDef || {}),
        id: base.id,
        level: resolvedLevel,
        name: name,
        levels: levels
    };
    return merged;
}

function getBuildingMetaMap() {
    const map = {};
    Object.entries(buildings).forEach(([key, building]) => {
        if (!building) return;
        const id = building.id || key;
        const nationTileOffset = building.nationTileOffset === true;
        const clearGroundTiles = building.clearGroundTiles === true;
        const meta = { id, nationTileOffset, clearGroundTiles };
        map[key] = meta;
        if (id && !map[id]) map[id] = meta;
        const levelKeys = building.levels ? Object.keys(building.levels) : ['1', '2', '3', '4', '5'];
        levelKeys.forEach((levelKey) => {
            const legacyId = `${id}_lv${levelKey}`;
            if (!map[legacyId]) map[legacyId] = meta;
        });
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
