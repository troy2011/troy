(() => {
  const effectsLayer = document.getElementById('effects');
  const rankingList = document.getElementById('rankingList');
  const rankingSub = document.getElementById('rankingSub');
  const effectTypes = ['splash', 'boom', 'flare', 'ghost'];

  const ENTRY_SOUNDS = [
    '/audio/order-count-1-missile.mp3',
    '/audio/order-count-2-cannon.mp3',
    '/audio/order-count-3-sniper.mp3',
    '/audio/order-count-4-rocket-launcher.mp3',
    '/audio/order-count-5-plus-battlefield.mp3',
  ];

  let audioUnlocked = false;

  const unlockAudio = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    const gate = document.getElementById('audioGate');
    if (gate) gate.style.display = 'none';
  };

  document.getElementById('audioGate')?.addEventListener('click', unlockAudio);
  document.getElementById('audioGate')?.addEventListener('touchstart', unlockAudio);

  const playSound = (src) => {
    if (!audioUnlocked || !src) return;
    try {
      const audio = new Audio(src);
      audio.volume = 0.85;
      const result = audio.play();
      if (result?.catch) result.catch(() => {});
    } catch (_) {}
  };

  const getEntrySoundSrc = (level) => {
    const rank = Math.floor(Math.max(1, Math.floor(Number(level) || 1)) / 10);
    return ENTRY_SOUNDS[Math.min(rank, ENTRY_SOUNDS.length - 1)];
  };

  let reconnectTimer = null;
  let stream = null;
  let rankingRefreshTimer = null;
  let rankingRequestPromise = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const spawnEffect = (payload = {}) => {
    if (!effectsLayer) return;
    const rawType = String(payload.type || payload.effectType || '').toLowerCase();
    const effectType = effectTypes.includes(rawType)
      ? rawType
      : effectTypes[Math.floor(Math.random() * effectTypes.length)];
    const xRaw = Number(payload.x);
    const yRaw = Number(payload.y);
    const x = Number.isFinite(xRaw) ? clamp(xRaw, 5, 95) : 15 + Math.random() * 70;
    const y = Number.isFinite(yRaw) ? clamp(yRaw, 5, 95) : 15 + Math.random() * 70;

    const effect = document.createElement('div');
    effect.className = `effect ${effectType}`;
    effect.style.left = `${x}%`;
    effect.style.top = `${y}%`;
    effectsLayer.appendChild(effect);

    const label = String(payload.label || '').trim();
    if (label) {
      const text = document.createElement('div');
      text.className = 'effect-label';
      text.textContent = label;
      effect.appendChild(text);
    }

    window.setTimeout(() => {
      effect.remove();
    }, 3200);
  };

  const formatNumber = (value) => {
    const num = Math.max(0, Math.floor(Number(value) || 0));
    return num.toLocaleString('ja-JP');
  };

  const renderRanking = (data) => {
    if (!rankingList) return;
    rankingList.innerHTML = '';
    const ranking = Array.isArray(data?.ranking) ? data.ranking : [];

    if (rankingSub) {
      rankingSub.textContent = 'PlayFab 日次貢献度ランキング';
    }

    if (ranking.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ranking-empty';
      empty.textContent = 'ランキングデータがありません';
      rankingList.appendChild(empty);
      return;
    }

    ranking.slice(0, 10).forEach((row, index) => {
      const line = document.createElement('div');
      line.className = 'ranking-row';

      const rank = document.createElement('div');
      rank.className = 'ranking-rank';
      rank.textContent = `${Number(row?.position) || index + 1}`;

      const name = document.createElement('div');
      name.className = 'ranking-name';
      const medal = index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '';
      name.textContent = `${medal}${row.displayName || row.playFabId || 'Unknown'}`;

      const bounty = document.createElement('div');
      bounty.className = 'ranking-bounty';
      const contribution = Number(row.contribution ?? row.score ?? row.bounty ?? 0) || 0;
      bounty.textContent = `${formatNumber(contribution)} 貢献`;

      line.appendChild(rank);
      line.appendChild(name);
      line.appendChild(bounty);
      rankingList.appendChild(line);
    });
  };

  const fetchRanking = async () => {
    if (rankingRequestPromise) return rankingRequestPromise;
    rankingRequestPromise = (async () => {
      try {
        const res = await fetch('/api/troy-bounty-ranking?limit=10', { cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        renderRanking(data);
      } catch (error) {
        renderRanking({ ranking: [] });
      } finally {
        rankingRequestPromise = null;
      }
    })();
    return rankingRequestPromise;
  };

  const scheduleRankingRefresh = (delayMs = 120) => {
    if (rankingRefreshTimer) {
      window.clearTimeout(rankingRefreshTimer);
      rankingRefreshTimer = null;
    }
    rankingRefreshTimer = window.setTimeout(() => {
      rankingRefreshTimer = null;
      fetchRanking();
    }, Math.max(0, Number(delayMs) || 0));
  };

  const handleEvent = (payload) => {
    if (!payload) return;
    if (payload.type === 'connected') return;
    if (payload.type === 'batch' && Array.isArray(payload.events)) {
      let shouldRefreshRanking = false;
      payload.events.forEach((event) => {
        spawnEffect(event);
        const topic = String(event?.topic || '').toLowerCase();
        if (topic === 'ps-transfer') shouldRefreshRanking = true;
        if (topic === 'troy-entry') playSound(getEntrySoundSrc(event.level));
      });
      if (shouldRefreshRanking) scheduleRankingRefresh(120);
      return;
    }

    spawnEffect(payload);
    const topic = String(payload.topic || '').toLowerCase();
    if (topic === 'troy-entry') playSound(getEntrySoundSrc(payload.level));
    if (topic === 'ps-transfer') scheduleRankingRefresh(120);
  };

  const connectStream = () => {
    if (stream) {
      stream.close();
      stream = null;
    }
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    stream = new EventSource('/api/display-stream');

    stream.addEventListener('message', (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        handleEvent(payload);
      } catch (error) {
        console.warn('[display] failed to parse event', error);
      }
    });

    stream.addEventListener('error', () => {
      if (stream) {
        stream.close();
        stream = null;
      }
      reconnectTimer = window.setTimeout(connectStream, 2500);
    });
  };

  connectStream();
  fetchRanking();
})();
