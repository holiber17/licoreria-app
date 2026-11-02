// ==========================================================
// Base de datos falsa para las pruebas.
// Simula Supabase (REST + funciones RPC) en memoria y con estado,
// así las pruebas nunca tocan la base real. También sirve los
// archivos de la app desde el disco en http://app.test/.
// ==========================================================
const fs = require('fs');
const path = require('path');

// La app compilada (npm run build en la raíz deja todo en dist/)
const RAIZ = process.env.LICOR_RAIZ || path.resolve(__dirname, '..', '..', '..', 'dist');

const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

function datosIniciales() {
  return {
    sucursales: [{
      id: 's1', nombre: 'Sucursal Centro', ciudad: 'Caracas', direccion: 'Av. Urdaneta', app_nombre: 'La Bodeguita', negocio_id: 'n1',
      datos_pago: { pago_movil: { banco: 'Banesco (0134)', telefono: '0414-5550101', cedula: 'V-12345678' }, zelle: { correo: 'pagos@labodeguita.com', titular: 'Ana Pérez' } }
    }],
    negocios: [{ id: 'n1', nombre: 'La Bodeguita' }],
    perfiles: [{ id: 'u2', nombre: 'Pedro Barra', rol: 'empleado', sucursal_id: 's1' }, { id: 'u3', nombre: 'Nuevo Ingreso', rol: 'empleado', sucursal_id: null }],
    menu: [
      { id: 'm1', sucursal_id: 's1', nombre: 'Combo Polar x12', tipo: 'combo', precio_usd: 1.2, unidad: 'lata', categoria: 'Cerveza', unidades_combo: 12, activo: true },
      { id: 'm2', sucursal_id: 's1', nombre: 'Ron Cacique 500 años', tipo: 'suelto', precio_usd: 28, unidad: 'botella', categoria: 'Ron', unidades_combo: 1, activo: true },
      { id: 'm3', sucursal_id: 's1', nombre: "Whisky Buchanan's 12", tipo: 'suelto', precio_usd: 42, unidad: 'botella', categoria: 'Whisky', unidades_combo: 1, activo: true },
      { id: 'm5', sucursal_id: 's1', nombre: 'Coca-Cola 2L', tipo: 'suelto', precio_usd: 2.5, unidad: 'botella', categoria: 'Mezcladores', unidades_combo: 1, activo: true },
      { id: 'm7', sucursal_id: 's1', nombre: 'Hielo', tipo: 'suelto', precio_usd: 1, unidad: 'bolsa', categoria: 'Mezcladores', unidades_combo: 1, activo: true },
    ],
    pedidos: [], pedido_items: [], caja: [], solicitudes: [], clientes: [],
    inventario: [{ id: 'v1', sucursal_id: 's1', menu_id: 'm2', nombre: 'Ron Cacique 500 años', stock_actual: 10, stock_minimo: 3, unidad: 'botella' }],
    tasas_bcv: [], inventario_movimientos: [], pedido_ajustes: [], turnos: []
  };
}

class BaseFalsa {
  constructor() { this.db = datosIniciales(); this.llamadas = []; this.auth = []; this.n = 100; }
  id(p) { return p + (this.n++); }
  // Última tasa guardada de la sucursal (como privado.tasa_vigente)
  tasaVigente(suc) {
    const t = this.db.tasas_bcv.filter(x => x.sucursal_id === suc && x.tasa > 0);
    return t.length ? t[t.length - 1].tasa : null;
  }

  filtrar(filas, sp) {
    for (const [k, v] of sp.entries()) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      // is.null / not.is.null (turnos abiertos o cerrados)
      if (v === 'is.null') { filas = filas.filter(r => r[k] == null); continue; }
      if (v === 'not.is.null') { filas = filas.filter(r => r[k] != null); continue; }
      const m = /^(eq|gte|in)\.(.*)$/.exec(v); if (!m) continue;
      const [, op, val] = m;
      filas = filas.filter(r => op === 'eq' ? String(r[k]) === val
        : op === 'gte' ? String(r[k]) >= val
        : val.replace(/[()]/g, '').split(',').includes(String(r[k])));
    }
    return filas;
  }

  embeber(t, filas, sel) {
    return filas.map(r => {
      const o = { ...r };
      if (t === 'pedidos' && sel.includes('pedido_items')) o.pedido_items = this.db.pedido_items.filter(i => i.pedido_id === r.id);
      if (t === 'solicitudes' && sel.includes('pedidos(')) { const p = this.db.pedidos.find(x => x.id === r.pedido_id); o.pedidos = p ? { cliente_nombre: p.cliente_nombre, mesa: p.mesa ?? null, estado: p.estado } : null; }
      return o;
    });
  }

  rpc(fn, b) {
    const db = this.db;
    // Funciones públicas (supabase/acceso_publico.sql)
    if (fn === 'pedido_publico') {
      const p = db.pedidos.find(x => x.id === b.p);
      if (!p) return { json: null };
      const { nota, usuario_id, cliente_id, ...pub } = p;
      return { json: { mesa: null, ...pub, tasa_actual: this.tasaVigente(p.sucursal_id), pedido_items: db.pedido_items.filter(i => i.pedido_id === p.id) } };
    }
    if (fn === 'avisos_de_pedido') {
      return { json: db.solicitudes.filter(s => s.pedido_id === b.p).slice().reverse().slice(0, 10).map(({ id, tipo, estado, created_at, atendida_at }) => ({ id, tipo, estado, created_at, atendida_at })) };
    }
    if (fn === 'sucursal_publica') {
      const s = db.sucursales.find(x => x.id === b.p);
      return { json: s ? { id: s.id, nombre: s.nombre, app_nombre: s.app_nombre, logo_url: s.logo_url, ciudad: s.ciudad, direccion: s.direccion, datos_pago: s.datos_pago, tasa_actual: this.tasaVigente(s.id) } : null };
    }
    if (fn === 'crear_solicitud') {
      const p = db.pedidos.find(x => x.id === b.p_pedido && x.estado === 'abierto');
      if (!p) return { status: 400, json: { message: 'Este pedido ya no está abierto' } };
      if (db.solicitudes.some(s => s.pedido_id === p.id && s.tipo === b.p_tipo && s.estado === 'pendiente')) return { status: 400, json: { message: 'Ya avisamos al personal' } };
      const s = { id: this.id('s'), sucursal_id: p.sucursal_id, pedido_id: p.id, tipo: b.p_tipo, metodo: b.p_metodo, referencia: b.p_referencia, estado: 'pendiente', created_at: new Date().toISOString() };
      db.solicitudes.push(s);
      return { json: s.id };
    }
    if (fn === 'agregar_al_pedido') {
      const p = db.pedidos.find(x => x.id === b.p_pedido);
      if (!p || p.estado !== 'abierto') return { status: 400, json: { message: 'Este pedido ya está cerrado' } };
      const out = [];
      for (const { menu_id, cantidad: n } of b.p_items) {
        if (!(n >= 1)) return { status: 400, json: { message: 'Cantidad inválida' } };
        const m = db.menu.find(x => x.id === menu_id);
        let it = db.pedido_items.find(i => i.pedido_id === p.id && i.menu_id === m.id);
        if (m.tipo === 'combo') {
          if (it) it.total += m.unidades_combo * n;
          else db.pedido_items.push(it = { id: this.id('i'), pedido_id: p.id, menu_id: m.id, nombre: m.nombre, tipo: 'combo', total: m.unidades_combo * n, consumido: 0, precio_usd: m.precio_usd, unidad: m.unidad });
        } else if (it) { it.consumido += n; it.total = it.consumido; }
        else db.pedido_items.push(it = { id: this.id('i'), pedido_id: p.id, menu_id: m.id, nombre: m.nombre, tipo: m.tipo, total: n, consumido: n, precio_usd: m.precio_usd, unidad: m.unidad });
        out.push({ ...it });
      }
      return { json: out };
    }
    // supabase/dinero.sql: servir y sumar unidades con sumas en la base
    if (fn === 'servir') {
      const it = db.pedido_items.find(i => i.id === b.p_item);
      const p = it && db.pedidos.find(x => x.id === it.pedido_id);
      const n = it ? it.consumido + b.p_delta : -1;
      if (!it || p.estado !== 'abierto' || n < 0 || (it.tipo !== 'suelto' && n > it.total)) return { status: 400, json: { message: 'No se pudo servir: el pedido cambió o ya no está abierto' } };
      it.consumido = n; if (it.tipo === 'suelto') it.total = n;
      return { json: { ...it } };
    }
    if (fn === 'sumar_unidades') {
      const it = db.pedido_items.find(i => i.id === b.p_item);
      if (!it || !(b.p_unidades >= 1)) return { status: 400, json: { message: 'Cantidad inválida' } };
      it.total += b.p_unidades;
      return { json: { ...it } };
    }
    if (fn === 'cobrar_pedido') {
      const p = db.pedidos.find(x => x.id === b.p_pedido);
      if (!p || p.estado !== 'abierto') return { status: 400, json: { message: 'Este pedido ya fue cobrado o cancelado' } };
      const its = db.pedido_items.filter(i => i.pedido_id === p.id && i.consumido > 0);
      if (!its.length) return { status: 400, json: { message: 'No hay nada consumido aún' } };
      // La tasa del día de la sucursal manda; si no hay, la del teléfono (> 0); si no, no cobra
      const tasa = this.tasaVigente(p.sucursal_id) || (b.p_tasa > 0 ? b.p_tasa : null);
      if (!tasa) return { status: 400, json: { message: 'No hay tasa BCV del día. El dueño debe ponerla a mano antes de cobrar.' } };
      const total = Math.round(its.reduce((s, i) => s + i.consumido * i.precio_usd, 0) * 100) / 100;
      p.estado = 'cobrado'; p.tasa_bcv = tasa;
      const turno = db.turnos.find(t => t.sucursal_id === p.sucursal_id && !t.cerrado_at);
      db.caja.push({ id: this.id('c'), sucursal_id: p.sucursal_id, pedido_id: p.id, cliente_nombre: p.cliente_nombre, total_usd: total, tasa_bcv: tasa, metodo_pago: b.p_metodo, nota: b.p_nota || null, fecha: new Date().toISOString(), turno_id: turno ? turno.id : null });
      return { json: { caja_id: 'c', total_usd: total, tasa_bcv: tasa, turno_id: turno ? turno.id : null } };
    }
    // supabase/turnos.sql: abrir y cerrar turno (misma cuenta que la base)
    if (fn === 'abrir_turno') {
      if (db.turnos.some(t => t.sucursal_id === b.p_sucursal && !t.cerrado_at)) return { status: 400, json: { message: 'Ya hay un turno abierto en esta sucursal' } };
      const t = { id: this.id('t'), sucursal_id: b.p_sucursal, abierto_por: 'u2', abierto_at: new Date().toISOString(), fondo_usd: b.p_fondo_usd || 0, fondo_bs: b.p_fondo_bs || 0, cerrado_at: null };
      db.turnos.push(t);
      return { json: { ...t } };
    }
    if (fn === 'cerrar_turno') {
      const t = db.turnos.find(x => x.id === b.p_turno);
      if (!t || t.cerrado_at) return { status: 400, json: { message: 'Este turno ya está cerrado' } };
      const esp = {};
      db.caja.filter(c => c.turno_id === t.id).forEach(c => {
        const k = c.metodo_pago || 'Efectivo';
        (esp[k] ||= { usd: 0, bs: 0, pedidos: 0 }); esp[k].usd += c.total_usd; esp[k].bs += c.total_usd * c.tasa_bcv; esp[k].pedidos++;
      });
      const tasa = this.tasaVigente(t.sucursal_id), c = b.p_contado, g = (m, f) => (esp[m] ? esp[m][f] : 0);
      let dif = (c.efectivo_usd + c.efectivo_bs / tasa) - (g('Efectivo', 'usd') + t.fondo_usd + t.fondo_bs / tasa);
      dif += (c.pago_movil_bs - g('Pago móvil', 'bs')) / tasa + (c.transferencia_bs - g('Transferencia', 'bs')) / tasa + c.zelle_usd - g('Zelle', 'usd');
      Object.assign(t, { cerrado_at: new Date().toISOString(), esperado: esp, contado: c, diferencia_usd: Math.round(dif * 100) / 100, tasa_cierre: tasa, nota: b.p_nota });
      return { json: { ...t } };
    }
    if (fn === 'mover_stock') {
      const inv = db.inventario.find(i => i.id === b.p_inventario);
      inv.stock_actual = b.p_tipo === 'entrada' ? inv.stock_actual + b.p_cantidad : b.p_tipo === 'salida' ? Math.max(0, inv.stock_actual - b.p_cantidad) : b.p_cantidad;
      return { json: inv.stock_actual };
    }
    return { json: null };
  }

  responder(req) {
    const u = new URL(req.url());
    const t = u.pathname.replace('/rest/v1/', '');
    const sp = u.searchParams;
    const unico = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const metodo = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    this.llamadas.push({ metodo, tabla: t, body });
    // Fallas simuladas: base.fallar = { leer: ['caja'], escribir: ['menu'], rpc: { cobrar_pedido: {status, message} } }
    const f = this.fallar || {};
    if (t.startsWith('rpc/') && f.rpc && f.rpc[t.slice(4)]) { const e = f.rpc[t.slice(4)]; return { status: e.status || 400, json: { message: e.message } }; }
    if (metodo === 'GET' && (f.leer || []).includes(t)) return { status: 500, json: { message: 'falla simulada' } };
    if (metodo !== 'GET' && (f.escribir || []).includes(t)) return { status: 401, json: { message: 'falla simulada' } };
    if (t.startsWith('rpc/')) return this.rpc(t.slice(4), body);
    const db = this.db;
    if (!db[t]) return { json: unico ? {} : [] };
    if (metodo === 'GET') {
      let filas = this.embeber(t, this.filtrar(db[t], sp), sp.get('select') || '');
      if ((sp.get('order') || '').includes('created_at.desc')) filas = filas.slice().reverse();
      return { json: unico ? filas[0] : filas };
    }
    if (metodo === 'POST') {
      const filas = (Array.isArray(body) ? body : [body]).map(x => ({ id: this.id(t[0]), created_at: new Date().toISOString(), ...x }));
      if (t === 'solicitudes') filas.forEach(f => { f.estado = 'pendiente'; });
      db[t].push(...filas);
      return { status: 201, json: unico ? filas[0] : filas };
    }
    if (metodo === 'PATCH') {
      const filas = this.filtrar(db[t], sp); filas.forEach(r => Object.assign(r, body));
      return { json: unico ? filas[0] : filas };
    }
    if (metodo === 'DELETE') {
      const ids = new Set(this.filtrar(db[t], sp).map(r => r.id));
      db[t] = db[t].filter(r => !ids.has(r.id));
      return { status: 204 };
    }
    return { json: [] };
  }

  rpcs(nombre) { return this.llamadas.filter(l => l.tabla === 'rpc/' + nombre); }
}

// Conecta un contexto del navegador a la base falsa
async function conectar(context, base) {
  // El tiempo real (websocket) no se conecta: la app usa su respaldo por consulta
  await context.routeWebSocket(/supabase\.co/, () => {});
  await context.route('**/*', async route => {
    const req = route.request(); const url = req.url();
    if (url.startsWith('http://app.test/')) {
      const f = path.join(RAIZ, decodeURIComponent(new URL(url).pathname));
      if (!f.startsWith(RAIZ) || !fs.existsSync(f)) return route.fulfill({ status: 404 });
      return route.fulfill({ body: fs.readFileSync(f), contentType: TIPOS[path.extname(f)] || 'application/octet-stream' });
    }
    // Tipografías y códigos QR vienen de internet; si no hay red, la prueba sigue sin ellos
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('api.qrserver.com')) {
      return route.continue().catch(() => route.abort());
    }
    // Recuperar contraseña: pedir el enlace y guardar la nueva (se anotan en base.auth)
    if (url.includes('/auth/v1/recover')) { base.auth.push({ tipo: 'recover', body: JSON.parse(req.postData() || '{}'), url }); return route.fulfill({ json: {} }); }
    if (url.includes('/auth/v1/user') && req.method() === 'PUT') { base.auth.push({ tipo: 'clave', body: JSON.parse(req.postData() || '{}') }); return route.fulfill({ json: { id: 'u2', email: 'pedro@bodeguita.com', user_metadata: {} } }); }
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: 'u2', email: 'pedro@bodeguita.com', user_metadata: {} } });
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 400, json: {} });
    if (url.includes('supabase.co/rest/v1/')) {
      const r = base.responder(req);
      if (r.status === 204) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: r.status || 200, json: r.json });
    }
    // base.sinDolarapi: dolarapi caído
    if (url.includes('dolarapi.com') && base.sinDolarapi) return route.fulfill({ status: 503, body: '' });
    if (url.includes('dolarapi.com/v1/dolares/oficial')) return route.fulfill({ json: { promedio: 187.35, fechaActualizacion: new Date().toISOString() } });
    if (url.includes('dolarapi.com/v1/cotizaciones')) return route.fulfill({ json: [{ moneda: 'EUR', promedio: 215.8 }] });
    return route.fulfill({ status: 404, body: '' });
  });
}

// Sesión de un empleado ya iniciada
async function sesionEmpleado(page) {
  await page.addInitScript(() => {
    localStorage.setItem('sb-ysnsmsfeqbnezjgxkkui-auth-token', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u2' } }));
    localStorage.setItem('perfil_cache_u2', JSON.stringify({ id: 'u2', nombre: 'Pedro Barra', rol: 'empleado', sucursal_id: 's1', sucursales: { id: 's1', nombre: 'Sucursal Centro', app_nombre: 'La Bodeguita' } }));
  });
}

// Sesión del dueño (mismo usuario, con rol de dueño en la base y en la caché)
async function sesionDueno(page, base) {
  base.db.perfiles[0].rol = 'dueno';
  await page.addInitScript(() => {
    localStorage.setItem('sb-ysnsmsfeqbnezjgxkkui-auth-token', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u2' } }));
    localStorage.setItem('perfil_cache_u2', JSON.stringify({ id: 'u2', nombre: 'Pedro Barra', rol: 'dueno', sucursal_id: 's1', sucursales: { id: 's1', nombre: 'Sucursal Centro', app_nombre: 'La Bodeguita' } }));
  });
}

// Sesión del sudo (ve todos los negocios: supabase/negocios.sql)
async function sesionSudo(page, base) {
  base.db.perfiles[0].rol = 'sudo';
  await page.addInitScript(() => {
    localStorage.setItem('sb-ysnsmsfeqbnezjgxkkui-auth-token', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u2' } }));
    localStorage.setItem('perfil_cache_u2', JSON.stringify({ id: 'u2', nombre: 'Pedro Barra', rol: 'sudo', sucursal_id: 's1', sucursales: { id: 's1', nombre: 'Sucursal Centro', app_nombre: 'La Bodeguita', negocio_id: 'n1' } }));
  });
}

// Errores de JavaScript de la página (para afirmar que no hubo ninguno)
function vigilarErrores(page) {
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  return errores;
}

module.exports = { BaseFalsa, conectar, sesionEmpleado, sesionDueno, sesionSudo, vigilarErrores };
