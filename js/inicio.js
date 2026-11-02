'use strict';
/* inicio.js — Panel de resumen */

const Inicio = {
  render(root) {
    const db = S.db, cfg = db.config;
    const hoy = rangoPeriodo('dia', new Date());
    const vh = Calc.enRango(hoy.from, hoy.to);
    const totHoy = Calc.sum(vh, 'total');
    const bsHoy = Calc.sum(vh, 'totalBs');
    const valor = round2(db.productos.reduce((s, p) => s + p.stock * p.precio, 0));
    const alertas = db.productos.filter(p => Calc.agotado(p) || Calc.stockBajo(p)).sort((a, b) => a.stock - b.stock);
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';

    // Últimos 7 días
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(hoy.from, -i);
      const vs = Calc.enRango(d, addDays(d, 1));
      dias.push({ label: DIA3[d.getDay()], value: Calc.sum(vs, 'total'), hl: i === 0, title: `${fmtDate(d)}: ${usd(Calc.sum(vs, 'total'))}` });
    }
    const semTotal = round2(dias.reduce((s, d) => s + d.value, 0));
    const recientes = Calc.validas().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5);

    root.innerHTML = `
      <div class="page-head">
        <div><h1>${saludo}</h1><p class="sub">${cap(DIAS[new Date().getDay()])}, ${new Date().getDate()} de ${MESES[new Date().getMonth()]} de ${new Date().getFullYear()} · ${esc(cfg.negocio)}</p></div>
        <div class="head-actions"><button class="btn btn-primary" data-action="nav" data-v="ventas">${icon('cart')}<span>Nueva venta</span></button></div>
      </div>

      ${Calc.hasTasa() ? '' : `<div class="banner">${icon('dollar')}<span>Configura la tasa del dólar para ver los montos en bolívares.</span><button class="btn btn-sm" data-action="edit-tasa">Poner tasa</button></div>`}

      <div class="grid cols-4">
        <div class="card stat accent"><div class="lab">${icon('cash')}Ventas de hoy</div><div class="val">${usd(totHoy)}</div><div class="sec">${Calc.hasTasa() ? bs(bsHoy) : vh.length + (vh.length === 1 ? ' venta' : ' ventas')}</div></div>
        <div class="card stat"><div class="lab">${icon('receipt')}Operaciones hoy</div><div class="val">${vh.length}</div><div class="sec">${cfg.costoActivo && vh.some(v => v.ganancia != null) ? 'Ganancia hoy ' + usd(Calc.sum(vh.filter(v => v.ganancia != null), 'ganancia')) : (vh.length ? 'Promedio ' + usd(totHoy / vh.length) : 'Aún sin ventas')}</div></div>
        <div class="card stat"><div class="lab">${icon('box')}En inventario</div><div class="val">${db.productos.length}</div><div class="sec">${cfg.mostrarValorInventario ? 'Valor ' + usd(valor) + (Calc.hasTasa() ? ' · ' + bs(Calc.toBs(valor)) : '') : 'productos registrados'}</div></div>
        <div class="card stat"><div class="lab">${icon('alert')}Por reponer</div><div class="val" style="${alertas.length ? 'color:var(--warn)' : ''}">${alertas.length}</div><div class="sec">${alertas.length ? 'Productos con poco stock' : 'Todo en orden'}</div></div>
      </div>

      <div class="grid main-side" style="margin-top:16px">
        <div>
          <div class="card">
            <div class="card-head"><h3>Ventas de los últimos 7 días</h3><span class="muted">${usd(semTotal)}</span></div>
            ${semTotal > 0 ? barChart(dias) : `<div class="empty" style="padding:26px"><p>Cuando registres ventas verás aquí cómo van tus días.</p></div>`}
          </div>
          <div class="card">
            <div class="card-head"><h3>Últimas ventas</h3><button class="link" data-action="nav" data-v="historial">Ver historial</button></div>
            ${recientes.length ? recientes.map(v => `
              <div class="mov">
                <div class="m-main"><b>Venta #${pad6(v.numero || 0)}</b><small>${fmtDateTime(new Date(v.fecha))} · ${esc(pagoTxt(v))}</small></div>
                <div class="m-q" style="text-align:right">${usd(v.total)}${v.tasa > 0 ? `<small style="display:block;color:var(--muted);font-weight:500">${bs(v.totalBs)}</small>` : ''}</div>
              </div>`).join('') : `<p class="muted">Todavía no hay ventas registradas.</p>`}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Hay que reponer</h3>${alertas.length ? `<span class="badge low">${alertas.length}</span>` : ''}</div>
          ${alertas.length ? alertas.slice(0, 8).map(p => `
            <div class="mov">
              <div class="m-main"><b>${esc(nombreCompleto(p))}</b><small>${Calc.agotado(p) ? 'Agotado' : 'Quedan ' + fmtQty(p.stock) + ' ' + uShort(p.unidad)}</small></div>
              <button class="btn btn-sm btn-soft" data-action="prod-stock" data-id="${p.id}">${icon('plus')}Stock</button>
            </div>`).join('') : `<p class="muted">Ningún producto está por debajo del mínimo.</p>`}
          ${alertas.length > 8 ? `<button class="link" style="margin-top:10px" data-action="inv-filtro" data-f="bajo">Ver los ${alertas.length} productos</button>` : ''}
        </div>
      </div>`;
  }
};

Actions['nav'] = t => App.navigate(t.dataset.v);
Actions['inv-filtro'] = t => { S.inv.f = t.dataset.f; App.navigate('inventario'); };
