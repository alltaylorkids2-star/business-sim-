// DOM helpers shared by every screen.
import { fmtMoney } from '../util.js';
import { TERMS, lookupTerm } from '../glossary.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

export function toast(msg, { err = false, ms = 2600 } = {}) {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: `toast${err ? ' err' : ''}` }, msg);
  root.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal({ title, body, actions = [] }) {
  const root = document.getElementById('modal-root');
  clear(root);
  const close = () => clear(root);
  const box = el('div', { class: 'modal fade' },
    el('h3', {}, title),
    body,
    el('div', { class: 'actions' }, actions.map((a) =>
      el('button', {
        class: `btn ${a.kind || ''}`, onclick: () => { const r = a.onClick?.(); if (r !== false) close(); },
      }, a.label)
    ))
  );
  const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } }, box);
  root.append(back);
  return { close };
}

export function kpi(label, value, deltaText, tone = '') {
  return el('div', { class: `kpi ${tone}` },
    el('div', { class: 'k' }, label),
    el('div', { class: 'v mono' }, value),
    deltaText ? el('div', { class: `d ${tone}` }, deltaText) : null,
  );
}

export function meter(label, value /*1..10*/, hint = '') {
  const cls = value <= 3.5 ? 'bad' : value <= 5.5 ? 'warn' : 'good';
  return el('div', { style: { margin: '10px 0' } },
    el('div', { class: 'meter' }, el('span', {}, label), el('b', {}, `${value.toFixed(1)}/10${hint ? ' · ' + hint : ''}`)),
    el('div', { class: `bar ${cls}` }, el('i', { style: { width: `${(value / 10) * 100}%` } })),
  );
}

// Wrap known business terms in glossary tooltip spans. Input is plain text; already-wrapped
// words are detected via sentinel chars so overlapping terms don't nest.
export function gloss(text) {
  let out = String(text);
  for (const { term, aliases } of TERMS) {
    for (const a of [term, ...aliases].sort((x, y) => y.length - x.length)) {
      const re = new RegExp(`\\b(${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
      out = out.replace(re, (m, _g, offset) => (out[offset - 1] === '\u0001' ? m : `\u0001${m}\u0002`));
    }
  }
  const frag = document.createDocumentFragment();
  const parts = out.split(/(\u0001[^\u0002]+\u0002)/).filter(Boolean);
  for (const p of parts) {
    if (p.startsWith('\u0001') && p.endsWith('\u0002')) {
      const word = p.slice(1, -1);
      const def = lookupTerm(word);
      const span = el('span', { class: 'term' }, word);
      if (def) span.title = `${def.term}: ${def.def}`;
      frag.append(span);
    } else {
      frag.append(document.createTextNode(p.replaceAll('\u0001', '').replaceAll('\u0002', '')));
    }
  }
  return frag;
}

export function gP(text, cls = '') { const par = el('p', { class: cls }); par.append(gloss(text)); return par; }
export function gLi(text) { const li = el('li'); li.append(gloss(text)); return li; }

export const moneySpan = (n) => el('span', { class: n >= 0 ? 'money-up' : 'money-down' }, fmtMoney(n, { sign: true }));

export function emptyNote(text) { return el('p', { class: 'empty' }, text); }

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
