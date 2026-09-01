// Mode 3: Teacher Scenario Mode.
//
// The teacher injects a scenario; the class submits ONE collective decision; the engine
// resolves it and ALSO shows 1–2 counterfactual paths ("what if the class had chosen
// differently?") — the master prompt's step 6.
import { clone, roundMoney, fmtMoney } from './util.js';
import { parseAction, affordabilityCheck } from './actions.js';
import { simulateMonth, statusReport } from './engine.js';
import { log } from './state.js';

export function setScenario(game, text) {
  game.teacher.scenario = { text, resolved: false, decision: null };
  log(game, `TEACHER SCENARIO: ${text}`, { type: 'teacher', tags: ['scenario'] });
}

// Teacher-authored scenario → mechanical effects, by keyword (honest defaults).
export function scenarioEffects(text) {
  const t = text.toLowerCase();
  const fx = {};
  if (/supplier|supply|ingredient|material|wholesale/.test(t) && /(double|raise|increase|hike|spike|shortage)/.test(t)) fx.cogsShock = -0.08;
  if (/shortage|delay|backorder/.test(t)) fx.revenueShock = 0.85;
  if (/competitor|rival/.test(t) && /(cheap|lower|discount|launch|enter)/.test(t)) fx.eventChurnDelta = 0.05;
  if (/viral|famous|influencer|news/.test(t)) fx.catalyst = { mult: 2, months: 2, label: 'scenario spotlight' };
  if (/recession|downturn|layoffs|economy/.test(t)) fx.revenueShock = 0.85;
  if (/grant|award|gift|donation/.test(t)) fx.cashDelta = (text.match(/\$?([\d,]+)/) ? parseInt(text.replace(/,/g, '').match(/\$?(\d+)/)[1], 10) : 5000);
  if (/fine|lawsuit|sue|regulation|permit|inspection/.test(t)) fx.cashCost = Math.max(1000, Math.round((text.match(/\$?([\d,]+)/) ? parseInt(text.replace(/,/g, '').match(/\$?(\d+)/)[1], 10) : 3000)));
  return fx;
}

// Resolve the class's collective decision against the scenario, plus counterfactuals.
export function resolveClassDecision(game, c, decisionText, rng) {
  const parsed = parseAction(decisionText, c, { mode: 'teacher', rng });
  if (parsed.clarify) return { clarify: parsed.clarify };
  const afford = affordabilityCheck(parsed.fx, c);
  if (!afford.ok) return { rejected: afford.reason };

  const sc = game.teacher.scenario;
  const scFx = sc ? scenarioEffects(sc.text) : {};

  c.round += 1;
  const fx = { ...parsed.fx, ...mergeFx(parsed.fx, scFx), notes: [...(parsed.fx.notes || [])] };
  const res = simulateMonth(c, fx, { rng, market: game.market });
  const report = statusReport(c, fx, [...(fx.notes || []), ...res.notes], { event: null, mode: 'teacher' });

  log(game, `CLASS DECISION: "${decisionText}" under scenario "${sc ? sc.text.slice(0, 80) : '—'}"`, { type: 'teacher', cid: c.id, tags: ['decision'] });
  log(game, `Outcome: net ${fmtMoney(c.lastMonth.net, { sign: true })}, cash ${fmtMoney(c.cash)}, customers ${c.customers}`, { type: 'round', cid: c.id, tags: fx.tags });

  // Counterfactuals: simulate 1–2 alternative paths on CLONES so the real state is untouched.
  const counterfactuals = [];
  const altCautious = clone(c_preRound(c, fx, res));
  const altAggressive = clone(c_preRound(c, fx, res));
  // cautious: hold cash, ride out the scenario
  const cf1 = simulateMonth(altCautious, { label: 'Counterfactual: stay conservative', notes: [], tags: [], ...scFx }, { rng, market: game.market });
  counterfactuals.push({
    label: 'If the class had stayed conservative (hold cash, make no big move)',
    result: summarizeClone(altCautious),
    better: altCautious.cash > c.cash,
  });
  // aggressive: spend 20% of pre-round cash on marketing to fight through it
  const spend = Math.round(Math.max(200, altAggressive.cash * 0.2));
  const cf2 = simulateMonth(altAggressive, { label: 'Counterfactual: aggressive response', notes: [], tags: [], marketing: spend, channel: 'social ads', ...scFx }, { rng, market: game.market });
  counterfactuals.push({
    label: `If the class had gone aggressive (spend ≈${fmtMoney(spend)} on marketing to fight back)`,
    result: summarizeClone(altAggressive),
    better: altAggressive.cash > c.cash,
  });

  if (sc) { sc.resolved = true; sc.decision = decisionText; }
  return { fx, res, report, counterfactuals, bankrupt: res.bankrupt };
}

// Reconstruct a plausible pre-round clone: the real company had fx applied already,
// so we clone the CURRENT state minus cash delta — close enough for side-by-side comparison,
// and clearly labeled as a simulation branch.
function c_preRound(c, fx, res) {
  const pre = clone(c);
  pre.cash = Math.max(0, c.cash - (res.delta?.cash ?? 0));
  return pre;
}

function summarizeClone(c) {
  const m = c.lastMonth;
  return `net ${fmtMoney(m.net, { sign: true })} · cash ${fmtMoney(c.cash)} · ${c.customers.toLocaleString('en-US')} customers${c.status === 'bankrupt' ? ' · 💀 BANKRUPT' : ''}`;
}

function mergeFx(a, b) {
  const out = {};
  for (const k of ['revenueShock', 'cogsShock', 'eventChurnDelta']) if (b[k] != null) out[k] = b[k];
  if (b.catalyst) out.catalyst = b.catalyst;
  if (b.cashCost) out.cashCost = (a.cashCost || 0) + b.cashCost;
  if (b.cashDelta) out.cashDelta = (a.cashDelta || 0) + b.cashDelta;
  return out;
}
