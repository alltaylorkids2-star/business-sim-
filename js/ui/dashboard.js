// The main game screen for Beginner, Advanced, and Teacher modes:
// business-state dashboard, free-text action console with suggested directions,
// clarifying-question flow, event banners, status reports, P&L/balance sheet/cap table.
import { el, clear, toast, modal, kpi, meter, gloss, gP } from './components.js';
import { INDUSTRIES } from '../industries.js';
import { clamp, fmtMoney, fmtPct, fmtInt } from '../util.js';
import { simulateMonth, statusReport, runway, ltv, valuate, computeFlags } from '../engine.js';
import { parseAction, affordabilityCheck, fxCost, suggestionsFor, emptyFx } from '../actions.js';
import { rollEvent, CATEGORY_EMOJI } from '../events.js';
import { pnl, balanceSheet, generateOffers, acceptOffer, negotiate, marketCondition } from '../advanced.js';
import { setScenario, resolveClassDecision } from '../teacher.js';
import { log, saveGame, firstCompany } from '../state.js';

export function renderDashboard(root, game, ctx) {
  const c = firstCompany(game);
  const { rng, goExitDay } = ctx;
  const mode = game.mode;

  if (c.status === 'bankrupt' || c.status === 'exited') { goExitDay(); return; }

  // Roll the round's random event once when entering a fresh round.
  // (Teacher mode doesn't roll generic events — the teacher's scenario IS the event.)
  if (mode !== 'teacher' && !c.pendingEvent && !c.pendingEventRolled) {
    const ev = rollEvent(c, game, rng);
    c.pendingEvent = ev || null;
    c.pendingEventRolled = true;
    if (ev) log(game, `${CATEGORY_EMOJI[ev.category] || '⚡'} ${ev.title}: ${ev.text}`, { type: 'event', cid: c.id, tags: ['event', ev.category] });
    saveGame(game);
  }

  clear(root);
  const wrap = el('div', { class: 'wrap fade' });
  root.append(wrap);

  if (c.pendingEvent) wrap.append(eventBanner(c.pendingEvent));
  if (mode === 'teacher') renderTeacherBody(wrap, game, c, ctx);
  else renderStandardBody(wrap, game, c, ctx);
}

function eventBanner(ev) {
  return el('div', { class: 'event-banner fade' },
    el('h3', {}, `${CATEGORY_EMOJI[ev.category] || '⚡'} Random event — ${ev.title}`),
    el('p', {}, ev.text),
    el('p', { class: 'micro', style: { marginTop: '6px' } }, 'Decide with this in mind. Its effects hit when your decision resolves this month.'),
  );
}

/* ------------------------------------------------------------ standard ------ */

function renderStandardBody(wrap, game, c, ctx) {
  const { rng, goExitDay } = ctx;
  const beginner = game.mode === 'beginner';
  const ind = INDUSTRIES[c.industry];
  const m = c.lastMonth;

  /* KPIs */
  const kpis = el('div', { class: 'kpis' });
  kpis.append(kpi('💵 Cash', fmtMoney(c.cash), m ? `net ${fmtMoney(m.net, { sign: true })} last month` : 'starting position', m && m.net < 0 && runway(c) < 4 ? 'bad' : m && m.net > 0 ? 'good' : ''));
  kpis.append(kpi('🧾 Revenue / mo', fmtMoney(m?.revenue ?? 0), c.growthPct ? `${fmtPct(c.growthPct)} customer growth` : 'month 1', ''));
  kpis.append(kpi('🔥 Expenses / mo', fmtMoney((m?.cogs ?? 0) + (m?.opex ?? 0)), beginner ? 'everything it costs to run' : `burn ${fmtMoney(Math.max(0, -(m?.net ?? 0)))}`, ''));
  kpis.append(kpi(`👥 ${cap(ind.customerName)}s`, fmtInt(c.customers), c.stage === 'prototype' ? `waitlist ${fmtInt(c.waitlist)} — not launched` : `${c.churnPct ? fmtPct(c.churnPct) + '/mo leaving' : ''}`, ''));
  if (!beginner) {
    const r = runway(c);
    kpis.append(kpi('⏳ Runway', r === Infinity ? '∞' : r.toFixed(1) + ' mo', m?.net >= 0 ? 'cash-flow positive' : 'at current burn', r < 3 ? 'bad' : ''));
    kpis.append(kpi('🎯 LTV : CAC', `${Math.round(ltv(c) / Math.max(1, c.cac))} : 1`, `LTV ${fmtMoney(ltv(c))} · CAC ${fmtMoney(c.cac)}`, ltv(c) < 3 * c.cac ? 'down' : 'good'));
  }
  wrap.append(kpis);

  const dash = el('div', { class: 'dash' });
  wrap.append(dash);
  const left = el('div'), right = el('div');
  dash.append(left, right);

  /* Action console (the Freedom Principle lives here) */
  left.append(actionConsole(game, c, ctx));
  left.append(feedPanel(game, c));

  /* Right rail */
  right.append(statePanel(game, c, beginner));
  right.append(flagsPanel(c));
  if (!beginner) {
    right.append(pnlPanel(c));
    right.append(competitorsPanel(c, game));
  }
  right.append(contextPanel(c));
}

/* -------------------------------------------------------- console flow ------ */

function actionConsole(game, c, ctx) {
  const { rng, goExitDay } = ctx;
  const beginner = game.mode === 'beginner';
  const ta = el('textarea', { placeholder: beginner ? 'What do you want to try this month? (or tap a suggestion below)' : 'Your move — anything a real founder could do. e.g., “spend $2k on influencer marketing”, “hire an engineer”, “raise prices 8%”, “pivot to a subscription model”…' });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); });

  const chips = el('div', { class: 'chips' });
  for (const s of suggestionsFor(c, game.mode)) {
    chips.append(el('button', { class: 'chip', onclick: () => { ta.value = s; ta.focus(); } }, s));
  }

  const submit = () => {
    const text = ta.value.trim();
    if (!text) return toast('Type a decision first — anything goes.', { err: true });
    attempt(text, game, c, ctx, 0);
  };

  return el('div', { class: 'panel console' },
    el('h2', {}, `Your move — Month ${c.month + 1} `, el('span', { class: 'sub' }, beginner ? 'one decision, then the month plays out' : 'resolve when ready · freedom is the point')),
    ta,
    chips,
    el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
      el('button', { class: 'btn primary big', onclick: submit }, '▶ Resolve this month'),
      el('span', { class: 'micro' }, 'Anything goes. The engine shows what really happens — including backfires.'),
    ),
  );
}

// Parse → clarify (if needed) → afford → fundraise flow (advanced) → resolve month.
function attempt(text, game, c, ctx, depth) {
  const { rng } = ctx;
  if (depth > 4) return toast('Let\'s keep it simple — one clear decision per month.', { err: true });
  const parsed = parseAction(text, c, { mode: game.mode, rng });

  if (parsed.clarify) {
    const input = el('input', { type: 'text', placeholder: '…or type your own answer', style: { width: '100%', border: '1.5px solid var(--line)', borderRadius: '10px', padding: '10px', marginTop: '10px' } });
    const m = modal({
      title: 'Quick question before I simulate that',
      body: el('div', {},
        gP(parsed.clarify.question),
        parsed.clarify.chips ? el('div', { class: 'chips' }, parsed.clarify.chips.map((chip) =>
          el('button', { class: 'chip', onclick: () => { m.close(); attempt(text + ' ' + chip.replace('custom — type it out', ''), game, c, ctx, depth + 1); } }, chip))) : null,
        input,
      ),
      actions: [
        { label: 'Cancel' },
        { label: 'That\'s my decision', kind: 'primary', onClick: () => { const extra = input.value.trim(); if (!extra) { toast('Answer the question or cancel', { err: true }); return false; } attempt(text + ' ' + extra, game, c, ctx, depth + 1); } },
      ],
    });
    return;
  }

  const fx = parsed.fx;

  if (fx.windDown) {
    const m = modal({
      title: 'Wind the company down?',
      body: gP('This ends the business. Assets are sold, debts are paid, and everyone goes home. There\'s no undo — are you sure?'),
      actions: [{ label: 'Cancel' }, { label: 'Yes, shut it down', kind: 'danger', onClick: () => { applyExitQuick(c, game, { kind: 'winddown', amount: Math.max(0, Math.round(c.cash * 0.9 - c.debt)) }, ctx); } }],
    });
    return;
  }

  const afford = affordabilityCheck(fx, c);
  if (!afford.ok) {
    modal({ title: 'You can\'t spend money you don\'t have', body: gP(afford.reason), actions: [{ label: 'Rethink it', kind: 'primary' }] });
    return;
  }

  // Advanced fundraising → term-sheet flow before the month resolves.
  if (fx.fundraiseAsk) {
    fundraisingModal(game, c, fx, ctx);
    return;
  }

  resolveMonth(game, c, fx, parsed.fx.text || text, ctx);
}

function resolveMonth(game, c, fx, rawText, ctx) {
  const { rng } = ctx;
  c.round += 1;
  const ev = c.pendingEvent;
  const merged = mergeEventFx(fx, ev?.fx || {});
  const res = simulateMonth(c, merged, { rng, market: game.market });
  const notes = [...(fx.notes || []), ...res.notes];
  const report = statusReport(c, fx, notes, { event: ev, mode: game.mode });

  if (!fx.channels) fx.channels = [];
  if (fx.channel && !c.channels.includes(fx.channel)) c.channels.push(fx.channel);

  log(game, `"${rawText}" → ${fx.label}. Net ${fmtMoney(c.lastMonth.net, { sign: true })} · cash ${fmtMoney(c.cash)} · ${fmtInt(c.customers)} customers`, { type: 'round', cid: c.id, tags: fx.tags || [] });
  if (res.bankrupt) log(game, `💀 ${c.name} has run out of cash. The business fails.`, { type: 'event', cid: c.id, tags: ['bankrupt'] });

  c.pendingEvent = null; c.pendingEventRolled = false;
  c.lastReport = { notes, report, fxLabel: fx.label, bankrupt: res.bankrupt, month: c.month };
  saveGame(game);
  renderDashboard(document.getElementById('app'), game, ctx);
  if (res.bankrupt) toast('You ran out of cash. The business fails — see the post-mortem.', { err: true, ms: 4200 });
  else toast(`Month ${c.month} resolved`);
}

function mergeEventFx(fx, evFx) {
  const out = { ...fx };
  for (const k of ['revenueShock', 'cogsShock', 'eventChurnDelta', 'catalyst']) if (evFx[k] != null && out[k] == null) out[k] = evFx[k];
  for (const k of ['reputationDelta', 'moraleDelta', 'cashCost']) if (evFx[k] != null) out[k] = (out[k] || 0) + evFx[k];
  if (evFx._removed) out._removed = evFx._removed;
  if (evFx.qualityBoost) out.qualityBoost = (out.qualityBoost || 0) + evFx.qualityBoost;
  return out;
}

function applyExitQuick(c, game, choice, ctx) {
  c.status = 'exited';
  c.exit = choice;
  log(game, `${c.name} winds down voluntarily, walking away with ${fmtMoney(choice.amount)}.`, { type: 'exit', cid: c.id });
  saveGame(game);
  ctx.goExitDay();
}

/* ------------------------------------------------------- fundraising -------- */

function fundraisingModal(game, c, fx, ctx) {
  const { rng } = ctx;
  const { offers, cold } = generateOffers(c, fx.fundraiseAsk, rng);
  const v = valuate(c);

  const body = el('div', {});
  body.append(gP(`Your ask: ${fmtMoney(fx.fundraiseAsk)}. Current independent read on the business: ≈ ${fmtMoney(v.value)} (${v.factors[0].toLowerCase()}).`));
  if (cold) {
    body.append(el('p', {}, 'You pitch for two weeks. Nobody bites. Investors fund momentum, and yours isn\'t loud enough yet — the honest feedback is: more customers, more proof, then raise.'));
    modal({ title: '💼 Fundraising', body, actions: [{ label: 'Back to work', kind: 'primary', onClick: () => { resolveMonth(game, c, { ...fx, notes: [...(fx.notes || []), 'Fundraise attempt failed — a month of founder time spent pitching instead of building.'], fundraiseAsk: null, moraleDelta: (fx.moraleDelta || 0) - 0.3 }, fx.text, ctx); } }] });
    return;
  }
  for (const offer of offers) {
    body.append(el('div', { class: 'card', style: { margin: '10px 0', padding: '16px' } },
      el('b', {}, `${offer.investor} · ${offer.kind}`),
      el('p', { style: { margin: '6px 0', fontSize: '.92rem' } }, `${fmtMoney(offer.amount)} on ${fmtMoney(offer.preMoney)} pre-money (${fmtMoney(offer.postMoney)} post) → you give up ~${offer.dilutionPct}%.`),
      el('p', { class: 'micro' }, offer.note),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('button', { class: 'btn primary', onclick: () => { acceptOffer(c, offer); log(game, `FUNDED: ${offer.investor} invests ${fmtMoney(offer.amount)} at ${fmtMoney(offer.postMoney)} post (${offer.dilutionPct}% dilution).`, { type: 'event', cid: c.id, tags: ['fundraise'] }); toast(`💰 ${fmtMoney(offer.amount)} wired. You now own less of a bigger company.`); closeAll(); resolveMonth(game, c, { ...fx, fundraiseAsk: null, cashDelta: (fx.cashDelta || 0), notes: [...(fx.notes || []), `${offer.investor} is in. Money is oxygen — and a clock: investors expect this to 10× or die trying.`] }, fx.text, ctx); } }, 'Accept'),
        el('button', {
          class: 'btn', onclick: () => {
            const r = negotiate(c, offer, rng);
            toast(r.text, { ms: 3600, err: r.outcome === 'lost' });
            if (r.outcome === 'improved' && r.offer) { const i = offers.indexOf(offer); offers[i] = r.offer; }
            if (r.outcome === 'lost') offers.splice(offers.indexOf(offer), 1);
            closeAll(); fundraisingModalRefresh(game, c, fx, ctx, offers);
          },
        }, 'Negotiate'),
        el('button', { class: 'btn ghost', onclick: () => { offers.splice(offers.indexOf(offer), 1); closeAll(); fundraisingModalRefresh(game, c, fx, ctx, offers); } }, 'Decline'),
      ),
    ));
  }
  modal({ title: '💼 Term sheets', body, actions: [{ label: 'Walk away from all offers', onClick: () => { toast('No deal. A month spent pitching, not building.'); resolveMonth(game, c, { ...fx, fundraiseAsk: null, moraleDelta: (fx.moraleDelta || 0) - 0.2, notes: [...(fx.notes || []), 'You walked away from the table. Maybe right, maybe expensive — fundability has a shelf life.'] }, fx.text, ctx); } }] });
}
const closeAll = () => clear(document.getElementById('modal-root'));
const fundraisingModalRefresh = (game, c, fx, ctx, offers) => offers.length ? fundraisingModalWithOffers(game, c, fx, ctx, offers) : resolveMonth(game, c, { ...fx, fundraiseAsk: null, notes: [...(fx.notes || []), 'All offers declined or lost. The raise is off.'] }, fx.text, ctx);
function fundraisingModalWithOffers(game, c, fx, ctx, offers) {
  const body = el('div', {});
  body.append(el('p', { class: 'micro' }, 'Offers remaining:'));
  for (const offer of offers) {
    body.append(el('div', { class: 'card', style: { margin: '10px 0', padding: '16px' } },
      el('b', {}, `${offer.investor} · ${offer.kind}`),
      el('p', { style: { margin: '6px 0', fontSize: '.92rem' } }, `${fmtMoney(offer.amount)} on ${fmtMoney(offer.preMoney)} pre → ~${offer.dilutionPct}% dilution.`),
      el('div', { style: { display: 'flex', gap: '8px' } },
        el('button', { class: 'btn primary', onclick: () => { acceptOffer(c, offer); log(game, `FUNDED: ${offer.investor} invests ${fmtMoney(offer.amount)} (${offer.dilutionPct}% dilution).`, { type: 'event', cid: c.id, tags: ['fundraise'] }); closeAll(); resolveMonth(game, c, { ...fx, fundraiseAsk: null, notes: [...(fx.notes || []), `${offer.investor} is in.`] }, fx.text, ctx); } }, 'Accept'),
        el('button', { class: 'btn', onclick: () => { const r = negotiate(c, offer, ctx.rng); toast(r.text, { ms: 3600, err: r.outcome === 'lost' }); if (r.outcome === 'improved' && r.offer) offers[offers.indexOf(offer)] = r.offer; if (r.outcome === 'lost') offers.splice(offers.indexOf(offer), 1); closeAll(); fundraisingModalRefresh(game, c, fx, ctx, offers); } }, 'Negotiate'),
        el('button', { class: 'btn ghost', onclick: () => { offers.splice(offers.indexOf(offer), 1); closeAll(); fundraisingModalRefresh(game, c, fx, ctx, offers); } }, 'Decline'),
      ),
    ));
  }
  modal({ title: '💼 Term sheets', body, actions: [{ label: 'Walk away from all offers', onClick: () => resolveMonth(game, c, { ...fx, fundraiseAsk: null }, fx.text, ctx) }] });
}

/* ------------------------------------------------------------- panels ------- */

function statePanel(game, c, beginner) {
  const ind = INDUSTRIES[c.industry];
  const v = valuate(c);
  const rows = [
    ['Stage', c.stage === 'prototype' ? `prototype (waitlist ${fmtInt(c.waitlist)})` : c.stage],
    ['Price', fmtMoney(c.price) + (ind.priceModel === 'monthly' ? '/mo' : ` per ${ind.unitName}`)],
    ['Business model', c.revenueModelLabel],
    ['Team', c.team.length ? c.team.map((t) => `${t.role}${t.pay ? ` (${fmtMoney(t.pay)}/mo)` : ' (founder)'}`).join(', ') : 'just founders'],
    ['Channels', c.channels.length ? c.channels.join(', ') : 'none — word of mouth only'],
    ['Locations', c.locations],
  ];
  if (!beginner) rows.push(['Est. valuation', `≈ ${fmtMoney(v.value)}`]);
  return el('div', { class: 'panel' },
    el('h2', {}, `🏢 ${c.name} `, el('span', { class: 'sub' }, `${c.industryLabel} · Month ${c.month}`)),
    el('div', { class: 'stategrid' }, rows.map(([k, vv]) => el('div', { class: 'row' }, el('span', {}, k), el('b', {}, String(vv))))),
    meter('Quality / customer satisfaction', c.quality),
    meter('Team morale', c.morale),
    meter('Brand reputation', c.reputation),
  );
}

function flagsPanel(c) {
  c.flags = computeFlags(c);
  const flags = c.flags;
  return el('div', { class: 'panel' },
    el('h2', {}, '🚩 Risk flags'),
    flags.length
      ? el('div', { class: 'flags' }, flags.map((f) => el('div', { class: `flag ${f.startsWith('💀') || f.startsWith('Runway under') || f.includes('low') || f.includes('rising') || f.includes('eating') || f.includes('bottleneck') || f.includes('undercuts') ? 'bad' : f.startsWith('✅') ? 'good' : 'warn'}` }, f)))
      : el('p', { class: 'empty' }, 'No red flags. Stay paranoid anyway.'),
  );
}

function pnlPanel(c) {
  const { rows, metrics } = pnl(c);
  const bs = balanceSheet(c);
  return el('div', { class: 'panel' },
    el('h2', {}, '📒 Mini P&L ', el('span', { class: 'sub' }, 'profit & loss — where the month\'s money went')),
    c.lastMonth
      ? el('table', { class: 'pnl' }, rows.map(([k, v, note]) => el('tr', { class: k.startsWith('Gross') || k.startsWith('EBITDA') ? 'total' : '' }, el('td', {}, glossLess(k)), el('td', { class: 'mono' }, fmtMoney(v, { sign: v < 0 })), el('td', { class: 'note' }, note || '')) ))
      : el('p', { class: 'empty' }, 'Month 1 hasn\'t resolved yet — the first P&L appears after your first decision.'),
    el('div', { class: 'micro', style: { marginTop: '8px' } },
      `Net margin ${fmtPct(metrics.netMargin)} · churn ${fmtPct(c.churnPct)}/mo · ${metrics.mrr != null ? `MRR ${fmtMoney(metrics.mrr)} · ARR ${fmtMoney(metrics.mrr * 12)}` : 'transactional revenue (not recurring)'}`),
    el('div', { class: 'divider' }),
    el('h2', {}, '⚖️ Balance sheet ', el('span', { class: 'sub' }, 'simplified')),
    el('table', { class: 'pnl' },
      bs.assets.concat(bs.liabilities).map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', { class: 'mono' }, fmtMoney(v)), el('td', {}))),
      el('tr', { class: 'total' }, el('td', {}, 'Net cash position'), el('td', { class: 'mono' }, fmtMoney(c.cash - c.debt)), el('td', {}))),
    el('p', { class: 'micro' }, bs.equityNote),
    capTableBlock(c),
  );
}

function glossLess(k) { return k; } // keep P&L terse; glossary tooltips live in prose

function capTableBlock(c) {
  if (c.capTable.length <= 1) return el('p', { class: 'micro' }, 'Cap table: founders 100%. No dilution — no outside safety net either.');
  return el('div', {},
    el('p', { class: 'micro', style: { fontWeight: 700, marginBottom: '4px' } }, 'Cap table:'),
    el('table', { class: 'pnl' }, c.capTable.map((r) => el('tr', {}, el('td', {}, `${r.holder} `, el('span', { class: 'micro' }, r.note)), el('td', { class: 'mono' }, r.pct + '%'), el('td', {})))),
  );
}

function competitorsPanel(c, game) {
  return el('div', { class: 'panel' },
    el('h2', {}, '⚔️ Market & competition ', el('span', { class: 'sub' }, `conditions: ${marketCondition(game)}`)),
    c.competitors.length
      ? el('div', {}, c.competitors.map((cp) => el('div', { class: 'row', style: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed var(--line)', fontSize: '.9rem' } },
        el('span', {}, cp.name, !cp.alive ? ' 💀' : ''),
        el('b', {}, cp.alive ? `${fmtMoney(cp.priceIdx)} · ${cp.lastMove}` : 'out of business'))))
      : el('p', { class: 'empty' }, 'No serious competitors yet. That never lasts.'),
  );
}

function contextPanel(c) {
  return el('div', { class: 'panel' },
    el('h2', {}, '🧭 The idea'),
    el('p', { style: { fontSize: '.9rem' } }, c.idea.desc),
    el('p', { class: 'micro' }, `Customer: ${c.idea.customer}`),
    el('p', { class: 'micro' }, `Unfair advantage: ${c.idea.advantage}`),
  );
}

/* ------------------------------------------------------------- feed --------- */

function feedPanel(game, c) {
  const entries = game.log.filter((l) => !l.cid || l.cid === c.id).slice(-10).reverse();
  const feed = el('div', { class: 'feed' });
  for (const e of entries) {
    feed.append(el('div', { class: `entry ${e.type}` },
      el('div', { class: 'when' }, e.type === 'round' ? `Month ${e.round} — decision` : e.type),
      gP(e.text),
    ));
  }
  if (c.lastReport) {
    feed.prepend(reportBlock(c.lastReport));
  }
  return el('div', { class: 'panel' },
    el('h2', {}, '📰 Status reports & running log'),
    feed,
  );
}

function reportBlock(r) {
  return el('div', { class: `entry round fade` },
    el('div', { class: 'when' }, `Month ${r.month} — status report`),
    el('p', {}, el('b', {}, `Decision: ${r.fxLabel}`)),
    r.notes.length ? el('ul', {}, r.notes.map((n) => el('li', {}, gloss(n)))) : null,
    el('ul', {}, r.report.financials.map((n) => el('li', {}, gloss(n)))),
    el('ul', {}, r.report.reaction.map((n) => el('li', {}, gloss(n)))),
    el('p', { style: { fontWeight: 700, marginTop: '8px' } }, 'Now facing:'),
    el('ul', {}, r.report.challenges.map((n) => el('li', {}, gloss(n)))),
  );
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* ------------------------------------------------------------- teacher ------ */

function renderTeacherBody(wrap, game, c, ctx) {
  const { rng } = ctx;
  const sc = game.teacher.scenario;

  const kpis = el('div', { class: 'kpis' });
  const m = c.lastMonth;
  kpis.append(kpi('💵 Cash', fmtMoney(c.cash)));
  kpis.append(kpi('🧾 Revenue / mo', fmtMoney(m?.revenue ?? 0)));
  kpis.append(kpi('🔥 Expenses / mo', fmtMoney((m?.cogs ?? 0) + (m?.opex ?? 0))));
  kpis.append(kpi('👥 Customers', fmtInt(c.customers)));
  wrap.append(kpis);

  const dash = el('div', { class: 'dash' });
  wrap.append(dash);
  const left = el('div'), right = el('div');
  dash.append(left, right);

  // Scenario panel — the whole point of this mode.
  const panel = el('div', { class: 'panel' });
  if (!sc) {
    const ta = el('textarea', { placeholder: 'e.g., “Your main supplier just doubled ingredient prices. You have enough cash for about 3 months at current burn. What does the class decide?”', style: { width: '100%', minHeight: '90px' } });
    panel.append(
      el('h2', {}, '🍎 Teacher: inject a scenario'),
      el('p', { class: 'hint' }, 'Describe a real-world event or decision point, then project this screen. The class debates and submits ONE collective decision.'),
      ta,
      el('button', { class: 'btn primary big', style: { marginTop: '10px' }, onclick: () => {
        const v = ta.value.trim();
        if (v.length < 12) return toast('Give the class a real scenario to chew on.', { err: true });
        setScenario(game, v); saveGame(game); renderDashboard(document.getElementById('app'), game, ctx);
      } }, 'Present scenario to class 📽️'),
    );
  } else if (!sc.resolved) {
    const ta = el('textarea', { placeholder: 'The class\'s collective decision (by vote or consensus), e.g., “absorb half the cost, raise prices 5%, and spend $400 telling customers why”', style: { width: '100%', minHeight: '70px' } });
    panel.append(
      el('h2', {}, '📽️ Projected to the class'),
      el('div', { class: 'event-banner', style: { borderColor: 'var(--warn)' } }, el('h3', {}, 'Scenario'), el('p', {}, sc.text)),
      el('p', { class: 'hint' }, 'When debate ends, enter the ONE decision the class landed on:'),
      ta,
      el('div', { style: { display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' } },
        el('button', { class: 'btn primary big', onclick: () => {
          const v = ta.value.trim();
          if (v.length < 3) return toast('Enter the class decision first.', { err: true });
          const out = resolveClassDecision(game, c, v, rng);
          if (out.clarify) return toast(out.clarify.question, { err: true, ms: 4200 });
          if (out.rejected) return toast(out.rejected, { err: true, ms: 4200 });
          c.lastCounterfactuals = out.counterfactuals;
          saveGame(game); renderDashboard(document.getElementById('app'), game, ctx);
        } }, '⚖️ Simulate the class decision'),
        el('button', { class: 'btn ghost', onclick: () => { game.teacher.scenario = null; saveGame(game); renderDashboard(document.getElementById('app'), game, ctx); } }, 'Discard scenario'),
      ),
    );
  } else {
    // resolved: show outcome + counterfactuals
    const last = c.lastReportTeacher;
    panel.append(
      el('h2', {}, '⚖️ Outcome'),
      el('div', { class: 'event-banner' }, el('h3', {}, 'Scenario'), el('p', {}, sc.text)),
      gP(`Class decision: “${sc.decision}”`),
      teacherOutcomeBlock(c),
      el('h3', { style: { marginTop: '16px' } }, '🔀 The roads not taken'),
      teacherCounterfactualBlock(c),
      el('button', { class: 'btn primary', style: { marginTop: '14px' }, onclick: () => { game.teacher.scenario = null; saveGame(game); renderDashboard(document.getElementById('app'), game, ctx); } }, 'Next scenario →'),
    );
  }
  left.append(panel);
  left.append(feedPanel(game, c));
  right.append(statePanel(game, c, true));
  right.append(flagsPanel(c));
  right.append(contextPanel(c));
}

function teacherOutcomeBlock(c) {
  const m = c.lastMonth;
  if (!m) return el('p', { class: 'empty' }, 'No outcome yet.');
  const lastH = c.history[c.history.length - 1];
  return el('div', {},
    el('ul', {}, (lastH ? [lastH] : []).map((x) => el('li', {}, gloss(`Month ${x.month}: ${x.note} → revenue ${fmtMoney(x.revenue)}, net ${fmtMoney(x.net, { sign: true })}, cash ${fmtMoney(x.cash)}, ${fmtInt(x.customers)} customers (morale ${x.morale}/10).`)))),
    gP('A real founder would feel the trade-offs in that number. A real investor would ask: “did the decision buy time, buy growth, or just buy comfort?”'),
  );
}

// Counterfactuals were computed at resolve time; stored on game.teacher.lastCF.
function teacherCounterfactualBlock(c) {
  const cfs = c.lastCounterfactuals || [];
  if (!cfs.length) return el('p', { class: 'empty' }, 'No counterfactuals recorded.');
  return el('ul', {}, cfs.map((cf) => el('li', {}, gloss(`${cf.label}: ${cf.result} ${cf.better ? '(arguably better)' : '(arguably worse — the class chose well)'}`))));
}
