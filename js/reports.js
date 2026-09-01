// Reports & Teacher Tools: rubric scoring, per-team debriefs, printable case studies.
// Everything is generated from the game's running log + per-round history (evidence-based).
import { fmtMoney, fmtPct, fmtInt } from './util.js';
import { termsUsedIn } from './glossary.js';
import { valuate } from './engine.js';

/* ------------------------------------------------------------- rubric ------- */

// 4 categories × 1–4 points, each with quoted evidence from the log/history.
export function rubric(game, c) {
  const h = c.history;
  const rows = [];

  // 1. Financial discipline
  {
    let score = 2; const ev = [];
    const minRunway = h.length ? Math.min(...h.map((x) => x.net < 0 ? x.cash / Math.max(1, -x.net) : Infinity)) : Infinity;
    if (c.status === 'bankrupt') { score = 1; ev.push('the company ran out of cash'); }
    if (minRunway === Infinity) { score = Math.max(score, 3); ev.push('operated cash-flow positive'); }
    else if (minRunway > 6) { score = 4; ev.push(`never let runway drop below ~${minRunway.toFixed(1)} months`); }
    else if (minRunway < 2) { score = Math.min(score, 2); ev.push(`runway dipped under 2 months`); }
    if (h.some((x) => x.net > 0)) ev.push('posted at least one profitable month');
    rows.push({ category: 'Financial discipline', score, evidence: ev.join('; ') || 'no strong signal either way' });
  }

  // 2. Growth strategy
  {
    let score = 2; const ev = [];
    const channels = new Set(h.flatMap((x) => (x.actionTags || []).filter((t) => t.startsWith('marketing') || t.includes('-')).map(String)));
    const mktgRounds = h.filter((x) => (x.actionTags || []).includes('marketing')).length;
    if (c.customers > (h[0]?.customers || 1) * 1.5) { score = 3; ev.push(`grew the customer base to ${fmtInt(c.customers)}`); }
    if (c.growthPct > 0.1) { score = 4; ev.push(`sustaining ${fmtPct(c.growthPct)} monthly growth`); }
    if (mktgRounds >= 2) ev.push(`invested in demand across ${mktgRounds} rounds`);
    if (c.lastMonth && c.cac > 0 && c.price > 0 && c.cac > c.price * 3) { score = Math.min(score, 2); ev.push(`CAC (${fmtMoney(c.cac)}) looks rich vs. unit value (${fmtMoney(c.price)}) — unit economics unproven`); }
    if (h.every((x) => (x.actionTags || []).includes('hold'))) { score = 1; ev.push('never made a growth move — holding cash is not a strategy'); }
    rows.push({ category: 'Growth strategy', score, evidence: ev.join('; ') || 'limited evidence of a deliberate growth plan' });
  }

  // 3. Response to random events
  {
    let score = 2; const ev = [];
    const events = game.log.filter((l) => l.type === 'event' && (!l.cid || l.cid === c.id));
    if (!events.length) { score = 3; ev.push('no major events fired — managed the quiet well'); }
    else {
      let responded = 0;
      for (const e of events) {
        const after = h.filter((x) => x.month >= e.round);
        if (after.length && after[0].note && !/hold|save/i.test(after[0].note)) responded++;
      }
      if (responded >= Math.ceil(events.length / 2)) { score = 4; ev.push(`responded actively to ${responded}/${events.length} events`); }
      else if (responded >= 1) { score = 3; ev.push(`responded to ${responded}/${events.length} events, rode out the rest`); }
      else { ev.push(`${events.length} event(s) hit with little visible response`); }
    }
    rows.push({ category: 'Response to events', score, evidence: ev.join('; ') });
  }

  // 4. Vocabulary use (scanned from the student's own free-text actions)
  {
    const used = new Set();
    for (const x of h) for (const t of (x.actionTags || [])) if (t.startsWith('vocab:')) used.add(t.slice(6));
    let score = used.size >= 6 ? 4 : used.size >= 3 ? 3 : used.size >= 1 ? 2 : 1;
    rows.push({
      category: `Use of ${game.mode === 'advanced' ? 'advanced' : 'business'} vocabulary`,
      score,
      evidence: used.size ? `Used correctly in decisions: ${[...used].slice(0, 8).join(', ')}` : 'No business terms used in decision entries yet',
    });
  }

  const total = rows.reduce((s, r) => s + r.score, 0);
  return { rows, total, max: 16, company: c.name };
}

/* ------------------------------------------------------------- debrief ------ */

export function debrief(game, c) {
  const h = c.history;
  if (!h.length) return `${c.name} hasn't played a round yet.`;
  const best = [...h].sort((a, b) => b.net - a.net)[0];
  const worst = [...h].sort((a, b) => a.net - b.net)[0];
  const parts = [];
  parts.push(`**${c.name}** — Best decision: month ${best.month}, *"${best.note}"* (${fmtMoney(best.net, { sign: true })} net that month). ${best.net > 0 ? 'It converted intent into actual profit — the hardest thing in business.' : 'Even their best month was a loss — which itself is the lesson: the model never proved it could make money.'}`);
  parts.push(`Worst decision: month ${worst.month}, *"${worst.note}"* (${fmtMoney(worst.net, { sign: true })} net). ${worst.net < -(c.cash + 1000) ? 'Spending outran evidence — a classic way young companies die.' : 'A survivable mistake, and survivable mistakes are how founders actually learn.'}`);
  parts.push(c.status === 'bankrupt'
    ? 'Final note: the business failed on cash. In this simulation that\'s a feature, not a bug — every real founder they\'ll ever meet has a version of this story.'
    : `Final note: they finished with ${fmtMoney(c.cash)} in the bank and a company worth ≈ ${fmtMoney(valuate(c).value)} — a real, defensible outcome.`);
  return parts.join(' ');
}

/* ------------------------------------------------------------ case study ---- */

export function caseStudy(game, c) {
  const h = c.history;
  const v = valuate(c);
  const L = [];
  L.push(`# Case study: ${c.name}`);
  L.push(`*"${c.tagline}"* — An ${c.industryLabel} business (${c.revenueModelLabel}), founded by ${c.founders.join(', ') || 'your class'}.`);
  L.push('');
  L.push('## The idea');
  L.push(c.idea.desc || '—');
  L.push(`Target customer: ${c.idea.customer || '—'}. Claimed unfair advantage: ${c.idea.advantage || '—'}.`);
  L.push('');
  L.push('## The journey');
  for (const x of h) {
    L.push(`- **Month ${x.month}** — *${x.note}* → revenue ${fmtMoney(x.revenue)}, net ${fmtMoney(x.net, { sign: true })}, cash ${fmtMoney(x.cash)}, ${fmtInt(x.customers)} customers`);
  }
  const events = game.log.filter((l) => l.type === 'event' && (!l.cid || l.cid === c.id));
  if (events.length) {
    L.push('');
    L.push('## Things they didn\'t control');
    for (const e of events) L.push(`- ${e.text}`);
  }
  L.push('');
  L.push('## Where it ended');
  L.push(`${c.status === 'bankrupt' ? '💀 The business ran out of cash and failed.' : `Cash ${fmtMoney(c.cash)} · estimated value ≈ ${fmtMoney(v.value)} · reputation ${c.reputation.toFixed(1)}/10.`}`);
  L.push('');
  L.push('## Discussion questions');
  const qs = [];
  if (h.length) {
    const costly = [...h].sort((a, b) => a.net - b.net)[0];
    qs.push(`In month ${costly.month} they chose to *${costly.note.toLowerCase()}* and the result was ${fmtMoney(costly.net, { sign: true })} net. What information could they have gathered first, and what would you have done instead?`);
  }
  qs.push(`Was ${c.name}'s core constraint money, demand, or capacity? What single change would have most improved the outcome?`);
  qs.push(`The realistic growth ceiling (5–15%/mo without a catalyst) shaped everything. How should a founder plan around knowing growth is slow and expensive?`);
  L.push(qs.slice(0, 3).map((q, i) => `${i + 1}. ${q}`).join('\n'));
  return L.join('\n');
}

/* Small inline status snippets reused by several screens. */
export function oneLiner(c) {
  const m = c.lastMonth;
  if (!m) return 'Month 1 — nothing has happened yet. Everything is about to.';
  return `M${c.month}: rev ${fmtMoney(m.revenue)} · net ${fmtMoney(m.net, { sign: true })} · cash ${fmtMoney(c.cash)} · ${fmtInt(c.customers)} customers`;
}
