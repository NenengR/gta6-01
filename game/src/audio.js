export function createAudio() {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.55;
  master.connect(context.destination);

  const engine = createEngine(context, master);
  const siren = createSiren(context, master);
  let muted = false;

  function setMuted(value) {
    muted = value;
    master.gain.setTargetAtTime(value ? 0 : 0.55, context.currentTime, 0.03);
  }

  function tone(frequency, duration, type = "sine", volume = 0.12, slide = 0) {
    if (muted) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), context.currentTime + duration);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  return {
    context,
    engine,
    siren,
    get muted() {
      return muted;
    },
    setMuted,
    toggleMute() {
      setMuted(!muted);
      return muted;
    },
    updateEngine(speed, active, policeNearby = false) {
      engine.update(speed, active, policeNearby);
    },
    updateSiren(active, intensity = 1) {
      siren.update(active, intensity);
    },
    shot() {
      tone(115, 0.09, "sawtooth", 0.17, -60);
    },
    punch() {
      tone(75, 0.08, "triangle", 0.14, -30);
    },
    crash(force = 1) {
      tone(48, 0.22, "square", Math.min(0.2, 0.06 * force), -18);
    },
    pickup() {
      tone(520, 0.18, "sine", 0.1, 180);
      window.setTimeout(() => tone(760, 0.22, "sine", 0.08, 120), 90);
    },
    mission() {
      tone(360, 0.2, "triangle", 0.1, 100);
      window.setTimeout(() => tone(620, 0.3, "triangle", 0.1, 160), 120);
    },
    alarm() {
      tone(880, 0.16, "square", 0.06, -180);
    },
    stop() {
      engine.update(0, false, false);
      siren.update(false, 0);
    },
  };
}

function createEngine(context, master) {
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const oscillator = context.createOscillator();
  const subOscillator = context.createOscillator();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  oscillator.type = "sawtooth";
  oscillator.frequency.value = 60;
  subOscillator.type = "square";
  subOscillator.frequency.value = 30;
  gain.gain.value = 0;
  oscillator.connect(filter);
  subOscillator.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  oscillator.start();
  subOscillator.start();
  return {
    update(speed, active, policeNearby) {
      const now = context.currentTime;
      const targetGain = active ? Math.min(0.12, 0.025 + speed / 5200) + (policeNearby ? 0.025 : 0) : 0;
      gain.gain.setTargetAtTime(targetGain, now, 0.08);
      oscillator.frequency.setTargetAtTime(54 + speed * 0.25, now, 0.06);
      subOscillator.frequency.setTargetAtTime(27 + speed * 0.13, now, 0.06);
      filter.frequency.setTargetAtTime(420 + speed * 1.8, now, 0.08);
    },
  };
}

function createSiren(context, master) {
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 620;
  lfo.type = "sine";
  lfo.frequency.value = 1.7;
  lfoGain.gain.value = 260;
  gain.gain.value = 0;
  lfo.connect(lfoGain);
  lfoGain.connect(oscillator.frequency);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start();
  lfo.start();
  return {
    update(active, intensity = 1) {
      const now = context.currentTime;
      gain.gain.setTargetAtTime(active ? 0.035 * intensity : 0, now, 0.12);
      lfo.frequency.setTargetAtTime(1.4 + intensity * 0.3, now, 0.2);
    },
  };
}
