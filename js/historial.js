'use strict';
/* historial.js — Ventas y movimientos por día / semana / mes / año */

const hayBsGan = arr => arr.some(v => v.tasa > 0);

const Historial = {
  datos() {
    const H = S.hist, r = rangoPeriodo(H.per, H.ref);
    const todas = S.db.ventas.filter(v => { const d = new Date(v.fecha); return d >= r.from && d < r.to; })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const validas = todas.filter(v => !v.anulada);
    return { r, todas, validas };
  },

  render(root) {
    const H = S.hist, { r, todas, validas } = this.datos();
    const total = Calc.sum(validas, 'total'), totalBs = Calc.sum(validas, 'totalBs');
    const hayBs = validas.some(v => v.tasa > 0);
    const imp = Calc.sum(validas, 'impuesto');

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Historial</h1><p class="sub">Revisa lo que vendiste y cómo se movió tu inventario</p></div>
        <div class="head-actions">
          <button class="btn btn-soft" data-action="hist-cierre" ${validas.length ? '' : 'disabled'}>${icon('receipt')}<span>Cierre ${{ dia: 'del día', semana: 'de la semana', mes: 'del mes', ano: 'del año' }[H.per]}</span></button>
          <button class="btn" data-action="hist-pdf" ${validas.length ? '' : 'disabled'}>${icon('pdf')}<span>PDF</span></button>
          <button class="btn" data-action="hist-csv" ${todas.length ? '' : 'disabled'}>${icon('download')}<span>Excel</span></button>
        </div>
      </div>

      <div class="period-bar">
        <div class="seg">${Object.entries(PERIODOS).map(([k, l]) => `<button class="${H.per === k ? 'on' : ''}" data-action="hist-per" data-per="${k}">${l}</button>`).join('')}</div>
        <div class="period-nav">
          <button class="icon-btn" data-action="hist-prev" aria-label="Anterior">${icon('chevL')}</button>
          <button class="btn btn-ghost label" data-action="hist-fecha" title="Elegir fecha">${icon('calendar')}${esc(r.label)}</button>
          <input type="date" id="hist-date" value="${toInputDate(H.ref)}" data-change="hist-date">
          <button class="icon-btn" data-action="hist-next" aria-label="Siguiente">${icon('chevR')}</button>
          <button class="btn btn-sm" data-action="hist-hoy">Hoy</button>
        </div>
      </div>

      ${(() => {
        const cfg = S.db.config, conGan = validas.filter(v => v.ganancia != null), gan = Calc.sum(conGan, 'ganancia');
        const cuarta = cfg.costoActivo
          ? `<div class="card stat"><div class="lab">${icon('dollar')}Ganancia</div><div class="val" style="color:${gan < 0 ? 'var(--danger)' : 'var(--ok)'}">${usd(gan)}</div><div class="sec">${hayBsGan(conGan) ? bs(Calc.sum(conGan.map(v => ({ g: v.tasa > 0 ? round2(v.ganancia * v.tasa) : 0 })), 'g')) + ' · ' : ''}${conGan.length < validas.length ? 'solo productos con costo' : 'estimada'}</div></div>`
          : (cfg.impuestoActivo ? `<div class="card stat"><div class="lab">${icon('dollar')}${esc(cfg.impuestoNombre || 'Impuesto')}</div><div class="val">${usd(imp)}</div><div class="sec">cobrado en el periodo</div></div>` : '');
        return `<div class="grid ${cuarta ? 'cols-4' : 'cols-3'}" style="margin-bottom:16px">
        <div class="card stat accent"><div class="lab">${icon('cash')}Vendido</div><div class="val">${usd(total)}</div><div class="sec">${hayBs ? bs(totalBs) : 'En dólares'}</div></div>
        <div class="card stat"><div class="lab">${icon('receipt')}Ventas</div><div class="val">${validas.length}</div><div class="sec">${todas.length - validas.length ? (todas.length - validas.length) + ' anulada(s)' : 'Sin anuladas'}</div></div>
        <div class="card stat"><div class="lab">${icon('tag')}Promedio</div><div class="val">${usd(validas.length ? total / validas.length : 0)}</div><div class="sec">por venta</div></div>
        ${cuarta}
      </div>`;
      })()}

      <div class="seg" style="margin-bottom:14px">
        <button class="${H.tab === 'ventas' ? 'on' : ''}" data-action="hist-tab" data-tab="ventas">Ventas</button>
        <button class="${H.tab === 'movs' ? 'on' : ''}" data-action="hist-tab" data-tab="movs">Movimientos de inventario</button>
      </div>
      <div id="hist-body"></div>`;
    this.body();
  },

  desglose(validas, r) {
    const per = S.hist.per;
    if (per === 'dia') return '';
    let data = [];
    if (per === 'ano') {
      for (let m = 0; m < 12; m++) {
        const a = new Date(r.from.getFullYear(), m, 1), b = new Date(r.from.getFullYear(), m + 1, 1);
        const t = Calc.sum(validas.filter(v => { const d = new Date(v.fecha); return d >= a && d < b; }), 'total');
        data.push({ label: MES3[m], value: t, title: `${cap(MESES[m])}: ${usd(t)}` });
      }
    } else {
      for (let d = new Date(r.from); d < r.to; d = addDays(d, 1)) {
        const a = d, b = addDays(d, 1);
        const t = Calc.sum(validas.filter(v => { const x = new Date(v.fecha); return x >= a && x < b; }), 'total');
        data.push({ label: per === 'semana' ? `${DIA3[a.getDay()]} ${a.getDate()}` : String(a.getDate()), value: t, title: `${fmtDate(a)}: ${usd(t)}` });
      }
    }
    if (!data.some(d => d.value > 0)) return '';
    return `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>${per === 'ano' ? 'Ventas por mes' : 'Ventas por día'}</h3></div>${barChart(data, { height: 120 })}</div>`;
  },

  body() {
    const H = S.hist, { r, todas, validas } = this.datos(), box = $('#hist-body');
    if (H.tab === 'movs') return this.movs(box, r);

    // Productos más vendidos
    const mapa = {};
    validas.forEach(v => v.items.forEach(i => {
      const k = nombreCompleto(i);
      mapa[k] = mapa[k] || { nombre: k, usd: 0, cant: 0, ud: i.unidad };
      mapa[k].usd += i.subtotal; mapa[k].cant += i.cant;
    }));
    const top = Object.values(mapa).sort((a, b) => b.usd - a.usd).slice(0, 5);
    const maxTop = top.length ? top[0].usd : 1;

    if (!todas.length) {
      box.innerHTML = `<div class="card empty">${icon('receipt')}<h4>Sin ventas en este periodo</h4><p>Cuando registres ventas aparecerán aquí.</p></div>`;
      return;
    }
    box.innerHTML = `
      ${this.desglose(validas, r)}
      <div class="grid main-side">
        <div>${todas.map(v => this.ventaHtml(v)).join('')}</div>
        <div class="card">
          <div class="card-head"><h3>Más vendidos</h3></div>
          ${top.length ? `<div class="rank">${top.map(t => `<div class="rank-row"><div class="rk-top"><span>${esc(t.nombre)}</span><b>${usd(t.usd)}</b></div><div class="meter"><i style="width:${t.usd / maxTop * 100}%"></i></div></div>`).join('')}</div>` : '<p class="muted">Sin datos.</p>'}
        </div>
      </div>`;
  },

  ventaHtml(v) {
    const d = new Date(v.fecha), p = (n, dec = 0) => fmtNum(n, n % 1 ? 2 : dec);
    return `<details class="sale ${v.anulada ? 'void' : ''}">
      <summary>
        <div class="s-l"><b>Venta #${pad6(v.numero || 0)} ${v.anulada ? '<span class="badge void">Anulada</span>' : ''}</b><small>${fmtDateTime(d)} · ${esc(pagoTxt(v))}${v.cliente ? ' · ' + esc(v.cliente) : ''}</small></div>
        <div class="s-r"><b>${usd(v.total)}</b>${v.tasa > 0 ? `<small>${bs(v.totalBs)}</small>` : ''}</div>
      </summary>
      <div class="sale-body">
        ${v.items.map(i => `<div class="line"><div>${esc(nombreCompleto(i))}<small>${fmtQty(i.cantShow ?? i.cant)} ${uShort(i.ud || i.unidad)} × ${usd(i.precio)}/${uShort(i.unidad)}</small></div><b>${usd(i.subtotal)}</b></div>`).join('')}
        <div class="sale-sum">
          <div><span>Subtotal</span><span>${usd(v.subtotal)}</span></div>
          ${v.descuento > 0 ? `<div><span>Descuento (${p(v.descPct)}%)</span><span>-${usd(v.descuento)}</span></div>` : ''}
          ${v.impuesto > 0 ? `<div><span>${esc(v.impNombre || 'Impuesto')} (${p(v.impPct)}%)</span><span>${usd(v.impuesto)}</span></div>` : ''}
          <div class="t"><span>Total</span><span>${usd(v.total)}</span></div>
          ${v.tasa > 0 ? `<div class="t"><span>Total Bs (tasa ${fmtNum(v.tasa)})</span><span>${bs(v.totalBs)}</span></div>` : ''}
          ${v.ganancia != null && S.db.config.costoActivo ? `<div><span>Ganancia de esta venta</span><span style="color:${v.ganancia < 0 ? 'var(--danger)' : 'var(--ok)'}">${usd(v.ganancia)}</span></div>` : ''}
          ${v.recibido > 0 ? `<div><span>Recibido ${fmtM(v.recMoneda, v.recibido)}</span><span>Vuelto ${fmtM(v.recMoneda, v.vuelto)}</span></div>` : ''}
        </div>
        <div class="sale-actions">
          <button class="btn btn-sm btn-soft" data-action="sale-ticket" data-id="${v.id}">${icon('receipt')}Ver ticket</button>
          ${v.anulada ? '' : `<button class="btn btn-sm" data-action="sale-anular" data-id="${v.id}">Anular venta</button>`}
        </div>
      </div></details>`;
  },

  movs(box, r) {
    const ms = S.db.movimientos.filter(m => { const d = new Date(m.fecha); return d >= r.from && d < r.to; })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    if (!ms.length) { box.innerHTML = `<div class="card empty">${icon('box')}<h4>Sin movimientos en este periodo</h4></div>`; return; }
    const tipos = { entrada: ['Entrada', 'ok'], salida: ['Salida', 'low'], venta: ['Venta', ''], ajuste: ['Ajuste', ''], anulacion: ['Anulación', 'ok'] };
    box.innerHTML = `<div class="card">${ms.map(m => {
      const [lab, cls] = tipos[m.tipo] || [m.tipo, ''];
      return `<div class="mov"><div class="m-main"><b>${esc(m.nombre)}</b><small>${fmtDateTime(new Date(m.fecha))}${m.nota ? ' · ' + esc(m.nota) : ''}</small></div>
        <span class="badge ${cls}">${lab}</span>
        <div class="m-q ${m.cant >= 0 ? 'pos' : 'neg'}">${m.cant >= 0 ? '+' : ''}${fmtQty(m.cant)} ${uShort(m.unidad)}</div></div>`;
    }).join('')}</div>`;
  }
};

const histRefresh = () => Historial.render($('#view'));
Actions['hist-per'] = t => { S.hist.per = t.dataset.per; histRefresh(); };
Actions['hist-tab'] = t => { S.hist.tab = t.dataset.tab; histRefresh(); };
Actions['hist-prev'] = () => { S.hist.ref = shiftPeriodo(S.hist.per, S.hist.ref, -1); histRefresh(); };
Actions['hist-next'] = () => { S.hist.ref = shiftPeriodo(S.hist.per, S.hist.ref, 1); histRefresh(); };
Actions['hist-hoy'] = () => { S.hist.ref = new Date(); histRefresh(); };
Actions['hist-fecha'] = () => { const i = $('#hist-date'); try { i.showPicker(); } catch (e) { i.focus(); i.click(); } };
Changes['hist-date'] = t => { if (t.value) { S.hist.ref = fromInputDate(t.value); histRefresh(); } };

Actions['hist-cierre'] = conAviso(() => Reportes.cierrePDF(S.hist.per, S.hist.ref));
Actions['hist-pdf'] = conAviso(() => { const { r, validas } = Historial.datos(); return Reportes.ventasPDF(validas, r.label); });
Actions['hist-csv'] = conAviso(() => { const { r, todas } = Historial.datos(); return Reportes.ventasExcel(todas, r.label); });

Actions['sale-ticket'] = t => {
  const v = S.db.ventas.find(x => x.id === t.dataset.id);
  if (v) Ticket.openModal(v, { title: 'Venta #' + pad6(v.numero || 0) });
};
Actions['sale-anular'] = async t => {
  const v = S.db.ventas.find(x => x.id === t.dataset.id); if (!v) return;
  const ok = await confirmDialog({ title: 'Anular venta', msg: `Se anulará la venta #${pad6(v.numero || 0)} y la mercancía <b>volverá al inventario</b>. ¿Continuar?`, ok: 'Anular venta', danger: true });
  if (!ok) return;
  v.anulada = true;
  v.items.forEach(i => {
    const p = Calc.prod(i.pid);
    if (p) p.stock = rq(p.stock + i.cant);
    S.db.movimientos.push({ id: uid(), fecha: new Date().toISOString(), pid: i.pid, nombre: nombreCompleto(i), tipo: 'anulacion', cant: i.cant, unidad: i.unidad, nota: 'Anulación venta #' + pad6(v.numero || 0) });
  });
  Storage.save(); histRefresh(); toast('Venta anulada y stock devuelto');
};
