// Capstone screen: Exit Day — final valuation with transparent factors, exit-path choices,
// and the auto-generated investor memo. Also serves as the bankruptcy post-mortem.
import { el, clear, toast, modal, downloadText } from './components.js';
import { exitOffers, applyExit, describeExit, investorMemo } from '../exitday.js';
import { rubric, debrief, caseStudy } from '../reports.js';
import { fmtMoney, fmtInt } from '../util.js';
import { saveGame, logText } from '../state.js';

export function renderExitDay(root, game, ctx) {
  clear(root);
  const wrap = el('div', { class: 'wrap fade' });
  root.append(wrap);

  wrap.append(el('div', { class: 'hero', style: { padding: '30px 20px 10px' } },
    el('div', { class: 'hero-badge' }, 'Capstone'),
    el('h1', {}, '🏁 Exit Day'),
    el('p', {}, 'The unit ends here. Each company gets a final valuation, an exit decision, and an honest investor memo.')));

  for (const cid of game.order) {
    wrap.append(exitCard(game, game.companies[cid], ctx));
  }

  wrap.append(el('div', { class: 'panel' },
    el('h2', {}, '🧑‍🏫 Teacher tools (gradable material, generated from the game log)'),
    teacherTools(game, ctx),
  ));
}

function exitCard(game, c, ctx) {
  const card = el('div', { class: 'panel fade' });
  const { rng } = ctx;

  if (c.exit?.kind && c.exit.kind !== 'shutdown') {
    card.append(exitSummary(c, `Exited: ${describeExit(c.exit)}`));
    return card;
  }

  const bankrupt = c.status === 'bankrupt';
  const offers = bankrupt ? null : exitOffers(c, game, rng);

  card.append(el('h2', {}, `${bankrupt ? '💀' : '🏢'} ${c.name} `, el('span', { class: 'sub' }, c.tagline)));

  if (bankrupt) {
    card.append(
      el('div', { class: 'flag bad', style: { marginBottom: '12px' } }, 'Out of cash. The business failed — the most valuable lesson in the simulation, delivered honestly.'),
      el('p', {}, `Final numbers: ${fmtInt(c.customers)} customers on the books, debt ${fmtMoney(c.debt)}, reputation ${c.reputation.toFixed(1)}/10. The assets are worth roughly what the laptop and the Instagram account fetch.`),
      memoBlock(c, game),
    );
    return card;
  }

  const v = offers.valuation;
  card.append(
    el('div', { class: 'kpis' },
      kpiMini('Final valuation', `≈ ${fmtMoney(v.value)}`),
      kpiMini('Cash', fmtMoney(c.cash)),
      kpiMini('Customers', fmtInt(c.customers)),
      kpiMini('Reputation', `${c.reputation.toFixed(1)}/10`),
    ),
    el('h3', {}, 'How the valuation was built (show the work)'),
    el('ul', {}, v.factors.map((f) => el('li', {}, f))),
  );

  // Exit paths
  const paths = el('div', { class: 'mode-grid', style: { marginTop: '10px' } });
  for (const o of offers.acquisition) {
    paths.append(pathCard(`🏦 Acquisition — ${o.buyer}`, `${fmtMoney(o.amount)} cash for the company. ${o.note}`, () => choose(game, c, { kind: 'acquisition', ...o }, ctx)));
  }
  if (offers.raise) paths.append(pathCard('🚀 Raise & keep growing', `A growth round of ≈${fmtMoney(offers.raise.amount)} is available. More dilution, more clock, more upside. (In real life the game would continue.)`, () => choose(game, c, { kind: 'raise', amount: offers.raise.amount }, ctx)));
  if (offers.lifestyle) paths.append(pathCard('🌿 Lifestyle business', offers.lifestyle.note, () => choose(game, c, { kind: 'lifestyle', annual: offers.lifestyle.annual }, ctx)));
  paths.append(pathCard('🌧️ Wind down', offers.windDown.note, () => choose(game, c, { kind: 'winddown', amount: offers.windDown.amount }, ctx), true));
  card.append(el('h3', {}, 'Choose an exit'), paths);

  card.append(memoBlock(c, game));
  return card;
}

const kpiMini = (k, v) => el('div', { class: 'kpi' }, el('div', { class: 'k' }, k), el('div', { class: 'v mono' }, v));

function pathCard(title, text, onClick, danger = false) {
  return el('button', { class: 'mode-card', onclick: onClick }, el('h3', { style: { fontSize: '1rem' } }, title), el('p', {}, text));
}

function choose(game, c, choice, ctx) {
  modal({
    title: `Lock in: ${describeExit(choice)}?`,
    body: el('p', {}, 'This is the capstone decision. It\'s final.'),
    actions: [
      { label: 'Not yet' },
      { label: 'Lock it in', kind: 'primary', onClick: () => { applyExit(c, game, choice); saveGame(game); toast('Exit locked. See the investor memo.'); renderExitDay(document.getElementById('app'), game, ctx); } },
    ],
  });
}

function memoBlock(c, game) {
  const memo = investorMemo(c);
  const pre = el('pre', { class: 'out' }, memo);
  const holder = el('div', { style: { marginTop: '14px' } });
  const btn = el('button', {
    class: 'btn', onclick: () => {
      holder.contains(pre) ? (clear(holder).append(btn)) : holder.append(pre);
    },
  }, '📄 Investor memo (click to reveal)');
  holder.append(btn);
  return holder;
}

function exitSummary(c, headline) {
  return el('div', {},
    el('p', {}, el('b', {}, headline)),
    el('p', { class: 'micro' }, `Final: cash ${fmtMoney(c.cash)} · ${fmtInt(c.customers)} customers · reputation ${c.reputation.toFixed(1)}/10`),
    memoBlock(c, null),
  );
}

function teacherTools(game, ctx) {
  const out = el('div', {});
  const show = (title, text) => modal({
    title,
    body: el('div', {}, el('pre', { class: 'out', style: { maxHeight: '50vh' } }, text)),
    actions: [{ label: 'Close' }, { label: 'Download .md', kind: 'primary', onClick: () => downloadText(`${title.replace(/\W+/g, '-').toLowerCase()}.md`, text, 'text/markdown') }],
  });

  const btns = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
  const companies = game.order.map((id) => game.companies[id]);

  btns.append(el('button', {
    class: 'btn', onclick: () => {
      const all = companies.map((c) => {
        const r = rubric(game, c);
        return `## Rubric — ${r.company} (${r.total}/${r.max})\n\n| Category | Score | Evidence |\n|---|---|---|\n` +
          r.rows.map((x) => `| ${x.category} | ${x.score}/4 | ${x.evidence} |`).join('\n');
      }).join('\n\n');
      show('📝 Grading rubric', all);
    },
  }, '📝 Rubric'));

  btns.append(el('button', {
    class: 'btn', onclick: () => show('💬 Team debriefs', companies.map((c) => '- ' + debrief(game, c).replace(/\*\*/g, '')).join('\n\n')),
  }, '💬 Debrief paragraphs'));

  for (const c of companies) {
    btns.append(el('button', { class: 'btn', onclick: () => show(`📚 Case study — ${c.name}`, caseStudy(game, c)) }, `📚 Case study: ${c.name}`));
  }

  btns.append(el('button', {
    class: 'btn ghost', onclick: () => downloadText(`bizsim-log-${new Date().toISOString().slice(0, 10)}.txt`, logText(game), 'text/plain'),
  }, '⬇️ Full running log'));

  out.append(btns, el('p', { class: 'micro' }, 'Rubric scores: 4 = excellent, 3 = solid, 2 = developing, 1 = needs work. Evidence is quoted from the actual game log — argue with it in class.'));
  return out;
}
