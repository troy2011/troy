import { getNationAnnouncements } from './playfabClient.js?v=20260825-playfab-read-coalescing-v1';

let resizeBound = false;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[match]);
}

function updateMarquees() {
    document.querySelectorAll('.home-announcement-message').forEach((messageEl) => {
        const textEl = messageEl.querySelector('.home-announcement-marquee-text');
        messageEl.classList.remove('is-marquee');
        messageEl.style.removeProperty('--home-announcement-marquee-duration');
        messageEl.style.removeProperty('--home-announcement-marquee-start');
        messageEl.style.removeProperty('--home-announcement-marquee-end');
        if (!textEl) return;

        const messageText = String(textEl.textContent || '').trim();
        const overflow = textEl.scrollWidth > messageEl.clientWidth + 2;
        const longText = messageText.length > 20;
        if (!overflow && !longText) return;

        const textWidth = Math.max(textEl.scrollWidth, messageText.length * 13);
        const viewportWidth = Math.max(messageEl.clientWidth, 1);
        const distance = textWidth + viewportWidth;
        const durationSeconds = Math.max(18, Math.min(60, Math.round(distance / 18)));
        const delaySeconds = Math.max(3, Math.min(8, Math.round(messageEl.clientWidth / 28)));
        messageEl.style.setProperty('--home-announcement-marquee-duration', `${durationSeconds}s`);
        messageEl.style.setProperty('--home-announcement-marquee-start', `${viewportWidth}px`);
        messageEl.style.setProperty('--home-announcement-marquee-end', `-${textWidth}px`);
        messageEl.style.setProperty('--home-announcement-marquee-delay', `-${delaySeconds}s`);
        messageEl.classList.add('is-marquee');
    });
}

function scheduleMarqueeUpdate() {
    requestAnimationFrame(() => requestAnimationFrame(updateMarquees));
    if (resizeBound) return;
    resizeBound = true;
    window.addEventListener('resize', () => {
        requestAnimationFrame(updateMarquees);
    }, { passive: true });
}

export function renderHomeAnnouncements(announcements) {
    const panel = document.getElementById('homeAnnouncementPanel');
    const list = document.getElementById('homeAnnouncementList');
    if (!panel || !list) return;

    const entries = Array.isArray(announcements)
        ? announcements.filter((entry) => String(entry?.message || '').trim()).slice(0, 1)
        : [];
    panel.hidden = entries.length === 0;
    if (entries.length === 0) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = entries.map((entry) => `
        <article class="home-announcement-item">
            <div class="home-announcement-message">
                <span class="home-announcement-marquee-text">${escapeHtml(String(entry.message || ''))}</span>
            </div>
        </article>
    `).join('');
    scheduleMarqueeUpdate();
}

export async function loadHomeAnnouncements(playFabId) {
    if (!playFabId) {
        renderHomeAnnouncements([]);
        return;
    }
    try {
        const data = await getNationAnnouncements(playFabId, { isSilent: true });
        renderHomeAnnouncements(data?.announcements || []);
    } catch (error) {
        console.warn('[home] Failed to load nation announcements:', error);
        renderHomeAnnouncements([]);
    }
}
