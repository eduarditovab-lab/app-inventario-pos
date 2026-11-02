'use strict';
/* =====================================================================
   reportes.js — Generación de PDF (sin librerías externas), ticket como
   imagen, impresión y exportación a Excel (CSV).
   ===================================================================== */

/* ---------- Mini generador de PDF ---------- */
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584
];
function pdfTextWidth(str, size, bold) {
  let w = 0;
  for (const ch of String(str)) {
    let c = ch.charCodeAt(0);
    if (c > 126 || c < 32) { c = (ch.normalize('NFD')[0] || '?').charCodeAt(0); if (c > 126 || c < 32) c = 110; }
    let cw = HELV[c - 32] || 556;
    if (bold && !(c >= 48 && c <= 57)) cw *= 1.07;
    w += cw;
  }
  return w * size / 1000;
}
function pdfFit(str, size, maxW, bold) {
  str = String(str);
  if (pdfTextWidth(str, size, bold) <= maxW) return str;
  while (str.length > 1 && pdfTextWidth(str + '...', size, bold) > maxW) str = str.slice(0, -1);
  return str.trimEnd() + '...';
}
const hex01 = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

class MiniPDF {
  constructor(w = 595.28, h = 841.89) { this.W = w; this.H = h; this.pages = []; this.images = []; this.cur = null; this.addPage(); }
  addPage(h) { this.cur = { ops: [], h: h || this.H }; this.pages.push(this.cur); }
  _y(y) { return (this.cur.h - y).toFixed(2); }
  _clean(s) {
    return String(s).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
      .replace(/[^\x00-\xff]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
  text(str, x, y, { size = 10, bold = false, align = 'left', color = [0, 0, 0] } = {}) {
    const w = pdfTextWidth(str, size, bold);
    if (align === 'right') x -= w; else if (align === 'center') x -= w / 2;
    this.cur.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color.map(c => c.toFixed(3)).join(' ')} rg ${x.toFixed(2)} ${this._y(y)} Td (${this._clean(str)}) Tj ET`);
  }
  rect(x, y, w, h, { fill = null, stroke = null, lw = 0.5 } = {}) {
    let op = '';
    if (fill) op += `${fill.map(c => c.toFixed(3)).join(' ')} rg `;
    if (stroke) op += `${stroke.map(c => c.toFixed(3)).join(' ')} RG ${lw} w `;
    op += `${x.toFixed(2)} ${(this.cur.h - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`;
    this.cur.ops.push(op);
  }
  line(x1, y1, x2, y2, { color = [.8, .8, .8], lw = 0.5 } = {}) {
    this.cur.ops.push(`${color.map(c => c.toFixed(3)).join(' ')} RG ${lw} w ${x1.toFixed(2)} ${this._y(y1)} m ${x2.toFixed(2)} ${this._y(y2)} l S`);
  }
  image(img, x, y, w, h) {                       // img = { data:Uint8Array(JPEG), w, h }
    let idx = this.images.indexOf(img);
    if (idx < 0) { this.images.push(img); idx = this.images.length - 1; }
    this.cur.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.cur.h - y - h).toFixed(2)} cm /Im${idx} Do Q`);
  }
  output() {
    const parts = []; let len = 0; const offs = [];
    const enc = s => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
    const push = d => { const b = typeof d === 'string' ? enc(d) : d; parts.push(b); len += b.length; };
    const ni = this.images.length, np = this.pages.length;
    const pageObj = k => 5 + ni + 2 * k;
    const total = 5 + ni + 2 * np;                    // número de objetos + 1 (objeto 0)

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    offs[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offs[2] = len; push(`2 0 obj\n<< /Type /Pages /Kids [${this.pages.map((_, k) => pageObj(k) + ' 0 R').join(' ')}] /Count ${np} >>\nendobj\n`);
    offs[3] = len; push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
    offs[4] = len; push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');
    this.images.forEach((im, i) => {
      const n = 5 + i; offs[n] = len;
      push(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`);
      push(im.data); push('\nendstream\nendobj\n');
    });
    const xobj = this.images.map((_, i) => `/Im${i} ${5 + i} 0 R`).join(' ');
    this.pages.forEach((pg, k) => {
      const po = pageObj(k), co = po + 1;
      offs[po] = len;
      push(`${po} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W.toFixed(2)} ${pg.h.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobj} >> >> /Contents ${co} 0 R >>\nendobj\n`);
      const content = enc(pg.ops.join('\n'));
      offs[co] = len;
      push(`${co} 0 obj\n<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream\nendobj\n');
    });
    const xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }
}

function dataUrlToBytes(url) {
  const b = atob(url.split(',')[1]); const a = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a;
}
function canvasToJpegImage(canvas, q = 0.92) {
  return { data: dataUrlToBytes(canvas.toDataURL('image/jpeg', q)), w: canvas.width, h: canvas.height };
}
function loadImage(src) {
  return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

/* ---------- Ticket (se dibuja en un canvas: sirve para imagen, PDF e impresión) ---------- */
const Ticket = {
  cur: null,

  async canvas(v) {
    const cfg = S.db.config, W = 440, P = 26, SC = 2;
    const logo = await loadImage(cfg.logo);
    const H = 900 + v.items.length * 110;
    const tmp = document.createElement('canvas');
    tmp.width = W * SC; tmp.height = H * SC;
    const c = tmp.getContext('2d');
    c.scale(SC, SC);
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.textBaseline = 'top';
    const FONT = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    const F = (px, w = 400) => `${w} ${px}px ${FONT}`;
    let y = P;

    const wrap = (text, maxW) => {
      const words = String(text).split(/\s+/); const lines = []; let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const center = (text, px, weight = 400, color = '#111', gap = 3) => {
      c.font = F(px, weight); c.fillStyle = color; c.textAlign = 'center';
      wrap(text, W - 2 * P).forEach(l => { c.fillText(l, W / 2, y); y += px * 1.3; });
      y += gap;
    };
    const lr = (l, r, px, weight = 400, color = '#111', colorL = null) => {
      c.font = F(px, weight);
      c.textAlign = 'left'; c.fillStyle = colorL || color; c.fillText(l, P, y);
      c.textAlign = 'right'; c.fillStyle = color; c.fillText(r, W - P, y);
      y += px * 1.45;
    };
    const dash = () => { y += 4; c.strokeStyle = '#9aa'; c.setLineDash([5, 4]); c.lineWidth = 1; c.beginPath(); c.moveTo(P, y); c.lineTo(W - P, y); c.stroke(); c.setLineDash([]); y += 12; };

    if (logo) {
      const mh = 78, k = Math.min(mh / logo.height, 200 / logo.width), lw = logo.width * k, lh = logo.height * k;
      c.drawImage(logo, (W - lw) / 2, y, lw, lh); y += lh + 10;
    }
    center(cfg.negocio || 'Mi Bodega', 26, 800, '#000', 2);
    if (cfg.rif) center('RIF: ' + cfg.rif, 13, 400, '#444', 0);
    if (cfg.direccion) center(cfg.direccion, 13, 400, '#444', 0);
    if (cfg.telefono) center('Tel: ' + cfg.telefono, 13, 400, '#444', 0);
    dash();

    center(v.simulada ? 'PRESUPUESTO' : (cfg.ticketTitulo || 'TICKET DE VENTA'), 17, 800, '#000', 2);
    if (v.simulada) center('Simulación: no descuenta inventario ni es comprobante de pago', 12, 400, '#555', 4);
    else lr('N°', pad6(v.numero), 14, 700);
    const f = new Date(v.fecha);
    lr('Fecha', fmtDateTime(f), 14);
    if (v.cliente) lr('Cliente', v.cliente, 14);
    if (v.pago && !v.simulada) {
      lr('Pago', v.pagoDetalle ? 'Otro' : v.pago, 14);
      if (v.pagoDetalle) {
        c.font = F(13.5); c.fillStyle = '#222'; c.textAlign = 'left';
        wrap(v.pagoDetalle, W - 2 * P).forEach(l => { c.fillText(l, P, y); y += 19; });
        y += 2;
      }
    }
    dash();

    v.items.forEach(it => {
      c.font = F(15, 700); c.fillStyle = '#000'; c.textAlign = 'left';
      wrap(nombreCompleto(it), W - 2 * P).forEach(l => { c.fillText(l, P, y); y += 20; });
      const q = `${fmtQty(it.cantShow ?? it.cant)} ${uShort(it.ud || it.unidad)} × ${usd(it.precio)}/${uShort(it.unidad)}`;
      lr(q, usd(it.subtotal), 13.5, 600, '#000', '#555');
      y += 5;
    });
    dash();

    lr('Subtotal', usd(v.subtotal), 15, 500);
    if (v.descuento > 0) lr(`Descuento (${fmtNum(v.descPct, v.descPct % 1 ? 2 : 0)}%)`, '-' + usd(v.descuento), 15, 500);
    if (v.impuesto > 0) lr(`${v.impNombre || 'Impuesto'} (${fmtNum(v.impPct, v.impPct % 1 ? 2 : 0)}%)`, usd(v.impuesto), 15, 500);
    y += 6;
    lr('TOTAL USD', usd(v.total), 24, 800);
    if (v.tasa > 0) {
      lr('TOTAL Bs', bs(v.totalBs), 24, 800);
      c.font = F(12.5); c.fillStyle = '#555'; c.textAlign = 'right';
      c.fillText(`Tasa: 1 USD = ${bs(v.tasa)}`, W - P, y); y += 20;
    }
    if (v.recibido > 0) {
      y += 6;
      lr('Recibido', fmtM(v.recMoneda, v.recibido), 15, 500);
      lr('VUELTO', fmtM(v.recMoneda, v.vuelto), 19, 800);
    }
    dash();
    if (cfg.pie) center(cfg.pie, 14, 500, '#222', 8);
    center('Comprobante de venta · Documento no fiscal', 11.5, 400, '#666', 0);
    y += P;

    const h = Math.ceil(y);
    const out = document.createElement('canvas');
    out.width = W * SC; out.height = h * SC;
    out.getContext('2d').drawImage(tmp, 0, 0, W * SC, h * SC, 0, 0, W * SC, h * SC);
    return out;
  },

  fileBase(v) { return (v.simulada ? 'Presupuesto' : 'Ticket-' + pad6(v.numero)) + '_' + toInputDate(new Date(v.fecha)); },

  async openModal(v, { title = 'Ticket', exito = false } = {}) {
    const canvas = await Ticket.canvas(v);
    Ticket.cur = { v, canvas };
    const url = canvas.toDataURL('image/png');
    openModal({
      title,
      html: `${exito ? `<p class="muted-p" style="margin-bottom:12px">La venta se guardó y se descontó del inventario.</p>` : ''}
             <div class="ticket-wrap"><img class="ticket-img" src="${url}" alt="Ticket"></div>`,
      footer: `<div class="btn-row">
          <button class="btn" data-action="tk-pdf">${icon('pdf')}PDF</button>
          <button class="btn" data-action="tk-img">${icon('image')}Imagen</button>
          <button class="btn" data-action="tk-print">${icon('print')}Imprimir</button>
          <button class="btn" data-action="tk-share">${icon('share')}Enviar</button>
        </div>
        ${exito ? `<button class="btn btn-primary btn-block" data-modal-close>Nueva venta</button>` : ''}`
    });
  },

  pdfBlob() {
    const { canvas } = Ticket.cur;
    const w = 226.77, h = w * canvas.height / canvas.width;
    const doc = new MiniPDF(w, h);
    doc.image(canvasToJpegImage(canvas), 0, 0, w, h);
    return doc.output();
  },
  imgBlob() { return new Promise(res => Ticket.cur.canvas.toBlob(res, 'image/png')); },
  print() {
    const area = $('#print-area');
    const img = new Image();
    img.className = 'print-ticket';
    area.innerHTML = '';
    area.appendChild(img);
    $('#page-style').textContent = '@page { size: 80mm auto; margin: 0 }';
    img.onload = () => setTimeout(() => window.print(), 50);
    img.src = Ticket.cur.canvas.toDataURL('image/png');
  }
};
window.addEventListener('afterprint', () => { $('#print-area').innerHTML = ''; $('#page-style').textContent = ''; });

Actions['tk-pdf'] = () => downloadBlob(Ticket.pdfBlob(), Ticket.fileBase(Ticket.cur.v) + '.pdf');
Actions['tk-img'] = async () => downloadBlob(await Ticket.imgBlob(), Ticket.fileBase(Ticket.cur.v) + '.png');
Actions['tk-print'] = () => Ticket.print();
Actions['tk-share'] = async () => shareOrDownload(await Ticket.imgBlob(), Ticket.fileBase(Ticket.cur.v) + '.png', 'Ticket de venta');

/* ---------- Reportes en PDF (tablas A4, con varios bloques y filas de varias líneas) ---------- */
function pdfWrapLines(str, size, maxW, bold) {
  const words = String(str ?? '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (pdfTextWidth(t, size, bold) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return (lines.length ? lines : ['']).map(l => pdfFit(l, size, maxW, bold));
}

/** Un bloque = { titulo?, cols, rows, resumen? }. Si pasas cols/rows sueltos se usa un solo bloque.
 *  En cada columna, get() puede devolver texto o una lista de líneas; con wrap:true el texto largo baja de línea. */
async function buildTablePDF({ titulo, subtitulo = '', cols, rows, resumen = [], bloques }) {
  const cfg = S.db.config;
  bloques = bloques || [{ cols, rows, resumen }];
  const doc = new MiniPDF();
  const M = 36, CW = doc.W - 2 * M, ROW = 19, LH = 11, LIMIT = doc.H - M - 28;
  const brand = hex01(cfg.color || '#0f766e');
  const onBrand = [1, 1, 1];
  const grey = [.42, .45, .5];
  const logoImg = await loadImage(cfg.logo);
  const logo = logoImg ? (() => {
    const k = 120 / Math.max(logoImg.width, logoImg.height);
    const cv = document.createElement('canvas'); cv.width = Math.round(logoImg.width * k); cv.height = Math.round(logoImg.height * k);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(logoImg, 0, 0, cv.width, cv.height);
    return canvasToJpegImage(cv, 0.9);
  })() : null;
  let y, cur, widths;

  const tableHead = () => {
    doc.rect(M, y, CW, ROW + 2, { fill: brand });
    let x = M;
    cur.cols.forEach((c, i) => {
      const tx = c.align === 'right' ? x + widths[i] - 6 : x + 6;
      doc.text(c.title, tx, y + 13.5, { size: 8.5, bold: true, color: onBrand, align: c.align === 'right' ? 'right' : 'left' });
      x += widths[i];
    });
    y += ROW + 2;
  };
  const header = first => {
    y = M;
    if (first) {
      let x = M;
      if (logo) {
        const k = 44 / Math.max(logo.w, logo.h);
        doc.image(logo, M, y, logo.w * k, logo.h * k);
        x += logo.w * k + 12;
      }
      doc.text(cfg.negocio || 'Mi Bodega', x, y + 17, { size: 19, bold: true });
      doc.text(titulo, x, y + 33, { size: 11, color: grey });
      doc.text('Generado: ' + fmtDateTime(new Date()), doc.W - M, y + 14, { size: 8.5, color: grey, align: 'right' });
      if (subtitulo) doc.text(subtitulo, doc.W - M, y + 26, { size: 8.5, color: grey, align: 'right' });
      if (Calc.hasTasa()) doc.text(`Tasa: 1 USD = ${bs(cfg.tasa)}`, doc.W - M, y + 38, { size: 8.5, color: grey, align: 'right' });
      y += 62;
    } else {
      doc.text(`${cfg.negocio || ''} · ${titulo}`, M, y + 8, { size: 8.5, color: grey });
      y += 22;
    }
  };
  const nuevaPagina = () => { doc.addPage(); header(false); };

  header(true);
  bloques.forEach((b, bi) => {
    cur = b;
    const totalW = b.cols.reduce((s, c) => s + c.w, 0);
    widths = b.cols.map(c => c.w / totalW * CW);
    if (b.titulo) {
      if (y + 70 > LIMIT) nuevaPagina();
      if (bi > 0) y += 8;
      doc.text(b.titulo, M, y + 12, { size: 11, bold: true });
      y += 20;
    } else if (y + 60 > LIMIT) nuevaPagina();
    tableHead();
    b.rows.forEach((r, ri) => {
      const cells = b.cols.map((c, i) => {
        const raw = c.get(r);
        const w = widths[i] - 12;
        if (Array.isArray(raw)) return raw.map(s => pdfFit(String(s), 8.5, w, !!c.bold));
        return c.wrap ? pdfWrapLines(raw, 8.5, w, !!c.bold) : [pdfFit(String(raw ?? ''), 8.5, w, !!c.bold)];
      });
      const n = Math.max(1, ...cells.map(l => l.length));
      const h = n === 1 ? ROW : 8 + n * LH;
      if (y + h > LIMIT) { nuevaPagina(); tableHead(); }
      if (ri % 2 === 1) doc.rect(M, y, CW, h, { fill: [.96, .97, .98] });
      let x = M;
      b.cols.forEach((c, i) => {
        const bold = !!c.bold;
        const col = c.color ? (c.color(r) || [0.07, 0.09, 0.13]) : [0.07, 0.09, 0.13];
        cells[i].forEach((ln, k) => doc.text(ln, c.align === 'right' ? x + widths[i] - 6 : x + 6, y + 13 + k * LH, { size: 8.5, bold, color: col, align: c.align === 'right' ? 'right' : 'left' }));
        x += widths[i];
      });
      doc.line(M, y + h, M + CW, y + h, { color: [.9, .91, .93], lw: .4 });
      y += h;
    });
    if (!b.rows.length) { doc.text('Sin registros para mostrar.', M + 6, y + 18, { size: 10, color: grey }); y += 28; }

    const res = b.resumen || [];
    if (res.length) {
      const bh = 12 + res.length * 16 + 8;
      if (y + bh + 14 > doc.H - M - 20) { doc.addPage(); y = M; }
      y += 14;
      const bw = 230, bx = doc.W - M - bw;
      doc.rect(bx, y, bw, bh, { fill: [.96, .97, .98], stroke: [.88, .9, .92] });
      res.forEach((r, i) => {
        const last = i === res.length - 1;
        doc.text(r[0], bx + 12, y + 20 + i * 16, { size: last ? 10 : 9, bold: last, color: last ? [0, 0, 0] : grey });
        doc.text(r[1], bx + bw - 12, y + 20 + i * 16, { size: last ? 10 : 9, bold: true, align: 'right' });
      });
      y += bh;
    }
    y += 12;
  });
  const n = doc.pages.length;
  doc.pages.forEach((p, i) => { doc.cur = p; doc.text(`Página ${i + 1} de ${n}`, doc.W / 2, doc.H - 20, { size: 8, color: grey, align: 'center' }); });
  return doc.output();
}

/* ---------- Excel real (.xlsx) con bordes, sin librerías ---------- */
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zipStore(files) {                       // files: [{name, data(string)}]  (sin compresión)
  const te = new TextEncoder(), parts = [], central = []; let off = 0;
  files.forEach(f => {
    const name = te.encode(f.name), data = te.encode(f.data), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  });
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** cols: [{title, w, tipo:'texto'|'dinero'|'cant'}]  rows: [[valores]]  total: fila opcional (array, null = vacío) */
function xlsxBlob(opts) {
  const hojas = opts.hojas || [opts];
  const X = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const L = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const brand = (S.db.config.color || '#0f766e').replace('#', '').toUpperCase();
  const [r, g, b] = hex01('#' + brand); const claro = (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.6;
  // estilos: 0 normal | 1 encabezado | 2 texto | 3 dinero | 4 cantidad | 5 total texto | 6 total dinero
  const styleOf = t => t === 'dinero' ? 3 : t === 'cant' ? 4 : 2;
  const cell0 = (v, ref, s) => (v === null || v === undefined || v === '')
    ? `<c r="${ref}" s="${s}"/>`
    : (typeof v === 'number' ? `<c r="${ref}" s="${s}"><v>${v}</v></c>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`);
  const cell = (v, ref, s) => (v && typeof v === 'object') ? cell0(v.v, ref, styleOf(v.t)) : cell0(v, ref, s);
  const sheetXml = ({ cols, rows, total }) => {
  let n = 1;
  let sheetRows = `<row r="1" ht="24" customHeight="1">${cols.map((c, i) => cell(c.title, L(i) + 1, 1)).join('')}</row>`;
  rows.forEach(rw => { n++; sheetRows += `<row r="${n}">${cols.map((c, i) => cell(rw[i], L(i) + n, styleOf(c.tipo))).join('')}</row>`; });
  if (total) { n++; sheetRows += `<row r="${n}">${cols.map((c, i) => cell(total[i], L(i) + n, c.tipo === 'dinero' ? 6 : 5)).join('')}</row>`; }
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData></worksheet>`;
  return sheet;
  };
  const border = '<border><left style="thin"><color rgb="FF8A8F98"/></left><right style="thin"><color rgb="FF8A8F98"/></right><top style="thin"><color rgb="FF8A8F98"/></top><bottom style="thin"><color rgb="FF8A8F98"/></bottom><diagonal/></border>';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="${claro ? 'FF111111' : 'FFFFFFFF'}"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${brand}"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF1F4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const N = hojas.length;
  const nums = hojas.map((_, i) => i + 1);
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + nums.map(n => `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${X(h.hoja).slice(0, 30)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + nums.map(n => `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`).join('') + `<Relationship Id="rId${N + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles },
    ...hojas.map((h, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(h) }))
  ]);
}

const Reportes = {
  inventarioRows() {
    return [...S.db.productos].sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
  },
  async inventarioPDF() {
    const rows = Reportes.inventarioRows();
    const tasa = Calc.hasTasa();
    const valor = round2(rows.reduce((s, p) => s + p.stock * p.precio, 0));
    const conCosto = S.db.config.costoActivo;
    const cols = [
      { title: 'PRODUCTO', w: conCosto ? 28 : 34, get: p => nombreCompleto(p), bold: true },
      { title: 'CATEGORÍA', w: conCosto ? 14 : 17, get: p => p.categoria || '-' },
      { title: 'STOCK', w: 14, align: 'right', get: p => `${fmtQty(p.stock)} ${uShort(p.unidad)}`, color: p => Calc.agotado(p) ? [.85, .18, .13] : Calc.stockBajo(p) ? [.71, .28, .03] : null },
      ...(conCosto ? [{ title: 'COSTO USD', w: 11, align: 'right', get: p => p.costo > 0 ? usd(p.costo) : '-' }] : []),
      { title: 'PRECIO USD', w: 12, align: 'right', get: p => usd(p.precio) },
      { title: tasa ? 'PRECIO Bs' : '', w: 12, align: 'right', get: p => tasa ? bs(Calc.toBs(p.precio)) : '' },
      { title: 'VALOR USD', w: 12, align: 'right', get: p => usd(p.stock * p.precio) }
    ];
    const resumen = [['Productos registrados', String(rows.length)], ['Valor del inventario (USD)', usd(valor)]];
    if (tasa) resumen.push(['Valor del inventario (Bs)', bs(Calc.toBs(valor))]);
    const blob = await buildTablePDF({ titulo: 'Inventario de productos', cols, rows, resumen });
    downloadBlob(blob, `Inventario_${toInputDate(new Date())}.pdf`);
    toast('PDF guardado en Descargas');
  },
  inventarioExcel() {
    const tasa = Calc.hasTasa(), rows = Reportes.inventarioRows(), conCosto = S.db.config.costoActivo;
    const tot = round2(rows.reduce((s, p) => s + p.stock * p.precio, 0));
    const totCosto = round2(rows.reduce((s, p) => s + (p.costo > 0 ? p.stock * p.costo : 0), 0));
    const cols = [
      { title: 'Producto', w: 28, get: p => p.nombre },
      { title: 'Presentación', w: 16, get: p => p.presentacion || '' },
      { title: 'Categoría', w: 18, get: p => p.categoria || '' },
      { title: 'Código', w: 12, get: p => p.sku || '' },
      { title: 'Unidad', w: 9, get: p => uShort(p.unidad) },
      { title: 'Stock', w: 11, tipo: 'cant', get: p => rq(p.stock) },
      { title: 'Stock mínimo', w: 13, tipo: 'cant', get: p => rq(Calc.minimo(p)) },
      ...(conCosto ? [
        { title: 'Costo USD', w: 12, tipo: 'dinero', get: p => p.costo > 0 ? p.costo : null },
        { title: '% Ganancia', w: 12, tipo: 'dinero', get: p => p.costo > 0 ? round2(Calc.margen(p)) : null }
      ] : []),
      { title: 'Precio USD', w: 12, tipo: 'dinero', get: p => p.precio },
      { title: 'Precio Bs', w: 14, tipo: 'dinero', get: p => tasa ? Calc.toBs(p.precio) : null },
      ...(conCosto ? [{ title: 'Invertido USD (costo)', w: 20, tipo: 'dinero', get: p => p.costo > 0 ? round2(p.stock * p.costo) : null, total: () => totCosto }] : []),
      { title: 'Valor USD (venta)', w: 17, tipo: 'dinero', get: p => round2(p.stock * p.precio), total: () => tot },
      { title: 'Valor Bs (venta)', w: 17, tipo: 'dinero', get: p => tasa ? Calc.toBs(p.stock * p.precio) : null, total: () => tasa ? Calc.toBs(tot) : null }
    ];
    const data = rows.map(p => cols.map(c => c.get(p)));
    const total = cols.map((c, i) => c.total ? c.total() : (i === 0 ? 'TOTAL' : null));
    downloadBlob(xlsxBlob({ hoja: 'Inventario', cols, rows: data, total }), `Inventario_${toInputDate(new Date())}.xlsx`);
    toast('Excel guardado en Descargas');
  },
  detalleVenta: v => v.items.map(i => `${fmtQty(i.cantShow ?? i.cant)} ${uShort(i.ud || i.unidad)} ${nombreCompleto(i)}`).join(', '),
  lineasVenta: v => v.items.map(i => `${fmtQty(i.cantShow ?? i.cant)} ${uShort(i.ud || i.unidad)} ${nombreCompleto(i)} · ${usd(i.subtotal)}`),

  /** REPORTE DE VENTAS: lista de cada venta con todos sus productos, uno por línea */
  colsVentasPDF(ok) {
    const tasa = ok.some(v => v.tasa > 0), hayGan = S.db.config.costoActivo && ok.some(v => v.ganancia != null);
    const hayDesc = ok.some(v => v.descuento > 0);
    return [
      { title: 'N°', w: 8, get: v => pad6(v.numero || 0).slice(-4), bold: true },
      { title: 'FECHA', w: 13, get: v => { const d = new Date(v.fecha); return [fmtDate(d), fmtTime(d)]; } },
      { title: 'PRODUCTOS', w: 35, get: v => Reportes.lineasVenta(v) },
      { title: 'PAGO', w: 14, wrap: true, get: v => pagoTxt(v) },
      ...(hayDesc ? [{ title: 'DESC.', w: 9, align: 'right', get: v => v.descuento > 0 ? '-' + usd(v.descuento) : '-' }] : []),
      { title: 'TOTAL USD', w: 12, align: 'right', get: v => usd(v.total), bold: true },
      ...(tasa ? [{ title: 'TOTAL Bs', w: 13, align: 'right', get: v => v.tasa > 0 ? bs(v.totalBs) : '' }] : []),
      ...(hayGan ? [{ title: 'GANANCIA', w: 11, align: 'right', get: v => v.ganancia != null ? usd(v.ganancia) : '-' }] : [])
    ];
  },
  async ventasPDF(ventas, etiqueta) {
    const ok = ventas.filter(v => !v.anulada).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const tasa = ok.some(v => v.tasa > 0), hayGan = S.db.config.costoActivo && ok.some(v => v.ganancia != null);
    const resumen = [['Cantidad de ventas', String(ok.length)]];
    const desc = Calc.sum(ok, 'descuento'); if (desc > 0) resumen.push(['Descuentos otorgados (USD)', usd(desc)]);
    const imp = Calc.sum(ok, 'impuesto'); if (imp > 0) resumen.push(['Impuestos incluidos (USD)', usd(imp)]);
    if (tasa) resumen.push(['Total en Bs', bs(Calc.sum(ok, 'totalBs'))]);
    if (hayGan) resumen.push(['Ganancia estimada (USD)', usd(Calc.sum(ok.filter(v => v.ganancia != null), 'ganancia'))]);
    resumen.push(['TOTAL VENDIDO (USD)', usd(Calc.sum(ok, 'total'))]);
    const blob = await buildTablePDF({ titulo: 'Reporte de ventas', subtitulo: etiqueta, cols: Reportes.colsVentasPDF(ok), rows: ok, resumen });
    downloadBlob(blob, `Ventas_${etiqueta.replace(/[^\w]+/g, '_')}.pdf`);
    toast('PDF guardado en Descargas');
  },
  ventasExcel(ventas, etiqueta) {
    const orden = [...ventas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const ok = orden.filter(v => !v.anulada);
    const hayGan = S.db.config.costoActivo && ok.some(v => v.ganancia != null);
    const cols = [
      { title: 'N°', w: 9, get: v => pad6(v.numero || 0) },
      { title: 'Fecha', w: 12, get: v => fmtDate(new Date(v.fecha)) },
      { title: 'Hora', w: 11, get: v => fmtTime(new Date(v.fecha)) },
      { title: 'Cliente', w: 18, get: v => v.cliente || '' },
      { title: 'Pago', w: 24, get: v => pagoTxt(v) },
      { title: 'Productos', w: 50, get: v => v.items.map(i => `${fmtQty(i.cantShow ?? i.cant)} ${uShort(i.ud || i.unidad)} ${nombreCompleto(i)} (${usd(i.subtotal)})`).join('\n'), total: () => `${ok.length} ventas válidas` },
      { title: 'Subtotal USD', w: 13, tipo: 'dinero', get: v => v.subtotal, total: () => Calc.sum(ok, 'subtotal') },
      { title: 'Descuento USD', w: 14, tipo: 'dinero', get: v => v.descuento, total: () => Calc.sum(ok, 'descuento') },
      { title: 'Impuesto USD', w: 13, tipo: 'dinero', get: v => v.impuesto, total: () => Calc.sum(ok, 'impuesto') },
      { title: 'Total USD', w: 13, tipo: 'dinero', get: v => v.total, total: () => Calc.sum(ok, 'total') },
      { title: 'Tasa', w: 10, tipo: 'dinero', get: v => v.tasa || null },
      { title: 'Total Bs', w: 15, tipo: 'dinero', get: v => v.tasa ? v.totalBs : null, total: () => Calc.sum(ok, 'totalBs') },
      ...(hayGan ? [{ title: 'Ganancia USD', w: 14, tipo: 'dinero', get: v => v.ganancia, total: () => Calc.sum(ok.filter(v => v.ganancia != null), 'ganancia') }] : []),
      { title: 'Estado', w: 10, get: v => v.anulada ? 'Anulada' : 'Válida' }
    ];
    const data = orden.map(v => cols.map(c => c.get(v)));
    const total = cols.map((c, i) => c.total ? c.total() : (i === 0 ? 'TOTAL' : null));
    downloadBlob(xlsxBlob({ hoja: 'Ventas', cols, rows: data, total }), `Ventas_${etiqueta.replace(/[^\w]+/g, '_')}.xlsx`);
    toast('Excel guardado en Descargas');
  },

  /** CIERRE (día / semana / mes / año): todo lo de dinero del periodo para cuadrar la caja */
  datosCierre(per, ref) {
    const cfg = S.db.config, r = rangoPeriodo(per, ref);
    const todas = S.db.ventas.filter(v => { const d = new Date(v.fecha); return d >= r.from && d < r.to; })
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const ok = todas.filter(v => !v.anulada), anuladas = todas.length - ok.length;
    const tasa = ok.some(v => v.tasa > 0);
    const hayGan = !!cfg.costoActivo && ok.some(v => v.ganancia != null);
    const conGan = ok.filter(v => v.ganancia != null);
    const bsGan = round2(conGan.reduce((s, v) => s + (v.tasa > 0 ? v.ganancia * v.tasa : 0), 0));
    const total = Calc.sum(ok, 'total');

    // 1) Resumen
    const resumen = [['Ventas realizadas', { v: ok.length, t: 'cant' }, null]];
    resumen.push(['Subtotal', Calc.sum(ok, 'subtotal'), null]);
    const desc = Calc.sum(ok, 'descuento'); if (desc > 0) resumen.push(['Descuentos', -desc, null]);
    const imp = Calc.sum(ok, 'impuesto'); if (imp > 0) resumen.push([`${cfg.impuestoNombre || 'Impuesto'} cobrado`, imp, null]);
    resumen.push(['TOTAL VENDIDO', total, tasa ? Calc.sum(ok, 'totalBs') : null]);
    resumen.push(['Promedio por venta', ok.length ? round2(total / ok.length) : 0, null]);
    if (hayGan) resumen.push(['GANANCIA ESTIMADA', Calc.sum(conGan, 'ganancia'), tasa ? bsGan : null]);
    if (anuladas) resumen.push(['Ventas anuladas (no incluidas)', { v: anuladas, t: 'cant' }, null]);

    // 2) Por forma de pago
    const pm = {};
    ok.forEach(v => { const k = v.pago || 'Sin indicar'; const x = pm[k] = pm[k] || { pago: k, n: 0, usd: 0, bs: 0 }; x.n++; x.usd += v.total; x.bs += v.totalBs || 0; });
    const pagos = Object.values(pm).sort((a, b) => b.usd - a.usd).map(x => ({ ...x, usd: round2(x.usd), bs: round2(x.bs) }));

    // 3) Por día (semana / mes) o por mes (año)
    const buckets = [];
    if (per === 'ano') for (let m = 0; m < 12; m++) buckets.push({ label: cap(MESES[m]), a: new Date(r.from.getFullYear(), m, 1), b: new Date(r.from.getFullYear(), m + 1, 1) });
    else if (per !== 'dia') for (let d = new Date(r.from); d < r.to; d = addDays(d, 1)) buckets.push({ label: `${cap(DIAS[d.getDay()])} ${fmtDate(d)}`, a: d, b: addDays(d, 1) });
    const desglose = buckets.map(k => {
      const vs = ok.filter(v => { const d = new Date(v.fecha); return d >= k.a && d < k.b; });
      const g = vs.filter(v => v.ganancia != null);
      return { label: k.label, n: vs.length, usd: Calc.sum(vs, 'total'), bs: Calc.sum(vs, 'totalBs'), gan: Calc.sum(g, 'ganancia') };
    }).filter(x => x.n > 0);

    // 4) Productos vendidos (la ganancia ya descuenta el descuento de cada venta)
    const pr = {};
    ok.forEach(v => {
      const f = v.subtotal > 0 ? 1 - (v.descuento || 0) / v.subtotal : 1;
      v.items.forEach(i => {
        const k = (i.pid || i.nombre) + '|' + i.unidad;
        const x = pr[k] = pr[k] || { nombre: nombreCompleto(i), unidad: i.unidad, cant: 0, usd: 0, gan: 0, conCosto: false };
        x.cant += i.cant; x.usd += i.subtotal * f;
        if (i.costo != null) { x.conCosto = true; x.gan += i.subtotal * f - i.costo * i.cant; }
      });
    });
    const productos = Object.values(pr).sort((a, b) => b.usd - a.usd).map(x => ({ ...x, cant: rq(x.cant), usd: round2(x.usd), gan: round2(x.gan) }));
    return { r, per, todas, ok, anuladas, tasa, hayGan, resumen, pagos, desglose, productos, total };
  },

  async cierrePDF(per, ref) {
    const D = Reportes.datosCierre(per, ref);
    const { ok, tasa, hayGan } = D;
    const nombre = { dia: 'diario', semana: 'semanal', mes: 'mensual', ano: 'anual' }[per];
    const m = x => x === null || x === undefined ? '' : (typeof x === 'object' ? String(x.v) : (x < 0 ? '-' + usd(-x) : usd(x)));
    const bloques = [
      {
        titulo: 'Resumen del periodo',
        cols: [{ title: 'CONCEPTO', w: 50, get: x => x[0], bold: true }, { title: 'USD', w: 25, align: 'right', get: x => m(x[1]) }, ...(tasa ? [{ title: 'Bs', w: 25, align: 'right', get: x => x[2] === null ? '' : bs(x[2]) }] : [])],
        rows: D.resumen
      },
      {
        titulo: 'Por forma de pago',
        cols: [{ title: 'FORMA DE PAGO', w: 40, get: x => x.pago, bold: true }, { title: 'VENTAS', w: 12, align: 'right', get: x => String(x.n) }, { title: 'TOTAL USD', w: 24, align: 'right', get: x => usd(x.usd) }, ...(tasa ? [{ title: 'TOTAL Bs', w: 24, align: 'right', get: x => x.bs ? bs(x.bs) : '' }] : [])],
        rows: D.pagos
      }
    ];
    if (per !== 'dia') bloques.push({
      titulo: per === 'ano' ? 'Por mes' : 'Por día',
      cols: [{ title: per === 'ano' ? 'MES' : 'DÍA', w: 30, get: x => x.label, bold: true }, { title: 'VENTAS', w: 12, align: 'right', get: x => String(x.n) }, { title: 'VENDIDO USD', w: 18, align: 'right', get: x => usd(x.usd) }, ...(tasa ? [{ title: 'VENDIDO Bs', w: 20, align: 'right', get: x => x.bs ? bs(x.bs) : '' }] : []), ...(hayGan ? [{ title: 'GANANCIA USD', w: 18, align: 'right', get: x => usd(x.gan) }] : [])],
      rows: D.desglose
    });
    bloques.push({
      titulo: 'Productos vendidos',
      cols: [{ title: 'PRODUCTO', w: 44, get: x => x.nombre, bold: true }, { title: 'CANTIDAD', w: 18, align: 'right', get: x => `${fmtQty(x.cant)} ${uShort(x.unidad)}` }, { title: 'VENDIDO USD', w: 19, align: 'right', get: x => usd(x.usd) }, ...(hayGan ? [{ title: 'GANANCIA USD', w: 19, align: 'right', get: x => x.conCosto ? usd(x.gan) : '-' }] : [])],
      rows: D.productos
    });
    bloques.push({ titulo: 'Detalle de las ventas', cols: Reportes.colsVentasPDF(ok), rows: ok });
    const blob = await buildTablePDF({ titulo: `Cierre ${nombre}`, subtitulo: D.r.label, bloques });
    downloadBlob(blob, `Cierre_${nombre}_${D.r.label.replace(/[^\w]+/g, '_')}.pdf`);
    toast('Cierre guardado en Descargas');
  },

  cierreExcel(per, ref) {
    const D = Reportes.datosCierre(per, ref);
    const { ok, tasa, hayGan } = D;
    const nombre = { dia: 'diario', semana: 'semanal', mes: 'mensual', ano: 'anual' }[per];
    const hojas = [
      { hoja: 'Resumen', cols: [{ title: 'Concepto', w: 34, get: 0 }, { title: 'USD', w: 16, tipo: 'dinero' }, ...(tasa ? [{ title: 'Bs', w: 18, tipo: 'dinero' }] : [])], rows: D.resumen.map(x => tasa ? x : [x[0], x[1]]) },
      { hoja: 'Formas de pago', cols: [{ title: 'Forma de pago', w: 26 }, { title: 'Ventas', w: 10, tipo: 'cant' }, { title: 'Total USD', w: 14, tipo: 'dinero' }, ...(tasa ? [{ title: 'Total Bs', w: 16, tipo: 'dinero' }] : [])], rows: D.pagos.map(x => [x.pago, x.n, x.usd, ...(tasa ? [x.bs || null] : [])]), total: ['TOTAL', ok.length, D.total, ...(tasa ? [Calc.sum(ok, 'totalBs')] : [])] }
    ];
    if (per !== 'dia') hojas.push({
      hoja: per === 'ano' ? 'Por mes' : 'Por día',
      cols: [{ title: per === 'ano' ? 'Mes' : 'Día', w: 26 }, { title: 'Ventas', w: 10, tipo: 'cant' }, { title: 'Vendido USD', w: 15, tipo: 'dinero' }, ...(tasa ? [{ title: 'Vendido Bs', w: 16, tipo: 'dinero' }] : []), ...(hayGan ? [{ title: 'Ganancia USD', w: 15, tipo: 'dinero' }] : [])],
      rows: D.desglose.map(x => [x.label, x.n, x.usd, ...(tasa ? [x.bs || null] : []), ...(hayGan ? [x.gan] : [])]),
      total: ['TOTAL', ok.length, D.total, ...(tasa ? [Calc.sum(ok, 'totalBs')] : []), ...(hayGan ? [Calc.sum(ok.filter(v => v.ganancia != null), 'ganancia')] : [])]
    });
    hojas.push({
      hoja: 'Productos vendidos',
      cols: [{ title: 'Producto', w: 34 }, { title: 'Unidad', w: 9 }, { title: 'Cantidad', w: 12, tipo: 'cant' }, { title: 'Vendido USD', w: 15, tipo: 'dinero' }, ...(hayGan ? [{ title: 'Ganancia USD', w: 15, tipo: 'dinero' }] : [])],
      rows: D.productos.map(x => [x.nombre, uShort(x.unidad), x.cant, x.usd, ...(hayGan ? [x.conCosto ? x.gan : null] : [])]),
      total: ['TOTAL', null, null, round2(D.productos.reduce((s, x) => s + x.usd, 0)), ...(hayGan ? [round2(D.productos.reduce((s, x) => s + (x.conCosto ? x.gan : 0), 0))] : [])]
    });
    hojas.push({
      hoja: 'Ventas',
      cols: [{ title: 'N°', w: 9 }, { title: 'Fecha', w: 12 }, { title: 'Hora', w: 11 }, { title: 'Cliente', w: 18 }, { title: 'Pago', w: 24 }, { title: 'Productos', w: 50 }, { title: 'Descuento USD', w: 14, tipo: 'dinero' }, { title: 'Total USD', w: 13, tipo: 'dinero' }, ...(tasa ? [{ title: 'Total Bs', w: 15, tipo: 'dinero' }] : []), ...(hayGan ? [{ title: 'Ganancia USD', w: 14, tipo: 'dinero' }] : [])],
      rows: ok.map(v => [pad6(v.numero || 0), fmtDate(new Date(v.fecha)), fmtTime(new Date(v.fecha)), v.cliente || '', pagoTxt(v), v.items.map(i => `${fmtQty(i.cantShow ?? i.cant)} ${uShort(i.ud || i.unidad)} ${nombreCompleto(i)} (${usd(i.subtotal)})`).join('\n'), v.descuento || null, v.total, ...(tasa ? [v.tasa ? v.totalBs : null] : []), ...(hayGan ? [v.ganancia] : [])]),
      total: ['TOTAL', null, null, null, null, `${ok.length} ventas`, Calc.sum(ok, 'descuento'), D.total, ...(tasa ? [Calc.sum(ok, 'totalBs')] : []), ...(hayGan ? [Calc.sum(ok.filter(v => v.ganancia != null), 'ganancia')] : [])]
    });
    // la hoja "Resumen" usa filas con celdas { v, t } o números
    downloadBlob(xlsxBlob({ hojas }), `Cierre_${nombre}_${D.r.label.replace(/[^\w]+/g, '_')}.xlsx`);
    toast('Cierre guardado en Descargas');
  }
};

const conAviso = f => async () => { try { await f(); } catch (e) { console.error(e); toast('No se pudo crear el archivo', 'err'); } };
Actions['inv-pdf'] = conAviso(() => Reportes.inventarioPDF());
Actions['inv-csv'] = conAviso(() => Reportes.inventarioExcel());
