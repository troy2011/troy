function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function formatNumber(value) {
    return Math.max(0, Math.floor(Number(value || 0) || 0)).toLocaleString('ja-JP');
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function getInventoryItemLabel(item) {
    return String(item?.name || item?.customData?.DisplayName || item?.customData?.Title || item?.itemId || '').trim();
}

export function getInventoryItemImagePath(item) {
    const customData = item?.customData || {};
    return String(
        item?.imagePath
        || item?.image_path
        || item?.ImagePath
        || item?.spritePath
        || item?.sprite_path
        || item?.SpritePath
        || customData.imagePath
        || customData.image_path
        || customData.ImagePath
        || customData.MenuImagePath
        || customData.SpritePath
        || customData.spritePath
        || customData.sprite_path
        || ''
    ).trim();
}

export function getWarehouseItemLabel(item) {
    return String(item?.name || item?.itemName || item?.displayName || item?.itemId || '').trim() || 'アイテム';
}

export function getWarehouseItemImagePath(item) {
    return String(item?.imagePath || item?.image_path || item?.ImagePath || item?.spritePath || item?.sprite_path || item?.SpritePath || '').trim();
}

export function formatWarehouseSummary(treasury, itemCount) {
    return `資金 ${formatNumber(treasury)}G / アイテム ${Math.max(0, Math.floor(Number(itemCount || 0) || 0))}`;
}

export function buildDepositItemOptionsHtml(items) {
    const options = (Array.isArray(items) ? items : [])
        .filter((item) => String(item?.itemId || '').trim() && Number(item?.count || 0) > 0)
        .map((item) => {
            const itemId = String(item.itemId || '').trim();
            const count = Math.max(1, Math.floor(Number(item.count || 1) || 1));
            const instanceId = Array.isArray(item.instances) && item.instances[0] ? String(item.instances[0]) : '';
            const itemName = getInventoryItemLabel(item);
            const imagePath = getInventoryItemImagePath(item);
            const category = String(item?.category || item?.customData?.Category || item?.customData?.category || '').trim();
            const label = `${itemName} x${count}`;
            return `<option value="${escapeHtml(itemId)}" data-instance-id="${escapeHtml(instanceId)}" data-item-name="${escapeHtml(itemName)}" data-image-path="${escapeHtml(imagePath)}" data-category="${escapeHtml(category)}">${escapeHtml(label)}</option>`;
        });
    return {
        html: options.length ? options.join('') : '<option value="">預けられる持ち物がありません</option>',
        hasItems: options.length > 0
    };
}

export function buildWarehouseItemCardHtml(item, index) {
    const imagePath = getWarehouseItemImagePath(item);
    const thumbnailHtml = imagePath
        ? `<span class="crew-warehouse-thumb" aria-hidden="true"><img src="${escapeHtml(imagePath)}" alt=""></span>`
        : '';
    return `
        <article class="event-card crew-warehouse-item-card">
            <div class="event-card-head">
                <div class="crew-warehouse-title-row">
                    ${thumbnailHtml}
                    <div>
                        <div class="event-card-type">共有アイテム</div>
                        <h3>${escapeHtml(getWarehouseItemLabel(item))}</h3>
                    </div>
                </div>
                <span class="event-status">倉庫</span>
            </div>
            <div class="event-card-meta">
                <span>${escapeHtml(String(item?.itemId || ''))}</span>
                ${item?.donatedAt ? `<span>${escapeHtml(formatDateTime(item.donatedAt))}</span>` : ''}
            </div>
            <div class="event-card-actions">
                <button class="event-action-btn is-join js-withdraw-guild-item" type="button" data-warehouse-index="${index}">引き出す</button>
            </div>
        </article>
    `;
}
