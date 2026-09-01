// Step 0 — the Business Creation Wizard. Five open questions, answered in the student's
// own words; the engine answers with a justified, industry-shaped starting position.
import { el, clear, toast } from './components.js';
import { INDUSTRIES, REVENUE_MODELS, FUNDING_ROUTES, detectIndustry } from '../industries.js';
import { founderSetup } from '../engine.js';
import { mulberry32 } from '../rng.js';
import { addCompany, log, saveGame } from '../state.js';
import { fmtMoney } from '../util.js';

const QUESTIONS = [
  {
    key: 'desc',
    q: "What's the business?",
    hint: 'Describe it in your own words — a product, a service, an app, a store, a subscription, a marketplace, whatever you want.',
    placeholder: 'e.g., A late-night grilled-cheese food truck parked near the college bars…',
    area: true,
  },
  {
    key: 'customer',
    q: "Who's your customer?",
    hint: 'Who specifically is going to pay you money, and why do they need this?',
    placeholder: 'e.g., Hungry students between 10pm and 2am who want real food after the dining hall closes…',
    area: true,
  },
  {
    key: 'advantage',
    q: "What's your unfair advantage?",
    hint: 'What makes you different from what already exists? (Location, recipe, skill, audience, speed, cost…)',
    placeholder: 'e.g., My uncle owns the only legal late-night lot downtown, so no other truck can park there…',
    area: true,
  },
  { key: 'model', q: 'How do you make money?', hint: 'Pick the closest fit — you can explain any term by hovering it later.', type: 'model' },
  { key: 'funding', q: 'How are you starting this?', hint: 'Where does the first dollar come from? This sets your starting cash range.', type: 'funding' },
];

export function renderWizard(root, game, { onCompanyCreated }) {
  const answers = { name: '', founders: '', tagline: '' };
  let step = -1; // -1 = name/team, then QUESTIONS[0..4], then review

  const render = () => {
    clear(root);
    const stepsBar = el('div', { class: 'steps' }, Array.from({ length: QUESTIONS.length + 2 }, (_, i) => el('i', { class: i <= step + 1 ? 'done' : '' })));
    const wrapEl = el('div', { class: 'wrap' }, el('div', { class: 'wizard' }, stepsBar, el('div', { class: 'card fade', id: 'wcard' })));
    root.append(wrapEl);
    const card = wrapEl.querySelector('#wcard');
    if (step === -1) renderIdentity(card);
    else if (step < QUESTIONS.length) renderQuestion(card, step);
    else renderReview(card);
  };

  const renderIdentity = (card) => {
    const nameIn = el('input', { type: 'text', placeholder: 'e.g., Midnight Meltdown', value: answers.name });
    const foundersIn = el('input', { type: 'text', placeholder: 'e.g., Taylor (cook), Jordan (money & ops)', value: answers.founders });
    card.append(
      el('h2', {}, 'Name your company'),
      el('p', { class: 'hint' }, 'Everything in this simulation flows from your idea — no pre-made businesses here.'),
      el('div', { class: 'field' }, el('label', {}, 'Company name'), nameIn),
      el('div', { class: 'field' }, el('label', {}, 'Founder(s) — names & roles'), el('div', { class: 'hint' }, 'Comma-separated. Founders work for free at the start (classic).'), foundersIn),
      el('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
        el('button', {
          class: 'btn primary big', onclick: () => {
            if (!nameIn.value.trim()) return toast('Your company needs a name', { err: true });
            answers.name = nameIn.value.trim();
            answers.founders = foundersIn.value.trim();
            step = 0; render();
          },
        }, 'Next →'),
      ),
    );
  };

  const renderQuestion = (card, idx) => {
    const Q = QUESTIONS[idx];
    card.append(el('h2', {}, Q.q), el('p', { class: 'hint' }, Q.hint));
    let input = null;
    if (Q.type === 'model') {
      const row = el('div', { class: 'choice-row' });
      Object.entries(REVENUE_MODELS).forEach(([k, m]) => {
        const b = el('button', {
          class: `choice${answers.model === k ? ' sel' : ''}`, title: m.blurb,
          onclick: () => { answers.model = k; row.querySelectorAll('.choice').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); },
        }, m.label, el('small', {}, m.blurb));
        row.append(b);
      });
      card.append(row);
    } else if (Q.type === 'funding') {
      const row = el('div', { class: 'choice-row' });
      Object.entries(FUNDING_ROUTES).forEach(([k, f]) => {
        const b = el('button', {
          class: `choice${answers.funding === k ? ' sel' : ''}`,
          onclick: () => { answers.funding = k; row.querySelectorAll('.choice').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); },
        }, f.label, el('small', {}, `${fmtMoney(f.range[0])}–${fmtMoney(f.range[1])}`));
        row.append(b);
      });
      card.append(row);
    } else {
      input = el('textarea', { placeholder: Q.placeholder, rows: 3 }, answers[Q.key] || '');
      card.append(el('div', { class: 'field' }, input));
    }

    card.append(el('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '18px' } },
      el('button', { class: 'btn ghost', onclick: () => { step--; render(); } }, '← Back'),
      el('button', {
        class: 'btn primary big', onclick: () => {
          if (Q.type === 'model' && !answers.model) return toast('Pick how you make money', { err: true });
          if (Q.type === 'funding' && !answers.funding) return toast('Pick a funding route', { err: true });
          if (input && !input.value.trim()) return toast('Give it a real answer — this shapes your whole simulation', { err: true });
          if (input) answers[Q.key] = input.value.trim();
          step++; render();
        },
      }, idx === QUESTIONS.length - 1 ? 'See my starting position →' : 'Next →'),
    ));
  };

  const renderReview = (card) => {
    const industry = detectIndustry(answers.desc + ' ' + answers.customer);
    const rng = mulberry32(game.seed);
    const { company, reasoning } = founderSetup({
      name: answers.name, tagline: answers.desc.slice(0, 80), founders: answers.founders ? answers.founders.split(',').map((s) => s.trim()).filter(Boolean) : ['Founder'],
      industry, model: answers.model, funding: answers.funding,
      desc: answers.desc, customer: answers.customer, advantage: answers.advantage,
    }, rng);

    card.append(
      el('h2', {}, `Meet ${company.name} — your realistic starting position`),
      el('p', { class: 'hint' }, `The engine read your idea as ${company.industryLabel} · ${company.revenueModelLabel}. A food truck and a mobile app don't start with the same numbers — here's why yours looks like this:`),
      el('div', { class: 'reasoning' }, el('ul', { style: { margin: 0, paddingLeft: '18px' } }, reasoning.map((r) => el('li', {}, r)))),
      el('div', { class: 'divider' }),
      el('div', { class: 'stategrid' },
        el('div', { class: 'row' }, el('span', {}, 'Starting cash'), el('b', {}, fmtMoney(company.cash))),
        el('div', { class: 'row' }, el('span', {}, 'Team'), el('b', {}, company.team.map((t) => t.role).join(', '))),
        el('div', { class: 'row' }, el('span', {}, 'Stage'), el('b', {}, company.stage)),
        el('div', { class: 'row' }, el('span', {}, company.stage === 'launched' ? `Starting ${INDUSTRIES[industry].customerName}s` : 'Waitlist'), el('b', {}, (company.stage === 'launched' ? company.customers : company.waitlist).toLocaleString())),
        el('div', { class: 'row' }, el('span', {}, 'Price'), el('b', {}, fmtMoney(company.price) + (INDUSTRIES[industry].priceModel === 'monthly' ? '/mo' : ''))),
        company.equitySoldPct ? el('div', { class: 'row' }, el('span', {}, 'Equity sold'), el('b', {}, company.equitySoldPct + '%')) : el('div', { class: 'row' }, el('span', {}, 'Ownership'), el('b', {}, '100% founders (no dilution)')),
      ),
      el('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '20px' } },
        el('button', { class: 'btn ghost', onclick: () => { step--; render(); } }, '← Tweak answers'),
        el('button', {
          class: 'btn primary big', onclick: () => {
            addCompany(game, company);
            log(game, `Founded ${company.name} (${company.industryLabel}, ${answers.funding}) with ${fmtMoney(company.cash)}. Idea: ${answers.desc}`, { cid: company.id, type: 'note', tags: ['founding'] });
            saveGame(game);
            onCompanyCreated(company);
          },
        }, 'Open for business 🚀'),
      ),
    );
  };

  render();
}
