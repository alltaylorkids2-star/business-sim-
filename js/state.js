// Game-state shapes, autosave, and export/import (so a class can pick up next period
// exactly where it left off — the master prompt's "running log" requirement).
import { uid } from './util.js';

const SAVE_KEY = 'bizsim.save.v1';

/*
Game = {
  id, mode: 'beginner'|'advanced'|'teacher'|'team', seed,
  companies: { [cid]: Company }, order: [cid],
  market: { econIndex, wageIndex, month } | team market (see team.js),
  teacher: { scenario: null | {text, resolved} },   // mode 3
  leaderboard: [...] | null,                         // mode 4
  log: [ { ts, round, cid?, type, text, tags? } ],
  over: false, createdAt
}

Company = {
  id, name, tagline, founders: [string],
  industry, industryLabel, revenueModel, revenueModelLabel,
  idea: { desc, customer, advantage },
  status: 'active' | 'bankrupt' | 'exited',
  round, month,
  cash, debt, lastMonth: { revenue, cogs, opex, net } | null,
  fundingRaised, equitySoldPct, capTable: [{ holder, pct, note }],
  stage: 'idea'|'prototype'|'launched'|'scaling',
  quality, reputation, morale,                   // 1..10
  price, customers, waitlist, cac,
  churnPct, growthPct,                           // last realized
  channels: [string],
  team: [{ role, pay, founder?:bool }],
  locations, capacity strain etc derived,
  competitors: [{ name, priceIdx, aggression, alive }],
  catalyst: { untilRound, mult, label } | null,  // viral moments, big partnerships
  flags: [string],                                // risk flags, recomputed each round
  history: [{ round, cash, revenue, net, customers, note }],  // powers teacher tools
  exit: null | { kind, value, memo }
}
*/

export function newGame(mode, seed) {
  return {
    id: uid(),
    mode,
    seed,
    companies: {},
    order: [],
    market: { econIndex: 1.0, wageIndex: 1.0, month: 0 },
    teacher: { scenario: null },
    leaderboard: null,
    log: [],
    over: false,
    createdAt: Date.now(),
  };
}

export function addCompany(game, company) {
  game.companies[company.id] = company;
  game.order.push(company.id);
  return company;
}

export const firstCompany = (game) => game.companies[game.order[0]];

export function log(game, text, { type = 'note', cid = null, tags = [] } = {}) {
  game.log.push({ ts: Date.now(), round: game.market.month, cid, type, text, tags });
  if (game.log.length > 1200) game.log.splice(0, game.log.length - 1200);
}

export function saveGame(game) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { /* storage full/blocked */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return g && g.companies && g.order ? g : null;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function exportGame(game) {
  return JSON.stringify(game, null, 2);
}

export function importGame(json) {
  const g = JSON.parse(json);
  if (!g || typeof g !== 'object' || !g.companies || !g.order || !g.mode) {
    throw new Error('That file does not look like a Business Simulator save.');
  }
  return g;
}

// Human-readable running log for copy/paste between class periods.
export function logText(game) {
  const lines = game.log.map((e) => {
    const who = e.cid && game.companies[e.cid] ? `[${game.companies[e.cid].name}] ` : '';
    const when = e.type === 'round' ? `— Month ${e.round} — ` : '';
    return `${when}${who}${e.text}`;
  });
  return lines.join('\n');
}
