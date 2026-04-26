// server/routes/shipSkillRoutes.js
// 船デッキスキル発動エンジン
//
// POST /api/ship-skill-use
//   カードのスキルを発動し、Firestoreの船状態を更新する。
//   クールタイム管理・トリガー条件チェック・ポーカーロールボーナス適用を行う。
//
// POST /api/ship-skill-status
//   プレイヤーの船スキルCT一覧を返す（フロントのUI更新用）。

const admin = require('firebase-admin');
const { getShipSkillByCard, getMinorShipSkill, getMajorShipSkill } = require('../tarotShipSkills');
const { SHIP_DECK_DATA_KEY } = require('../tarotDeck');
const { getCanonicalTarotCategory } = require('../tarotCards');

// ポーカーロールボーナス倍率（tarotRoles と同定義）
const ROLE_BONUSES = {
    RoyalFlush:    { ctMult: 0.5,  effectMult: 1.5 },
    StraightFlush: { ctMult: 0.6,  effectMult: 1.4 },
    FourOfAKind:   { ctMult: 0.7,  effectMult: 1.3 },
    FullHouse:     { ctMult: 0.75, effectMult: 1.25 },
    Flush:         { ctMult: 0.8,  effectMult: 1.2 },
    Straight:      { ctMult: 0.8,  effectMult: 1.1 },
    ThreeOfAKind:  { ctMult: 0.85, effectMult: 1.1 },
    TwoPair:       { ctMult: 0.9,  effectMult: 1.05 },
    OnePair:       { ctMult: 0.95, effectMult: 1.0 },
    Incomplete:    { ctMult: 1.0,  effectMult: 1.0 }
};

// effectMult の上限（大アルカナ含む）
const MAX_EFFECT_MULT = 2.0;

// CTキャップ（秒）
const MAX_COOLDOWN_SEC = 600;

// スキルCT格納キー（Firestore ships/{playFabId}.shipSkillCooldowns）
const SKILL_CT_FIELD = 'shipSkillCooldowns';

// ────────────────────────────────────────────────────────────
// アイテムID → カード情報のパーサ
// ────────────────────────────────────────────────────────────
function parseCardFromItemData(itemData) {
    if (!itemData) return null;
    const category = getCanonicalTarotCategory(itemData?.Category);
    const FACE_ORDER = { PAGE: 11, KNIGHT: 12, QUEEN: 13, KING: 14 };

    if (category === 'TarotMajor') {
        const number = Number(itemData?.ArcanaNumber ?? itemData?.CardNumber);
        if (!Number.isFinite(number)) return null;
        return { isArcana: true, number };
    }
    if (category === 'TarotMinor') {
        const raw = String(
            itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || ''
        ).trim();
        const parsed = Number(raw);
        const number = Number.isFinite(parsed) ? parsed : (FACE_ORDER[raw.toUpperCase()] || null);
        const suitRaw = String(itemData?.ArcanaSuit || itemData?.Suit || '').trim().toLowerCase();
        if (!number || !suitRaw) return null;
        return { isArcana: false, number, suit: suitRaw };
    }
    return null;
}

// ────────────────────────────────────────────────────────────
// エフェクト値にポーカーロールボーナスを適用する
// ────────────────────────────────────────────────────────────
function applyRoleBonus(skillData, roleKey) {
    const bonus = ROLE_BONUSES[roleKey] || ROLE_BONUSES.Incomplete;
    const effectMult = Math.min(MAX_EFFECT_MULT, bonus.effectMult);
    const ctMult = bonus.ctMult;
    const baseCt = skillData.cooldown;
    const adjustedCt = Math.min(MAX_COOLDOWN_SEC, Math.round(baseCt * ctMult));

    // effect.value に倍率を適用（数値の場合のみ）
    let adjustedEffect = { ...skillData.effect };
    if (typeof adjustedEffect.value === 'number') {
        adjustedEffect = { ...adjustedEffect, value: adjustedEffect.value * effectMult };
    }
    // duration はボーナス対象外（バランス上）

    return {
        ...skillData,
        cooldown: adjustedCt,
        effect: adjustedEffect,
        _roleBonus: { roleKey, effectMult, ctMult }
    };
}



// ────────────────────────────────────────────────────────────
// 初期化エクスポート
// ────────────────────────────────────────────────────────────
function initializeShipSkillRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabEconomy, catalogCache, authTools = {}) {
    const db = admin.firestore();
    const shipsCollection = db.collection('ships');
    const requireAuthenticatedPlayFabId = authTools?.requireAuthenticatedPlayFabId || null;

    const normalizeId = (v) => String(v || '').trim().replace(/^playfab:/i, '').toUpperCase();

    async function requireAuthedId(req, res, playFabId) {
        if (!requireAuthenticatedPlayFabId) return normalizeId(playFabId);
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    // ────────────────────────────────────────────────────────
    // デッキデータ取得（PlayFab 1回限り、/api/ship-skill-status 専用）
    // ────────────────────────────────────────────────────────
    async function resolveShipDeck(playFabId) {
        const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: [SHIP_DECK_DATA_KEY]
        });
        const raw = result?.Data?.[SHIP_DECK_DATA_KEY]?.Value;
        if (!raw) return [];
        try { return JSON.parse(raw); } catch { return []; }
    }

    function getShipDeckRoleKey(deckItemIds) {
        const { evaluateDeckRole } = require('../tarotDeck');
        const items = deckItemIds.map((id) => catalogCache?.[id] || null);
        return evaluateDeckRole(items)?.key || 'Incomplete';
    }

    // ────────────────────────────────────────────────────────
    /**
     * POST /api/ship-skill-use
     * body: { playFabId, cardItemId, targetPlayFabId?, aoeTargets?, allShipIds? }
     *
     * CT・デッキ検証はクライアント管理のためスキップ。
     * 他プレイヤーへの Firestore エフェクト書き込みのみ行う。
     */
    app.post('/api/ship-skill-use', async (req, res) => {
        let { playFabId, cardItemId } = req.body || {};
        if (!playFabId || !cardItemId) {
            return res.status(400).json({ error: 'playFabId and cardItemId are required' });
        }
        playFabId = await requireAuthedId(req, res, playFabId);
        if (!playFabId) return;

        cardItemId = String(cardItemId).trim();

        try {
            // カタログからスキルデータを取得（メモリキャッシュ参照のみ）
            const itemData = catalogCache?.[cardItemId];
            if (!itemData) {
                return res.status(400).json({ error: 'Card not found in catalog', cardItemId });
            }
            const card = parseCardFromItemData(itemData);
            if (!card) {
                return res.status(400).json({ error: 'Could not parse card data', cardItemId });
            }
            const skillData = getShipSkillByCard(card);
            if (!skillData) {
                return res.status(400).json({ error: 'No skill defined for this card', cardItemId });
            }

            // 自己効果スキルはクライアントが処理済みのため即返答
            const SELF_ONLY = new Set(['self', 'caster']);
            if (SELF_ONLY.has(skillData.effect?.target)) {
                return res.json({ success: true, skillName: skillData.name, skippedServer: true });
            }

            // 他プレイヤーへの Firestore 書き込みのみ実行
            const effectResult = await applyShipSkillEffect(
                shipsCollection, promisifyPlayFab, PlayFabServer,
                playFabId, skillData, req.body
            );

            return res.json({ success: true, skillName: skillData.name, effect: effectResult });

        } catch (error) {
            console.error('[ShipSkillUse] Error:', error);
            return res.status(500).json({ error: 'Failed to use ship skill', details: error.message });
        }
    });

    // ────────────────────────────────────────────────────────
    /**
     * POST /api/ship-skill-trigger
     * body: { playFabId, triggerCondition, cardItemId, context }
     *
     * triggered スキルのエフェクトをサーバーに反映する。
     * CT 管理はクライアント側。
     */
    app.post('/api/ship-skill-trigger', async (req, res) => {
        let { playFabId, cardItemId, context } = req.body || {};
        if (!playFabId || !cardItemId) {
            return res.status(400).json({ error: 'playFabId and cardItemId are required' });
        }
        playFabId = await requireAuthedId(req, res, playFabId);
        if (!playFabId) return;

        try {
            const itemData = catalogCache?.[cardItemId];
            if (!itemData) return res.json({ success: true, skipped: 'not-in-catalog' });
            const card = parseCardFromItemData(itemData);
            if (!card) return res.json({ success: true, skipped: 'parse-failed' });
            const skillData = getShipSkillByCard(card);
            if (!skillData) return res.json({ success: true, skipped: 'no-skill' });

            const effectResult = await applyShipSkillEffect(
                shipsCollection, promisifyPlayFab, PlayFabServer,
                playFabId, skillData, context || req.body
            );

            return res.json({ success: true, skillName: skillData.name, effect: effectResult });

        } catch (error) {
            console.error('[ShipSkillTrigger] Error:', error);
            return res.status(500).json({ error: 'Failed to trigger ship skill', details: error.message });
        }
    });

    // ────────────────────────────────────────────────────────
    /**
     * POST /api/ship-skill-status
     * body: { playFabId }
     *
     * 初回のみ呼ばれるスキル定義取得エンドポイント。
     * CT は返さない（クライアントの localStorage が正）。
     */
    app.post('/api/ship-skill-status', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) {
            return res.status(400).json({ error: 'playFabId is required' });
        }
        playFabId = await requireAuthedId(req, res, playFabId);
        if (!playFabId) return;

        try {
            // PlayFab デッキ取得（初回のみ）
            const deckIds = await resolveShipDeck(playFabId);
            const roleKey = getShipDeckRoleKey(deckIds);

            const skills = deckIds.map((cardItemId) => {
                const itemData = catalogCache?.[cardItemId];
                if (!itemData) return { cardItemId, error: 'not-in-catalog' };
                const card = parseCardFromItemData(itemData);
                if (!card) return { cardItemId, error: 'parse-failed' };
                const skillData = getShipSkillByCard(card);
                if (!skillData) return { cardItemId, error: 'no-skill' };

                const appliedCt = applyRoleBonus(skillData, roleKey).cooldown;
                return {
                    cardItemId,
                    skillName: skillData.name,
                    element: skillData.element,
                    role: skillData.role,
                    activationType: skillData.activationType,
                    triggerCondition: skillData.triggerCondition || null,
                    castTime: skillData.castTime,
                    cooldownSec: appliedCt,
                    range: skillData.range,
                    aoe: skillData.aoe,
                    description: skillData.description,
                    // CT は返さない（クライアントの localStorage が正）
                    remainingSec: 0
                };
            });

            return res.json({ success: true, roleKey, skills });

        } catch (error) {
            console.error('[ShipSkillStatus] Error:', error);
            return res.status(500).json({ error: 'Failed to get ship skill status', details: error.message });
        }
    });
}

// ────────────────────────────────────────────────────────────
// エフェクト適用ディスパッチャ
// skillData.effect.subtype に応じて Firestore/PlayFab を更新する
// ────────────────────────────────────────────────────────────
async function applyShipSkillEffect(shipsCollection, promisifyPlayFab, PlayFabServer, casterId, skillData, context) {
    const { effect } = skillData;
    const nowMs = Date.now();
    const targetId = resolveTargetId(context, skillData.effect.target, casterId);
    const durationMs = (effect.duration || 0) * 1000;
    const expiresAt = durationMs > 0 ? nowMs + durationMs : null;

    switch (effect.subtype) {

        // ── バフ系 ──────────────────────────────────────────
        case 'shield': {
            const shieldVal = Number(effect.value) || 0;
            await shipsCollection.doc(casterId).set({
                shipSkillShieldHp: shieldVal,
                shipSkillShieldUntil: expiresAt,
                shipSkillShieldUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { applied: 'shield', shieldHp: shieldVal, expiresAt };
        }

        case 'invincible-escape': {
            await shipsCollection.doc(casterId).set({
                immuneUntil: expiresAt,
                immuneSource: 'shipSkill',
                immuneUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { applied: 'invincible-escape', immuneUntil: expiresAt };
        }

        case 'atk-up':
        case 'def-up':
        case 'berserker':
        case 'focus':
        case 'charge':
        case 'last-stand':
        case 'fortify': {
            await shipsCollection.doc(casterId).set({
                shipSkillBuff: {
                    subtype: effect.subtype,
                    value: effect.value,
                    expiresAt,
                    source: skillData.name
                },
                shipSkillBuffUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { applied: effect.subtype, value: effect.value, expiresAt };
        }

        case 'stealth': {
            await shipsCollection.doc(casterId).set({
                shipSkillStealth: true,
                shipSkillStealthUntil: expiresAt,
                shipSkillStealthUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { applied: 'stealth', stealthUntil: expiresAt };
        }

        case 'overheal-shield': {
            await shipsCollection.doc(casterId).set({
                shipSkillShieldHp: Number(effect.value) || 0,
                shipSkillShieldUntil: expiresAt,
                shipSkillShieldUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { applied: 'overheal-shield', shieldHp: effect.value, expiresAt };
        }

        // ── デバフ系 ─────────────────────────────────────────
        case 'stun':
        case 'slow':
        case 'confusion':
        case 'drift':
        case 'taunt':
        case 'illusion':
        case 'armor-break':
        case 'cast-time-increase':
        case 'cooldown-increase':
        case 'atk-down':
        case 'heal-block':
        case 'heal-drain':
        case 'skill-seal':
        case 'weight':
        case 'speed-weight': {
            if (!targetId) return { skipped: true, reason: 'no-target' };
            await shipsCollection.doc(targetId).set({
                shipSkillDebuff: {
                    subtype: effect.subtype,
                    value: effect.value,
                    expiresAt,
                    sourcePlayFabId: casterId,
                    sourceName: skillData.name
                },
                shipSkillDebuffUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { applied: effect.subtype, targetId, value: effect.value, expiresAt };
        }

        case 'global-cooldown-increase':
        case 'global-skill-seal': {
            // 全敵対象は context.enemyIds で受け取る
            const enemyIds = Array.isArray(context?.enemyIds) ? context.enemyIds : [];
            const results = [];
            for (const eid of enemyIds) {
                await shipsCollection.doc(eid).set({
                    shipSkillDebuff: {
                        subtype: effect.subtype,
                        value: effect.value,
                        expiresAt,
                        sourcePlayFabId: casterId,
                        sourceName: skillData.name
                    },
                    shipSkillDebuffUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                results.push(eid);
            }
            return { applied: effect.subtype, targets: results, expiresAt };
        }

        // ── DoT 系 ───────────────────────────────────────────
        case 'dot-burn':
        case 'corruption': {
            if (!targetId) return { skipped: true, reason: 'no-target' };
            await shipsCollection.doc(targetId).set({
                shipSkillDot: {
                    subtype: effect.subtype,
                    tickDamage: effect.value,
                    expiresAt,
                    sourcePlayFabId: casterId,
                    sourceName: skillData.name
                },
                shipSkillDotUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { applied: effect.subtype, targetId, tickDamage: effect.value, expiresAt };
        }

        // ── ダメージ系 ────────────────────────────────────────
        case 'cone-blast':
        case 'lightning-strike': {
            const aoeTargets = Array.isArray(context?.aoeTargets) ? context.aoeTargets : [];
            const damageVal = Math.round(Number(effect.value) || 0);
            const results = [];
            for (const tid of aoeTargets) {
                const snap = await shipsCollection.doc(tid).get();
                const data = snap.data() || {};
                const currentHp = Number(data.hp || 0);
                const newHp = Math.max(0, currentHp - damageVal);
                await shipsCollection.doc(tid).set({
                    hp: newHp,
                    shipLastDamageAt: nowMs,
                    shipLastDamageSource: casterId
                }, { merge: true });
                results.push({ targetId: tid, damageDealt: currentHp - newHp, newHp });
            }
            // 塔は術者自身にも 100 ダメージ
            if (effect.subtype === 'lightning-strike') {
                const selfSnap = await shipsCollection.doc(casterId).get();
                const selfData = selfSnap.data() || {};
                const selfHp = Math.max(0, Number(selfData.hp || 0) - 100);
                await shipsCollection.doc(casterId).set({ hp: selfHp }, { merge: true });
                results.push({ targetId: casterId, damageDealt: 100, newHp: selfHp, self: true });
            }
            return { applied: effect.subtype, results };
        }

        case 'mutual': {
            const selfSnap = await shipsCollection.doc(casterId).get();
            const selfData = selfSnap.data() || {};
            const selfMaxHp = Number(selfData.maxHp || selfData.hp || 1000);
            const selfDmg = Math.round(selfMaxHp * Number(effect.value));
            const newSelfHp = Math.max(0, Number(selfData.hp || 0) - selfDmg);
            await shipsCollection.doc(casterId).set({ hp: newSelfHp }, { merge: true });

            let targetResult = null;
            if (targetId) {
                const tSnap = await shipsCollection.doc(targetId).get();
                const tData = tSnap.data() || {};
                const tMaxHp = Number(tData.maxHp || tData.hp || 1000);
                const tDmg = Math.round(tMaxHp * Number(effect.value));
                const newTHp = Math.max(0, Number(tData.hp || 0) - tDmg);
                await shipsCollection.doc(targetId).set({ hp: newTHp }, { merge: true });
                targetResult = { targetId, damage: tDmg, newHp: newTHp };
            }
            return { applied: 'mutual', casterDamage: selfDmg, newCasterHp: newSelfHp, targetResult };
        }

        case 'set-hp-50pct': {
            const aoeTargets = Array.isArray(context?.aoeTargets) ? context.aoeTargets : [];
            const results = [];
            for (const tid of aoeTargets) {
                const snap = await shipsCollection.doc(tid).get();
                const data = snap.data() || {};
                const maxHp = Number(data.maxHp || data.hp || 1000);
                const newHp = Math.round(maxHp * 0.5);
                await shipsCollection.doc(tid).set({ hp: newHp }, { merge: true });
                results.push({ targetId: tid, newHp });
            }
            return { applied: 'set-hp-50pct', results };
        }

        // ── 回復系 ───────────────────────────────────────────
        case 'regen': {
            await shipsCollection.doc(casterId).set({
                shipSkillRegen: {
                    tickHeal: Number(effect.value) || 0,
                    expiresAt,
                    sourceName: skillData.name
                },
                shipSkillRegenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { applied: 'regen', tickHeal: effect.value, expiresAt };
        }

        case 'emergency-heal': {
            const snap = await shipsCollection.doc(casterId).get();
            const data = snap.data() || {};
            const maxHp = Number(data.maxHp || 1000);
            const healAmt = Math.round(maxHp * Number(effect.value));
            const newHp = Math.min(maxHp, Number(data.hp || 0) + healAmt);
            await shipsCollection.doc(casterId).set({ hp: newHp }, { merge: true });
            return { applied: 'emergency-heal', healAmt, newHp };
        }

        // ── 特殊系 ───────────────────────────────────────────
        case 'debuff-cleanse': {
            await shipsCollection.doc(casterId).set({
                shipSkillDebuff: admin.firestore.FieldValue.delete(),
                shipSkillDot: admin.firestore.FieldValue.delete()
            }, { merge: true });
            return { applied: 'debuff-cleanse' };
        }

        case 'buff-nullify': {
            if (!targetId) return { skipped: true, reason: 'no-target' };
            await shipsCollection.doc(targetId).set({
                shipSkillBuff: admin.firestore.FieldValue.delete()
            }, { merge: true });
            return { applied: 'buff-nullify', targetId };
        }

        case 'revive': {
            await shipsCollection.doc(casterId).set({
                shipSkillRevive: {
                    reviveHpPct: Number(effect.value) || 0.3,
                    armed: true
                }
            }, { merge: true });
            return { applied: 'revive', reviveHpPct: effect.value };
        }

        case 'blink': {
            // ワープ先座標はクライアント側で処理、サーバーはログのみ
            await shipsCollection.doc(casterId).set({
                shipSkillBlinkAt: nowMs
            }, { merge: true });
            return { applied: 'blink', note: 'Position update handled client-side' };
        }

        case 'position-swap': {
            if (!targetId) return { skipped: true, reason: 'no-target' };
            // 位置入れ替えはクライアント座標系で処理するため座標をそのまま記録
            await shipsCollection.doc(casterId).set({
                shipSkillPositionSwap: { with: targetId, at: nowMs }
            }, { merge: true });
            return { applied: 'position-swap', targetId, note: 'Position swap handled client-side' };
        }

        case 'reset-all-ct': {
            // 全味方船のCTリセット — context.allyIds で受け取る
            const allyIds = Array.isArray(context?.allyIds) ? context.allyIds : [casterId];
            const batch = db.batch();
            for (const aid of allyIds) {
                batch.set(shipsCollection.doc(aid), { [SKILL_CT_FIELD]: {} }, { merge: true });
            }
            await batch.commit();
            return { applied: 'reset-all-ct', targets: allyIds };
        }

        case 'fate-wheel': {
            // 全ユニットHP入れ替え — context.allShipIds で受け取る
            const allIds = Array.isArray(context?.allShipIds) ? context.allShipIds : [];
            const hps = await Promise.all(allIds.map(async (id) => {
                const s = await shipsCollection.doc(id).get();
                return { id, hp: Number(s.data()?.hp || 0) };
            }));
            // シャッフル
            const hpValues = hps.map((h) => h.hp);
            for (let i = hpValues.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [hpValues[i], hpValues[j]] = [hpValues[j], hpValues[i]];
            }
            const batch = db.batch();
            hps.forEach((h, i) => {
                batch.set(shipsCollection.doc(h.id), { hp: hpValues[i] }, { merge: true });
            });
            await batch.commit();
            return { applied: 'fate-wheel', swapped: allIds.length };
        }

        case 'judgment': {
            const allIds = Array.isArray(context?.allShipIds) ? context.allShipIds : [];
            const results = [];
            for (const id of allIds) {
                const s = await shipsCollection.doc(id).get();
                const d = s.data() || {};
                const maxHp = Number(d.maxHp || 1000);
                const currentHp = Number(d.hp || 0);
                const hpPct = maxHp > 0 ? currentHp / maxHp : 1;
                const newHp = hpPct <= 0.5
                    ? Math.max(0, currentHp - 1000)
                    : Math.min(maxHp, currentHp + 1000);
                await shipsCollection.doc(id).set({ hp: newHp }, { merge: true });
                results.push({ id, wasBelow50: hpPct <= 0.5, newHp });
            }
            return { applied: 'judgment', results };
        }

        case 'equalize-hp': {
            const allIds = Array.isArray(context?.allShipIds) ? context.allShipIds : [];
            if (allIds.length === 0) return { applied: 'equalize-hp', results: [] };
            const snaps = await Promise.all(allIds.map((id) => shipsCollection.doc(id).get()));
            const total = snaps.reduce((s, snap) => s + Number(snap.data()?.hp || 0), 0);
            const avg = Math.round(total / allIds.length);
            const batch = db.batch();
            snaps.forEach((snap) => {
                batch.set(shipsCollection.doc(snap.id), { hp: avg }, { merge: true });
            });
            await batch.commit();
            return { applied: 'equalize-hp', avgHp: avg, targets: allIds.length };
        }

        case 'summon-allies': {
            const value = effect.value && typeof effect.value === 'object' ? effect.value : {};
            const allyIds = Array.isArray(context?.allyIds) ? context.allyIds : [casterId];
            const enemyIds = Array.isArray(context?.enemyIds) ? context.enemyIds : [];
            const maxTargets = Math.max(1, Math.min(99, Number(value.maxTargets || 1)));
            const targets = allyIds
                .filter((id) => id && id !== casterId)
                .slice(0, maxTargets);
            const casterPosition = context?.casterPosition || {};
            const x = Math.max(0, Math.min(1000, Number(casterPosition.x) || 500));
            const y = Math.max(0, Math.min(1000, Number(casterPosition.y) || 500));
            const radius = Math.max(24, Math.min(180, Number(value.radius || 80)));

            for (const target of targets) {
                await shipsCollection.doc(target).set({
                    shipSkillSpecial: {
                        subtype: 'summon-allies',
                        x,
                        y,
                        radius,
                        value,
                        expiresAt,
                        source: casterId,
                        sourceName: skillData.name,
                        at: nowMs
                    },
                    shipSkillSpecialUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            if (Number(value.enemyAtkDown) > 0 && enemyIds.length > 0) {
                const atkDownMult = Math.max(0.1, Math.min(1, 1 - Number(value.enemyAtkDown)));
                const enemyBatch = db.batch();
                for (const enemyId of enemyIds.filter(Boolean)) {
                    enemyBatch.set(shipsCollection.doc(enemyId), {
                        shipSkillDebuff: {
                            subtype: 'atk-down',
                            value: atkDownMult,
                            expiresAt,
                            sourcePlayFabId: casterId,
                            sourceName: skillData.name
                        },
                        shipSkillDebuffUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
                await enemyBatch.commit();
            }

            return { applied: 'summon-allies', targets, x, y, radius, value, expiresAt };
        }

        case 'resurrection-call': {
            const value = effect.value && typeof effect.value === 'object' ? effect.value : {};
            const allyIds = Array.isArray(context?.allyIds) ? context.allyIds : [casterId];
            const maxTargets = Math.max(1, Math.min(99, Number(value.maxTargets || 99)));
            const targets = allyIds.filter(Boolean).slice(0, maxTargets);
            const batch = db.batch();

            for (const target of targets) {
                batch.set(shipsCollection.doc(target), {
                    shipSkillSpecial: {
                        subtype: 'resurrection-call',
                        value,
                        source: casterId,
                        sourceName: skillData.name,
                        at: nowMs
                    },
                    shipSkillSpecialUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            await batch.commit();
            return { applied: 'resurrection-call', targets, value };
        }

        case 'resource-drain': {
            if (!targetId) return { skipped: true, reason: 'no-target' };
            // 資源奪取は PlayFab アイテム操作が必要なため記録のみ（実装フック）
            await shipsCollection.doc(casterId).set({
                shipSkillResourceDrain: { from: targetId, pct: effect.value, at: nowMs }
            }, { merge: true });
            return { applied: 'resource-drain', note: 'Resource transfer requires economy hook' };
        }

        case 'loot-bonus': {
            await shipsCollection.doc(casterId).set({
                shipSkillLootBonus: { mult: effect.value, at: nowMs }
            }, { merge: true });
            return { applied: 'loot-bonus', mult: effect.value };
        }

        case 'delayed-damage': {
            if (!targetId) return { skipped: true, reason: 'no-target' };
            await shipsCollection.doc(targetId).set({
                shipSkillDelayedDamage: {
                    damage: Number(effect.value),
                    fireAt: nowMs + durationMs,
                    sourcePlayFabId: casterId
                }
            }, { merge: true });
            return { applied: 'delayed-damage', fireAt: nowMs + durationMs };
        }

        case 'mind-control':
        case 'truce':
        case 'alliance-force':
        case 'ceasefire-decree':
        case 'decoy':
        case 'fake-hp-display':
        case 'intel-reveal':
        case 'fog-of-war':
        case 'full-reveal-heal':
        case 'global-heal-beacon':
        case 'resource-surge':
        case 'command-aura':
        case 'sacrifice-power':
        case 'skill-copy':
        case 'status-immunity':
        case 'skill-delay':
        case 'over-heal-damage':
        case 'atk-up-on-ready':
        case 'resource-waste':
        case 'resource-recovery':
        case 'resource-transfer':
        case 'reveal-stealth':
        case 'contract-betray':
        case 'terrain-collapse':
        case 'buff-steal':
        case 'formation-break':
        case 'skill-interrupt':
        case 'cooldown-bypass':
        case 'judgment':
        case 'target-mark': {
            // 複雑な特殊効果はFirestoreに状態を記録し、クライアントまたは定期ジョブが処理
            const doc = { shipSkillSpecial: { subtype: effect.subtype, value: effect.value, expiresAt, source: casterId } };
            const targetDoc = targetId && targetId !== casterId ? targetId : casterId;
            await shipsCollection.doc(targetDoc).set(doc, { merge: true });
            return { applied: effect.subtype, targetId: targetDoc, expiresAt };
        }

        case 'random-chaos': {
            const allIds = Array.isArray(context?.allShipIds) ? context.allShipIds : [casterId];
            const CHAOS_EFFECTS = ['buff', 'debuff', 'heal', 'damage', 'teleport'];
            const results = [];
            for (const id of allIds) {
                const chosen = CHAOS_EFFECTS[Math.floor(Math.random() * CHAOS_EFFECTS.length)];
                await shipsCollection.doc(id).set({
                    shipSkillSpecial: { subtype: 'chaos', chosenEffect: chosen, at: nowMs }
                }, { merge: true });
                results.push({ id, chosenEffect: chosen });
            }
            return { applied: 'random-chaos', results };
        }

        default:
            console.warn(`[ShipSkillEffect] Unknown subtype: ${effect.subtype}`);
            return { applied: 'unknown', subtype: effect.subtype };
    }
}

// ターゲット解決ヘルパー
function resolveTargetId(context, targetType, casterId) {
    if (!targetType || targetType === 'self' || targetType === 'caster') return casterId;
    if (targetType === 'enemy-ship' || targetType === 'enemy-area') {
        return context?.targetPlayFabId || context?.targetId || null;
    }
    if (targetType === 'ally-ship') {
        return context?.allyTargetId || casterId;
    }
    return casterId;
}

module.exports = { initializeShipSkillRoutes };
