'use strict';
/* inventario.js — Productos: agregar, editar, ajustar stock, eliminar */

const DEMO = [
  ['Manzana roja', '', 'Frutas y verduras', 'kg', 2.8, 18.5],
  ['Cambur', '', 'Frutas y verduras', 'kg', 1.2, 25],
  ['Queso blanco', '', 'Lácteos', 'kg', 7.5, 6.25],
  ['Pollo entero', '', 'Carnes', 'kg', 4.2, 14],
  ['Carne molida', '', 'Carnes', 'kg', 6.8, 3.5],
  ['Leche líquida', '1 L', 'Lácteos', 'und', 1.9, 24],
  ['Leche en polvo', '500 g', 'Lácteos', 'und', 5.5, 10],
  ['Leche en polvo', '1 kg', 'Lácteos', 'und', 10.5, 8],
  ['Harina de maíz', '1 kg', 'Víveres', 'und', 1.5, 40],
  ['Arroz', '1 kg', 'Víveres', 'und', 1.3, 30],
  ['Huevos', 'Cartón 30', 'Víveres', 'und', 4.5, 12],
  ['Refresco', '2 L', 'Bebidas', 'und', 2.2, 4]
];

const Inventario = {
  filtrados() {
    const q = norm(S.inv.q.trim());
    return S.db.productos.filter(p => {
      if (S.inv.f === 'bajo' && !Calc.stockBajo(p)) return false;
      if (S.inv.f === 'agotado' && !Calc.agotado(p)) return false;
      if (S.inv.f.startsWith('cat:') && p.categoria !== S.inv.f.slice(4)) return false;
      if (!q) return true;
      return norm([p.nombre, p.presentacion, p.categoria, p.sku].join(' ')).includes(q);
    }).sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
  },

  render(root) {
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Inventario</h1><p class="sub" id="inv-sub"></p></div>
        <div class="head-actions">
          <button class="btn" data-action="inv-pdf" ${S.db.productos.length ? '' : 'disabled'}>${icon('pdf')}<span>PDF</span></button>
          <button class="btn" data-action="inv-csv" ${S.db.productos.length ? '' : 'disabled'}>${icon('download')}<span>Excel</span></button>
          <button class="btn btn-primary" data-action="prod-nuevo">${icon('plus')}<span>Nuevo producto</span></button>
        </div>
      </div>
      <label class="search">${icon('search')}<input type="search" id="inv-q" placeholder="Buscar producto, presentación o código…" value="${esc(S.inv.q)}" data-input="inv-q" autocomplete="off"></label>
      <div class="chips" id="inv-chips"></div>
      <div id="inv-list"></div>`;
    this.renderChips();
    this.renderList();
  },

  renderChips() {
    const ps = S.db.productos;
    const nBajo = ps.filter(Calc.stockBajo).length, nOut = ps.filter(Calc.agotado).length;
    const chip = (f, label, n) => `<button class="chip-f ${S.inv.f === f ? 'on' : ''}" data-action="inv-f" data-f="${esc(f)}">${esc(label)}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
    const cats = [...new Set(ps.map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    $('#inv-chips').innerHTML = chip('todos', 'Todos', ps.length) + chip('bajo', 'Stock bajo', nBajo) + chip('agotado', 'Agotados', nOut) +
      cats.map(c => chip('cat:' + c, c, ps.filter(p => p.categoria === c).length)).join('');
  },

  renderList() {
    const ps = Inventario.filtrados();
    const valor = round2(S.db.productos.reduce((s, p) => s + p.stock * p.precio, 0));
    const n = S.db.productos.length, cfg = S.db.config;
    let txt = `${n} producto${n === 1 ? '' : 's'}`;
    if (cfg.mostrarValorInventario && n) {
      const b = v => Calc.hasTasa() ? ' · ' + bs(Calc.toBs(v)) : '';
      const conCosto = S.db.productos.filter(p => p.costo > 0);
      const vCosto = round2(conCosto.reduce((s, p) => s + p.stock * p.costo, 0));
      txt += (cfg.costoActivo && conCosto.length)
        ? ` · Invertido (a costo): ${usd(vCosto)}${b(vCosto)} · Valor de venta: ${usd(valor)}${b(valor)}`
        : ` · Valor actual del inventario: ${usd(valor)}${b(valor)}`;
    }
    $('#inv-sub').textContent = txt;
    const box = $('#inv-list');
    if (!S.db.productos.length) {
      box.innerHTML = `<div class="card empty">${icon('box')}<h4>Tu inventario está vacío</h4><p>Agrega tu primer producto o carga unos de ejemplo para probar el sistema.</p>
        <div class="row-actions" style="justify-content:center"><button class="btn btn-primary" data-action="prod-nuevo">${icon('plus')}Agregar producto</button><button class="btn" data-action="prod-demo">Cargar ejemplos</button></div></div>`;
      return;
    }
    if (!ps.length) { box.innerHTML = `<div class="card empty">${icon('search')}<h4>Sin resultados</h4><p>Prueba con otra búsqueda o filtro.</p></div>`; return; }
    box.innerHTML = `<div class="products">${ps.map(p => {
      const out = Calc.agotado(p), low = Calc.stockBajo(p);
      const st = out ? 'out' : low ? 'low' : '';
      const min = Math.max(Calc.minimo(p), 0.0001);
      const pct = Math.min(100, p.stock / (min * 3) * 100);
      return `<article class="prod">
        <div class="prod-top">
          <div class="avatar" style="--h:${hueOf(p.categoria || p.nombre)}">${esc((p.nombre[0] || '?').toUpperCase())}</div>
          <div class="prod-name"><h4>${esc(p.nombre)}</h4>
            <div class="meta">${p.presentacion ? `<span class="chip">${esc(p.presentacion)}</span>` : ''}${p.categoria ? `<span>${esc(p.categoria)}</span>` : ''}</div></div>
          ${out ? '<span class="badge out">Agotado</span>' : low ? '<span class="badge low">Stock bajo</span>' : ''}
        </div>
        <div class="prod-mid">
          <div class="price"><b>${usd(p.precio)}</b><small>por ${uShort(p.unidad)}${Calc.hasTasa() ? ' · ' + bs(Calc.toBs(p.precio)) : ''}</small>
            ${S.db.config.costoActivo && p.costo > 0 ? `<small style="${p.precio < p.costo ? 'color:var(--danger)' : ''}">Costo ${usd(p.costo)} · ${p.precio < p.costo ? 'pierdes' : 'ganas'} ${fmtNum(Math.abs(Calc.margen(p)), 0)}%</small>` : ''}</div>
          <div class="stock ${st}"><b>${fmtQty(p.stock)}</b><small>${uShort(p.unidad)} en stock</small></div>
        </div>
        <div class="meter ${st}"><i style="width:${pct}%"></i></div>
        <div class="prod-actions">
          <button class="btn btn-sm btn-soft" data-action="prod-stock" data-id="${p.id}">${icon('plus')}Stock</button>
          <button class="btn btn-sm" data-action="prod-editar" data-id="${p.id}">${icon('edit')}Editar</button>
          <button class="icon-btn danger" data-action="prod-borrar" data-id="${p.id}" aria-label="Eliminar">${icon('trash')}</button>
        </div>
      </article>`;
    }).join('')}</div>`;
  },

  formProducto(p) {
    const edit = !!p;
    p = p || { nombre: '', presentacion: '', categoria: '', unidad: 'und', precio: '', stock: '', minimo: MIN_DEFAULT.und, sku: '' };
    const unitOpts = Object.keys(UNITS).map(k => `<option value="${k}" ${p.unidad === k ? 'selected' : ''}>${UNITS[k].label}</option>`).join('');
    return `<div class="form">
      <div class="field"><label>Nombre del producto *</label><input class="input" name="nombre" value="${esc(p.nombre)}" placeholder="Ej: Leche en polvo" autocomplete="off" ${edit ? '' : 'autofocus'}></div>
      <div class="field-row">
        <div class="field"><label>Presentación / tamaño</label><input class="input" name="presentacion" value="${esc(p.presentacion || '')}" placeholder="Ej: 500 g, 1 kg, 2 L"></div>
        <div class="field"><label>Categoría</label><input class="input" name="categoria" list="cat-list" value="${esc(p.categoria || '')}" placeholder="Elige o escribe una">
          <datalist id="cat-list">${S.db.categorias.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      </div>
      <div class="field"><label>Se vende por</label><select class="select" name="unidad" data-input="prod-unidad" ${edit ? 'disabled' : ''}>${unitOpts}</select></div>
      ${S.db.config.costoActivo ? `
      <div class="field-row">
        <div class="field"><label id="lbl-costo">Costo por ${uShort(p.unidad)} (USD)</label><input class="input" name="costo" type="number" inputmode="decimal" step="any" min="0" value="${p.costo > 0 ? p.costo : ''}" placeholder="Lo que te costó" data-input="prod-calc"></div>
        <div class="field"><label>% de ganancia</label><input class="input" name="margen" type="number" inputmode="decimal" step="any" min="0" value="${p.costo > 0 ? Math.round(Calc.margen(p) * 10) / 10 : (S.db.config.margenDefecto || '')}" placeholder="Ej: 30" data-input="prod-calc"></div>
      </div>` : ''}
      <div class="field"><label id="lbl-precio">Precio de venta por ${uShort(p.unidad)} (USD) *</label><input class="input" name="precio" type="number" inputmode="decimal" step="any" min="0" value="${p.precio}" placeholder="0.00" data-input="prod-precio"></div>
      <div class="hint" id="precio-bs"></div>
      <div class="field-row">
        ${edit ? '' : `<div class="field"><label id="lbl-stock">Stock inicial (${uShort(p.unidad)})</label><input class="input" name="stock" type="number" inputmode="decimal" step="any" min="0" value="${p.stock}" placeholder="0"></div>`}
        <div class="field"><label id="lbl-min">Avisar si baja de (${uShort(p.unidad)})</label><input class="input" name="minimo" type="number" inputmode="decimal" step="any" min="0" value="${p.minimo ?? S.db.config.stockMinimo}"></div>
      </div>
      <div class="field"><label>Código o referencia (opcional)</label><input class="input" name="sku" value="${esc(p.sku || '')}" placeholder="Código de barras, etc."></div>
      ${edit ? '<div class="hint">La unidad no se puede cambiar. Para cambiar el stock usa el botón «Stock».</div>'
             : '<div class="tip">Si un producto viene en varios tamaños (leche de 500 g y de 1 kg), crea cada uno por separado con su presentación y su precio.</div>'}
    </div>`;
  },

  abrirForm(p) {
    const m = openModal({
      title: p ? 'Editar producto' : 'Nuevo producto',
      html: Inventario.formProducto(p),
      footer: `<button class="btn" data-modal-close>Cancelar</button><button class="btn btn-primary" data-submit data-action="prod-guardar" data-id="${p ? p.id : ''}">${icon('check')}Guardar</button>`
    });
    Inputs['prod-precio']($('[name=precio]', m.el));
  }
};

Actions['inv-f'] = t => { S.inv.f = t.dataset.f; Inventario.renderChips(); Inventario.renderList(); };
Inputs['inv-q'] = t => { S.inv.q = t.value; Inventario.renderList(); };
Actions['prod-nuevo'] = () => Inventario.abrirForm(null);
Actions['prod-editar'] = t => Inventario.abrirForm(Calc.prod(t.dataset.id));

Inputs['prod-unidad'] = t => {
  const m = t.closest('.modal'), u = t.value;
  $('#lbl-precio', m).textContent = `Precio de venta por ${uShort(u)} (USD) *`;
  const lc = $('#lbl-costo', m); if (lc) lc.textContent = `Costo por ${uShort(u)} (USD)`;
  const ls = $('#lbl-stock', m); if (ls) ls.textContent = `Stock inicial (${uShort(u)})`;
  $('#lbl-min', m).textContent = `Avisar si baja de (${uShort(u)})`;
  if (ls) $('[name=minimo]', m).value = MIN_DEFAULT[u];
};
/* Costo ↔ % ganancia ↔ precio (solo si "Costo y ganancia" está activo en Ajustes) */
Inputs['prod-calc'] = t => {
  const m = t.closest('.modal'), f = n => $(`[name=${n}]`, m);
  const costo = num(f('costo').value), margen = num(f('margen').value), precio = num(f('precio').value);
  const r4 = x => Math.round(x * 1e4) / 1e4;
  if (costo > 0 && !isNaN(margen)) f('precio').value = r4(costo * (1 + margen / 100));
  else if (costo > 0 && isNaN(margen) && precio > 0) f('margen').value = Math.round((precio / costo - 1) * 1000) / 10;
  Inputs['prod-precio'](f('precio'), true);
};
Inputs['prod-precio'] = (t, fromCalc) => {
  const m = t.closest('.modal'), v = num(t.value), box = $('#precio-bs', m);
  const fc = $('[name=costo]', m);
  if (fc && fromCalc !== true) {                              // si cambian el precio a mano, recalcula el % de ganancia
    const costo = num(fc.value);
    if (costo > 0 && v > 0) $('[name=margen]', m).value = Math.round((v / costo - 1) * 1000) / 10;
  }
  let txt = (Calc.hasTasa() && v > 0) ? `Equivale a ${bs(Calc.toBs(v))} con la tasa actual (${fmtNum(S.db.config.tasa)}). ` : '';
  if (fc) {
    const costo = num(fc.value);
    if (costo > 0 && v > 0) txt += v >= costo ? `Ganas ${usd(v - costo)} por cada unidad vendida.` : `⚠ Estás vendiendo por debajo del costo (pierdes ${usd(costo - v)}).`;
  }
  box.textContent = txt;
};

Actions['prod-guardar'] = t => {
  const m = t.closest('.modal'), id = t.dataset.id, f = n => $(`[name=${n}]`, m);
  const nombre = f('nombre').value.trim(), presentacion = f('presentacion').value.trim();
  const categoria = f('categoria').value.trim(), unidad = f('unidad').value;
  const precio = num(f('precio').value), minimo = num(f('minimo').value);
  const sku = f('sku').value.trim();
  const hayCosto = !!f('costo');
  const costo = hayCosto ? (f('costo').value === '' ? null : num(f('costo').value)) : undefined;
  if (hayCosto && costo !== null && (isNaN(costo) || costo < 0)) return toast('Escribe un costo válido', 'err');
  const stock = id ? null : (f('stock') && f('stock').value !== '' ? num(f('stock').value) : 0);
  if (!nombre) return toast('Escribe el nombre del producto', 'err');
  if (isNaN(precio) || precio < 0) return toast('Escribe un precio válido', 'err');
  if (!id && (isNaN(stock) || stock < 0)) return toast('Escribe un stock válido', 'err');
  if (unidad === 'und' && !id && !Number.isInteger(stock)) return toast('Los productos por unidad llevan cantidades enteras', 'err');
  const dup = S.db.productos.find(p => p.id !== id && norm(p.nombre) === norm(nombre) && norm(p.presentacion || '') === norm(presentacion));
  if (dup) return toast('Ya existe un producto con ese nombre y presentación', 'err');
  if (categoria && !S.db.categorias.some(c => norm(c) === norm(categoria))) S.db.categorias.push(categoria);

  if (id) {
    Object.assign(Calc.prod(id), { nombre, presentacion, categoria, precio, minimo: isNaN(minimo) ? S.db.config.stockMinimo : minimo, sku });
    if (hayCosto) Calc.prod(id).costo = costo;
    toast('Producto actualizado');
  } else {
    const p = { id: uid(), nombre, presentacion, categoria, unidad, precio, stock: rq(stock), minimo: isNaN(minimo) ? MIN_DEFAULT[unidad] : minimo, sku, creado: new Date().toISOString() };
    if (hayCosto) p.costo = costo;
    S.db.productos.push(p);
    if (p.stock > 0) S.db.movimientos.push({ id: uid(), fecha: new Date().toISOString(), pid: p.id, nombre: nombreCompleto(p), tipo: 'entrada', cant: p.stock, unidad, nota: 'Stock inicial' });
    toast('Producto agregado');
  }
  closeTopModal(); Storage.save(); App.render();
};

Actions['prod-borrar'] = async t => {
  const p = Calc.prod(t.dataset.id); if (!p) return;
  const ok = await confirmDialog({ title: 'Eliminar producto', msg: `¿Seguro que quieres eliminar <b>${esc(nombreCompleto(p))}</b> del inventario? El historial de ventas no se borra.`, ok: 'Eliminar', danger: true });
  if (!ok) return;
  S.db.productos = S.db.productos.filter(x => x.id !== p.id);
  S.pos.cart = S.pos.cart.filter(c => c.pid !== p.id);
  Storage.save(); App.render(); toast('Producto eliminado');
};

Actions['prod-demo'] = () => {
  DEMO.forEach(([nombre, presentacion, categoria, unidad, precio, stock]) => {
    const p = { id: uid(), nombre, presentacion, categoria, unidad, precio, stock, minimo: MIN_DEFAULT[unidad], sku: '', creado: new Date().toISOString() };
    S.db.productos.push(p);
    S.db.movimientos.push({ id: uid(), fecha: new Date().toISOString(), pid: p.id, nombre: nombreCompleto(p), tipo: 'entrada', cant: stock, unidad, nota: 'Stock inicial' });
  });
  Storage.save(); App.render(); toast('Productos de ejemplo cargados');
};

/* ----- Ajuste de stock ----- */
Actions['prod-stock'] = t => {
  const p = Calc.prod(t.dataset.id); if (!p) return;
  const units = compatibleUnits(p.unidad);
  openModal({
    title: 'Ajustar stock',
    html: `<div class="form">
      <div><b>${esc(nombreCompleto(p))}</b><div class="muted">Stock actual: ${fmtQty(p.stock)} ${uShort(p.unidad)}</div></div>
      <div class="field"><label>¿Qué quieres hacer?</label>
        <select class="select" name="tipo" data-input="stk-prev">
          <option value="entrada">Agregar mercancía (entrada)</option>
          <option value="salida">Quitar mercancía (merma, daño, consumo)</option>
          <option value="fijar">Corregir el total (conteo físico)</option>
        </select></div>
      <div class="field-row">
        <div class="field"><label>Cantidad</label><input class="input" name="cant" type="number" inputmode="decimal" step="any" min="0" placeholder="0" data-input="stk-prev" autofocus></div>
        <div class="field"><label>Unidad</label><select class="select" name="ud" data-input="stk-prev">${units.map(u => `<option value="${u}" ${u === p.unidad ? 'selected' : ''}>${UNITS[u].short}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Nota (opcional)</label><input class="input" name="nota" placeholder="Ej: compra al proveedor" autocomplete="off"></div>
      <div class="preview-box"><span class="muted">Quedará en</span><b id="stk-new">${fmtQty(p.stock)} ${uShort(p.unidad)}</b></div>
    </div>`,
    footer: `<button class="btn" data-modal-close>Cancelar</button><button class="btn btn-primary" data-submit data-action="stk-guardar" data-id="${p.id}">${icon('check')}Guardar</button>`
  });
};
function calcStock(m, p) {
  const tipo = $('[name=tipo]', m).value, ud = $('[name=ud]', m).value;
  const c = num($('[name=cant]', m).value);
  if (isNaN(c)) return { nuevo: p.stock, delta: 0, valid: false };
  const q = convert(c, ud, p.unidad);
  const nuevo = tipo === 'entrada' ? rq(p.stock + q) : tipo === 'salida' ? rq(p.stock - q) : q;
  return { nuevo, delta: rq(nuevo - p.stock), valid: true, tipo };
}
Inputs['stk-prev'] = t => {
  const m = t.closest('.modal'), p = Calc.prod($('[data-action=stk-guardar]', m).dataset.id);
  const r = calcStock(m, p);
  const el = $('#stk-new', m);
  el.textContent = `${fmtQty(r.nuevo)} ${uShort(p.unidad)}`;
  el.style.color = r.nuevo < 0 ? 'var(--danger)' : '';
};
Actions['stk-guardar'] = t => {
  const m = t.closest('.modal'), p = Calc.prod(t.dataset.id);
  const r = calcStock(m, p);
  if (!r.valid || Number($('[name=cant]', m).value) < 0) return toast('Escribe una cantidad válida', 'err');
  if (r.nuevo < 0) return toast('No puedes quitar más de lo que hay en stock', 'err');
  if (p.unidad === 'und' && !Number.isInteger(r.nuevo)) return toast('Este producto se maneja en unidades enteras', 'err');
  if (r.delta === 0) return toast('No hay cambios que guardar', 'err');
  p.stock = r.nuevo;
  S.db.movimientos.push({ id: uid(), fecha: new Date().toISOString(), pid: p.id, nombre: nombreCompleto(p), tipo: r.tipo === 'fijar' ? 'ajuste' : r.tipo, cant: r.delta, unidad: p.unidad, nota: $('[name=nota]', m).value.trim() });
  closeTopModal(); Storage.save(); App.render(); toast('Stock actualizado');
};
