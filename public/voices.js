// Choosing a voice from the ones the browser offers. Pure, no DOM: it takes
// plain objects shaped like SpeechSynthesisVoice ({ name, lang, voiceURI,
// localService }), so it runs under `node --test`.

const normaliseLang = (lang) => String(lang ?? '').replace('_', '-').toLowerCase();

// Only voices that run on the device. Network voices (e.g. Chrome's "Google
// UK English") send the text off to a server, and stop when the Wi-Fi does.
// British English first, then other English, then the rest, each by name.
export function localVoices(voices) {
  return [...voices]
    .filter((voice) => voice.localService === true)
    .sort((a, b) => langRank(b) - langRank(a) || a.name.localeCompare(b.name));
}

function langRank(voice) {
  const lang = normaliseLang(voice.lang);
  if (lang === 'en-gb') return 2;
  return lang.startsWith('en') ? 1 : 0;
}

// Daniel is the British English voice on macOS. A downloaded Premium or
// Enhanced version sounds much better, so it beats the compact one.
function preference(voice) {
  const quality = /premium/i.test(voice.name) ? 2 : /enhanced/i.test(voice.name) ? 1 : 0;
  const daniel = /^daniel\b/i.test(voice.name) ? 1 : 0;
  return [langRank(voice), daniel, quality];
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// The voice to use: the one saved earlier if it's still installed, otherwise
// the best British English voice, otherwise whatever there is. Returns null
// when there are no local voices at all.
export function chooseVoice(voices, savedURI) {
  const saved = voices.find((voice) => voice.voiceURI === savedURI);
  if (saved) return saved;
  let best = null;
  for (const voice of voices) {
    if (best === null || compare(preference(voice), preference(best)) > 0) best = voice;
  }
  return best;
}

export function voiceLabel(voice) {
  return `${voice.name} (${voice.lang})`;
}
