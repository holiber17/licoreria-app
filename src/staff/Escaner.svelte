<script>
  import { onMount } from 'svelte';
  // Escáner de códigos de barras con la cámara (BarcodeDetector) o código escrito a mano
  let { alCodigo, alCerrar } = $props();
  let video = $state();
  let estado = $state('Iniciando cámara...');
  let manual = $state(false);
  let texto = $state('');
  let stream = null, intervalo = null;

  onMount(() => {
    iniciar();
    return detener;
  });

  function detener() {
    if (intervalo) { clearInterval(intervalo); intervalo = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  async function iniciar() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      estado = 'Apunta la cámara al código de barra';
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
        intervalo = setInterval(async () => {
          try {
            const codigos = await detector.detect(video);
            if (codigos.length) { detener(); alCodigo(codigos[0].rawValue); }
          } catch (err) {}
        }, 500);
      } else {
        estado = 'Tu navegador no soporta escáner automático. Ingresa el código manualmente:';
        manual = true;
      }
    } catch (err) {
      estado = 'No se pudo acceder a la cámara. Permite el acceso e intenta de nuevo.';
    }
  }

  function enviar(ev) {
    if (ev.key === 'Enter' && texto.trim()) { detener(); alCodigo(texto.trim()); }
  }
</script>

<div id="scanner-modal" class="scanner open">
  <div class="scanner-cab">
    <span>Escanear código de barra</span>
    <button class="btn-claro" onclick={() => { detener(); alCerrar(); }}>Cerrar</button>
  </div>
  <video id="scanner-video" playsinline muted bind:this={video}></video>
  <div class="scanner-estado" id="scanner-status">
    {estado}
    {#if manual}<input placeholder="Código de barra..." inputmode="numeric" bind:value={texto} onkeydown={enviar} />{/if}
  </div>
</div>
