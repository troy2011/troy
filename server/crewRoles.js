const CREW_ROLE_DEFS = [
    {
        id: 'swordsman',
        label: '剣士',
        gameLabel: 'ビリヤード',
        iconKey: 'billiards',
        rankTitles: ['押しかけ剣士', '突撃兵', '剣士', '剣豪', '剣聖']
    },
    {
        id: 'sniper',
        label: '狙撃手',
        gameLabel: 'ダーツ',
        iconKey: 'darts',
        rankTitles: ['弾薬運び', '砲手', '狙撃手', '一等狙撃手', '銃神']
    },
    {
        id: 'cook',
        label: 'コック',
        gameLabel: 'ギャンブラー',
        iconKey: 'fish',
        rankTitles: ['皿洗い', '賄い番', 'コック', '料理長', '食の覇王']
    },
    {
        id: 'doctor',
        label: '船医',
        gameLabel: 'サポート',
        iconKey: 'drink',
        rankTitles: ['包帯巻き', '薬局生', '船医', '大船医', '神医']
    },
    {
        id: 'shipwright',
        label: '船大工',
        gameLabel: '卓球',
        iconKey: 'game',
        rankTitles: ['木屑拾い', '職人補佐', '船大工', '棟梁', '伝説の造船師']
    },
    {
        id: 'musician',
        label: '音楽家',
        gameLabel: 'カラオケ',
        iconKey: 'karaoke',
        rankTitles: ['賑やかし', '楽士', '音楽家', '楽長', '楽聖']
    },
    {
        id: 'archaeologist',
        label: '考古学者',
        gameLabel: 'ポーカー',
        iconKey: 'poker',
        rankTitles: ['書生', '研究員', '考古学者', '賢者', '大賢者']
    }
];

const CREW_ROLE_BY_ID = Object.fromEntries(CREW_ROLE_DEFS.map((role) => [role.id, role]));
const CREW_RANK_DECORATIONS = ['crew-rank-1', 'crew-rank-2', 'crew-rank-3', 'crew-rank-4', 'crew-rank-5'];

function normalizeCrewRoleId(value) {
    const id = String(value || '').trim().toLowerCase();
    return CREW_ROLE_BY_ID[id] ? id : '';
}

function getCrewRankLevel(playerLevel) {
    const level = Math.max(1, Math.floor(Number(playerLevel) || 1));
    return Math.max(1, Math.min(5, Math.floor((level - 1) / 10) + 1));
}

function getCrewRankTitle(roleId, playerLevel) {
    const role = CREW_ROLE_BY_ID[normalizeCrewRoleId(roleId)];
    if (!role) return '';
    const rankLevel = getCrewRankLevel(playerLevel);
    return role.rankTitles[rankLevel - 1] || role.label;
}

function getCrewRankDecorationClass(playerLevel) {
    const rankLevel = getCrewRankLevel(playerLevel);
    return CREW_RANK_DECORATIONS[rankLevel - 1] || CREW_RANK_DECORATIONS[0];
}

module.exports = {
    CREW_ROLE_DEFS,
    CREW_ROLE_BY_ID,
    CREW_RANK_DECORATIONS,
    normalizeCrewRoleId,
    getCrewRankLevel,
    getCrewRankTitle,
    getCrewRankDecorationClass
};
