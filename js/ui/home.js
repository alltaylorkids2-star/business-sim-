// Home screen: mode select, continue saved game, import a save.
import { el, clear, toast, downloadText, modal } from './components.js';
import { newGame, loadGame, importGame, saveGame, logText } from '../state.js';
import { rollSeed } from '../rng.js';

export const MODES = {
  beginner: {
    emoji: '🌱', name: 'Beginner', tag: 'Simple mode',
    desc: 'New to entrepreneurship? Track 4 headline numbers, get suggested directions each round, plain-language explanations, and tooltips for every business term.',
  },
  advanced: {
    emoji: '📊', name: 'Advanced', tag: 'Real lingo mode',
    desc: 'CAC, LTV, burn, runway, churn, cap tables, valuations. Mini P&L each round, simulated investor term sheets, and rival companies that fight back.',
  },
  teacher: {
    emoji: '🍎', name: 'Teacher Scenario', tag: 'Whole class, one decision',
    desc: 'Inject a real-world scenario ("a supplier just doubled prices"), project the business state, collect ONE class decision, and see the outcome — plus what the other choices would have done.',
  },
  team: {
    emoji: '🏆', name: 'Team vs. Team', tag: 'Class competition',
    desc: '2–6 teams compete in ONE shared market. Pricing, ad spend and quality genuinely affect rivals. Simultaneous decisions, public signals, private books, live leaderboard.',
  },
};

export function renderHome(root, { startGame }) {
  document.body.dataset.mode = '';
  const continueRow = el('div', { style: { marginTop: '26px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' } });
  const saved = loadGame();
  if (saved && saved.order?.length) {
    continueRow.append(
      el('button', { class: 'btn big primary', onclick: () => startGame(saved) }, `▶ Continue — ${saved.companies[saved.order[0]].name} (${MODES[saved.mode]?.name} mode, month ${saved.market.month})`),
      el('button', { class: 'btn big', onclick: () => { downloadText(`bizsim-log-${new Date().toISOString().slice(0, 10)}.txt`, logText(saved), 'text/plain'); toast('Log downloaded'); } }, 'Export running log'),
    );
  }
  const importBtn = el('button', {
    class: 'btn big',
    onclick: () => {
      const input = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      input.addEventListener('change', async () => {
        try {
          const g = importGame(await input.files[0].text());
          saveGame(g);
          startGame(g);
        } catch (err) { toast(err.message, { err: true }); }
      });
      document.body.append(input); input.click(); setTimeout(() => input.remove(), 5000);
    },
  }, 'Import a save file');

  clear(root).append(
    el('div', { class: 'wrap' },
      el('div', { class: 'hero' },
        el('div', { class: 'hero-badge' }, 'Advanced Entrepreneurship · Classroom Edition'),
        el('h1', {}, '📈 Business Simulator'),
        el('p', {}, 'Found a business of your own design. Make any decision a real founder could make. Live with the realistic consequences — cash, morale, reputation, competition. Run out of money and it\'s over. That\'s the lesson.'),
        continueRow,
        el('div', { style: { marginTop: '12px' } }, importBtn),
      ),
      el('h2', { style: { textAlign: 'center', marginTop: '26px' } }, 'Choose a mode'),
      el('div', { class: 'mode-grid' },
        Object.entries(MODES).map(([key, m]) =>
          el('button', { class: 'mode-card', style: { '--accent': { beginner: '#0e9f6e', advanced: '#4f46e5', teacher: '#b87207', team: '#be3455' }[key] }, onclick: () => confirmMode(key, startGame) },
            el('div', { class: 'emoji' }, m.emoji),
            el('h3', {}, m.name),
            el('p', {}, m.desc),
            el('span', { class: 'tag', style: { background: 'var(--accent-soft)', color: 'var(--accent)' } }, m.tag),
          )
        ),
      ),
      el('footer', { class: 'foot' }, 'Built from the Business Simulator Master Prompt · realism guardrails on · failure is on the table'),
    ),
  );
}

function confirmMode(mode, startGame) {
  const kickoffs = {
    beginner: '“Let’s build your business! Tell me your idea — anything you want — and I’ll set you up with a realistic starting budget. Each round you can try whatever you want, and I’ll show you what really happens.”',
    advanced: '“Pitch me your startup — industry, business model, whatever you’ve got. I’ll set your starting cap table and burn rate, and from there you have full control: raise money, pivot, compete, hire and fire, whatever a real founder could do.”',
    teacher: '“I’m the teacher running this for my class. You’ll set up one shared class business, inject scenarios, and I’ll simulate the class’s collective decisions — plus the roads not taken.”',
    team: '“Each team builds its own business, then all teams compete in one simulated market. Pricing, ads and quality affect each other. Books stay private; signals are public.”',
  };
  modal({
    title: `${MODES[mode].emoji} ${MODES[mode].name} mode`,
    body: el('div', {},
      el('p', { style: { fontStyle: 'italic', color: 'var(--ink-soft)' } }, kickoffs[mode]),
      mode === 'team' ? el('p', { class: 'micro' }, 'You\'ll create each team one at a time (2–6 teams), then compete month by month.') : null,
    ),
    actions: [
      { label: 'Back' },
      { label: mode === 'team' ? 'Set up teams →' : 'Start the Business Wizard →', kind: 'primary', onClick: () => startGame(newGame(mode, rollSeed())) },
    ],
  });
}
