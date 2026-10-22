// Rutas de Huejutla · funciones que comparten todas las paginas.
// Las paginas NO hablan con Neo4j: le piden los datos a la API (/api/...),
// que responde JSON con los datos y con el Cypher que ejecuto.

// Pide algo a la API y devuelve el JSON; si hay error, lanza el mensaje del servidor
async function api(ruta, metodo = "GET", datos) {
  const opciones = { method: metodo, headers: { "Content-Type": "application/json" } };
  if (datos) opciones.body = JSON.stringify(datos);
  let r;
  try { r = await fetch("/api" + ruta, opciones); }
  catch (e) { throw new Error("Sin conexion con el servidor: revisa que node servidor.js siga corriendo."); }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || "Error HTTP " + r.status);
  return json;
}

// Crea un elemento HTML con clase y texto
function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// Muestra un aviso (tipo "error" en rojo) dentro de un contenedor
function aviso(contenedor, texto, tipo = "") {
  contenedor.textContent = "";
  if (texto) contenedor.append(el("div", "aviso " + tipo, texto));
}

// Muestra el Cypher que ejecuto la API
function verCypher(contenedor, consultas) {
  contenedor.textContent = "";
  const d = el("details");
  d.append(el("summary", null, "Cypher que ejecuto la API (" + consultas.length + ")"), el("pre", null, consultas.join("\n\n")));
  contenedor.append(d);
}

// Etiqueta de color con el nombre corto de la ruta (R1, R2...)
function etiquetaRuta(id, color) {
  const s = el("span", "ruta", id);
  s.style.background = color;
  return s;
}

// Menu superior y estado de la conexion con Neo4j
function menu(actual) {
  const nav = el("nav");
  nav.append(el("b", null, "Rutas de Huejutla"));
  for (const [pagina, texto] of [["index.html", "Como llego"], ["red.html", "La red"], ["tramos.html", "Tramos"]]) {
    const a = el("a", null, texto); a.href = pagina;
    if (pagina === actual) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
  const estado = el("span", null, "Conectando..."); estado.id = "estado";
  nav.append(estado);
  const header = el("header"); header.append(nav);
  document.body.prepend(header);
  api("/estado")
    .then(e => { estado.textContent = "● " + e.version + " · " + e.paradas + " paradas · " + e.tramos + " tramos"; })
    .catch(e => { estado.textContent = "● Sin conexion"; estado.title = e.message; });
}

// Dibuja la red como mapa SVG.
//   resaltar.camino = [ids de paradas], resaltar.rutas = [ruta de cada paso]  -> marca un recorrido
//   resaltar.alcance = { id: minutos }                                       -> marca paradas alcanzables
function dibujarMapa(contenedor, red, resaltar = {}) {
  const W = 1000, H = 620;
  const X = x => 40 + x * 9.2, Y = y => 30 + y * 5.6;
  const pos = {};
  for (const p of red.paradas) pos[p.id] = { x: X(p.x), y: Y(p.y), nombre: p.nombre };
  const color = {};
  for (const t of red.tramos) color[t.ruta] = t.color;
  const hayResalte = resaltar.camino || resaltar.alcance;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" class="mapa" role="img" aria-label="Mapa de la red de combis">`;
  // Tramos: si dos rutas comparten tramo, se dibujan un poco separadas
  const cuenta = {};
  for (const t of red.tramos) {
    const clave = [t.a, t.b].sort().join("-");
    const k = cuenta[clave] = (cuenta[clave] || 0) + 1;
    const a = pos[t.a], b = pos[t.b];
    const largo = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = (k - 1) * 6 - 3, nx = -(b.y - a.y) / largo * d, ny = (b.x - a.x) / largo * d;
    svg += `<line x1="${a.x + nx}" y1="${a.y + ny}" x2="${b.x + nx}" y2="${b.y + ny}" stroke="${t.cerrado ? "#999" : t.color}"
      stroke-width="5" stroke-linecap="round" ${t.cerrado ? 'stroke-dasharray="8 8"' : ""} opacity="${hayResalte ? 0.25 : 0.9}"/>`;
  }
  // Recorrido resaltado
  if (resaltar.camino) {
    for (let i = 0; i < resaltar.camino.length - 1; i++) {
      const a = pos[resaltar.camino[i]], b = pos[resaltar.camino[i + 1]];
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color[resaltar.rutas[i]]}" stroke-width="11" stroke-linecap="round"/>`;
    }
  }
  // Paradas
  for (const p of red.paradas) {
    const q = pos[p.id];
    const enCamino = resaltar.camino && resaltar.camino.includes(p.id);
    const alcanzada = resaltar.alcance && resaltar.alcance[p.id] !== undefined;
    const r = enCamino || alcanzada ? 11 : 8;
    svg += `<circle cx="${q.x}" cy="${q.y}" r="${r}" fill="#fff" stroke="#24445C" stroke-width="${enCamino || alcanzada ? 4 : 2.5}"/>`;
    const extra = alcanzada ? " · " + resaltar.alcance[p.id] + " min" : "";
    const derecha = q.x > 760;                             // cerca del borde derecho: texto a la izquierda
    svg += `<text x="${derecha ? q.x - 14 : q.x + 14}" y="${q.y + 4}" text-anchor="${derecha ? "end" : "start"}">${p.nombre}${extra}</text>`;
  }
  contenedor.innerHTML = svg + "</svg>";
}
