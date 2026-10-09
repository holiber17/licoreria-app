// Flujo del mesonero: abrir pedido, agregar, servir, cobrar
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar, sesionEmpleado, vigilarErrores } = require('./apoyo/base-falsa');

let base, errores;

test.beforeEach(async ({ context, page }) => {
  base = new BaseFalsa();
  await conectar(context, base);
  await sesionEmpleado(page);
  errores = vigilarErrores(page);
  page.on('dialog', d => d.accept());
  await page.goto('http://app.test/index.html');
  await expect(page.locator('#app')).toBeVisible();
});

test.afterEach(() => {
  expect(errores, 'errores de JavaScript en la página').toEqual([]);
});

async function abrirPedido(page, nombre) {
  await page.locator('#s-lista .top-bar .btn.primary').click();
  await page.fill('#nuevo-nombre', nombre);
  await page.locator('#form-nuevo .btn.primary').click();
  await expect(page.locator('#s-detalle')).toHaveClass(/active/);
}

test('agregar varios productos de una vez: lo suelto queda servido y se cobra', async ({ page }) => {
  await abrirPedido(page, 'Mesa 5');
  await page.click('#tab-agregar');
  const tarjeta = n => page.locator('.menu-grid-item', { hasText: n });
  await tarjeta('Combo Polar').click();
  await tarjeta('Ron Cacique').click();
  await tarjeta('Ron Cacique').click();
  await tarjeta('Coca-Cola').click();
  await expect(tarjeta('Ron Cacique').locator('.mgi-cant')).toHaveText('2');
  // corregir con −
  await tarjeta('Coca-Cola').locator('.mgi-menos').click();
  await expect(tarjeta('Coca-Cola').locator('.mgi-cant')).toHaveCount(0);
  await expect(page.locator('#barra-agregar-btn')).toContainText('Agregar 3');
  await page.click('#barra-agregar-btn');

  await expect(page.locator('#mt-consumo')).toBeVisible();
  expect(base.rpcs('agregar_al_pedido')).toHaveLength(1);
  const ron = base.db.pedido_items.find(i => i.nombre.startsWith('Ron'));
  expect(ron).toMatchObject({ total: 2, consumido: 2 });
  const combo = base.db.pedido_items.find(i => i.tipo === 'combo');
  expect(combo).toMatchObject({ total: 12, consumido: 0 });
  // el contador muestra lo servido
  await expect(page.locator('.item-row', { hasText: 'Ron Cacique' }).locator('.cval')).toHaveText('2');
});

test('pedir otro suelto se suma a la misma línea; en 0 se quita', async ({ page }) => {
  await abrirPedido(page, 'Barra');
  await page.click('#tab-agregar');
  await page.locator('.menu-grid-item', { hasText: 'Hielo' }).click();
  await page.click('#barra-agregar-btn');
  const fila = page.locator('.item-row', { hasText: 'Hielo' });
  await fila.locator('.cbtn.mas').click();
  await expect(fila.locator('.cval')).toHaveText('2');
  await expect.poll(() => base.db.pedido_items.find(i => i.nombre === 'Hielo')?.consumido).toBe(2);
  expect(base.db.pedido_items.filter(i => i.nombre === 'Hielo')).toHaveLength(1);
  await fila.locator('.cbtn').first().click();
  await fila.locator('.cbtn').first().click();
  await expect(page.locator('.item-row', { hasText: 'Hielo' })).toHaveCount(0);
});

test('en los combos el + sirve una unidad y el número sube', async ({ page }) => {
  await abrirPedido(page, 'Mesa 2');
  await page.click('#tab-agregar');
  await page.locator('.menu-grid-item', { hasText: 'Combo Polar' }).click();
  await page.click('#barra-agregar-btn');
  const fila = page.locator('.item-row', { hasText: 'Combo Polar' });
  await expect(fila.locator('.cval')).toHaveText('0');
  await fila.locator('.cbtn.mas').click();
  await fila.locator('.cbtn.mas').click();
  await expect(fila.locator('.cval')).toHaveText('2');
  await expect(fila).toContainText('quedan 10 de 12');
});

test('la hoja de cobro exige el método y registra el elegido; el doble toque cobra una sola vez', async ({ page }) => {
  await abrirPedido(page, 'Mesa 7');
  await page.click('#tab-agregar');
  await page.locator('.menu-grid-item', { hasText: 'Whisky' }).click();
  await page.click('#barra-agregar-btn');

  await page.locator('#s-detalle .top-bar .btn.primary').click(); // "Cobrar" de arriba
  await expect(page.locator('#hoja-cobro')).toHaveClass(/open/);
  await expect(page.locator('#cobro-usd')).toHaveText('$42.00');
  await expect(page.locator('#btn-confirmar-cobro')).toBeDisabled();

  await page.click('[id="mp-Pago móvil"]');
  await expect(page.locator('#btn-confirmar-cobro')).toContainText('Pago móvil');
  await page.evaluate(() => { const b = document.getElementById('btn-confirmar-cobro'); b.click(); b.click(); b.click(); });

  await expect(page.locator('#sec-caja')).toHaveClass(/active/);
  expect(base.rpcs('cobrar_pedido')).toHaveLength(1);
  expect(base.db.caja).toHaveLength(1);
  expect(base.db.caja[0]).toMatchObject({ total_usd: 42, metodo_pago: 'Pago móvil' });
});

test('dentro de un pedido la barra de tasas se oculta y vuelve al salir', async ({ page }) => {
  await expect(page.locator('.content > .tbar')).toBeVisible();
  await abrirPedido(page, 'Terraza');
  await expect(page.locator('.content > .tbar')).toBeHidden();
  await expect(page.locator('#det-tasa')).toContainText('BCV');
  await page.locator('#s-detalle .top-bar .btn.ghost').click();
  await expect(page.locator('.content > .tbar')).toBeVisible();
});

test('los avisos de clientes aparecen en el panel y en la tarjeta del pedido', async ({ page }) => {
  await abrirPedido(page, 'Mesa 9');
  const pedido = base.db.pedidos[0];
  base.db.solicitudes.push({ id: 'q1', sucursal_id: 's1', pedido_id: pedido.id, tipo: 'pagar', metodo: 'Zelle', estado: 'pendiente', created_at: new Date().toISOString() });
  await page.locator('#s-detalle .top-bar .btn.ghost').click();
  await page.evaluate(() => cargarSolicitudes());
  await expect(page.locator('#solicitudes-panel .solicitud')).toHaveCount(1);
  await expect(page.locator(`.cli-card[data-pedido="${pedido.id}"] .aviso-tarjeta`)).toContainText('Quiere pagar');
  await page.locator('#solicitudes-panel .solicitud .btn').click();
  await expect(page.locator('#solicitudes-panel')).toBeHidden();
  expect(base.db.solicitudes[0].estado).toBe('atendida');
});

test('la mesa se guarda aparte del nombre y se ve en la tarjeta del pedido', async ({ page }) => {
  await page.locator('#s-lista .top-bar .btn.primary').click();
  await page.fill('#nuevo-nombre', 'Carlos');
  await page.fill('#nuevo-mesa', '4');
  await page.locator('#form-nuevo .btn.primary').click();
  await expect(page.locator('#s-detalle')).toHaveClass(/active/);
  expect(base.db.pedidos[0]).toMatchObject({ cliente_nombre: 'Carlos', mesa: '4' });
  await expect(page.locator('#det-nombre')).toHaveText('Carlos · Mesa 4');
  await page.locator('#s-detalle .top-bar .btn.ghost').click();
  await expect(page.locator('.cli-card .aviso-tarjeta')).toContainText('Mesa 4');
});

test('cancelar sin consumo deja escrito quién lo canceló', async ({ page }) => {
  await abrirPedido(page, 'Mesa 7');
  await page.click('#tab-cuenta');
  await page.click('text=Cancelar pedido sin cobrar');
  await expect.poll(() => base.db.pedidos[0].estado).toBe('cancelado');
  expect(base.db.pedidos[0].nota).toContain('Cancelado por');
  expect(base.db.pedidos[0].nota).toContain('Pedro Barra');
});

test('con consumo servido, un empleado no puede cancelar el pedido', async ({ page }) => {
  await abrirPedido(page, 'Mesa 8');
  await page.click('#tab-agregar');
  await page.locator('.menu-grid-item', { hasText: 'Ron Cacique' }).click();
  await page.click('#barra-agregar-btn');
  await expect(page.locator('#mt-consumo')).toBeVisible();
  await page.click('#tab-cuenta');
  await page.click('text=Cancelar pedido sin cobrar');
  await expect(page.locator('.toast.error')).toContainText('solo el dueño');
  expect(base.db.pedidos[0].estado).toBe('abierto');
});
