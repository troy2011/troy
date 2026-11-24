import { Music } from '/tabletop-v65/js/kingdomTable/music.js?v=home-title-v1';
import { bindMusicSession } from '/tabletop-v65/js/kingdomTable/musicSession.js?v=home-title-v1';

const wrapper = document.getElementById('appWrapper');
const games = document.getElementById('tarotGameSelectRoot');
const tavern = document.getElementById('tabContentTarot');

function syncScene() {
    const tab = document.body.dataset.currentTab || 'home';
    const selection = tab === 'tarot' && tavern?.style.display !== 'none' && games && !games.hidden && games.style.display !== 'none';
    Music.scene(wrapper?.style.display !== 'none' && (tab === 'home' || selection) ? 'title' : null);
}
const sceneObserver = new MutationObserver(syncScene);
sceneObserver.observe(document.body, { attributes: true, attributeFilter: ['data-current-tab'] });
for (const element of [wrapper, games, tavern]) if (element) {
    sceneObserver.observe(element, { attributes: true, attributeFilter: ['style', 'hidden'] });
}
bindMusicSession({ player: Music, checkbox: document.getElementById('troyHomeBgm'), syncScene });
