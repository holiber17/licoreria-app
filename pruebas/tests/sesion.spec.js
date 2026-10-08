// Sesión: un error al leer el perfil no debe dejar al usuario "pendiente"
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar, sesionEmpleado, vigilarErrores } = require('./apoyo/base-falsa');

test('con la sesión vencida (401) no se pisa el perfil ni se pide activación', async ({ context, page }) => {
  const base = new BaseFalsa();
  await conectar(context, base);
  // Lectura del perfil falla como cuando el token venció
  await context.route(/rest\/v1\/perfiles\?/, route => route.fulfill({ status: 401, json: { message: 'JWT expired' } }));
  await sesionEmpleado(page);
  const errores = vigilarErrores(page);
  await page.goto('http://app.test/index.html');
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('#wait-screen')).toBeHidden();
  expect(base.llamadas.filter(l => l.tabla === 'perfiles' && l.metodo === 'POST')).toEqual([]);
  expect(base.db.perfiles[0].sucursal_id).toBe('s1');
  expect(errores).toEqual([]);
});
