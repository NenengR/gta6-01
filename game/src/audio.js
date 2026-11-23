// Sound effects from the browser audio API, no audio files. The engine
// hum follows the driving speed, the siren wails while the police chase,
// and the gunshot, punch, pickup chime, mission jingle and interface blip
// are short synthesized bursts. The audio context is created lazily on
// the first call, so the browser's autoplay rules are respected, and a
// mute toggle silences everything.
export function makeAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when) {
    if (muted) return;
    const c = ensure();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.12, c.currentTime + (when || 0));
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (when || 0) + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + (when || 0));
    osc.stop(c.currentTime + (when || 0) + dur + 0.02);
  }

  return {
    ensure,
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (ctx) {
        if (muted) ctx.suspend();
        else ctx.resume();
      }
      return muted;
    },
    engine(speed) {
      if (muted) return;
      const c = ensure();
      if (!engineOsc) {
        engineOsc = c.createOscillator();
        engineGain = c.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.0;
        engineOsc.connect(engineGain);
        engineGain.connect(c.destination);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + Math.abs(speed) * 0.22;
      engineGain.gain.value = speed > 10 ? 0.035 : 0.012;
    },
    stopEngine() {
      if (engineGain) engineGain.gain.value = 0;
    },
    siren(on) {
      if (muted || !on) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      const c = ensure();
      if (!sirenOsc) {
        sirenOsc = c.createOscillator();
        sirenGain = c.createGain();
        sirenLfo = c.createOscillator();
        const lfoGain = c.createGain();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 820;
        sirenLfo.type = 'sine';
        sirenLfo.frequency.value = 0.7;
        lfoGain.gain.value = 180;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain.gain.value = 0.03;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(c.destination);
        sirenOsc.start();
        sirenLfo.start();
      }
      sirenGain.gain.value = 0.03;
    },
    gunshot() {
      if (muted) return;
      const c = ensure();
      const len = Math.floor(c.sampleRate * 0.12);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const gain = c.createGain();
      gain.gain.value = 0.25;
      src.connect(gain);
      gain.connect(c.destination);
      src.start();
    },
    punch() {
      tone(90, 0.12, 'sine', 0.25);
    },
    chime() {
      tone(880, 0.12, 'sine', 0.14);
      tone(1320, 0.18, 'sine', 0.12, 0.09);
    },
    jingle() {
      tone(523, 0.14, 'triangle', 0.16);
      tone(659, 0.14, 'triangle', 0.16, 0.13);
      tone(784, 0.14, 'triangle', 0.16, 0.26);
      tone(1047, 0.3, 'triangle', 0.18, 0.39);
    },
    blip() {
      tone(600, 0.07, 'square', 0.06);
    },
  };
}
