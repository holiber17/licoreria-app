// Mesa aparte del nombre y mensajes de error en español
import { describe, it, expect } from 'vitest';
import { etiquetaMesa, nombreConMesa, msgError } from '../../src/lib/catalogo.js';

describe('mesa', () => {
  it('no repite la palabra "Mesa"', () => {
    expect(etiquetaMesa({ mesa: 'Mesa 4' })).toBe('Mesa 4');
    expect(etiquetaMesa({ mesa: '4' })).toBe('Mesa 4');
    expect(etiquetaMesa({ mesa: '  ' })).toBe('');
  });
  it('nombre con mesa', () => {
    expect(nombreConMesa({ cliente_nombre: 'Carlos', mesa: 'Barra' })).toBe('Carlos · Mesa Barra');
    expect(nombreConMesa({ cliente_nombre: 'Ana' })).toBe('Ana');
  });
});

describe('msgError', () => {
  it('traduce errores técnicos', () => {
    expect(msgError({ message: 'JWT expired' })).toBe('Tu sesión venció. Sal y vuelve a entrar.');
    expect(msgError({ message: 'new row violates row-level security policy for table "caja"' })).toBe('No tienes permiso para hacer esto.');
    expect(msgError({ message: 'new row for relation "pedido_items" violates check constraint "pedido_items_valores_validos"' })).toMatch(/no válido/);
  });
  it('deja pasar los mensajes que ya están en español', () => {
    expect(msgError({ message: 'Este pedido ya fue cobrado o cancelado' })).toBe('Este pedido ya fue cobrado o cancelado');
    expect(msgError({ message: 'No hay tasa BCV del día. El dueño debe ponerla a mano antes de cobrar.' })).toMatch(/tasa BCV/);
  });
  it('un error en inglés desconocido usa el mensaje por defecto', () => {
    expect(msgError({ message: 'Could not find the function' }, 'No se pudo')).toBe('No se pudo');
  });
});
