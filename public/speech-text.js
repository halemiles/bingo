// What the voice says for a ball. Pure, no DOM, so it runs under `node --test`.
//
// A house call from calls.json is said exactly as written. Otherwise it's the
// traditional reading: each digit, then the number ("4 and 7, 47"), with "oh"
// for a round ten ("5 oh, 50") and single digits "on their own", matching the
// house call for 4. The words on screen don't change; this is only spoken.

export function spokenText(ball, call) {
  if (typeof call === 'string' && call.trim() !== '') return call;
  const tens = Math.floor(ball / 10);
  const units = ball % 10;
  if (tens === 0) return `Number ${ball} on his own`;
  if (units === 0) return `${tens} oh, ${ball}`;
  return `${tens} and ${units}, ${ball}`;
}
