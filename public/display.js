(() => {
  const effectsLayer = document.getElementById('effects');
  const rankingList = document.getElementById('rankingList');
  const rankingSub = document.getElementById('rankingSub');
  const sea = document.getElementById('sea');
  const seaVideo = document.getElementById('seaVideo');
  const audioGate = document.getElementById('audioGate');
  const audioGateStatus = document.getElementById('audioGateStatus');
  const startDisplayBtn = document.getElementById('btnStartDisplay');
  const unlockAudioBtn = document.getElementById('btnUnlockAudio');
  const testSoundBtn = document.getElementById('btnTestSound');
  const fullscreenBtn = document.getElementById('btnFullscreen');
  const orderNoticePanel = document.getElementById('orderNoticePanel');
  const orderNoticeList = document.getElementById('orderNoticeList');
  const orderNoticeCount = document.getElementById('orderNoticeCount');
  const effectTypes = ['splash', 'boom', 'flare', 'ghost'];
  const BOUNTY_UNIT_LABEL = 'ĐɃ';
  const RANKING_REFRESH_TOPICS = new Set([
    'ps-transfer',
    'troy-entry',
    'troy-leave',
    'troy-checkout',
    'troy-ranking',
    'troy-status'
  ]);

  const ENTRY_SOUNDS = [
    '/audio/order-count-1-missile.mp3',
    '/audio/order-count-2-cannon.mp3',
    '/audio/order-count-3-sniper.mp3',
    '/audio/order-count-4-rocket-launcher.mp3',
    '/audio/order-count-5-plus-battlefield.mp3',
  ];
  const CUSTOMER_ORDER_NOTICE_TOPIC = 'troy-customer-order';
  const CUSTOMER_ORDER_REVIEWED_TOPIC = 'troy-customer-order-reviewed';
  const ORDER_NOTICE_SOUND_SRC = ENTRY_SOUNDS[1];

  let audioUnlocked = false;
  let audioUnlocking = false;
  let audioContext = null;
  let audioDecodeStarted = false;
  let seaVideoWatchTimer = null;
  let seaVideoLoadRequested = false;
  let seaVideoAudioEnabled = false;
  let seaVideoAudioReady = false;
  let lastSeaVideoTime = 0;
  let lastSeaVideoCheckAt = 0;
  const soundBuffers = new Map();
  const soundBufferPromises = new Map();
  const soundArrayBufferPromises = new Map();
  const soundPlayers = new Map(ENTRY_SOUNDS.map((src) => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.volume = 0.9;
    return [src, audio];
  }));

  const fetchSoundArrayBuffer = (src) => {
    if (!src) return Promise.resolve(null);
    if (soundArrayBufferPromises.has(src)) return soundArrayBufferPromises.get(src);
    const promise = fetch(src, { cache: 'force-cache' })
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
    soundArrayBufferPromises.set(src, promise);
    return promise;
  };

  ENTRY_SOUNDS.forEach((src) => {
    fetchSoundArrayBuffer(src);
  });

  const setGateStatus = (text) => {
    if (audioGateStatus) audioGateStatus.textContent = text || '';
  };

  const configureSeaVideoInlinePlayback = () => {
    if (!seaVideo) return;
    seaVideo.controls = false;
    seaVideo.autoplay = true;
    seaVideo.loop = true;
    seaVideo.playsInline = true;
    seaVideo.setAttribute('playsinline', '');
    seaVideo.setAttribute('webkit-playsinline', '');
    seaVideo.setAttribute('x-webkit-airplay', 'deny');
    seaVideo.setAttribute('disableremoteplayback', '');
    seaVideo.setAttribute('disablepictureinpicture', '');
    seaVideo.setAttribute('controlslist', 'nodownload noremoteplayback nofullscreen');
    seaVideo.removeAttribute('controls');
    try {
      seaVideo.disableRemotePlayback = true;
    } catch (_) {}
    try {
      seaVideo.disablePictureInPicture = true;
    } catch (_) {}
    try {
      if (seaVideo.webkitPresentationMode && seaVideo.webkitPresentationMode !== 'inline') {
        seaVideo.webkitSetPresentationMode?.('inline');
      }
    } catch (_) {}
  };

  const ensureSeaVideoPlayback = async (options = {}) => {
    if (!seaVideo) return false;
    configureSeaVideoInlinePlayback();
    const withAudio = options.withAudio === true || seaVideoAudioEnabled;
    if (withAudio) {
      seaVideoAudioEnabled = true;
      seaVideo.muted = false;
      seaVideo.defaultMuted = false;
      seaVideo.volume = Math.max(0, Math.min(1, Number(options.volume ?? 0.85) || 0.85));
      seaVideo.removeAttribute('muted');
    } else {
      seaVideo.muted = true;
      seaVideo.defaultMuted = true;
      seaVideo.setAttribute('muted', '');
    }
    seaVideo.loop = true;
    seaVideo.playsInline = true;
    seaVideo.setAttribute('playsinline', '');
    seaVideo.setAttribute('webkit-playsinline', '');
    try {
      if (seaVideo.readyState === 0 && seaVideo.networkState === HTMLMediaElement.NETWORK_EMPTY && !seaVideoLoadRequested) {
        seaVideoLoadRequested = true;
        seaVideo.load();
      }
      const result = seaVideo.play();
      if (result?.catch) await result.catch(() => {});
    } catch (_) {}
    seaVideoAudioReady = !!withAudio && !seaVideo.muted && !seaVideo.paused;
    return !seaVideo.paused;
  };

  const startSeaVideoWatchdog = () => {
    if (!seaVideo || seaVideoWatchTimer) return;
    lastSeaVideoTime = Number(seaVideo.currentTime) || 0;
    lastSeaVideoCheckAt = Date.now();
    seaVideoWatchTimer = window.setInterval(() => {
      if (!seaVideo) return;
      const now = Date.now();
      const current = Number(seaVideo.currentTime) || 0;
      const stalled = seaVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && !seaVideo.paused
        && current <= lastSeaVideoTime + 0.02
        && now - lastSeaVideoCheckAt > 1400;
      if (seaVideo.paused || stalled) {
        ensureSeaVideoPlayback();
      }
      lastSeaVideoTime = current;
      lastSeaVideoCheckAt = now;
    }, 1500);
  };

  const installSeaVideoRecovery = () => {
    if (!seaVideo) return;
    configureSeaVideoInlinePlayback();
    ['canplay', 'pause', 'stalled', 'error'].forEach((eventName) => {
      seaVideo.addEventListener(eventName, () => {
        ensureSeaVideoPlayback();
      });
    });
    seaVideo.addEventListener('webkitbeginfullscreen', () => {
      window.setTimeout(() => {
        try {
          seaVideo.webkitExitFullscreen?.();
        } catch (_) {}
        configureSeaVideoInlinePlayback();
        ensureSeaVideoPlayback();
      }, 0);
    });
    seaVideo.addEventListener('webkitpresentationmodechanged', () => {
      configureSeaVideoInlinePlayback();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) ensureSeaVideoPlayback();
    });
    window.addEventListener('pageshow', () => ensureSeaVideoPlayback());
    window.addEventListener('focus', () => ensureSeaVideoPlayback());
    ensureSeaVideoPlayback();
    startSeaVideoWatchdog();
  };

  const beginWarmupAudioElement = (audio) => {
    if (!audio) return Promise.resolve(false);
    const previousVolume = audio.volume;
    audio.volume = 0.01;
    audio.currentTime = 0;
    let result = null;
    try {
      result = audio.play();
    } catch (_) {
      audio.volume = previousVolume;
      return Promise.resolve(false);
    }
    return Promise.resolve(result).then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = previousVolume;
      return true;
    }).catch(() => {
      audio.volume = previousVolume;
      return false;
    });
  };

  const unlockWebAudio = async () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return true;
    try {
      audioContext = audioContext || new AudioContextCtor();
      if (audioContext.state === 'suspended') await audioContext.resume();
      const source = audioContext.createOscillator();
      const gain = audioContext.createGain();
      gain.gain.value = 0.0001;
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start();
      source.stop(audioContext.currentTime + 0.03);
      return true;
    } catch (_) {
      return false;
    }
  };

  const decodeAudioData = (arrayBuffer) => {
    if (!audioContext?.decodeAudioData) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      try {
        const result = audioContext.decodeAudioData(arrayBuffer, resolve, reject);
        if (result?.then) result.then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  };

  const loadSoundBuffer = async (src) => {
    if (!src || !audioContext?.decodeAudioData) return null;
    if (soundBuffers.has(src)) return soundBuffers.get(src);
    if (soundBufferPromises.has(src)) return soundBufferPromises.get(src);
    const promise = fetchSoundArrayBuffer(src)
      .then((arrayBuffer) => (arrayBuffer ? decodeAudioData(arrayBuffer.slice(0)) : null))
      .then((buffer) => {
        if (buffer) soundBuffers.set(src, buffer);
        return buffer;
      })
      .catch(() => null);
    soundBufferPromises.set(src, promise);
    return promise;
  };

  const startSoundBufferPreload = () => {
    if (audioDecodeStarted || !audioContext) return;
    audioDecodeStarted = true;
    ENTRY_SOUNDS.forEach((src) => {
      loadSoundBuffer(src);
    });
  };

  const playBufferedSound = (src) => {
    if (!src || !audioContext || !soundBuffers.has(src)) return false;
    try {
      if (audioContext.state === 'suspended') {
        audioContext.resume?.().catch?.(() => {});
      }
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = soundBuffers.get(src);
      gain.gain.value = 0.85;
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start(0);
      return true;
    } catch (_) {
      return false;
    }
  };

  const unlockAudio = async () => {
    if (audioUnlocked) {
      if (audioGate) audioGate.style.display = 'none';
      document.body.classList.add('display-ready');
      return true;
    }
    if (audioUnlocking) return true;
    audioUnlocking = true;
    setGateStatus('音声を準備しています...');

    const webAudioPromise = unlockWebAudio();
    const warmupPromises = [...soundPlayers.values()].map((audio) => beginWarmupAudioElement(audio));
    const seaVideoPromise = ensureSeaVideoPlayback({ withAudio: true });

    const webAudioReady = await webAudioPromise;
    if (webAudioReady) startSoundBufferPreload();
    const warmupResults = await Promise.all(warmupPromises);
    const bufferResults = webAudioReady
      ? await Promise.all(ENTRY_SOUNDS.map((src) => loadSoundBuffer(src)))
      : [];
    await seaVideoPromise;
    await ensureSeaVideoPlayback();

    const anySoundReady = warmupResults.some(Boolean);
    const anyBufferReady = bufferResults.some(Boolean);
    audioUnlocked = anySoundReady || anyBufferReady || seaVideoAudioReady;
    audioUnlocking = false;
    if (!audioUnlocked) {
      setGateStatus('音が有効化できませんでした。もう一度タップしてください。');
      return false;
    }
    setGateStatus('音声ON');
    if (audioGate) audioGate.style.display = 'none';
    document.body.classList.add('display-ready');
    return true;
  };

  const handleAudioUnlockGesture = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const ok = await unlockAudio();
    await enterKioskMode();
    if (!ok && audioGate) {
      audioGate.classList.add('needs-audio-tap');
    }
  };

  const handleAudioButtonGesture = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const ok = await unlockAudio();
    if (!ok && audioGate) audioGate.classList.add('needs-audio-tap');
  };

  const touchGestureOptions = { passive: false };
  audioGate?.addEventListener('touchstart', handleAudioUnlockGesture, touchGestureOptions);
  audioGate?.addEventListener('click', handleAudioUnlockGesture);
  audioGate?.addEventListener('touchend', handleAudioUnlockGesture, touchGestureOptions);
  startDisplayBtn?.addEventListener('touchstart', handleAudioUnlockGesture, touchGestureOptions);
  startDisplayBtn?.addEventListener('click', handleAudioUnlockGesture);
  startDisplayBtn?.addEventListener('touchend', handleAudioUnlockGesture, touchGestureOptions);
  unlockAudioBtn?.addEventListener('touchstart', handleAudioButtonGesture, touchGestureOptions);
  unlockAudioBtn?.addEventListener('click', handleAudioButtonGesture);
  unlockAudioBtn?.addEventListener('touchend', handleAudioButtonGesture, touchGestureOptions);

  const enterKioskMode = async () => {
    const target = sea || document.documentElement;
    document.body.classList.add('display-kiosk');
    document.body.classList.add('display-ready');
    try {
      if (target?.requestFullscreen && !document.fullscreenElement) {
        await target.requestFullscreen();
      } else if (target?.webkitRequestFullscreen && !document.webkitFullscreenElement) {
        await target.webkitRequestFullscreen();
      }
    } catch (_) {
      // iPad Safari may not expose element fullscreen; kiosk CSS still hides controls.
    }
    window.scrollTo(0, 1);
  };

  fullscreenBtn?.addEventListener('click', async () => {
    const ok = await unlockAudio();
    await enterKioskMode();
    if (!ok && audioGate) {
      audioGate.style.display = 'flex';
      audioGate.classList.add('needs-audio-tap');
    }
  });

  const resumeUnlockedAudioContext = () => {
    if (!audioUnlocked || !audioContext || audioContext.state !== 'suspended') return;
    audioContext.resume?.().catch?.(() => {});
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeUnlockedAudioContext();
  });
  window.addEventListener('pageshow', resumeUnlockedAudioContext);
  window.addEventListener('focus', resumeUnlockedAudioContext);

  const playSound = (src) => {
    if (!audioUnlocked || !src) return;
    if (playBufferedSound(src)) return;
    if (audioContext && !soundBuffers.has(src)) {
      loadSoundBuffer(src).then((buffer) => {
        if (buffer && audioUnlocked) playBufferedSound(src);
      });
    }
    try {
      const audio = soundPlayers.get(src) || new Audio(src);
      audio.volume = 0.85;
      audio.currentTime = 0;
      const result = audio.play();
      if (result?.catch) result.catch(() => {
        if (audioContext?.state === 'running') return;
        audioUnlocked = false;
        if (audioGate) audioGate.style.display = 'flex';
      });
    } catch (_) {}
  };

  testSoundBtn?.addEventListener('click', async () => {
    if (!audioUnlocked) await unlockAudio();
    playSound(ENTRY_SOUNDS[0]);
  });

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
  const pendingCustomerOrderNotices = new Map();

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

    const rawLevel = Number(payload.level);
    const hasLevel = Number.isFinite(rawLevel) && rawLevel > 0;
    const level = hasLevel ? Math.max(1, Math.floor(rawLevel)) : 0;
    const tier = hasLevel ? getEntryRankTier(level) : 'rookie';
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

    if (hasLevel) {
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

  const shouldRefreshRankingForEvent = (payload = {}) => {
    const topic = String(payload.topic || '').toLowerCase();
    if (RANKING_REFRESH_TOPICS.has(topic)) return true;
    const label = String(payload.label || '').trim();
    return label === 'TROY OPEN'
      || label === 'TROY CLOSE'
      || label.startsWith('会計済:');
  };

  const shouldRenderEffectForEvent = (payload = {}) => (
    String(payload.type || payload.effectType || '').toLowerCase() !== 'refresh'
  );

  const formatNumber = (value) => {
    const num = Math.max(0, Math.floor(Number(value) || 0));
    return num.toLocaleString('ja-JP');
  };

  const normalizeOrderNoticeText = (value, fallback = '') => {
    const text = String(value || '').trim();
    return text || fallback;
  };

  const normalizeCustomerOrderNotice = (payload = {}) => {
    const requestId = normalizeOrderNoticeText(payload.requestId);
    if (!requestId) return null;
    const createdAtMs = Math.max(0, Math.floor(Number(payload.createdAtMs || payload.createdAt) || Date.now()));
    return {
      requestId,
      createdAtMs
    };
  };

  const renderCustomerOrderNotices = () => {
    if (!orderNoticePanel || !orderNoticeList) return;
    const orders = Array.from(pendingCustomerOrderNotices.values())
      .sort((a, b) => (a.createdAtMs - b.createdAtMs) || a.requestId.localeCompare(b.requestId));
    orderNoticePanel.hidden = orders.length === 0;
    if (orderNoticeCount) orderNoticeCount.textContent = `${orders.length}件`;
    orderNoticeList.innerHTML = '';
    if (orders.length === 0) return;

    const row = document.createElement('div');
    row.className = 'order-notice-row';

    const item = document.createElement('div');
    item.className = 'order-notice-item';
    item.textContent = orders.length > 1 ? `注文が${orders.length}件入っています` : '注文が入りました';

    const action = document.createElement('div');
    action.className = 'order-notice-action';
    action.textContent = '確認中';

    row.appendChild(item);
    row.appendChild(action);
    orderNoticeList.appendChild(row);
  };

  const handleCustomerOrderDisplayEvent = (payload = {}, options = {}) => {
    const topic = String(payload.topic || '').toLowerCase();
    if (topic !== CUSTOMER_ORDER_NOTICE_TOPIC && topic !== CUSTOMER_ORDER_REVIEWED_TOPIC) return false;
    const requestId = normalizeOrderNoticeText(payload.requestId);
    if (topic === CUSTOMER_ORDER_REVIEWED_TOPIC) {
      if (requestId) {
        pendingCustomerOrderNotices.delete(requestId);
        renderCustomerOrderNotices();
      }
      return true;
    }
    const notice = normalizeCustomerOrderNotice(payload);
    if (notice) {
      pendingCustomerOrderNotices.set(notice.requestId, notice);
      renderCustomerOrderNotices();
      if (!options.silent) playSound(ORDER_NOTICE_SOUND_SRC);
    }
    return true;
  };

  const getRankingAvatarUrl = (row) => String(
    row?.avatarUrl
    || row?.pictureUrl
    || row?.linePictureUrl
    || ''
  ).trim();

  const getRankingInitial = (label) => String(label || '?').trim().slice(0, 1) || '?';

  const createRankingAvatar = (row, label) => {
    const avatar = document.createElement('div');
    avatar.className = 'ranking-avatar';
    const initial = getRankingInitial(label);
    const avatarUrl = getRankingAvatarUrl(row);

    if (!avatarUrl) {
      avatar.classList.add('ranking-avatar-fallback');
      avatar.textContent = initial;
      return avatar;
    }

    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = `${label || 'LINE'} icon`;
    img.loading = 'eager';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      img.remove();
      avatar.classList.add('ranking-avatar-fallback');
      avatar.textContent = initial;
    });
    avatar.appendChild(img);
    return avatar;
  };

  const renderRanking = (data) => {
    if (!rankingList) return;
    rankingList.innerHTML = '';
    const ranking = Array.isArray(data?.ranking) ? data.ranking : [];

    if (rankingSub) {
      rankingSub.textContent = data?.isOpen === false ? 'TROY CLOSE' : '入店中メンバーのみ';
    }

    if (ranking.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ranking-empty';
      empty.textContent = '入店中メンバーがいません';
      rankingList.appendChild(empty);
      return;
    }

    ranking.slice(0, 10).forEach((row, index) => {
      const line = document.createElement('li');
      line.className = `ranking-row ranking-row-${index + 1}`;

      const rank = document.createElement('div');
      rank.className = 'ranking-rank';
      rank.textContent = `${Number(row?.position) || index + 1}`;

      const displayName = row.displayName || row.playFabId || 'Unknown';
      const avatar = createRankingAvatar(row, displayName);

      const main = document.createElement('div');
      main.className = 'ranking-main';

      const wanted = document.createElement('div');
      wanted.className = 'ranking-wanted-stamp';
      wanted.textContent = 'WANTED';

      const name = document.createElement('div');
      name.className = 'ranking-name';
      name.textContent = displayName;

      const meta = document.createElement('div');
      meta.className = 'ranking-meta';
      const level = Math.max(1, Math.floor(Number(row.level) || 1));
      const rankName = String(row.rankName || '').trim();
      meta.textContent = rankName ? `Lv.${level} ${rankName}` : `Lv.${level}`;

      main.appendChild(wanted);
      main.appendChild(name);
      main.appendChild(meta);

      const bounty = document.createElement('div');
      bounty.className = 'ranking-bounty';
      const bountyValue = Number(row.bounty ?? row.score ?? 0) || 0;
      const bountyLabel = document.createElement('span');
      bountyLabel.textContent = 'BOUNTY';
      const bountyAmount = document.createElement('strong');
      bountyAmount.textContent = `${formatNumber(bountyValue)} ${BOUNTY_UNIT_LABEL}`;
      bounty.appendChild(bountyLabel);
      bounty.appendChild(bountyAmount);

      line.appendChild(rank);
      line.appendChild(avatar);
      line.appendChild(main);
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
        const handledCustomerOrder = handleCustomerOrderDisplayEvent(event, { silent: true });
        if (!handledCustomerOrder && shouldRenderEffectForEvent(event)) spawnEffect(event);
        const topic = String(event?.topic || '').toLowerCase();
        if (shouldRefreshRankingForEvent(event)) shouldRefreshRanking = true;
        if (topic === 'troy-entry') playSound(getEntrySoundSrc(event.level));
      });
      if (shouldRefreshRanking) scheduleRankingRefresh(120);
      return;
    }

    const handledCustomerOrder = handleCustomerOrderDisplayEvent(payload);
    if (!handledCustomerOrder && shouldRenderEffectForEvent(payload)) spawnEffect(payload);
    const topic = String(payload.topic || '').toLowerCase();
    if (topic === 'troy-entry') playSound(getEntrySoundSrc(payload.level));
    if (shouldRefreshRankingForEvent(payload)) scheduleRankingRefresh(120);
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
  installSeaVideoRecovery();
  fetchRanking();
})();
