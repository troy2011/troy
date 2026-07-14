#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const vm = require('vm');

const SOURCE_PATH = 'public/js/tarotReading.js';
const TOPIC_TABLES = {
    love: ['LOVE_MAJOR_READINGS', 'LOVE_MINOR_READINGS'],
    work: ['WORK_MAJOR_READINGS', 'WORK_MINOR_READINGS'],
    relation: ['RELATION_MAJOR_READINGS', 'RELATION_MINOR_READINGS'],
    future: ['FUTURE_MAJOR_READINGS', 'FUTURE_MINOR_READINGS']
};
const TOPIC_IDS = Object.keys(TOPIC_TABLES);
const SUBTOPIC_IDS = {
    love: ['feelings', 'direction', 'reconciliation', 'encounter', 'commitment'],
    work: ['current', 'evaluation', 'career_change', 'business', 'negotiation'],
    relation: ['friends', 'family', 'difficult', 'position', 'continue'],
    future: ['near', 'goal', 'choice', 'turning_point', 'preparation']
};
const MAJOR_KEYS = Array.from({ length: 22 }, (_, index) => String(index));
const SUITS = ['wand', 'cup', 'sword', 'pentacle'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'page', 'knight', 'queen', 'king'];
const ORIENTATIONS = ['upright', 'reversed'];
const VERDICT_BANDS = ['critical', 'warning', 'mixed', 'favorable', 'excellent'];
const VAGUE_ACTION_TEXT = ['頑張ってください', '前向きに考えてください', '意識してください', '気をつけてください'];
const RED_FLAGS = {
    love: ['仕事', '職場', '業務', '事業', '会社', '売上', '利益', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '人間関係', 'コミュニティ', 'グループ', '人脈'],
    work: ['恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談', 'ワンナイト', '愛情', '伴侶'],
    relation: ['仕事', '職場', '業務', '事業', '会社', '売上', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '現場', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談'],
    future: ['仕事', '職場', '業務', '事業', '会社', '売上', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '現場', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '監査', '恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談']
};
const TEXT_QUALITY_FLAGS = [
    '向向見ず',
    '中取り半端',
    '見死なぬ',
    '気づした',
    '最悪 of 最悪',
    'ガラクラ',
    '読み干',
    '往期',
    '早めにに'
];
const LINE_FORBIDDEN_TEXT = [
    'このカードの意味',
    '結論:',
    '現在地:',
    '次の一手:',
    '禁じ手:',
    '船長からの一言',
    '船長の結び',
    '一言判定',
    'お客様へ伝える鑑定',
    'スタッフ補助',
    '追記:'
];
const STAFF_FORBIDDEN_TEXT = [
    'お前さん',
    'ククク',
    '一言判定',
    '船長からの一言',
    '船長の結び',
    'スタッフ補助'
];
const SUBTOPIC_CONTEXT_FLAGS = {
    'love.feelings': ['新しい出会い', 'お見合い', '次の恋へ', '別の獲物'],
    'love.direction': ['新しい出会い', 'お見合い', '次の恋へ', '別の獲物'],
    'love.reconciliation': ['新しい出会い', 'お見合い', '次の恋へ', '別の獲物'],
    'love.encounter': ['今の２人', '付き合ったり結ばれたり', 'パートナーとの絆', '冷めきった関係', '手に入れた相手', '２人の状況', '家庭内の財産争い'],
    'love.commitment': ['新しい出会い', 'お見合い', '次の恋へ', '別の獲物'],
    'work.evaluation': ['転職や撤退', '次のキャリア', '会社が事実上の破産', '倒産のどん底', '不採算部門や合わない職場', '新規投資', '黒字倒産', '資金ショート'],
    'relation.family': ['新たな出会い', 'あのグループ', '新しい人脈', 'コミュニティ', '新しい友達', 'グループから', '仲間たち', '仲間だと思って', '新天地（新しい人間関係）', '幻影の仲間', '合わないグループ', '派手な人脈', '周囲の仲間', '異なるグループ', 'ポジションや友人', '別の楽そうなコミュニティ'],
    'relation.continue': ['新たな出会い', 'あのグループ', '新しい人脈']
};

function loadTables() {
    const code = fs.readFileSync(SOURCE_PATH, 'utf8');
    const context = {
        window: {},
        document: {
            querySelectorAll: () => [],
            querySelector: () => null,
            getElementById: () => null,
            createElement: () => ({})
        },
        console,
        setTimeout,
        clearTimeout
    };
    vm.createContext(context);
    vm.runInContext(`${code}
this.__tarotAudit = {
  LOVE_MAJOR_READINGS,
  LOVE_MINOR_READINGS,
  WORK_MAJOR_READINGS,
  WORK_MINOR_READINGS,
  RELATION_MAJOR_READINGS,
  RELATION_MINOR_READINGS,
  FUTURE_MAJOR_READINGS,
  FUTURE_MINOR_READINGS,
  MAJOR_CARD_WORDS,
  MINOR_CARD_WORDS,
  STAFF_TOPIC_FRAMES,
  SUBTOPICS,
  SUBTOPIC_READING_FRAMES,
  SUBTOPIC_VERDICTS,
  SUBTOPIC_WEATHER_OVERRIDES,
  SUBTOPIC_LINE_BODY_OVERRIDES,
  THREE_CARD_SPREAD_FRAMES,
  THREE_CARD_FLOW_TEXT,
  MAJOR_STAFF_GUIDANCE,
  MINOR_STAFF_GUIDANCE,
  MAJOR_WEATHER_LEVELS,
  MINOR_WEATHER_LEVELS,
  TOPICS,
  allCards,
  getWeatherStatus,
  getReadingWeatherStatus,
  getVerdictBand,
  getSubtopicVerdict,
  getSubtopicLineBody,
  getThreeCardSpreadFrame,
  getThreeCardWeatherStatus,
  getThreeCardFlow,
  getThreeCardPattern,
  getThreeCardVerdict,
  getThreeCardPositionReading,
  getStaffGuidance,
  getSubtopicReadingFrame,
  getSpecialReadingBody,
  buildStaffReading,
  buildLineReading,
  buildThreeCardStaffReading,
  buildThreeCardLineReading
};`, context);
    return context.__tarotAudit;
}

function collectSourceReadings(tables) {
    const readings = [];
    Object.entries(TOPIC_TABLES).forEach(([topicId, [majorName, minorName]]) => {
        MAJOR_KEYS.forEach((number) => {
            ORIENTATIONS.forEach((orientation) => {
                readings.push({
                    topicId,
                    loc: `major_${number.padStart(2, '0')}`,
                    orientation,
                    text: String(tables[majorName]?.[number]?.[orientation] || '').trim()
                });
            });
        });
        SUITS.forEach((suit) => {
            RANKS.forEach((rank) => {
                ORIENTATIONS.forEach((orientation) => {
                    readings.push({
                        topicId,
                        loc: `${suit}_${rank}`,
                        orientation,
                        text: String(tables[minorName]?.[suit]?.[rank]?.[orientation] || '').trim()
                    });
                });
            });
        });
    });
    return readings;
}

function collectGeneratedReadings(tables) {
    const generated = [];
    tables.TOPICS.forEach((topic) => {
        topic.subtopics.forEach((subtopic) => {
            tables.allCards.forEach((card) => {
                ORIENTATIONS.forEach((orientation) => {
                    const sourceText = String(tables.getSpecialReadingBody(topic.id, card, orientation) || '').trim();
                    generated.push({
                        topicId: topic.id,
                        subtopicId: subtopic.id,
                        subtopicLabel: subtopic.label,
                        loc: card.id,
                        orientation,
                        sourceText,
                        lineBody: String(tables.getSubtopicLineBody(topic.id, subtopic, card, orientation, sourceText) || '').trim(),
                        readingWeather: tables.getReadingWeatherStatus(topic.id, subtopic, card, orientation),
                        verdict: tables.getSubtopicVerdict(topic.id, subtopic, card, orientation),
                        staffText: String(tables.buildStaffReading(topic, card, orientation, subtopic) || '').trim(),
                        lineText: String(tables.buildLineReading(card, orientation, sourceText, topic, subtopic) || '').trim()
                    });
                });
            });
        });
    });
    return generated;
}

function createThreeCardSelections(tables, candidate, orientation, candidatePosition) {
    const companionIds = ['major-14', 'cup-2', 'sword-6', 'pentacle-8', 'wand-4'];
    const used = new Set([candidate.id]);
    const selections = Array(3).fill(null);
    selections[candidatePosition] = { card: candidate, orientation };
    for (let index = 0; index < selections.length; index += 1) {
        if (selections[index]) continue;
        const companionId = companionIds.find((cardId) => !used.has(cardId));
        const card = tables.allCards.find((entry) => entry.id === companionId);
        used.add(companionId);
        selections[index] = { card, orientation: index === 1 ? 'reversed' : 'upright' };
    }
    return selections;
}

function collectGeneratedThreeCardReadings(tables) {
    const generated = [];
    tables.TOPICS.forEach((topic) => {
        topic.subtopics.forEach((subtopic) => {
            const positions = tables.getThreeCardSpreadFrame(topic.id, subtopic);
            tables.allCards.forEach((card) => {
                ORIENTATIONS.forEach((orientation) => {
                    positions.forEach((position, candidatePosition) => {
                        const selections = createThreeCardSelections(tables, card, orientation, candidatePosition);
                        const weather = tables.getThreeCardWeatherStatus(topic.id, subtopic, selections);
                        generated.push({
                            topicId: topic.id,
                            subtopicId: subtopic.id,
                            subtopicLabel: subtopic.label,
                            loc: card.id,
                            orientation,
                            candidatePosition,
                            positions,
                            selections,
                            positionReading: tables.getThreeCardPositionReading(
                                topic,
                                subtopic,
                                selections[candidatePosition],
                                position,
                                candidatePosition
                            ),
                            weather,
                            flow: tables.getThreeCardFlow(weather?.levels),
                            pattern: tables.getThreeCardPattern(selections),
                            verdict: tables.getThreeCardVerdict(topic.id, subtopic, weather?.level),
                            staffText: String(tables.buildThreeCardStaffReading(topic, selections, subtopic) || '').trim(),
                            lineText: String(tables.buildThreeCardLineReading(topic, selections, subtopic) || '').trim()
                        });
                    });
                });
            });
        });
    });
    return generated;
}

function findDuplicateTexts(entries, key) {
    const duplicates = [];
    const seen = new Map();
    entries.forEach((entry) => {
        const value = entry[key];
        if (!value) return;
        const identity = `${entry.topicId}:${entry.subtopicId || '-'}:${entry.loc}:${entry.orientation}`;
        if (seen.has(value)) duplicates.push([seen.get(value), identity]);
        else seen.set(value, identity);
    });
    return duplicates;
}

function collectCoverageGaps(tables) {
    const gaps = [];
    TOPIC_IDS.forEach((topicId) => {
        ['meaningContext', 'pointLead', 'actionLead', 'cautionLead', 'subject', 'target', 'evidence', 'step', 'resource', 'boundary', 'result', 'support'].forEach((field) => {
            if (!String(tables.STAFF_TOPIC_FRAMES?.[topicId]?.[field] || '').trim()) gaps.push(`frame:${topicId}.${field}`);
        });
        const expectedSubtopics = SUBTOPIC_IDS[topicId];
        const actualSubtopics = (tables.SUBTOPICS?.[topicId] || []).map((subtopic) => subtopic.id);
        if (actualSubtopics.join(',') !== expectedSubtopics.join(',')) {
            gaps.push(`subtopics:${topicId}:${actualSubtopics.join(',') || 'empty'}`);
        }
        expectedSubtopics.forEach((subtopicId) => {
            const frame = tables.SUBTOPIC_READING_FRAMES?.[topicId]?.[subtopicId];
            ['meaningContext', 'pointLead', 'actionLead', 'cautionLead', 'subject', 'target', 'evidence', 'step', 'resource', 'boundary', 'result', 'support'].forEach((field) => {
                if (!String(frame?.[field] || '').trim()) gaps.push(`subtopic-frame:${topicId}.${subtopicId}.${field}`);
            });
            ['major', ...SUITS].forEach((cardGroup) => {
                const focus = frame?.focus?.[cardGroup];
                if (!Array.isArray(focus) || focus.length !== 2 || focus.some((text) => !String(text || '').trim())) {
                    gaps.push(`subtopic-focus:${topicId}.${subtopicId}.${cardGroup}`);
                }
            });
            VERDICT_BANDS.forEach((band) => {
                const verdict = tables.SUBTOPIC_VERDICTS?.[topicId]?.[subtopicId]?.[band];
                if (!String(verdict?.staff || '').trim()) gaps.push(`subtopic-verdict:${topicId}.${subtopicId}.${band}.staff`);
                if (!String(verdict?.line || '').trim()) gaps.push(`subtopic-verdict:${topicId}.${subtopicId}.${band}.line`);
            });
            const threeCardFrame = tables.THREE_CARD_SPREAD_FRAMES?.[topicId]?.[subtopicId];
            if (!Array.isArray(threeCardFrame) || threeCardFrame.length !== 3) {
                gaps.push(`three-card-frame:${topicId}.${subtopicId}`);
            } else {
                const positionIds = new Set();
                threeCardFrame.forEach((position, index) => {
                    ['id', 'label', 'focus'].forEach((field) => {
                        if (!String(position?.[field] || '').trim()) gaps.push(`three-card-frame:${topicId}.${subtopicId}.${index}.${field}`);
                    });
                    if (positionIds.has(position.id)) gaps.push(`three-card-frame-duplicate:${topicId}.${subtopicId}.${position.id}`);
                    positionIds.add(position.id);
                });
            }
        });
    });
    ['favorable', 'difficult', 'recovery', 'decline', 'volatile', 'steady', 'mixed'].forEach((flowId) => {
        if (!String(tables.THREE_CARD_FLOW_TEXT?.[flowId]?.staff || '').trim()) gaps.push(`three-card-flow:${flowId}.staff`);
        if (!String(tables.THREE_CARD_FLOW_TEXT?.[flowId]?.line || '').trim()) gaps.push(`three-card-flow:${flowId}.line`);
    });
    SUITS.forEach((suit) => {
        RANKS.forEach((rank) => {
            ORIENTATIONS.forEach((orientation) => {
                const weatherLevel = tables.MINOR_WEATHER_LEVELS?.[suit]?.[rank]?.[orientation];
                if (!Number.isInteger(weatherLevel) || weatherLevel < 1 || weatherLevel > 10) {
                    gaps.push(`weather:${suit}_${rank}:${orientation}`);
                }
                if (!String(tables.MINOR_CARD_WORDS?.[suit]?.[rank]?.[orientation] || '').trim()) {
                    gaps.push(`word:${suit}_${rank}:${orientation}`);
                }
                ['point', 'action', 'caution'].forEach((field) => {
                    if (!String(tables.MINOR_STAFF_GUIDANCE?.[suit]?.[rank]?.[orientation]?.[field] || '').trim()) {
                        gaps.push(`guidance:${suit}_${rank}:${orientation}.${field}`);
                    }
                });
            });
        });
    });
    MAJOR_KEYS.forEach((number) => {
        ORIENTATIONS.forEach((orientation) => {
            const weatherLevel = tables.MAJOR_WEATHER_LEVELS?.[number]?.[orientation];
            if (!Number.isInteger(weatherLevel) || weatherLevel < 1 || weatherLevel > 10) {
                gaps.push(`weather:major_${number}:${orientation}`);
            }
            if (!String(tables.MAJOR_CARD_WORDS?.[Number(number)]?.[orientation] || '').trim()) {
                gaps.push(`word:major_${number}:${orientation}`);
            }
            ['point', 'action', 'caution'].forEach((field) => {
                if (!String(tables.MAJOR_STAFF_GUIDANCE?.[Number(number)]?.[orientation]?.[field] || '').trim()) {
                    gaps.push(`guidance:major_${number}:${orientation}.${field}`);
                }
            });
        });
    });
    Object.entries(tables.SUBTOPIC_WEATHER_OVERRIDES || {}).forEach(([topicId, subtopics]) => {
        Object.entries(subtopics || {}).forEach(([subtopicId, entries]) => {
            if (!SUBTOPIC_IDS[topicId]?.includes(subtopicId)) gaps.push(`weather-override-subtopic:${topicId}.${subtopicId}`);
            Object.entries(entries || {}).forEach(([key, level]) => {
                const separatorIndex = key.lastIndexOf(':');
                const cardId = key.slice(0, separatorIndex);
                const orientation = key.slice(separatorIndex + 1);
                if (!tables.allCards.some((card) => card.id === cardId) || !ORIENTATIONS.includes(orientation)) {
                    gaps.push(`weather-override-card:${topicId}.${subtopicId}.${key}`);
                }
                if (!Number.isInteger(level) || level < 1 || level > 10) gaps.push(`weather-override-level:${topicId}.${subtopicId}.${key}`);
            });
        });
    });
    Object.entries(tables.SUBTOPIC_LINE_BODY_OVERRIDES || {}).forEach(([topicId, subtopics]) => {
        Object.entries(subtopics || {}).forEach(([subtopicId, entries]) => {
            if (!SUBTOPIC_IDS[topicId]?.includes(subtopicId)) gaps.push(`line-override-subtopic:${topicId}.${subtopicId}`);
            Object.entries(entries || {}).forEach(([key, body]) => {
                const separatorIndex = key.lastIndexOf(':');
                const cardId = key.slice(0, separatorIndex);
                const orientation = key.slice(separatorIndex + 1);
                if (!tables.allCards.some((card) => card.id === cardId) || !ORIENTATIONS.includes(orientation)) {
                    gaps.push(`line-override-card:${topicId}.${subtopicId}.${key}`);
                }
                if (!String(body || '').trim()) gaps.push(`line-override-body:${topicId}.${subtopicId}.${key}`);
            });
        });
    });
    return gaps;
}

function parseStaffSections(text) {
    const sections = {};
    String(text || '').split(/\n{2,}/).forEach((section) => {
        const separatorIndex = section.indexOf(':');
        if (separatorIndex <= 0) return;
        sections[section.slice(0, separatorIndex)] = section.slice(separatorIndex + 1).trim();
    });
    return sections;
}

function hasAdjacentDuplicateSentence(text) {
    const sentences = String(text || '')
        .match(/[^。！？!?\n]+[。！？!?]?/g)?.map((sentence) => sentence.trim().replace(/^[^:：]+[:：]\s*/, ''))
        .filter((sentence) => sentence.length >= 8) || [];
    return sentences.some((sentence, index) => index > 0 && sentence === sentences[index - 1]);
}

function containsAllSentences(text, expected) {
    const sentences = String(expected || '').match(/[^。！？!?]+[。！？!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
    return sentences.length > 0 && sentences.every((sentence) => String(text || '').includes(sentence));
}

function main() {
    const tables = loadTables();
    const sourceReadings = collectSourceReadings(tables);
    const generated = collectGeneratedReadings(tables);
    const generatedThreeCard = collectGeneratedThreeCardReadings(tables);
    const errors = [];
    const details = [];
    const expectedTopics = TOPIC_IDS.join(',');
    const actualTopics = tables.TOPICS.map((topic) => topic.id).join(',');

    if (actualTopics !== expectedTopics) errors.push(`store topics are ${actualTopics || 'empty'}, expected ${expectedTopics}`);
    if (sourceReadings.length !== 624) errors.push(`source readings: ${sourceReadings.length}, expected 624`);
    if (generated.length !== 3120) errors.push(`generated readings: ${generated.length}, expected 3120`);
    if (generatedThreeCard.length !== 9360) errors.push(`three-card readings: ${generatedThreeCard.length}, expected 9360`);

    const missingSource = sourceReadings.filter((entry) => !entry.text);
    const duplicateSource = findDuplicateTexts(sourceReadings, 'text');
    const duplicateStaff = findDuplicateTexts(generated, 'staffText');
    const duplicateLine = findDuplicateTexts(generated, 'lineText');
    const coverageGaps = collectCoverageGaps(tables);
    if (missingSource.length) errors.push(`${missingSource.length} source readings are missing`);
    if (duplicateSource.length) errors.push(`${duplicateSource.length} source readings are duplicated`);
    if (duplicateStaff.length) errors.push(`${duplicateStaff.length} staff readings are duplicated`);
    if (duplicateLine.length) errors.push(`${duplicateLine.length} LINE readings are duplicated`);
    if (coverageGaps.length) errors.push(`${coverageGaps.length} data coverage gaps found`);

    tables.allCards.forEach((card) => {
        ORIENTATIONS.forEach((orientation) => {
            const weather = tables.getWeatherStatus(card, orientation);
            if (!Number.isInteger(weather?.level) || weather.level < 1 || weather.level > 10 || !weather.windLabel) {
                details.push(`weather:${card.id}:${orientation}`);
            }
        });
    });

    const generatedSections = generated.map((entry) => ({ ...entry, sections: parseStaffSections(entry.staffText) }));
    const uniquePoints = new Set(generatedSections.map((entry) => entry.sections['鑑定の要点'])).size;
    const uniqueActions = new Set(generatedSections.map((entry) => entry.sections['すすめる行動'])).size;
    const uniqueCautions = new Set(generatedSections.map((entry) => entry.sections['注意点'])).size;
    if (uniquePoints < 3000) errors.push(`staff points are too repetitive: ${uniquePoints} unique, expected at least 3000`);
    if (uniqueActions < 3000) errors.push(`staff actions are too repetitive: ${uniqueActions} unique, expected at least 3000`);
    if (uniqueCautions < 3000) errors.push(`staff cautions are too repetitive: ${uniqueCautions} unique, expected at least 3000`);

    const minorStateGroups = new Map();
    generatedSections.filter((entry) => !entry.loc.startsWith('major-')).forEach((entry) => {
        const key = `${entry.loc}:${entry.orientation}`;
        if (!minorStateGroups.has(key)) minorStateGroups.set(key, new Set());
        minorStateGroups.get(key).add(entry.sections['今の状態']);
    });
    const expectedSubtopicCount = Object.values(SUBTOPIC_IDS).flat().length;
    const sharedMinorStates = [...minorStateGroups.entries()].filter(([, values]) => values.size !== expectedSubtopicCount);
    if (sharedMinorStates.length) errors.push(`${sharedMinorStates.length} minor card states are not subtopic-specific`);

    sourceReadings.forEach((entry) => {
        const redFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => entry.text.includes(word));
        const qualityFlags = TEXT_QUALITY_FLAGS.filter((word) => entry.text.includes(word));
        if (redFlags.length) details.push(`source-category:${entry.topicId}:${entry.loc}:${entry.orientation} [${redFlags.join(', ')}]`);
        if (qualityFlags.length) details.push(`source-quality:${entry.topicId}:${entry.loc}:${entry.orientation} [${qualityFlags.join(', ')}]`);
        if (entry.text.includes('今日')) details.push(`source-today:${entry.topicId}:${entry.loc}:${entry.orientation}`);
    });

    generatedSections.forEach((entry) => {
        const identity = `${entry.topicId}:${entry.subtopicId}:${entry.loc}:${entry.orientation}`;
        if (!entry.sourceText || !entry.staffText || !entry.lineText) details.push(`generated-missing:${identity}`);
        if (!entry.verdict?.staff || !entry.verdict?.line) details.push(`generated-verdict:${identity}`);
        const expectedBand = tables.getVerdictBand(entry.readingWeather?.level);
        const expectedVerdict = tables.SUBTOPIC_VERDICTS?.[entry.topicId]?.[entry.subtopicId]?.[expectedBand];
        if (!entry.readingWeather?.windLabel || entry.verdict?.staff !== expectedVerdict?.staff || entry.verdict?.line !== expectedVerdict?.line) {
            details.push(`generated-weather-verdict:${identity}`);
        }
        if (entry.lineText.length > 3200) details.push(`line-too-long:${identity}:${entry.lineText.length}`);
        if (!/^風向き: [^\n]+\n\n[^\n]/.test(entry.lineText)) details.push(`line-format:${identity}`);
        if (!entry.lineText.startsWith(`風向き: ${entry.readingWeather?.windLabel}\n\n`)) details.push(`line-weather:${identity}`);
        const lineSections = entry.lineText.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
        if (entry.verdict?.line && !containsAllSentences(lineSections[1], entry.verdict.line)) details.push(`line-verdict-order:${identity}`);
        const forbiddenLine = LINE_FORBIDDEN_TEXT.filter((word) => entry.lineText.includes(word));
        if (forbiddenLine.length) details.push(`line-mixed:${identity} [${forbiddenLine.join(', ')}]`);
        const firstLineBodySentence = entry.lineBody.match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim();
        if (firstLineBodySentence && !entry.lineText.includes(firstLineBodySentence)) details.push(`line-source:${identity}`);
        const forbiddenStaff = STAFF_FORBIDDEN_TEXT.filter((word) => entry.staffText.includes(word));
        if (forbiddenStaff.length) details.push(`staff-voice:${identity} [${forbiddenStaff.join(', ')}]`);
        if (entry.staffText.includes('今日') || entry.lineText.includes('今日')) details.push(`generated-today:${identity}`);
        if (entry.staffText.split(/\r?\n/).filter(Boolean).length !== 6) details.push(`staff-format:${identity}`);
        if (/\{[a-z]+\}/.test(entry.staffText)) details.push(`staff-placeholder:${identity}`);
        if (hasAdjacentDuplicateSentence(entry.staffText) || hasAdjacentDuplicateSentence(entry.lineText)) details.push(`generated-repetition:${identity}`);
        const subtopicFrame = tables.getSubtopicReadingFrame(entry.topicId, entry.subtopicId);
        if (!entry.staffText.includes(`【${tables.TOPICS.find((topic) => topic.id === entry.topicId)?.label}・${entry.subtopicLabel}鑑定】`)) {
            details.push(`staff-heading-subtopic:${identity}`);
        }
        if (!entry.staffText.includes(`このカードが持つ意味は、${subtopicFrame?.meaningContext}`)) {
            details.push(`staff-meaning-subtopic:${identity}`);
        }
        const card = tables.allCards.find((candidate) => candidate.id === entry.loc);
        const cardGroup = card?.kind === 'major' ? 'major' : card?.suitId;
        const staffFocus = subtopicFrame?.focus?.[cardGroup]?.[0];
        const lineFocus = subtopicFrame?.focus?.[cardGroup]?.[1];
        if (entry.verdict?.staff && !entry.sections['今の状態']?.includes(entry.verdict.staff)) {
            details.push(`staff-verdict-order:${identity}`);
        }
        if (staffFocus && !entry.sections['鑑定の要点']?.includes(staffFocus)) {
            details.push(`staff-focus-subtopic:${identity}`);
        }
        const firstLineFocusSentence = lineFocus?.match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim();
        if (firstLineFocusSentence && !entry.lineText.includes(firstLineFocusSentence)) {
            details.push(`line-focus-subtopic:${identity}`);
        }
        ['今の状態', '鑑定の要点', 'すすめる行動', '注意点'].forEach((label) => {
            if (String(entry.sections[label] || '').length < 12) details.push(`staff-section:${identity}:${label}`);
            if (String(entry.sections[label] || '').length > 520) details.push(`staff-section-long:${identity}:${label}`);
        });
        const actionText = String(entry.sections['すすめる行動'] || '');
        if (!/ください。?$/.test(actionText) || VAGUE_ACTION_TEXT.some((word) => actionText.endsWith(word))) {
            details.push(`staff-action-vague:${identity}`);
        }
        const staffBody = entry.staffText.split(/\r?\n/).slice(1).join('\n');
        const redFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => staffBody.includes(word));
        if (redFlags.length) details.push(`staff-category:${identity} [${redFlags.join(', ')}]`);
        const lineRedFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => entry.lineText.includes(word));
        if (lineRedFlags.length) details.push(`line-category:${identity} [${lineRedFlags.join(', ')}]`);
        const qualityFlags = TEXT_QUALITY_FLAGS.filter((word) => `${entry.staffText}\n${entry.lineText}`.includes(word));
        if (qualityFlags.length) details.push(`generated-quality:${identity} [${qualityFlags.join(', ')}]`);
        const contextFlags = (SUBTOPIC_CONTEXT_FLAGS[`${entry.topicId}.${entry.subtopicId}`] || [])
            .filter((word) => entry.lineBody.includes(word));
        if (contextFlags.length) details.push(`subtopic-context:${identity} [${contextFlags.join(', ')}]`);
    });

    generatedThreeCard.forEach((entry) => {
        const identity = `${entry.topicId}:${entry.subtopicId}:slot-${entry.candidatePosition + 1}:${entry.loc}:${entry.orientation}`;
        if (!entry.positionReading?.staff || !entry.positionReading?.keywords) details.push(`three-card-position:${identity}`);
        if (!entry.staffText || !entry.lineText) details.push(`three-card-missing:${identity}`);
        if (!entry.weather?.windLabel || !Number.isInteger(entry.weather?.level) || entry.weather.level < 1 || entry.weather.level > 10) {
            details.push(`three-card-weather:${identity}`);
        }
        if (!Array.isArray(entry.weather?.levels) || entry.weather.levels.length !== 3) details.push(`three-card-levels:${identity}`);
        if (!entry.flow?.staff || !entry.flow?.line) details.push(`three-card-flow:${identity}`);
        if (!entry.verdict?.staff || !entry.verdict?.line) details.push(`three-card-verdict:${identity}`);
        const expectedVerdict = tables.SUBTOPIC_VERDICTS?.[entry.topicId]?.[entry.subtopicId]?.[tables.getVerdictBand(entry.weather?.level)];
        if (entry.verdict?.staff !== expectedVerdict?.staff || entry.verdict?.line !== expectedVerdict?.line) {
            details.push(`three-card-weather-verdict:${identity}`);
        }
        const cardIds = entry.selections.map((selection) => selection.card.id);
        if (new Set(cardIds).size !== 3) details.push(`three-card-duplicate:${identity}`);
        if (!entry.lineText.startsWith(`風向き: ${entry.weather?.windLabel}\n\n`)) details.push(`three-card-line-weather:${identity}`);
        if (entry.lineText.length > 3200) details.push(`three-card-line-too-long:${identity}:${entry.lineText.length}`);
        const staffSections = entry.staffText.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
        if (staffSections.length !== 8) details.push(`three-card-staff-format:${identity}:${staffSections.length}`);
        if (!staffSections[1]?.startsWith('総合結論:')) details.push(`three-card-conclusion-order:${identity}`);
        if (!staffSections[5]?.startsWith('3枚のつながり:')) details.push(`three-card-connection-order:${identity}`);
        if (!staffSections[6]?.startsWith('すすめる行動:')) details.push(`three-card-action-order:${identity}`);
        if (!staffSections[7]?.startsWith('注意点:')) details.push(`three-card-caution-order:${identity}`);
        entry.positions.forEach((position, index) => {
            const card = entry.selections[index].card;
            const orientation = entry.selections[index].orientation;
            const cardSection = staffSections[index + 2] || '';
            if (!cardSection.startsWith(`${index + 1}枚目・${position.label}: ${card.label} /`)) {
                details.push(`three-card-position-order:${identity}:${index + 1}`);
            }
            if (!entry.lineText.includes(`${index + 1}枚目「${position.label}」`)) {
                details.push(`three-card-line-position:${identity}:${index + 1}`);
            }
            const source = tables.getSubtopicLineBody(
                entry.topicId,
                entry.subtopicId,
                card,
                orientation,
                tables.getSpecialReadingBody(entry.topicId, card, orientation)
            );
            const firstSentence = String(source || '').match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim();
            if (firstSentence && !entry.lineText.includes(firstSentence)) details.push(`three-card-line-source:${identity}:${index + 1}`);
        });
        const forbiddenLine = LINE_FORBIDDEN_TEXT.filter((word) => entry.lineText.includes(word));
        if (forbiddenLine.length) details.push(`three-card-line-mixed:${identity} [${forbiddenLine.join(', ')}]`);
        const forbiddenStaff = STAFF_FORBIDDEN_TEXT.filter((word) => entry.staffText.includes(word));
        if (forbiddenStaff.length) details.push(`three-card-staff-voice:${identity} [${forbiddenStaff.join(', ')}]`);
        if (entry.staffText.includes('今日') || entry.lineText.includes('今日')) details.push(`three-card-today:${identity}`);
        if (/\{[a-z]+\}/.test(entry.staffText)) details.push(`three-card-placeholder:${identity}`);
        if (hasAdjacentDuplicateSentence(entry.staffText) || hasAdjacentDuplicateSentence(entry.lineText)) {
            details.push(`three-card-repetition:${identity}`);
        }
        const qualityFlags = TEXT_QUALITY_FLAGS.filter((word) => `${entry.staffText}\n${entry.lineText}`.includes(word));
        if (qualityFlags.length) details.push(`three-card-quality:${identity} [${qualityFlags.join(', ')}]`);
        const staffCategoryBody = entry.selections.reduce(
            (text, selection) => text.split(selection.card.label).join(''),
            entry.staffText
        );
        const staffRedFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => staffCategoryBody.includes(word));
        if (staffRedFlags.length) details.push(`three-card-staff-category:${identity} [${staffRedFlags.join(', ')}]`);
        const lineRedFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => entry.lineText.includes(word));
        if (lineRedFlags.length) details.push(`three-card-line-category:${identity} [${lineRedFlags.join(', ')}]`);

        const levels = entry.weather?.levels || [];
        const criticalCount = levels.filter((level) => level <= 2).length;
        if (levels[2] <= 2 && entry.weather.level > 3) details.push(`three-card-rule-final-critical:${identity}`);
        if (criticalCount >= 2 && entry.weather.level > 2) details.push(`three-card-rule-double-critical:${identity}`);
        if (levels.every((level) => level >= 7) && entry.weather.level < 8) details.push(`three-card-rule-all-favorable:${identity}`);
        if (levels.every((level) => level <= 4) && entry.weather.level > 3) details.push(`three-card-rule-all-difficult:${identity}`);
        if (levels[0] <= 3 && levels[2] >= 7 && (entry.weather.level < 6 || entry.weather.level > 7)) {
            details.push(`three-card-rule-recovery:${identity}`);
        }
    });

    if (details.length) errors.push(`${details.length} detailed validation failures found`);
    if (errors.length) {
        console.error('[tarot-audit] FAILED');
        errors.forEach((error) => console.error(`- ${error}`));
        missingSource.slice(0, 20).forEach((entry) => console.error(`missing:${entry.topicId}:${entry.loc}:${entry.orientation}`));
        duplicateSource.slice(0, 20).forEach(([first, second]) => console.error(`duplicate-source:${first} == ${second}`));
        duplicateStaff.slice(0, 20).forEach(([first, second]) => console.error(`duplicate-staff:${first} == ${second}`));
        duplicateLine.slice(0, 20).forEach(([first, second]) => console.error(`duplicate-line:${first} == ${second}`));
        coverageGaps.slice(0, 20).forEach((entry) => console.error(entry));
        details.slice(0, 40).forEach((entry) => console.error(entry));
        process.exit(1);
    }

    const levels = [...new Set(tables.allCards.flatMap((card) => ORIENTATIONS.map((orientation) => tables.getWeatherStatus(card, orientation).level)))].sort((a, b) => a - b);
    console.log(`[tarot-audit] OK source:${sourceReadings.length} single:${generated.length} triple:${generatedThreeCard.length} topics:${actualTopics} levels:${levels.join(',')} unique:${uniquePoints}/${uniqueActions}/${uniqueCautions}`);
}

main();
