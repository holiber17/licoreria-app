<script>
  import Hoja from '../../ui/Hoja.svelte';
  let { abierto, alCerrar, pedidoId } = $props();
  const url = $derived(new URL('pedido.html?id=' + pedidoId, location.href).href);
</script>

<Hoja id="qr-modal" {abierto} {alCerrar} centro titulo="QR del pedido">
  <p class="t-sub mt-s mb-m">El cliente escanea este código para ver su consumo en vivo</p>
  <div id="qr-container" class="qr-caja">
    {#if abierto}<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data={encodeURIComponent(url)}" alt="QR" />{/if}
  </div>
  <div id="qr-url" class="qr-url">{abierto ? url : ''}</div>
  <button class="btn full" onclick={alCerrar}><i class="ti ti-x"></i> Cerrar</button>
</Hoja>
