// Gerador aleatório com semente (para simulações e testes reproduzíveis).
// No servidor real usa-se cryptoRng(), com a mesma interface.

import { randomInt } from 'node:crypto';

export function seededRng(seed) {
  let a = seed >>> 0;
  const next32 = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    // inteiro uniforme em [lo, hi], sem enviesamento (rejeição)
    int(lo, hi) {
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) throw new Error('RNG_RANGE');
      const span = hi - lo + 1;
      if (span > 0x100000000) throw new Error('RNG_SPAN');
      const limit = 0x100000000 - (0x100000000 % span);
      let x;
      do { x = next32(); } while (x >= limit);
      return lo + (x % span);
    },
    // true com probabilidade bp/10000
    chance(bp) { return this.int(0, 9999) < bp; },
    float() { return next32() / 0x100000000; },
  };
}

export function cryptoRng() {
  return {
    int(lo, hi) { return randomInt(lo, hi + 1); },
    chance(bp) { return randomInt(0, 10000) < bp; },
    float() { return randomInt(0, 0x100000000) / 0x100000000; },
  };
}
