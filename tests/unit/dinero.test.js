// Montos en bolívares y cuentas divididas
import { describe, it, expect } from 'vitest';
import { bs, bsParaCopiar, repartir } from '../../src/lib/dinero.js';

describe('bs', () => {
  it('muestra céntimos en formato venezolano', () => {
    expect(bs(8093.52)).toBe('8.093,52');
    expect(bs(0)).toBe('0,00');
    expect(bs(1873.5)).toBe('1.873,50');
  });
  it('redondea a céntimos sin errores de coma flotante', () => {
    expect(bs(1.005 * 100 / 100)).toMatch(/^1,0[01]$/);
    expect(bs(28.13 * 200)).toBe('5.626,00');
  });
});

describe('bsParaCopiar', () => {
  it('sin separador de miles y con coma decimal (para la app del banco)', () => {
    expect(bsParaCopiar(8093.52)).toBe('8093,52');
    expect(bsParaCopiar(624.5)).toBe('624,50');
  });
});

describe('repartir', () => {
  it('las partes suman exacto el total', () => {
    for (const [monto, n] of [[10, 3], [60.8, 2], [1873.5, 3], [0.05, 4], [99.99, 7]]) {
      const partes = repartir(monto, n);
      expect(partes).toHaveLength(n);
      const suma = Math.round(partes.reduce((s, x) => s + x, 0) * 100);
      expect(suma).toBe(Math.round(monto * 100));
    }
  });
  it('los centavos que sobran van a las primeras partes', () => {
    expect(repartir(10, 3)).toEqual([3.34, 3.33, 3.33]);
  });
  it('n inválido cuenta como 1', () => {
    expect(repartir(5, 0)).toEqual([5]);
  });
});
