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
  STAGES,
  setStage,
  nextStage,
  isLastStage,
  restoreGame,
} from './game.js';
import { NUMBERS_PER_LINE, parseClaim, checkClaim, describeResult } from './claims.js';
import { loadCalls } from './calls.js';
import { loadConfig, clampSpeed } from './config.js';

const STORAGE_KEYS = {
  game: 'bingo.game.v1',
  speed: 'bingo.speedSeconds.v1',
};
const CURSOR_HIDE_MS = 3000;
// Shown greyed out in an empty claim box, one made-up ticket line per row.
const EXAMPLE_LINES = ['4 23 45 61 88', '7 19 32 50 77', '2 16 38 64 81'];
const COUNTDOWN_REFRESH_MS = 100;

const $ = (id) => document.getElementById(id);
const el = {
  stageBanner: $('stage-banner'),
  stageName: $('stage-name'),
  nextStage: $('next-stage'),
  check: $('check'),
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
  stagePicker: $('stage-picker'),
  stageOptions: $('stage-options'),
  claim: $('claim'),
  claimForm: $('claim-form'),
  claimTitle: $('claim-title'),
  claimEntry: $('claim-entry'),
  claimHint: $('claim-hint'),
  claimNumbers: $('claim-numbers'),
  claimErrors: $('claim-errors'),
  claimCancel: $('claim-cancel'),
  claimResult: $('claim-result'),
  claimVerdict: $('claim-verdict'),
  claimNote: $('claim-note'),
  claimLines: $('claim-lines'),
  claimClose: $('claim-close'),
  claimAgain: $('claim-again'),
  claimNext: $('claim-next'),
  claimNewGame: $('claim-new-game'),
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
  return restoreGame(readStorage(STORAGE_KEYS.game)) ?? newGame();
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

function buildStagePicker() {
  const buttons = STAGES.map(({ name }, i) => {
    const button = document.createElement('button');
    button.className = 'btn stage-option';
    button.value = String(i);
    button.textContent = name;
    return button;
  });
  el.stageOptions.replaceChildren(...buttons);
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

  el.stageName.textContent = STAGES[state.stage].name;
  el.nextStage.disabled = isLastStage(state);

  el.count.textContent = finished ? `All ${TOTAL_BALLS} called` : `${state.drawnCount} / ${TOTAL_BALLS} called`;
  el.release.disabled = finished;
  el.auto.disabled = finished;
  el.undo.disabled = state.drawnCount === 0;
  el.newGame.disabled = state.drawnCount === 0;
}

function restartAnimation(element, className) {
  // Removing the class and forcing a reflow lets the animation play again.
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
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
  restartAnimation(el.currentBall, 'pop');
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

// ---------- Prize stages ----------

function changeStage(next) {
  if (next === state) return;
  setState(next);
  restartAnimation(el.stageBanner, 'flash');
  el.announcer.textContent = `Now playing for ${STAGES[state.stage].name}`;
}

// Never automatic: several people can win on the same ball.
function advanceStage() {
  changeStage(nextStage(state));
}

// Clicking the banner picks a stage directly, to fix a mistake.
async function pickStage() {
  stopAuto();
  const buttons = [...el.stageOptions.children];
  buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === state.stage)));
  const choice = await showDialog(el.stagePicker, buttons[state.stage]);
  if (choice !== 'cancel' && choice !== '') changeStage(setStage(state, Number(choice)));
}

// ---------- Checking a claim ----------

function openClaim() {
  stopAuto();
  showDialog(el.claim, el.claimNumbers);
  showClaimEntry();
}

function showClaimEntry() {
  const { name, lines } = STAGES[state.stage];
  el.claimTitle.textContent = `Check a claim: ${name}`;
  el.claimHint.textContent =
    lines === 1
      ? `Type or paste the ${NUMBERS_PER_LINE} numbers of the line.`
      : `Type or paste the ${lines * NUMBERS_PER_LINE} numbers, one ticket line per line of text.`;
  el.claimNumbers.rows = lines;
  el.claimNumbers.placeholder = EXAMPLE_LINES.slice(0, lines).join('\n');
  el.claimNumbers.value = '';
  showClaimErrors([]);
  el.claimResult.hidden = true;
  el.claimEntry.hidden = false;
  el.claimNumbers.focus();
}

function showClaimErrors(errors) {
  el.claimErrors.replaceChildren(
    ...errors.map((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }),
  );
  if (errors.length) el.claimNumbers.setAttribute('aria-invalid', 'true');
  else el.claimNumbers.removeAttribute('aria-invalid');
}

function submitClaim(event) {
  event.preventDefault();
  const { lines, errors } = parseClaim(el.claimNumbers.value, STAGES[state.stage].lines);
  if (errors.length) {
    showClaimErrors(errors);
    el.claimNumbers.focus();
  } else {
    showClaimResult(lines);
  }
}

function showClaimResult(lines) {
  const result = checkClaim(lines, state);
  const { title, note } = describeResult(result, state.stage);
  el.claimVerdict.textContent = title;
  el.claimVerdict.classList.toggle('is-win', result.won);
  el.claimNote.textContent = note;
  el.claimNote.hidden = note === '';

  const missing = new Set(result.missing);
  el.claimLines.replaceChildren(
    ...lines.map((line) => {
      const row = document.createElement('ol');
      row.className = 'claim__line';
      for (const n of line) {
        const isCalled = !missing.has(n);
        const chip = document.createElement('li');
        chip.className = `chip ${isCalled ? 'is-called' : 'is-missing'}`;
        chip.textContent = String(n);
        chip.setAttribute('aria-label', isCalled ? `${n}, called` : `${n}, not called`);
        row.append(chip);
      }
      return row;
    }),
  );

  // Next stage only after a win, and a new game only after the full house;
  // neither is forced, so a shared win can be checked first.
  el.claimNext.hidden = !result.won || isLastStage(state);
  el.claimNewGame.hidden = !result.won || !isLastStage(state);
  el.claimEntry.hidden = true;
  el.claimResult.hidden = false;
  el.claimAgain.focus();
}

function onClaimKeyDown(event) {
  // Enter starts a new line, so Ctrl+Enter (Cmd+Enter on a Mac) checks.
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    el.claimForm.requestSubmit();
  }
}

function closeClaimThen(action) {
  el.claim.close();
  action();
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

// ---------- Dialogs ----------

// Opens a modal <dialog> and resolves with its returnValue when it closes.
// A native confirm() would kick the browser out of fullscreen.
function showDialog(dialog, focusTarget) {
  return new Promise((resolve) => {
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
    dialog.showModal();
    focusTarget.focus();
  });
}

function isDialogOpen() {
  return document.querySelector('dialog[open]') !== null;
}

async function confirmAction(message, okLabel) {
  el.confirmMessage.textContent = message;
  el.confirmOk.textContent = okLabel;
  // Default to the safe choice so a stray Space or Enter cancels.
  return (await showDialog(el.confirm, el.confirmCancel)) === 'ok';
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

// A text field counts only while it's showing. Focus stays on the claim box
// for a moment after its dialog closes, and Space then should release a ball.
function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    target.matches('input:not([type="range"]), textarea, select') &&
    !target.closest('dialog:not([open])')
  );
}

function onKeyDown(event) {
  if (isDialogOpen() || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;

  if (event.code === 'Space') {
    // Always "release ball", even if a button has focus, so a child pressing
    // Space never toggles something else by accident.
    event.preventDefault();
    if (!event.repeat) releaseBall();
    return;
  }
  if (event.repeat) return;
  const action = { a: toggleAuto, f: toggleFullscreen, c: openClaim, n: advanceStage }[event.key.toLowerCase()];
  if (!action) return;
  // Stops the C that opened the claim box being typed into it.
  event.preventDefault();
  action();
}

function onKeyUp(event) {
  // Buttons activate on Space keyup; swallow it so a focused button doesn't fire too.
  if (event.code === 'Space' && !isDialogOpen() && !isTypingTarget(event.target)) event.preventDefault();
}

function bindEvents() {
  el.release.addEventListener('click', releaseBall);
  el.auto.addEventListener('click', toggleAuto);
  el.undo.addEventListener('click', undoBall);
  el.newGame.addEventListener('click', startNewGame);
  el.fullscreen.addEventListener('click', toggleFullscreen);
  el.speed.addEventListener('input', () => setSpeed(Number(el.speed.value)));
  el.stageBanner.addEventListener('click', pickStage);
  el.nextStage.addEventListener('click', advanceStage);
  el.check.addEventListener('click', openClaim);

  el.claimForm.addEventListener('submit', submitClaim);
  el.claimNumbers.addEventListener('keydown', onClaimKeyDown);
  el.claimCancel.addEventListener('click', () => el.claim.close());
  el.claimClose.addEventListener('click', () => el.claim.close());
  el.claimAgain.addEventListener('click', showClaimEntry);
  el.claimNext.addEventListener('click', () => closeClaimThen(advanceStage));
  el.claimNewGame.addEventListener('click', () => closeClaimThen(startNewGame));

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
  buildStagePicker();
  // Auto mode is never restored: after a reload it waits for the caller.
  setState(loadGame());
  renderAuto();
  renderFullscreen();
  bindEvents();
  document.body.dataset.ready = 'true';
}

init();
