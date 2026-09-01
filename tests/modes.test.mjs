// Integration tests: full game loops through each mode — teacher scenario resolution
// with counterfactuals, team-vs-team shared market, Exit Day, and teacher tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { founderSetup, simulateMonth, valuate } from '../js/engine.js';
import { newGame, addCompany, log } from '../js/state.js';
import { setScenario, resolveClassDecision } from '../js/teacher.js';
import { initMarket, stageDecision, allStaged, resolveMarketRound } from '../js/team.js';
import { exitOffers, investorMemo, describeExit, applyExit } from '../js/exitday.js';
import { rubric, debrief, caseStudy } from '../js/reports.js';
import { parseAction } from '../js/actions.js';
import { mulberry32 } from '../js/rng.js';

function startCo(game, { industry = 'food', funding = 'bootstrapped', name = 'Co', desc = 'a taco truck' } = {}) {
  const { company } = founderSetup({ name, tagline: 't', founders: ['Fay'], industry, model: 'one-time', funding, desc, customer: 'students', advantage: 'speed' }, mulberry32(99));
  addCompany(game, company);
  return company;
}

test('teacher mode: scenario resolves with counterfactuals and updated books', () => {
  const game = newGame('teacher', 5150);
  const rng = mulberry32(5150);
  const c = startCo(game, {});
  setScenario(game, 'Your main supplier just doubled ingredient prices overnight.');
  const before = c.cash;
  const out = resolveClassDecision(game, c, 'raise prices 10% and spend $200 on flyers explaining why', rng);
  assert.ok(!out.clarify && !out.rejected);
  assert.ok(c.lastMonth, 'month resolved');
  assert.equal(out.counterfactuals.length, 2, 'two counterfactual paths shown');
  assert.ok(out.counterfactuals.every((x) => x.label && x.result));
  // scenario keyword detection should have degraded margin this month
  assert.ok(out.fx.cogsShock < 0);
  assert.ok(game.teacher.scenario.resolved);
});

test('team mode: simultaneous resolution, shared ad inflation, leaderboard', () => {
  const game = newGame('team', 777);
  initMarket(game);
  game.teamTarget = 3;
  const rng = mulberry32(777);
  const a = startCo(game, { name: 'Alpha', industry: 'food' });
  const b = startCo(game, { name: 'Beta', industry: 'retail', desc: 'a clothing store' });
  const gam = startCo(game, { name: 'Gamma', industry: 'service', desc: 'a cleaning service' });

  // Everyone stages a decision privately
  assert.ok(stageDecision(game, a.id, 'spend $2000 on local flyers', rng).staged);
  assert.ok(stageDecision(game, b.id, 'spend $4000 on social ads', rng).staged);
  assert.ok(stageDecision(game, gam.id, 'hold steady', rng).staged);
  assert.ok(allStaged(game));

  const reports = resolveMarketRound(game, rng);
  assert.equal(Object.keys(reports).length, 3);
  assert.ok(game.market.leaderboard.length === 3);
  const scores = game.market.leaderboard.map((r) => r.score);
  assert.deepEqual([...scores].sort((x, y) => y - x), scores, 'leaderboard sorted');
  for (const c of [a, b, gam]) assert.ok(c.lastMonth, `${c.name} has resolved month`);
  // public signals exist, internals stay numbers-shaped
  assert.ok(Array.isArray(game.market.signals));
});

test('unaffordable team decisions are rejected at staging time', () => {
  const game = newGame('team', 88);
  initMarket(game);
  const c = startCo(game, { funding: 'bootstrapped' });
  const out = stageDecision(game, c.id, 'spend $9,000,000 on social ads', mulberry32(1));
  assert.ok(out.rejected);
});

test('exit day: valuation factors, memo, and exit application', () => {
  const game = newGame('advanced', 4242);
  const rng = mulberry32(4242);
  const c = startCo(game, { industry: 'saas', funding: 'seed', desc: 'an ai app' });
  c.stage = 'launched'; c.customers = 900;
  for (let i = 0; i < 6; i++) {
    simulateMonth(c, { label: 'grow', text: '', notes: [], marketing: 4000, channel: 'content' }, { rng, market: game.market });
  }
  const offers = exitOffers(c, game, rng);
  assert.ok(offers.valuation.value > 0);
  assert.ok(offers.valuation.factors.length >= 2);
  const memo = investorMemo(c);
  assert.ok(memo.includes('Investor memo') && memo.includes('What they did well'));
  applyExit(c, game, { kind: 'lifestyle', annual: 50000 });
  assert.equal(c.status, 'exited');
  assert.ok(describeExit(c.exit).length > 3);
});

test('teacher tools: rubric, debrief, case study all produce evidence-based text', () => {
  const game = newGame('beginner', 31337);
  const rng = mulberry32(31337);
  const c = startCo(game, { name: 'Rubric Co.' });
  c.stage = 'launched';
  for (const mv of ['spend $400 on local flyers', 'improve the product $500', 'hire a helper']) {
    const p = parseAction(mv, c, { rng });
    if (p.fx) simulateMonth(c, { ...p.fx }, { rng, market: game.market });
  }
  const r = rubric(game, c);
  assert.equal(r.rows.length, 4);
  assert.ok(r.total >= 4 && r.total <= 16);
  assert.ok(r.rows.every((x) => x.evidence.length > 0));
  assert.ok(debrief(game, c).includes('Best decision'));
  const cs = caseStudy(game, c);
  assert.ok(cs.includes('# Case study') && cs.includes('Discussion questions'));
});

