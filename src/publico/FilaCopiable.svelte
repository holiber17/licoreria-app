<script>
  import { copiarTexto } from '../lib/catalogo.js';
  // Dato de pago con botón para copiar
  let { etiqueta, valor } = $props();
  let copiado = $state(false);
  async function copiar() {
    await copiarTexto(valor);
    copiado = true;
    setTimeout(() => (copiado = false), 1500);
  }
</script>

<div class="dato-pago">
  <div class="crece"><div class="t-mini">{etiqueta}</div><div class="t-fuerte">{valor}</div></div>
  <button class="btn sm ico" class:copiado onclick={copiar} aria-label="Copiar {etiqueta}"><i class="ti {copiado ? 'ti-check' : 'ti-copy'}"></i></button>
</div>
