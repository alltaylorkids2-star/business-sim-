// The Random Event Engine.
//
// rollEvent(company, game, rng) → null | { title, text, category, severity, fx }
//  - fires with ~1/3 probability per round (engine.EVENT_PROBABILITY)
//  - pools are industry-tagged so events feel specific, not generic
//  - severity scales with business health: well-run companies get manageable events,
//    shaky ones risk a compounding crisis (fair but real)
import { INDUSTRIES } from './industries.js';
import { clamp, roundMoney, fmtMoney, fmtPct } from './util.js';
import { pick, chance, range, rint } from './rng.js';

// Each event: tags (industries or 'any'), minStage, severity band, build(c, sev, rng) → details.
const POOL = [
  {
    key: 'econ-downturn', category: 'Economy', tags: ['any'], weight: 1,
    title: 'The local economy tightens',
    text: 'Inflation bites and customers get cautious. Spending across your market dips ~10% this month.',
    fx: (c) => ({ revenueShock: 0.9 }), severity: 2,
  },
  {
    key: 'econ-upturn', category: 'Economy', tags: ['any'], weight: 0.8,
    title: 'Local economy perks up',
    text: 'Consumer confidence rises — people are spending again. Demand runs ~8% hot this month.',
    fx: (c) => ({ revenueShock: 1.08 }), severity: -1,
  },
  {
    key: 'supply-hike', category: 'Supply chain', tags: ['food', 'retail', 'product'], weight: 1.4,
    title: 'Key supplier raises prices',
    text: (c, sev, rng) => `Your main supplier cites "cost pressures" and raises prices. Your cost of goods climbs ~${rint(rng, 6, 8)}% unless you absorb it.`,
    fx: (c, sev) => ({ cogsShock: -(0.04 + sev * 0.02) }), severity: 2,
  },
  {
    key: 'supply-shortage', category: 'Supply chain', tags: ['food', 'retail', 'product'], weight: 0.8,
    title: 'Supply shortage',
    text: 'A key input is backordered for weeks. You can fulfill ~15% fewer orders this month no matter what demand does.',
    fx: () => ({ revenueShock: 0.85 }), severity: 2,
  },
  {
    key: 'competitor-enters', category: 'Competition', tags: ['any'], weight: 1.1,
    title: 'New competitor opens nearby',
    text: (c) => `A new ${INDUSTRIES[c.industry].label.toLowerCase()} player launches with aggressive intro pricing. Some of your customers will be curious.`,
    fx: (c, sev) => ({ eventChurnDelta: 0.04 + sev * 0.02, spawn: true }), severity: 2,
  },
  {
    key: 'competitor-price-war', category: 'Competition', tags: ['any'], weight: 1,
    title: 'Price war brewing',
    text: (c) => {
      const rival = c.competitors.find((x) => x.alive);
      return rival ? `${rival.name} slashes prices ~20%. Match them (margin pain) or hold (possible customer pain)?` : 'A rival cuts prices hard across your market.';
    },
    fx: (c, sev, rng) => {
      const rival = c.competitors.find((x) => x.alive);
      if (rival) { rival.priceIdx = roundMoney(Math.max(1, rival.priceIdx * 0.8)); rival.lastMove = 'slashed prices 20%'; }
      return { eventChurnDelta: 0.03 };
    }, severity: 2,
  },
  {
    key: 'competitor-exit', category: 'Competition', tags: ['any'], weight: 0.5,
    title: 'A competitor shuts down',
    text: (c) => {
      const rival = c.competitors.find((x) => x.alive);
      return rival ? `${rival.name} closes its doors — their customers need somewhere to go.` : 'A player in your market quietly folds.';
    },
    fx: (c, sev, rng) => {
      const rival = c.competitors.find((x) => x.alive);
      if (rival) { rival.alive = false; rival.lastMove = 'shut down'; }
      return { catalyst: { mult: 1.3, months: 2, label: `absorbing ex-customers of a fallen rival` }, reputationDelta: 0.2 };
    }, severity: -2,
  },
  {
    key: 'viral-positive', category: 'PR', tags: ['any'], weight: 0.7,
    title: 'Organic viral moment',
    text: 'A customer posts about you and it catches fire — thousands of views, local news picks it up. Strap in.',
    fx: (c) => ({ catalyst: { mult: 2.4, months: 2, label: 'viral moment' }, reputationDelta: 1.2 }), severity: -3,
  },
  {
    key: 'review-bomb', category: 'PR', tags: ['any'], weight: 0.9,
    title: 'Review bomb',
    text: 'A bad interaction goes sideways online: a pile of angry 1-star reviews lands in one weekend.',
    fx: (c, sev) => ({ reputationDelta: -(0.7 + sev * 0.4), eventChurnDelta: 0.02 }), severity: 2,
  },
  {
    key: 'regulation', category: 'Regulatory', tags: ['food'], weight: 0.7,
    title: 'New health & permit rules',
    text: 'The county updates food-service regs: a surprise inspection fee and compliance upgrades are due this month.',
    fx: (c) => ({ cashCost: roundMoney(Math.max(600, c.cash * 0.08)) }), severity: 2,
  },
  {
    key: 'platform-change', category: 'Regulatory', tags: ['saas', 'marketplace', 'content', 'retail'], weight: 0.7,
    title: 'Platform rules change',
    text: 'A big platform tweaks its algorithm / app-store rules. Reach and conversion wobble while everyone recalibrates.',
    fx: (c) => ({ revenueShock: 0.92, eventChurnDelta: 0.01 }), severity: 1,
  },
  {
    key: 'talent-available', category: 'Talent', tags: ['any'], weight: 0.8,
    title: 'Great candidate on the market',
    text: (c) => `A ${c.industry === 'saas' ? 'sharp engineer' : 'proven operator'} you know just became available — a rare hiring window, if you can afford them.`,
    fx: () => ({ info: true }), severity: -1, // informational: the hiring choice belongs to the student
  },
  {
    key: 'key-quit', category: 'Talent', tags: ['any'], weight: 0.9,
    needsTeam: true,
    title: 'Resignation on your desk',
    text: (c) => {
      const staff = c.team.filter((x) => !x.founder);
      return staff.length ? `${staff[0].role} quits for a steadier paycheck. You can backfill (costly, slow) or absorb the work (morale risk).` : 'Burnout is in the air.';
    },
    fx: (c, sev) => {
      const idx = c.team.findIndex((x) => !x.founder);
      if (idx >= 0) { const [g] = c.team.splice(idx, 1); return { fires: [], moraleDelta: -0.6, _removed: g }; }
      return { moraleDelta: -0.8 };
    }, severity: 2,
  },
  {
    key: 'burnout', category: 'Talent', tags: ['any'], weight: 0.8,
    minMorale: 5.5, // fires when morale is LOW (see pickEvent inversion)
    title: 'Burnout creeping in',
    text: 'The pace is showing: mistakes up, energy down. Ignoring it costs more than addressing it.',
    fx: (c) => ({ moraleDelta: -0.7, qualityBoost: -0.4 }), severity: 1,
  },
  {
    key: 'trend-shift', category: 'Customers', tags: ['any'], weight: 0.9,
    title: 'Customer tastes are shifting',
    text: 'Your segment is talking about a new must-have this month. Businesses that adapt early will ride it.',
    fx: (c) => ({ info: true, eventChurnDelta: c.quality >= 7 ? -0.02 : 0.02 }), severity: 1,
  },
  {
    key: 'loyalty-spike', category: 'Customers', tags: ['any'], weight: 0.6,
    title: 'Regulars rally around you',
    text: 'Someone starts a "support local" thread naming your business. Loyalty and referrals tick up.',
    fx: (c) => ({ reputationDelta: 0.5, eventChurnDelta: -0.02, catalyst: { mult: 1.25, months: 1, label: 'community rally' } }), severity: -1,
  },
  {
    key: 'lawsuit', category: 'Legal', tags: ['any'], weight: 0.4,
    title: 'Cease & desist letter',
    text: 'A bigger player claims your name/branding is too close to theirs. Lawyers cost money even when you\'re right.',
    fx: (c, sev) => ({ cashCost: roundMoney(Math.max(1_500, c.cash * 0.12)), moraleDelta: -0.4 }), severity: 3,
  },
];

// Weighted pick with industry tags, stage fit, and health-scaled severity.
export function rollEvent(c, game, rng, { force = false } = {}) {
  if (!force && !chance(rng, 1 / 3)) return null;

  const r = c.lastMonth ? c.cash / Math.max(1, -Math.min(0, c.lastMonth.net)) : 12;
  const health = (c.morale + c.quality + c.reputation) / 30;           // 0..1
  const shaky = r < 3 || health < 0.5;                                  // compounding-crisis risk
  const strong = r > 8 && health > 0.65;

  let candidates = POOL.filter((e) =>
    (e.tags.includes('any') || e.tags.includes(c.industry)) &&
    (!e.needsTeam || c.team.some((x) => !x.founder)) &&
    (e.key !== 'burnout' || c.morale < 6) &&
    (c.stage === 'launched' || c.stage === 'scaling' || ['viral-positive', 'talent-available', 'lawsuit', 'platform-change'].includes(e.key))
  );
  if (!candidates.length) return null;

  // Well-run companies skew toward manageable/neutral events; shaky ones skew negative.
  const weighted = [];
  for (const e of candidates) {
    let w = e.weight;
    if (strong && e.severity > 1) w *= 0.5;
    if (strong && e.severity < 0) w *= 1.3;
    if (shaky && e.severity >= 2) w *= 1.4;
    weighted.push([e, w]);
  }
  let total = weighted.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  let ev = weighted[0][0];
  for (const [e, w] of weighted) { roll -= w; if (roll <= 0) { ev = e; break; } }

  // Severity of THIS hit: 0 (manageable) → 3 (crisis). Shaky companies get worse draws.
  const sev = clamp((shaky ? rint(rng, 1, 3) : strong ? rint(rng, 0, 1) : rint(rng, 0, 2)), 0, 3);
  const fx = ev.fx(c, sev, rng) || {};
  if (fx.spawn) {
    delete fx.spawn;
    c.competitors.push({
      name: pick(rng, ['Nova', 'Prime', 'Urban', 'Bold', 'Next']) + ' ' + pick(rng, ['Labs', 'Co.', 'Collective', 'Works', 'House']),
      priceIdx: roundMoney(c.price * range(rng, 0.75, 0.95)),
      aggression: range(rng, 0.6, 0.95), lastMove: 'just launched with intro pricing', alive: true,
    });
  }
  const text = typeof ev.text === 'function' ? ev.text(c, sev, rng) : ev.text;
  return { key: ev.key, category: ev.category, title: ev.title, text, severity: sev, fx };
}

// Categories legend for the UI / reports.
export const CATEGORY_EMOJI = {
  Economy: '🌦️', 'Supply chain': '📦', Competition: '⚔️', PR: '📣',
  Regulatory: '📜', Talent: '🧑‍💼', Customers: '👥', Legal: '⚖️',
};
