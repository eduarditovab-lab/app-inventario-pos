'use strict';
/* ventas.js — Punto de venta: cuenta (carrito), impuesto, tasa en Bs, cobro y simulación */

const PAGOS = ['Efectivo USD', 'Efectivo Bs', 'Pago móvil', 'Punto de venta', 'Transferencia', 'Otro'];
const QUICK = { und: [1, 2, 3, 6, 12], kg: [0.25, 0.5, 1, 2], g: [100, 250, 500, 1000], mg: [100, 250, 500], l: [0.5, 1, 1.5, 2], ml: [250, 500, 1000] };

const Ventas = {
  impPct() { const c = S.db.config; return (c.impuestoActivo && S.pos.aplicaImp) ? Number(c.impuestoPct) || 0 : 0; },

  resetCart() {
    const c = S.db.config;
    Object.assign(S.pos, { cart: [], cliente: '', pago: 'Efectivo USD', pagoDetalle: '', descPct: 0, aplicaImp: !!(c.impuestoActivo && c.impuestoPorDefecto), pane: 'productos', recibido: 0, rmoneda: Calc.hasTasa() ? 'Bs' : 'USD' });
  },

  /** Campo de texto que aparece al elegir "Otro" (pagos mixtos, por ejemplo) */
  pagoOtroHtml() {
    if (S.pos.pago !== 'Otro') return '';
    return `<div class="field"><label>Detalle del pago</label><input class="input" data-input="pos-pago-det" value="${esc(S.pos.pagoDetalle)}" placeholder="Ej: $5 efectivo + Bs 500 punto" maxlength="120" autocomplete="off"></div>`;
  },

  /** Vuelto: null si la opción está apagada o no se escribió monto recibido */
  vueltoInfo() {
    const P = S.pos;
    if (!S.db.config.vueltoActivo || !(P.recibido > 0) || !P.cart.length) return null;
    const moneda = (P.rmoneda === 'Bs' && Calc.hasTasa()) ? 'Bs' : 'USD';
    const t = Ventas.totales();
    const debe = moneda === 'Bs' ? Calc.toBs(t.total) : t.total;
    return { moneda, recibido: P.recibido, debe, diff: round2(P.recibido - debe) };
  },

  /** Líneas de la cuenta con los precios actuales del inventario */
  lineas() {
    S.pos.cart = S.pos.cart.filter(ci => Calc.prod(ci.pid));
    return S.pos.cart.map(ci => {
      const p = Calc.prod(ci.pid);
      return { ci, p, subtotal: round2(p.precio * ci.cant) };
    });
  },

  totales() {
    const ls = Ventas.lineas();
    return Calc.totales(ls, S.pos.descPct, Ventas.impPct());
  },

  buildVenta(simulada) {
    const cfg = S.db.config, P = S.pos;
    const items = Ventas.lineas().map(({ ci, p, subtotal }) => ({
      pid: p.id, nombre: p.nombre, presentacion: p.presentacion, unidad: p.unidad,
      cant: ci.cant, ud: ci.ud, cantShow: rq(convert(ci.cant, p.unidad, ci.ud)), precio: p.precio, subtotal,
      costo: (cfg.costoActivo && p.costo > 0) ? p.costo : null
    }));
    const impPct = Ventas.impPct();
    const t = Calc.totales(items, P.descPct, impPct);
    // Ganancia = lo vendido menos lo que costó (solo productos con costo), descontando el descuento proporcional
    let ganancia = null;
    const conCosto = items.filter(i => i.costo != null);
    if (conCosto.length) {
      const profit = conCosto.reduce((s, i) => s + (i.subtotal - i.costo * i.cant), 0);
      const subC = conCosto.reduce((s, i) => s + i.subtotal, 0);
      ganancia = round2(profit - t.descuento * (t.subtotal ? subC / t.subtotal : 0));
    }
    const tasa = Calc.hasTasa() ? Number(cfg.tasa) : 0;
    const vi = Ventas.vueltoInfo();
    const extra = (vi && vi.diff >= 0) ? { recibido: vi.recibido, recMoneda: vi.moneda, vuelto: vi.diff } : {};
    return {
      ...extra, ganancia,
      id: uid(), fecha: new Date().toISOString(), cliente: P.cliente.trim(), pago: P.pago, pagoDetalle: P.pago === 'Otro' ? (P.pagoDetalle || '').trim() : '', tasa, items,
      subtotal: t.subtotal, descPct: P.descPct, descuento: t.descuento,
      impPct, impNombre: cfg.impuestoNombre, impuesto: t.impuesto,
      total: t.total, totalBs: tasa ? round2(t.total * tasa) : 0, simulada: !!simulada
    };
  },

  render(root) {
    const P = S.pos, cfg = S.db.config;
    if (!cfg.impuestoActivo) P.aplicaImp = false;
    root.innerHTML = `
      <div class="page-head"><div><h1>Vender</h1><p class="sub">Toca un producto para agregarlo a la cuenta</p></div></div>
      <div class="seg full pos-switch">
        <button class="${P.pane === 'productos' ? 'on' : ''}" data-action="pos-pane" data-pane="productos">Productos</button>
        <button class="${P.pane === 'carrito' ? 'on' : ''}" data-action="pos-pane" data-pane="carrito">Cuenta <span class="count" id="pos-count">0</span></button>
      </div>
      <div class="pos" data-pane="${P.pane}">
        <section class="pos-catalog">
          <label class="search">${icon('search')}<input type="search" placeholder="Buscar producto…" value="${esc(P.q)}" data-input="pos-q" autocomplete="off"></label>
          <div class="chips" id="pos-chips"></div>
          <div class="tiles" id="pos-tiles"></div>
        </section>
        <aside class="pos-cart card">
          <div class="card-head"><h3>Cuenta actual</h3><button class="link" data-action="cart-clear">Vaciar</button></div>
          <div id="cart-items"></div>
          <div class="cart-opts">
            <div class="field-row">
              <div class="field"><label>Cliente (opcional)</label><input class="input" data-input="pos-cliente" value="${esc(P.cliente)}" placeholder="Nombre" autocomplete="off"></div>
              <div class="field"><label>Forma de pago</label><select class="select" data-input="pos-pago">${PAGOS.map(x => `<option ${x === P.pago ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
            </div>
            <div id="pago-otro">${Ventas.pagoOtroHtml()}</div>
            <div class="field-row" style="align-items:end">
              <div class="field"><label>Descuento (%)</label><input class="input" type="number" inputmode="decimal" min="0" max="100" step="any" value="${P.descPct || ''}" placeholder="0" data-input="pos-desc"></div>
              ${cfg.impuestoActivo ? `<label class="switch-line"><input type="checkbox" data-change="pos-imp" ${P.aplicaImp ? 'checked' : ''}><span class="sw"></span><span>${esc(cfg.impuestoNombre)} ${fmtNum(cfg.impuestoPct, cfg.impuestoPct % 1 ? 2 : 0)}%</span></label>` : '<div></div>'}
            </div>
            ${cfg.vueltoActivo ? `<div class="field-row">
              <div class="field"><label>Monto recibido</label><input class="input" type="number" inputmode="decimal" min="0" step="any" value="${P.recibido || ''}" placeholder="Con cuánto paga" data-input="pos-recibido"></div>
              <div class="field"><label>En</label><select class="select" data-input="pos-rmoneda"><option value="Bs" ${P.rmoneda === 'Bs' ? 'selected' : ''}>Bolívares (Bs)</option><option value="USD" ${P.rmoneda === 'USD' ? 'selected' : ''}>Dólares ($)</option></select></div>
            </div>` : ''}
          </div>
          <div id="cart-totals"></div>
          <div class="cart-actions">
            <button class="btn" data-action="pos-simular">${icon('eye')}Simular</button>
            <button class="btn btn-primary btn-lg" data-action="pos-cobrar">${icon('check')}Cobrar</button>
          </div>
        </aside>
      </div>
      <div class="cart-bar" id="cart-bar"></div>`;
    this.renderChips();
    this.renderTiles();
    this.renderCart();
  },

  renderChips() {
    const cats = [...new Set(S.db.productos.map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const chip = (c, label) => `<button class="chip-f ${S.pos.cat === c ? 'on' : ''}" data-action="pos-cat" data-c="${esc(c)}">${esc(label)}</button>`;
    $('#pos-chips').innerHTML = chip('', 'Todos') + cats.map(c => chip(c, c)).join('');
  },

  renderTiles() {
    const q = norm(S.pos.q.trim());
    const ps = S.db.productos.filter(p => (!S.pos.cat || p.categoria === S.pos.cat) && (!q || norm([p.nombre, p.presentacion, p.sku].join(' ')).includes(q)))
      .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
    const box = $('#pos-tiles');
    if (!S.db.productos.length) { box.innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('box')}<h4>No hay productos</h4><p>Primero agrega productos en el inventario.</p><button class="btn btn-primary" data-action="nav" data-v="inventario">Ir al inventario</button></div>`; return; }
    if (!ps.length) { box.innerHTML = `<p class="muted" style="grid-column:1/-1;padding:20px 4px">No se encontraron productos.</p>`; return; }
    box.innerHTML = ps.map(p => {
      const enCarro = S.pos.cart.find(c => c.pid === p.id);
      return `<button class="tile ${Calc.agotado(p) ? 'out' : ''}" data-action="pos-add" data-id="${p.id}">
        <div><div class="t-name">${esc(p.nombre)}</div>${p.presentacion ? `<div class="t-pres">${esc(p.presentacion)}</div>` : ''}</div>
        <div class="t-foot">
          <div class="t-price">${usd(p.precio)}<small>/${uShort(p.unidad)}</small></div>
          <div class="t-stock ${Calc.stockBajo(p) ? 'low' : ''}">${Calc.agotado(p) ? 'Agotado' : fmtQty(p.stock) + ' ' + uShort(p.unidad)}${enCarro ? '<br>✓ en cuenta' : ''}</div>
        </div></button>`;
    }).join('');
  },

  renderCart() {
    const ls = Ventas.lineas(), P = S.pos, t = Ventas.totales(), tasa = Calc.hasTasa();
    const box = $('#cart-items');
    if (!box) return;
    box.innerHTML = ls.length ? ls.map(({ ci, p, subtotal }, i) => {
      const enUnd = p.unidad === 'und';
      return `<div class="cart-item">
        <div><div class="ci-name">${esc(p.nombre)}${p.presentacion ? ` <span class="chip">${esc(p.presentacion)}</span>` : ''}</div>
          <div class="ci-sub">${usd(p.precio)} / ${uShort(p.unidad)}</div></div>
        <div class="ci-price">${usd(subtotal)}${tasa ? `<small>${bs(Calc.toBs(subtotal))}</small>` : ''}</div>
        <div class="ci-ctrl">
          <div class="stepper">
            ${enUnd ? `<button data-action="ci-dec" data-i="${i}" aria-label="Menos">${icon('minus')}</button>` : ''}
            <button class="q" data-action="ci-edit" data-i="${i}" title="Cambiar cantidad">${fmtQty(convert(ci.cant, p.unidad, ci.ud))} ${uShort(ci.ud)}</button>
            ${enUnd ? `<button data-action="ci-inc" data-i="${i}" aria-label="Más">${icon('plus')}</button>` : ''}
          </div>
          <span class="spacer"></span>
          <button class="btn btn-sm" data-action="ci-del" data-i="${i}" aria-label="Quitar de la cuenta" style="color:var(--danger)">${icon('trash')}Quitar</button>
        </div></div>`;
    }).join('') : `<div class="empty" style="padding:26px 10px">${icon('cart')}<p>La cuenta está vacía.<br>Elige productos de la lista.</p></div>`;

    const cfg = S.db.config;
    $('#cart-totals').innerHTML = `<div class="totals">
      <div class="row"><span>Subtotal</span><b>${usd(t.subtotal)}</b></div>
      ${t.descuento > 0 ? `<div class="row"><span>Descuento (${fmtNum(P.descPct, P.descPct % 1 ? 2 : 0)}%)</span><b>-${usd(t.descuento)}</b></div>` : ''}
      ${Ventas.impPct() > 0 ? `<div class="row"><span>${esc(cfg.impuestoNombre)} (${fmtNum(Ventas.impPct(), Ventas.impPct() % 1 ? 2 : 0)}%)</span><b>${usd(t.impuesto)}</b></div>` : ''}
      <div class="grand"><span>Total USD</span><strong>${usd(t.total)}</strong></div>
      ${tasa
        ? `<div class="grand bs"><span>Total Bs</span><strong>${bs(Calc.toBs(t.total))}</strong></div><div class="tasa-note">Tasa: 1 USD = ${bs(cfg.tasa)}</div>`
        : `<div class="tasa-note"><button class="link" data-action="edit-tasa">Poner tasa del dólar para ver el total en Bs</button></div>`}
      ${(() => {
        const vi = Ventas.vueltoInfo(); if (!vi) return '';
        const eq = !Calc.hasTasa() ? '' : vi.moneda === 'Bs' ? '≈ ' + usd(Math.abs(vi.diff) / cfg.tasa) : '≈ ' + bs(Math.abs(vi.diff) * cfg.tasa);
        return `<div class="grand vuelto ${vi.diff < 0 ? 'falta' : ''}"><span>${vi.diff < 0 ? 'Falta' : 'Vuelto'}</span><strong>${fmtM(vi.moneda, Math.abs(vi.diff))}</strong></div>
          <div class="tasa-note">Recibido ${fmtM(vi.moneda, vi.recibido)} · ${eq}</div>`;
      })()}
    </div>`;

    const n = ls.length;
    const cnt = $('#pos-count'); if (cnt) cnt.textContent = n;
    const bar = $('#cart-bar');
    if (bar) {
      bar.classList.toggle('show', n > 0 && P.pane === 'productos');
      bar.innerHTML = `<div><b>${usd(t.total)}</b><small>${tasa ? bs(Calc.toBs(t.total)) + ' · ' : ''}${n} producto${n === 1 ? '' : 's'}</small></div>
        <button class="btn" data-action="pos-pane" data-pane="carrito">Ver cuenta ${icon('chevR')}</button>`;
    }
  },

  /** Ventana de cantidad (para peso, volumen o editar) */
  openQty(pid, idx = -1) {
    const p = Calc.prod(pid); if (!p) return;
    const cur = idx >= 0 ? S.pos.cart[idx] : null;
    const units = compatibleUnits(p.unidad);
    const u0 = cur ? cur.ud : p.unidad;
    const v0 = cur ? fmtQty(convert(cur.cant, p.unidad, cur.ud)).replace(/\./g, '').replace(',', '.') : '';
    openModal({
      title: nombreCompleto(p),
      html: `<div class="form" data-pid="${p.id}" data-idx="${idx}">
        <div class="muted" id="qty-disp"></div>
        <div class="field-row">
          <div class="field"><label>Cantidad</label><input class="input" name="cant" type="number" inputmode="decimal" step="any" min="0" value="${v0}" placeholder="0" data-input="qty" autofocus></div>
          <div class="field"><label>Unidad</label><select class="select" name="ud" data-input="qty-unit">${units.map(u => `<option value="${u}" ${u === u0 ? 'selected' : ''}>${UNITS[u].label}</option>`).join('')}</select></div>
        </div>
        <div class="quick" id="qty-quick"></div>
        <div class="preview-box"><span class="muted">Subtotal</span><div style="text-align:right"><b id="qty-sub">$0,00</b><div class="muted" id="qty-bs"></div></div></div>
      </div>`,
      footer: `<button class="btn" data-modal-close>Cancelar</button><button class="btn btn-primary" data-submit data-action="qty-ok">${icon('check')}${cur ? 'Actualizar' : 'Agregar'}</button>`,
      onMount: m => Ventas.qtyRefresh(m.el)
    });
  },
  disponible(p, idx) {
    const otros = S.pos.cart.reduce((s, c, i) => s + (c.pid === p.id && i !== idx ? c.cant : 0), 0);
    return rq(p.stock - otros);
  },
  qtyRefresh(root, rebuildQuick = true) {
    const f = $('[data-pid]', root), p = Calc.prod(f.dataset.pid), idx = Number(f.dataset.idx);
    const ud = $('[name=ud]', root).value, c = num($('[name=cant]', root).value);
    $('#qty-disp', root).textContent = `Disponible: ${fmtQty(Ventas.disponible(p, idx))} ${uShort(p.unidad)} · ${usd(p.precio)} por ${uShort(p.unidad)}`;
    if (rebuildQuick) $('#qty-quick', root).innerHTML = (QUICK[ud] || []).map(q => `<button type="button" class="chip-f" data-action="qty-quick" data-v="${q}">${fmtQty(q)} ${uShort(ud)}</button>`).join('');
    const sub = (!isNaN(c) && c > 0) ? round2(p.precio * convert(c, ud, p.unidad)) : 0;
    $('#qty-sub', root).textContent = usd(sub);
    $('#qty-bs', root).textContent = Calc.hasTasa() ? bs(Calc.toBs(sub)) : '';
  }
};

Inputs['pos-q'] = t => { S.pos.q = t.value; Ventas.renderTiles(); };
Actions['pos-cat'] = t => { S.pos.cat = t.dataset.c; Ventas.renderChips(); Ventas.renderTiles(); };
Actions['pos-pane'] = t => { S.pos.pane = t.dataset.pane; Ventas.render($('#view')); window.scrollTo(0, 0); };
Inputs['pos-cliente'] = t => { S.pos.cliente = t.value; };
Inputs['pos-pago'] = t => {
  S.pos.pago = t.value;
  $('#pago-otro').innerHTML = Ventas.pagoOtroHtml();
  const i = $('#pago-otro input'); if (i) i.focus();
};
Inputs['pos-pago-det'] = t => { S.pos.pagoDetalle = t.value; };
Inputs['pos-recibido'] = t => { const v = num(t.value); S.pos.recibido = isNaN(v) || v < 0 ? 0 : v; Ventas.renderCart(); };
Inputs['pos-rmoneda'] = t => { S.pos.rmoneda = t.value; Ventas.renderCart(); };
Inputs['pos-desc'] = t => { let v = num(t.value); if (isNaN(v) || v < 0) v = 0; if (v > 100) { v = 100; t.value = 100; } S.pos.descPct = v; Ventas.renderCart(); };
Changes['pos-imp'] = t => { S.pos.aplicaImp = t.checked; Ventas.renderCart(); };

Actions['pos-add'] = t => {
  const p = Calc.prod(t.dataset.id); if (!p || Calc.agotado(p)) return;
  if (p.unidad === 'und') {
    const ci = S.pos.cart.find(c => c.pid === p.id);
    if ((ci ? ci.cant : 0) + 1 > p.stock) return toast(`Solo quedan ${fmtQty(p.stock)} ${uShort(p.unidad)}`, 'err');
    if (ci) ci.cant += 1; else S.pos.cart.push({ pid: p.id, cant: 1, ud: 'und' });
    Ventas.renderTiles(); Ventas.renderCart();
  } else {
    const idx = S.pos.cart.findIndex(c => c.pid === p.id);
    Ventas.openQty(p.id, idx);
  }
};
Actions['ci-inc'] = t => {
  const ci = S.pos.cart[+t.dataset.i], p = Calc.prod(ci.pid);
  if (ci.cant + 1 > p.stock) return toast(`Solo quedan ${fmtQty(p.stock)} ${uShort(p.unidad)}`, 'err');
  ci.cant += 1; Ventas.renderCart();
};
Actions['ci-dec'] = t => {
  const i = +t.dataset.i, ci = S.pos.cart[i];
  if (ci.cant <= 1) S.pos.cart.splice(i, 1); else ci.cant -= 1;
  Ventas.renderTiles(); Ventas.renderCart();
};
Actions['ci-del'] = t => { S.pos.cart.splice(+t.dataset.i, 1); Ventas.renderTiles(); Ventas.renderCart(); };
Actions['ci-edit'] = t => { const i = +t.dataset.i; Ventas.openQty(S.pos.cart[i].pid, i); };
Actions['cart-clear'] = async () => {
  if (!S.pos.cart.length) return;
  if (await confirmDialog({ title: 'Vaciar cuenta', msg: '¿Quitar todos los productos de la cuenta actual?', ok: 'Vaciar', danger: true })) {
    S.pos.cart = []; Ventas.renderTiles(); Ventas.renderCart();
  }
};

Inputs['qty'] = t => Ventas.qtyRefresh(t.closest('.modal'), false);
Inputs['qty-unit'] = t => Ventas.qtyRefresh(t.closest('.modal'), true);
Actions['qty-quick'] = t => {
  const m = t.closest('.modal'), inp = $('[name=cant]', m);
  inp.value = t.dataset.v; Ventas.qtyRefresh(m, false);
};
Actions['qty-ok'] = t => {
  const m = t.closest('.modal'), f = $('[data-pid]', m);
  const p = Calc.prod(f.dataset.pid), idx = Number(f.dataset.idx);
  const ud = $('[name=ud]', m).value, c = num($('[name=cant]', m).value);
  if (isNaN(c) || c <= 0) return toast('Escribe una cantidad mayor a 0', 'err');
  const cant = convert(c, ud, p.unidad);
  if (p.unidad === 'und' && !Number.isInteger(cant)) return toast('Este producto solo se vende en unidades enteras', 'err');
  const disp = Ventas.disponible(p, idx);
  if (cant > disp + 1e-9) return toast(`No hay suficiente stock. Disponible: ${fmtQty(disp)} ${uShort(p.unidad)}`, 'err');
  if (idx >= 0) S.pos.cart[idx] = { pid: p.id, cant, ud };
  else S.pos.cart.push({ pid: p.id, cant, ud });
  closeTopModal(); Ventas.renderTiles(); Ventas.renderCart();
};

Actions['pos-simular'] = () => {
  if (!S.pos.cart.length) return toast('Agrega productos a la cuenta primero', 'err');
  Ticket.openModal(Ventas.buildVenta(true), { title: 'Simulación de venta' });
};

Actions['pos-cobrar'] = () => {
  const P = S.pos;
  if (!P.cart.length) return toast('Agrega productos a la cuenta primero', 'err');
  for (const { ci, p } of Ventas.lineas()) {
    if (ci.cant > p.stock + 1e-9) return toast(`No hay suficiente stock de ${nombreCompleto(p)}`, 'err');
  }
  const vi = Ventas.vueltoInfo();
  if (vi && vi.diff < 0) return toast(`El monto recibido no alcanza. Faltan ${fmtM(vi.moneda, -vi.diff)}`, 'err');
  const v = Ventas.buildVenta(false);
  v.numero = ++S.db.contadorVentas;
  P.cart.forEach(ci => {
    const p = Calc.prod(ci.pid);
    p.stock = rq(p.stock - ci.cant);
    S.db.movimientos.push({ id: uid(), fecha: v.fecha, pid: p.id, nombre: nombreCompleto(p), tipo: 'venta', cant: -ci.cant, unidad: p.unidad, nota: 'Venta #' + pad6(v.numero) });
  });
  delete v.simulada;
  S.db.ventas.push(v);
  Storage.save();
  Ventas.resetCart();
  App.render();
  Ticket.openModal(v, { title: 'Venta registrada', exito: true });
  App.recordarRespaldo();
};
