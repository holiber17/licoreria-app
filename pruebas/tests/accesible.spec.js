// Usabilidad y accesibilidad: tema del teléfono, hojas como diálogos, teclado, áreas táctiles y avisos
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar, sesionEmpleado, sesionDueno, vigilarErrores } = require('./apoyo/base-falsa');

let base, errores;

test.beforeEach(async ({ context, page }) => {
  base = new BaseFalsa();
  await conectar(context, base);
  errores = vigilarErrores(page);
  page.on('dialog', d => d.accept());
  base.db.pedidos.push({ id: 'p1', sucursal_id: 's1', cliente_nombre: 'Carlos', mesa: '4', estado: 'abierto', tasa_bcv: 190, created_at: new Date().toISOString() });
  base.db.pedido_items.push({ id: 'i1', pedido_id: 'p1', menu_id: 'm2', nombre: 'Ron Cacique 500 años', tipo: 'suelto', total: 1, consumido: 1, precio_usd: 28, unidad: 'botella' });
});

test.afterEach(() => {
  expect(errores, 'errores de JavaScript en la página').toEqual([]);
});

test('sin elegir tema se sigue el del teléfono, también en la página del cliente', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('http://app.test/pedido.html?id=p1');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('http://app.test/carta.html?s=s1');
  await expect(page.locator('html')).not.toHaveAttribute('data-tema', 'claro');
});

test('las tarjetas de pedido se abren con el teclado y la hoja de cobro es un diálogo que cierra con Escape', async ({ page }) => {
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  const tarjeta = page.locator('.cli-card[data-pedido="p1"]');
  await expect(tarjeta).toHaveAttribute('role', 'button');
  await tarjeta.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#s-detalle')).toHaveClass(/active/);
  await page.locator('#s-detalle .top-bar .btn.primary').click();
  const hoja = page.locator('#hoja-cobro [role="dialog"]');
  await expect(hoja).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#hoja-cobro')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#hoja-cobro')).not.toHaveClass(/open/);
});

test('la mesa es una etiqueta tranquila, no una alerta que late', async ({ page }) => {
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  const mesa = page.locator('.cli-card .mesa-tag');
  await expect(mesa).toContainText('Mesa 4');
  expect(await mesa.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('los botones de + y − miden al menos 44 px', async ({ page }) => {
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  await page.locator('.cli-card[data-pedido="p1"]').click();
  const caja = await page.locator('.cbtn.mas').first().boundingBox();
  expect(caja.width).toBeGreaterThanOrEqual(44);
  expect(caja.height).toBeGreaterThanOrEqual(44);
});

test('un aviso de error largo se lee entero, se anuncia y se cierra al tocarlo', async ({ page }) => {
  await sesionEmpleado(page);
  await page.goto('http://app.test/index.html');
  await page.locator('.cli-card[data-pedido="p1"]').click();
  await page.click('#tab-cuenta');
  await page.click('text=Cancelar pedido sin cobrar');   // con consumo: solo el dueño
  const aviso = page.locator('.toast.error');
  await expect(aviso).toHaveAttribute('role', 'alert');
  await expect(aviso).toContainText('avísale al dueño');   // el final del texto también se ve
  const ancho = await aviso.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  expect(ancho).toBe(true);
  await aviso.click();
  await expect(aviso).toHaveCount(0);
});

test('carta: en los combos el precio grande es el del combo completo', async ({ page }) => {
  await page.goto('http://app.test/carta.html?s=s1');
  const combo = page.locator('.carta-item', { hasText: 'Combo Polar' });
  await expect(combo.locator('.carta-precio')).toContainText('$14.40');
  await expect(combo.locator('.carta-combo')).toContainText('$1.20 c/u');
});

test('avisos: dos seguidos se apilan sin taparse, y el aviso de un cliente se cierra con su botón', async ({ page }) => {
  await sesionDueno(page, base);
  await page.goto('http://app.test/index.html');
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForTimeout(500);
  base.db.solicitudes.push({ id: 'sx', sucursal_id: 's1', pedido_id: 'p1', tipo: 'pagar', metodo: 'Pago móvil', estado: 'pendiente', created_at: new Date().toISOString() });
  await page.evaluate(() => window.__licor?.cargarSolicitudes?.());
  const alerta = page.locator('.toast.alerta');
  await expect(alerta).toContainText('Carlos · Mesa 4');
  await expect(alerta.locator('.ti-wallet')).toHaveCount(1);   // el ícono dice qué pidió
  await alerta.getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(alerta).toHaveCount(0);

  await page.click('#gnav-admin');
  await page.fill('#brand-nombre', 'El Rincón');
  await page.click('#suc-branding-card .btn.primary');
  await page.locator('.btn.primary', { hasText: 'Guardar datos de pago' }).click();
  const cortos = page.locator('.toasts.abajo .toast');
  await expect(cortos).toHaveCount(2);
  const [a, b] = [await cortos.nth(0).boundingBox(), await cortos.nth(1).boundingBox()];
  expect(a.y + a.height).toBeLessThanOrEqual(b.y);   // uno encima del otro, sin taparse
  await expect(cortos.nth(1)).not.toContainText('✓');   // el ícono ya dice "listo"
});
