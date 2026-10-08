// Pruebas de la app en un navegador real, con Supabase simulado
// (ver tests/apoyo/base-falsa.js). Se corren desde esta carpeta con:
//   npm ci && npx playwright install chromium && npm test
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
  },
});
