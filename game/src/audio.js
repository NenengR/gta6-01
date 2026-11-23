function buildTonePlayer(context, master, isMuted) {
  return function playTone(frequency, duration, type = "sine", volume = 0.12, slide = 0) {
    if (isMuted() || duration <= 0) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (slide) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), context.currentTime + duration);
    }
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  };
}

function buildEngineVoice(context, master) {
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const main = context.createOscillator();
  const sub = context.createOscillator();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  main.type = "sawtooth";
  main.frequency.value = 60;
  sub.type = "square";
  sub.frequency.value = 30;
  gain.gain.value = 0;
  main.connect(filter);
  sub.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  main.start();
  sub.start();
  return {
    update(speed, active, policeNearby) {
      const now = context.currentTime;
      const base = active ? Math.min(0.12, 0.025 + speed / 5200) : 0;
      const targetGain = base + (active && policeNearby ? 0.025 : 0);
      gain.gain.setTargetAtTime(targetGain, now, 0.08);
      main.frequency.setTargetAtTime(54 + speed * 0.25, now, 0.06);
      sub.frequency.setTargetAtTime(27 + speed * 0.13, now, 0.06);
      filter.frequency.setTargetAtTime(420 + speed * 1.8, now, 0.08);
    },
  };
}

function buildSirenVoice(context, master) {
  const gain = context.createGain();
  const tone = context.createOscillator();
  const wobble = context.createOscillator();
  const wobbleDepth = context.createGain();
  tone.type = "sine";
  tone.frequency.value = 620;
  wobble.type = "sine";
  wobble.frequency.value = 1.7;
  wobbleDepth.gain.value = 260;
  gain.gain.value = 0;
  wobble.connect(wobbleDepth);
  wobbleDepth.connect(tone.frequency);
  tone.connect(gain);
  gain.connect(master);
  tone.start();
  wobble.start();
  return {
    update(active, intensity = 1) {
      const now = context.currentTime;
      gain.gain.setTargetAtTime(active ? 0.035 * intensity : 0, now, 0.12);
      wobble.frequency.setTargetAtTime(1.4 + intensity * 0.3, now, 0.2);
    },
  };
}

export function createAudio() {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.55;
  master.connect(context.destination);

  const engine = buildEngineVoice(context, master);
  const siren = buildSirenVoice(context, master);
  let muted = false;
  let resumeCount = 0;
  const playTone = buildTonePlayer(context, master, () => muted);

  // Browsers start AudioContext suspended until a real user gesture.
  function resume() {
    if (context.state === "running") return Promise.resolve();
    resumeCount += 1;
    const result = context.resume();
    return result && typeof result.then === "function" ? result : Promise.resolve();
  }

  function setMuted(value) {
    muted = value;
    master.gain.setTargetAtTime(value ? 0 : 0.55, context.currentTime, 0.03);
  }

  function chime(first, second, gapMs) {
    playTone(first.frequency, first.duration, first.type, first.volume, first.slide);
    window.setTimeout(() => playTone(second.frequency, second.duration, second.type, second.volume, second.slide), gapMs);
  }

  return {
    context,
    engine,
    siren,
    get muted() {
      return muted;
    },
    get resumeCount() {
      return resumeCount;
    },
    resume,
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
      playTone(115, 0.09, "sawtooth", 0.17, -60);
    },
    punch() {
      playTone(75, 0.08, "triangle", 0.14, -30);
    },
    crash(force = 1) {
      playTone(48, 0.22, "square", Math.min(0.2, 0.06 * force), -18);
    },
    pickup() {
      chime(
        { frequency: 520, duration: 0.18, type: "sine", volume: 0.1, slide: 180 },
        { frequency: 760, duration: 0.22, type: "sine", volume: 0.08, slide: 120 },
        90,
      );
    },
    mission() {
      chime(
        { frequency: 360, duration: 0.2, type: "triangle", volume: 0.1, slide: 100 },
        { frequency: 620, duration: 0.3, type: "triangle", volume: 0.1, slide: 160 },
        120,
      );
    },
    alarm() {
      playTone(880, 0.16, "square", 0.06, -180);
    },
    stop() {
      engine.update(0, false, false);
      siren.update(false, 0);
    },
  };
}
