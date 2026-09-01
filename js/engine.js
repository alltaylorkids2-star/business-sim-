// Core simulation engine: founder setup (Step 0 wizard math), the monthly tick that
// resolves an action's effects into realistic consequences, and the status report.
//
// Everything here obeys the master prompt's Realism Guardrails:
//  - starting capital bands per funding route, industry-scaled
//  - gross margins inside industry bands
//  - CAC scaled by industry, inflated by saturation and market-wide ad competition
//  - organic growth ceilings (5-15%/mo sustained; >20% only with a catalyst)
//  - honest bankruptcy at $0 cash
import { INDUSTRIES, FUNDING_ROUTES, REVENUE_MODELS } from './industries.js';
import { clamp, roundMoney, fmtMoney, fmtPct, fmtInt, plural, uid, clone } from './util.js';
import { range, rint, pick, chance } from './rng.js';
import { termsUsedIn } from './glossary.js';

export const EVENT_PROBABILITY = 1 / 3;

/* ---------------------------------------------------------------- wizard --- */

// Step 0: turn wizard answers into a realistic starting position + a visible rationale.
export function founderSetup({ name, tagline, founders, industry, model, funding, desc, customer, advantage }, rng) {
  const ind = INDUSTRIES[industry];
  const route = FUNDING_ROUTES[funding];
  const reasoning = [];
  const [lo, hi] = route.range;

  // Cash: route midpoint scaled by how capital-hungry the industry is, jittered a little.
  let cash = route.midpoint * ind.capitalIntensity * range(rng, 0.85, 1.15);
  cash = clamp(roundMoney(cash), lo, hi);
  reasoning.push(
    `${route.label}: the guardrail range is ${fmtMoney(lo)}–${fmtMoney(hi)}. ` +
    `${ind.label} is ${ind.capitalIntensity >= 1.05 ? 'capital-hungry' : ind.capitalIntensity <= 0.7 ? 'capital-light' : 'moderately capital-intensive'}, ` +
    `so you start with ${fmtMoney(cash)}${funding === 'seed' ? ' (investors will want a real team and a real cap table for that)' : ''}.`
  );

  // Founding team.
  const founderList = founders.filter(Boolean).map((f) => ({ role: f, pay: 0, founder: true }));
  const team = [...founderList];
  if (funding === 'seed') {
    const hires = ind.capitalIntensity >= 1.1
      ? [{ role: 'Engineer', pay: ind.payPerStaff }, { role: 'Growth/marketing', pay: Math.round(ind.payPerStaff * 0.8) }]
      : [{ role: 'Operations lead', pay: Math.round(ind.payPerStaff * 0.9) }];
    team.push(...hires);
    reasoning.push(`Seed investors expect a team, not a solo founder: you start with ${hires.map((h) => `a ${h.role.toLowerCase()} (${fmtMoney(h.pay)}/mo)`).join(' and ')} on payroll.`);
  } else {
    reasoning.push('Founders take no salary at the start — a classic bootstrapping trade-off that keeps burn low but means this has to work before your savings run out.');
  }

  // Starting stage & customers.
  const stage = ind.startStage;
  const preLaunched = stage === 'prototype';
  let customers = 0, waitlist = 0;
  if (!preLaunched) {
    const base = funding === 'seed' ? [80, 220] : funding === 'loan' ? [40, 120] : [12, 60];
    customers = rint(rng, ...base) * (ind.priceModel === 'monthly' ? 1 : 10);
    reasoning.push(`You launch with a small beachhead: ${plural(customers, ind.customerName)} in month one — friends, neighborhood, and first-mover curiosity, not product-market fit yet.`);
  } else {
    waitlist = rint(rng, 20, 120);
    reasoning.push(`A ${ind.label.toLowerCase()} needs building before it sells, so you start at the prototype stage with ${fmtInt(waitlist)} waitlist sign-ups from your pitch. Your first jobs: finish the product, then launch.`);
  }

  // Price.
  const price = ind.defaultPrice;
  reasoning.push(`Typical ${ind.label.toLowerCase()} pricing for this kind of offer starts around ${fmtMoney(price)} per ${ind.unitName}${ind.priceModel === 'monthly' ? ' / month' : ''}. You can change it anytime — customers will notice.`);

  // Funding consequences.
  let equitySoldPct = 0, fundingRaised = 0, debt = 0;
  const capTable = [{ holder: 'Founders', pct: 100, note: 'common stock' }];
  if (funding === 'seed') {
    equitySoldPct = rint(rng, 15, 25);
    fundingRaised = cash;
    capTable[0].pct = 100 - equitySoldPct;
    capTable.push({ holder: 'Seed investors', pct: equitySoldPct, note: 'priced round' });
    reasoning.push(`For ${fmtMoney(cash)} of seed cash you sold ${equitySoldPct}% of the company — that's an implied post-money valuation of ${fmtMoney(Math.round(cash / (equitySoldPct / 100)))}. Founders keep ${100 - equitySoldPct}%.`);
  } else if (funding === 'loan') {
    debt = cash;
    reasoning.push(`The ${fmtMoney(cash)} is borrowed money: no equity given up, but it will want to be repaid eventually — lenders don't care about your vision, only your cash flow.`);
  }

  const c = {
    id: uid(),
    name: name.trim(),
    tagline: tagline.trim() || 'A new venture',
    founders: founders.filter(Boolean),
    industry, industryLabel: ind.label,
    revenueModel: model, revenueModelLabel: REVENUE_MODELS[model].label,
    idea: { desc, customer, advantage },
    status: 'active',
    round: 0, month: 0,
    cash, debt, lastMonth: null,
    fundingRaised, equitySoldPct, capTable,
    stage, quality: preLaunched ? 5 : 6, reputation: 5, morale: 7,
    price, customers, waitlist,
    cac: ind.cacBase, churnPct: ind.churnBase, growthPct: 0,
    channels: [],
    team,
    locations: 1,
    competitors: spawnCompetitors(industry, rng),
    catalyst: null,
    flags: [],
    history: [],
    exit: null,
    freePersonalInjection: funding !== 'seed', // one-time founder emergency injection allowed
  };
  c.flags = computeFlags(c);
  return { company: c, reasoning };
}

export function spawnCompetitors(industry, rng) {
  const ind = INDUSTRIES[industry];
  if (chance(rng, 1 - ind.competitionBase)) return [];
  const names = {
    food: ['Corner Café Co.', 'Big Chain Kitchen', 'The Trendy Truck'],
    retail: ['MegaMart Online', 'Main Street Boutique', 'Discount Depot'],
    saas: ['NimbusSoft', 'Legacy Systems Inc.', 'HotStartup.io'],
    product: ['MassGoods Inc.', 'Boutique Maker Co.', 'ImportKing'],
    service: ['QuickServe Pros', 'Neighborhood Experts', 'FranchiseForce'],
    marketplace: ['EstablishedHub', 'VentureBacked.io'],
    content: ['The Algorithm King', 'StudioMedia Group'],
  };
  const pool = names[industry] || names.service;
  const n = rint(rng, 1, 2);
  return pool.slice(0, n).map((nm) => ({
    name: nm,
    priceIdx: roundMoney(ind.defaultPrice * range(rng, 0.8, 1.3)),
    aggression: range(rng, 0.3, 0.9),
    lastMove: 'holding steady',
    alive: true,
  }));
}

/* ------------------------------------------------------------- month tick --- */

// Compute one month for a company, given the effects bundle produced by actions.js.
// opts: { rng, market, event (applied already or null), mode }
export function simulateMonth(c, fx, { rng, market }) {
  const ind = INDUSTRIES[c.industry];
  const notes = [];
  const before = snapshot(c);

  /* ---- 1. one-time effect application --------------------------------- */
  if (fx.cashDelta) { c.cash += fx.cashDelta; if (fx.cashDelta > 0) notes.push(`${fmtMoney(fx.cashDelta)} in.`); }
  if (fx.cashCost) { c.cash -= fx.cashCost; }

  for (const h of fx.hires || []) {
    c.team.push(h);
    c.morale = clamp(c.morale + 0.3, 1, 10);
  }
  for (const f of fx.fires || []) {
    const idx = c.team.findIndex((t) => t.role === f.role);
    if (idx >= 0) {
      const [gone] = c.team.splice(idx, 1);
      if (!gone.founder) c.cash -= Math.round(gone.pay * 0.5); // two weeks' severance
      c.morale = clamp(c.morale - 1.2, 1, 10);
      notes.push(`${gone.role} is out${gone.founder ? ' — a founder departure rattles everyone' : ''}. Morale takes the hit.`);
    }
  }
  if (fx._removed) { // an event already removed someone from the roster
    notes.push(`${fx._removed.role} left. Their work doesn't leave with them — it lands on everyone else's desk.`);
  }
  if (fx.moraleDelta) c.morale = clamp(c.morale + fx.moraleDelta, 1, 10);
  if (fx.qualityBoost) c.quality = clamp(c.quality + fx.qualityBoost, 1, 9.6);
  if (fx.reputationDelta) c.reputation = clamp(c.reputation + fx.reputationDelta, 1, 10);

  if (fx.productAdvance) {
    c.stage = fx.productAdvance;
    if (fx.productAdvance === 'launched' && c.waitlist > 0) {
      const converted = Math.round(c.waitlist * range(rng, 0.25, 0.5));
      c.customers += converted;
      notes.push(`Launch day: ${fmtInt(converted)} of your ${fmtInt(c.waitlist)} waitlist converts to paying ${ind.customerName}s.`);
      c.reputation = clamp(c.reputation + 0.5, 1, 10);
    }
  }

  if (fx.priceSet != null || fx.priceDeltaPct) {
    const old = c.price;
    c.price = fx.priceSet != null ? fx.priceSet : Math.max(1, roundMoney(c.price * (1 + fx.priceDeltaPct)));
    const chg = (c.price - old) / old;
    if (chg > 0.12) {
      c.churnPct = clamp(c.churnPct + chg * (c.quality >= 7 ? 0.15 : 0.35), 0, 0.5);
      notes.push(`A ${fmtPct(chg)} price jump tests loyalty${c.quality >= 7 ? ' — your quality cushions it' : ''}.`);
    } else if (chg < -0.12) {
      notes.push(`Price cut of ${fmtPct(-chg)}: demand responds, but every ${ind.unitName} now earns less. Classic trade.`);
      c.reputation = clamp(c.reputation - 0.2, 1, 10);
    }
  }

  if (fx.pivotIndustry) {
    notes.push(`Pivot: you're now playing the ${INDUSTRIES[fx.pivotIndustry].label} game. Expect half your customers not to follow.`);
    c.industry = fx.pivotIndustry;
    c.industryLabel = INDUSTRIES[fx.pivotIndustry].label;
    c.customers = Math.round(c.customers * 0.5);
    c.reputation = clamp(c.reputation - 1, 1, 10);
    c.churnPct = INDUSTRIES[fx.pivotIndustry].churnBase;
  }
  if (fx.newLocation) {
    c.locations += 1;
    notes.push(`Location #${c.locations} signed. Demand roughly doubles over two months — if you can staff it.`);
  }
  if (fx.costCut) {
    c.frugality = (c.frugality || 1) * 0.9;
    c.morale = clamp(c.morale - 0.5, 1, 10);
    notes.push('Tighter ship: discretionary spend is cut ~10%. The team notices.');
  }
  if (fx.catalyst) {
    c.catalyst = { untilRound: c.round + (fx.catalyst.months || 2), mult: fx.catalyst.mult, label: fx.catalyst.label };
  }
  if (fx.debtAdd) c.debt += fx.debtAdd;
  if (fx.clearFlag) c[fx.clearFlag] = false;
  if (fx.license) c.priceModelMult = (c.priceModelMult || 1) + 0.12;
  if (fx.priceModelMultAdd) c.priceModelMult = Math.max(0.5, (c.priceModelMult || 1) + fx.priceModelMultAdd);
  if (fx.acquire) {
    const target = c.competitors.find((x) => x.alive && x.name === fx.acquire.name);
    if (target) {
      target.alive = false;
      target.lastMove = `acquired by ${c.name}`;
      const gained = Math.round(c.customers * 0.3);
      c.customers += gained;
      notes.push(`${target.name} is yours. ${fmtInt(gained)} ${ind.customerName}s come with the deal.`);
    }
  }
  if (fx.windDown) { c.status = 'exited'; c.exit = { kind: 'shutdown' }; }

  /* ---- 2. acquisition --------------------------------------------------- */
  const marketAdIndex = market?.adPriceIndex ?? 1;
  const econ = market?.econIndex ?? 1;
  let newCustomers = 0;
  const usedChannels = [];

  if (c.stage !== 'launched' && c.stage !== 'scaling') {
    // Pre-launch: marketing builds the waitlist, not customers.
    if (fx.marketing > 0) {
      const signups = fx.marketing / Math.max(1.5, ind.cacBase * 0.1);
      c.waitlist += Math.round(signups);
      usedChannels.push(fx.channel || 'pre-launch marketing');
      notes.push(`Still pre-launch — ${fmtMoney(fx.marketing)} of ${fx.channel || 'marketing'} buys buzz, not revenue: +${fmtInt(signups)} waitlist.`);
    }
  } else {
    // Transactional businesses have natural foot traffic: even without marketing a
    // share of churned buyers is replaced organically (better reputation → better
    // replacement). This is what keeps a decent shop stable without ad spend.
    const replacement = ind.priceModel === 'sale'
      ? c.customers * ind.churnBase * clamp(0.55 + c.reputation * 0.05, 0.4, 1.05) * econ
      : 0;

    // Organic: reputation-driven referrals + repeat base.
    const referral = c.customers * ((c.reputation - 3) / 10) * 0.06 * econ;
    newCustomers += Math.max(0, referral) + replacement;

    if (fx.marketing > 0) {
      const channelFactor = { 'social ads': 1, 'influencer': 0.8, 'local flyers': 0.7, 'local events': 0.6, 'cold outreach': 1.3, 'google ads': 1.2, 'content': 0.5, 'partnership': 0.7 }[fx.channel] ?? 1;
      let cac = ind.cacBase * channelFactor * marketAdIndex;
      // Saturation: spend past what the local/shallow market can absorb and CAC balloons.
      const scale = clamp(c.customers, 50, 60000);
      const saturationCap = scale * ind.cacBase * 0.9;
      let satNote = '';
      if (fx.marketing > saturationCap) {
        cac *= 1 + (fx.marketing - saturationCap) / saturationCap;
        satNote = ' Diminishing returns kicked in — you outspent what this market can absorb efficiently.';
      }
      const paid = fx.marketing / cac;
      newCustomers += paid;
      c.cac = Math.max(1, Math.round(cac));
      usedChannels.push(fx.channel || 'ads');
      notes.push(`${fmtMoney(fx.marketing)} on ${fx.channel || 'ads'} at ~${fmtMoney(c.cac)} per ${ind.customerName} → ${fmtInt(paid)} new.${satNote}`);
    }

    // Partnerships convert slowly but cheaply.
    if (fx.partnership) {
      const bump = c.customers * range(rng, 0.05, 0.12);
      newCustomers += bump;
      notes.push(`The ${fx.partnership} partnership starts feeding you ${ind.customerName}s steadily.`);
    }

    // Realism guardrail: growth ceiling unless a catalyst justifies more.
    // (Traffic that merely replaces churned buyers is exempt — it's stability, not growth.)
    const growthCustomers = Math.max(0, newCustomers - replacement);
    const baseCap = Math.max(2, c.customers * ind.organicGrowth * (econ > 1.05 ? 1.25 : 1) * (econ < 0.95 ? 0.7 : 1));
    let cap = baseCap;
    if (c.catalyst && c.catalyst.untilRound >= c.round) cap *= c.catalyst.mult;
    else cap += 3; // brand-new companies can grow fast off a tiny base
    if (growthCustomers > cap) {
      notes.push(`Demand outran what you can realistically convert this month — onboarding and capacity cap growth at ~${fmtPct(cap / Math.max(1, c.customers))} (${c.catalyst && c.catalyst.untilRound >= c.round ? `boosted by ${c.catalyst.label}` : 'the realistic ceiling for a business this size'}).`);
      newCustomers = replacement + cap;
    }
  }

  /* ---- 3. churn & retention --------------------------------------------- */
  let churn = ind.churnBase - (c.quality - 5) * 0.02 + (c.morale < 4 ? 0.05 : 0);
  if (fx.eventChurnDelta) churn += fx.eventChurnDelta;
  churn = clamp(churn, 0.01, 0.6);
  const lost = Math.round(c.customers * churn);
  const prevCustomers = c.customers;
  c.customers = Math.max(0, Math.round(c.customers - lost + newCustomers));
  c.churnPct = churn;
  c.growthPct = prevCustomers > 0 ? (c.customers - prevCustomers) / prevCustomers : 0;

  /* ---- 4. revenue & costs ------------------------------------------------ */
  let arpu = c.price;
  if (c.revenueModel === 'freemium') arpu = c.price * 0.05 + c.price * 0.02; // ~5% pay premium, ads trickle
  if (c.revenueModel === 'advertising') arpu = c.price;
  const season = 1 + ind.seasonAmplitude * Math.sin(((c.month % 12) / 12) * Math.PI * 2 - Math.PI / 3);
  const locMult = 1 + (c.locations - 1) * 0.8;
  const revenue = roundMoney(c.customers * arpu * season * locMult * (c.priceModelMult || 1) * (fx.revenueShock || 1));

  let gm = (ind.grossMargin[0] + ind.grossMargin[1]) / 2 + (c.quality - 6) * 0.01 + (fx.cogsShock || 0);
  if (fx.priceDeltaPct && fx.priceDeltaPct < -0.12) gm -= 0.03; // discounting eats margin
  gm = clamp(gm, ind.grossMargin[0] - 0.08, ind.grossMargin[1] + 0.03);
  const cogs = roundMoney(revenue * (1 - gm));

  const payroll = roundMoney(c.team.reduce((s, t) => s + t.pay * (market?.wageIndex ?? 1), 0));
  const fixed = roundMoney(ind.monthlyFixedBase * (c.locations) * (c.frugality || 1) * (market?.econIndex ? 0.9 + market.econIndex * 0.1 : 1));
  const marketing = roundMoney(fx.marketing || 0);
  const misc = roundMoney((payroll + fixed) * 0.12 * (c.frugality || 1));
  const opex = payroll + fixed + marketing + misc;
  const net = revenue - cogs - opex;

  c.lastMonth = { revenue, cogs, opex, net, payroll, fixed, marketing, misc, gm };

  // Guardrail: you cannot spend money you don't have (the one true "you can't").
  if (net < 0 && c.cash + net < 0) {
    // partial month before the lights go dark — cash is the hard wall
    const affordable = -c.cash;
    notes.push(`⚠️ Cash ran out partway through the month — the plan cost more than you had. The burn stops at zero not by discipline but by physics.`);
    c.cash = 0;
  } else {
    c.cash += net;
  }

  /* ---- 5. people, quality, competition drift ----------------------------- */
  const capacityCap = c.team.length * INDUSTRIES[c.industry].customersPerStaff * (c.locations > 1 ? 1.1 : 1);
  let bottleneck = null;
  if (c.customers > capacityCap) {
    bottleneck = `You need ~${Math.ceil(c.customers / ind.customersPerStaff)} staff for ${fmtInt(c.customers)} ${ind.customerName}s but have ${c.team.length}.`;
    c.quality = clamp(c.quality - 0.35, 1, 10);
    c.morale = clamp(c.morale - 0.3, 1, 10);
    notes.push('Capacity strain: too much demand, not enough hands. Quality and morale slip.');
  }
  c.bottleneck = bottleneck;

  // morale drifts toward 6; wins and losses push it
  c.morale = clamp(c.morale + (6 - c.morale) * 0.15 + (net > 0 ? 0.2 : cashRatio(c) < 2 ? -0.35 : -0.05), 1, 10);
  // quality drifts toward its investment level
  if (!fx.qualityBoost) c.quality = clamp(c.quality + (5.5 - c.quality) * 0.06, 1, 10);
  // reputation follows quality with lag
  c.reputation = clamp(c.reputation + (c.quality - c.reputation) * 0.2 + (fx.reputationDelta || 0) * 0, 1, 10);

  // rivals act
  for (const cp of c.competitors.filter((x) => x.alive)) {
    if (c.price > cp.priceIdx * 1.1 && cp.aggression > 0.55 && chance(rng, 0.5)) {
      c.churnPct = clamp(c.churnPct + 0.03, 0, 0.6);
      cp.lastMove = `undercutting you at ${fmtMoney(cp.priceIdx)}`;
      notes.push(`${cp.name} is undercutting your price — some ${ind.customerName}s drift away.`);
    } else if (c.customers > 0 && c.growthPct > 0.15 && chance(rng, 0.4)) {
      cp.lastMove = `copied your ${(fx.channel || 'marketing')} playbook`;
      notes.push(`${cp.name} noticed your traction and copied your playbook.`);
    } else {
      cp.lastMove = pick(rng, ['holding steady', 'running local promos', 'quiet this month', 'refreshing their brand']);
    }
  }

  /* ---- 6. flags, bankruptcy, history ------------------------------------- */
  c.month += 1;
  c.flags = computeFlags(c);
  const bankrupt = c.cash <= 0;
  if (bankrupt) c.status = 'bankrupt';

  const after = snapshot(c);
  const delta = diff(before, after);
  c.history.push({
    round: c.round, month: c.month,
    cash: c.cash, revenue, net, customers: c.customers,
    morale: +c.morale.toFixed(1), quality: +c.quality.toFixed(1), reputation: +c.reputation.toFixed(1),
    note: fx.label,
    actionText: fx.text, actionTags: tagsFor(fx),
  });
  return { notes, delta, before, after, bankrupt, gm };
}

const tagsFor = (fx) => [...(fx.tags || []), ...termsUsedIn(fx.text || '').map((t) => 'vocab:' + t)];

const snapshot = (c) => ({
  cash: c.cash, customers: c.customers, price: c.price,
  revenue: c.lastMonth?.revenue ?? 0, net: c.lastMonth?.net ?? 0,
  morale: c.morale, quality: c.quality, reputation: c.reputation, teamSize: c.team.length,
});

const diff = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]]));

/* ------------------------------------------------------------------- misc --- */

export const monthlyBurn = (c) => (c.lastMonth ? Math.max(0, -(c.lastMonth.net)) : Math.max(1, estimateBurn(c)));

export function estimateBurn(c) {
  const ind = INDUSTRIES[c.industry];
  const payroll = c.team.reduce((s, t) => s + t.pay, 0);
  return payroll + ind.monthlyFixedBase * c.locations * (c.frugality || 1) * 1.12;
}

export const runway = (c) => {
  const burn = c.lastMonth ? -Math.min(0, c.lastMonth.net) : estimateBurn(c);
  if (burn <= 0) return Infinity;
  return c.cash / burn;
};

export const cashRatio = runway;

export const ltv = (c) => {
  const margin = c.lastMonth ? c.lastMonth.gm : (INDUSTRIES[c.industry].grossMargin[0] + INDUSTRIES[c.industry].grossMargin[1]) / 2;
  return Math.round((c.price * margin) / Math.max(0.02, c.churnPct));
};

export function computeFlags(c) {
  const flags = [];
  const r = runway(c);
  if (c.status === 'bankrupt') flags.push('💀 Out of cash — the business has failed');
  else if (r < 3) flags.push(`Runway under 3 months (${r.toFixed(1)} mo)`);
  else if (r < 6) flags.push(`Runway getting short (${r.toFixed(1)} mo)`);
  if (c.morale < 4) flags.push('Team morale is low — expect mistakes and quits');
  if (c.quality < 4) flags.push('Quality complaints are rising');
  if (c.churnPct > 0.2 && INDUSTRIES[c.industry].priceModel === 'monthly') flags.push(`Churn at ${fmtPct(c.churnPct)}/mo is eating the business`);
  if (c.bottleneck) flags.push('Operational bottleneck: ' + c.bottleneck);
  for (const cp of c.competitors.filter((x) => x.alive)) {
    if (cp.priceIdx < c.price * 0.9) flags.push(`${cp.name} undercuts your price (${fmtMoney(cp.priceIdx)} vs ${fmtMoney(c.price)})`);
  }
  if (c.lastMonth && c.lastMonth.net > 0 && flags.length === 0) flags.push('✅ Profitable this month');
  return flags;
}

/* ------------------------------------------------------------ status report --- */

// After-round report: financials, market/customer reaction, 2-3 challenges/opportunities.
export function statusReport(c, fx, notes, { event, mode }) {
  const m = c.lastMonth;
  const lines = { financials: [], reaction: [], challenges: [] };

  lines.financials.push(`Revenue ${fmtMoney(m.revenue)} · Expenses ${fmtMoney(m.cogs + m.opex)} · Net ${fmtMoney(m.net, { sign: true })} · Cash ${fmtMoney(c.cash)}`);
  const r = runway(c);
  lines.financials.push(r === Infinity
    ? `You're cash-flow positive — every month like this one adds to the pile.`
    : `At this burn rate you have ~${r.toFixed(1)} months of runway.`);

  if (c.growthPct !== 0 || fx.marketing) {
    lines.reaction.push(`Customer base ${c.growthPct >= 0 ? 'grew' : 'shrank'} ${fmtPct(Math.abs(c.growthPct))} to ${fmtInt(c.customers)} ${INDUSTRIES[c.industry].customerName}s${c.growthPct > 0.15 ? ' — a pace most real businesses only hit in a rare hot streak.' : '.'}`);
  }
  lines.reaction.push(
    c.reputation >= 7 ? 'Word of mouth is working for you; people are recommending you without being asked.'
      : c.reputation <= 3.5 ? 'Reviews and street sentiment are turning — a reputation problem compounds fast.'
      : 'Customers seem... fine. Satisfied, not evangelical. Nobody is doing your marketing for you yet.'
  );

  // challenges & opportunities (2-3)
  const bank = [];
  if (c.status === 'bankrupt') bank.push('The business is out of cash. This is the end — time to run the post-mortem.');
  const r2 = runway(c);
  if (r2 !== Infinity && r2 < 3) bank.push('Cash is the emergency. Options: cut burn, find revenue fast, or raise/inject money.');
  if (c.bottleneck) bank.push('Opportunity: you have more demand than capacity. Hiring converts that demand into revenue.');
  if (c.stage === 'prototype') bank.push('Opportunity: you have a waitlist and a prototype. Launching converts buzz into revenue.');
  if (m.net > 0 && r2 === Infinity) bank.push('You\'re profitable. Decide deliberately: bank it, reinvest in growth, or improve quality and moat.');
  const cheapComp = c.competitors.find((x) => x.alive && x.priceIdx < c.price * 0.9);
  if (cheapComp) bank.push(`${cheapComp.name} is cheaper than you. Compete on price (margin pain) or on quality/differentiation (slower).`);
  if (c.morale < 5) bank.push('The team is fraying. A small investment in people now prevents a big replacement cost later.');
  if (c.channels.length === 0 && c.stage !== 'prototype') bank.push('You have no active marketing channel — growth right now is pure word of mouth.');
  while (bank.length < 2) bank.push(pickStable(c.month + bank.length, [
    'Quiet month on the outside. The best time to strengthen the product is before you need to.',
    'No storms this month. Cash discipline now buys you options later.',
    'Steady. Consider what single constraint, if removed, would most change the business.',
    'A competitor could move at any time. What\'s your moat — and is it getting deeper?',
  ]));
  lines.challenges = bank.slice(0, 3);
  return lines;
}

const pickStable = (i, arr) => arr[i % arr.length];

/* ------------------------------------------------------------ valuation ---- */

// Transparent valuation used by Exit Day, fundraising, and the leaderboard.
export function valuate(c) {
  const ind = INDUSTRIES[c.industry];
  const arr = (c.lastMonth?.revenue ?? 0) * 12;
  const [lo, hi] = ind.valuationMultiple;
  let mult = (lo + hi) / 2;
  const factors = [`Industry baseline: ${lo.toFixed(1)}–${hi.toFixed(1)}× annual revenue`];
  if (c.growthPct > 0.12) { mult *= 1.35; factors.push(`Strong recent growth (${fmtPct(c.growthPct)}/mo) pushes the multiple up.`); }
  else if (c.growthPct < 0) { mult *= 0.7; factors.push('Shrinking customer base drags the multiple down.'); }
  if (c.reputation >= 7) { mult *= 1.15; factors.push('Strong brand reputation adds a premium.'); }
  if (c.reputation <= 3.5) { mult *= 0.8; factors.push('Reputation problems discount the price.'); }
  if (runway(c) < 3) { mult *= 0.85; factors.push('Short runway = negotiating weakness.'); }
  if (c.lastMonth && c.lastMonth.net > 0) { mult *= 1.1; factors.push('Profitable — rare and valuable at this stage.'); }

  let value;
  if (arr <= 0) {
    // Pre-revenue: valued on cash, team, and prototype progress.
    value = c.cash * 1.0 + c.team.length * 15000 + (c.stage === 'prototype' ? 25000 : 0) + c.waitlist * 8;
    factors.push('Pre-revenue: valued on cash in the bank, the team, and prototype progress — not on sales.');
  } else {
    value = arr * mult + c.cash * 0.5 - c.debt * 0.8;
    factors.push(`${fmtMoney(arr)} annualized revenue × ${mult.toFixed(1)} multiple, plus cash, minus debt.`);
  }
  value = Math.max(0, roundMoney(value));
  return { value, multiple: mult, factors };
}
