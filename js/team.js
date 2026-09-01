// Mode 4: Team vs. Team — one shared market, simultaneous decisions, a leaderboard.
//
// Teams never see each other's books (like real competitors). They see a public
// "market signals" feed: pricing, visible advertising, press. Internals stay private.
import { INDUSTRIES } from './industries.js';
import { clamp, roundMoney, fmtMoney, fmtPct, fmtInt } from './util.js';
import { simulateMonth, statusReport, valuate } from './engine.js';
import { parseAction, fxCost, affordabilityCheck } from './actions.js';
import { rollEvent } from './events.js';
import { log } from './state.js';
import { range, chance, pick } from './rng.js';

export function initMarket(game) {
  game.market = {
    ...game.market,
    month: 0,
    econIndex: 1,
    wageIndex: 1,
    adPriceIndex: 1,      // rises when teams outspend each other on ads
    signals: [],          // public feed
    pending: {},          // cid -> parsed fx staged this round
    privateBooks: true,   // teacher toggle
    lastReport: null,
  };
}

export function signal(game, text) {
  game.market.signals.push({ month: game.market.month, text });
  if (game.market.signals.length > 60) game.market.signals.shift();
}

// Stage a team's decision. Returns {staged} | {clarify} | {rejected}.
export function stageDecision(game, cid, text, rng) {
  const c = game.companies[cid];
  if (!c || c.status !== 'active') return { rejected: 'Company is not active.' };
  const parsed = parseAction(text, c, { mode: 'advanced', rng });
  if (parsed.clarify) return { clarify: parsed.clarify };
  const afford = affordabilityCheck(parsed.fx, c);
  if (!afford.ok) return { rejected: afford.reason };
  const fx = parsed.fx;
  if (fx.fundraiseAsk) {
    // Team mode fundraise: market-priced, simple — VCs only fund growth stories.
    const ok = (c.growthPct > 0.1 || c.customers > 300) && chance(rng, 0.6);
    if (ok) {
      fx.cashDelta = (fx.cashDelta || 0) + fx.fundraiseAsk;
      fx.fundingNote = `Market investors fund momentum: ${fmtMoney(fx.fundraiseAsk)} in, ~20% equity out.`;
      c.equitySoldPct = Math.min(90, c.equitySoldPct + 20);
      for (const row of c.capTable) row.pct = Math.round(row.pct * 0.8 * 10) / 10;
    } else {
      fx.notes.push('Investors pass — in a competitive market they only fund clear momentum. The ask is rejected.');
      fx.label += ' (rejected by investors)';
    }
    delete fx.fundraiseAsk;
  }
  game.market.pending[cid] = fx;
  return { staged: true, label: fx.label };
}

export const allStaged = (game) => game.order.every((cid) => game.companies[cid].status !== 'active' || game.market.pending[cid]);

// Resolve every staged decision SIMULTANEOUSLY against the shared market.
export function resolveMarketRound(game, rng) {
  const mkt = game.market;
  mkt.month += 1;
  const live = game.order.map((cid) => game.companies[cid]).filter((c) => c.status === 'active');

  // Market-wide ad inflation: total ad spend vs a soft market budget.
  const totalAd = live.reduce((s, c) => s + (mkt.pending[c.id]?.marketing || 0), 0);
  const softCap = 8000 * Math.max(1, live.length);
  mkt.adPriceIndex = clamp(1 + Math.max(0, (totalAd - softCap) / softCap) * 0.9, 0.8, 3.2);

  // Random econ drift.
  if (chance(rng, 0.25)) {
    mkt.econIndex = clamp(mkt.econIndex + range(rng, -0.1, 0.1), 0.8, 1.2);
  }

  const reports = {};
  for (const c of live) {
    c.round += 1;
    const ev = rollEvent(c, game, rng);
    let eventFx = {};
    if (ev) {
      eventFx = ev.fx || {};
      log(game, `${CATEGORY_PREFIX}${ev.title}: ${ev.text}`, { type: 'event', cid: c.id, tags: ['event', ev.category] });
    }
    const fx = { ...(mkt.pending[c.id] || { label: 'Hold steady', notes: [], tags: [] }), ...eventFx, notes: [...(mkt.pending[c.id]?.notes || [])] };

    // Record market-visible signals BEFORE resolution (competitors see moves, not books).
    if (fx.marketing > 1500) signal(game, `${c.name} blankets the market with ${fx.channel || 'ads'} — CAC rises for everyone.`);
    if (fx.priceDeltaPct < -0.1 || (fx.priceSet && fx.priceSet < c.price * 0.9)) signal(game, `Price move: ${c.name} cuts prices — a price war may be starting.`);
    if (fx.productAdvance === 'launched') signal(game, `${c.name} launches publicly.`);
    if (fx.newLocation) signal(game, `${c.name} expands to a new location.`);
    if (fx.priceDeltaPct > 0.1) signal(game, `${c.name} raises prices.`);

    const res = simulateMonth(c, fx, { rng, market: mkt });
    if (fx.fundingNote) fx.notes.push(fx.fundingNote);

    reports[c.id] = { fx, event: ev, notes: [...(fx.notes || []), ...res.notes], delta: res.delta, bankrupt: res.bankrupt, report: statusReport(c, fx, [...(fx.notes || []), ...res.notes], { event: ev, mode: 'team' }) };
    log(game, `${c.name}: "${fx.label}" → revenue ${fmtMoney(c.lastMonth.revenue)}, net ${fmtMoney(c.lastMonth.net, { sign: true })}, cash ${fmtMoney(c.cash)}`, { type: 'round', cid: c.id, tags: fx.tags || [] });
    if (res.bankrupt) {
      log(game, `💀 ${c.name} ran out of cash and shuts down.`, { type: 'event', cid: c.id, tags: ['bankrupt'] });
      signal(game, `${c.name} has shut down — their customers are up for grabs.`);
    }
  }
  mkt.pending = {};
  mkt.lastReport = reports;

  // Leaderboard: cash + equity value of what you still own.
  mkt.leaderboard = game.order
    .map((cid) => {
      const c = game.companies[cid];
      const v = valuate(c);
      const founderShare = (c.capTable.find((r) => r.holder === 'Founders')?.pct ?? 100) / 100;
      return {
        cid, name: c.name, status: c.status,
        score: c.status === 'bankrupt' ? 0 : roundMoney(c.cash + v.value * founderShare),
        detail: c.status === 'bankrupt' ? 'out of business' : `cash ${fmtMoney(c.cash)} + founder equity ≈ ${fmtMoney(v.value * founderShare)}`,
      };
    })
    .sort((a, b) => b.score - a.score);

  return reports;
}

const CATEGORY_PREFIX = '';

/* Combined market report for the teacher's screen. */
export function marketReport(game) {
  const mkt = game.market;
  const lines = [];
  lines.push(`Month ${mkt.month} · economy ${mkt.econIndex > 1.05 ? 'growing' : mkt.econIndex < 0.95 ? 'contracting' : 'stable'} (index ${mkt.econIndex.toFixed(2)}) · ad price index ${mkt.adPriceIndex.toFixed(2)}${mkt.adPriceIndex > 1.3 ? ' — advertising is expensive this month because teams are outbidding each other' : ''}`);
  return lines.join('\n');
}
