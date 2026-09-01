// Capstone: Exit Day — final valuation, exit paths, and the auto-generated investor memo.
import { valuate, runway } from './engine.js';
import { balanceSheet } from './advanced.js';
import { roundMoney, fmtMoney, fmtPct, fmtInt } from './util.js';
import { pick, range, chance } from './rng.js';
import { log } from './state.js';

const ACQUIRERS = ['Regional Holdings Group', 'Northbeam Consolidated', 'A strategic rival', 'A private-equity roll-up fund', 'Main Street Capital'];

export function exitOffers(c, game, rng) {
  const v = valuate(c);
  const offers = [];
  if (v.value > 20_000 && (c.lastMonth?.revenue ?? 0) > 0) {
    const n = v.value > 250_000 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const mult = range(rng, 0.75, 1.3);
      offers.push({
        kind: 'acquisition',
        buyer: pick(rng, ACQUIRERS),
        amount: roundMoney(v.value * mult),
        note: mult < 0.9 ? 'Lowball — they sense your constraints.' : mult > 1.15 ? 'A generous strategic premium.' : 'A fair-market offer.',
      });
    }
  }
  // Lifestyle: annual owner income if profitable.
  const lifestyle = c.lastMonth && c.lastMonth.net > 0
    ? { kind: 'lifestyle', annual: roundMoney(c.lastMonth.net * 12 * 0.8), note: 'Keep it. Pay yourself most of the profit forever (≈80% of current annual profit, owners always reinvest a little).' }
    : null;
  const windDown = { kind: 'winddown', amount: roundMoney(Math.max(0, c.cash * 0.9 - c.debt)), note: 'Sell the assets, pay the debts, walk away with what\'s left.' };
  return { valuation: v, acquisition: offers, lifestyle, windDown, raise: c.lastMonth?.net > 0 || c.growthPct > 0.1 ? { amount: roundMoney(Math.max(50_000, v.value * 0.25)) } : null };
}

export function applyExit(c, game, choice) {
  c.status = 'exited';
  c.exit = choice;
  log(game, `EXIT DAY — ${c.name} chooses: ${describeExit(choice)}`, { type: 'exit', cid: c.id, tags: ['exit'] });
}

export function describeExit(choice) {
  switch (choice.kind) {
    case 'acquisition': return `SOLD to ${choice.buyer} for ${fmtMoney(choice.amount)}`;
    case 'lifestyle': return `Keep it as a lifestyle business (~${fmtMoney(choice.annual)}/yr of owner income)`;
    case 'raise': return `Raise ${fmtMoney(choice.amount)} more and keep swinging for growth`;
    case 'winddown': return `Wind down and walk away with ${fmtMoney(choice.amount)}`;
    default: return choice.kind;
  }
}

/* The investor memo: what they did well, what hurt them, and what a real
   investor/buyer would think today. Evidence comes from the company's history. */
export function investorMemo(c) {
  const v = valuate(c);
  const h = c.history;
  const best = h.length ? [...h].sort((a, b) => b.net - a.net)[0] : null;
  const worst = h.length ? [...h].sort((a, b) => a.net - b.net)[0] : null;
  const lines = [];
  lines.push(`# Investor memo — ${c.name}`);
  lines.push(`*"${c.tagline}"* · ${c.industryLabel} · ${c.revenueModelLabel}`);
  lines.push('');
  lines.push(`**Verdict:** ${c.status === 'bankrupt' ? 'Expired — out of cash.' : `Estimated value ≈ **${fmtMoney(v.value)}**.`}`);
  for (const f of v.factors) lines.push(`- ${f}`);
  lines.push('');
  lines.push(`**The journey (${h.length} months):** started with ${fmtMoney(h[0] ? h[0].cash : c.cash)}; ended with ${fmtMoney(c.cash)} cash, ${fmtInt(c.customers)} customers, reputation ${c.reputation.toFixed(1)}/10.`);
  if (best && best.net > 0) lines.push(`**Best month (M${best.month}, "${best.note}"):** ${fmtMoney(best.net, { sign: true })} net — proof the model can work.`);
  if (worst && worst.net < 0) lines.push(`**Worst month (M${worst.month}, "${worst.note}"):** ${fmtMoney(worst.net, { sign: true })} net — the expensive lesson.`);
  const strengths = [], concerns = [];
  if (c.lastMonth?.net > 0) strengths.push('reached profitability');
  if (c.reputation >= 7) strengths.push('built a genuinely strong brand');
  if (c.growthPct > 0.1) strengths.push('showed real demand (double-digit monthly growth)');
  if (c.equitySoldPct <= 20) strengths.push('kept the cap table clean — founders still own the company');
  if (runway(c) !== Infinity && runway(c) < 4) concerns.push('cash discipline was shaky — runway under 4 months at the end');
  if (c.churnPct > 0.15) concerns.push(`churn (${fmtPct(c.churnPct)}/mo) never got under control`);
  if (c.status === 'bankrupt') concerns.push('the company ran out of cash — the ultimate teacher');
  if (h.length >= 3 && h[h.length - 1].customers < h[0].customers) concerns.push('the customer base shrank over the unit');
  lines.push('');
  lines.push(`**What they did well:** ${strengths.length ? strengths.join('; ') : 'took real swings and generated real data'}.`);
  lines.push(`**What hurt them:** ${concerns.length ? concerns.join('; ') : 'no fatal wounds on the books'}.`);
  lines.push('');
  lines.push(`**What a real investor would say:** "${memoQuote(c)}"`);
  return lines.join('\n');
}

function memoQuote(c) {
  if (c.status === 'bankrupt') return 'Cash is oxygen. This team learned the most expensive lesson in entrepreneurship cheaply — in a simulation. I\'d back what they learned, with a smaller check.';
  if ((c.lastMonth?.net ?? 0) > 0 && c.growthPct > 0.08) return 'Rare combination: profitable AND growing. This is the one I\'d actually take a second meeting with.';
  if ((c.lastMonth?.net ?? 0) > 0) return 'A solid, honest business. Not a rocket ship — and that is completely fine. Most real businesses are this.';
  if (c.growthPct > 0.12) return 'Growth is real, burn is real. Show me the path to margin and we can talk terms.';
  return 'The idea needs sharper unit economics before it needs money. Come back with evidence customers can\'t live without it.';
}
