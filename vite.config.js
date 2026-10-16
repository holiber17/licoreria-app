import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Tres páginas: la app del personal (index), la carta pública y el pedido del cliente (QR)
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { index: 'index.html', carta: 'carta.html', pedido: 'pedido.html' } },
  },
});
