import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenText } from '../../public/speech-text.js';

test('a ball with a house call says the call exactly', () => {
  assert.equal(spokenText(88, 'Two fat ladies 88'), 'Two fat ladies 88');
  assert.equal(spokenText(4, 'Number 4 on his own'), 'Number 4 on his own');
});

test('two digits: each digit, then the number', () => {
  assert.equal(spokenText(47, undefined), '4 and 7, 47');
  assert.equal(spokenText(11, undefined), '1 and 1, 11');
  assert.equal(spokenText(89, undefined), '8 and 9, 89');
});

test('round tens use "oh"', () => {
  assert.equal(spokenText(10, undefined), '1 oh, 10');
  assert.equal(spokenText(50, undefined), '5 oh, 50');
});

test('90 reads as a round ten', () => {
  assert.equal(spokenText(90, undefined), '9 oh, 90');
});

test('single digits are on their own, like the house call for 4', () => {
  assert.equal(spokenText(1, undefined), 'Number 1 on his own');
  assert.equal(spokenText(5, undefined), 'Number 5 on his own');
  assert.equal(spokenText(9, undefined), 'Number 9 on his own');
});

test('a blank call falls back to the traditional reading', () => {
  assert.equal(spokenText(47, ''), '4 and 7, 47');
  assert.equal(spokenText(47, '   '), '4 and 7, 47');
  assert.equal(spokenText(47, null), '4 and 7, 47');
});

test('every ball from 1 to 90 has something to say', () => {
  for (let n = 1; n <= 90; n++) {
    const text = spokenText(n, undefined);
    assert.ok(text.endsWith(String(n)) || text.includes(`${n} on his own`), `${n}: ${text}`);
  }
});
