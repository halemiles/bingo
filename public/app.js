// UI wiring: renders game state, runs the auto timer, speaks the balls,
// handles input and persistence. Game rules live in game.js.

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
  recordClaim,
} from './game.js';
import { timeline, summary, historyText, historyFileName } from './history.js';
import { NUMBERS_PER_LINE, parseClaim, checkClaim, describeResult } from './claims.js';
import { spokenText } from './speech-text.js';
import { localVoices, chooseVoice, voiceLabel } from './voices.js';
import { loadCalls } from './calls.js';
import { loadConfig, clampSpeed } from './config.js';

const STORAGE_KEYS = {
  game: 'bingo.game.v1',
  speed: 'bingo.speedSeconds.v1',
  voiceOn: 'bingo.voiceOn.v1',
  voiceURI: 'bingo.voiceURI.v1',
};
const CURSOR_HIDE_MS = 3000;
// Auto mode waits for the voice to finish, but never longer than this, in
// case the browser doesn't say it's done.
const SPEECH_TIMEOUT_MS = 8000;
// A touch slower than normal, for a room.
const SPEECH_RATE = 0.9;
// Shown greyed out in an empty claim box, one made-up ticket line per row.
const EXAMPLE_LINES = ['4 23 45 61 88', '7 19 32 50 77', '2 16 38 64 81'];
const COUNTDOWN_REFRESH_MS = 100;

const $ = (id) => document.getElementById(id);
const el = {
  voiceControls: $('voice-controls'),
  voice: $('voice'),
  voicePickerWrap: $('voice-picker-wrap'),
  voicePicker: $('voice-picker'),
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
  history: $('history'),
  historyDialog: $('history-dialog'),
  historySummary: $('history-summary'),
  historyTimeline: $('history-timeline'),
  historyDownload: $('history-download'),
  historyClose: $('history-close'),
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
  const speaking = speakBall(currentBall(state));
  if (auto.running) {
    // The last ball stops auto but is still said in full.
    if (isFinished(state)) stopAuto();
    else if (speaking) waitThenSchedule(speaking);
    else scheduleNextBall();
  }
}

async function undoBall() {
  if (state.drawnCount === 0) return;
  stopAuto();
  stopSpeaking();
  const ball = currentBall(state);
  if (await confirmAction(`Undo ball ${ball}? It goes back in the machine.`, 'Undo')) {
    setState(undo(state));
  }
}

async function startNewGame() {
  if (state.drawnCount === 0) return;
  stopAuto();
  stopSpeaking();
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
  // Every check goes in the game history, wins and misses alike.
  setState(recordClaim(state, lines, result));
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

// `waiting` is true while the voice is still saying the last ball. `turn`
// counts schedules, so a voice that finishes after auto was paused, or after
// another ball was released, can't start a stale countdown.
const auto = { running: false, timer: null, ticker: null, nextAt: 0, intervalMs: 0, waiting: false, turn: 0 };

function scheduleNextBall() {
  clearTimeout(auto.timer);
  auto.turn++;
  auto.waiting = false;
  auto.intervalMs = speedSeconds * 1000;
  auto.nextAt = Date.now() + auto.intervalMs;
  auto.timer = setTimeout(releaseBall, auto.intervalMs);
  renderCountdown();
}

// The countdown to the next ball starts once the voice has finished.
function waitThenSchedule(speaking) {
  clearTimeout(auto.timer);
  const turn = ++auto.turn;
  auto.waiting = true;
  renderCountdown();
  speaking.then(() => {
    if (auto.running && turn === auto.turn) scheduleNextBall();
  });
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
  auto.turn++;
  clearTimeout(auto.timer);
  clearInterval(auto.ticker);
  renderAuto();
}

function toggleAuto() {
  if (auto.running) {
    stopAuto();
    stopSpeaking();
  } else {
    startAuto();
  }
}

function renderAuto() {
  el.auto.setAttribute('aria-pressed', String(auto.running));
  el.autoLabel.textContent = auto.running ? 'Pause' : 'Auto';
  el.countdown.hidden = !auto.running;
  if (!auto.running) el.auto.style.setProperty('--progress', '0');
}

function renderCountdown() {
  if (!auto.running) return;
  if (auto.waiting) {
    el.auto.style.setProperty('--progress', '0');
    el.countdown.textContent = '🔊';
    el.countdown.title = 'Speaking; the countdown starts when the voice has finished';
    return;
  }
  const remainingMs = Math.max(auto.nextAt - Date.now(), 0);
  el.auto.style.setProperty('--progress', String(1 - remainingMs / auto.intervalMs));
  el.countdown.textContent = `${Math.ceil(remainingMs / 1000)}s`;
  el.countdown.title = 'Time to the next ball';
}

function setSpeed(seconds, { save = true } = {}) {
  speedSeconds = clampSpeed(seconds, config);
  el.speed.value = String(speedSeconds);
  el.speedValue.textContent = `${speedSeconds}s`;
  if (save) writeStorage(STORAGE_KEYS.speed, speedSeconds);
  // A new speed applies from the next ball; the current countdown finishes as is.
}

// ---------- Game history ----------

function openHistory() {
  stopAuto();
  renderHistory();
  showDialog(el.historyDialog, el.historyClose);
  // Newest at the bottom, where the eye goes after a claim.
  el.historyTimeline.scrollTop = el.historyTimeline.scrollHeight;
}

function renderHistory() {
  el.historySummary.textContent = summary(state);
  const nodes = [];
  let balls = null; // the run of balls being added to
  for (const row of timeline(state)) {
    if (row.kind === 'ball') {
      if (!balls) {
        balls = document.createElement('ol');
        balls.className = 'history__balls';
        nodes.push(balls);
      }
      const item = document.createElement('li');
      item.className = 'history__ball';
      item.dataset.position = String(row.position);
      item.textContent = String(row.ball);
      item.setAttribute('aria-label', `Ball ${row.position}: ${row.ball}`);
      balls.append(item);
      continue;
    }
    balls = null;
    const event = document.createElement('div');
    event.className = `history__event history__event--${row.kind}`;
    const text = document.createElement('p');
    text.textContent = row.text;
    event.append(text);
    if (row.kind === 'claim') {
      event.classList.toggle('is-win', row.won);
      if (row.note) text.append(` ${row.note}`);
      for (const line of row.lines) {
        const numbers = document.createElement('p');
        numbers.className = 'history__numbers';
        numbers.textContent = line.join(' ');
        event.append(numbers);
      }
    }
    nodes.push(event);
  }
  if (nodes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history__empty';
    empty.textContent = 'No balls called yet.';
    nodes.push(empty);
  }
  el.historyTimeline.replaceChildren(...nodes);
}

// A plain-text copy, saved by the browser like any download. Works over
// plain http on the LAN, unlike the clipboard.
function downloadHistory() {
  const now = new Date();
  const exportedAt = now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const url = URL.createObjectURL(new Blob([historyText(state, exportedAt)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = historyFileName(now);
  document.body.append(link);
  link.click();
  link.remove();
  // Firefox needs the URL until the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- Voice ----------

// Off by default, so the child caller stays the star. Uses the browser's
// own speech (Web Speech API): nothing is sent off the device.
const voice = {
  supported:
    typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function',
  on: false,
  voices: [], // the local voices offered in the picker
  chosen: null, // null means the browser's default voice
};

function initVoice() {
  el.voiceControls.hidden = !voice.supported;
  if (!voice.supported) return;
  voice.on = readStorage(STORAGE_KEYS.voiceOn) === true;
  loadVoices();
  // Browsers fill in the voice list after the page loads.
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

function loadVoices() {
  voice.voices = localVoices(speechSynthesis.getVoices());
  voice.chosen = chooseVoice(voice.voices, readStorage(STORAGE_KEYS.voiceURI));
  el.voicePicker.replaceChildren(
    ...voice.voices.map((v) => {
      const option = document.createElement('option');
      option.value = v.voiceURI;
      option.textContent = voiceLabel(v);
      return option;
    }),
  );
  if (voice.chosen) el.voicePicker.value = voice.chosen.voiceURI;
  renderVoice();
}

function renderVoice() {
  el.voice.setAttribute('aria-pressed', String(voice.on));
  el.voicePickerWrap.hidden = !voice.on || voice.voices.length === 0;
}

function toggleVoice() {
  if (!voice.supported) return;
  voice.on = !voice.on;
  writeStorage(STORAGE_KEYS.voiceOn, voice.on);
  if (!voice.on) stopSpeaking();
  renderVoice();
}

function pickVoice() {
  voice.chosen = voice.voices.find((v) => v.voiceURI === el.voicePicker.value) ?? null;
  writeStorage(STORAGE_KEYS.voiceURI, el.voicePicker.value);
  // Hand the keyboard back, so Space releases a ball rather than opening the list.
  el.voicePicker.blur();
}

function stopSpeaking() {
  if (voice.supported) speechSynthesis.cancel();
}

// Says the ball. Returns a promise that settles once it has been said, or
// after SPEECH_TIMEOUT_MS if the browser never reports it, or null when the
// voice is off and there's nothing to wait for.
function speakBall(ball) {
  if (!voice.on) return null;
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spokenText(ball, calls.get(ball)));
  utterance.lang = voice.chosen?.lang ?? 'en-GB';
  if (voice.chosen) utterance.voice = voice.chosen;
  utterance.rate = SPEECH_RATE;
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, SPEECH_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    utterance.addEventListener('end', done);
    utterance.addEventListener('error', done);
    speechSynthesis.speak(utterance);
  });
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
  const action = { a: toggleAuto, f: toggleFullscreen, c: openClaim, n: advanceStage, m: toggleVoice, h: openHistory }[
    event.key.toLowerCase()
  ];
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
  el.voice.addEventListener('click', toggleVoice);
  el.history.addEventListener('click', openHistory);
  el.historyDownload.addEventListener('click', downloadHistory);
  el.voicePicker.addEventListener('change', pickVoice);

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
  initVoice();
  // Auto mode is never restored: after a reload it waits for the caller.
  setState(loadGame());
  renderAuto();
  renderFullscreen();
  bindEvents();
  document.body.dataset.ready = 'true';
}

init();
