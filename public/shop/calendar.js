const statusMessage = document.getElementById('shop-calendar-status');
const today = document.getElementById('shop-calendar-today');
const todayLabel = document.getElementById('shop-calendar-today-label');
const todayHelm = document.getElementById('shop-calendar-today-helm');
const upcoming = document.getElementById('shop-calendar-days');
const calendarLabels = document.getElementById('shop-calendar-labels');
const more = document.getElementById('shop-calendar-more');
const later = document.getElementById('shop-calendar-later');
const visibleDays = 7;
const jstDate = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo'
});
const formatDate = new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo'
});

function makeRow({ date, status, openTime, closeTime, publicHelmName }) {
    const label = { open: '出航', closed: '休航', private: '貸切', tentative: '仮予定' }[status];
    const day = new Date(`${date}T00:00:00+09:00`);
    if (typeof label !== 'string' || !Number.isFinite(day.getTime())) return null;
    const row = document.createElement('div');
    const heading = document.createElement('dt');
    const time = document.createElement('time');
    time.dateTime = date;
    time.textContent = formatDate.format(day);
    const details = document.createElement('dd');
    const hours = document.createElement('span');
    hours.className = 'home-calendar-time';
    if (status === 'open' || status === 'tentative') {
        hours.textContent = openTime && closeTime ? `${openTime}–${closeTime}` : '出航時間未定';
        if (openTime && closeTime) hours.setAttribute('aria-label', `出航 ${openTime}、閉店 ${closeTime}`);
    }
    const state = document.createElement('span');
    state.className = `home-calendar-state is-${status}`;
    state.textContent = label;
    if (status === 'open' && typeof publicHelmName === 'string' && publicHelmName) {
        const helm = document.createElement('small');
        helm.className = 'home-calendar-helm';
        helm.textContent = `舵取り：${publicHelmName}`;
        state.append(helm);
    }
    details.append(hours, state);
    heading.append(time);
    row.append(heading, details);
    return row;
}

function renderToday(entry) {
    const { status, openTime, publicHelmName } = entry ?? {};
    let label = '本日の営業は未掲載';
    if (status === 'open') label = openTime ? '本日 ' + openTime + ' 出航' : '本日出航（時間未定）';
    if (status === 'closed') label = '本日休航';
    if (status === 'private') label = '本日貸切';
    if (status === 'tentative') label = openTime ? '本日 ' + openTime + ' 出航予定（仮）' : '本日は仮予定';
    const helm = status === 'open' && typeof publicHelmName === 'string' ? publicHelmName.trim() : '';
    todayLabel.textContent = label;
    todayHelm.textContent = helm ? '本日の舵取り：' + helm : '';
    todayHelm.hidden = !helm;
    today.hidden = false;
}

let loading = false;
async function loadCalendar() {
    if (loading) return;
    loading = true;
    try {
        const response = await fetch('/api/troy-calendar/public', {
            credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12_000)
        });
        if (!response.ok) throw new Error('Calendar unavailable');
        const { calendar } = await response.json();
        const date = jstDate.format(new Date());
        renderToday(calendar.find((entry) => entry.date === date));
        const rows = calendar.filter((entry) => entry.date > date).map(makeRow).filter(Boolean);
        upcoming.replaceChildren(...rows.slice(0, visibleDays));
        later.replaceChildren(...rows.slice(visibleDays));
        more.hidden = rows.length <= visibleDays;
        calendarLabels.hidden = rows.length === 0;
        statusMessage.textContent = rows.length ? '' : '今後の航海予定はまだ掲載されていません。';
        statusMessage.hidden = rows.length > 0;
    } catch {
        today.hidden = true;
        upcoming.replaceChildren();
        later.replaceChildren();
        more.hidden = true;
        calendarLabels.hidden = true;
        const phone = document.createElement('a');
        phone.href = 'tel:09047120670';
        phone.textContent = 'お電話で営業を確認';
        statusMessage.replaceChildren('航海予定を読み込めませんでした。', phone);
        statusMessage.hidden = false;
    } finally {
        loading = false;
    }
}

statusMessage.textContent = '航海予定を読み込んでいます。';
statusMessage.hidden = false;
void loadCalendar();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadCalendar();
});
window.addEventListener('pageshow', (event) => {
    if (event.persisted) void loadCalendar();
});
