// The Freedom Principle, implemented.
//
// parseAction(text, company, {mode, rng}) turns ANY free-text action into either:
//   { fx }       — an effects bundle the engine resolves, or
//   { clarify }  — 1–2 quick questions the outcome genuinely depends on
//                  (e.g. "I want to do marketing" → budget? channel?)
//
// Effects bundles (fx) are plain objects consumed by engine.simulateMonth:
//   cashDelta, cashCost, debtAdd, clearFlag | marketing, channel | hires[], fires[]
//   qualityBoost, moraleDelta, reputationDelta | productAdvance
//   priceSet, priceDeltaPct | pivotIndustry | newLocation | license | acquire:{name}
//   partnership, costCut, catalyst:{mult,months,label} | info
//   label, text, notes:[], tags:[]
import { INDUSTRIES, detectIndustry } from './industries.js';
import { clamp, roundMoney, fmtMoney, extractMoney, extractPct, truncate } from './util.js';
import { chance, range, rint, pick } from './rng.js';
import { termsUsedIn } from './glossary.js';

const CHANNEL_PATTERNS = [
  ['social ads', /\b(socials?|instagram|insta|tiktok|tik tok|facebooks?|fb|snapchat|snap|meta|reddit|twitter)\b|\bx ads\b/],
  ['google ads', /\b(google|search ads?|seo|adwords|ppc)\b/],
  ['influencer', /\b(influencers?|creators?|sponsorships?|ambassadors?|affiliates?)\b/],
  ['local flyers', /\b(flyers?|fliers?|posters?|signs?|billboards?|yard signs?|banners?|door hangers?|newspapers?|radio)\b/],
  ['local events', /\b(events?|booths?|farmer'?s markets?|pop-?ups?|festivals?|fairs?|market stalls?|samples?|samplings?|demo days?)\b/],
  ['cold outreach', /\b(cold|outreach|email campaigns?|door[- ]to[- ]door|dms?|linked.?in|sales calls?)\b/],
  ['content', /\b(contents?|youtube|blogs?|podcasts?|organics?|videos?|reels|shorts|newsletters?)\b/],
];

const ROLE_PATTERNS = [
  ['Software engineer', /\b(engineer|developer|dev|coder|programmer|technical)\b/],
  ['Barista / counter staff', /\b(barista|cashier|counter|server|cook|chef|kitchen)\b/],
  ['Sales rep', /\b(sales|account| biz ?dev|closer)\b/],
  ['Marketer', /\b(marketing|marketer|social media|content creator|growth)\b/],
  ['Designer', /\b(design|designer|ux|ui|artist)\b/],
  ['Driver / courier', /\b(driver|courier|delivery) /],
  ['Operations manager', /\b(manager|operations|ops|bookkeeper|accountant|assistant|admin)\b/],
  ['General helper', /\b(help|staff|employee|worker|hire|part[- ]time|intern)\b/],
];

const has = (t, re) => re.test(t);

export function emptyFx(text) {
  return { label: 'Hold steady', text, notes: [], tags: ['custom'] };
}

/* ------------------------------------------------------------ main parser --- */

export function parseAction(rawText, c, { mode = 'beginner', rng }) {
  const text = rawText.trim();
  if (text.length < 3) {
    return { clarify: { question: "Give me a real decision — what do you want to try this month?", chips: null, combine: true } };
  }
  const t = ' ' + text.toLowerCase() + ' ';
  const ind = INDUSTRIES[c.industry];
  const money = extractMoney(t);
  const pct = extractPct(t);

  /* ---- fundraising / loans (handled partly by mode-specific flows) -------- */
  if (has(t, /\b(fundraise|fund[- ]raise|raise (money|capital|a round|funds|\$)|investors?|venture|vc\b|series [abc]\b|angel invest|safe note|seed round|outside investment|equity round)\b/)) {
    if (mode === 'advanced') {
      const ask = money || Math.round(Math.max(c.cash, estimateBurnLike(c) * 6));
      if (!money) {
        return { clarify: { question: 'How much are you trying to raise?', chips: moneyChips(c, [3, 6, 12].map((m) => estimateBurnLike(c) * m)), combine: true } };
      }
      return { fx: { ...emptyFx(text), label: `Raise ${fmtMoney(ask)}`, fundraiseAsk: ask, tags: ['finance', 'fundraise'] } };
    }
    // Beginner/other modes: friends-&-family or micro-loan honesty.
    const amt = money || 10_000;
    return {
      fx: {
        ...emptyFx(text), label: `Friends & family money: ${fmtMoney(amt)}`,
        cashDelta: amt, debtAdd: Math.round(amt * (money ? 0.5 : 1)), // family: some gift, some IOU
        notes: [`${fmtMoney(amt)} from people who believe in you. Half gamble, half IOU — real businesses treat family money as a debt of honor, and it's on your books.`],
        tags: ['finance'],
      },
    };
  }
  if (has(t, /\bloan|borrow|line of credit|credit card\b/)) {
    const amt = money || roundMoney(estimateBurnLike(c) * 4);
    const monthlyNibble = 0.03;
    return {
      fx: {
        ...emptyFx(text), label: `Take a loan: ${fmtMoney(amt)}`,
        cashDelta: amt, debtAdd: amt,
        priceModelMultAdd: -monthlyNibble, // interest shows up as a small permanent revenue leak
        notes: [`${fmtMoney(amt)} loan at ugly small-business rates. Debt keeps ALL your equity — and takes payment regardless of how the month went.`],
        tags: ['finance', 'debt'],
      },
    };
  }
  if (has(t, /\bpersonal (money|savings|cash)|my own money|inject|put in\b/)) {
    if (!c.freePersonalInjection) {
      return { fx: { ...emptyFx(text), label: 'Personal injection (already used)', notes: ['Your personal pockets are empty — that move is once per founder.'], tags: ['finance'] } };
    }
    const amt = money || 5_000;
    return {
      fx: {
        ...emptyFx(text), label: `Founder injects ${fmtMoney(amt)} of personal savings`,
        cashDelta: amt, clearFlag: 'freePersonalInjection', moraleDelta: -0.3,
        notes: ['Your own savings go in. It buys time, not a business model — and founders who keep doing this usually regret it.'],
        tags: ['finance'],
      },
    };
  }

  /* ---- hiring / firing ----------------------------------------------------- */
  if (has(t, /\b(lay ?off|let go|fire|cut staff|dismiss)\b/)) {
    const staff = c.team.filter((x) => !x.founder);
    const roleMatch = ROLE_PATTERNS.find(([, re]) => has(t, re));
    const target = roleMatch ? staff.find((s) => s.role === roleMatch[0]) : staff[staff.length - 1];
    if (!target) {
      return { fx: { ...emptyFx(text), label: 'Lay off staff', notes: ['There\'s nobody on payroll to let go — just founders working for free.'], tags: ['people'] } };
    }
    return { fx: { ...emptyFx(text), label: `Lay off the ${target.role}`, fires: [{ role: target.role }], tags: ['people', 'layoff'] } };
  }
  if (has(t, /\b(hire|employ|recruit|bring on|add (a |an )?(team|staff)|staff up)\b/)) {
    const roleMatch = ROLE_PATTERNS.find(([, re]) => has(t, re));
    if (!roleMatch) {
      return { clarify: { question: 'Hire for what role — and full-time at market rate?', chips: ['Software engineer', 'General helper', 'Marketer', 'Sales rep'], combine: true } };
    }
    const n = Math.min(5, (t.match(/\b(\d+|two|three|four|five)\b/) ? parseCount(t) : 1));
    const pay = Math.round(ind.payPerStaff * ({ 'Software engineer': 1.4, 'Operations manager': 1.1 }[roleMatch[0]] || 0.85));
    const hires = Array.from({ length: n }, () => ({ role: roleMatch[0], pay }));
    return {
      fx: {
        ...emptyFx(text), label: `Hire ${n > 1 ? n + ' × ' : ''}${roleMatch[0]}`,
        hires,
        notes: [`${roleMatch[0]} joins at ${fmtMoney(pay)}/mo each — payroll grows by ${fmtMoney(pay * n)}/mo starting now. Capacity and capability go up; so does burn.`],
        tags: ['people', 'hire'],
      },
    };
  }

  /* ---- pricing ------------------------------------------------------------- */
  if (has(t, /\b(raise|increase|hike|up)\b.{0,20}\bprice|\bcharge more|price (up|increase)|more expensive\b/)) {
    const change = pct ?? 0.10;
    return { fx: { ...emptyFx(text), label: `Raise prices ${fmtPctLocal(change)}`, priceDeltaPct: change, tags: ['pricing'] } };
  }
  if (has(t, /\b(lower|cut|reduce|drop|slash|discount)\b.{0,20}\bprice|\bprices? (down|cut)|cheaper|discount|sale on everything|coupon\b/)) {
    const change = pct ?? 0.15;
    return { fx: { ...emptyFx(text), label: `Cut prices ${fmtPctLocal(change)}`, priceDeltaPct: -change, tags: ['pricing'] } };
  }
  if (has(t, /\bset price|price at|charge \$/)) {
    if (money && money <= ind.defaultPrice * 30) {
      return { fx: { ...emptyFx(text), label: `Set price to ${fmtMoney(money)}`, priceSet: money, tags: ['pricing'] } };
    }
  }

  /* ---- product / quality ---------------------------------------------------- */
  if (has(t, /\b(launch|ship|go live|release|open for business|start selling)\b/)) {
    if (c.stage === 'prototype' || c.stage === 'idea') {
      const cost = roundMoney(Math.max(2_000, Math.min(c.cash * 0.35, ind.payPerStaff * 2.2)));
      return {
        fx: {
          ...emptyFx(text), label: 'Launch the product', productAdvance: 'launched', cashCost: cost,
          notes: [`Final push to launch costs ${fmtMoney(cost)} (tooling, inventory, last-minute fixes, launch-day chaos). Whatever is on the waitlist is about to find out if you can deliver.`],
          tags: ['product', 'launch'],
        },
      };
    }
    return { fx: { ...emptyFx(text), label: 'Already launched', notes: ['You\'re already selling — this month you focus on operations instead of launches.'], tags: ['product'] } };
  }
  if (has(t, /\b(improve|better|upgrade|quality|polish|fix|rework|refine|recipe|renovate|new feature|redesign|new menu|version 2|v2)\b/)) {
    const budget = money ?? 0;
    const boost = budget > 0 ? clamp(budget / (ind.payPerStaff * 1.4), 0.2, 2.4) : 0.4;
    return {
      fx: {
        ...emptyFx(text), label: budget ? `Invest ${fmtMoney(budget)} in quality` : 'Founder time into quality',
        qualityBoost: boost, cashCost: budget,
        notes: [budget ? `${fmtMoney(budget)} into the product: quality +${boost.toFixed(1)}.` : 'No budget — just founder sweat equity. Quality improves a little; it cost you a month of doing other things.'],
        tags: ['product', 'quality'],
      },
    };
  }
  if (has(t, /\b(build|develop|create|make|code|prototype|mvp|design (a|the) (app|product))\b/) && c.stage !== 'launched' && c.stage !== 'scaling') {
    const cost = roundMoney(Math.max(1_500, Math.min(c.cash * 0.3, ind.payPerStaff * 1.5)));
    return {
      fx: {
        ...emptyFx(text), label: 'Build out the product', qualityBoost: 0.8, cashCost: cost,
        notes: [`Heads-down build month: ${fmtMoney(cost)} of tools, materials and contractors. ${c.stage === 'prototype' ? 'The prototype sharpens — you could launch soon.' : 'Product quality jumps.'}`],
        tags: ['product'],
      },
    };
  }

  /* ---- pivot ---------------------------------------------------------------- */
  if (has(t, /\bpivot\b/)) {
    const target = detectIndustry(t.replace('pivot', ''));
    if (target === c.industry) {
      return { clarify: { question: 'Pivot to what, exactly? Describe the new direction.', chips: null, combine: true } };
    }
    const cost = roundMoney(Math.max(800, c.cash * 0.12));
    return {
      fx: {
        ...emptyFx(text), label: `Pivot to ${INDUSTRIES[target].label}`, pivotIndustry: target, cashCost: cost, moraleDelta: -0.6,
        notes: [`A real pivot: ${fmtMoney(cost)} of retooling and repositioning. Roughly half your existing customers won't follow you across. The team wonders which idea is the real one.`],
        tags: ['strategy', 'pivot'],
      },
    };
  }

  /* ---- expansion -------------------------------------------------------------- */
  if (has(t, /\b(new|second|another|open)\b.{0,25}\b(location|store|shop|truck|branch|city|state)|\bexpand|franchise|go national|international|global\b/)) {
    const international = has(t, /\b(international|global|overseas|another country|worldwide)\b/);
    const baseCost = roundMoney(ind.monthlyFixedBase * (international ? 6 : 2.6) + ind.payPerStaff);
    return {
      fx: {
        ...emptyFx(text),
        label: international ? 'Expand internationally' : 'Open a new location',
        newLocation: true, cashCost: baseCost,
        catalyst: international ? { mult: 1.6, months: 3, label: 'new-market expansion' } : null,
        moraleDelta: -0.3,
        notes: [international
          ? `${fmtMoney(baseCost)} to plant a flag abroad (localization, legal, logistics). New TAM unlocked — and a dozen new ways to bleed cash.`
          : `${fmtMoney(baseCost)} of deposits, build-out and signage. New fixed costs every month from now on — it has to earn them.`],
        tags: ['growth', 'expansion'],
      },
    };
  }

  /* ---- partnership / collab ------------------------------------------------- */
  if (has(t, /\b(partner|collab|sponsor|cross-?promo|team up|affiliate deal|deal with)\b/)) {
    const withWhat = (t.match(/with (?:the )?([\w '&.-]{2,30})/)?.[1] || 'a local player').trim();
    return {
      fx: {
        ...emptyFx(text), label: `Partner with ${withWhat}`, partnership: withWhat, cashCost: money || 0,
        reputationDelta: 0.3,
        notes: [`Partnership with ${withWhat}: their audience meets your offer. Cheap, slow, and compounding — the opposite of paid ads.`],
        tags: ['marketing', 'partnership'],
      },
    };
  }

  /* ---- wild PR stunt (high variance, honest RNG) ----------------------------- */
  if (has(t, /\b(stunt|viral|guerrilla|prank|flash mob|skywrite|skywriting|mascot|controversial|challenge)\b/)) {
    const budget = money ?? roundMoney(Math.max(300, c.cash * 0.1));
    const roll = rng();
    let bundle;
    if (roll < 0.18) {
      bundle = { catalyst: { mult: 2.2, months: 2, label: 'viral stunt' }, reputationDelta: 1.6, notes: [`IT WORKED. The stunt goes viral — your realistic growth ceiling doubles for two months while the internet pays attention. Now the question is whether you can keep them.`] };
    } else if (roll < 0.42) {
      bundle = { reputationDelta: 0.7, notes: ['The stunt lands well locally — a modest, real bump in attention and goodwill.'] };
    } else if (roll < 0.55) {
      bundle = { reputationDelta: 0, notes: [`${fmtMoney(budget)} spent, some photos taken, and… nothing. The market shrugged. That's the honest median outcome of a publicity stunt.`] };
    } else {
      bundle = { reputationDelta: -1.4, moraleDelta: -0.4, notes: ['It backfired. People found it cringey or tone-deaf, and the internet has screenshots. Reputation takes a real hit — recovery is slower than the apology.'] };
    }
    return { fx: { ...emptyFx(text), label: `Publicity stunt (${fmtMoney(budget)})`, marketing: Math.round(budget * 0.5), cashCost: Math.round(budget * 0.5), ...bundle, tags: ['marketing', 'stunt', 'bold'] } };
  }

  /* ---- marketing (the big one) ----------------------------------------------- */
  const channel = CHANNEL_PATTERNS.find(([, re]) => has(t, re))?.[0]
    || (has(t, /\b(marketing|ads|advertis|promote|promotion|spread the word|get customers|get the word out)\b/) ? null : null);
  const wantsMarketing = channel || has(t, /\b(marketing|ads|advertis|promote|promotion|campaign|spread the word|get (more )?customers|grow sales)\b/);
  if (wantsMarketing) {
    if (money == null) {
      return {
        clarify: {
          question: `What's the budget${channel ? ` for ${channel}` : ''}, and which channel?`,
          chips: [...moneyChips(c, [0.05, 0.15, 0.3].map((f) => c.cash * f)).map((m) => `${fmtMoney(m)} on ${channel || 'social ads'}`), 'custom — type it out'],
          combine: true,
        },
      };
    }
    if (!channel) {
      return {
        clarify: {
          question: `${fmtMoney(money)} — on which channel?`,
          chips: ['social ads', 'influencer partnership', 'local flyers', 'local events', 'cold outreach', 'google ads', 'content marketing'],
          combine: true,
        },
      };
    }
    return {
      fx: {
        ...emptyFx(text), label: `${fmtMoney(money)} on ${channel}`, marketing: money, channel,
        tags: ['marketing', channel.replace(/ /g, '-')],
      },
    };
  }

  /* ---- morale / team care ----------------------------------------------------- */
  if (has(t, /\b(bonus|raise|team building|party|retreat|morale|reward|appreciat|day off|perks?)\b/)) {
    const budget = money ?? roundMoney(Math.max(200, c.cash * 0.02));
    return {
      fx: {
        ...emptyFx(text), label: `Invest in the team (${fmtMoney(budget)})`, cashCost: budget, moraleDelta: 1.2,
        notes: [`${fmtMoney(budget)} on the humans. Morale jumps — and morale is quietly a line item in every product your customers touch.`],
        tags: ['people', 'morale'],
      },
    };
  }

  /* ---- cost cutting ------------------------------------------------------------ */
  if (has(t, /\b(cut costs|reduce (expenses|spending|costs)|save money|frugal|lean|tighten|slash spending|stop spending)\b/)) {
    return { fx: { ...emptyFx(text), label: 'Cut costs', costCut: true, tags: ['finance', 'frugal'] } };
  }
  if (has(t, /\b(hold|wait|save|nothing|steady|observe|pause|no changes?|bank it)\b/)) {
    return { fx: { ...emptyFx(text), label: 'Save cash & hold steady', notes: ['A deliberate quiet month. Discipline is also a decision — just not a free one: competitors don\'t pause when you do.'], tags: ['finance', 'hold'] } };
  }

  /* ---- market research ---------------------------------------------------------- */
  if (has(t, /\b(research|survey|study|analy[sz]e|customer interviews?|feedback|market size|competitor intel)\b/)) {
    const cost = money || 300;
    return {
      fx: {
        ...emptyFx(text), label: `Market research (${fmtMoney(cost)})`, cashCost: cost, info: true,
        notes: ['Knowledge replaces guesses. (Check the Market panel — your read on competitors and conditions just sharpened.)'],
        tags: ['strategy', 'research'],
      },
    };
  }

  /* ---- licensing the tech/IP ----------------------------------------------------- */
  if (has(t, /\b(licen[cs]e|white[- ]?label|franchise our|sell the ip)\b/)) {
    return {
      fx: {
        ...emptyFx(text), label: 'License your IP', license: true, cashCost: 1500,
        notes: ['$1,500 of lawyers later, your IP earns licensing income (~12% revenue uplift, every month, while deals hold). Slow money, high margin money.'],
        tags: ['strategy', 'licensing'],
      },
    };
  }

  /* ---- acquire a competitor ------------------------------------------------------- */
  if (has(t, /\b(acquire|buy out|buy the|merge|take over)\b/)) {
    const target = c.competitors.find((x) => x.alive && t.includes(x.name.toLowerCase().split(' ')[0].toLowerCase())) || c.competitors.find((x) => x.alive);
    if (!target) return { fx: { ...emptyFx(text), label: 'Acquire a competitor', notes: ['No rival worth buying is left standing.'], tags: ['strategy'] } };
    const price = roundMoney(ind.defaultPrice * 320 * (1 + target.aggression));
    return {
      fx: {
        ...emptyFx(text), label: `Acquire ${target.name} (${fmtMoney(price)})`, cashCost: price, acquire: { name: target.name },
        moraleDelta: -0.3,
        notes: [`You buy ${target.name} for ${fmtMoney(price)} — their customers (~30% of your base) fold into yours, their problems become yours, and integration eats a month of everyone's patience.`],
        tags: ['strategy', 'acquisition'],
      },
    };
  }

  /* ---- shut it down ----------------------------------------------------------------- */
  if (has(t, /\b(shut down|close (the )?(business|company|shop)|give up|wind down|quit|bankrupt|walk away)\b/)) {
    return { fx: { ...emptyFx(text), label: 'Wind down the business', windDown: true, tags: ['strategy', 'shutdown'] } };
  }

  /* ---- everything else: the wildcard ------------------------------------------------ */
  return wildcard(text, c, rng, money);
}

/* --------------------------------------------------------------- wildcard --- */

// Honestly resolve an unconventional idea: magnitude from any stated budget,
// outcome distribution tilted by how well-run the business is. Never "you can't".
function wildcard(text, c, rng, money) {
  const health = (c.morale + c.quality + c.reputation) / 30; // 0..1
  const budget = money ?? roundMoney(Math.max(200, c.cash * 0.08));
  const roll = rng();
  const tags = ['custom', 'wildcard'];
  const base = { ...emptyFx(text), label: `“${truncate(text, 44)}”`, cashCost: budget, tags };
  const spent = budget > 0 ? ` (${fmtMoney(budget)} on it)` : '';

  let outcome, fx;
  if (roll < 0.18 + health * 0.2) {
    outcome = 'It works — better than expected.';
    fx = { reputationDelta: 0.8, catalyst: { mult: 1.5, months: 1, label: 'a bold experiment that clicked' } };
  } else if (roll < 0.55 + health * 0.15) {
    outcome = 'Partial success: you learn something and gain a little.';
    fx = { reputationDelta: 0.3, moraleDelta: 0.2, qualityBoost: 0.2 };
  } else if (roll < 0.85) {
    outcome = 'It mostly doesn\'t work.';
    fx = { notes: [] };
  } else {
    outcome = 'It backfires.';
    fx = { reputationDelta: -0.8, moraleDelta: -0.3 };
  }
  return {
    fx: {
      ...base, ...fx,
      notes: [
        `A genuinely original move${spent}. ${outcome}`,
        `The simulation's honest read: unconventional bets mostly land "meh", occasionally shine, sometimes sting — that's why they're called bets.`,
      ],
    },
  };
}

/* ---------------------------------------------------------------- helpers --- */

function parseCount(t) {
  const words = { two: 2, three: 3, four: 4, five: 5 };
  const m = t.match(/\b(\d+|two|three|four|five)\b/);
  if (!m) return 1;
  return m[1] in words ? words[m[1]] : parseInt(m[1], 10);
}

const moneyChips = (c, raw) => [...new Set(raw.map((x) => Math.max(100, roundMoney(x))))].slice(0, 4);

const fmtPctLocal = (x) => Math.round(x * 100) + '%';

const estimateBurnLike = (c) => c.team.reduce((s, t) => s + t.pay, 0) + INDUSTRIES[c.industry].monthlyFixedBase * c.locations;

// What would this fx cost up front? Used for the one legal refusal: spending money you don't have.
export function fxCost(fx) {
  return (fx.cashCost || 0) + (fx.marketing || 0) + (fx.hires || []).reduce((s, h) => s + h.pay, 0);
}

// Affordability gate (the master prompt's single allowed refusal).
export function affordabilityCheck(fx, c) {
  const cost = fxCost(fx);
  if (cost > c.cash) {
    return {
      ok: false,
      reason: `That costs about ${fmtMoney(cost)} up front, and you have ${fmtMoney(c.cash)}. A real business can't spend money it doesn't have — cut the budget, phase it, or find cash first.`,
    };
  }
  return { ok: true };
}

/* --------------------------------------------------- suggestions (beginner) --- */

// Mode 1's 3–4 suggested directions — contextual, with "your own idea" always open.
export function suggestionsFor(c, mode) {
  const out = [];
  const cashPct = (f) => fmtMoney(Math.max(100, roundMoney(c.cash * f)));
  if (c.stage === 'prototype' || c.stage === 'idea') out.push(`Finish and launch the product`);
  if (c.channels.length === 0) out.push(`Spend ${cashPct(0.1)} on ${c.industry === 'saas' || c.industry === 'marketplace' ? 'social ads' : 'local flyers'}`);
  else out.push(`Spend ${cashPct(0.12)} on ${c.channels[c.channels.length - 1] || 'marketing'}`);
  if (c.bottleneck || c.customers > 1.5 * (c.team.length * INDUSTRIES[c.industry].customersPerStaff) * 0.7) out.push('Hire help');
  if (c.quality < 6) out.push('Improve the product');
  if (runwayMonths(c) < 4) out.push('Cut costs hard');
  out.push('Save cash and hold steady');
  const seen = new Set();
  return out.filter((s) => (seen.has(s) ? false : seen.add(s))).slice(0, 4);
}

const runwayMonths = (c) => {
  const burn = c.lastMonth ? Math.max(0, -c.lastMonth.net) : estimateBurnLike(c);
  if (burn <= 0) return Infinity;
  return c.cash / burn;
};
