// Errores visibles: sin red o con fallas la app lo dice, en español, en vez de mostrar "sin datos"
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar, sesionEmpleado, sesionDueno, vigilarErrores } = require('./apoyo/base-falsa');

let base, errores;

test.beforeEach(async ({ context, page }) => {
  base = new BaseFalsa();
  await conectar(context, base);
  errores = vigilarErrores(page);
  page.on('dialog', d => d.accept());
});

test.afterEach(() => {
  expect(errores, 'errores de JavaScript en la página').toEqual([]);
});

test('si no se pudieron leer las ventas, la caja avisa en vez de decir $0 sin más', async ({ page }) => {
  base.fallar = { leer: ['caja'] };
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  await page.click('#gnav-caja');
  await expect(page.locator('#aviso-conexion')).toContainText('No se pudieron cargar');
});

test('sesión vencida al cobrar: el mensaje sale en español', async ({ page }) => {
  base.db.pedidos.push({ id: 'p1', sucursal_id: 's1', cliente_nombre: 'Mesa 5', estado: 'abierto', tasa_bcv: 190, created_at: new Date().toISOString() });
  base.db.pedido_items.push({ id: 'i1', pedido_id: 'p1', menu_id: 'm2', nombre: 'Ron', tipo: 'suelto', total: 1, consumido: 1, precio_usd: 28, unidad: 'botella' });
  base.fallar = { rpc: { cobrar_pedido: { status: 401, message: 'JWT expired' } } };
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  await page.locator('.cli-card[data-pedido="p1"]').click();
  await page.locator('#s-detalle .top-bar .btn.primary').click();
  await page.click('#mp-Efectivo');
  await page.click('#btn-confirmar-cobro');
  await expect(page.locator('.toast.error')).toContainText('Tu sesión venció');
  expect(base.db.caja).toHaveLength(0);
});

test('sin cámara el escáner deja escribir el código', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(new Error('NotAllowedError')) } });
  });
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  await page.click('#gnav-inventario');
  await page.locator('#sec-inventario .btn', { hasText: 'Escanear' }).first().click();
  await expect(page.locator('#scanner-manual')).toBeVisible();
  await expect(page.locator('#scanner-status')).toContainText('Escribe el código');
});

test('backup: si la base rechaza los productos, la importación no dice que todo salió bien', async ({ page }) => {
  base.fallar = { escribir: ['menu'] };
  base.db.menu.find(m => m.nombre === 'Hielo').activo = false;
  await sesionDueno(page, base);
  await page.goto('http://app.test/index.html');
  await page.click('#gnav-admin');
  const backup = { version: 1, negocio: 'La Bodeguita', fecha: new Date().toISOString(), menu: [
    { nombre: 'Vodka Gordons', tipo: 'suelto', precio_usd: 15, unidades_combo: 1, unidad: 'botella', categoria: 'Vodka' },
    { nombre: 'Hielo', tipo: 'suelto', precio_usd: 1, unidades_combo: 1, unidad: 'bolsa', categoria: 'Mezcladores' },
  ] };
  await page.setInputFiles('#import-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#amt-sucursales')).toContainText('Importación incompleta');
  await expect(page.locator('#amt-sucursales')).toContainText('2 no se pudieron guardar');
  expect(base.db.menu.some(m => m.nombre === 'Vodka Gordons')).toBe(false);
});

test('backup: reactiva productos que se habían quitado del menú', async ({ page }) => {
  base.db.menu.find(m => m.nombre === 'Hielo').activo = false;
  await sesionDueno(page, base);
  await page.goto('http://app.test/index.html');
  await page.click('#gnav-admin');
  const backup = { version: 1, negocio: 'La Bodeguita', fecha: new Date().toISOString(), menu: [
    { nombre: 'Hielo', tipo: 'suelto', precio_usd: 1, unidades_combo: 1, unidad: 'bolsa', categoria: 'Mezcladores' },
  ] };
  await page.setInputFiles('#import-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#amt-sucursales')).toContainText('1 reactivado');
  expect(base.db.menu.find(m => m.nombre === 'Hielo').activo).toBe(true);
});

test('el cliente ve que su pedido fue cancelado y no puede avisar pago', async ({ page }) => {
  base.db.pedidos.push({ id: 'p1', sucursal_id: 's1', cliente_nombre: 'Mesa 5', estado: 'cancelado', tasa_bcv: 190, created_at: new Date().toISOString() });
  await page.goto('http://app.test/pedido.html?id=p1');
  await expect(page.locator('#pedido-cancelado')).toBeVisible();
  await expect(page.locator('#live-badge')).toContainText('Cancelado');
  await expect(page.locator('text=Quiero pagar')).toHaveCount(0);
});
