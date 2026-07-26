export function getPlayerRankName(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 51) return '海賊王';
    if (value >= 41) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
}

function getPlayerRankBenefitItems(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    const sizeUpOnce = {
        label: '1杯サイズUP',
        title: '入店中、対象ドリンクを1杯だけ大きいサイズにできます'
    };
    const sizeUpUnlimited = {
        label: 'サイズUP無制限',
        title: '入店中、対象ドリンクを何杯でもサイズアップできます'
    };
    if (value >= 51) {
        return [
            sizeUpUnlimited,
            { label: '店内ゲーム遊び放題', title: '入店中、対象の店内ゲームを自由に遊べます' }
        ];
    }
    if (value >= 41) return [sizeUpUnlimited];
    if (value >= 21) {
        return [
            sizeUpOnce,
            { label: '専用海賊ジョッキ', title: '店内で専用の海賊ジョッキを使えます' }
        ];
    }
    if (value >= 11) {
        return [
            sizeUpOnce,
            { label: '階級表示', title: '入店時の表示に階級が出ます' }
        ];
    }
    return [{ label: '通常サービス', title: '通常の店内サービスです' }];
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.innerText = value;
}

function renderHomeRankBenefits(element, level, crewRoleLabel) {
    if (!element) return;
    const items = [];
    const roleLabel = String(crewRoleLabel || '').trim();
    if (roleLabel) {
        items.push({
            label: roleLabel,
            title: `海賊団の役職: ${roleLabel}`,
            className: 'is-role'
        });
    }
    items.push(...getPlayerRankBenefitItems(level));

    element.replaceChildren();
    element.setAttribute('aria-label', items.map((item) => item.title || item.label).join('、'));
    items.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = `home-rank-benefit-chip ${item.className || ''}`.trim();
        chip.textContent = item.label;
        chip.title = item.title || item.label;
        chip.setAttribute('aria-label', item.title || item.label);
        element.appendChild(chip);
    });
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
    renderHomeRankBenefits(document.getElementById('homeRankBenefit'), Level, crewRankInfo?.crewRoleLabel);
    setText('homeStatStr', ちから);
    setText('homeStatDef', みのまもり);
    setText('homeStatAgi', すばやさ);
    setText('homeStatInt', かしこさ);
    setText('homeStatVit', たいりょく);
    setText('homeStatHp', `${HP}/${MaxHP}`);
    setText('currentStr', ちから);
    setText('currentDef', みのまもり);
    setText('currentAgi', すばやさ);
    setText('currentInt', かしこさ);
    setText('currentVit', たいりょく);
    setText('currentHp', `${HP}/${MaxHP}`);

    return { level: Level, rankName };
}
