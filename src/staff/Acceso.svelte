<script>
  import { acceso, doLogin, doRegister, verLogin, verRegistro, verRecuperar, pedirEnlace, guardarClaveNueva } from './sesion.svelte.js';
  let email = $state(''), pass = $state(''), nombre = $state(''), regEmail = $state(''), regPass = $state('');
  let nueva = $state(''), repetir = $state('');
  const subtitulos = { login: 'Inicia sesión para continuar', registro: 'Crear cuenta de empleado', recuperar: 'Recuperar la contraseña', nueva: 'Pon tu contraseña nueva' };
</script>

<div id="auth-screen" class="auth-wrap" style="display:flex">
  <div class="auth-box">
    <img class="auth-logo" src="icon.svg" alt="LicorApp" />
    <div class="auth-title">LicorApp</div>
    <div class="auth-lema">Licorería · Bodegón</div>
    <div class="auth-sub">{subtitulos[acceso.modo]}</div>
    {#if acceso.error}<div id="auth-error" class="banner error" style="display:flex" role="alert">{acceso.error}</div>{/if}
    {#if acceso.aviso}<div id="auth-aviso" class="banner ok" style="display:flex" role="status">{acceso.aviso}</div>{/if}

    {#if acceso.modo === 'login'}
      <form id="form-login" onsubmit={ev => { ev.preventDefault(); doLogin(email.trim(), pass); }}>
        <div class="fg"><label for="login-email">Correo</label><input id="login-email" type="email" autocomplete="email" placeholder="tu@correo.com" bind:value={email} /></div>
        <div class="fg"><label for="login-pass">Contraseña</label><input id="login-pass" type="password" autocomplete="current-password" placeholder="••••••••" bind:value={pass} /></div>
        <button class="btn primary full grande" type="submit"><i class="ti ti-login"></i> Entrar</button>
        <button class="btn ghost full" type="button" id="btn-olvide" onclick={verRecuperar}>¿Olvidaste tu contraseña?</button>
        <div class="auth-sep">¿Eres nuevo?</div>
        <button class="btn full" type="button" onclick={verRegistro}><i class="ti ti-user-plus"></i> Crear cuenta nueva</button>
      </form>
    {:else if acceso.modo === 'recuperar'}
      <form id="form-recuperar" onsubmit={ev => { ev.preventDefault(); pedirEnlace(email.trim()); }}>
        <p class="t-sub mb-m">Escribe el correo de tu cuenta y te enviamos un enlace para poner una contraseña nueva.</p>
        <div class="fg"><label for="rec-email">Correo</label><input id="rec-email" type="email" autocomplete="email" placeholder="tu@correo.com" bind:value={email} /></div>
        <button class="btn primary full grande" type="submit" disabled={acceso.ocupado}><i class="ti ti-mail"></i> Enviarme el enlace</button>
        <div class="auth-sep">o</div>
        <button class="btn full" type="button" onclick={verLogin}><i class="ti ti-arrow-left"></i> Volver a entrar</button>
      </form>
    {:else if acceso.modo === 'nueva'}
      <form id="form-nueva" onsubmit={ev => { ev.preventDefault(); guardarClaveNueva(nueva, repetir); }}>
        <div class="fg"><label for="nueva-pass">Contraseña nueva</label><input id="nueva-pass" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres" bind:value={nueva} /></div>
        <div class="fg"><label for="nueva-pass2">Repítela</label><input id="nueva-pass2" type="password" autocomplete="new-password" placeholder="La misma otra vez" bind:value={repetir} /></div>
        <button class="btn primary full grande" type="submit" disabled={acceso.ocupado}><i class="ti ti-check"></i> Guardar y entrar</button>
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
