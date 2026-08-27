(function initTarotKingdomJobMastery(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TarotKingdomJobMastery = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildTarotKingdomJobMastery() {
    'use strict';

    const STATE_VERSION = 1;
    const RULES_VERSION = 1;
    const JOBS = Object.freeze([
        ['トリックスター', 500], ['呪術師', 700], ['白魔道士', 600], ['結界師', 600],
        ['ナイト', 690], ['魔導士', 650], ['吟遊詩人', 500], ['バーサーカー', 700],
        ['モンク', 600], ['アサシン', 700], ['ギャンブラー', 550], ['パラディン', 800],
        ['守護者', 650], ['死霊術師', 750], ['ものまねし', 900], ['暗黒騎士', 850],
        ['魔法剣士', 999], ['ドルイド', 700], ['幻影騎士', 800], ['魔導戦士', 900],
        ['ビショップ', 900], ['勇者', 999]
    ].map(([name, requiredAbp], number) => Object.freeze({ number, name, requiredAbp })));
    const JOB_BY_NUMBER = new Map(JOBS.map((job) => [job.number, job]));

    function getJob(number) {
        const safeNumber = Math.floor(Number(number));
        return JOB_BY_NUMBER.get(safeNumber) || null;
    }

    function getRequiredAbp(number) {
        return getJob(number)?.requiredAbp || 0;
    }

    function getJobName(number) {
        return getJob(number)?.name || '';
    }

    function clampAbp(value, requiredAbp) {
        const safeRequired = Math.max(0, Math.floor(Number(requiredAbp) || 0));
        return Math.max(0, Math.min(safeRequired, Math.floor(Number(value) || 0)));
    }

    return Object.freeze({
        STATE_VERSION,
        RULES_VERSION,
        JOBS,
        getJob,
        getRequiredAbp,
        getJobName,
        clampAbp
    });
}));
