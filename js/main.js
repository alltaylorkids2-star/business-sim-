// App shell: top bar + screen router (home → wizard → per-mode game screen → exit day).
import { el, clear, toast, modal, downloadText } from './ui/components.js';
import { renderHome, MODES } from './ui/home.js';
import { renderWizard } from './ui/wizard.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderTeamMode } from './ui/teamMode.js';
import { renderExitDay } from './ui/exitDay.js';
import { newGame, loadGame, saveGame, clearSave, exportGame, importGame, logText, firstCompany } from './state.js';
import { mulberry32 } from './rng.js';

const app = document.getElementById('app');
let game = null;
let rng = null;

function route(screen, arg) {
  clear(app);
  if (!game) { document.body.dataset.mode = ''; renderHome(app, { startGame }); return; }
  document.body.dataset.mode = game.mode;
  app.append(topbar(screen));
  const body = el('div', {});
  app.append(body);
  if (screen === 'wizard') renderWizard(body, game, { onCompanyCreated: () => route('play') });
  else if (screen === 'play') {
    if (game.mode === 'team') renderTeamMode(body, game, ctx);
    else renderDashboard(body, game, ctx);
  }
  else if (screen === 'exit') renderExitDay(body, game, ctx);
  saveGame(game);
}

const ctx = {
  get rng() { return rng; },
  goHome: () => { game = null; route(); },
  goExitDay: () => route('exit'),
};

function startGame(g) {
  game = g;
  rng = mulberry32(g.seed);
  // advance the rng past wizard rolls so reloads don't replay identically
  rng = mulberry32(g.seed ^ (g.log.length + 1));
  if (!g.order.length) route('wizard');
  else route('play');
}

/* ------------------------------------------------------------ top bar ------- */

function topbar(screen) {
  const c = game.order.length ? firstCompany(game) : null;
  const bar = el('div', { class: 'topbar' },
    el('span', { class: 'brand' }, el('span', { class: 'logo' }, '📈'), ' Business Sim '),
    el('span', { class: 'co' }, c ? `${game.mode === 'team' ? `${game.order.length} teams` : c.name} · ${MODES[game.mode].name} · Month ${game.market.month}` : MODES[game.mode].name),
    el('span', { class: 'spacer' }),
  );

  if (screen === 'play' && game.mode !== 'team') {
    bar.append(el('button', { class: 'btn', onclick: () => route('exit') }, '🏁 Exit Day'));
  }
  if (screen === 'exit') {
    bar.append(el('button', { class: 'btn', onclick: () => route('play') }, '← Back to game'));
  }
  bar.append(
    el('button', { class: 'btn', onclick: exportSave }, '💾 Export save'),
    el('button', { class: 'btn', onclick: () => downloadText('bizsim-log.txt', logText(game), 'text/plain') }, '📜 Log'),
    el('button', {
      class: 'btn danger ghost', onclick: () => modal({
        title: 'Start over?',
        body: el('p', {}, 'This wipes the current simulation from this browser. Export a save first if you want to keep it.'),
        actions: [{ label: 'Keep playing' }, { label: 'Wipe & new game', kind: 'danger', onClick: () => { clearSave(); game = null; route(); } }],
      }),
    }, '⟲ New'),
  );
  return bar;
}

function exportSave() {
  downloadText(`bizsim-save-${new Date().toISOString().slice(0, 10)}.json`, exportGame(game));
  toast('Save file downloaded — import it next class to resume exactly here.');
}

/* --------------------------------------------------------------- boot ------- */

// The home screen itself offers "Continue" when a saved game exists (it reads
// localStorage directly), so boot is simply: show home.
renderHome(app, { startGame });
