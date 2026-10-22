// Rutas de Huejutla · servidor web y API REST sobre Neo4j.
// Entrega las paginas de web/ y responde /api/... con JSON.
// Cada respuesta trae "cypher": las consultas que se ejecutaron.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { driver, cypher } = require("./bd");

const PUERTO = 3000;
const WEB = path.join(__dirname, "web");
const ESPERA = 5;   // minutos que se suman por cada transbordo (bajar y esperar otra combi)

// Condiciones que comparten las busquedas de caminos:
//  - ningun tramo cerrado
//  - sin pasar dos veces por la misma parada
const CAMINO_VALIDO = `ALL(t IN relationships(p) WHERE NOT t.cerrado)
  AND ALL(i IN range(0, size(nodes(p)) - 2) WHERE NOT nodes(p)[i] IN nodes(p)[i + 1..])`;

// ------------------------------------------------------------------ rutas de la API

// GET /api/estado : version de Neo4j y cuantos nodos y relaciones hay
async function estado() {
  const c = [];
  const info = await driver.getServerInfo();
  const [n] = await cypher(`RETURN COUNT { (:Parada) } AS paradas, COUNT { (:Ruta) } AS rutas, COUNT { ()-[:TRAMO]->() } AS tramos`, {}, c);
  return { version: info.agent, ...n, cypher: c };
}

// GET /api/red : paradas con su posicion y tramos con el color de su ruta (para dibujar el mapa)
async function red() {
  const c = [];
  const paradas = await cypher(`MATCH (p:Parada) RETURN p.id AS id, p.nombre AS nombre, p.x AS x, p.y AS y ORDER BY nombre`, {}, c);
  const tramos = await cypher(`MATCH (a:Parada)-[t:TRAMO]->(b:Parada), (r:Ruta {id: t.ruta})
    RETURN a.id AS a, b.id AS b, t.ruta AS ruta, t.minutos AS minutos, t.cerrado AS cerrado, r.color AS color, r.nombre AS nombreRuta`, {}, c);
  const rutas = await cypher(`MATCH (r:Ruta)-[pp:PASA_POR]->(p:Parada)
    WITH r, p ORDER BY pp.orden
    RETURN r.id AS id, r.nombre AS nombre, r.color AS color, r.pasaje AS pasaje, collect(p.nombre) AS paradas ORDER BY id`, {}, c);
  return { paradas, tramos, rutas, cypher: c };
}

// GET /api/como-llego?origen=rio&destino=uthh : las 3 mejores opciones (recomendaciones)
async function comoLlego(q) {
  const c = [];
  const origen = q.get("origen"), destino = q.get("destino");
  if (!origen || !destino || origen === destino) throw new Error("Elige dos paradas distintas");
  const filas = await cypher(`
MATCH (a:Parada {id: $origen}), (b:Parada {id: $destino})
MATCH p = (a)-[:TRAMO*1..10]-(b)
WHERE ${CAMINO_VALIDO}
WITH p, relationships(p) AS ts
WITH p, ts,
  reduce(m = 0, t IN ts | m + t.minutos) AS minutos,
  size([i IN range(1, size(ts) - 1) WHERE ts[i].ruta <> ts[i - 1].ruta]) AS transbordos,
  reduce(c = 0, i IN range(0, size(ts) - 1) |
    c + CASE WHEN i = 0 OR ts[i].ruta <> ts[i - 1].ruta THEN ts[i].pasaje ELSE 0 END) AS costo
RETURN [n IN nodes(p) | n.id] AS paradas, [t IN ts | t.ruta] AS rutas,
  minutos, transbordos, costo, minutos + transbordos * $espera AS tiempoTotal
ORDER BY tiempoTotal, costo
LIMIT 20`, { origen, destino, espera: ESPERA }, c);
  // Deja las 3 mejores opciones con recorridos distintos
  const vistas = new Set(), opciones = [];
  for (const f of filas) {
    const firma = f.paradas.join(">");                 // un mismo recorrido de paradas cuenta una vez (el mejor)
    if (vistas.has(firma)) continue;
    vistas.add(firma);
    opciones.push(f);
    if (opciones.length === 3) break;
  }
  return { origen, destino, espera: ESPERA, opciones, cypher: c };
}

// GET /api/alcance?origen=centro&minutos=15 : paradas que alcanzo en ese tiempo
async function alcance(q) {
  const c = [];
  const filas = await cypher(`
MATCH (a:Parada {id: $origen})
MATCH p = (a)-[:TRAMO*1..10]-(n:Parada)
WHERE n <> a AND ${CAMINO_VALIDO}
WITH n, min(reduce(m = 0, t IN relationships(p) | m + t.minutos)) AS minutos
WHERE minutos <= $minutos
RETURN n.id AS id, n.nombre AS nombre, minutos ORDER BY minutos`,
    { origen: q.get("origen"), minutos: Number(q.get("minutos")) || 15 }, c);
  return { alcance: filas, cypher: c };
}

// GET /api/conectadas : paradas por las que pasan mas rutas (las mejores para transbordar)
async function conectadas() {
  const c = [];
  const filas = await cypher(`
MATCH (p:Parada)<-[:PASA_POR]-(r:Ruta)
RETURN p.id AS id, p.nombre AS nombre, count(r) AS rutas, collect(r.id) AS cuales
ORDER BY rutas DESC, nombre LIMIT 5`, {}, c);
  return { conectadas: filas, cypher: c };
}

// POST /api/tramos/alternar {"a":"centro","b":"mercado"} : cierra o abre un tramo (calle cerrada)
async function alternar(datos) {
  const c = [];
  const filas = await cypher(`
MATCH (x:Parada {id: $a})-[t:TRAMO]-(y:Parada {id: $b})
SET t.cerrado = NOT t.cerrado
RETURN t.ruta AS ruta, t.cerrado AS cerrado`, { a: datos.a, b: datos.b }, c);
  if (!filas.length) throw new Error("No existe un tramo entre " + datos.a + " y " + datos.b);
  return { tramos: filas, cypher: c };
}

// ------------------------------------------------------------------ servidor
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const ruta = url.pathname;
  // 1) Archivos de la carpeta web/
  if (!ruta.startsWith("/api/")) {
    const archivo = path.join(WEB, ruta === "/" ? "index.html" : path.normalize(ruta));
    if (!archivo.startsWith(WEB)) { res.writeHead(403); return res.end(); }
    return fs.readFile(archivo, (e, contenido) => {
      if (e) { res.writeHead(404); return res.end("No encontrado"); }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "text/plain" });
      res.end(contenido);
    });
  }
  // 2) API: siempre responde JSON
  let codigo = 200, respuesta;
  try {
    const q = url.searchParams;
    if (req.method === "GET" && ruta === "/api/estado") respuesta = await estado();
    else if (req.method === "GET" && ruta === "/api/red") respuesta = await red();
    else if (req.method === "GET" && ruta === "/api/como-llego") respuesta = await comoLlego(q);
    else if (req.method === "GET" && ruta === "/api/alcance") respuesta = await alcance(q);
    else if (req.method === "GET" && ruta === "/api/conectadas") respuesta = await conectadas();
    else if (req.method === "POST" && ruta === "/api/tramos/alternar") {
      let cuerpo = "";
      for await (const parte of req) cuerpo += parte;
      respuesta = await alternar(JSON.parse(cuerpo || "{}"));
    }
    else { codigo = 404; respuesta = { error: "Ruta no encontrada: " + ruta }; }
  } catch (e) {
    codigo = 400;
    respuesta = { error: e.message };
    console.error("Error:", e.message);
  }
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(respuesta));
}).listen(PUERTO, () => console.log("Rutas de Huejutla en el puerto " + PUERTO + " (pestana Puertos -> 3000)"));
