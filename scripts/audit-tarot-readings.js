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
const MAJOR_KEYS = Array.from({ length: 22 }, (_, index) => String(index));
const SUITS = ['wand', 'cup', 'sword', 'pentacle'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'page', 'knight', 'queen', 'king'];
const ORIENTATIONS = ['upright', 'reversed'];
const RED_FLAGS = {
    love: ['仕事', '職場', '業務', '事業', '会社', '売上', '利益', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '人間関係', 'コミュニティ', 'グループ', '人脈'],
    work: ['恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談', 'ワンナイト'],
    relation: ['売上', '案件', '取引先', 'クライアント', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '恋愛', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談'],
    future: ['恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談', '売上', '取引先', 'クライアント', '納期', '監査']
};

function loadTables() {
    const code = fs.readFileSync(SOURCE_PATH, 'utf8');
    const context = {
        window: {
            addEventListener() {},
            matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
        },
        document: {
            addEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({})
        },
        console,
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
  FUTURE_MINOR_READINGS
};`, context);
    return context.__tarotAudit;
}

function pushReading(readings, topicId, loc, orientation, text) {
    readings.push({
        topicId,
        loc,
        orientation,
        text: String(text || '').trim()
    });
}

function collectReadings(tables) {
    const readings = [];
    Object.entries(TOPIC_TABLES).forEach(([topicId, [majorName, minorName]]) => {
        const major = tables[majorName] || {};
        const minor = tables[minorName] || {};
        MAJOR_KEYS.forEach((number) => {
            ORIENTATIONS.forEach((orientation) => {
                pushReading(readings, topicId, `major_${number.padStart(2, '0')}`, orientation, major[number]?.[orientation]);
            });
        });
        SUITS.forEach((suit) => {
            RANKS.forEach((rank) => {
                ORIENTATIONS.forEach((orientation) => {
                    pushReading(readings, topicId, `${suit}_${rank}`, orientation, minor[suit]?.[rank]?.[orientation]);
                });
            });
        });
    });
    return readings;
}

function main() {
    const readings = collectReadings(loadTables());
    const missing = readings.filter((entry) => !entry.text);
    const duplicates = [];
    const seen = new Map();
    const flagged = [];

    readings.forEach((entry) => {
        if (!entry.text) return;
        const duplicateOf = seen.get(entry.text);
        if (duplicateOf) {
            duplicates.push([duplicateOf, `${entry.topicId}:${entry.loc}:${entry.orientation}`]);
        } else {
            seen.set(entry.text, `${entry.topicId}:${entry.loc}:${entry.orientation}`);
        }
        const hits = (RED_FLAGS[entry.topicId] || []).filter((word) => entry.text.includes(word));
        if (hits.length) {
            flagged.push({ ...entry, hits });
        }
    });

    const summary = readings.reduce((acc, entry) => {
        acc[entry.topicId] = (acc[entry.topicId] || 0) + 1;
        return acc;
    }, {});
    const errors = [];
    Object.entries(summary).forEach(([topicId, count]) => {
        if (count !== 156) errors.push(`${topicId} has ${count} readings, expected 156`);
    });
    if (missing.length) errors.push(`${missing.length} readings are missing`);
    if (duplicates.length) errors.push(`${duplicates.length} duplicate readings found`);
    if (flagged.length) errors.push(`${flagged.length} category red-flag readings found`);

    if (errors.length) {
        console.error('[tarot-audit] FAILED');
        errors.forEach((error) => console.error(`- ${error}`));
        missing.slice(0, 20).forEach((entry) => console.error(`missing: ${entry.topicId}:${entry.loc}:${entry.orientation}`));
        duplicates.slice(0, 20).forEach(([first, second]) => console.error(`duplicate: ${first} == ${second}`));
        flagged.slice(0, 20).forEach((entry) => console.error(`red-flag: ${entry.topicId}:${entry.loc}:${entry.orientation} [${entry.hits.join(', ')}]`));
        process.exit(1);
    }

    console.log(`[tarot-audit] OK ${Object.entries(summary).map(([topicId, count]) => `${topicId}:${count}`).join(' ')}`);
}

main();
