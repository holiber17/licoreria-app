<script>
  import { e } from '../lib/estado.svelte.js';
  import { checkActivation, doLogout } from './sesion.svelte.js';
</script>

<div id="wait-screen" class="wait-wrap" style="display:flex">
  <div class="wait-icon"><i class="ti ti-hourglass"></i></div>
  <div class="wait-title">Cuenta creada</div>
  <div class="wait-sub">Tu cuenta está pendiente de activación. El dueño de la licorería debe asignarte una sucursal para que puedas acceder.</div>
  <div class="wait-badge"><i class="ti ti-clock"></i> Esperando activación</div>
  <div class="t-mini mt-s">Registrado como: <strong>{e.user?.email || ''}</strong></div>
  <div class="fila mt-m">
    <button class="btn sm" onclick={checkActivation}><i class="ti ti-refresh"></i> Verificar activación</button>
    <button class="btn sm ghost" onclick={doLogout}><i class="ti ti-logout"></i> Cerrar sesión</button>
  </div>
</div>
