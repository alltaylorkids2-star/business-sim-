// Seeded RNG (mulberry32) so a classroom game is reproducible and tests are deterministic.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export const chance = (rng, p) => rng() < p;

export const range = (rng, lo, hi) => lo + rng() * (hi - lo);

export const rint = (rng, lo, hi) => Math.floor(range(rng, lo, hi + 1));

export const rollSeed = () => Math.floor(Math.random() * 2 ** 31);
