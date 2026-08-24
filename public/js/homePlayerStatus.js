export function getPlayerRankName(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 51) return '海賊王';
    if (value >= 41) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.innerText = value;
}

export function renderHomePlayerStatus(stats = {}, crewRankInfo = null) {
    const {
        Level = 1,
        HP = 0,
        MaxHP = 0,
        ちから = 0,
        みのまもり = 0,
        すばやさ = 0,
        かしこさ = 0,
        たいりょく = 0
    } = stats || {};
    const rankName = crewRankInfo?.crewRankTitle || getPlayerRankName(Level);

    setText('globalLevel', Level);
    setText('globalRankBadge', rankName);
    setText('homeStatStr', ちから);
    setText('homeStatDef', みのまもり);
    setText('homeStatAgi', すばやさ);
    setText('homeStatInt', かしこさ);
    setText('homeStatVit', たいりょく);
    setText('homeStatHp', MaxHP);
    setText('currentStr', ちから);
    setText('currentDef', みのまもり);
    setText('currentAgi', すばやさ);
    setText('currentInt', かしこさ);
    setText('currentVit', たいりょく);
    setText('currentHp', `${HP}/${MaxHP}`);

    return { level: Level, rankName };
}
