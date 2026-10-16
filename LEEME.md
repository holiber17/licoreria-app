# LicorApp

Punto de venta, inventario y reportes para licorerías y bodegones. Svelte 5 + Vite, Supabase como base de datos.

- `index.html` → app del personal (`src/staff/`)
- `carta.html` → carta pública (`src/publico/Carta.svelte`)
- `pedido.html` → pedido en vivo del cliente, por QR (`src/publico/PedidoCliente.svelte`)
- `src/lib/` lógica común · `src/ui/` piezas de interfaz · `src/css/` estilos · `supabase/` SQL

```
npm install
npm run dev      # desarrollo
npm run build    # genera dist/ (Netlify publica esa carpeta, ver netlify.toml)
```

Pruebas en navegador (Supabase simulado): compilar primero y luego `cd pruebas && npm ci && npx playwright install chromium && npm test`.
