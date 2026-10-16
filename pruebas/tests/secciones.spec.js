// Las demás pantallas: menú, caja, stock, clientes y administración
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

async function entrar(page, dueno = false) {
  if (dueno) await sesionDueno(page, base); else await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  await expect(page.locator('#app')).toBeVisible();
}
const ir = (page, seccion) => page.click('#gnav-' + seccion);

test('login: sin sesión se ve el acceso y se puede pasar al registro', async ({ page }) => {
  await page.goto('http://app.test/index.html');
  await expect(page.locator('#auth-screen')).toBeVisible();
  await page.click('text=Crear cuenta nueva');
  await expect(page.locator('#form-register')).toBeVisible();
  await page.click('text=Ya tengo cuenta');
  await expect(page.locator('#form-login')).toBeVisible();
  await page.click('#form-login .btn.primary');
  await expect(page.locator('#auth-error')).toContainText('Completa todos los campos');
});

test('el empleado no ve Admin; el dueño sí', async ({ page }) => {
  await entrar(page);
  await expect(page.locator('#gnav-admin')).toHaveCount(0);
});

test('menú: crear, editar y quitar un producto', async ({ page }) => {
  await entrar(page);
  await ir(page, 'menu');
  await expect(page.locator('#menu-list .mi')).toHaveCount(5);
  await page.locator('#sec-menu .top-bar .btn.primary').click();
  await page.fill('#mf-nombre', 'Cerveza Solera');
  await page.selectOption('#mf-tipo', 'suelto');
  await page.fill('#mf-precio', '1.5');
  await page.fill('#mf-unidad', 'lata');
  await page.fill('#mf-cat', 'Cerveza');
  await page.locator('#menu-form .btn.primary').click();
  await expect(page.locator('#menu-list .mi', { hasText: 'Cerveza Solera' })).toBeVisible();

  await page.locator('.mi', { hasText: 'Cerveza Solera' }).locator('[aria-label="Editar"]').click();
  await expect(page.locator('#edit-modal')).toHaveClass(/open/);
  await page.fill('#ef-precio', '1.75');
  await page.locator('#edit-modal .btn.primary').click();
  await expect.poll(() => base.db.menu.find(m => m.nombre === 'Cerveza Solera')?.precio_usd).toBe(1.75);

  await page.locator('.mi', { hasText: 'Cerveza Solera' }).locator('[aria-label="Eliminar"]').click();
  await expect(page.locator('.mi', { hasText: 'Cerveza Solera' })).toHaveCount(0);
  expect(base.db.menu.find(m => m.nombre === 'Cerveza Solera').activo).toBe(false);
});

test('la moneda elegida cambia cómo se muestran los precios', async ({ page }) => {
  await entrar(page);
  await ir(page, 'menu');
  await page.click('#m-usd');
  await expect(page.locator('.mi', { hasText: 'Hielo' })).toContainText('$1.00 por bolsa');
  await page.click('#m-bs');
  await expect(page.locator('.mi', { hasText: 'Hielo' })).toContainText('Bs');
  await page.click('#m-both');
  await expect(page.locator('.mi', { hasText: 'Hielo' })).toContainText('$1.00 / €');
});

test('caja: lo cobrado aparece en el historial y por producto', async ({ page }) => {
  const db = base.db;
  db.pedidos.push({ id: 'p1', sucursal_id: 's1', cliente_nombre: 'Mesa 1', estado: 'cobrado', created_at: new Date().toISOString() });
  db.pedido_items.push({ id: 'i1', pedido_id: 'p1', nombre: 'Ron Cacique 500 años', tipo: 'suelto', total: 1, consumido: 1, precio_usd: 28, unidad: 'botella' });
  db.caja.push({ id: 'c1', sucursal_id: 's1', pedido_id: 'p1', cliente_nombre: 'Mesa 1', total_usd: 28, tasa_bcv: 187.35, metodo_pago: 'Zelle', nota: 'sin cambio', fecha: new Date().toISOString() });
  await entrar(page);
  await ir(page, 'caja');
  await expect(page.locator('#caja-metrics')).toContainText('$28.00');
  await expect(page.locator('#caja-historial .hcard')).toContainText('Mesa 1');
  await expect(page.locator('#caja-historial .hcard')).toContainText('Zelle · sin cambio');
  await page.click('#ctab-productos');
  await expect(page.locator('#caja-productos')).toContainText('Ron Cacique 500 años');
  await page.locator('#sec-caja .top-bar .btn', { hasText: 'PDF' }).click();
  await expect(page.locator('#pdf-modal-caja')).toHaveClass(/open/);
  await expect(page.locator('#pdf-content-caja')).toContainText('TOTAL DEL DÍA');
});

test('stock: alta con stock inicial, entrada, salida y alerta de stock bajo', async ({ page }) => {
  await entrar(page);
  await ir(page, 'inventario');
  await expect(page.locator('#inv-list .card')).toHaveCount(1);
  await page.locator('#sec-inventario .top-bar .btn.primary').click();
  await page.fill('#if-nombre', 'Vino Tinto');
  await page.fill('#if-stock', '6');
  await page.fill('#if-min', '3');
  await page.locator('#inv-form .btn.primary').click();
  await expect(page.locator('#inv-list .card', { hasText: 'Vino Tinto' })).toBeVisible();
  expect(base.rpcs('mover_stock').at(-1).body).toMatchObject({ p_tipo: 'entrada', p_cantidad: 6 });

  const tarjeta = page.locator('#inv-list .card').filter({ has: page.locator('.t-fuerte', { hasText: 'Ron Cacique' }) });
  await tarjeta.locator('.btn.danger', { hasText: 'Salida' }).click();
  await expect(page.locator('#mov-modal')).toHaveClass(/open/);
  await page.fill('#mov-cantidad', '9.5');
  await page.locator('#mov-modal .btn.primary').click();
  await expect(tarjeta.locator('.stock-num')).toHaveText('0.5');
  await expect(page.locator('#inv-alertas')).toContainText('Ron Cacique');
});

test('clientes: crear y ver el historial de consumo', async ({ page }) => {
  const db = base.db;
  db.caja.push({ id: 'c1', sucursal_id: 's1', pedido_id: 'p1', cliente_nombre: 'Carlos', total_usd: 20, tasa_bcv: 187.35, metodo_pago: 'Efectivo', fecha: new Date().toISOString() });
  db.pedido_items.push({ id: 'i1', pedido_id: 'p1', nombre: 'Hielo', tipo: 'suelto', total: 4, consumido: 4, precio_usd: 1, unidad: 'bolsa' });
  await entrar(page);
  await ir(page, 'clientes');
  await page.locator('#sec-clientes .top-bar .btn.primary').click();
  await page.fill('#cf-nombre', 'Carlos');
  await page.fill('#cf-tel', '0414-1112233');
  await page.locator('#cliente-form .btn.primary').click();
  await expect(page.locator('#clientes-list .cli-card', { hasText: 'Carlos' })).toContainText('0414-1112233');
  await page.locator('#clientes-list .cli-card', { hasText: 'Carlos' }).click();
  await expect(page.locator('#hist-modal')).toHaveClass(/open/);
  await expect(page.locator('#hist-modal-metrics')).toContainText('$20.00');
  await expect(page.locator('#hist-modal-prods')).toContainText('Hielo');
  await expect(page.locator('#hist-modal-visitas')).toContainText('Efectivo');
});

test('dueño: usuarios pendientes se activan, y los reportes y la marca funcionan', async ({ page }) => {
  const db = base.db;
  db.caja.push({ id: 'c1', sucursal_id: 's1', pedido_id: 'p1', cliente_nombre: 'Mesa 1', total_usd: 30, tasa_bcv: 187.35, metodo_pago: 'Pago móvil', usuario_id: 'u2', fecha: new Date().toISOString() });
  await entrar(page, true);
  await ir(page, 'admin');
  await expect(page.locator('#amt-sucursales')).toBeVisible();
  await expect(page.locator('#sucursales-list')).toContainText('Sucursal Centro');
  await expect(page.locator('#carta-url')).toContainText('carta.html?s=s1');

  // marca
  await page.fill('#brand-nombre', 'El Rincón');
  await page.click('#suc-branding-card .btn.primary');
  await expect(page.locator('#app-titulo')).toHaveText('El Rincón');
  expect(base.db.sucursales[0].app_nombre).toBe('El Rincón');

  // datos de pago
  await page.fill('#dp-ze-correo', 'nuevo@pagos.com');
  await page.locator('.btn.primary', { hasText: 'Guardar datos de pago' }).click();
  await expect.poll(() => base.db.sucursales[0].datos_pago.zelle.correo).toBe('nuevo@pagos.com');

  // usuarios
  await page.click('#atab-usuarios');
  await expect(page.locator('#pending-count')).toContainText('1 usuario pendiente');
  await page.selectOption('#suc-sel-u3', 's1');
  await page.locator('.user-card.pending .btn.success').click();
  await expect.poll(() => base.db.perfiles.find(p => p.id === 'u3').sucursal_id).toBe('s1');

  // reportes y empleados
  await page.click('#atab-reportes');
  await expect(page.locator('#rep-metrics')).toContainText('$30.00');
  await expect(page.locator('#rep-metodos')).toContainText('Pago móvil');
  await page.click('#atab-empleados');
  await expect(page.locator('#emp-list')).toContainText('Pedro Barra');
});

test('el tema claro se recuerda', async ({ page }) => {
  await entrar(page);
  await page.click('#dark-btn');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
});
