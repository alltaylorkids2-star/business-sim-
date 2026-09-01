// Industry presets that drive the Realism Guardrails:
// starting-cost intensity, gross-margin bands, CAC baselines, churn, growth ceilings,
// valuation multiples, and which event pools make sense.
//
// All single-company and market math flows from these numbers.

export const INDUSTRIES = {
  food: {
    label: 'Food & Beverage',
    keywords: ['food', 'restaurant', 'cafe', 'coffee', 'catering', 'bakery', 'truck', 'pizza', 'taco', 'burger', 'boba', 'smoothie', 'drink', 'brew', 'kitchen', 'meal', 'snack', 'dessert', 'ice cream', 'bar '],
    priceModel: 'sale',            // customers = transactions per month
    unitName: 'order', customerName: 'customer',
    capitalIntensity: 1.0,
    grossMargin: [0.60, 0.70],
    cacBase: 8,                    // a few dollars locally
    churnBase: 0.35,               // "churn" = share of last month's buyers who don't return
    organicGrowth: 0.12,
    monthlyFixedBase: 2600,        // rent, utilities, insurance, permits
    payPerStaff: 2800,
    customersPerStaff: 1200,       // orders per month one person can handle
    defaultPrice: 14,
    startStage: 'launched',
    valuationMultiple: [0.8, 1.6], // × annual revenue
    competitionBase: 0.7,
    seasonAmplitude: 0.15,
  },
  retail: {
    label: 'Retail / E-commerce',
    keywords: ['store', 'shop', 'retail', 'clothing', 'boutique', 'thrift', 'ecommerce', 'e-commerce', 'merch', 'brand', 'sneaker', 'jewelry', 'candle', 'skincare', 'cosmetics', 'dropship', 'etsy'],
    priceModel: 'sale',
    unitName: 'order', customerName: 'customer',
    capitalIntensity: 0.8,
    grossMargin: [0.25, 0.40],
    cacBase: 14,
    churnBase: 0.40,
    organicGrowth: 0.12,
    monthlyFixedBase: 2200,
    payPerStaff: 2600,
    customersPerStaff: 900,
    defaultPrice: 38,
    startStage: 'launched',
    valuationMultiple: [0.5, 1.0],
    competitionBase: 0.8,
    seasonAmplitude: 0.25,
  },
  saas: {
    label: 'Software / SaaS / App',
    keywords: ['app', 'saas', 'software', 'platform', 'ai ', 'ai-', 'tool', 'web', 'site', 'tech', 'code', 'data', 'analytics', 'chatbot', 'extension', 'api', 'game', 'ios', 'android'],
    priceModel: 'monthly',         // customers = paying subscribers
    unitName: 'subscription', customerName: 'subscriber',
    capitalIntensity: 1.2,
    grossMargin: [0.70, 0.85],
    cacBase: 120,
    churnBase: 0.06,
    organicGrowth: 0.14,
    monthlyFixedBase: 1200,        // hosting, tools, coworking
    payPerStaff: 6500,             // engineers are expensive
    customersPerStaff: 4000,
    defaultPrice: 19,
    startStage: 'prototype',
    valuationMultiple: [3.0, 6.0],
    competitionBase: 0.6,
    seasonAmplitude: 0.03,
  },
  product: {
    label: 'Physical Product / Manufacturing',
    keywords: ['product', 'device', 'gadget', 'invention', 'hardware', 'manufactur', '3d print', 'furniture', 'toy', 'board game', 'accessory', 'equipment', 'bottle', 'wearable'],
    priceModel: 'sale',
    unitName: 'unit', customerName: 'buyer',
    capitalIntensity: 1.1,
    grossMargin: [0.30, 0.50],
    cacBase: 20,
    churnBase: 0.45,
    organicGrowth: 0.11,
    monthlyFixedBase: 1800,
    payPerStaff: 3200,
    customersPerStaff: 700,
    defaultPrice: 45,
    startStage: 'prototype',
    valuationMultiple: [1.0, 2.0],
    competitionBase: 0.6,
    seasonAmplitude: 0.2,
  },
  service: {
    label: 'Services',
    keywords: ['service', 'cleaning', 'landscap', 'lawn', 'tutoring', 'coaching', 'consult', 'design', 'photography', 'video', 'editing', 'repair', 'detailing', 'pet', 'dog walk', 'babysit', 'barber', 'salon', 'fitness', 'training', 'agency', 'freelance', 'social media management', 'car wash', 'pressure wash', 'moving', 'organiz'],
    priceModel: 'sale',
    unitName: 'job', customerName: 'client',
    capitalIntensity: 0.6,
    grossMargin: [0.40, 0.60],
    cacBase: 10,
    churnBase: 0.30,
    organicGrowth: 0.12,
    monthlyFixedBase: 800,
    payPerStaff: 3000,
    customersPerStaff: 220,
    defaultPrice: 60,
    startStage: 'launched',
    valuationMultiple: [0.8, 1.4],
    competitionBase: 0.7,
    seasonAmplitude: 0.12,
  },
  marketplace: {
    label: 'Marketplace / Platform',
    keywords: ['marketplace', 'matching', 'connect', 'rental platform', 'booking', 'uber', 'airbnb', 'resell platform', 'commission', 'network'],
    priceModel: 'monthly',
    unitName: 'transaction', customerName: 'active user',
    capitalIntensity: 1.3,
    grossMargin: [0.60, 0.75],
    cacBase: 60,
    churnBase: 0.10,
    organicGrowth: 0.14,
    monthlyFixedBase: 1500,
    payPerStaff: 6000,
    customersPerStaff: 6000,
    defaultPrice: 9,
    startStage: 'prototype',
    valuationMultiple: [2.0, 4.0],
    competitionBase: 0.5,
    seasonAmplitude: 0.08,
  },
  content: {
    label: 'Media / Content / Creator',
    keywords: ['youtube', 'tiktok', 'podcast', 'newsletter', 'blog', 'stream', 'creator', 'channel', 'influencer', 'content', 'music', 'art commission', 'zine'],
    priceModel: 'monthly',
    unitName: 'revenue unit', customerName: 'follower',
    capitalIntensity: 0.5,
    grossMargin: [0.70, 0.85],
    cacBase: 3,
    churnBase: 0.12,
    organicGrowth: 0.15,
    monthlyFixedBase: 500,
    payPerStaff: 2500,
    customersPerStaff: 20000,
    defaultPrice: 1.2,             // ads/sponsorships yield little per follower per month
    startStage: 'launched',
    valuationMultiple: [1.5, 3.0],
    competitionBase: 0.8,
    seasonAmplitude: 0.10,
  },
};

export function detectIndustry(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  let best = 'service', bestScore = 0;
  for (const [key, ind] of Object.entries(INDUSTRIES)) {
    const score = ind.keywords.reduce((s, k) => s + (t.includes(k) ? k.length : 0), 0);
    if (score > bestScore) { best = key; bestScore = score; }
  }
  return best;
}

// Startup cash bounds from the master prompt's Realism Guardrails.
export const FUNDING_ROUTES = {
  bootstrapped: { label: 'Bootstrapped (own savings)', range: [2_000, 75_000], midpoint: 20_000 },
  loan: { label: 'Small loan / friends & family', range: [25_000, 150_000], midpoint: 60_000 },
  seed: { label: 'Outside seed investment', range: [100_000, 500_000], midpoint: 250_000 },
};

export const REVENUE_MODELS = {
  'one-time': { label: 'One-time sales', blurb: 'Customers pay once per purchase — you re-earn them every month.' },
  subscription: { label: 'Subscription', blurb: 'Customers pay monthly until they cancel. Revenue is predictable; churn is the enemy.' },
  commission: { label: 'Commission / marketplace fee', blurb: 'You take a cut of each transaction others make on your platform. Chicken-and-egg: you need both sellers and buyers.' },
  advertising: { label: 'Advertising / sponsorship', blurb: 'The audience is the product. You need real scale before the money matters.' },
  licensing: { label: 'Licensing', blurb: 'Others pay to use what you own — a design, a recipe, software IP, a brand.' },
  freemium: { label: 'Freemium', blurb: 'Free for most; a small share (typically ~5%) pay for the premium tier.' },
};
