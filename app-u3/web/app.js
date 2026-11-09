// Rutas de Huejutla · funciones que comparten todas las paginas.
// Las paginas NO hablan con Neo4j: piden los datos a la API.

// Pide algo a la API. Devuelve { codigo, datos } o lanza el error.
// En escrituras agrega el encabezado X-Clave.
async function api(ruta, metodo = "GET", cuerpo) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(cuerpo);
  }
  if (metodo !== "GET") opciones.headers["X-Clave"] = leerClave();
  let r;
  try {
    r = await fetch("/api" + ruta, opciones);
  } catch (e) {
    throw new Error("Sin conexion con el servidor: revisa node servidor.js");
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status + " · " + (datos.error || "Error"));
  return { codigo: r.status, datos };
}

// Crea un elemento HTML con clase y texto (textContent, no HTML)
function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// Escapa texto para meterlo dentro de un SVG armado como cadena
function esc(t) {
  return String(t).replace(/[&<>"']/g, x => "&#" + x.charCodeAt(0) + ";");
}

// Muestra un aviso: tipo "" (azul), "ok" (verde) o "error" (rojo)
function aviso(contenedor, texto, tipo = "") {
  contenedor.textContent = "";
  if (texto) contenedor.append(el("div", "aviso " + tipo, texto));
}

// Muestra el Cypher que ejecuto la API
function verCypher(contenedor, consultas) {
  contenedor.textContent = "";
  const d = el("details");
  d.append(el("summary", null,
    "Cypher que ejecuto la API (" + consultas.length + ")"));
  d.append(el("pre", null, consultas.join("\n\n")));
  contenedor.append(d);
}

// Etiqueta de color con el id de la ruta (R1, R2...)
function etiquetaRuta(id, color) {
  const s = el("span", "ruta", id);
  s.style.background = color;
  return s;
}

// La clave de escritura se guarda solo mientras la pestana viva
function leerClave() {
  return sessionStorage.getItem("clave") || "";
}
function campoClave(contenedor) {
  const etiqueta = el("label", null, "Clave de escritura");
  const campo = el("input");
  campo.type = "password";
  campo.value = leerClave();
  campo.addEventListener("input", () =>
    sessionStorage.setItem("clave", campo.value));
  etiqueta.append(campo);
  contenedor.append(etiqueta);
}

// Menu superior y estado de la conexion (GET /api/salud)
function menu(actual) {
  const nav = el("nav");
  nav.append(el("b", null, "Rutas de Huejutla"));
  const paginas = [["index.html", "Como llego"], ["red.html", "La red"],
    ["rutas.html", "Rutas"], ["tramos.html", "Tramos"]];
  for (const [pagina, texto] of paginas) {
    const a = el("a", null, texto);
    a.href = pagina;
    if (pagina === actual) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
  const estado = el("span", null, "Conectando...");
  estado.id = "estado";
  nav.append(estado);
  const header = el("header");
  header.append(nav);
  document.body.prepend(header);
  api("/salud")
    .then(({ datos: s }) => {
      estado.textContent = "● " + s.servidor + " · " + s.paradas +
        " paradas · " + s.tramos + " tramos · " + s.latenciaMs + " ms";
    })
    .catch(e => {
      estado.textContent = "● Sin conexion";
      estado.title = e.message;
    });
}

// Dibuja la red como mapa SVG. Cada parada enlaza a su detalle.
//   resaltar.camino = [ids], resaltar.rutas = [ruta de cada tramo]
//   resaltar.alcance = { id: minutos }
function dibujarMapa(contenedor, red, resaltar = {}) {
  const X = x => 40 + x * 9.2;
  const Y = y => 30 + y * 5.6;
  const pos = {};
  for (const p of red.paradas) pos[p.id] = { x: X(p.x), y: Y(p.y) };
  const color = {};
  for (const r of red.rutas) color[r.id] = r.color;
  const tenue = resaltar.camino || resaltar.alcance;
  let svg = '<svg viewBox="0 0 1000 620" width="100%" class="mapa"' +
    ' role="img" aria-label="Mapa de la red de combis">';
  // Tramos: si dos rutas comparten tramo, se separan un poco
  const cuenta = {};
  for (const t of red.tramos) {
    const clave = [t.a, t.b].sort().join("-");
    const k = cuenta[clave] = (cuenta[clave] || 0) + 1;
    const a = pos[t.a], b = pos[t.b];
    const largo = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = (k - 1) * 6 - 3;
    const nx = -(b.y - a.y) / largo * d, ny = (b.x - a.x) / largo * d;
    svg += `<line x1="${a.x + nx}" y1="${a.y + ny}" x2="${b.x + nx}"
      y2="${b.y + ny}" stroke="${t.cerrado ? "#999" : esc(t.color)}"
      stroke-width="5" stroke-linecap="round"
      ${t.cerrado ? 'stroke-dasharray="8 8"' : ""}
      opacity="${tenue ? 0.25 : 0.9}"/>`;
  }
  // Recorrido resaltado
  const camino = resaltar.camino || [];
  for (let i = 0; i < camino.length - 1; i++) {
    const a = pos[camino[i]], b = pos[camino[i + 1]];
    svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
      stroke="${esc(color[resaltar.rutas[i]])}" stroke-width="11"
      stroke-linecap="round"/>`;
  }
  // Paradas: enlace a parada.html?id=...
  for (const p of red.paradas) {
    const q = pos[p.id];
    const alcanzada = resaltar.alcance && p.id in resaltar.alcance;
    const marcada = camino.includes(p.id) || alcanzada;
    const extra = alcanzada ? " · " + resaltar.alcance[p.id] + " min" : "";
    const derecha = q.x > 760;
    svg += `<a href="parada.html?id=${encodeURIComponent(p.id)}">
      <circle cx="${q.x}" cy="${q.y}" r="${marcada ? 11 : 8}"
      fill="#fff" stroke="#24445C" stroke-width="${marcada ? 4 : 2.5}"/>
      <text x="${derecha ? q.x - 14 : q.x + 14}" y="${q.y + 4}"
      text-anchor="${derecha ? "end" : "start"}"
      >${esc(p.nombre + extra)}</text></a>`;
  }
  contenedor.innerHTML = svg + "</svg>";
}
