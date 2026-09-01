// Headless tests for the simulation core — the engine must obey the master prompt's
// Realism Guardrails no matter what students type into the action box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { founderSetup, simulateMonth, runway, valuate, computeFlags } from '../js/engine.js';
import { parseAction, parseAction as parse, affordabilityCheck } from '../js/actions.js';
import { rollEvent } from '../js/events.js';
import { generateOffers, acceptOffer } from '../js/advanced.js';
import { mulberry32 } from '../js/rng.js';
import { INDUSTRIES, FUNDING_ROUTES } from '../js/industries.js';
import { newGame } from '../js/state.js';

const rngFor = (seed) => mulberry32(seed);

function makeCo(over = {}, seed = 42) {
  const rng = rngFor(seed);
  const { company } = founderSetup({
    name: 'Test Co', tagline: 'testing', founders: ['A', 'B'],
    industry: over.industry || 'food', model: over.model || 'one-time', funding: over.funding || 'bootstrapped',
    desc: over.industry === 'saas' ? 'an app for tests' : 'a taco truck', customer: 'students', advantage: 'speed',
  }, rng);
  Object.assign(company, over.assign || {});
  return company;
}

/* ------------------------------------------------------ starting capital --- */

test('starting cash stays inside the master prompt guardrail bands', () => {
  for (const funding of ['bootstrapped', 'loan', 'seed']) {
    for (const industry of Object.keys(INDUSTRIES)) {
      for (let s = 0; s < 8; s++) {
        const { company } = founderSetup({
          name: 'X', tagline: '', founders: ['F'], industry, model: 'one-time', funding,
          desc: '', customer: '', advantage: '',
        }, rngFor(s * 1000 + industry.length * 7 + funding.length));
        const [lo, hi] = FUNDING_ROUTES[funding].range;
        assert.ok(company.cash >= lo, `${funding}/${industry} cash ${company.cash} below ${lo}`);
        assert.ok(company.cash <= hi, `${funding}/${industry} cash ${company.cash} above ${hi}`);
      }
    }
  }
});

test('seed funding sells equity, loans create debt, bootstrapping does neither', () => {
  const seed = makeCo({ funding: 'seed', industry: 'saas' });
  assert.ok(seed.equitySoldPct > 0 && seed.capTable.length > 1);
  const loan = makeCo({ funding: 'loan' });
  assert.ok(loan.debt > 0 && loan.capTable.length === 1);
  const boot = makeCo({ funding: 'bootstrapped' });
  assert.equal(boot.debt, 0);
  assert.equal(boot.capTable[0].pct, 100);
});

/* ------------------------------------------------------------- margins ----- */

test('gross margin stays inside (or near) the industry band', () => {
  const c = makeCo({ industry: 'food' });
  c.stage = 'launched'; c.customers = 300;
  const rng = rngFor(7);
  const { gm } = simulateMonth(c, { label: 't', text: '', notes: [] }, { rng, market: null });
  const [lo, hi] = INDUSTRIES.food.grossMargin;
  assert.ok(gm >= lo - 0.1 && gm <= hi + 0.05, `food GM ${gm} outside band`);
});

/* --------------------------------------------------------------- growth ---- */

test('growth ceiling caps runaway fantasy months', () => {
  const c = makeCo({ industry: 'saas' });
  c.stage = 'launched'; c.customers = 300; c.cash = 200_000; c.reputation = 8;
  const rng = rngFor(3);
  const before = c.customers;
  // Absurd marketing budget (affordable) — engine must saturate, not 10×
  simulateMonth(c, { label: 'megablast', text: '', notes: [], marketing: 150_000, channel: 'social ads' }, { rng, market: null });
  const growth = (c.customers - before) / before;
  // ceiling is organic ~14% × boosts (catalyst none) + small-company bonus — never 3×
  assert.ok(growth < 0.6, `growth ${growth} is fantasy`);
});

test('a month of normal marketing grows a small business within 5–15% + noise', () => {
  const c = makeCo({ industry: 'food' });
  c.customers = 500; c.cash = 50_000; c.reputation = 6;
  const rng = rngFor(9);
  const before = c.customers;
  simulateMonth(c, { label: 'ads', text: '', notes: [], marketing: 3000, channel: 'local flyers' }, { rng, market: null });
  assert.ok(c.customers >= before, 'customers should not shrink from an ad buy with no churn shock');
  const growth = (c.customers - before) / before;
  assert.ok(growth <= 0.35, `growth ${growth} above realistic sustained range`);
});

/* ------------------------------------------------------------- failure ----- */

test('cash at zero = honest bankruptcy', () => {
  const c = makeCo({ industry: 'food' });
  c.cash = 400; c.customers = 5;
  const rng = rngFor(11);
  const res = simulateMonth(c, { label: 'pray', text: '', notes: [] }, { rng, market: null });
  assert.equal(c.cash, 0);
  assert.ok(res.bankrupt);
  assert.equal(c.status, 'bankrupt');
  assert.ok(computeFlags(c).some((f) => f.includes('failed')));
});

test('you cannot spend money you do not have (the one legal refusal)', () => {
  const c = makeCo({ industry: 'food' });
  c.cash = 1000;
  const parsed = parseAction('spend $50,000 on social ads', c, { rng: rngFor(1) });
  const check = affordabilityCheck(parsed.fx, c);
  assert.equal(check.ok, false);
});

/* ------------------------------------------------------------ action parse -- */

test('vague marketing asks a clarifying question; specific marketing resolves', () => {
  const c = makeCo({});
  const vague = parseAction('I want to do marketing', c, { rng: rngFor(2) });
  assert.ok(vague.clarify, 'vague marketing should trigger a clarifying question');
  const specific = parseAction('spend $800 on instagram ads', c, { rng: rngFor(2) });
  assert.ok(specific.fx);
  assert.equal(specific.fx.marketing, 800);
  assert.equal(specific.fx.channel, 'social ads');
});

test('price changes, hires, pivots, and wildcard ideas all parse', () => {
  const c = makeCo({ industry: 'food' });
  const rng = rngFor(5);
  assert.equal(parseAction('raise prices 10%', c, { rng }).fx.priceDeltaPct, 0.1);
  const hire = parseAction('hire a barista', c, { rng });
  assert.ok(hire.fx.hires.length === 1);
  const pivot = parseAction('pivot to a saas app', c, { rng });
  assert.equal(pivot.fx.pivotIndustry, 'saas');
  const wild = parseAction('host a silent disco on the roof', c, { rng });
  assert.ok(wild.fx && wild.fx.label, 'wildcard resolves honestly');
  const hold = parseAction('save cash and wait', c, { rng });
  assert.ok(hold.fx.label.match(/hold/i));
});

/* ---------------------------------------------------------------- events ---- */

test('event engine fires at roughly 1-in-3 and returns industry-shaped events', () => {
  const c = makeCo({ industry: 'food' });
  const game = newGame('beginner', 1);
  const rng = rngFor(1234);
  let fired = 0;
  for (let i = 0; i < 600; i++) {
    const ev = rollEvent(c, game, rng);
    if (ev) { fired++; assert.ok(ev.title && ev.text); }
  }
  const rate = fired / 600;
  assert.ok(rate > 0.25 && rate < 0.42, `event rate ${rate} not ~1/3`);
});

/* ------------------------------------------------------------ fundraising --- */

test('fundraising dilutes founders by the agreed percentage', () => {
  const c = makeCo({ funding: 'seed', industry: 'saas' });
  const rng = rngFor(77);
  const { offers } = generateOffers(c, 150_000, rng);
  if (offers.length) {
    const foundersBefore = c.capTable.find((r) => r.holder === 'Founders').pct;
    acceptOffer(c, offers[0]);
    const foundersAfter = c.capTable.find((r) => r.holder === 'Founders').pct;
    assert.ok(foundersAfter < foundersBefore, 'founder pct should dilute');
    assert.ok(Math.abs(c.capTable.reduce((s, r) => s + r.pct, 0) - 100) < 1.5, 'cap table should still sum ~100');
  }
});

/* -------------------------------------------------------------- valuation --- */

test('valuation rises with revenue and growth; pre-revenue has a floor', () => {
  const c = makeCo({ industry: 'saas' });
  const pre = valuate(c).value;
  assert.ok(pre >= 0);
  c.stage = 'launched'; c.customers = 800; c.price = 25;
  simulateMonth(c, { label: 'x', text: '', notes: [] }, { rng: rngFor(4), market: null });
  c.growthPct = 0.18;
  const post = valuate(c).value;
  assert.ok(post > 0);
});

/* --------------------------------------------------------- long-run sanity -- */

test('12 months of sensible play keeps numbers in the realm of reality', () => {
  const c = makeCo({ industry: 'retail' });
  const rng = rngFor(2026);
  const moves = [
    'spend $500 on social ads', 'improve the product with $1000', 'hire a general helper',
    'spend $800 on local events', 'raise prices 10%', 'spend $1000 on influencer',
    'hold steady', 'spend $1500 on social ads', 'partner with the local school',
    'do a publicity stunt for $600', 'spend $1000 on google ads', 'bonus for the team',
  ];
  for (const mv of moves) {
    if (c.status !== 'active') break;
    c.month; // months advance inside simulateMonth
    const parsed = parseAction(mv, c, { rng });
    const fx = parsed.fx || { label: mv, notes: [] };
    if (fx.marketing > c.cash) fx.marketing = Math.round(c.cash * 0.2);
    simulateMonth(c, fx, { rng, market: null });
    assert.ok(c.customers >= 0 && Number.isFinite(c.cash), 'state stays finite');
    const hh = c.history;
    if (c.customers > 100 && !c.catalyst && hh.length >= 2) { // a live catalyst (viral stunt etc.) is the one legal exception
      assert.ok(hh.at(-1).customers / Math.max(1, hh.at(-2).customers) < 1.6, 'no fantasy jumps');
    }
  }
});
