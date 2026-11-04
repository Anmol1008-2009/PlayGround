const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const state = {
  running: false,
  paused: false,
  lastTime: 0,
  elapsed: 0,
  speed: 0,
  maxSpeed: 100,
  signal: 'CLEAR',
  signalLevel: 'green',
  throttle: 0,
  brake: 0,
  direction: 1,
  horn: false,
  distance: 0,
  journeyDistance: 1800,
  progress: 0,
  score: 0,
  stationDistance: 1800,
  targetStop: 1600,
  stopZone: 90,
  hasStarted: false,
  stopComplete: false,
  soundActive: true,
  nearStation: false,
  stopTriggered: false,
  missedStation: false,
  lastHudUpdate: 0,
};

const elements = {
  speedReadout: document.getElementById('speedReadout'),
  speedBar: document.getElementById('speedBar'),
  speedLimitMark: document.getElementById('speedLimitMark'),
  throttleValue: document.getElementById('throttleValue'),
  brakeValue: document.getElementById('brakeValue'),
  signalText: document.getElementById('signalText'),
  signalLamp: document.getElementById('signalLamp'),
  signalNote: document.getElementById('signalNote'),
  hintPill: document.getElementById('hintPill'),
  distanceReadout: document.getElementById('distanceReadout'),
  modalLayer: document.getElementById('modalLayer'),
  startButton: document.getElementById('startButton'),
  pauseButton: document.getElementById('pauseButton'),
  soundButton: document.getElementById('soundButton'),
  resetButton: document.getElementById('resetButton'),
  hornButton: document.getElementById('hornButton'),
  reverseButton: document.getElementById('reverseButton'),
  forwardButton: document.getElementById('forwardButton'),
  directionState: document.getElementById('directionState'),
  toast: document.getElementById('toast'),
  scoreReadout: document.getElementById('scoreReadout'),
};

const throttleNotches = Array.from(document.getElementById('throttleNotches').children);
const brakeNotches = Array.from(document.getElementById('brakeNotches').children);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const canvasSize = { width: 0, height: 0, ratio: 0 };
const HUD_INTERVAL = 100;
const SIMULATION_SPEED = 3;

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const pixelWidth = Math.floor(width * ratio);
  const pixelHeight = Math.floor(height * ratio);

  canvasSize.width = width;
  canvasSize.height = height;
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight || canvasSize.ratio !== ratio) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    canvasSize.ratio = ratio;
  }
}

function updateNotches(container, value, maxValue) {
  const marks = [...container.querySelectorAll('span')];
  if (!marks.length) {
    for (let i = 0; i < maxValue; i += 1) {
      const mark = document.createElement('span');
      mark.dataset.index = String(i);
      container.appendChild(mark);
    }
  }

  const active = Math.max(0, value);
  container.querySelectorAll('span').forEach((mark, index) => {
    mark.classList.toggle('active', index < active);
  });
}

function updateDirectionUI() {
  const forward = state.direction === 1;
  elements.forwardButton.classList.toggle('active', forward);
  elements.reverseButton.classList.toggle('active', !forward);
  elements.directionState.textContent = forward ? 'FORWARD' : 'REVERSE';
}

function updateSignal() {
  if (!state.running && !state.hasStarted) {
    elements.signalText.textContent = 'CLEAR';
    elements.signalLamp.className = 'signal-lamp green';
    elements.signalNote.textContent = 'Line speed 80 km/h';
    return;
  }

  if (state.speed > 28 && state.distance > 500) {
    state.signal = 'APPROACH';
    state.signalLevel = 'amber';
    elements.signalText.textContent = 'APPROACH';
    elements.signalLamp.className = 'signal-lamp amber';
    elements.signalNote.textContent = 'Slow for station';
    return;
  }

  if (state.stopTriggered || state.distance >= state.targetStop - state.stopZone && state.direction === 1) {
    state.signal = 'STOP';
    state.signalLevel = 'red';
    elements.signalText.textContent = 'STOP';
    elements.signalLamp.className = 'signal-lamp red';
    elements.signalNote.textContent = 'Brake for platform';
    return;
  }

  state.signal = 'CLEAR';
  state.signalLevel = 'green';
  elements.signalText.textContent = 'CLEAR';
  elements.signalLamp.className = 'signal-lamp green';
  elements.signalNote.textContent = 'Line speed 80 km/h';
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.classList.remove('visible');
  }, 1400);
}

function updateHUD(force = false) {
  const now = performance.now();
  if (!force && now - state.lastHudUpdate < HUD_INTERVAL) return;
  state.lastHudUpdate = now;

  const throttleDisplay = state.throttle;
  const brakeDisplay = state.brake;

  elements.speedReadout.textContent = Math.round(state.speed).toString();
  const speedRatio = clamp((state.speed / state.maxSpeed) * 100, 0, 100);
  elements.speedBar.style.width = `${speedRatio}%`;
  elements.speedLimitMark.style.left = `${(80 / state.maxSpeed) * 100}%`;

  elements.throttleValue.innerHTML = `${throttleDisplay} <small>/ 5</small>`;
  elements.brakeValue.innerHTML = `${brakeDisplay} <small>/ 5</small>`;
  updateNotches(document.getElementById('throttleNotches'), throttleDisplay, 5);
  updateNotches(document.getElementById('brakeNotches'), brakeDisplay, 5);

  const remaining = Math.max(0, state.targetStop - state.distance);
  const distanceLabel = `${(remaining / 1000).toFixed(1)} km`;
  elements.distanceReadout.textContent = distanceLabel;

  if (state.running) {
    if (state.distance > state.targetStop - 220 && !state.stopTriggered) {
      state.nearStation = true;
      elements.hintPill.textContent = 'APPROACH PLATFORM · REDUCE SPEED';
    } else if (state.speed > 10 && state.direction === 1) {
      elements.hintPill.textContent = 'RUNNING · WATCH SIGNAL';
    } else {
      elements.hintPill.textContent = 'ALL ABOARD · READY TO DEPART';
    }
  }

  elements.scoreReadout.innerHTML = `STOP SCORE <b>${state.score}</b>`;
  updateSignal();
}

function updateControls() {
  elements.soundButton.textContent = state.soundActive ? '♫' : '🔇';
  elements.pauseButton.textContent = state.paused ? '▶' : 'Ⅱ';
  elements.pauseButton.setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
  elements.hornButton.style.opacity = state.horn ? '1' : '0.8';
}

function setThrottle(delta) {
  if (state.paused) return;
  state.throttle = clamp(state.throttle + delta, 0, 5);
  updateHUD(true);
}

function setBrake(delta) {
  if (state.paused) return;
  state.brake = clamp(state.brake + delta, 0, 5);
  updateHUD(true);
}

function setDirection(next) {
  if (!state.running) return;
  if (state.speed > 6) {
    showToast('CHANGE DIRECTION AT STOP');
    return;
  }
  state.direction = next;
  updateDirectionUI();
}

function handleStart() {
  state.running = true;
  state.hasStarted = true;
  state.paused = false;
  elements.modalLayer.classList.add('hidden');
  showToast('JOURNEY STARTED');
  updateHUD(true);
}

function togglePause() {
  if (!state.hasStarted) return;
  state.paused = !state.paused;
  if (state.paused) {
    showToast('SIM PAUSED');
  } else {
    showToast('SIM RESUMED');
  }
  updateControls();
}

function resetJourney() {
  state.running = false;
  state.hasStarted = false;
  state.paused = false;
  state.speed = 0;
  state.throttle = 0;
  state.brake = 0;
  state.direction = 1;
  state.distance = 0;
  state.progress = 0;
  state.score = 0;
  state.signal = 'CLEAR';
  state.signalLevel = 'green';
  state.horn = false;
  state.nearStation = false;
  state.stopTriggered = false;
  state.missedStation = false;
  elements.modalLayer.classList.remove('hidden');
  updateDirectionUI();
  updateHUD(true);
  updateControls();
  showToast('JOURNEY RESET');
}

function trainPhysics(dt) {
  if (!state.running || state.paused) return;

  const tractionForce = state.throttle * 14;
  const brakeForce = state.brake * 20;
  const rollingResistance = 2.5;
  const gradient = 0.7;

 let acceleration = (tractionForce * state.direction) - brakeForce - rollingResistance - gradient;

  if (state.direction === -1) {
    acceleration *= 0.7;
  }

  if (state.speed < 0) state.speed = 0;

  state.speed += acceleration * dt;
  state.speed = clamp(state.speed, 0, state.maxSpeed);

  if (state.speed > 0 && state.direction === 1) {
    state.distance += (state.speed / 3.6) * dt;
  } else if (state.speed > 0 && state.direction === -1) {
    state.distance = Math.max(0, state.distance - (state.speed / 3.6) * dt);
  }

  if (!state.stopTriggered && state.direction === 1) {
    const stopError = Math.abs(state.targetStop - state.distance);
    if (state.distance >= state.targetStop - state.stopZone && state.speed <= 3) {
      state.stopTriggered = true;
      state.stopComplete = true;
      state.score = Math.max(0, 1000 - Math.round(stopError * 6) - Math.round(state.speed * 20));
      showToast('ARRIVED AT HAWTHORN');
      elements.hintPill.textContent = 'ARRIVED · STATION COMPLETE';
      state.running = false;
    } else if (state.distance > state.targetStop + state.stopZone) {
      state.missedStation = true;
      state.stopTriggered = true;
      state.score = 0;
      elements.hintPill.textContent = 'STATION MISSED · RESET TO TRY AGAIN';
      showToast('STATION MISSED');
      state.running = false;
    }
  }

  state.progress = clamp(state.distance / state.journeyDistance, 0, 1);
}

function renderTrainScene() {
  const width = canvasSize.width;
  const height = canvasSize.height;

  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#101c2a');
  sky.addColorStop(0.5, '#1b2d39');
  sky.addColorStop(1, '#060c10');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const horizon = height * 0.5;
  const hillOne = ctx.createLinearGradient(0, horizon, 0, height);
  hillOne.addColorStop(0, '#172e31');
  hillOne.addColorStop(1, '#0d1a20');
  ctx.fillStyle = hillOne;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let i = 0; i <= 9; i += 1) {
    const x = (width / 9) * i;
    const y = horizon + Math.sin(i * 1.6) * 26 + (i % 2 ? 15 : 0);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0a1116';
  ctx.fillRect(0, height * 0.56, width, height * 0.44);

  ctx.strokeStyle = 'rgba(220, 232, 239, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 12; i += 1) {
    const x = (width / 12) * i;
    const y = height * 0.56;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 20, height);
    ctx.stroke();
  }

  ctx.strokeStyle = '#dfe8ee';
  ctx.lineWidth = 3;
  const trackY = height * 0.77;
  ctx.beginPath();
  ctx.moveTo(0, trackY);
  ctx.lineTo(width, trackY);
  ctx.stroke();

  ctx.strokeStyle = '#8a9aa6';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 16; i += 1) {
    const x = (i / 16) * width + (state.speed * 2) % 80;
    ctx.beginPath();
    ctx.moveTo(x, trackY - 10);
    ctx.lineTo(x + 30, trackY + 10);
    ctx.stroke();
  }

  const trainWidth = width * 0.26;
  const trainHeight = height * 0.16;
  const trainX = width * 0.46 - trainWidth / 2;
  const trainY = trackY - trainHeight - 10;

  ctx.fillStyle = '#dfeaf1';
  ctx.fillRect(trainX + 28, trainY - 8, trainWidth - 52, 20);

  ctx.fillStyle = '#5a6d73';
  ctx.fillRect(trainX, trainY, trainWidth, trainHeight);
  ctx.fillStyle = '#40535d';
  ctx.fillRect(trainX + 12, trainY + 12, trainWidth - 24, trainHeight - 26);
  ctx.fillStyle = '#9fe4ff';
  ctx.fillRect(trainX + 22, trainY + 16, 18, 18);
  ctx.fillRect(trainX + trainWidth - 42, trainY + 16, 18, 18);

  const stationX = width * 0.8;
  const stationY = trackY - 88;
  ctx.fillStyle = '#d5dfe7';
  ctx.fillRect(stationX, stationY, 60, 80);
  ctx.fillStyle = '#7fc9de';
  ctx.fillRect(stationX + 12, stationY + 12, 36, 36);
  ctx.fillStyle = '#536672';
  ctx.fillRect(stationX + 20, stationY + 52, 20, 28);

  const stationSignX = stationX - 30;
  ctx.fillStyle = '#bfebff';
  ctx.fillRect(stationSignX, stationY + 10, 20, 26);
  ctx.fillStyle = '#1c2930';
  ctx.font = '12px sans-serif';
  ctx.fillText('H', stationSignX + 6, stationY + 28);

  const lightX = width * 0.24;
  const lightY = height * 0.2;
  ctx.fillStyle = state.signalLevel === 'green' ? '#71ff9d' : state.signalLevel === 'amber' ? '#ffcf70' : '#ff7e8d';
  ctx.beginPath();
  ctx.arc(lightX, lightY, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(0, 0, width, height);
}

function tick(timestamp) {
  if (state.lastTime && timestamp - state.lastTime < 32) {
    requestAnimationFrame(tick);
    return;
  }

  const dt = state.lastTime ? Math.min((timestamp - state.lastTime) / 1000, 0.05) : 0;
  state.lastTime = timestamp;

  if (state.running && !state.paused) {
    trainPhysics(dt * SIMULATION_SPEED);
  }

  updateHUD();
  updateControls();
  renderTrainScene();
  requestAnimationFrame(tick);
}

function bindControls() {
  document.querySelectorAll('[data-control="throttle"]').forEach((button) => {
    button.addEventListener('click', () => {
      setThrottle(Number(button.dataset.step));
    });
  });

  document.querySelectorAll('[data-control="brake"]').forEach((button) => {
    button.addEventListener('click', () => {
      setBrake(Number(button.dataset.step));
    });
  });

  elements.startButton.addEventListener('click', handleStart);
  elements.pauseButton.addEventListener('click', togglePause);
  elements.resetButton.addEventListener('click', resetJourney);
  elements.soundButton.addEventListener('click', () => {
    state.soundActive = !state.soundActive;
    showToast(state.soundActive ? 'SOUND ON' : 'SOUND OFF');
    updateControls();
  });

  elements.hornButton.addEventListener('click', () => {
    state.horn = !state.horn;
    showToast(state.horn ? 'HORN ON' : 'HORN OFF');
    updateControls();
  });

  elements.reverseButton.addEventListener('click', () => setDirection(-1));
  elements.forwardButton.addEventListener('click', () => setDirection(1));

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'w') setThrottle(1);
    if (key === 's') setBrake(1);
    if (key === 'a') setDirection(-1);
    if (key === 'd') setDirection(1);
    if (key === 'h') {
      state.horn = !state.horn;
      updateControls();
    }
    if (event.code === 'Space') {
      event.preventDefault();
      togglePause();
    }
    if (key === 'r') resetJourney();
  });

  window.addEventListener('resize', resizeCanvas);
}

function setup() {
  resizeCanvas();
  updateDirectionUI();
  updateHUD(true);
  updateControls();
  bindControls();
  requestAnimationFrame(tick);
}

setup();
