(() => {
  const effectsLayer = document.getElementById('effects');
  const rankingList = document.getElementById('rankingList');
  const rankingSub = document.getElementById('rankingSub');
  const sea = document.getElementById('sea');
  const seaVideo = document.getElementById('seaVideo');
  const audioGate = document.getElementById('audioGate');
  const unlockAudioBtn = document.getElementById('btnUnlockAudio');
  const testSoundBtn = document.getElementById('btnTestSound');
  const fullscreenBtn = document.getElementById('btnFullscreen');
  const effectTypes = ['splash', 'boom', 'flare', 'ghost'];

  const ENTRY_SOUNDS = [
    '/audio/order-count-1-missile.mp3',
    '/audio/order-count-2-cannon.mp3',
    '/audio/order-count-3-sniper.mp3',
    '/audio/order-count-4-rocket-launcher.mp3',
    '/audio/order-count-5-plus-battlefield.mp3',
  ];

  let audioUnlocked = false;
  const soundPlayers = new Map(ENTRY_SOUNDS.map((src) => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = 0.9;
    return [src, audio];
  }));

  const unlockAudio = async () => {
    if (audioUnlocked) {
      if (audioGate) audioGate.style.display = 'none';
      return true;
    }
    const warmupSrc = ENTRY_SOUNDS[0];
    const warmup = soundPlayers.get(warmupSrc);
    if (!warmup) return false;
    const previousVolume = warmup.volume;
    warmup.volume = 0.01;
    warmup.currentTime = 0;
    try {
      await warmup.play();
      warmup.pause();
      warmup.currentTime = 0;
    } catch (_) {
      warmup.volume = previousVolume;
      return false;
    }
    warmup.volume = previousVolume;
    if (seaVideo) {
      seaVideo.muted = false;
      seaVideo.volume = 0.28;
      try {
        const videoPlayResult = seaVideo.play();
        if (videoPlayResult?.catch) videoPlayResult.catch(() => {});
      } catch (_) {}
    }
    audioUnlocked = true;
    if (audioGate) audioGate.style.display = 'none';
    return true;
  };

  const handleAudioUnlockGesture = () => {
    unlockAudio().then((ok) => {
      if (!ok && audioGate) audioGate.classList.add('needs-audio-tap');
    });
  };

  audioGate?.addEventListener('click', handleAudioUnlockGesture);
  audioGate?.addEventListener('touchend', handleAudioUnlockGesture);
  unlockAudioBtn?.addEventListener('click', handleAudioUnlockGesture);
  unlockAudioBtn?.addEventListener('touchend', handleAudioUnlockGesture);

  const playSound = (src) => {
    if (!audioUnlocked || !src) return;
    try {
      const audio = soundPlayers.get(src) || new Audio(src);
      audio.volume = 0.85;
      audio.currentTime = 0;
      const result = audio.play();
      if (result?.catch) result.catch(() => {
        audioUnlocked = false;
        if (audioGate) audioGate.style.display = 'flex';
      });
    } catch (_) {}
  };

  testSoundBtn?.addEventListener('click', async () => {
    if (!audioUnlocked) await unlockAudio();
    playSound(ENTRY_SOUNDS[0]);
  });

  const enterFullscreen = async () => {
    const target = sea || document.documentElement;
    try {
      if (target?.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target?.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
      }
    } catch (_) {}
    document.body.classList.add('display-kiosk');
    window.scrollTo(0, 1);
  };

  fullscreenBtn?.addEventListener('click', enterFullscreen);

  const getEntrySoundSrc = (level) => {
    const rank = Math.floor(Math.max(1, Math.floor(Number(level) || 1)) / 10);
    return ENTRY_SOUNDS[Math.min(rank, ENTRY_SOUNDS.length - 1)];
  };

  const getRankName = (level, fallback = '') => {
    const rawFallback = String(fallback || '').trim();
    if (rawFallback) return rawFallback;
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return '海賊王';
    if (value >= 31) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
  };

  const getEntryRankTier = (level) => {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return 'pirateking';
    if (value >= 31) return 'admiral';
    if (value >= 21) return 'captain';
    if (value >= 11) return 'navigator';
    return 'rookie';
  };

  let reconnectTimer = null;
  let stream = null;
  let rankingRefreshTimer = null;
  let rankingRequestPromise = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const spawnEffect = (payload = {}) => {
    if (!effectsLayer) return;
    const topic = String(payload.topic || '').toLowerCase();
    const isFeaturedEntry = topic === 'troy-entry';
    const rawType = String(payload.type || payload.effectType || '').toLowerCase();
    const effectType = effectTypes.includes(rawType)
      ? rawType
      : effectTypes[Math.floor(Math.random() * effectTypes.length)];
    const xRaw = Number(payload.x);
    const yRaw = Number(payload.y);
    const x = isFeaturedEntry ? 50 : (Number.isFinite(xRaw) ? clamp(xRaw, 5, 95) : 15 + Math.random() * 70);
    const y = isFeaturedEntry ? 50 : (Number.isFinite(yRaw) ? clamp(yRaw, 5, 95) : 15 + Math.random() * 70);

    const level = Math.max(1, Math.floor(Number(payload.level) || 0));
    const tier = getEntryRankTier(level);
    const effect = document.createElement('div');
    effect.className = `effect ${effectType}${isFeaturedEntry ? ` entry-feature rank-${tier}` : ''}`;
    effect.style.left = `${x}%`;
    effect.style.top = `${y}%`;
    effectsLayer.appendChild(effect);

    if (isFeaturedEntry) {
      const particleCountByTier = {
        rookie: 10,
        navigator: 16,
        captain: 24,
        admiral: 34,
        pirateking: 48
      };
      const particleCount = particleCountByTier[tier] || 12;
      for (let i = 0; i < particleCount; i += 1) {
        const particle = document.createElement('i');
        particle.className = 'entry-confetti';
        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 130 + Math.random() * 170;
        particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
        particle.style.setProperty('--rot', `${Math.floor(Math.random() * 720) - 360}deg`);
        particle.style.animationDelay = `${Math.random() * 0.28}s`;
        effect.appendChild(particle);
      }
    }

    const label = String(payload.label || '').trim();
    if (label) {
      const text = document.createElement('div');
      text.className = 'effect-label';
      text.textContent = label;
      effect.appendChild(text);
    }

    if (level > 0) {
      const badge = document.createElement('div');
      badge.className = 'effect-rank-badge';
      badge.textContent = `Lv.${level} ${getRankName(level, payload.rankName)}`;
      effect.appendChild(badge);

      const benefits = Array.isArray(payload.rankBenefits)
        ? payload.rankBenefits.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
      if (benefits.length > 0) {
        const benefit = document.createElement('div');
        benefit.className = 'effect-benefit';
        benefit.textContent = benefits.join(' / ');
        effect.appendChild(benefit);
      }
    }

    const durationByTier = {
      rookie: 3200,
      navigator: 3800,
      captain: 4600,
      admiral: 5400,
      pirateking: 6800
    };
    window.setTimeout(() => {
      effect.remove();
    }, isFeaturedEntry ? (durationByTier[tier] || 4200) : 3200);
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
