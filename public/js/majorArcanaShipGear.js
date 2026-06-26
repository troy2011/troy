export const ARCANA_ELEMENT_LABEL = Object.freeze({
    fire: '火',
    water: '水',
    wind: '風',
    earth: '地'
});

export const MAJOR_ARCANA_SHIP_GEAR = Object.freeze({
    0: { equipmentName: '風まかせの予備舵', shipGearName: '風まかせの予備舵', gearPart: 'rudder', gearPartLabel: '舵', replacementCommand: 'portRudder', priority: 0, ultimateName: '愚者の自在取舵', roleLabel: '完全回避', trigger: '取舵', shortDescription: '取舵を必ず成功させ、このターンの直接攻撃と付随効果を回避する。恐怖・混乱・ロックオンを解除する。', activationLog: '風まかせの予備舵が波を読み、攻撃を受け流した。', navalEffect: { type: 'fool-port-evade', replacementCommand: 'portRudder', forceRudderSuccess: true, avoidDirectThisTurn: true, cleanse: ['fear', 'confusion'], clearLockOn: true } },
    1: { equipmentName: '四元素の魔導砲', shipGearName: '四元素の魔導砲', gearPart: 'bow_cannon', gearPartLabel: '船首砲', replacementCommand: 'bowCannon', priority: 1, ultimateName: '魔術師の魔砲', roleLabel: '連射', trigger: '船首砲', shortDescription: '船首砲と同じ威力の魔砲を撃つ。次のターンも船首砲を使用できる。', activationLog: '四元素の魔導砲が通常砲とは別系統の砲撃を放った。', navalEffect: { type: 'magician-magic-bow', replacementCommand: 'bowCannon', keepBowReady: true } },
    2: { equipmentName: '潮祓いの聖羅針', shipGearName: '潮祓いの聖羅針', gearPart: 'compass', gearPartLabel: '羅針盤', arcanaElement: 'water', replacementCommand: 'starboardRudder', priority: 2, ultimateName: '女教皇の浄航', roleLabel: '浄化', trigger: '面舵', shortDescription: '面舵成功後、炎上・浸水・恐怖・混乱を解除する。解除対象がなければ船を0.5回復する。', activationLog: '潮祓いの聖羅針が荒れた船内を鎮めた。', navalEffect: { type: 'priestess-cleanse-starboard', replacementCommand: 'starboardRudder', onRudderSuccess: { cleanse: ['fire', 'flood', 'fear', 'confusion'], fallbackHeal: 0.5 } } },
    3: { equipmentName: '豊穣の救護船倉', shipGearName: '豊穣の救護船倉', gearPart: 'hold', gearPartLabel: '船倉', replacementCommand: 'portRudder', priority: 3, ultimateName: '女帝の大補給', roleLabel: '大回復', trigger: '取舵', shortDescription: '取舵成功後、船を1.5回復し、船員を全回復する。', activationLog: '豊穣の救護船倉から補給班が一斉に飛び出した。', navalEffect: { type: 'empress-port-heal', replacementCommand: 'portRudder', onRudderSuccess: { heal: 1.5, crewFullHeal: true } } },
    4: { equipmentName: '皇帝の鋼盾砲架', shipGearName: '皇帝の鋼盾砲架', gearPart: 'cannon_mount', gearPartLabel: '砲架', replacementCommand: 'bowCannon', priority: 4, ultimateName: '皇帝の盾砲', roleLabel: '盾化', trigger: '船首砲', shortDescription: '船首砲命中後、2ターンの間シールド状態になる。次に受ける直接攻撃の基本ダメージを半減する。', activationLog: '皇帝の鋼盾砲架が砲撃の反動を盾へ変えた。', navalEffect: { type: 'emperor-shield-bow', replacementCommand: 'bowCannon', onHitShield: { turns: 2, halveDirect: true } } },
    5: { equipmentName: '教皇の封印鐘', shipGearName: '教皇の封印鐘', gearPart: 'bell', gearPartLabel: '鐘', replacementCommand: 'bowCannon', priority: 5, ultimateName: '教皇の封印砲', roleLabel: '封印', trigger: '船首砲', shortDescription: '船首砲命中後、相手は次の1ターンだけ置換型大アルカナを使用できない。', activationLog: '教皇の封印鐘が敵船の大アルカナを沈黙させた。', navalEffect: { type: 'hierophant-seal-bow', replacementCommand: 'bowCannon', onHitLockReplacement: 1 } },
    6: { equipmentName: '恋人の双胴鎖', shipGearName: '恋人の双胴鎖', gearPart: 'chain', gearPartLabel: '鎖', replacementCommand: 'assault', priority: 6, ultimateName: '恋人の連結', roleLabel: '双拘束', trigger: '突撃', shortDescription: '両船を連結する。次のターンは双方とも面舵・取舵を使用できない。', activationLog: '恋人の双胴鎖が両船を結び、互いの舵を封じた。', navalEffect: { type: 'lovers-bind-assault', replacementCommand: 'assault', bothRudderLock: 1 } },
    7: { equipmentName: '戦車の破浪衝角', shipGearName: '戦車の破浪衝角', gearPart: 'ram', gearPartLabel: '衝角', replacementCommand: 'assault', priority: 7, ultimateName: '戦車の制圧突撃', roleLabel: '突撃勝利', trigger: '突撃', shortDescription: '命中した敵に浸水を付与する。敵も突撃だった場合は勝利扱いとなり、自分は衝突ダメージを受けない。', activationLog: '戦車の破浪衝角が正面衝突を押し勝った。', navalEffect: { type: 'chariot-assault', replacementCommand: 'assault', onHitStatus: { flood: 2 }, winAssaultMirror: true } },
    8: { equipmentName: '獅子の士気竜骨', shipGearName: '獅子の士気竜骨', gearPart: 'keel', gearPartLabel: '竜骨', replacementCommand: 'assault', priority: 8, ultimateName: '力の鼓舞突撃', roleLabel: '士気', trigger: '突撃', shortDescription: '自分の恐怖・混乱を解除し、士気を1段階上昇。敵の旋回を止めた場合、敵の舵輪を次のターン終了まで損傷させる。', activationLog: '獅子の士気竜骨が船員を奮い立たせた。', navalEffect: { type: 'strength-assault', replacementCommand: 'assault', cleanse: ['fear', 'confusion'], morale: 1, rudderDamageOnStop: 1 } },
    9: { equipmentName: '隠者の消灯帆', shipGearName: '隠者の消灯帆', gearPart: 'sail', gearPartLabel: '帆', replacementCommand: 'blankShot', priority: 9, ultimateName: '隠者の霧隠れ', roleLabel: '砲撃回避', trigger: '空砲', shortDescription: '自分へのロックオンを解除し、次ターン終了時まで最初に受ける敵砲撃の命中率を20ポイント低下させる。', activationLog: '隠者の消灯帆が船影を消した。', navalEffect: { type: 'hermit-blank', replacementCommand: 'blankShot', clearLockOn: true, nextCannonHitDown: 0.2, turns: 1 } },
    10: { equipmentName: '運命輪の逆潮舵', shipGearName: '運命輪の逆潮舵', gearPart: 'wheel', gearPartLabel: '輪舵', replacementCommand: 'starboardRudder', priority: 10, ultimateName: '運命輪の面舵', roleLabel: '反動', trigger: '面舵', shortDescription: '面舵は必ず成功する。敵の砲撃が外れた場合、敵へ反動ダメージ0.5を与える。', activationLog: '運命輪の逆潮舵が砲撃の流れを跳ね返した。', navalEffect: { type: 'wheel-starboard', replacementCommand: 'starboardRudder', forceRudderSuccess: true, cannonMissRecoil: 0.5 } },
    11: { equipmentName: '正義の写し衝角', shipGearName: '正義の写し衝角', gearPart: 'ram', gearPartLabel: '衝角', replacementCommand: 'assault', priority: 11, ultimateName: '正義の反照突撃', roleLabel: '状態反射', trigger: '突撃', shortDescription: '命中した敵に、自分と同じ状態異常を同じ持続時間で付与する。自分の状態は解除されない。', activationLog: '正義の写し衝角が自船の災いを敵船へ映した。', navalEffect: { type: 'justice-assault', replacementCommand: 'assault', reflectOwnStatuses: true } },
    12: { equipmentName: '吊男の身代わり錨', shipGearName: '吊男の身代わり錨', gearPart: 'anchor', gearPartLabel: '錨', replacementCommand: 'blankShot', priority: 12, ultimateName: '吊男の犠牲煙幕', roleLabel: '半減', trigger: '空砲', shortDescription: '敵へ恐怖を付与する。このターンに受ける直接攻撃の基本ダメージを半減し、状態異常も受けない。', activationLog: '吊男の身代わり錨が被害を肩代わりした。', navalEffect: { type: 'hanged-blank', replacementCommand: 'blankShot', targetStatus: { fear: 2 }, halveDirectThisTurn: true, statusImmuneThisTurn: true } },
    13: { equipmentName: '死神の時限黒砲', shipGearName: '死神の時限黒砲', gearPart: 'broadside_cannon', gearPartLabel: '舷側砲', replacementCommand: 'broadside', priority: 13, ultimateName: '死神の遅延砲', roleLabel: '遅延', trigger: '舷側砲', shortDescription: '命中した敵へ死の刻印を付け、3ターン後に1ダメージを与える。', activationLog: '死神の時限黒砲が敵船に遅れて弾ける刻印を刻んだ。', navalEffect: { type: 'death-broadside', replacementCommand: 'broadside', delayedDamage: { turns: 3, damage: 1 } } },
    14: { equipmentName: '節制の整備樽', shipGearName: '節制の整備樽', gearPart: 'barrel', gearPartLabel: '整備樽', replacementCommand: 'blankShot', priority: 14, ultimateName: '節制の整備号令', roleLabel: '整備', trigger: '空砲', shortDescription: '自分の状態異常を解除する。士気は中立になる。', activationLog: '節制の整備樽が船内の混乱を整えた。', navalEffect: { type: 'temperance-blank', replacementCommand: 'blankShot', cleanseAllStatuses: true, moraleToNeutral: true } },
    15: { equipmentName: '悪魔の業火舷砲', shipGearName: '悪魔の業火舷砲', gearPart: 'broadside_cannon', gearPartLabel: '舷側砲', replacementCommand: 'broadside', priority: 15, ultimateName: '悪魔の混炎砲', roleLabel: '混乱炎上', trigger: '舷側砲', shortDescription: '命中した敵を混乱と炎上にする。', activationLog: '悪魔の業火舷砲が敵船を混乱と炎で包んだ。', navalEffect: { type: 'devil-broadside', replacementCommand: 'broadside', onHitStatus: { confusion: 2, fire: 2 } } },
    16: { equipmentName: '塔の雷撃マスト', shipGearName: '塔の雷撃マスト', gearPart: 'mast', gearPartLabel: 'マスト', replacementCommand: 'broadside', priority: 16, ultimateName: '塔の雷撃砲', roleLabel: '設備損傷', trigger: '舷側砲', shortDescription: '雷撃砲になる。命中時、敵船員へ10%ダメージを与え、2ターンのマスト損傷を付与する。', activationLog: '塔の雷撃マストが雷を砲弾へ落とし込んだ。', navalEffect: { type: 'tower-broadside', replacementCommand: 'broadside', crewDamagePercent: 10, mastDamage: 2 } },
    17: { equipmentName: '星灯りの照準旗', shipGearName: '星灯りの照準旗', gearPart: 'flag', gearPartLabel: '旗', replacementCommand: 'blankShot', priority: 17, ultimateName: '星の照準祈願', roleLabel: '照準', trigger: '空砲', shortDescription: '自分の霧・命中率低下を解除。2ターン以内の次砲撃の命中率+20ポイント。命中時に船体を1回復する。', activationLog: '星灯りの照準旗が次の砲撃へ道筋を示した。', navalEffect: { type: 'star-blank', replacementCommand: 'blankShot', clearAimDown: true, nextCannonHitUp: 0.2, turns: 2, healOnCannonHit: 1 } },
    18: { equipmentName: '月影の幻霧帆', shipGearName: '月影の幻霧帆', gearPart: 'fog_sail', gearPartLabel: '霧帆', replacementCommand: 'blankShot', priority: 18, ultimateName: '月の幻影', roleLabel: '幻影', trigger: '空砲', shortDescription: '幻影を1体作る。次に受ける最初の砲撃または単体妨害を50%で幻影に吸わせる。突撃には無効。', activationLog: '月影の幻霧帆が本物そっくりの船影を作った。', navalEffect: { type: 'moon-blank', replacementCommand: 'blankShot', illusionChance: 0.5, hideHp: true } },
    19: { equipmentName: '太陽の浄火炉', shipGearName: '太陽の浄火炉', gearPart: 'deck_furnace', gearPartLabel: '甲板炉', replacementCommand: 'blankShot', priority: 19, ultimateName: '太陽の照破', roleLabel: '照破', trigger: '空砲', shortDescription: 'ターン終了後、敵の隠密・幻影と戦場の霧を解除。2ターン以内の次砲撃命中で敵を炎上させる。', activationLog: '太陽の浄火炉が幻を焼き払い、次弾に熱を宿した。', navalEffect: { type: 'sun-blank', replacementCommand: 'blankShot', clearEnemyConcealment: true, nextCannonStatus: { fire: 2 }, turns: 2 } },
    20: { equipmentName: '審判の修復号鐘', shipGearName: '審判の修復号鐘', gearPart: 'bell', gearPartLabel: '号鐘', replacementCommand: 'blankShot', priority: 20, ultimateName: '審判の復旧', roleLabel: '復旧', trigger: '空砲', shortDescription: '自分の恐怖・混乱を解除し、船員を20%回復。さらに設備を修復する。炎上・浸水は解除しない。', activationLog: '審判の修復号鐘が船員と設備を立て直した。', navalEffect: { type: 'judgement-blank', replacementCommand: 'blankShot', cleanse: ['fear', 'confusion'], crewHealPercent: 20, repairEquipment: true } },
    21: { equipmentName: '世界航路の照準環', shipGearName: '世界航路の照準環', gearPart: 'world_compass', gearPartLabel: '環羅針', replacementCommand: 'broadside', priority: 21, ultimateName: '世界の完全ロックオン', roleLabel: '完全照準', trigger: '舷側砲', shortDescription: '敵を完全ロックオンする。3ターン以内の次砲撃は最終命中率90%未満にならず、霧・隠密・幻影を無視する。', activationLog: '世界航路の照準環が敵船の逃げ道を閉ざした。', navalEffect: { type: 'world-broadside', replacementCommand: 'broadside', completeLockOnTurns: 3, minFinalHitRate: 0.9, ignoreConcealment: true } }
});

export function normalizeArcanaNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(21, Math.floor(number))) : null;
}

export function getMajorArcanaShipGearByNumber(number) {
    const key = normalizeArcanaNumber(number);
    return key === null ? null : MAJOR_ARCANA_SHIP_GEAR[key] || null;
}

export function getMajorArcanaShipGear(itemIdOrData, itemData = null) {
    const source = itemData || itemIdOrData || {};
    let number = normalizeArcanaNumber(source.ArcanaNumber ?? source.CardNumber);
    if (number === null && typeof itemIdOrData === 'string') {
        const match = itemIdOrData.match(/(?:arcana-|_)(\d+)$/i);
        if (match) number = normalizeArcanaNumber(match[1]);
    }
    if (number === null) return null;
    const gear = getMajorArcanaShipGearByNumber(number);
    return gear ? { arcanaNumber: number, ...gear } : null;
}

export function buildMajorArcanaShipGearView(itemId, itemData = {}) {
    const gear = getMajorArcanaShipGear(itemId, itemData);
    if (!gear) return null;
    return {
        arcanaNumber: gear.arcanaNumber,
        equipmentName: gear.equipmentName,
        gearPart: gear.gearPart,
        gearPartLabel: gear.gearPartLabel,
        replacementCommand: gear.replacementCommand,
        priority: gear.priority,
        arcanaElement: gear.arcanaElement || null,
        arcanaElementLabel: gear.arcanaElement ? ARCANA_ELEMENT_LABEL[gear.arcanaElement] || '無属性' : null,
        shipGearName: gear.shipGearName,
        ultimateName: gear.ultimateName,
        roleLabel: gear.roleLabel,
        trigger: gear.trigger,
        shortDescription: gear.shortDescription,
        activationLog: gear.activationLog,
        navalEffect: gear.navalEffect
    };
}
