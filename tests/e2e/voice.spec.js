// Voice calling. The Web Speech API is stubbed (see stubSpeech in helpers.js),
// so these check what the app asks the browser to say, and when.
import { test, expect } from './fixtures.js';
import { open, openScenario, ui, stubSpeech, spoken } from './helpers.js';

const VOICE_ON_KEY = 'bingo.voiceOn.v1';

async function turnVoiceOn(page) {
  await page.keyboard.press('m');
  await expect(ui(page).voice).toHaveAttribute('aria-pressed', 'true');
}

const interrupted = (page) => page.evaluate(() => window.speech.interrupted);

test.describe('with speech support', () => {
  test.beforeEach(async ({ page }) => {
    await stubSpeech(page);
  });

  test('voice is off by default: nothing is said and the picker is hidden', async ({ page }) => {
    await openScenario(page, 'house-call-next');
    const $ = ui(page);
    await expect($.voice).toBeVisible();
    await expect($.voice).toHaveAttribute('aria-pressed', 'false');
    await expect($.voicePicker).toBeHidden();
    await page.keyboard.press('Space');
    await expect($.currentBall).toHaveText('88');
    expect(await spoken(page)).toEqual([]);
  });

  test('M turns voice on, and it stays on after a reload', async ({ page }) => {
    await openScenario(page, 'house-call-next');
    await turnVoiceOn(page);
    await expect(ui(page).voicePicker).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), VOICE_ON_KEY)).toBe('true');

    await page.reload();
    await expect(ui(page).voice).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    expect(await spoken(page)).toEqual(['Two fat ladies 88']);
  });

  test('the Voice button turns it off, cutting off anything being said', async ({ page }) => {
    await openScenario(page, 'house-call-next');
    await ui(page).voice.click();
    await expect(ui(page).voice).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');

    await ui(page).voice.click();
    await expect(ui(page).voice).toHaveAttribute('aria-pressed', 'false');
    await expect(ui(page).voicePicker).toBeHidden();
    expect(await interrupted(page)).toEqual(['Two fat ladies 88']);
    // Space still releases a ball with the Voice button focused, now silently.
    await page.keyboard.press('Space');
    expect(await spoken(page)).toHaveLength(1);
  });

  test('a house call is said exactly, in a British voice', async ({ page }) => {
    await openScenario(page, 'house-call-next');
    await turnVoiceOn(page);
    await page.keyboard.press('Space');
    await expect(ui(page).currentCall).toHaveText('Two fat ladies 88');
    const [said] = await page.evaluate(() => window.speech.spoken);
    expect(said).toEqual({ text: 'Two fat ladies 88', voice: 'Daniel', lang: 'en-GB', rate: 0.9 });
  });

  test('balls without a call get the traditional reading; the screen is unchanged', async ({ page }) => {
    await openScenario(page, 'traditional-next');
    await turnVoiceOn(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
    expect(await spoken(page)).toEqual(['4 and 7, 47', '5 oh, 50', 'Number 5 on his own', '9 oh, 90']);
    await expect(ui(page).currentBall).toHaveText('90');
    await expect(ui(page).currentCall).toHaveText('');
  });

  test('releasing a ball while the last one is being said cuts it short', async ({ page }) => {
    await openScenario(page, 'traditional-next');
    await turnVoiceOn(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    expect(await interrupted(page)).toEqual(['4 and 7, 47']);
    expect(await spoken(page)).toEqual(['4 and 7, 47', '5 oh, 50']);
  });

  test('the picker lists local voices only, defaults to Daniel, and remembers a choice', async ({ page }) => {
    await openScenario(page, 'traditional-next');
    await turnVoiceOn(page);
    const $ = ui(page);
    await expect($.voicePicker.locator('option')).toHaveText(['Daniel (en-GB)', 'Kate (en-GB)', 'Samantha (en-US)']);
    await expect($.voicePicker).toHaveValue('daniel');

    // A real pick focuses the list first; selectOption alone wouldn't.
    await $.voicePicker.focus();
    await $.voicePicker.selectOption('samantha');
    // Picking hands the keyboard back, so Space releases a ball, not the list.
    await expect($.voicePicker).not.toBeFocused();
    await page.keyboard.press('Space');
    expect((await page.evaluate(() => window.speech.spoken))[0]).toMatchObject({ voice: 'Samantha', lang: 'en-US' });
    expect(await page.evaluate(() => localStorage.getItem('bingo.voiceURI.v1'))).toBe('"samantha"');
  });

  test('a voice picked earlier is used again after a reload', async ({ page }) => {
    await open(page);
    await page.evaluate(() => localStorage.setItem('bingo.voiceURI.v1', JSON.stringify('kate')));
    await openScenario(page, 'traditional-next');
    await turnVoiceOn(page);
    await expect(ui(page).voicePicker).toHaveValue('kate');
    await page.keyboard.press('Space');
    expect((await page.evaluate(() => window.speech.spoken))[0]).toMatchObject({ voice: 'Kate' });
  });

  test('a saved voice that is no longer installed falls back to Daniel', async ({ page }) => {
    await open(page);
    await page.evaluate(() => localStorage.setItem('bingo.voiceURI.v1', JSON.stringify('uninstalled')));
    await openScenario(page, 'traditional-next');
    await turnVoiceOn(page);
    await expect(ui(page).voicePicker).toHaveValue('daniel');
  });

  test('undo and new game stop the voice', async ({ page }) => {
    await openScenario(page, 'traditional-next');
    const $ = ui(page);
    await turnVoiceOn(page);
    await page.keyboard.press('Space');
    await $.undo.click();
    expect(await interrupted(page)).toEqual(['4 and 7, 47']);
    await $.dialog.getByRole('button', { name: 'Cancel' }).click();

    await page.keyboard.press('Space');
    await $.newGame.click();
    expect(await interrupted(page)).toEqual(['4 and 7, 47', '5 oh, 50']);
  });
});

test.describe('voice in auto mode', () => {
  test.beforeEach(async ({ page }) => {
    await stubSpeech(page);
    const start = new Date('2026-01-01T19:00:00Z');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('the countdown to the next ball starts once the voice has finished', async ({ page }) => {
    await openScenario(page, 'traditional-next');
    const $ = ui(page);
    await turnVoiceOn(page);
    await $.auto.click();
    await page.clock.runFor(5_000);
    await expect($.currentBall).toHaveText('47');
    await expect($.countdown).toContainText('Speaking…');

    await page.clock.runFor(3_000);
    await expect($.currentBall).toHaveText('47');
    await expect($.countdown).toContainText('Speaking…');

    await page.evaluate(() => window.finishSpeaking());
    await expect($.countdown).toContainText('Next in 5s');
    await page.clock.runFor(5_000);
    await expect($.currentBall).toHaveText('50');
    expect(await spoken(page)).toEqual(['4 and 7, 47', '5 oh, 50']);
  });

  test('a voice that never says it has finished holds auto for 8 seconds at most', async ({ page }) => {
    await openScenario(page, 'traditional-next');
    const $ = ui(page);
    await turnVoiceOn(page);
    await $.auto.click();
    await page.clock.runFor(5_000);
    await expect($.currentBall).toHaveText('47');

    await page.clock.runFor(7_900);
    await expect($.countdown).toContainText('Speaking…');
    await page.clock.runFor(200);
    await expect($.countdown).toContainText('Next in 5s');
    await page.clock.runFor(5_000);
    await expect($.currentBall).toHaveText('50');
  });

  test('pausing auto stops the voice, and a late finish does not restart it', async ({ page }) => {
    await openScenario(page, 'traditional-next');
    const $ = ui(page);
    await turnVoiceOn(page);
    await $.auto.click();
    await page.clock.runFor(5_000);
    await page.keyboard.press('a');
    await expect($.auto).toHaveAttribute('aria-pressed', 'false');
    expect(await interrupted(page)).toEqual(['4 and 7, 47']);

    await page.clock.runFor(30_000);
    await expect($.currentBall).toHaveText('47');
    await expect($.countdown).toBeHidden();
  });

  test('a ball released by hand while auto waits on the voice restarts the wait', async ({ page }) => {
    await openScenario(page, 'traditional-next');
    const $ = ui(page);
    await turnVoiceOn(page);
    await $.auto.click();
    await page.clock.runFor(5_000);
    await page.keyboard.press('Space');
    await expect($.currentBall).toHaveText('50');
    await expect($.countdown).toContainText('Speaking…');
    await page.evaluate(() => window.finishSpeaking());
    await expect($.countdown).toContainText('Next in 5s');
    await page.clock.runFor(5_000);
    await expect($.currentBall).toHaveText('5');
  });

  test('the last ball is said in full when auto stops at the end', async ({ page }) => {
    await openScenario(page, 'last-ball');
    const $ = ui(page);
    await turnVoiceOn(page);
    await $.auto.click();
    await page.clock.runFor(5_000);
    await expect($.currentBall).toHaveText('90');
    await expect($.auto).toHaveAttribute('aria-pressed', 'false');
    expect(await spoken(page)).toEqual(['9 oh, 90']);
    expect(await interrupted(page)).toEqual([]);
  });
});

test('voices that arrive after the page loads are offered', async ({ page }) => {
  await stubSpeech(page, { late: true });
  await openScenario(page, 'traditional-next');
  const $ = ui(page);
  await turnVoiceOn(page);
  // No voices yet: nothing to pick, and speech uses the browser's default.
  await expect($.voicePicker).toBeHidden();
  await page.keyboard.press('Space');
  expect((await page.evaluate(() => window.speech.spoken))[0]).toMatchObject({ voice: null, lang: 'en-GB' });

  await page.evaluate(() => window.loadVoices());
  await expect($.voicePicker).toBeVisible();
  await expect($.voicePicker).toHaveValue('daniel');
});

test('without speech support the voice controls are hidden and M does nothing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
  });
  await openScenario(page, 'house-call-next');
  const $ = ui(page);
  await expect($.voice).toBeHidden();
  await page.keyboard.press('m');
  await page.keyboard.press('Space');
  await expect($.currentBall).toHaveText('88');
  // Undo still works with nothing to silence.
  await $.undo.click();
  await $.dialog.getByRole('button', { name: 'Undo' }).click();
  await expect($.count).toHaveText('3 / 90 called');
});
