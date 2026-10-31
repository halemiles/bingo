// UI wiring: renders game state, runs the auto timer, handles input and
// persistence. Game rules live in game.js.

import {
  TOTAL_BALLS,
  RECENT_COUNT,
  newGame,
  draw,
  undo,
  isFinished,
  currentBall,
  recentBalls,
  calledBalls,
  isValidState,
} from './game.js';
import { loadCalls } from './calls.js';
import { loadConfig, clampSpeed } from './config.js';

const STORAGE_KEYS = {
  game: 'bingo.game.v1',
  speed: 'bingo.speedSeconds.v1',
};
const CURSOR_HIDE_MS = 3000;
const COUNTDOWN_REFRESH_MS = 100;

const $ = (id) => document.getElementById(id);
const el = {
  currentBall: $('current-ball'),
  currentNumber: $('current-number'),
  currentCall: $('current-call'),
  recentList: $('recent-balls'),
  board: $('board'),
  release: $('release'),
  auto: $('auto'),
  autoLabel: $('auto-label'),
  speed: $('speed'),
  speedValue: $('speed-value'),
  countdown: $('countdown'),
  countdownText: $('countdown-text'),
  count: $('count'),
  undo: $('undo'),
  newGame: $('new-game'),
  fullscreen: $('fullscreen'),
  fullscreenLabel: $('fullscreen-label'),
  announcer: $('announcer'),
  confirm: $('confirm'),
  confirmMessage: $('confirm-message'),
  confirmOk: $('confirm-ok'),
  confirmCancel: $('confirm-cancel'),
};

let state;
let calls = new Map();
let config;
let speedSeconds;

// ---------- Storage (never fatal: private windows can throw) ----------

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game carries on, it just won't survive a reload.
  }
}

function loadGame() {
  const saved = readStorage(STORAGE_KEYS.game);
  return isValidState(saved) ? saved : newGame();
}

// ---------- Rendering ----------

function decadeOf(n) {
  return String(Math.min(Math.floor(n / 10), 8));
}

function paintBall(ball, face, n) {
  ball.classList.toggle('is-empty', n === null);
  if (n === null) {
    delete ball.dataset.decade;
    face.textContent = '';
  } else {
    ball.dataset.decade = decadeOf(n);
    face.textContent = String(n);
  }
}

function buildBoard() {
  const fragment = document.createDocumentFragment();
  for (let n = 1; n <= TOTAL_BALLS; n++) {
    const cell = document.createElement('li');
    cell.className = 'cell';
    cell.dataset.number = String(n);
    cell.textContent = String(n);
    fragment.append(cell);
  }
  el.board.replaceChildren(fragment);
}

function buildRecent() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < RECENT_COUNT; i++) {
    const item = document.createElement('li');
    item.className = 'ball ball--small';
    item.innerHTML = '<span class="ball__face"><span class="ball__number"></span></span>';
    fragment.append(item);
  }
  el.recentList.replaceChildren(fragment);
}

function render() {
  const current = currentBall(state);
  const recent = recentBalls(state);
  const called = calledBalls(state);
  const finished = isFinished(state);

  paintBall(el.currentBall, el.currentNumber, current);

  const call = current === null ? null : calls.get(current);
  el.currentCall.classList.toggle('is-hint', current === null);
  if (current === null) {
    el.currentCall.textContent = 'Press Space to release the first ball';
  } else {
    el.currentCall.textContent = call ?? '';
  }

  [...el.recentList.children].forEach((item, i) => {
    paintBall(item, item.querySelector('.ball__number'), recent[i] ?? null);
  });

  for (const cell of el.board.children) {
    const n = Number(cell.dataset.number);
    const isCalled = called.has(n);
    cell.classList.toggle('is-called', isCalled);
    cell.classList.toggle('is-latest', n === current);
    cell.setAttribute('aria-label', isCalled ? `${n}, called` : String(n));
  }

  el.count.textContent = finished ? `All ${TOTAL_BALLS} called` : `${state.drawnCount} / ${TOTAL_BALLS} called`;
  el.release.disabled = finished;
  el.auto.disabled = finished;
  el.undo.disabled = state.drawnCount === 0;
  el.newGame.disabled = state.drawnCount === 0;
}

function animateNewBall() {
  // Restart the CSS animation by removing the class and forcing a reflow.
  el.currentBall.classList.remove('pop');
  void el.currentBall.offsetWidth;
  el.currentBall.classList.add('pop');
}

function announce() {
  const current = currentBall(state);
  if (current === null) return;
  const call = calls.get(current);
  el.announcer.textContent = call ? `${current}. ${call}` : String(current);
}

function setState(next, { save = true } = {}) {
  state = next;
  if (save) writeStorage(STORAGE_KEYS.game, state);
  render();
}

// ---------- Actions ----------

function releaseBall() {
  if (isFinished(state)) return;
  keepScreenAwake();
  setState(draw(state));
  animateNewBall();
  announce();
  if (auto.running) {
    if (isFinished(state)) stopAuto();
    else scheduleNextBall();
  }
}

async function undoBall() {
  if (state.drawnCount === 0) return;
  stopAuto();
  const ball = currentBall(state);
  if (await confirmAction(`Undo ball ${ball}? It goes back in the machine.`, 'Undo')) {
    setState(undo(state));
  }
}

async function startNewGame() {
  if (state.drawnCount === 0) return;
  stopAuto();
  if (await confirmAction('Start a new game? All called balls will be cleared.', 'New game')) {
    setState(newGame());
  }
}

// ---------- Auto mode ----------

const auto = { running: false, timer: null, ticker: null, nextAt: 0, intervalMs: 0 };

function scheduleNextBall() {
  clearTimeout(auto.timer);
  auto.intervalMs = speedSeconds * 1000;
  auto.nextAt = Date.now() + auto.intervalMs;
  auto.timer = setTimeout(releaseBall, auto.intervalMs);
  renderCountdown();
}

function startAuto() {
  if (auto.running || isFinished(state)) return;
  auto.running = true;
  keepScreenAwake();
  auto.ticker = setInterval(renderCountdown, COUNTDOWN_REFRESH_MS);
  renderAuto();
  scheduleNextBall();
}

function stopAuto() {
  if (!auto.running) return;
  auto.running = false;
  clearTimeout(auto.timer);
  clearInterval(auto.ticker);
  renderAuto();
}

function toggleAuto() {
  if (auto.running) stopAuto();
  else startAuto();
}

function renderAuto() {
  el.auto.setAttribute('aria-pressed', String(auto.running));
  el.autoLabel.textContent = auto.running ? 'Pause' : 'Auto';
  el.countdown.hidden = !auto.running;
}

function renderCountdown() {
  if (!auto.running) return;
  const remainingMs = Math.max(auto.nextAt - Date.now(), 0);
  el.countdown.style.setProperty('--progress', String(1 - remainingMs / auto.intervalMs));
  el.countdownText.textContent = `Next in ${Math.ceil(remainingMs / 1000)}s`;
}

function setSpeed(seconds, { save = true } = {}) {
  speedSeconds = clampSpeed(seconds, config);
  el.speed.value = String(speedSeconds);
  el.speedValue.textContent = `${speedSeconds}s`;
  if (save) writeStorage(STORAGE_KEYS.speed, speedSeconds);
  // A new speed applies from the next ball; the current countdown finishes as is.
}

// ---------- Confirm dialog ----------

function confirmAction(message, okLabel) {
  return new Promise((resolve) => {
    el.confirmMessage.textContent = message;
    el.confirmOk.textContent = okLabel;
    el.confirm.returnValue = '';
    el.confirm.addEventListener('close', () => resolve(el.confirm.returnValue === 'ok'), { once: true });
    el.confirm.showModal();
    // Default to the safe choice so a stray Space or Enter cancels.
    el.confirmCancel.focus();
  });
}

// ---------- Fullscreen, wake lock, cursor ----------

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function renderFullscreen() {
  el.fullscreenLabel.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
  updateCursor();
}

let wakeLock = null;

// Stops the laptop dimming mid-game. Needs a secure context (HTTPS or
// localhost); elsewhere it quietly does nothing.
async function keepScreenAwake() {
  if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

let cursorTimer = null;

function updateCursor() {
  document.body.classList.remove('cursor-hidden');
  clearTimeout(cursorTimer);
  if (document.fullscreenElement) {
    cursorTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), CURSOR_HIDE_MS);
  }
}

// ---------- Input ----------

function isTypingTarget(target) {
  return target instanceof HTMLElement && target.matches('input:not([type="range"]), textarea, select');
}

function onKeyDown(event) {
  if (el.confirm.open || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;

  if (event.code === 'Space') {
    // Always "release ball", even if a button has focus, so a child pressing
    // Space never toggles something else by accident.
    event.preventDefault();
    if (!event.repeat) releaseBall();
    return;
  }
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'a') toggleAuto();
  else if (key === 'f') toggleFullscreen();
}

function onKeyUp(event) {
  // Buttons activate on Space keyup; swallow it so a focused button doesn't fire too.
  if (event.code === 'Space' && !el.confirm.open && !isTypingTarget(event.target)) event.preventDefault();
}

function bindEvents() {
  el.release.addEventListener('click', releaseBall);
  el.auto.addEventListener('click', toggleAuto);
  el.undo.addEventListener('click', undoBall);
  el.newGame.addEventListener('click', startNewGame);
  el.fullscreen.addEventListener('click', toggleFullscreen);
  el.speed.addEventListener('input', () => setSpeed(Number(el.speed.value)));

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('fullscreenchange', renderFullscreen);
  document.addEventListener('mousemove', updateCursor);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (auto.running || state.drawnCount > 0)) keepScreenAwake();
  });
}

// ---------- Start ----------

async function init() {
  [config, calls] = await Promise.all([loadConfig(), loadCalls()]);

  el.speed.min = String(config.autoMinSeconds);
  el.speed.max = String(config.autoMaxSeconds);
  el.speed.step = String(config.autoStepSeconds);
  setSpeed(readStorage(STORAGE_KEYS.speed) ?? config.autoDefaultSeconds, { save: false });

  buildBoard();
  buildRecent();
  // Auto mode is never restored: after a reload it waits for the caller.
  setState(loadGame());
  renderAuto();
  renderFullscreen();
  bindEvents();
  document.body.dataset.ready = 'true';
}

init();
