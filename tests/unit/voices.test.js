import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localVoices, chooseVoice, voiceLabel } from '../../public/voices.js';

const voice = (name, lang, localService = true) => ({ name, lang, localService, voiceURI: `uri:${name}` });

const daniel = voice('Daniel', 'en-GB');
const danielEnhanced = voice('Daniel (Enhanced)', 'en-GB');
const kate = voice('Kate', 'en-GB');
const samantha = voice('Samantha', 'en-US');
const thomas = voice('Thomas', 'fr-FR');
const googleUk = voice('Google UK English Male', 'en-GB', false);

test('localVoices hides network voices', () => {
  const names = localVoices([googleUk, daniel, samantha]).map((v) => v.name);
  assert.deepEqual(names, ['Daniel', 'Samantha']);
});

test('localVoices drops voices that do not say they are local', () => {
  assert.deepEqual(localVoices([{ name: 'Odd', lang: 'en-GB', voiceURI: 'odd' }]), []);
});

test('localVoices lists British English first, then other English, then the rest', () => {
  const names = localVoices([thomas, samantha, kate, daniel]).map((v) => v.name);
  assert.deepEqual(names, ['Daniel', 'Kate', 'Samantha', 'Thomas']);
});

test('localVoices copes with underscores and odd casing in language tags', () => {
  const names = localVoices([samantha, voice('Serena', 'en_gb')]).map((v) => v.name);
  assert.deepEqual(names, ['Serena', 'Samantha']);
  assert.deepEqual(localVoices([voice('NoLang', undefined)]).map((v) => v.name), ['NoLang']);
});

test('chooseVoice defaults to Daniel on a Mac', () => {
  assert.equal(chooseVoice([samantha, kate, daniel, thomas]), daniel);
});

test('chooseVoice prefers a downloaded Premium or Enhanced Daniel', () => {
  assert.equal(chooseVoice([daniel, danielEnhanced]), danielEnhanced);
  const premium = voice('Daniel (Premium)', 'en-GB');
  assert.equal(chooseVoice([danielEnhanced, premium, daniel]), premium);
});

test('chooseVoice falls back to any British English, then any English, then anything', () => {
  assert.equal(chooseVoice([samantha, kate]), kate);
  assert.equal(chooseVoice([thomas, samantha]), samantha);
  assert.equal(chooseVoice([thomas]), thomas);
  assert.equal(chooseVoice([]), null);
});

test('chooseVoice keeps the saved voice while it is still installed', () => {
  assert.equal(chooseVoice([daniel, samantha], 'uri:Samantha'), samantha);
  assert.equal(chooseVoice([daniel, kate], 'uri:Samantha'), daniel);
  assert.equal(chooseVoice([daniel, kate], null), daniel);
});

test('chooseVoice keeps list order between equally good voices', () => {
  assert.equal(chooseVoice([kate, voice('Serena', 'en-GB')]), kate);
});

test('voiceLabel shows the name and language', () => {
  assert.equal(voiceLabel(daniel), 'Daniel (en-GB)');
});
