// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const BASE_URL =
  "https://b2cc2x.api.blue.cl/b2cc2x/svc/emissions-core/v2/asset/emission/os/";

const ESTADOS = [
  { val:"pendiente",  label:"Pendiente",     cls:"b-pendiente" },
  { val:"recibido",   label:"Recibido",      cls:"b-recibido" },
  { val:"reparacion", label:"En reparación", cls:"b-reparacion" },
  { val:"entregado",  label:"Entregado",     cls:"b-entregado" },
  { val:"bodega",     label:"En bodega",     cls:"b-bodega" },
  { val:"descartado", label:"Descartado",    cls:"b-descartado" }
];

const POR_PAGINA = 7;

// ─── ESTADO ───────────────────────────────────────────────────────────────────

let registros   = JSON.parse(localStorage.getItem("os_registros") || "[]");
let lastInfo    = null;
let filtroEstado = "todos";
let busqueda     = "";
let paginaActual = 1;

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.getElementById('osInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') consultarOS();
});

// Barra de búsqueda — se inyecta encima de la tabla desde JS
function inyectarControles() {
  const seccion = document.querySelector('.section-label');

  // Barra búsqueda
  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'margin-bottom:12px;';
  searchWrap.innerHTML = `
    <input type="text" id="searchInput" placeholder="Buscar por OS, remitente u origen..."
      style="width:100%;font-size:12px;padding:8px 12px;" />`;
  seccion.after(searchWrap);

  // Filtros de estado
  const filtrosWrap = document.createElement('div');
  filtrosWrap.id = 'filtrosWrap';
  filtrosWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;';
  filtrosWrap.innerHTML = buildFiltros();
  searchWrap.after(filtrosWrap);

  document.getElementById('searchInput').addEventListener('input', e => {
    busqueda = e.target.value.toLowerCase();
    paginaActual = 1;
    renderTabla();
  });
}

function buildFiltros() {
  const todos = [{ val:"todos", label:"Todos" }, ...ESTADOS];
  return todos.map(e => {
    const activo = filtroEstado === e.val;
    const base = `
      cursor:pointer;font-family:var(--mono);font-size:10px;font-weight:500;
      padding:4px 12px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;
      border:1px solid;transition:opacity .15s;`;
    const estilo = activo
      ? `background:var(--accent);color:#fff;border-color:var(--accent);`
      : `background:var(--bg3);color:var(--text3);border-color:var(--border2);`;
    return `<button onclick="setFiltro('${e.val}')" style="${base}${estilo}">${e.label}</button>`;
  }).join('');
}

function setFiltro(val) {
  filtroEstado = val;
  paginaActual = 1;
  document.getElementById('filtrosWrap').innerHTML = buildFiltros();
  renderTabla();
}

// ─── CONSULTA OS ──────────────────────────────────────────────────────────────

function setStatus(tipo, msg) {
  const el = document.getElementById('statusMsg');
  el.className = 'status-msg';
  if (!tipo) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  if (tipo === 'loading') {
    el.classList.add('status-loading');
    el.innerHTML = `<div class="spinner"></div><span>${msg}</span>`;
  } else if (tipo === 'ok') {
    el.classList.add('status-ok');
    el.innerHTML = `✓ ${msg}`;
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  } else {
    el.classList.add('status-err');
    el.innerHTML = `✕ ${msg}`;
  }
}

async function consultarOS() {
  const os = document.getElementById('osInput').value.trim();
  if (!os) return;

  document.getElementById('resultBox').style.display = 'none';
  document.getElementById('addForm').style.display   = 'none';
  lastInfo = null;

  const pdfUrl = BASE_URL + encodeURIComponent(os) + "/label";

  setStatus('loading', 'Descargando PDF...');

  try {
    const resp = await fetch(pdfUrl);
    if (!resp.ok) throw new Error("HTTP " + resp.status);

    const blob    = await resp.blob();
    const tempUrl = URL.createObjectURL(blob);
    const pdf     = await pdfjsLib.getDocument(tempUrl).promise;

    let texto = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      texto += content.items.map(i => i.str).join(" ") + " ";
    }

    console.log("===== TEXTO PDF =====");
    console.log(texto);

    const remitente = texto.match(/NOMBRE DEL CLIENTE:\s*(.*?)\s{2,}/i)?.[1] || null;
    const origen    = texto.match(/DIR REMITENTE:\s*(.*?)\s{2,}/i)?.[1]     || null;
    const destino   = texto.match(/ENVIAR A:\s*(.*?)\s{2,}/i)?.[1]          || null;
    const fecha     = texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1]         || null;

    lastInfo = {
      os_numero:  os,
      remitente,
      origen,
      equipos:    destino,
      cantidad:   "1",
      fecha,
      estado_doc: "PDF Blue"
    };

    mostrarResultado(pdfUrl);
    setStatus('ok', 'OS procesada correctamente');

  } catch (err) {
    console.error(err);
    setStatus('err', err.message);
  }
}

function mostrarResultado(pdfUrl) {
  document.getElementById('resultOsNum').childNodes[0].textContent =
    "OS — " + lastInfo.os_numero + " ";
  document.getElementById('pdfLink').href = pdfUrl;

  const fields = [
    { k:"Remitente", v:lastInfo.remitente },
    { k:"Origen",    v:lastInfo.origen    },
    { k:"Destino",   v:lastInfo.equipos   },
    { k:"Cantidad",  v:lastInfo.cantidad  },
    { k:"Fecha",     v:lastInfo.fecha     }
  ].filter(f => f.v);

  document.getElementById('resultFields').innerHTML = fields.map(f =>
    `<div class="rf"><div class="rf-k">${esc(f.k)}</div><div class="rf-v">${esc(f.v)}</div></div>`
  ).join('');

  document.getElementById('resultBox').style.display   = 'block';
  document.getElementById('addForm').style.display     = 'block';
  document.getElementById('notaInput').value           = '';
  document.getElementById('estadoSelect').value        = 'pendiente';
}

// ─── AGREGAR REGISTRO ────────────────────────────────────────────────────────

function agregarRegistro() {
  if (!lastInfo) return;
  const estado = document.getElementById('estadoSelect').value;
  const nota   = document.getElementById('notaInput').value.trim();

  registros.unshift({
    id:        Date.now(),
    os:        lastInfo.os_numero,
    remitente: lastInfo.remitente || "—",
    origen:    lastInfo.origen    || "—",
    equipos:   lastInfo.equipos   || "—",
    estado,
    nota,
    fecha: new Date().toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' })
  });

  guardar();
  renderTabla();
  renderStats();

  document.getElementById('resultBox').style.display = 'none';
  document.getElementById('addForm').style.display   = 'none';
  document.getElementById('osInput').value           = '';
  lastInfo = null;
  setStatus('ok', 'OS agregada al registro');
}

// ─── ACCIONES TABLA ───────────────────────────────────────────────────────────

function cambiarEstado(id, val) {
  const r = registros.find(r => r.id === id);
  if (r) { r.estado = val; guardar(); renderStats(); }
}

function guardarNota(id, val) {
  const r = registros.find(r => r.id === id);
  if (r) { r.nota = val; guardar(); }
}

function eliminar(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  registros = registros.filter(r => r.id !== id);
  guardar();
  renderTabla();
  renderStats();
}

function limpiarTodo() {
  if (!registros.length) return;
  if (!confirm('¿Eliminar TODOS los registros? Esta acción no se puede deshacer.')) return;
  registros = [];
  guardar();
  renderTabla();
  renderStats();
}

function guardar() {
  localStorage.setItem("os_registros", JSON.stringify(registros));
}

// ─── FILTRADO Y BÚSQUEDA ──────────────────────────────────────────────────────

function registrosFiltrados() {
  return registros.filter(r => {
    const pasaEstado = filtroEstado === "todos" || r.estado === filtroEstado;
    const pasaBusqueda = !busqueda || [r.os, r.remitente, r.origen]
      .some(v => (v || "").toLowerCase().includes(busqueda));
    return pasaEstado && pasaBusqueda;
  });
}

// ─── RENDER TABLA CON PAGINACIÓN ──────────────────────────────────────────────

function renderTabla() {
  const tbody    = document.getElementById('tableBody');
  const filtrados = registrosFiltrados();
  const total    = filtrados.length;
  const totalPag = Math.ceil(total / POR_PAGINA) || 1;

  if (paginaActual > totalPag) paginaActual = totalPag;

  const inicio = (paginaActual - 1) * POR_PAGINA;
  const pagina = filtrados.slice(inicio, inicio + POR_PAGINA);

  if (!pagina.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${
      busqueda || filtroEstado !== "todos"
        ? "sin resultados para la búsqueda/filtro actual"
        : "sin registros — consulta una OS para comenzar"
    }</td></tr>`;
    renderPaginacion(0, 1);
    return;
  }

  tbody.innerHTML = pagina.map(r => `
    <tr>
      <td class="os-cell">${esc(r.os)}</td>
      <td class="text-muted">${esc(r.remitente)}</td>
      <td class="text-muted">${esc(r.origen)}</td>
      <td class="td-select">
        <select onchange="cambiarEstado(${r.id}, this.value)">
          ${ESTADOS.map(e =>
            `<option value="${e.val}"${r.estado === e.val ? ' selected' : ''}>${e.label}</option>`
          ).join('')}
        </select>
      </td>
      <td class="td-nota">
        <input type="text" value="${esc(r.nota)}" placeholder="—"
          onchange="guardarNota(${r.id}, this.value)"/>
      </td>
      <td class="text-dim">${esc(r.fecha)}</td>
      <td><button class="del-btn" onclick="eliminar(${r.id})" title="Eliminar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/>
        </svg>
      </button></td>
    </tr>`
  ).join('');

  renderPaginacion(total, totalPag);
}

// ─── PAGINACIÓN ───────────────────────────────────────────────────────────────

function renderPaginacion(total, totalPag) {
  let wrap = document.getElementById('paginacionWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'paginacionWrap';
    wrap.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      margin-top:12px;font-family:var(--mono);font-size:11px;color:var(--text3);`;
    document.querySelector('.table-wrap').after(wrap);
  }

  if (total === 0) { wrap.innerHTML = ''; return; }

  const inicio = (paginaActual - 1) * POR_PAGINA + 1;
  const fin    = Math.min(paginaActual * POR_PAGINA, total);

  const btnStyle = (disabled, activo) => `
    style="font-family:var(--mono);font-size:10px;padding:4px 10px;border-radius:4px;
    cursor:${disabled ? 'not-allowed' : 'pointer'};
    background:${activo ? 'var(--accent)' : 'var(--bg3)'};
    color:${activo ? '#fff' : disabled ? 'var(--text3)' : 'var(--text2)'};
    border:1px solid ${activo ? 'var(--accent)' : 'var(--border2)'};
    opacity:${disabled ? '0.4' : '1'};"`;

  let nums = '';
  for (let p = 1; p <= totalPag; p++) {
    if (
      p === 1 || p === totalPag ||
      (p >= paginaActual - 1 && p <= paginaActual + 1)
    ) {
      nums += `<button onclick="irPagina(${p})" ${btnStyle(false, p === paginaActual)}>${p}</button>`;
    } else if (p === paginaActual - 2 || p === paginaActual + 2) {
      nums += `<span style="color:var(--text3);padding:0 2px">…</span>`;
    }
  }

  wrap.innerHTML = `
    <span>${inicio}–${fin} de ${total}</span>
    <div style="display:flex;gap:4px;align-items:center;">
      <button onclick="irPagina(${paginaActual - 1})"
        ${btnStyle(paginaActual === 1, false)}
        ${paginaActual === 1 ? 'disabled' : ''}>‹ Ant</button>
      ${nums}
      <button onclick="irPagina(${paginaActual + 1})"
        ${btnStyle(paginaActual === totalPag, false)}
        ${paginaActual === totalPag ? 'disabled' : ''}>Sig ›</button>
    </div>`;
}

function irPagina(p) {
  const total = Math.ceil(registrosFiltrados().length / POR_PAGINA) || 1;
  if (p < 1 || p > total) return;
  paginaActual = p;
  renderTabla();
}

// ─── STATS ────────────────────────────────────────────────────────────────────

function renderStats() {
  const counts = {};
  ESTADOS.forEach(e => counts[e.val] = 0);
  registros.forEach(r => { if (counts[r.estado] !== undefined) counts[r.estado]++; });

  const total = registros.length;
  const bar   = document.getElementById('statsBar');
  if (!total) { bar.innerHTML = ''; return; }

  const colorMap = {
    recibido:'green', reparacion:'amber', entregado:'accent',
    descartado:'red', bodega:'purple'
  };

  bar.innerHTML = `
    <div class="stat">
      <div class="stat-n" style="color:var(--text)">${total}</div>
      <div class="stat-l">total</div>
    </div>
    ${ESTADOS.filter(e => counts[e.val] > 0).map(e => `
    <div class="stat">
      <div class="stat-n" style="color:var(--${colorMap[e.val] || 'text2'})">${counts[e.val]}</div>
      <div class="stat-l">${e.label.toLowerCase()}</div>
    </div>`).join('')}`;
}

// ─── EXPORTAR CSV ─────────────────────────────────────────────────────────────

function exportarCSV() {
  if (!registros.length) { alert('No hay registros para exportar.'); return; }

  const headers = ['OS', 'Remitente', 'Origen', 'Equipos/Destino', 'Estado', 'Nota', 'Fecha'];

  const filas = registros.map(r => {
    const estadoLabel = ESTADOS.find(e => e.val === r.estado)?.label || r.estado;
    return [r.os, r.remitente, r.origen, r.equipos, estadoLabel, r.nota, r.fecha]
      .map(v => `"${(v || '').replace(/"/g, '""')}"`);
  });

  const csv = [headers.map(h => `"${h}"`), ...filas]
    .map(fila => fila.join(','))
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'os_registro_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Error leyendo el PDF"));
    r.readAsDataURL(blob);
  });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── ARRANQUE ─────────────────────────────────────────────────────────────────

inyectarControles();
renderTabla();
renderStats();