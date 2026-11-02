// Recuperar la contraseña: pedir el enlace y poner la nueva al volver del correo
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar, vigilarErrores } = require('./apoyo/base-falsa');

let base, errores;

test.beforeEach(async ({ context, page }) => {
  base = new BaseFalsa();
  await conectar(context, base);
  errores = vigilarErrores(page);
});

test.afterEach(() => {
  expect(errores, 'errores de JavaScript en la página').toEqual([]);
});

test('olvidé mi contraseña: pide el enlace al correo y vuelve a esta misma página', async ({ page }) => {
  await page.goto('http://app.test/index.html');
  await page.click('#btn-olvide');
  await expect(page.locator('#form-recuperar')).toBeVisible();
  await page.fill('#rec-email', 'pedro@bodeguita.com');
  await page.click('#form-recuperar button[type=submit]');
  await expect(page.locator('#auth-aviso')).toContainText('te llegará un enlace');
  expect(base.auth).toHaveLength(1);
  expect(base.auth[0].body.email).toBe('pedro@bodeguita.com');
  expect(decodeURIComponent(base.auth[0].url)).toContain('redirect_to=http://app.test/index.html');
});

// supabase-js lee el vencimiento dentro del token: tiene que tener forma de JWT
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'u2', exp: 4102444800, role: 'authenticated' }) + '.firmaxx';   // largo válido en base64url

test('el enlace del correo abre la pantalla de contraseña nueva y luego entra a la app', async ({ page }) => {
  await page.goto('http://app.test/index.html#access_token=' + JWT + '&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery');
  await expect(page.locator('#form-nueva')).toBeVisible();
  // Los tokens no quedan en la dirección
  expect(page.url()).toBe('http://app.test/index.html');
  // Validaciones antes de guardar
  await page.fill('#nueva-pass', 'abc');
  await page.fill('#nueva-pass2', 'abc');
  await page.click('#form-nueva button[type=submit]');
  await expect(page.locator('#auth-error')).toContainText('al menos 6');
  await page.fill('#nueva-pass', 'clave-nueva-1');
  await page.fill('#nueva-pass2', 'clave-nueva-2');
  await page.click('#form-nueva button[type=submit]');
  await expect(page.locator('#auth-error')).toContainText('no coinciden');
  expect(base.auth).toHaveLength(0);
  // Guardar y entrar
  await page.fill('#nueva-pass2', 'clave-nueva-1');
  await page.click('#form-nueva button[type=submit]');
  await expect(page.locator('#app')).toBeVisible();
  expect(base.auth).toEqual([{ tipo: 'clave', body: expect.objectContaining({ password: 'clave-nueva-1' }) }]);
});

test('un enlace vencido avisa y deja pedir otro', async ({ page }) => {
  await page.goto('http://app.test/index.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.locator('#form-recuperar')).toBeVisible();
  await expect(page.locator('#auth-error')).toContainText('venció');
});
