// ==========================================================
// Acceso a Supabase (REST directo con el token de la sesión)
// ==========================================================

function tokenKeyActual(){return Object.keys(localStorage).find(k=>k.includes('auth-token')||k.includes('supabase'));}

async function getToken(){
  const stored=JSON.parse(localStorage.getItem(tokenKeyActual())||'{}');
  return stored?.access_token||SUPA_KEY;
}

// Petición genérica a /rest/v1. `prefer` va en la cabecera Prefer.
async function rest(path,{method='GET',body,prefer}={}){
  const token=await getToken();
  const headers={'Authorization':'Bearer '+token,'apikey':SUPA_KEY,'Accept':'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(prefer)headers['Prefer']=prefer;
  return fetch(SUPA_URL+'/rest/v1/'+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
}

// GET que devuelve siempre una lista (vacía si falla)
async function restGet(path){
  try{const r=await rest(path);return r.ok?await r.json():[];}catch(e){return[];}
}
function restInsert(tabla,datos,prefer='return=minimal'){return rest(tabla,{method:'POST',body:datos,prefer});}
function restPatch(tabla,id,datos){return rest(tabla+'?id=eq.'+id,{method:'PATCH',body:datos,prefer:'return=minimal'});}
function restDelete(tabla,id){return rest(tabla+'?id=eq.'+id,{method:'DELETE'});}
// Compatibilidad con el nombre anterior
const sbPatch=restPatch;

// GET con un token explícito; devuelve la primera fila o null
async function supaFetch(path, token){
  const res = await fetch(SUPA_URL+'/rest/v1/'+path,{
    headers:{'Authorization':'Bearer '+token,'apikey':SUPA_KEY,'Accept':'application/json'}
  });
  if(!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data)?data[0]:data;
}

// Ítems de una lista de pedidos (para rankings)
async function itemsDePedidos(pedidoIds){
  if(!pedidoIds.length)return[];
  return restGet('pedido_items?select=*&pedido_id=in.('+pedidoIds.join(',')+')');
}
