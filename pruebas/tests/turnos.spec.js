// Caja por turno y fechas en hora de Caracas
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar, sesionEmpleado, sesionDueno, vigilarErrores } = require('./apoyo/base-falsa');

let base, errores;

test.beforeEach(async ({ context, page }) => {
  base = new BaseFalsa();
  await conectar(context, base);
  errores = vigilarErrores(page);
  page.on('dialog', d => d.accept());
  base.db.tasas_bcv.push({ sucursal_id: 's1', tasa: 190, fecha: '2026-11-01' });
});

test.afterEach(() => {
  expect(errores, 'errores de JavaScript en la página').toEqual([]);
});

// 'AAAA-MM-DD' en Caracas, n días atrás
const diaCaracas = (n = 0) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const d = new Date(hoy + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const ddmm = dia => dia.slice(8, 10) + '/' + dia.slice(5, 7);

test('turno: se abre con fondo, el cobro queda en el turno y al cerrar dice cuánto falta', async ({ page }) => {
  base.db.pedidos.push({ id: 'p1', sucursal_id: 's1', cliente_nombre: 'Mesa 5', estado: 'abierto', tasa_bcv: 190, created_at: new Date().toISOString() });
  base.db.pedido_items.push({ id: 'i1', pedido_id: 'p1', menu_id: 'm2', nombre: 'Ron Cacique 500 años', tipo: 'suelto', total: 1, consumido: 1, precio_usd: 28, unidad: 'botella' });
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  await page.click('#gnav-caja');
  await expect(page.locator('#turno-card')).toContainText('Sin turno abierto');
  // Abrir con $20 de fondo
  await page.click('#btn-abrir-turno');
  await page.fill('#fondo-usd', '20');
  await page.click('#btn-confirmar-abrir');
  await expect(page.locator('#turno-card')).toContainText('Turno abierto');
  expect(base.db.turnos[0]).toMatchObject({ fondo_usd: 20, fondo_bs: 0 });
  // Cobrar $28 en efectivo
  await page.click('#gnav-pedidos');
  await page.locator('.cli-card[data-pedido="p1"]').click();
  await page.locator('#s-detalle .top-bar .btn.primary').click();
  await page.click('#mp-Efectivo');
  await page.click('#btn-confirmar-cobro');
  await expect.poll(() => base.db.caja.length).toBe(1);
  expect(base.db.caja[0].turno_id).toBe(base.db.turnos[0].id);
  // Cerrar: esperado 28 + 20 de fondo = $48; se cuentan $45 → faltan $3
  await page.click('#gnav-caja');
  await page.click('#btn-cerrar-turno');
  await expect(page.locator('#hoja-cerrar-turno')).toContainText('esperado $48.00');
  await page.fill('#c-ef-usd', '45');
  await page.fill('#c-nota', 'Faltó vuelto');
  await page.click('#btn-confirmar-cierre');
  await expect(page.locator('#turno-resultado')).toContainText('Faltan $3.00');
  expect(base.db.turnos[0].diferencia_usd).toBe(-3);
  await page.locator('#hoja-cerrar-turno .btn', { hasText: 'Listo' }).click();
  await expect(page.locator('#turno-card')).toContainText('Sin turno abierto');
  await page.click('#ctab-turnos');
  await expect(page.locator('#cmt-turnos')).toContainText('−$3.00');
  await expect(page.locator('#cmt-turnos')).toContainText('Faltó vuelto');
});

test('caja sin turno: cuenta desde la medianoche de Caracas, no la de UTC', async ({ page }) => {
  const hoy = diaCaracas(0), ayer = diaCaracas(1);
  base.db.caja.push(
    { id: 'c1', sucursal_id: 's1', cliente_nombre: 'Anoche', total_usd: 50, tasa_bcv: 190, metodo_pago: 'Efectivo', fecha: new Date(ayer + 'T23:00:00-04:00').toISOString() },
    { id: 'c2', sucursal_id: 's1', cliente_nombre: 'Hoy', total_usd: 8, tasa_bcv: 190, metodo_pago: 'Efectivo', fecha: new Date(hoy + 'T00:30:00-04:00').toISOString() },
  );
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  await page.click('#gnav-caja');
  await expect(page.locator('#caja-historial')).toContainText('Hoy');
  await expect(page.locator('#caja-historial')).not.toContainText('Anoche');
  await expect(page.locator('#caja-metrics')).toContainText('$8.00');
});

test('reportes: una venta a las 10 pm cuenta para ese día, no para el siguiente', async ({ page }) => {
  const ayer = diaCaracas(1);
  base.db.caja.push({ id: 'c1', sucursal_id: 's1', cliente_nombre: 'Noche', total_usd: 30, tasa_bcv: 190, metodo_pago: 'Efectivo', usuario_id: 'u2', fecha: new Date(ayer + 'T22:00:00-04:00').toISOString() });
  await sesionDueno(page, base);
  await page.goto('http://app.test/index.html');
  await page.click('#gnav-admin');
  await page.click('#atab-reportes');
  await expect(page.locator('#rep-dias')).toContainText(ddmm(ayer));
  await expect(page.locator('#rep-dias')).not.toContainText(ddmm(diaCaracas(0)));
});
