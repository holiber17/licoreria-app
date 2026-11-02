// Fechas y períodos en hora de Caracas (UTC-4), sin depender de la zona del equipo
import { describe, it, expect } from 'vitest';
import { hoyCaracas, diaCaracas, inicioDia, sumarDias } from '../../src/lib/fechas.js';
import { desde, desdeDia } from '../../src/staff/periodos.js';

describe('fechas', () => {
  it('a las 10 pm de Caracas sigue siendo el mismo día (en UTC ya es mañana)', () => {
    const noche = new Date('2026-11-01T22:00:00-04:00');   // 02:00 UTC del 2 de noviembre
    expect(hoyCaracas(noche)).toBe('2026-11-01');
    expect(diaCaracas(noche.toISOString())).toBe('2026-11-01');
  });
  it('la medianoche de Caracas son las 04:00 UTC', () => {
    expect(inicioDia('2026-11-02')).toBe('2026-11-02T04:00:00.000Z');
  });
  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-11-01', -1)).toBe('2026-10-31');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('periodos', () => {
  const ahora = new Date('2026-11-15T21:30:00-04:00');   // 15-nov 9:30 pm en Caracas
  it('hoy empieza a medianoche de Caracas', () => {
    expect(desdeDia('hoy', ahora)).toBe('2026-11-15');
    expect(desde('hoy', ahora)).toBe('2026-11-15T04:00:00.000Z');
  });
  it('la semana son los últimos 7 días contando hoy', () => {
    expect(desdeDia('semana', ahora)).toBe('2026-11-09');
  });
  it('el mes empieza el día 1, también de noche (antes se saltaba el día 1)', () => {
    expect(desdeDia('mes', ahora)).toBe('2026-11-01');
    expect(desdeDia('mes', new Date('2026-11-01T23:59:00-04:00'))).toBe('2026-11-01');
  });
});
