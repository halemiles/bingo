// The /dev/ page: one button per scenario. Choosing one writes its game into
// localStorage (the dev server and the app share an origin) and opens the app.
import { SCENARIOS, GAME_KEY } from './scenarios.js';

function load(scenario) {
  if (scenario.game === null) localStorage.removeItem(GAME_KEY);
  else localStorage.setItem(GAME_KEY, JSON.stringify(scenario.game));
  location.assign('/');
}

const items = SCENARIOS.map((scenario) => {
  const item = document.createElement('li');
  item.className = 'scenario';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = scenario.title;
  button.dataset.scenario = scenario.id;
  button.addEventListener('click', () => load(scenario));

  const description = document.createElement('p');
  description.textContent = scenario.description;
  item.append(button, description);

  if (scenario.claim) {
    const claim = document.createElement('pre');
    claim.textContent = scenario.claim.map((line) => line.join(' ')).join('\n');
    claim.title = 'Paste into Check claim';
    item.append(claim);
  }
  return item;
});

document.getElementById('scenarios').replaceChildren(...items);
