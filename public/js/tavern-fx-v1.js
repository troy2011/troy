// Shared feel for the tavern minigames: short synthesized sounds, a light vibration, and the running win count.
// Everything stays in memory for this visit only: no storage, no network, no rewards.
(() => {
  'use strict';
  const MASTER_VOLUME = 0.32;
  // Notes in Hz: a bright tavern bell scale (D major).
  const NOTE = { D4: 293.66, A4: 440, D5: 587.33, F5: 739.99, A5: 880, D6: 1174.66 };

  let context = null;
  let soundOn = true;
  const wins = [0, 0];

  // Browsers only allow sound after a tap, so the audio context is made on the first one.
  function audio() {
    if (!soundOn || !window.AudioContext) return null;
    context ||= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  }

  // One plucked tone: a quick attack and a natural decay, like a struck glass or a coin.
  function tone(frequency, { at = 0, length = 0.18, volume = 1, type = 'triangle', slide = 0 } = {}) {
    const ac = audio();
    if (!ac) return;
    const start = ac.currentTime + at;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(frequency * slide, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(MASTER_VOLUME * volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  // A short wooden knock: filtered noise, for taps and a coin coming to rest.
  function knock(volume = 0.7) {
    const ac = audio();
    if (!ac) return;
    const length = 0.07;
    const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * length), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.4;
    gain.gain.value = MASTER_VOLUME * volume * 2;
    source.connect(filter).connect(gain).connect(ac.destination);
    source.start();
  }

  function vibrate(pattern) {
    if (soundOn && navigator.vibrate) navigator.vibrate(pattern);
  }

  window.tavernFx = {
    tap() { knock(0.6); },
    turn() { tone(NOTE.A4, { length: 0.14, volume: 0.45 }); },
    go() { tone(NOTE.D6, { length: 0.22, volume: 0.9, type: 'square' }); vibrate(40); },
    correct() { tone(NOTE.A5, { length: 0.12 }); tone(NOTE.D6, { at: 0.08, length: 0.2 }); },
    wrong() { tone(NOTE.D4, { length: 0.22, volume: 0.7, type: 'sawtooth', slide: 0.7 }); vibrate(60); },
    cue() { tone(NOTE.D5, { length: 0.26, volume: 0.6, type: 'sine' }); },
    coinRest() { knock(0.9); tone(NOTE.F5, { length: 0.1, volume: 0.25 }); },
    // A little fanfare on every result; a tie gets a plain two-note chord.
    result(winner) {
      if (winner == null) { tone(NOTE.D5, { length: 0.35, volume: 0.6 }); tone(NOTE.A4, { length: 0.35, volume: 0.5 }); return; }
      [NOTE.D5, NOTE.F5, NOTE.A5, NOTE.D6].forEach((f, i) => tone(f, { at: i * 0.09, length: i === 3 ? 0.5 : 0.16 }));
      vibrate([60, 50, 120]);
    },
    // The running count of wins for the current game, kept until the players go back to the list.
    record(winner) { if (winner === 0 || winner === 1) wins[winner]++; },
    wins: seat => wins[seat],
    resetWins() { wins[0] = 0; wins[1] = 0; },
    get soundOn() { return soundOn; },
    set soundOn(value) { soundOn = !!value; },
  };
})();
