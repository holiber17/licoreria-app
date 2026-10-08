// Página del cliente (QR) y carta pública
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar, vigilarErrores } = require('./apoyo/base-falsa');

let base, errores;

test.beforeEach(async ({ context, page }) => {
  base = new BaseFalsa();
  await conectar(context, base);
  errores = vigilarErrores(page);
  const db = base.db;
  db.pedidos.push({ id: 'p1', sucursal_id: 's1', cliente_nombre: 'Mesa 5', estado: 'abierto', tasa_bcv: 187.35, created_at: new Date().toISOString() });
  db.pedido_items.push(
    { id: 'i1', pedido_id: 'p1', menu_id: 'm1', nombre: 'Combo Polar x12', tipo: 'combo', total: 12, consumido: 4, precio_usd: 1.2, unidad: 'lata' },
    { id: 'i2', pedido_id: 'p1', menu_id: 'm2', nombre: 'Ron Cacique 500 años', tipo: 'suelto', total: 2, consumido: 2, precio_usd: 28, unidad: 'botella' },
  );
});

test.afterEach(() => {
  expect(errores, 'errores de JavaScript en la página').toEqual([]);
});

test('el cliente ve su total y lo que lleva, con el ícono de cada categoría', async ({ page }) => {
  await page.goto('http://app.test/pedido.html?id=p1');
  await expect(page.locator('.total-usd')).toHaveText('$60.80');
  await expect(page.locator('#negocio-nombre')).toHaveText('La Bodeguita');
  await expect(page.locator('.item-row', { hasText: 'Combo Polar' })).toContainText('Te quedan 8 de 12');
  await expect(page.locator('.item-row', { hasText: 'Combo Polar' }).locator('.cat-icon-sm')).toHaveText('🍺');
});

test('no pide permiso de notificaciones al abrir la página', async ({ page }) => {
  await page.addInitScript(() => {
    window.__pidioPermiso = false;
    if (window.Notification) Notification.requestPermission = async () => { window.__pidioPermiso = true; return 'default'; };
  });
  await page.goto('http://app.test/pedido.html?id=p1');
  await expect(page.locator('.total-box')).toBeVisible();
  expect(await page.evaluate(() => window.__pidioPermiso)).toBe(false);
});

test('llamar al mesonero: crea el aviso y muestra "Ya vienen" cuando lo atienden', async ({ page }) => {
  await page.goto('http://app.test/pedido.html?id=p1');
  await page.click('#btn-mesonero');
  await expect.poll(() => base.db.solicitudes.length).toBe(1);
  expect(base.db.solicitudes[0]).toMatchObject({ pedido_id: 'p1', tipo: 'mesonero', estado: 'pendiente' });
  await expect(page.locator('.estado-aviso.espera')).toContainText('Le avisamos al mesonero');
  await expect(page.locator('#btn-mesonero')).toBeDisabled();

  // El mesonero lo marca como atendido
  Object.assign(base.db.solicitudes[0], { estado: 'atendida', atendida_at: new Date().toISOString() });
  await page.evaluate(() => loadPedido());
  await expect(page.locator('.estado-aviso.ok')).toContainText('Ya vienen');
});

test('pagar: dividir la cuenta, datos para copiar y monto exacto en Bs', async ({ page }) => {
  await page.goto('http://app.test/pedido.html?id=p1');
  await page.click('text=Quiero pagar');
  await page.click('[aria-label="Más personas"]');
  await expect(page.locator('.pago-usd')).toHaveText('$30.40');
  await expect(page.locator('.datos-pago')).toContainText('0414-5550101');
  await expect(page.locator('.datos-pago')).toContainText(String(Math.round(30.4 * 187.35)));
  await page.click('#btn-avisar-pago');
  await expect.poll(() => base.db.solicitudes.map(s => s.tipo)).toEqual(['pagar']);
  expect(base.db.solicitudes[0].metodo).toContain('entre 2');
});

test('carta pública: categorías, filtro y precios en Bs', async ({ page }) => {
  await page.goto('http://app.test/carta.html?s=s1');
  await expect(page.locator('.carta-item')).toHaveCount(5);
  await page.locator('.chip', { hasText: 'Ron' }).click();
  await expect(page.locator('.carta-item')).toHaveCount(1);
  await page.click('#cm-bs');
  await expect(page.locator('.carta-precio').first()).toContainText('Bs');
});
