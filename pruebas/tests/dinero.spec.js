// Cobrar bien: dos teléfonos, la hoja de cobro, una sola tasa, Bs con céntimos y auditoría
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar, sesionEmpleado, sesionDueno, vigilarErrores } = require('./apoyo/base-falsa');

let base, errores;

test.beforeEach(async ({ context, page }) => {
  base = new BaseFalsa();
  await conectar(context, base);
  errores = vigilarErrores(page);
});

test.afterEach(() => {
  expect(errores, 'errores de JavaScript en la página').toEqual([]);
});

function pedidoCon(items, extra = {}) {
  base.db.pedidos.push({ id: 'p1', sucursal_id: 's1', cliente_nombre: 'Mesa 5', estado: 'abierto', tasa_bcv: 187.35, created_at: new Date().toISOString(), ...extra });
  base.db.pedido_items.push(...items.map((it, n) => ({ id: 'i' + (n + 1), pedido_id: 'p1', unidad: 'und', ...it })));
}
async function entrarAlPedido(page, dueno = false) {
  if (dueno) await sesionDueno(page, base); else await sesionEmpleado(page);
  page.on('dialog', d => d.accept());
  await page.goto('http://app.test/index.html');
  await page.locator('.cli-card[data-pedido="p1"]').click();
  await expect(page.locator('#s-detalle')).toHaveClass(/active/);
}

test('dos teléfonos sirviendo del mismo combo no pierden unidades', async ({ page }) => {
  pedidoCon([{ menu_id: 'm1', nombre: 'Combo Polar x12', tipo: 'combo', total: 12, consumido: 4, precio_usd: 1.2 }]);
  await entrarAlPedido(page);
  // Otro teléfono sirve una mientras este todavía ve 4
  base.db.pedido_items[0].consumido = 5;
  await page.locator('.cbtn.mas').first().click();
  await expect.poll(() => base.db.pedido_items[0].consumido).toBe(6);
  await expect(page.locator('.cval').first()).toHaveText('6');
  expect(base.rpcs('servir')[0].body).toEqual({ p_item: 'i1', p_delta: 1 });
});

test('la hoja de cobro relee lo servido y muestra lo que se va a cobrar', async ({ page }) => {
  pedidoCon([{ menu_id: 'm3', nombre: "Whisky Buchanan's 12", tipo: 'suelto', total: 1, consumido: 1, precio_usd: 42 }]);
  await entrarAlPedido(page);
  // Otro mesonero sirve un Ron desde su teléfono
  base.db.pedido_items.push({ id: 'i9', pedido_id: 'p1', menu_id: 'm2', nombre: 'Ron Cacique 500 años', tipo: 'suelto', total: 1, consumido: 1, precio_usd: 28, unidad: 'botella' });
  await page.locator('#s-detalle .top-bar .btn.primary').click();
  await expect(page.locator('#cobro-usd')).toHaveText('$70.00');
  await page.click('#mp-Efectivo');
  await expect(page.locator('#btn-confirmar-cobro')).toContainText('$70.00');
  await page.click('#btn-confirmar-cobro');
  await expect.poll(() => base.db.caja.length).toBe(1);
  expect(base.db.caja[0].total_usd).toBe(70);
});

test('el cobro usa la tasa del día de la sucursal', async ({ page }) => {
  base.db.tasas_bcv.push({ sucursal_id: 's1', tasa: 190, fecha: '2026-11-01' });
  base.sinDolarapi = true;
  pedidoCon([{ menu_id: 'm2', nombre: 'Ron Cacique 500 años', tipo: 'suelto', total: 1, consumido: 1, precio_usd: 28 }], { tasa_bcv: 180 });
  await entrarAlPedido(page);
  await page.locator('#s-detalle .top-bar .btn.primary').click();
  await page.click('#mp-Efectivo');
  await page.click('#btn-confirmar-cobro');
  await expect.poll(() => base.db.caja.length).toBe(1);
  expect(base.db.caja[0].tasa_bcv).toBe(190);
  expect(base.db.pedidos[0].tasa_bcv).toBe(190);
});

test('sin dolarapi ni tasa guardada no se inventa 530: no cobra y el dueño la pone a mano', async ({ page }) => {
  base.sinDolarapi = true;
  pedidoCon([{ menu_id: 'm2', nombre: 'Ron Cacique 500 años', tipo: 'suelto', total: 1, consumido: 1, precio_usd: 28 }], { tasa_bcv: 0 });
  await sesionDueno(page, base);
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('201,50') : d.accept());
  await page.goto('http://app.test/index.html');
  await expect(page.locator('#tbadge')).toContainText('Sin tasa');
  await expect(page.locator('body')).not.toContainText('530');
  // Sin tasa el cobro no pasa
  await page.locator('.cli-card[data-pedido="p1"]').click();
  await page.locator('#s-detalle .top-bar .btn.primary').click();
  await expect(page.locator('#cobro-sin-tasa')).toBeVisible();
  await page.click('#mp-Efectivo');
  await page.click('#btn-confirmar-cobro');
  await expect(page.locator('.toast.error')).toContainText('No hay tasa BCV');
  expect(base.db.caja).toHaveLength(0);
  // El dueño pone la tasa: queda guardada como la del día (fecha de Caracas)
  await page.locator('#hoja-cobro .hoja-cerrar, #hoja-cobro [aria-label="Cerrar"]').first().click().catch(() => {});
  await page.locator('#s-detalle .top-bar .btn.ghost').click();
  await page.click('#btn-tasa-manual');
  await expect.poll(() => base.db.tasas_bcv.length).toBe(1);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  expect(base.db.tasas_bcv[0]).toMatchObject({ sucursal_id: 's1', tasa: 201.5, fecha: hoy });
  await expect(page.locator('#tasa-input')).toHaveValue('201.50');
});

test('el cliente ve los Bs con la tasa de hoy de la sucursal, con céntimos', async ({ page }) => {
  base.db.tasas_bcv.push({ sucursal_id: 's1', tasa: 200, fecha: '2026-11-01' });
  pedidoCon([{ menu_id: 'm2', nombre: 'Ron Cacique 500 años', tipo: 'suelto', total: 1, consumido: 1, precio_usd: 28.13 }], { tasa_bcv: 180 });
  await page.goto('http://app.test/pedido.html?id=p1');
  await expect(page.locator('.total-bs')).toHaveText('Bs 5.626,00');
  await expect(page.locator('#pie-tasa')).toContainText('Tasa BCV de hoy: Bs 200,00');
});

test('cuenta dividida: las partes suman exacto y el monto se copia con céntimos', async ({ page }) => {
  pedidoCon([{ menu_id: 'm7', nombre: 'Hielo', tipo: 'suelto', total: 10, consumido: 10, precio_usd: 1 }], { tasa_bcv: 187.35 });
  await page.goto('http://app.test/pedido.html?id=p1');
  await page.click('text=Quiero pagar');
  await page.locator('.metodo-btn', { hasText: 'Pago móvil' }).click();
  await page.click('[aria-label="Más personas"]');
  await page.click('[aria-label="Más personas"]');
  await expect(page.locator('.pago-usd')).toHaveText('$3.34');
  await expect(page.locator('#pago-reparto')).toContainText('1 paga $3.34 y 2 $3.33');
  // 10 × 187,35 = 1.873,50 Bs entre 3 → 624,50 cada uno
  await expect(page.locator('.datos-pago')).toContainText('624,50');
});

test('la carta sin tasa queda en dólares y no muestra 530', async ({ page }) => {
  base.sinDolarapi = true;
  await page.goto('http://app.test/carta.html?s=s1');
  await expect(page.locator('#carta-tasa')).toContainText('sin tasa BCV');
  await expect(page.locator('body')).not.toContainText('530');
  await expect(page.locator('.carta-precio').first()).not.toContainText('Bs');
});

test('auditoría: el dueño ve lo quitado tras servir y los cancelados', async ({ page }) => {
  const ahora = new Date().toISOString();
  base.db.pedidos.push({ id: 'p7', sucursal_id: 's1', cliente_nombre: 'Mesa 7', estado: 'cancelado', nota: 'Cancelado por Pedro Barra · consumo $28.00', usuario_id: 'u2', created_at: ahora });
  base.db.pedido_ajustes.push({ id: 'a1', pedido_id: 'p7', sucursal_id: 's1', usuario_id: 'u2', nombre: 'Ron Cacique 500 años', servido_antes: 1, servido_despues: 0, monto_usd: 28, created_at: ahora });
  await sesionDueno(page, base);
  await page.goto('http://app.test/index.html');
  await page.click('#gnav-admin');
  await page.click('#atab-auditoria');
  await expect(page.locator('#aud-ajustes')).toContainText('Ron Cacique');
  await expect(page.locator('#aud-ajustes')).toContainText('Pedro Barra');
  await expect(page.locator('#aud-ajustes')).toContainText('$28.00');
  await expect(page.locator('#aud-cancelados')).toContainText('Cancelado por Pedro Barra');
});
