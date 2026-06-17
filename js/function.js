// ─── CONFIG ───────────────────────────────────────────────────────────────────

const BASE_URL =
  "https://b2cc2x.api.blue.cl/b2cc2x/svc/emissions-core/v2/asset/emission/os/";
const SUPA_URL = "https://xkhgsvgoxobufbvcungh.supabase.co/rest/v1/ordenes";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhraGdzdmdveG9idWZidmN1bmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODQ0MDQsImV4cCI6MjA5Njc2MDQwNH0.31kUMbV80vYWWgcc3qLAGe6qGOlGVL66CNQWNuAWHZE";

const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPA_KEY,
  Authorization: "Bearer " + SUPA_KEY,
  Prefer: "return=representation",
};

const ESTADOS = [
  { val: "pendiente", label: "Pendiente", cls: "b-pendiente" },
  { val: "recibido", label: "Recibido", cls: "b-recibido" },
  { val: "reparacion", label: "En reparación", cls: "b-reparacion" },
  // { val:"entregado",  label:"Entregado",     cls:"b-entregado" },
  // { val:"bodega",     label:"En bodega",     cls:"b-bodega" },
  // { val:"descartado", label:"Descartado",    cls:"b-descartado" }
];
const RESPONSABLES = [
  "Sin asignar",
  "Jonathan Maldonado",
  "Hector Navarrete",
  "Jose Mujica",
  "Danae Retamal",
  "Gerardo Fernandez",
  "Francisco Vivar",
  "Tomas Sanchez",
  "Diego Galvez",
  "Tomas Sanchez",
  "Esteban Diaz",
  "Fabian Narvaez",
  "Luis Arce",
  "Eduard Cuenca",
  "Pañol Logistica",
  "Pañol HUB",
];
const POR_PAGINA = 7;

// ─── ESTADO ───────────────────────────────────────────────────────────────────

let registros = JSON.parse(localStorage.getItem("os_registros") || "[]");
let lastInfo = null;
let filtroEstado = "todos";
let busqueda = "";
let paginaActual = 1;

// ─── SUPABASE ─────────────────────────────────────────────────────────────────

async function cargarDesdeSupabase() {
  setStatusGlobal("Sincronizando...");
  try {
    const resp = await fetch(SUPA_URL + "?order=id.desc", {
      headers: HEADERS,
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    registros = data.map((r) => ({ ...r, id: Number(r.id) }));
    localStorage.setItem("os_registros", JSON.stringify(registros));
    renderTabla();
    renderStats();
    setStatusGlobal("");
  } catch (e) {
    console.warn("Sin conexión a Supabase, usando caché local:", e.message);
    setStatusGlobal("⚠ Sin conexión — datos locales");
    setTimeout(() => setStatusGlobal(""), 4000);
  }
}

async function syncAdd(r) {
  try {
    const resp = await fetch(SUPA_URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(r),
    });
    if (!resp.ok) {
      const err = await resp.json();
      console.warn("syncAdd error:", err);
    }
  } catch (e) {
    console.warn("syncAdd falló:", e.message);
  }
}

async function syncUpdate(r) {
  try {
    const resp = await fetch(SUPA_URL + "?id=eq." + r.id, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({
        os: r.os,
        remitente: r.remitente,
        origen: r.origen,
        equipos: r.equipos,
        estado: r.estado,
        nota: r.nota,
        responsable: r.responsable,
        fecha: r.fecha,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      console.warn("syncUpdate error:", err);
    }
  } catch (e) {
    console.warn("syncUpdate falló:", e.message);
  }
}

async function syncDelete(id) {
  try {
    const resp = await fetch(SUPA_URL + "?id=eq." + id, {
      method: "DELETE",
      headers: HEADERS,
    });
    if (!resp.ok) console.warn("syncDelete HTTP:", resp.status);
  } catch (e) {
    console.warn("syncDelete falló:", e.message);
  }
}

function setStatusGlobal(msg) {
  let el = document.getElementById("syncStatus");
  if (!el) {
    el = document.createElement("div");
    el.id = "syncStatus";
    el.style.cssText = `
      font-size:11px;font-weight:500;
      color:var(--text3);text-align:right;
      margin-bottom:8px;min-height:16px;transition:opacity .3s;`;
    const seccion = document.querySelector(".section-label");
    if (seccion) seccion.after(el);
  }
  el.textContent = msg;
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.getElementById("osInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") consultarOS();
});

function inyectarControles() {
  const seccion = document.querySelector(".section-label");

  const searchWrap = document.createElement("div");
  searchWrap.style.cssText = "margin-bottom:10px;";
  searchWrap.innerHTML = `
    <input type="text" id="searchInput"
      placeholder="Buscar por OS, remitente u responsable..." />`;
  seccion.after(searchWrap);

  const filtrosWrap = document.createElement("div");
  filtrosWrap.id = "filtrosWrap";
  filtrosWrap.style.cssText =
    "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;";
  filtrosWrap.innerHTML = buildFiltros();
  searchWrap.after(filtrosWrap);

  document.getElementById("searchInput").addEventListener("input", (e) => {
    busqueda = e.target.value.toLowerCase();
    paginaActual = 1;
    renderTabla();
  });
}

function buildFiltros() {
  const todos = [{ val: "todos", label: "Todos" }, ...ESTADOS];
  return todos
    .map((e) => {
      const activo = filtroEstado === e.val;
      const base = `cursor:pointer;font-family:var(--font);font-size:11px;font-weight:600;
      padding:5px 12px;border-radius:20px;letter-spacing:0;
      border:1.5px solid;transition:all .12s;`;
      const estilo = activo
        ? `background:var(--accent);color:#fff;border-color:var(--accent);`
        : `background:var(--surface);color:var(--text3);border-color:var(--border);`;
      return `<button onclick="setFiltro('${e.val}')" style="${base}${estilo}">${e.label}</button>`;
    })
    .join("");
}

function setFiltro(val) {
  filtroEstado = val;
  paginaActual = 1;
  document.getElementById("filtrosWrap").innerHTML = buildFiltros();
  renderTabla();
}

// ─── STATUS PANEL ─────────────────────────────────────────────────────────────

function setStatus(tipo, msg) {
  const el = document.getElementById("statusMsg");
  el.className = "status-msg";
  if (!tipo) {
    el.style.display = "none";
    return;
  }
  el.style.display = "flex";
  if (tipo === "loading") {
    el.classList.add("status-loading");
    el.innerHTML = `<div class="spinner"></div><span>${msg}</span>`;
  } else if (tipo === "ok") {
    el.classList.add("status-ok");
    el.innerHTML = `✓ ${msg}`;
    setTimeout(() => {
      el.style.display = "none";
    }, 3000);
  } else {
    el.classList.add("status-err");
    el.innerHTML = `✕ ${msg}`;
  }
}

// ─── CONSULTA OS ──────────────────────────────────────────────────────────────

async function consultarOS() {
  const os = document.getElementById("osInput").value.trim();
  if (!os) return;

  document.getElementById("resultBox").style.display = "none";
  document.getElementById("addForm").style.display = "none";
  lastInfo = null;

  const pdfUrl = BASE_URL + encodeURIComponent(os) + "/label";

  setStatus("loading", "Descargando PDF...");
  try {
    const resp = await fetch(pdfUrl);
    if (!resp.ok) throw new Error("HTTP " + resp.status);

    const blob = await resp.blob();
    const tempUrl = URL.createObjectURL(blob);
    const pdf = await pdfjsLib.getDocument(tempUrl).promise;

    let texto = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texto += content.items.map((i) => i.str).join(" ") + " ";
    }

    console.log("===== TEXTO PDF =====");
    console.log(texto);

    const remitente =
      texto.match(/NOMBRE DEL CLIENTE:\s*(.*?)\s{2,}/i)?.[1] || null;
    const origen = texto.match(/DIR REMITENTE:\s*(.*?)\s{2,}/i)?.[1] || null;
    const destino = texto.match(/ENVIAR A:\s*(.*?)\s{2,}/i)?.[1] || null;
    const ref = texto.match(/REF:\s*(.*?)\s{2,}/i)?.[1] || null;
    const fechaEnvio = texto.match(/KG\s*(.*?)\s{2,}/i)?.[1] || null;

    lastInfo = {
      os_numero: os,
      remitente,
      origen,
      equipos: destino,
      cantidad: "1",
      fechaEnvio,
      ref,
      estado_doc: "PDF Blue",
    };

    mostrarResultado(pdfUrl);
    setStatus("ok", "OS procesada correctamente");
  } catch (err) {
    console.error(err);
    setStatus("err", err.message);
  }
}

function mostrarResultado(pdfUrl) {
  document.getElementById("resultOsNum").childNodes[0].textContent =
    "OS — " + lastInfo.os_numero + " ";
  document.getElementById("pdfLink").href = pdfUrl;

  const fields = [
    { k: "Remitente", v: lastInfo.remitente },
    { k: "Dirección origen", v: lastInfo.origen },
    { k: "Destino", v: lastInfo.equipos },
    { k: "Fecha Envio", v: lastInfo.fechaEnvio },
    { k: "REF", v: lastInfo.ref },
  ].filter((f) => f.v);

  document.getElementById("resultFields").innerHTML = fields
    .map(
      (f) =>
        `<div class="rf">
      <div class="rf-k">${esc(f.k)}</div>
      <div class="rf-v">${esc(f.v)}</div>
    </div>`,
    )
    .join("");

  document.getElementById("resultBox").style.display = "block";
  document.getElementById("addForm").style.display = "block";
  document.getElementById("notaInput").value = "";
  document.getElementById("estadoSelect").value = "pendiente";
  document.getElementById("responsableSelect").value = "Sin asignar";
}

// ─── AGREGAR REGISTRO ─────────────────────────────────────────────────────────

async function agregarRegistro() {
  if (!lastInfo) return;
  const estado = document.getElementById("estadoSelect").value;
  const nota = document.getElementById("notaInput").value.trim();

  const nuevo = {
    id: Date.now(),
    os: lastInfo.os_numero,
    remitente: lastInfo.remitente || "—",
    origen: lastInfo.origen || "—",
    equipos: lastInfo.equipos || "—",
    estado,
    nota,
    responsable: document.getElementById("responsableSelect").value,
    fechaEnvio: lastInfo.fechaEnvio,
  };

  registros.unshift(nuevo);
  guardarLocal();
  renderTabla();
  renderStats();

  document.getElementById("resultBox").style.display = "none";
  document.getElementById("addForm").style.display = "none";
  document.getElementById("osInput").value = "";
  lastInfo = null;
  setStatus("ok", "Agregando al registro...");

  await syncAdd(nuevo);
  setStatus("ok", "OS guardada correctamente");
}

// ─── ACCIONES TABLA ───────────────────────────────────────────────────────────

async function cambiarEstado(id, val) {
  const r = registros.find((r) => r.id === id);
  if (!r) return;
  r.estado = val;
  guardarLocal();
  renderStats();
  await syncUpdate(r);
}

async function guardarNota(id, val) {
  const r = registros.find((r) => r.id === id);
  if (!r) return;
  r.nota = val;
  guardarLocal();
  await syncUpdate(r);
}
async function cambiarResponsable(id, val) {
  const r = registros.find((r) => r.id === id);
  if (!r) return;
  r.responsable = val;
  guardarLocal();
  await syncUpdate(r);
}

async function eliminar(id) {
  if (!confirm("¿Eliminar este registro?")) return;
  registros = registros.filter((r) => r.id !== id);
  guardarLocal();
  renderTabla();
  renderStats();
  await syncDelete(id);
}

async function limpiarTodo() {
  if (!registros.length) return;
  if (
    !confirm("¿Eliminar TODOS los registros? Esta acción no se puede deshacer.")
  )
    return;
  const ids = registros.map((r) => r.id);
  registros = [];
  guardarLocal();
  renderTabla();
  renderStats();
  for (const id of ids) await syncDelete(id);
}

function guardarLocal() {
  localStorage.setItem("os_registros", JSON.stringify(registros));
}

// ─── FILTRADO Y BÚSQUEDA ──────────────────────────────────────────────────────

function registrosFiltrados() {
  return registros.filter((r) => {
    const pasaEstado = filtroEstado === "todos" || r.estado === filtroEstado;
    const pasaBusqueda =
      !busqueda ||
      [r.os, r.remitente, r.nota, r.responsable].some((v) =>
        (v || "").toLowerCase().includes(busqueda),
      );
    return pasaEstado && pasaBusqueda;
  });
}

// ─── RENDER TABLA ─────────────────────────────────────────────────────────────

function renderTabla() {
  const tbody = document.getElementById("tableBody");
  const filtrados = registrosFiltrados();
  const total = filtrados.length;
  const totalPag = Math.ceil(total / POR_PAGINA) || 1;

  if (paginaActual > totalPag) paginaActual = totalPag;

  const inicio = (paginaActual - 1) * POR_PAGINA;
  const pagina = filtrados.slice(inicio, inicio + POR_PAGINA);

  if (!pagina.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${
      busqueda || filtroEstado !== "todos"
        ? "SIN RESULTADOS PARA LA BÚSQUEDA O FILTRO APLICADO"
        : "SIN REGISTROS — CONSULTA UNA OS "
    }</td></tr>`;
    renderPaginacion(0, 1);
    return;
  }

  tbody.innerHTML = pagina
    .map(
      (r) => `
    <tr>
      <td class="os-cell">${esc(r.os)}</td>
      <td class="text-muted">${esc(r.remitente)}</td>
      <td class="text-muted">${esc(r.equipos)}</td>
      <td class="td-select">
        <select onchange="cambiarEstado(${r.id}, this.value)">
          ${ESTADOS.map(
            (e) =>
              `<option value="${e.val}"${r.estado === e.val ? " selected" : ""}>${e.label}</option>`,
          ).join("")}
        </select>
      </td>
  
      <td class="td-nota">
  <textarea rows="1" placeholder="—"
    onchange="guardarNota(${r.id}, this.value)">${esc(r.nota)}</textarea>
</td>
      <td class="td-select">
        <select onchange="cambiarResponsable(${r.id}, this.value)">
          ${RESPONSABLES.map(
            (nombre) =>
              `<option value="${nombre}"${(r.responsable || "Sin asignar") === nombre ? " selected" : ""}>${nombre}</option>`,
          ).join("")}
        </select>
      </td>
      <td class="text-dim">${esc(r.fechaEnvio)}</td>
      <td>
        <button class="del-btn" onclick="eliminar(${r.id})" title="Eliminar">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
      </td>
    </tr>`,
    )
    .join("");

  renderPaginacion(total, totalPag);
}

// ─── PAGINACIÓN ───────────────────────────────────────────────────────────────

function renderPaginacion(total, totalPag) {
  let wrap = document.getElementById("paginacionWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "paginacionWrap";
    wrap.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      margin-top:14px;font-size:12px;font-weight:500;color:var(--text3);`;
    document.querySelector(".table-wrap").after(wrap);
  }

  if (total === 0) {
    wrap.innerHTML = "";
    return;
  }

  const inicio = (paginaActual - 1) * POR_PAGINA + 1;
  const fin = Math.min(paginaActual * POR_PAGINA, total);

  const btnStyle = (disabled, activo) => `
    font-family:var(--font);font-size:12px;font-weight:600;
    padding:5px 11px;border-radius:6px;
    cursor:${disabled ? "not-allowed" : "pointer"};
    background:${activo ? "var(--accent)" : "var(--surface)"};
    color:${activo ? "#fff" : disabled ? "var(--text4)" : "var(--text2)"};
    border:1.5px solid ${activo ? "var(--accent)" : "var(--border)"};
    opacity:${disabled ? "0.4" : "1"};`;

  let nums = "";
  for (let p = 1; p <= totalPag; p++) {
    if (
      p === 1 ||
      p === totalPag ||
      (p >= paginaActual - 1 && p <= paginaActual + 1)
    ) {
      nums += `<button onclick="irPagina(${p})" style="${btnStyle(false, p === paginaActual)}">${p}</button>`;
    } else if (p === paginaActual - 2 || p === paginaActual + 2) {
      nums += `<span style="padding:0 3px;color:var(--text3)">…</span>`;
    }
  }

  wrap.innerHTML = `
    <span>${inicio}–${fin} de ${total} registros</span>
    <div style="display:flex;gap:4px;align-items:center;">
      <button onclick="irPagina(${paginaActual - 1})"
        style="${btnStyle(paginaActual === 1, false)}"
        ${paginaActual === 1 ? "disabled" : ""}>‹ Ant</button>
      ${nums}
      <button onclick="irPagina(${paginaActual + 1})"
        style="${btnStyle(paginaActual === totalPag, false)}"
        ${paginaActual === totalPag ? "disabled" : ""}>Sig ›</button>
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
  ESTADOS.forEach((e) => (counts[e.val] = 0));
  registros.forEach((r) => {
    if (counts[r.estado] !== undefined) counts[r.estado]++;
  });

  const total = registros.length;
  const bar = document.getElementById("statsBar");
  if (!total) {
    bar.innerHTML = "";
    return;
  }

  const colorMap = {
    recibido: "green",
    reparacion: "amber",
    entregado: "accent",
    descartado: "red",
    bodega: "purple",
  };

  bar.innerHTML = `
    <div class="stat">
      <div class="stat-n" style="color:var(--text)">${total}</div>
      <div class="stat-l">Total</div>
    </div>
    ${ESTADOS.filter((e) => counts[e.val] > 0)
      .map(
        (e) => `
    <div class="stat">
      <div class="stat-n" style="color:var(--${colorMap[e.val] || "text2"})">${counts[e.val]}</div>
      <div class="stat-l">${e.label}</div>
    </div>`,
      )
      .join("")}`;
}

// ─── EXPORTAR CSV ─────────────────────────────────────────────────────────────

function exportarCSV() {
  if (!registros.length) {
    alert("No hay registros para exportar.");
    return;
  }

  const headers = [
    "OS",
    "Remitente",
    "Dirección Origen",
    "Destino",
    "Estado",
    "Responsable",
    "Nota",
    "Fecha",
  ];
  const filas = registros.map((r) => {
    const estadoLabel =
      ESTADOS.find((e) => e.val === r.estado)?.label || r.estado;
    return [
      r.os,
      r.remitente,
      r.origen,
      r.equipos,
      estadoLabel,
      r.responsable,
      r.nota,
      r.fecha,
    ].map((v) => `"${(v || "").replace(/"/g, '""')}"`);
  });

  const csv = [headers.map((h) => `"${h}"`), ...filas]
    .map((f) => f.join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "os_registro_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function formatearFecha(val) {
  if (!val) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function hoy() {
  return new Date().toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── ARRANQUE ─────────────────────────────────────────────────────────────────

inyectarControles();
renderTabla();
renderStats();
cargarDesdeSupabase();
