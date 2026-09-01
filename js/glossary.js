// Business vocabulary. Used for beginner-mode explanations, hover tooltips, and the
// teacher rubric's vocabulary scan (we count terms students actually use in their actions).

export const TERMS = [
  { term: 'Revenue', aliases: ['revenue', 'sales'], def: 'All the money the business brings in from customers, before any costs are taken out.' },
  { term: 'Expenses', aliases: ['expenses', 'burn', 'burn rate'], def: 'All the money the business spends each month: payroll, rent, marketing, supplies. "Burn rate" is how fast cash is spent when revenue doesn\'t cover it.' },
  { term: 'Gross margin', aliases: ['gross margin', 'margin', 'margins'], def: 'The share of each sales dollar left after paying the direct cost of the product itself (COGS). A coffee shop keeps ~65¢ of each $1 before rent and wages; software keeps ~80¢.' },
  { term: 'Net profit', aliases: ['net profit', 'profit', 'net income', 'ebit', 'ebitda'], def: 'What\'s actually left after EVERY cost — product costs, wages, rent, marketing. Revenue can grow while profit shrinks.' },
  { term: 'Cash flow', aliases: ['cash flow', 'cashflow'], def: 'The movement of actual cash in and out. Profitable businesses still die when cash runs out at the wrong moment.' },
  { term: 'Runway', aliases: ['runway'], def: 'How many months the business can survive at its current burn rate before cash hits zero. Cash on hand ÷ monthly loss.' },
  { term: 'Break-even', aliases: ['break-even', 'breakeven', 'break even'], def: 'The sales level where revenue exactly covers all costs — below it you lose money, above it you profit.' },
  { term: 'CAC', aliases: ['cac', 'customer acquisition cost', 'acquisition cost'], def: 'Customer Acquisition Cost: marketing spend ÷ new customers gained. A local shop might pay $5–$30 per customer; a B2B software company can pay hundreds.' },
  { term: 'LTV', aliases: ['ltv', 'lifetime value'], def: 'Lifetime Value: total profit one customer generates before they leave. Healthy businesses keep LTV at least 3× their CAC.' },
  { term: 'Churn', aliases: ['churn', 'churn rate'], def: 'The percentage of customers who stop buying / cancel each month. High churn forces you to keep spending on marketing just to stand still.' },
  { term: 'MRR', aliases: ['mrr', 'arr', 'monthly recurring revenue'], def: 'Monthly Recurring Revenue: predictable subscription income each month. ×12 is ARR (annual). SaaS investors live and die by it.' },
  { term: 'COGS', aliases: ['cogs', 'cost of goods'], def: 'Cost of Goods Sold: the direct cost of what you sell — ingredients, materials, hosting per user. Revenue − COGS = gross profit.' },
  { term: 'Working capital', aliases: ['working capital'], def: 'Cash tied up in day-to-day operations (inventory, unpaid invoices). Growing businesses can starve even while profitable.' },
  { term: 'Unit economics', aliases: ['unit economics'], def: 'The profit math of ONE unit or one customer: price − direct cost − acquisition cost. If one unit loses money, selling more units loses more money.' },
  { term: 'Equity', aliases: ['equity', 'cap table', 'ownership'], def: 'Ownership shares of the company. The cap table lists who owns what. Every investment trade: cash now for equity forever.' },
  { term: 'Dilution', aliases: ['dilution', 'dilute'], def: 'When you sell new shares to investors, your percentage of the company shrinks. You can own less of something worth much more.' },
  { term: 'Valuation', aliases: ['valuation', 'pre-money', 'post-money'], def: 'What the company is judged to be worth. Pre-money = before the new investment; post-money = after. Usually a multiple of revenue, adjusted for growth and risk.' },
  { term: 'SAFE note', aliases: ['safe', 'safe note', 'convertible note'], def: 'Simple Agreement for Future Equity: investor cash now that converts into shares later at a discount or valuation cap, delaying the hard valuation conversation.' },
  { term: 'TAM / SAM / SOM', aliases: ['tam', 'sam', 'som', 'market size'], def: 'Total / Serviceable / Obtainable Market: everyone who could ever buy, the slice you could reach, and the slice you can realistically win soon.' },
  { term: 'Pivot', aliases: ['pivot'], def: 'A deliberate change of strategy — new product, customer, or business model. Startups pivot when the evidence says the current path won\'t work.' },
  { term: 'Exit strategy', aliases: ['exit', 'acquisition', 'ipo'], def: 'How founders and investors eventually turn ownership into cash: selling the company (acquisition), going public (IPO), or paying themselves profits forever.' },
  { term: 'Bootstrapping', aliases: ['bootstrap', 'bootstrapped'], def: 'Funding the business from your own savings and the business\'s own revenue — no outside investors, no dilution, no safety net.' },
];

// Find glossary terms used in a free-text action (for the teacher rubric).
export function termsUsedIn(text) {
  const t = text.toLowerCase();
  return TERMS.filter(({ aliases }) => aliases.some((a) => t.includes(a))).map((x) => x.term);
}

export function lookupTerm(word) {
  const w = word.toLowerCase();
  return TERMS.find(({ term, aliases }) => term.toLowerCase() === w || aliases.includes(w));
}
