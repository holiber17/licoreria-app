<script>
  import { acceso, doLogin, doRegister, verLogin, verRegistro } from './sesion.svelte.js';
  let email = $state(''), pass = $state(''), nombre = $state(''), regEmail = $state(''), regPass = $state('');
</script>

<div id="auth-screen" class="auth-wrap" style="display:flex">
  <div class="auth-box">
    <img class="auth-logo" src="icon.svg" alt="LicorApp" />
    <div class="auth-title">LicorApp</div>
    <div class="auth-lema">Licorería · Bodegón</div>
    <div class="auth-sub">{acceso.modo === 'login' ? 'Inicia sesión para continuar' : 'Crear cuenta de empleado'}</div>
    {#if acceso.error}<div id="auth-error" class="banner error" style="display:flex">{acceso.error}</div>{/if}

    {#if acceso.modo === 'login'}
      <form id="form-login" onsubmit={ev => { ev.preventDefault(); doLogin(email.trim(), pass); }}>
        <div class="fg"><label for="login-email">Correo</label><input id="login-email" type="email" autocomplete="email" placeholder="tu@correo.com" bind:value={email} /></div>
        <div class="fg"><label for="login-pass">Contraseña</label><input id="login-pass" type="password" autocomplete="current-password" placeholder="••••••••" bind:value={pass} /></div>
        <button class="btn primary full grande" type="submit"><i class="ti ti-login"></i> Entrar</button>
        <div class="auth-sep">¿Eres nuevo?</div>
        <button class="btn full" type="button" onclick={verRegistro}><i class="ti ti-user-plus"></i> Crear cuenta nueva</button>
      </form>
    {:else}
      <form id="form-register" onsubmit={ev => { ev.preventDefault(); doRegister(nombre.trim(), regEmail.trim(), regPass); }}>
        <div class="fg"><label for="reg-nombre">Nombre</label><input id="reg-nombre" autocomplete="name" placeholder="Tu nombre completo" bind:value={nombre} /></div>
        <div class="fg"><label for="reg-email">Correo</label><input id="reg-email" type="email" autocomplete="email" placeholder="tu@correo.com" bind:value={regEmail} /></div>
        <div class="fg"><label for="reg-pass">Contraseña</label><input id="reg-pass" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres" bind:value={regPass} /></div>
        <button class="btn primary full grande" type="submit"><i class="ti ti-check"></i> Registrarse</button>
        <div class="auth-sep">o</div>
        <button class="btn full" type="button" onclick={verLogin}><i class="ti ti-arrow-left"></i> Ya tengo cuenta</button>
      </form>
    {/if}
    <div class="auth-pie">Punto de venta · Inventario · Reportes</div>
  </div>
</div>
