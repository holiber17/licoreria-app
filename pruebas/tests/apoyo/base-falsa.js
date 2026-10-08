// ==========================================================
// Base de datos falsa para las pruebas.
// Simula Supabase (REST + funciones RPC) en memoria y con estado,
// así las pruebas nunca tocan la base real. También sirve los
// archivos de la app desde el disco en http://app.test/.
// ==========================================================
const fs = require('fs');
const path = require('path');

// Raíz de la app (pruebas/tests/apoyo → ../../..)
const RAIZ = path.resolve(__dirname, '..', '..', '..');
// Copia local de las librerías del CDN (opcional, para entornos sin internet)
const DEPS = process.env.LICOR_DEPS || '';

const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

function datosIniciales() {
  return {
    sucursales: [{
      id: 's1', nombre: 'Sucursal Centro', ciudad: 'Caracas', direccion: 'Av. Urdaneta', app_nombre: 'La Bodeguita',
      datos_pago: { pago_movil: { banco: 'Banesco (0134)', telefono: '0414-5550101', cedula: 'V-12345678' }, zelle: { correo: 'pagos@labodeguita.com', titular: 'Ana Pérez' } }
    }],
    perfiles: [{ id: 'u2', nombre: 'Pedro Barra', rol: 'empleado', sucursal_id: 's1' }],
    menu: [
      { id: 'm1', sucursal_id: 's1', nombre: 'Combo Polar x12', tipo: 'combo', precio_usd: 1.2, unidad: 'lata', categoria: 'Cerveza', unidades_combo: 12, activo: true },
      { id: 'm2', sucursal_id: 's1', nombre: 'Ron Cacique 500 años', tipo: 'suelto', precio_usd: 28, unidad: 'botella', categoria: 'Ron', unidades_combo: 1, activo: true },
      { id: 'm3', sucursal_id: 's1', nombre: "Whisky Buchanan's 12", tipo: 'suelto', precio_usd: 42, unidad: 'botella', categoria: 'Whisky', unidades_combo: 1, activo: true },
      { id: 'm5', sucursal_id: 's1', nombre: 'Coca-Cola 2L', tipo: 'suelto', precio_usd: 2.5, unidad: 'botella', categoria: 'Mezcladores', unidades_combo: 1, activo: true },
      { id: 'm7', sucursal_id: 's1', nombre: 'Hielo', tipo: 'suelto', precio_usd: 1, unidad: 'bolsa', categoria: 'Mezcladores', unidades_combo: 1, activo: true },
    ],
    pedidos: [], pedido_items: [], caja: [], solicitudes: [], clientes: [],
    inventario: [{ id: 'v1', sucursal_id: 's1', menu_id: 'm2', nombre: 'Ron Cacique 500 años', stock_actual: 10, stock_minimo: 3, unidad: 'botella' }],
    tasas_bcv: [], inventario_movimientos: []
  };
}

class BaseFalsa {
  constructor() { this.db = datosIniciales(); this.llamadas = []; this.n = 100; }
  id(p) { return p + (this.n++); }

  filtrar(filas, sp) {
    for (const [k, v] of sp.entries()) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
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
      if (t === 'solicitudes' && sel.includes('pedidos(')) o.pedidos = { cliente_nombre: this.db.pedidos.find(p => p.id === r.pedido_id)?.cliente_nombre };
      return o;
    });
  }

  rpc(fn, b) {
    const db = this.db;
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
    if (fn === 'cobrar_pedido') {
      const p = db.pedidos.find(x => x.id === b.p_pedido);
      if (!p || p.estado !== 'abierto') return { status: 400, json: { message: 'Este pedido ya fue cobrado o cancelado' } };
      const its = db.pedido_items.filter(i => i.pedido_id === p.id && i.consumido > 0);
      if (!its.length) return { status: 400, json: { message: 'No hay nada consumido aún' } };
      const total = Math.round(its.reduce((s, i) => s + i.consumido * i.precio_usd, 0) * 100) / 100;
      p.estado = 'cobrado';
      db.caja.push({ id: this.id('c'), sucursal_id: p.sucursal_id, pedido_id: p.id, cliente_nombre: p.cliente_nombre, total_usd: total, tasa_bcv: b.p_tasa, metodo_pago: b.p_metodo, nota: b.p_nota || null, fecha: new Date().toISOString() });
      return { json: { caja_id: 'c', total_usd: total } };
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
    if (url.includes('cdn.jsdelivr.net') && DEPS) {
      if (url.includes('@supabase/supabase-js')) return route.fulfill({ path: path.join(DEPS, 'supabase.js'), contentType: 'application/javascript' });
      if (url.includes('@tabler/icons-webfont')) {
        const rel = url.split('icons-webfont@2.44.0/')[1].split('?')[0];
        return route.fulfill({ path: path.join(DEPS, 'tabler', rel) });
      }
    }
    if (url.includes('cdn.jsdelivr.net') || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      return route.continue().catch(() => route.abort());
    }
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: 'u2', email: 'pedro@bodeguita.com', user_metadata: {} } });
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 400, json: {} });
    if (url.includes('supabase.co/rest/v1/')) {
      const r = base.responder(req);
      if (r.status === 204) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: r.status || 200, json: r.json });
    }
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

// Errores de JavaScript de la página (para afirmar que no hubo ninguno)
function vigilarErrores(page) {
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  return errores;
}

module.exports = { BaseFalsa, conectar, sesionEmpleado, vigilarErrores };
