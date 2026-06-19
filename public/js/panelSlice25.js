const DECORATED_PANEL_CONFIG = new Map([
    ['panel-blue-gold.png', {}],
    ['panel-blue-large.png', {}],
    ['panel-dark.png', {}],
    ['panel-dark-gold.png', {}],
    ['panel-dark-silver.png', {}],
    ['panel-dark-wide.png', {}],
    ['panel-navy-wide.png', {}],
    ['panel-parchment.png', {}],
    ['panel-parchment-large.png', {}],
    ['panel-parchment-scroll-wide.png', {}],
    ['panel-parchment-wide.png', {}],
    ['panel-plank-wide.png', {}],
    ['panel-sheet-frame.png', {}],
    ['panel-wood.png', {}],
    ['panel-wood-large.png', {}],
    ['panel-wood-wide.png', {}]
]);

const imageCache = new Map();
const observedTargets = new WeakSet();
const renderState = new WeakMap();
const AUTO_SKIP_SELECTOR = [
    'button',
    'input',
    'select',
    'textarea',
    'option',
    'img',
    'canvas',
    'svg',
    'video',
    'audio',
    '.currency-display',
    '.global-rank-badge',
    '.nav-button',
    '.ranking-toggle-btn',
    '.ranking-refresh-btn',
    '.inventory-mobile-switch-btn',
    '.inventory-primary-tab-btn',
    '.inventory-tab-btn',
    '.troy-state-badge',
    '.king-troy-status',
    '.companion-status',
    '.companion-host-note'
].join(',');

let resizeObserver = null;
let mutationObserver = null;
let scanScheduled = false;

function extractCssUrl(value) {
    const text = String(value || '').trim();
    if (!text || text === 'none') return '';
    const match = text.match(/^url\(["']?(.*?)["']?\)$/i);
    return match ? match[1] : '';
}

function getFileName(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.pathname.split('/').pop() || '';
    } catch {
        return String(url || '').split(/[\\/]/).pop() || '';
    }
}

function isExplicitPanelSliceTarget(element) {
    return element?.dataset?.panelSlice === '25' || element?.dataset?.panelSlice === '15';
}

function hasClippingOverflow(style) {
    return style.overflowX !== 'visible' || style.overflowY !== 'visible';
}

function isPanelSlice25Target(element, style) {
    if (!(element instanceof Element)) return false;
    if (isExplicitPanelSliceTarget(element)) return true;
    if (element.dataset.panelSlice === 'off') return false;
    if (element.matches(AUTO_SKIP_SELECTOR)) return false;
    if (hasClippingOverflow(style)) return false;
    return false;
}

function expandSides(values, fallback = 0) {
    const list = values.length ? values : [fallback];
    const top = Number(list[0] ?? fallback) || fallback;
    const right = Number(list[1] ?? top) || top;
    const bottom = Number(list[2] ?? top) || top;
    const left = Number(list[3] ?? right) || right;
    return { top, right, bottom, left };
}

function parseBorderImageSlice(value, fallback) {
    const values = String(value || '')
        .split(/\s+/)
        .filter((part) => part && part !== 'fill')
        .map((part) => Number.parseFloat(part))
        .filter(Number.isFinite)
        .slice(0, 4);
    return expandSides(values, fallback);
}

function getCssBorderWidths(style) {
    return {
        top: Number.parseFloat(style.borderTopWidth) || 0,
        right: Number.parseFloat(style.borderRightWidth) || 0,
        bottom: Number.parseFloat(style.borderBottomWidth) || 0,
        left: Number.parseFloat(style.borderLeftWidth) || 0
    };
}

function parseBorderWidths(style, borderImageWidthValue = style.borderImageWidth) {
    const borderWidths = getCssBorderWidths(style);
    const tokens = String(borderImageWidthValue || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4);
    if (!tokens.length) return borderWidths;
    const expanded = [tokens[0], tokens[1] || tokens[0], tokens[2] || tokens[0], tokens[3] || tokens[1] || tokens[0]];
    const keys = ['top', 'right', 'bottom', 'left'];
    const out = { ...borderWidths };
    expanded.forEach((token, index) => {
        const key = keys[index];
        if (!token || token === 'auto') return;
        if (token.endsWith('px')) {
            const px = Number.parseFloat(token);
            if (Number.isFinite(px)) out[key] = px;
            return;
        }
        const multiplier = Number.parseFloat(token);
        if (Number.isFinite(multiplier)) out[key] = borderWidths[key] * multiplier;
    });
    return out;
}

function loadImage(url) {
    if (imageCache.has(url)) return imageCache.get(url);
    const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
    });
    imageCache.set(url, promise);
    return promise;
}

function getCenterSize(total, axis, configValue) {
    const explicit = Number(configValue);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const max = axis === 'x' ? 64 : 48;
    return Math.round(Math.min(max, Math.max(22, total * 0.12)));
}

function makeCuts(total, start, end, center) {
    const size = Math.max(0, total);
    const safeStart = Math.min(Math.max(0, start), size / 2);
    const safeEnd = Math.min(Math.max(0, end), Math.max(0, size - safeStart));
    const middleAvailable = Math.max(0, size - safeStart - safeEnd);
    const centerSize = Math.min(Math.max(0, center), middleAvailable);
    const centerStart = safeStart + Math.max(0, (middleAvailable - centerSize) / 2);
    const centerEnd = centerStart + centerSize;
    return [0, safeStart, centerStart, centerEnd, size - safeEnd, size];
}

function makeThreeCuts(total, start, end) {
    const size = Math.max(0, total);
    const safeStart = Math.min(Math.max(0, start), size / 2);
    const safeEnd = Math.min(Math.max(0, end), Math.max(0, size - safeStart));
    return [0, safeStart, size - safeEnd, size];
}

function makeAxisCuts(total, start, end, center, segments) {
    return segments === 3
        ? makeThreeCuts(total, start, end)
        : makeCuts(total, start, end, center);
}

function getScale(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return 1;
    return a / b;
}

function getConfigForSource(url) {
    const fileName = getFileName(url);
    return DECORATED_PANEL_CONFIG.get(fileName) || {};
}

function getConfigForElement(element, sourceUrl) {
    const base = getConfigForSource(sourceUrl);
    const explicit = {};
    if (element?.dataset?.panelSlice === '15') {
        explicit.cols = 5;
        explicit.rows = 3;
    }
    if (element?.dataset?.panelSlice === '25') {
        explicit.cols = 5;
        explicit.rows = 5;
    }
    return { ...base, ...explicit };
}

function normalizeSliceSegments(value, fallback) {
    const count = Math.floor(Number(value) || fallback);
    return count === 3 ? 3 : 5;
}

function captureRenderOptions(style) {
    return {
        sliceText: style.borderImageSlice,
        widthText: style.borderImageWidth
    };
}

function buildCell(layer, sourceUrl, naturalWidth, naturalHeight, sourceRect, destRect, row, col) {
    const [sx, sy, sw, sh] = sourceRect;
    const [dx, dy, dw, dh] = destRect;
    if (dw <= 0 || dh <= 0) return;
    const cell = document.createElement('span');
    cell.className = 'panel-slice-25-cell';
    cell.dataset.sliceRow = String(row);
    cell.dataset.sliceCol = String(col);
    Object.assign(cell.style, {
        left: `${dx}px`,
        top: `${dy}px`,
        width: `${dw}px`,
        height: `${dh}px`
    });
    if (sourceUrl && sw > 0 && sh > 0) {
        const scaleX = dw / sw;
        const scaleY = dh / sh;
        Object.assign(cell.style, {
            backgroundImage: `url("${sourceUrl}")`,
            backgroundSize: `${naturalWidth * scaleX}px ${naturalHeight * scaleY}px`,
            backgroundPosition: `${-sx * scaleX}px ${-sy * scaleY}px`
        });
    }
    layer.appendChild(cell);
}

function buildFill(layer, sourceUrl, naturalWidth, naturalHeight, sourceRect, destRect) {
    const [sx, sy, sw, sh] = sourceRect;
    const [dx, dy, dw, dh] = destRect;
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    const scaleX = dw / sw;
    const scaleY = dh / sh;
    const fill = document.createElement('span');
    fill.className = 'panel-slice-25-fill';
    Object.assign(fill.style, {
        left: `${dx}px`,
        top: `${dy}px`,
        width: `${dw}px`,
        height: `${dh}px`,
        backgroundImage: `url("${sourceUrl}")`,
        backgroundSize: `${naturalWidth * scaleX}px ${naturalHeight * scaleY}px`,
        backgroundPosition: `${-sx * scaleX}px ${-sy * scaleY}px`
    });
    layer.appendChild(fill);
}

function renderPanelSlice25(element, image, sourceUrl, style, options = captureRenderOptions(style)) {
    const rect = element.getBoundingClientRect();
    const config = getConfigForElement(element, sourceUrl);
    const cols = normalizeSliceSegments(config.cols, 5);
    const rows = normalizeSliceSegments(config.rows, 5);
    const fallbackSlice = Math.round(Math.min(image.naturalWidth, image.naturalHeight) * 0.12);
    const sourceSlices = parseBorderImageSlice(options.sliceText, fallbackSlice);
    const borderWidths = parseBorderWidths(style, options.widthText);
    const cssBorderWidths = getCssBorderWidths(style);
    const width = Math.round(Math.max(
        0,
        rect.width - cssBorderWidths.left - cssBorderWidths.right + borderWidths.left + borderWidths.right
    ));
    const height = Math.round(Math.max(
        0,
        rect.height - cssBorderWidths.top - cssBorderWidths.bottom + borderWidths.top + borderWidths.bottom
    ));
    if (width <= 0 || height <= 0) return;

    const centerSourceWidth = cols === 5 ? getCenterSize(image.naturalWidth, 'x', element.dataset.panelSliceCenterX || config.centerX) : 0;
    const centerSourceHeight = rows === 5 ? getCenterSize(image.naturalHeight, 'y', element.dataset.panelSliceCenterY || config.centerY) : 0;
    const centerDestWidth = cols === 5 ? centerSourceWidth * Math.min(
        getScale(borderWidths.left, sourceSlices.left),
        getScale(borderWidths.right, sourceSlices.right)
    ) : 0;
    const centerDestHeight = rows === 5 ? centerSourceHeight * Math.min(
        getScale(borderWidths.top, sourceSlices.top),
        getScale(borderWidths.bottom, sourceSlices.bottom)
    ) : 0;

    const sourceX = makeAxisCuts(image.naturalWidth, sourceSlices.left, sourceSlices.right, centerSourceWidth, cols);
    const sourceY = makeAxisCuts(image.naturalHeight, sourceSlices.top, sourceSlices.bottom, centerSourceHeight, rows);
    const destX = makeAxisCuts(width, borderWidths.left, borderWidths.right, centerDestWidth, cols);
    const destY = makeAxisCuts(height, borderWidths.top, borderWidths.bottom, centerDestHeight, rows);

    element.style.setProperty('--panel-slice-25-border-top', `${borderWidths.top}px`);
    element.style.setProperty('--panel-slice-25-border-right', `${borderWidths.right}px`);
    element.style.setProperty('--panel-slice-25-border-bottom', `${borderWidths.bottom}px`);
    element.style.setProperty('--panel-slice-25-border-left', `${borderWidths.left}px`);
    element.classList.add('panel-slice-25-host');

    let layer = element.querySelector(':scope > .panel-slice-25-layer');
    if (!layer) {
        layer = document.createElement('span');
        layer.className = 'panel-slice-25-layer';
        layer.setAttribute('aria-hidden', 'true');
        element.prepend(layer);
    }
    layer.textContent = '';
    layer.dataset.source = getFileName(sourceUrl);
    layer.dataset.sliceGrid = `${cols}x${rows}`;

    buildFill(
        layer,
        sourceUrl,
        image.naturalWidth,
        image.naturalHeight,
        [sourceX[1], sourceY[1], sourceX[cols - 1] - sourceX[1], sourceY[rows - 1] - sourceY[1]],
        [destX[1], destY[1], destX[cols - 1] - destX[1], destY[rows - 1] - destY[1]]
    );

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const isInnerFillArea = row > 0 && row < rows - 1 && col > 0 && col < cols - 1;
            buildCell(
                layer,
                isInnerFillArea ? '' : sourceUrl,
                image.naturalWidth,
                image.naturalHeight,
                [sourceX[col], sourceY[row], sourceX[col + 1] - sourceX[col], sourceY[row + 1] - sourceY[row]],
                [destX[col], destY[row], destX[col + 1] - destX[col], destY[row + 1] - destY[row]],
                row,
                col
            );
        }
    }
    renderState.set(element, { width, height, sourceUrl, options });
}

function upgradeElement(element) {
    if (!(element instanceof Element)) return;
    const style = window.getComputedStyle(element);
    if (!isPanelSlice25Target(element, style)) return;
    const sourceUrl = extractCssUrl(style.borderImageSource);
    if (!sourceUrl) return;
    const options = captureRenderOptions(style);
    if (!observedTargets.has(element) && resizeObserver) {
        resizeObserver.observe(element);
        observedTargets.add(element);
    }
    loadImage(sourceUrl)
        .then((image) => {
            const latestStyle = window.getComputedStyle(element);
            renderPanelSlice25(element, image, sourceUrl, latestStyle, options);
        })
        .catch(() => {});
}

function scan(root = document) {
    if (root instanceof Element) upgradeElement(root);
    const scope = root instanceof Element || root instanceof Document ? root : document;
    scope.querySelectorAll?.('*').forEach(upgradeElement);
}

function scheduleScan(root = document) {
    if (scanScheduled) return;
    scanScheduled = true;
    window.requestAnimationFrame(() => {
        scanScheduled = false;
        scan(root);
    });
}

function rerenderElement(element) {
    const state = renderState.get(element);
    if (!state?.sourceUrl) {
        upgradeElement(element);
        return;
    }
    const style = window.getComputedStyle(element);
    loadImage(state.sourceUrl)
        .then((image) => renderPanelSlice25(element, image, state.sourceUrl, style, state.options))
        .catch(() => {});
}

function restoreMissingLayer(element) {
    if (!(element instanceof Element)) return false;
    if (!element.classList.contains('panel-slice-25-host')) return false;
    if (element.querySelector(':scope > .panel-slice-25-layer')) return false;
    const state = renderState.get(element);
    if (!state?.sourceUrl) return false;
    rerenderElement(element);
    return true;
}

export function installPanelSlice25(root = document) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!resizeObserver && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => rerenderElement(entry.target));
        });
    }
    if (!mutationObserver && document.body) {
        mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.target instanceof Element) {
                    restoreMissingLayer(mutation.target);
                }
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof Element) scheduleScan(node);
                });
            }
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => scheduleScan(root), { once: true });
    } else {
        scheduleScan(root);
    }
}
