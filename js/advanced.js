// Mode 2 (Advanced / "Real Lingo" Mode) machinery:
// mini P&L, simplified balance sheet, cap table, and fundraising with simulated investors.
import { INDUSTRIES } from './industries.js';
import { roundMoney, fmtMoney, fmtPct, clamp } from './util.js';
import { runway, ltv, valuate } from './engine.js';
import { pick, range, rint, chance } from './rng.js';

/* ------------------------------------------------------------------ P&L --- */

export function pnl(c) {
  const m = c.lastMonth || { revenue: 0, cogs: 0, opex: 0, net: 0, payroll: 0, fixed: 0, marketing: 0, misc: 0, gm: (INDUSTRIES[c.industry].grossMargin[0] + INDUSTRIES[c.industry].grossMargin[1]) / 2 };
  const grossProfit = m.revenue - m.cogs;
  const rows = [
    ['Revenue (MRR/sales)', m.revenue],
    ['COGS', -m.cogs],
    ['Gross profit', grossProfit, `gross margin ${fmtPct(m.revenue ? grossProfit / m.revenue : 0)}`],
    ['Payroll', -m.payroll],
    ['Rent / infra / fixed', -m.fixed],
    ['Marketing', -m.marketing],
    ['Misc / G&A', -m.misc],
    ['EBITDA (≈ net)', m.net, m.net >= 0 ? 'profitable' : 'burning'],
  ];
  const metrics = {
    burn: m.net < 0 ? -m.net : 0,
    runway: runway(c),
    ltv: ltv(c),
    cac: c.cac,
    ltvCac: c.cac ? ltv(c) / c.cac : 0,
    mrr: INDUSTRIES[c.industry].priceModel === 'monthly' ? m.revenue : null,
    netMargin: m.revenue ? m.net / m.revenue : 0,
  };
  return { rows, metrics };
}

/* ---------------------------------------------------------- balance sheet --- */

export function balanceSheet(c) {
  const v = valuate(c);
  return {
    assets: [
      ['Cash', c.cash],
      ['Equipment / IP (book est.)', roundMoney((c.locations - 1) * 15000 + c.team.length * 2000 + (c.stage !== 'idea' ? 8000 : 0))],
    ],
    liabilities: [
      ['Loans & IOUs', c.debt],
    ],
    equityNote: `Implied enterprise value ≈ ${fmtMoney(v.value)} (${v.factors[0].toLowerCase()})`,
  };
}

/* --------------------------------------------------------------- cap table --- */

export function capTable(c) {
  return c.capTable.map((r) => ({ ...r }));
}

/* -------------------------------------------------------------- fundraising --- */

const INVESTOR_NAMES = ['Cascade Ventures', 'Blue Heron Capital', 'Foundry Fund', 'Brightline Angels', 'Meridian Seed', 'Goldfinch Partners'];

// Simulate investor response to an ask. Traction drives generosity.
export function generateOffers(c, ask, rng) {
  const v = valuate(c);
  const traction = clamp((c.growthPct * 8) + (c.reputation / 10) + (c.customers > 500 ? 0.3 : c.customers > 100 ? 0.15 : 0), 0.15, 1.6);
  const basePre = Math.max(v.value, ask * 2) * range(rng, 0.8, 1.3) * traction;

  const nOffers = traction > 1 ? rint(rng, 2, 3) : traction > 0.55 ? rint(rng, 1, 2) : (chance(rng, 0.5) ? 1 : 0);
  const offers = [];
  for (let i = 0; i < nOffers; i++) {
    const pre = roundMoney(basePre * range(rng, 0.85, 1.2));
    const kind = chance(rng, 0.5) ? 'Priced round' : 'SAFE note';
    const dilution = ask / (pre + ask);
    offers.push({
      id: 'o' + i + '_' + Math.round(pre),
      investor: pick(rng, INVESTOR_NAMES),
      kind,
      amount: ask,
      preMoney: pre,
      postMoney: pre + ask,
      dilutionPct: Math.round(dilution * 1000) / 10,
      note: kind === 'SAFE note'
        ? `Converts at a ${fmtMoney(pre)} cap. No board seat today; the valuation argument comes later.`
        : `${fmtMoney(pre)} pre-money — they want a board observer and monthly updates.`,
    });
  }
  return { offers, cold: nOffers === 0 };
}

export function acceptOffer(c, offer) {
  c.cash += offer.amount;
  c.fundingRaised += offer.amount;
  const dil = offer.dilutionPct / 100;
  for (const row of c.capTable) row.pct = Math.round(row.pct * (1 - dil) * 10) / 10;
  c.capTable.push({ holder: offer.investor, pct: offer.dilutionPct, note: offer.kind });
  c.equitySoldPct = Math.round((100 - (c.capTable.find((r) => r.holder === 'Founders')?.pct ?? 0)) * 10) / 10;
}

// Negotiate: honest coin-flip weighted by traction. Can improve terms or lose the offer.
export function negotiate(c, offer, rng) {
  const traction = clamp(c.growthPct * 8 + c.reputation / 12, 0.1, 1.2);
  if (chance(rng, 0.35 + 0.3 * traction)) {
    const better = { ...offer, preMoney: roundMoney(offer.preMoney * 1.2) };
    better.postMoney = better.preMoney + better.amount;
    better.dilutionPct = Math.round((better.amount / better.postMoney) * 1000) / 10;
    better.note += ' (negotiated up — nice.)';
    return { outcome: 'improved', offer: better, text: `${offer.investor} blinks first: pre-money up to ${fmtMoney(better.preMoney)}, dilution down to ${better.dilutionPct}%.` };
  }
  if (chance(rng, 0.4)) {
    return { outcome: 'lost', offer: null, text: `${offer.investor} passes. "Call us when the numbers are steadier." Negotiating has a price — sometimes it's the deal.` };
  }
  return { outcome: 'same', offer, text: `${offer.investor} holds firm: "These are the terms. They're fair."` };
}

// Market-condition sentence for the Market panel.
export function marketCondition(game) {
  const e = game?.market?.econIndex ?? 1;
  return e > 1.05 ? 'growing' : e < 0.95 ? 'contracting' : 'stable';
}
