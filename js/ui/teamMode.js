// Mode 4 screen: shared market, simultaneous decisions, leaderboard, public signals.
import { el, clear, toast, modal, kpi, meter, gP, gloss, emptyNote } from './components.js';
import { INDUSTRIES } from '../industries.js';
import { fmtMoney, fmtPct, fmtInt } from '../util.js';
import { renderWizard } from './wizard.js';
import { initMarket, stageDecision, allStaged, resolveMarketRound, marketReport, signal } from '../team.js';
import { saveGame, log } from '../state.js';
import { computeFlags, runway } from '../engine.js';

export function renderTeamMode(root, game, ctx) {
  clear(root);
  const wrap = el('div', { class: 'wrap fade' });
  root.append(wrap);
  if (!game.market || game.market.signals === undefined) initMarket(game);
  const mkt = game.market;

  /* Phase 1: onboard teams through the wizard, one at a time. */
  const TARGET = game.teamTarget;
  if (!TARGET) {
    const input = el('input', { type: 'text', inputmode: 'numeric', value: '3', style: { width: '80px', border: '1.5px solid var(--line)', borderRadius: '10px', padding: '10px', fontSize: '1.1rem', textAlign: 'center' } });
    wrap.append(
      el('div', { class: 'wizard' }, el('div', { class: 'card fade' },
        el('h2', {}, '🏆 How many teams are competing?'),
        el('p', { class: 'hint' }, 'Each team runs its own Business Creation Wizard, then all teams share one simulated market. Decisions are collected privately and resolved simultaneously — like real competitors.'),
        el('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } }, input, el('button', {
          class: 'btn primary big', onclick: () => {
            const n = Math.max(2, Math.min(6, parseInt(input.value, 10) || 0));
            game.teamTarget = n; saveGame(game); renderTeamMode(root, game, ctx);
          },
        }, 'Set up teams →')))));
    return;
  }
  if (game.order.length < TARGET) {
    const idx = game.order.length;
    wrap.append(el('div', { class: 'panel', style: { maxWidth: '720px', margin: '30px auto 0' } },
      el('h2', {}, `Team ${idx + 1} of ${TARGET} — build your business`),
      el('p', { class: 'hint' }, `Teams already in the market: ${game.order.map((id) => game.companies[id].name).join(', ') || 'none yet'}.`),
    ));
    const holder = el('div');
    wrap.append(holder);
    renderWizard(holder, game, { onCompanyCreated: () => { saveGame(game); renderTeamMode(root, game, ctx); } });
    return;
  }

  /* Phase 2: the competitive market. */
  const live = game.order.map((id) => game.companies[id]);

  wrap.append(
    el('div', { class: 'kpis' },
      kpi('📅 Market month', String(mkt.month)),
      kpi('🌦️ Economy', mkt.econIndex > 1.05 ? 'Growing' : mkt.econIndex < 0.95 ? 'Contracting' : 'Stable', `index ${(mkt.econIndex ?? 1).toFixed(2)}`),
      kpi('📣 Ad price index', (mkt.adPriceIndex ?? 1).toFixed(2) + '×', mkt.adPriceIndex > 1.3 ? 'ad war in progress' : 'normal', mkt.adPriceIndex > 1.3 ? 'bad' : ''),
      kpi('🏁 Teams alive', `${live.filter((c) => c.status === 'active').length} / ${live.length}`),
    ),
  );

  const grid = el('div', { class: 'grid2' });
  wrap.append(grid);
  const left = el('div'), right = el('div');
  grid.append(left, right);

  /* Leaderboard */
  const lb = el('div', { class: 'panel leaderboard' }, el('h2', {}, '🏆 Leaderboard ', el('span', { class: 'sub' }, 'cash + founder equity value')));
  const board = mkt.leaderboard || live.map((c) => ({ cid: c.id, name: c.name, status: c.status, score: c.cash, detail: 'waiting for month 1' }));
  board.forEach((row, i) => {
    lb.append(el('div', { class: `team-row ${row.status !== 'active' ? 'dead' : ''}` },
      el('span', { class: 'rank' }, `#${i + 1}`),
      el('span', { class: 'grow' }, el('b', {}, row.name), el('div', { class: 'micro' }, row.status === 'active' ? (mkt.privateBooks ? row.detail : row.detail) : row.detail)),
      el('span', { class: 'score mono' }, row.status === 'active' ? fmtMoney(row.score) : 'OUT'),
    ));
  });
  lb.append(el('label', { class: 'micro', style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' } },
    checkbox(mkt.privateBooks, (v) => { mkt.privateBooks = v; saveGame(game); toast(v ? 'Books are private — signals only.' : 'Open-book mode'); }),
    'Keep internal numbers private (realistic: competitors don\'t see each other\'s books)',
  ));
  left.append(lb);

  /* Public signals feed */
  const sigPanel = el('div', { class: 'panel feed' }, el('h2', {}, '📡 Market signals ', el('span', { class: 'sub' }, 'public: pricing, ad blitzes, launches, press — internals stay hidden')));
  const sigs = (mkt.signals || []).slice(-10).reverse();
  if (!sigs.length) sigPanel.append(emptyNote('No market-visible moves yet.'));
  for (const s of sigs) sigPanel.append(el('div', { class: 'entry event' }, el('div', { class: 'when' }, `Month ${s.month}`), gP(s.text)));
  left.append(sigPanel);

  /* Decision collection: private per-team staging */
  const pendingCount = Object.keys(mkt.pending || {}).length;
  const activeTeams = live.filter((c) => c.status === 'active');
  const stagedCount = activeTeams.filter((c) => mkt.pending?.[c.id]).length;
  const decPanel = el('div', { class: 'panel' },
    el('h2', {}, `🗳️ Month ${mkt.month + 1} decisions `, el('span', { class: 'sub' }, `${stagedCount}/${activeTeams.length} staged — resolved simultaneously`)),
  );
  for (const c of live) {
    const staged = !!mkt.pending?.[c.id];
    const dead = c.status !== 'active';
    decPanel.append(el('div', { class: 'team-row', style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--line)' } },
      el('span', { class: 'grow' },
        el('b', {}, c.name), dead ? ' 💀' : '',
        el('div', { class: 'micro' }, staged ? `🔒 decision locked in: “${mkt.pending[c.id].label}”` : dead ? 'out of business' : 'waiting for this team\'s move…'),
      ),
      dead ? null : el('button', { class: `btn ${staged ? '' : 'primary'}`, onclick: () => teamDecisionModal(game, c, ctx) }, staged ? 'Change' : 'Decide'),
    ));
  }
  decPanel.append(el('div', { style: { marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' } },
    el('button', {
      class: 'btn primary big', disabled: !allStaged(game),
      onclick: () => {
        const reports = resolveMarketRound(game, ctx.rng);
        saveGame(game);
        renderTeamMode(root, game, ctx);
        toast(`Month ${game.market.month} resolved for all teams.`);
      },
    }, `⚡ Resolve month ${mkt.month + 1} simultaneously`),
    activeTeams.length === 0 ? el('button', { class: 'btn big', onclick: () => ctx.goExitDay() }, '🏁 Go to Exit Day') : null,
    el('button', { class: 'btn ghost', onclick: () => ctx.goExitDay() }, 'Skip to Exit Day (capstone)'),
  ));
  if (!allStaged(game)) decPanel.append(el('p', { class: 'micro' }, 'Every active team must lock a decision before the market moves. Teams decide without seeing each other\'s choices.'));
  right.append(decPanel);

  /* Market report + per-team private snapshots */
  const rep = marketReport(game);
  const repPanel = el('div', { class: 'panel' }, el('h2', {}, '🌍 Market report'), gP(rep));
  for (const c of live) {
    if (c.status !== 'active') continue;
    const cflags = computeFlags(c);
    repPanel.append(el('div', { style: { marginTop: '10px', borderTop: '1px dashed var(--line)', paddingTop: '10px' } },
      el('b', {}, `Private view — ${c.name}`),
      el('div', { class: 'micro' }, mkt.privateBooks ? 'Only visible because the teacher is running the session.' : ''),
      el('div', { class: 'stategrid', style: { marginTop: '6px' } },
        row('Cash', fmtMoney(c.cash)),
        row('Last month', c.lastMonth ? `rev ${fmtMoney(c.lastMonth.revenue)} · net ${fmtMoney(c.lastMonth.net, { sign: true })}` : '—'),
        row('Customers', fmtInt(c.customers)),
        row('Runway', (runway(c) === Infinity ? '∞' : runway(c).toFixed(1) + ' mo')),
        row('Flags', cflags.length ? cflags.slice(0, 2).join(' · ') : 'none'),
      ),
      c.lastReport ? el('ul', { style: { marginTop: '6px' } }, c.lastReport.report.challenges.slice(0, 2).map((x) => el('li', {}, gloss(x)))) : null,
    ));
  }
  right.append(repPanel);
}

const row = (k, v) => el('div', { class: 'row' }, el('span', {}, k), el('b', {}, String(v)));

function checkbox(checked, onChange) {
  const b = el('button', { class: `choice${checked ? ' sel' : ''}`, style: { padding: '3px 10px' } }, checked ? 'on' : 'off');
  b.addEventListener('click', () => { checked = !checked; b.classList.toggle('sel', checked); b.textContent = checked ? 'on' : 'off'; onChange(checked); });
  return b;
}

function teamDecisionModal(game, c, ctx) {
  const ind = INDUSTRIES[c.industry];
  const ta = el('textarea', { placeholder: `${c.name}'s secret move for this month — anything a real founder could do…`, style: { width: '100%', minHeight: '80px' } });
  let staged = null;
  const m = modal({
    title: `🔒 ${c.name} — private decision`,
    body: el('div', {},
      el('p', { class: 'micro' }, `Their position: cash ${fmtMoney(c.cash)} · ${fmtInt(c.customers)} ${ind.customerName}s · price ${fmtMoney(c.price)}${c.lastMonth ? ` · net ${fmtMoney(c.lastMonth.net, { sign: true })}` : ''}. Nobody else sees this.`),
      ta,
    ),
    actions: [
      { label: 'Cancel' },
      {
        label: 'Lock it in', kind: 'primary', onClick: () => {
          const text = ta.value.trim();
          if (text.length < 3) { toast('Type the team\'s decision first.', { err: true }); return false; }
          const out = stageDecision(game, c.id, text, ctx.rng);
          if (out.clarify) {
            const extra = prompt(out.clarify.question);
            if (!extra) return false;
            const out2 = stageDecision(game, c.id, text + ' ' + extra, ctx.rng);
            if (out2.clarify) { toast('Still too vague — give it numbers.', { err: true }); return false; }
            if (out2.rejected) { toast(out2.rejected, { err: true, ms: 4000 }); return false; }
            staged = out2;
          } else if (out.rejected) { toast(out.rejected, { err: true, ms: 4000 }); return false; }
          else staged = out;
          saveGame(game);
          toast(`🔒 ${c.name}'s decision is locked.`);
          renderTeamMode(document.getElementById('app'), game, ctx);
        },
      },
    ],
  });
}
