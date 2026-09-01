// Small shared helpers: clamping, money math that avoids fake precision, formatting.

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Round money the way a real small-business income statement would show it:
// no fake cents, coarser rounding as numbers grow.
export function roundMoney(n) {
  const a = Math.abs(n);
  const step = a < 1_000 ? 10 : a < 100_000 ? 50 : a < 1_000_000 ? 500 : 5_000;
  return Math.round(n / step) * step;
}

export function fmtMoney(n, { sign = false } = {}) {
  const r = roundMoney(n);
  const s = (r < 0 ? '-' : sign && r > 0 ? '+' : '') + '$' + Math.abs(r).toLocaleString('en-US');
  return s;
}

export const fmtSignedMoney = (n) => fmtMoney(n, { sign: true });

export function fmtPct(x, digits = 1) {
  return (x * 100).toFixed(digits).replace(/\.0$/, '') + '%';
}

export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

export function plural(n, word, words = null) {
  return `${fmtInt(n)} ${n === 1 ? word : (words || word + 's')}`;
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function truncate(s, n = 90) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Deep clone a plain-data object (game state is always plain JSON-safe data).
export const clone = (o) => JSON.parse(JSON.stringify(o));

// Parse "$5k", "5000 dollars", "$2,500", "1.2k", "$10k/mo" out of free text.
export function extractMoney(text) {
  const m = text.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)\s*(k|m|thousand|million)?/i)
    || text.match(/\b(\d+(?:\.\d+)?)\s*(k|m|thousand|million)\s*(?:dollars|bucks|usd)?\b/i);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k' || unit === 'thousand') v *= 1_000;
  if (unit === 'm' || unit === 'million') v *= 1_000_000;
  return Math.round(v);
}

// Parse "10%", "+5 percent", "by 20 percent" from free text.
export function extractPct(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  return m ? parseFloat(m[1]) / 100 : null;
}
