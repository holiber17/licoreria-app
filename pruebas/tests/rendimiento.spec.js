// Peso de las páginas públicas: que no vuelvan a cargar supabase-js ni la fuente completa de iconos
const { test, expect } = require('@playwright/test');
const { BaseFalsa, conectar } = require('./apoyo/base-falsa');

let base;
test.beforeEach(async ({ context }) => {
  base = new BaseFalsa();
  await conectar(context, base);
  base.db.pedidos.push({ id: 'p1', sucursal_id: 's1', cliente_nombre: 'Mesa 5', estado: 'abierto', tasa_bcv: 190, created_at: new Date().toISOString() });
});

for (const [nombre, url, listo] of [
  ['carta', 'http://app.test/carta.html?s=s1', '.carta-item'],
  ['pedido', 'http://app.test/pedido.html?id=p1', '.total-usd'],
]) {
  test(`${nombre}: sin supabase-js, sin websocket y con la fuente de iconos recortada`, async ({ page }) => {
    const pedidas = [];
    let bytes = 0;
    page.on('response', async r => {
      if (!r.url().startsWith('http://app.test/')) return;
      pedidas.push(r.url());
      try { bytes += (await r.body()).length; } catch (e) {}
    });
    const sockets = [];
    page.on('websocket', ws => sockets.push(ws.url()));
    await page.goto(url);
    await expect(page.locator(listo).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(pedidas.filter(u => /supabase-.*\.js/.test(u))).toEqual([]);
    expect(pedidas.filter(u => /tabler-icons/.test(u))).toEqual([]);
    expect(sockets).toEqual([]);
    // Todo lo propio (HTML, JS, CSS, fuente) sin comprimir: antes ~1,4 MB
    expect(bytes).toBeLessThan(200 * 1024);
  });
}
