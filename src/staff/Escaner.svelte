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
      // Sin cámara (permiso negado, sin HTTPS, otro uso) queda el código escrito a mano
      detener();
      estado = 'No se pudo usar la cámara. Escribe el código:';
      manual = true;
    }
  }
  function reintentar() { manual = false; texto = ''; estado = 'Iniciando cámara...'; iniciar(); }

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
    {#if manual}
      <!-- svelte-ignore a11y_autofocus -->
      <input id="scanner-manual" placeholder="Código de barra..." inputmode="numeric" autofocus bind:value={texto} onkeydown={enviar} />
      <div class="grupo-btn mt-s">
        <button class="btn-claro" onclick={() => texto.trim() && (detener(), alCodigo(texto.trim()))}>Usar este código</button>
        <button class="btn-claro" onclick={reintentar}>Reintentar cámara</button>
      </div>
    {:else}
      <button class="btn-claro mt-s" id="scanner-escribir" onclick={() => { detener(); manual = true; estado = 'Escribe el código:'; }}>Escribir el código</button>
    {/if}
  </div>
</div>
