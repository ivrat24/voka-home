const OCTAVES = 3;
const START_MIDI = 48;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_OFFSETS = [1, 3, 6, 8, 10];
const BLACK_WHITE_POS = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

const DRUM_PADS = [
  { id: "kick", label: "底鼓", short: "BD" },
  { id: "snare", label: "军鼓", short: "SD" },
  { id: "rim", label: "边击", short: "RS" },
  { id: "clap", label: "拍手", short: "CP" },
  { id: "hihat", label: "闭镲", short: "HH" },
  { id: "openhat", label: "开镲", short: "OH" },
  { id: "crash", label: "碎音镲", short: "CR" },
  { id: "ride", label: "叮叮镲", short: "RD" },
  { id: "tom1", label: "高音鼓", short: "T1" },
  { id: "tom2", label: "中音鼓", short: "T2" },
  { id: "tom3", label: "低音鼓", short: "T3" },
  { id: "shaker", label: "沙锤", short: "SH" },
];

let audioCtx = null;

/** @type {Map<number, { button: HTMLElement, voice: string, value: string | number }>} */
const activePointers = new Map();
/** @type {Map<HTMLElement, number>} */
const keyPressCount = new Map();

const GUITAR_REVERB_STORAGE_KEY = "voka-guitar-reverb-duration";
const GUITAR_REVERB_MIN = 1.2;
const GUITAR_REVERB_MAX = 9;
const GUITAR_REVERB_DEFAULT = 4.2;
let guitarReverbDuration = loadGuitarReverbDuration();

function loadGuitarReverbDuration() {
  try {
    const raw = localStorage.getItem(GUITAR_REVERB_STORAGE_KEY);
    const value = Number(raw);
    if (Number.isFinite(value)) {
      return clampGuitarReverbDuration(value);
    }
  } catch {
    /* ignore storage errors */
  }
  return GUITAR_REVERB_DEFAULT;
}

function clampGuitarReverbDuration(value) {
  return Math.min(GUITAR_REVERB_MAX, Math.max(GUITAR_REVERB_MIN, value));
}

function setGuitarReverbDuration(value) {
  guitarReverbDuration = clampGuitarReverbDuration(Number(value) || GUITAR_REVERB_DEFAULT);
  try {
    localStorage.setItem(GUITAR_REVERB_STORAGE_KEY, String(guitarReverbDuration));
  } catch {
    /* ignore storage errors */
  }
  return guitarReverbDuration;
}

function formatGuitarReverbLabel(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function buildKeyboardLayout() {
  const whiteKeys = [];
  const blackKeys = [];

  for (let octave = 0; octave < OCTAVES; octave += 1) {
    const baseMidi = START_MIDI + octave * 12;
    const octaveWhiteStart = whiteKeys.length;

    WHITE_OFFSETS.forEach((offset) => {
      const midi = baseMidi + offset;
      whiteKeys.push({
        label: NOTE_NAMES[offset],
        freq: midiToFreq(midi),
        midi,
      });
    });

    BLACK_OFFSETS.forEach((offset) => {
      const midi = baseMidi + offset;
      blackKeys.push({
        label: NOTE_NAMES[offset],
        freq: midiToFreq(midi),
        pos: octaveWhiteStart + BLACK_WHITE_POS[offset],
      });
    });
  }

  const topMidi = START_MIDI + OCTAVES * 12;
  whiteKeys.push({
    label: "C",
    freq: midiToFreq(topMidi),
    midi: topMidi,
  });

  return { whiteKeys, blackKeys, whiteCount: whiteKeys.length };
}

function isInstrumentMounted(board) {
  return Boolean(board?.querySelector(".piano-shell, .drum-pads"));
}

export function initMiniPiano() {
  initArrangeInstruments();
}

export function resetArrangeInstrumentBoards() {
  for (const id of ["keyboard-piano", "keyboard-guitar", "drum-kit"]) {
    const board = document.getElementById(id);
    if (!board) continue;
    if (isInstrumentMounted(board)) continue;
    delete board.dataset.ready;
    board.classList.add("is-loading");
    board.replaceChildren();
  }
}

export function initArrangeInstruments() {
  initKeyboard("keyboard-piano", {
    voice: "piano",
    shellClass: "piano-shell--piano",
    instrument: "钢琴",
    badge: "钢琴",
  });

  initKeyboard("keyboard-guitar", {
    voice: "guitar",
    shellClass: "piano-shell--guitar",
    instrument: "吉他",
    badge: "吉他",
  });

  initDrumKit("drum-kit", {
    shellClass: "piano-shell--drums",
    badge: "鼓组",
  });
}

function initKeyboard(containerId, options) {
  const board = document.getElementById(containerId);
  if (!board) return;
  // Remount guitar if an older shell is missing the reverb slider (cached SPA DOM).
  if (
    options.voice === "guitar" &&
    board.dataset.ready === "true" &&
    isInstrumentMounted(board) &&
    !board.querySelector(".guitar-reverb-control")
  ) {
    delete board.dataset.ready;
    board.classList.add("is-loading");
    board.replaceChildren();
  }
  if (board.dataset.ready === "true" && isInstrumentMounted(board)) return;
  board.dataset.ready = "true";
  board.classList.remove("is-loading");

  const { whiteKeys, blackKeys, whiteCount } = buildKeyboardLayout();
  const keysId = `${containerId}-keys`;

  const guitarControls =
    options.voice === "guitar"
      ? `
      <div class="instrument-control-row guitar-reverb-control">
        <label class="instrument-control" for="${containerId}-reverb">
          <span class="instrument-control-label">回音共鸣时长</span>
          <input
            id="${containerId}-reverb"
            class="instrument-control-range"
            type="range"
            min="${GUITAR_REVERB_MIN}"
            max="${GUITAR_REVERB_MAX}"
            step="0.1"
            value="${guitarReverbDuration}"
            aria-valuemin="${GUITAR_REVERB_MIN}"
            aria-valuemax="${GUITAR_REVERB_MAX}"
            aria-valuenow="${guitarReverbDuration}"
            aria-label="吉他回音共鸣时长"
          >
          <span class="instrument-control-value" data-guitar-reverb-value>${formatGuitarReverbLabel(guitarReverbDuration)}</span>
        </label>
      </div>
    `
      : "";

  board.innerHTML = `
    <div class="piano-shell ${options.shellClass}">
      <div class="piano-shell-head">
        <span class="piano-shell-badge">${options.badge}</span>
      </div>
      ${guitarControls}
      <div class="piano-keys" id="${keysId}" style="--white-count: ${whiteCount}"></div>
    </div>
  `;

  if (options.voice === "guitar") {
    bindGuitarReverbControl(board);
  }

  const keysRoot = board.querySelector(`#${keysId}`);
  const whitesWrap = document.createElement("div");
  whitesWrap.className = "piano-whites";
  keysRoot.appendChild(whitesWrap);

  whiteKeys.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "piano-key piano-key--white";
    btn.dataset.voice = options.voice;
    btn.dataset.value = String(key.freq);
    btn.setAttribute("aria-label", `${options.instrument} 白键 ${key.label}`);
    btn.innerHTML = `<span class="piano-key-label">${key.label}</span>`;
    bindKeyboardA11y(btn, options.voice, key.freq);
    whitesWrap.appendChild(btn);
  });

  const blacksWrap = document.createElement("div");
  blacksWrap.className = "piano-blacks";
  keysRoot.appendChild(blacksWrap);

  blackKeys.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "piano-key piano-key--black";
    btn.dataset.voice = options.voice;
    btn.dataset.value = String(key.freq);
    btn.style.setProperty("--black-index", String(key.pos));
    btn.setAttribute("aria-label", `${options.instrument} 黑键 ${key.label}`);
    bindKeyboardA11y(btn, options.voice, key.freq);
    blacksWrap.appendChild(btn);
  });

  bindPointerInteraction(keysRoot, ".piano-key");
}

function bindGuitarReverbControl(board) {
  const slider = board.querySelector(".guitar-reverb-control .instrument-control-range");
  const valueEl = board.querySelector("[data-guitar-reverb-value]");
  if (!slider || !valueEl) return;

  const syncUi = (seconds) => {
    slider.value = String(seconds);
    slider.setAttribute("aria-valuenow", String(seconds));
    valueEl.textContent = formatGuitarReverbLabel(seconds);
  };

  syncUi(guitarReverbDuration);

  const onChange = () => {
    const next = setGuitarReverbDuration(slider.value);
    syncUi(next);
  };

  slider.addEventListener("input", onChange);
  slider.addEventListener("change", onChange);

  // Keep slider drags from stealing guitar key pointer capture.
  const control = board.querySelector(".guitar-reverb-control");
  control?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
}

function initDrumKit(containerId, options) {
  const board = document.getElementById(containerId);
  if (!board) return;
  if (board.dataset.ready === "true" && isInstrumentMounted(board)) return;
  board.dataset.ready = "true";
  board.classList.remove("is-loading");

  board.innerHTML = `
    <div class="piano-shell ${options.shellClass}">
      <div class="piano-shell-head">
        <span class="piano-shell-badge">${options.badge}</span>
      </div>
      <div class="drum-pads" id="${containerId}-pads"></div>
    </div>
  `;

  const padsRoot = board.querySelector(`#${containerId}-pads`);

  DRUM_PADS.forEach((pad) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `drum-pad drum-pad--${pad.id}`;
    btn.dataset.voice = "drum";
    btn.dataset.value = pad.id;
    btn.setAttribute("aria-label", `鼓 ${pad.label}`);
    btn.innerHTML = `
      <span class="drum-pad-short">${pad.short}</span>
      <span class="drum-pad-label">${pad.label}</span>
    `;
    bindKeyboardA11y(btn, "drum", pad.id);
    padsRoot.appendChild(btn);
  });

  bindPointerInteraction(padsRoot, ".drum-pad");
}

function bindPointerInteraction(root, selector) {
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;

    event.preventDefault();
    root.setPointerCapture(event.pointerId);
    handlePointerPosition(event.pointerId, event.clientX, event.clientY, root, selector);
  });

  root.addEventListener("pointermove", (event) => {
    if (!root.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    handlePointerPosition(event.pointerId, event.clientX, event.clientY, root, selector);
  });

  root.addEventListener("pointerup", (event) => {
    releasePointer(event.pointerId, root);
  });

  root.addEventListener("pointercancel", (event) => {
    releasePointer(event.pointerId, root);
  });

  root.addEventListener("lostpointercapture", (event) => {
    releasePointer(event.pointerId, root);
  });
}

function handlePointerPosition(pointerId, clientX, clientY, root, selector) {
  const pad = padAtPoint(clientX, clientY, root, selector);
  if (!pad) {
    clearPointer(pointerId);
    return;
  }

  const voice = pad.dataset.voice;
  const value = pad.dataset.value;
  const current = activePointers.get(pointerId);
  if (current?.button === pad) return;

  if (current) {
    decrementKeyPress(current.button);
  }

  activePointers.set(pointerId, { button: pad, voice, value });
  incrementKeyPress(pad);
  playVoice(voice, value);
}

function padAtPoint(clientX, clientY, root, selector) {
  const target = document.elementFromPoint(clientX, clientY);
  const pad = target?.closest(selector);
  if (!pad || !root.contains(pad)) return null;
  return pad;
}

function clearPointer(pointerId) {
  const current = activePointers.get(pointerId);
  if (!current) return;
  decrementKeyPress(current.button);
  activePointers.delete(pointerId);
}

function releasePointer(pointerId, root) {
  clearPointer(pointerId);
  if (root.hasPointerCapture(pointerId)) {
    root.releasePointerCapture(pointerId);
  }
}

function incrementKeyPress(button) {
  const count = (keyPressCount.get(button) || 0) + 1;
  keyPressCount.set(button, count);
  button.classList.add("is-active");
}

function decrementKeyPress(button) {
  const count = (keyPressCount.get(button) || 1) - 1;
  if (count <= 0) {
    keyPressCount.delete(button);
    button.classList.remove("is-active");
  } else {
    keyPressCount.set(button, count);
  }
}

function bindKeyboardA11y(button, voice, value) {
  button.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!button.classList.contains("is-active")) {
      incrementKeyPress(button);
      playVoice(voice, value);
    }
  });

  button.addEventListener("keyup", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (keyPressCount.has(button)) {
      keyPressCount.delete(button);
      button.classList.remove("is-active");
    }
  });
}

function playVoice(voice, value) {
  if (voice === "guitar") {
    playGuitar(Number(value));
    return;
  }
  if (voice === "drum") {
    playDrum(value);
    return;
  }
  playPiano(Number(value));
}

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playPiano(freq) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const duration = 2.4;

  const osc = ctx.createOscillator();
  const harmonic = ctx.createOscillator();
  const gain = ctx.createGain();
  const harmonicGain = ctx.createGain();

  osc.type = "triangle";
  harmonic.type = "sine";
  osc.frequency.setValueAtTime(freq, now);
  harmonic.frequency.setValueAtTime(freq * 2, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.24, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.11, now + 0.35);
  gain.gain.exponentialRampToValueAtTime(0.045, now + 1.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  harmonicGain.gain.setValueAtTime(0.0001, now);
  harmonicGain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
  harmonicGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.72);

  osc.connect(gain);
  harmonic.connect(harmonicGain);
  gain.connect(ctx.destination);
  harmonicGain.connect(ctx.destination);

  osc.start(now);
  harmonic.start(now);
  osc.stop(now + duration + 0.08);
  harmonic.stop(now + duration + 0.08);
}

function createPluckedStringBuffer(ctx, freq, duration, damping = 0.9965) {
  const sampleRate = ctx.sampleRate;
  const period = Math.max(2, Math.round(sampleRate / freq));
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < period; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.46;
  }

  for (let i = period; i < length; i += 1) {
    data[i] = ((data[i - period] + data[i - period + 1]) * 0.5) * damping;
  }

  return buffer;
}

function playGuitar(freq) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const duration = guitarReverbDuration;
  const t1 = Math.min(0.2, duration * 0.05);
  const t2 = Math.min(1.1, duration * 0.26);
  const t3 = Math.min(2.4, duration * 0.57);
  const t4 = Math.min(3.4, duration * 0.81);
  // Longer resonance → slightly less Karplus-Strong damping (rings farther).
  const dampA = 0.9952 + Math.min(0.0024, (duration - GUITAR_REVERB_MIN) * 0.00035);
  const dampB = Math.max(0.9948, dampA - 0.00055);

  const stringA = ctx.createBufferSource();
  stringA.buffer = createPluckedStringBuffer(ctx, freq, duration, dampA);

  const stringB = ctx.createBufferSource();
  stringB.buffer = createPluckedStringBuffer(ctx, freq * 1.0015, duration, dampB);

  const pick = ctx.createBufferSource();
  const pickLength = Math.max(8, Math.floor(ctx.sampleRate * 0.01));
  const pickBuffer = ctx.createBuffer(1, pickLength, ctx.sampleRate);
  const pickData = pickBuffer.getChannelData(0);
  for (let i = 0; i < pickLength; i += 1) {
    pickData[i] = (Math.random() * 2 - 1) * (1 - i / pickLength);
  }
  pick.buffer = pickBuffer;

  const pickFilter = ctx.createBiquadFilter();
  pickFilter.type = "bandpass";
  pickFilter.frequency.value = Math.min(Math.max(freq * 2.1, 220), 2600);
  pickFilter.Q.value = 0.75;

  const pickGain = ctx.createGain();
  pickGain.gain.setValueAtTime(0.0001, now);
  pickGain.gain.exponentialRampToValueAtTime(0.07, now + 0.002);
  pickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

  const stringTone = ctx.createBiquadFilter();
  stringTone.type = "lowpass";
  stringTone.Q.value = 0.45;
  stringTone.frequency.setValueAtTime(Math.min(freq * 8, 3800), now);
  stringTone.frequency.exponentialRampToValueAtTime(
    Math.max(freq * 2.1, 680),
    now + Math.min(1.8, duration * 0.45)
  );

  const bodyLow = ctx.createBiquadFilter();
  bodyLow.type = "peaking";
  bodyLow.frequency.value = 98;
  bodyLow.Q.value = 0.75;
  bodyLow.gain.value = 6.2;

  const bodyMid = ctx.createBiquadFilter();
  bodyMid.type = "peaking";
  bodyMid.frequency.value = 340;
  bodyMid.Q.value = 0.85;
  bodyMid.gain.value = 2.2;

  const bodyAir = ctx.createBiquadFilter();
  bodyAir.type = "highshelf";
  bodyAir.frequency.value = 2200;
  bodyAir.gain.value = -5.5;

  const warmFilter = ctx.createBiquadFilter();
  warmFilter.type = "lowpass";
  warmFilter.Q.value = 0.35;
  warmFilter.frequency.setValueAtTime(3000, now);
  warmFilter.frequency.exponentialRampToValueAtTime(1800, now + Math.min(2.2, duration * 0.52));

  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0.0001, now);
  mainGain.gain.exponentialRampToValueAtTime(0.62, now + 0.004);
  mainGain.gain.exponentialRampToValueAtTime(0.34, now + t1);
  mainGain.gain.exponentialRampToValueAtTime(0.18, now + t2);
  mainGain.gain.exponentialRampToValueAtTime(0.08, now + t3);
  mainGain.gain.exponentialRampToValueAtTime(0.025, now + t4);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const stringMix = ctx.createGain();
  stringMix.gain.value = 0.78;

  // Simple feedback delay for audible “回音”; wetness tracks resonance length.
  const delay = ctx.createDelay(0.45);
  delay.delayTime.value = 0.085 + Math.min(0.12, (duration - GUITAR_REVERB_MIN) * 0.012);
  const feedback = ctx.createGain();
  feedback.gain.value = 0.18 + Math.min(0.28, (duration - GUITAR_REVERB_MIN) * 0.035);
  const wetFilter = ctx.createBiquadFilter();
  wetFilter.type = "lowpass";
  wetFilter.frequency.value = 2400;
  wetFilter.Q.value = 0.4;
  const wetMaster = ctx.createGain();
  const wetLevel = 0.16 + Math.min(0.2, (duration - GUITAR_REVERB_MIN) * 0.02);
  wetMaster.gain.setValueAtTime(wetLevel, now);
  wetMaster.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  stringA.connect(stringMix);
  stringB.connect(stringMix);
  stringMix.connect(stringTone);
  stringTone.connect(bodyLow);
  bodyLow.connect(bodyMid);
  bodyMid.connect(bodyAir);
  bodyAir.connect(warmFilter);
  warmFilter.connect(mainGain);
  mainGain.connect(ctx.destination);

  mainGain.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wetFilter);
  wetFilter.connect(wetMaster);
  wetMaster.connect(ctx.destination);

  pick.connect(pickFilter);
  pickFilter.connect(pickGain);
  pickGain.connect(mainGain);

  stringA.start(now);
  stringB.start(now);
  pick.start(now);
  stringA.stop(now + duration + 0.05);
  stringB.stop(now + duration + 0.05);
  pick.stop(now + 0.03);
}

function playDrum(drumId) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  switch (drumId) {
    case "kick":
      playKick(ctx, now);
      break;
    case "snare":
      playSnare(ctx, now);
      break;
    case "rim":
      playRim(ctx, now);
      break;
    case "clap":
      playClap(ctx, now);
      break;
    case "hihat":
      playHiHat(ctx, now, 0.06);
      break;
    case "openhat":
      playHiHat(ctx, now, 0.28);
      break;
    case "crash":
      playCrash(ctx, now);
      break;
    case "ride":
      playRide(ctx, now);
      break;
    case "tom1":
      playTom(ctx, now, 220);
      break;
    case "tom2":
      playTom(ctx, now, 165);
      break;
    case "tom3":
      playTom(ctx, now, 110);
      break;
    case "shaker":
      playShaker(ctx, now);
      break;
    default:
      break;
  }
}

function playKick(ctx, now) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.85, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}

function playSnare(ctx, now) {
  playNoise(ctx, now, 0.22, 1800, 0.42);
  const tone = ctx.createOscillator();
  const toneGain = ctx.createGain();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(180, now);
  toneGain.gain.setValueAtTime(0.18, now);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  tone.connect(toneGain);
  toneGain.connect(ctx.destination);
  tone.start(now);
  tone.stop(now + 0.14);
}

function playRim(ctx, now) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(820, now);
  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

function playClap(ctx, now) {
  [0, 0.012, 0.024].forEach((offset, index) => {
    playNoise(ctx, now + offset, 0.08 - index * 0.015, 2400, 0.22 - index * 0.04);
  });
}

function playHiHat(ctx, now, length) {
  playNoise(ctx, now, length, 7000, 0.18, "highpass");
}

function playCrash(ctx, now) {
  playNoise(ctx, now, 1.1, 5200, 0.34);
  playNoise(ctx, now, 0.8, 9000, 0.12, "highpass");
}

function playRide(ctx, now) {
  playNoise(ctx, now, 0.55, 4200, 0.16);
  const ping = ctx.createOscillator();
  const pingGain = ctx.createGain();
  ping.type = "sine";
  ping.frequency.setValueAtTime(3400, now);
  pingGain.gain.setValueAtTime(0.05, now);
  pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  ping.connect(pingGain);
  pingGain.connect(ctx.destination);
  ping.start(now);
  ping.stop(now + 0.38);
}

function playTom(ctx, now, freq) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.4, now);
  osc.frequency.exponentialRampToValueAtTime(freq, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.42, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.48);
}

function playShaker(ctx, now) {
  playNoise(ctx, now, 0.14, 5600, 0.1, "bandpass");
}

function playNoise(ctx, now, duration, freq, volume, filterType = "bandpass") {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  filter.Q.value = filterType === "bandpass" ? 0.9 : 0.7;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.02);
}
