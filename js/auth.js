// ==========================================================
// Sesión: acceso, registro, perfil y pantallas de entrada
// ==========================================================

function showErr(msg){const el=$('auth-error');el.textContent=msg;el.style.display='flex';}
function hideErr(){$('auth-error').style.display='none';}

function showLogin(){mostrar('form-login');mostrar('form-register',false);$('auth-subtitle').textContent='Inicia sesión para continuar';hideErr();}
function showRegister(){mostrar('form-login',false);mostrar('form-register');$('auth-subtitle').textContent='Crear cuenta de empleado';hideErr();}

async function doLogin(){
  hideErr();
  const email=$('login-email').value.trim();
  const pass=$('login-pass').value;
  if(!email||!pass){showErr('Completa todos los campos');return;}
  const{error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error)showErr(error.message==='Invalid login credentials'?'Correo o contraseña incorrectos':error.message);
}
async function doRegister(){
  hideErr();
  const nombre=$('reg-nombre').value.trim();
  const email=$('reg-email').value.trim();
  const pass=$('reg-pass').value;
  if(!nombre||!email||!pass){showErr('Completa todos los campos');return;}
  if(pass.length<6){showErr('La contraseña debe tener al menos 6 caracteres');return;}
  const{data,error}=await sb.auth.signUp({email,password:pass,options:{data:{nombre}}});
  if(error){showErr(error.message);return;}
  if(data.user){
    await sb.from('perfiles').upsert({id:data.user.id,nombre,rol:'empleado',sucursal_id:null});
    showToast('Cuenta creada. Espera activación del dueño.');
    showLogin();
  }
}
async function doLogout(){if(user)localStorage.removeItem('perfil_cache_'+user.id);await sb.auth.signOut();user=null;perfil=null;sucursalActual=null;showAuthScreen();}

// ---- ACTIVACIÓN ----
async function checkActivation(){
  const{data:p}=await sb.from('perfiles').select('*,sucursales(*)').eq('id',user.id).single();
  if(p&&p.sucursal_id){
    perfil=p;sucursalActual=p.sucursales;
    await launchApp();
  } else {
    showToast('Aún pendiente. Contacta al dueño.','danger');
  }
}

// ---- PANTALLAS ----
function mostrarPantalla(id){
  ['loading-screen','auth-screen','wait-screen','app'].forEach(p=>mostrar(p,p===id,'flex'));
}
function showLoadingScreen(){mostrarPantalla('loading-screen');}
function showAuthScreen(){mostrarPantalla('auth-screen');}
function showWaitScreen(){mostrarPantalla('wait-screen');$('wait-email').textContent=user?.email||'';}
function showApp(){mostrarPantalla('app');}

// ---- PERFIL ----
async function initApp(u){
  user=u;
  try{
    // Usar caché para carga rápida
    const cached=localStorage.getItem('perfil_cache_'+u.id);
    if(cached){
      perfil=JSON.parse(cached);
      if(perfil.sucursal_id){
        await launchApp();
        refreshPerfilCache(u);
        return;
      }
    }
    await refreshPerfilCache(u);
  }catch(err){
    console.error('initApp error:',err);
    const cached=localStorage.getItem('perfil_cache_'+u.id);
    if(cached){perfil=JSON.parse(cached);if(perfil.sucursal_id){await launchApp();return;}}
    showAuthScreen();
  }
}

async function refreshPerfilCache(u){
  try{
    const token=await getToken();
    const p = await supaFetch('perfiles?select=id,nombre,rol,sucursal_id&id=eq.'+u.id, token);
    if(!p){
      await rest('perfiles',{method:'POST',prefer:'resolution=merge-duplicates',
        body:{id:u.id,nombre:u.user_metadata?.nombre||u.email,rol:'empleado',sucursal_id:null}});
      showWaitScreen();return;
    }
    perfil=p;
    if(!perfil.sucursal_id){showWaitScreen();return;}
    const suc = await supaFetch('sucursales?select=id,nombre,ciudad,logo_url,app_nombre&id=eq.'+perfil.sucursal_id, token);
    perfil.sucursales=suc||{id:perfil.sucursal_id,nombre:'Mi sucursal'};
    localStorage.setItem('perfil_cache_'+u.id,JSON.stringify(perfil));
    if(!sucursalActual){await launchApp();}
  }catch(err){
    console.error('refreshPerfilCache error:',err);
  }
}

// Pone el nombre y el logo del negocio en la cabecera
function aplicarMarca(nombre,logoUrl){
  if(nombre){document.title=nombre;$('app-titulo').textContent=nombre;}
  if(logoUrl){
    const logoImg=document.createElement('img');
    logoImg.src=logoUrl;logoImg.alt='';
    logoImg.onerror=()=>{$('app-logo').innerHTML='<img src="icon.svg" alt="">';};
    $('app-logo').innerHTML='';
    $('app-logo').appendChild(logoImg);
  }
}

async function launchApp(){
  sucursalActual=perfil.sucursales||{id:perfil.sucursal_id,nombre:'Mi sucursal'};
  // Aplicar nombre y logo personalizados
  aplicarMarca(sucursalActual?.app_nombre||sucursalActual?.nombre||'LicorApp',sucursalActual?.logo_url);
  $('sucursal-badge').textContent=sucursalActual?.nombre||'';
  $('gnav-admin').style.display=perfil.rol==='dueno'?'flex':'none';
  applyDark();setMoneda(moneda);
  $('tasa-input').value=tasaBCV;
  if($('tasa-eur-input'))$('tasa-eur-input').value=tasaEUR;
  showApp();
  pedirPermisoNotif();
  await loadMenu();await renderPedidos();
  fetchBCV();setInterval(fetchBCV,30*60*1000);
  iniciarSolicitudes();
}
