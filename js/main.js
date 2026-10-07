// ==========================================================
// Arranque: recupera la sesión guardada y escucha login/logout
// ==========================================================

applyDark();

async function boot(){
  const tokenKey = tokenKeyActual();
  if(tokenKey){
    try{
      const stored = JSON.parse(localStorage.getItem(tokenKey));
      const accessToken = stored?.access_token;
      if(accessToken){
        // Verificar token directamente con fetch sin usar el cliente de Supabase
        const res = await fetch(SUPA_URL+'/auth/v1/user',{
          headers:{'Authorization':'Bearer '+accessToken,'apikey':SUPA_KEY}
        });
        if(res.ok){
          const userData = await res.json();
          if(userData?.id){
            user = {id:userData.id, email:userData.email, user_metadata:userData.user_metadata||{}};
            showLoadingScreen();
            await initApp(user);
            return;
          }
        } else {
          // Token expirado: intentar refresh
          const refreshToken = stored?.refresh_token;
          if(refreshToken){
            const rres = await fetch(SUPA_URL+'/auth/v1/token?grant_type=refresh_token',{
              method:'POST',
              headers:{'Content-Type':'application/json','apikey':SUPA_KEY},
              body:JSON.stringify({refresh_token:refreshToken})
            });
            if(rres.ok){
              const rdata = await rres.json();
              if(rdata?.access_token){
                localStorage.setItem(tokenKey, JSON.stringify(rdata));
                user = {id:rdata.user.id, email:rdata.user.email, user_metadata:rdata.user.user_metadata||{}};
                showLoadingScreen();
                await initApp(user);
                return;
              }
            }
          }
        }
      }
    }catch(e){console.error('boot error:',e);}
  }
  showAuthScreen();
}

// Escuchar login/logout
sb.auth.onAuthStateChange(async(event,session)=>{
  if(event==='SIGNED_IN'&&session?.user){
    showLoadingScreen();
    await initApp(session.user);
  } else if(event==='SIGNED_OUT'){
    showAuthScreen();
  }
});

boot();
