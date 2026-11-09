// Rutas de Huejutla · Unidad III · operaciones de la API.
// Cada funcion valida la entrada, ejecuta Cypher con parametros
// y devuelve [codigo HTTP, respuesta]. Cada respuesta incluye
// "cypher": las consultas que se ejecutaron.
const crypto = require("crypto");
const { driver, cypher } = require("./bd");

// Error con codigo HTTP: 400 dato invalido, 404 no existe,
// 409 conflicto, 401/403 sin permiso para escribir
class ErrorApi extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// Minutos de espera que suma cada transbordo
const ESPERA = 5;
// Rutas de la Practica 5: la API no permite borrarlas
const ORIGINALES = ["R1", "R2", "R3", "R4", "R5"];
// Clave para escribir (secreto API_CLAVE del codespace)
const CLAVE_API = process.env.API_CLAVE || "";

// Condiciones de las busquedas de caminos:
// ningun tramo cerrado y sin pasar dos veces por una parada
const CAMINO_VALIDO = `
  ALL(t IN relationships(p) WHERE NOT t.cerrado)
  AND ALL(i IN range(0, size(nodes(p)) - 2)
      WHERE NOT nodes(p)[i] IN nodes(p)[i + 1..])`;

// ORDER BY no admite parametros: solo se aceptan estas opciones
const ORDENES = {
  tiempo: "tiempoTotal, costo",
  costo: "costo, tiempoTotal",
  transbordos: "transbordos, tiempoTotal",
};

// ------------------------------------------------- validaciones

// Id de parada o de ruta: letras, digitos, guion; maximo 30
function id(valor, campo) {
  if (typeof valor !== "string" || !/^[A-Za-z0-9_-]{1,30}$/.test(valor)) {
    throw new ErrorApi(400, campo + ": falta o no es un id valido");
  }
  return valor;
}

// Texto obligatorio con largo maximo
function texto(valor, campo, max) {
  if (typeof valor !== "string" || !valor.trim()) {
    throw new ErrorApi(400, campo + " es obligatorio y debe ser texto");
  }
  if (valor.trim().length > max) {
    throw new ErrorApi(400, campo + ": maximo " + max + " caracteres");
  }
  return valor.trim();
}

// Entero dentro de un rango; si no viene, usa el valor por defecto
function entero(valor, campo, min, max, defecto) {
  if (valor === undefined || valor === null || valor === "") {
    if (defecto !== undefined) return defecto;
    throw new ErrorApi(400, campo + " es obligatorio");
  }
  const n = typeof valor === "number" || typeof valor === "string"
    ? Number(valor) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErrorApi(400,
      campo + " debe ser un entero de " + min + " a " + max);
  }
  return n;
}

// Comprueba que existan todas las paradas; si falta alguna: 404
async function existenParadas(ids, c) {
  const [fila] = await cypher(`
MATCH (p:Parada) WHERE p.id IN $ids
RETURN collect(p.id) AS hay`, { ids }, "leer", c);
  const faltan = ids.filter(x => !fila.hay.includes(x));
  if (faltan.length) {
    throw new ErrorApi(404, "No existe la parada: " + faltan.join(", "));
  }
}

// Solo quien conoce la clave puede escribir. Se comparan los
// resumenes SHA-256 en tiempo constante.
function comprobarClave(recibida) {
  if (!CLAVE_API) {
    throw new ErrorApi(403,
      "Escritura desactivada: falta el secreto API_CLAVE");
  }
  const h = t => crypto.createHash("sha256").update(t).digest();
  if (!crypto.timingSafeEqual(h(String(recibida || "")), h(CLAVE_API))) {
    throw new ErrorApi(401, "Clave de escritura incorrecta");
  }
}

// -------------------------------------------------- lecturas

// GET /api/salud : servidor, latencia y tamano del grafo
async function salud() {
  const c = [];
  const inicio = Date.now();
  const [n] = await cypher(`
RETURN COUNT { (:Parada) } AS paradas,
       COUNT { (:Ruta) } AS rutas,
       COUNT { ()-[:TRAMO]->() } AS tramos`, {}, "leer", c);
  const latenciaMs = Date.now() - inicio;
  const info = await driver.getServerInfo();
  return [200, { servidor: info.agent, latenciaMs, ...n, cypher: c }];
}

// GET /api/paradas : lista ligera para los selectores
async function paradas() {
  const c = [];
  const filas = await cypher(`
MATCH (p:Parada)
RETURN p.id AS id, p.nombre AS nombre,
       COUNT { (p)<-[:PASA_POR]-(:Ruta) } AS rutas
ORDER BY nombre`, {}, "leer", c);
  return [200, { paradas: filas, cypher: c }];
}

// GET /api/paradas/:id : una parada, sus rutas y sus vecinas
async function verParada(idParada) {
  const c = [];
  const filas = await cypher(`
MATCH (p:Parada {id: $id})
RETURN p.id AS id, p.nombre AS nombre,
  [(p)<-[:PASA_POR]-(r:Ruta) | r {.id, .nombre, .color}] AS rutas,
  [(p)-[t:TRAMO]-(v:Parada) | {id: v.id, nombre: v.nombre,
    ruta: t.ruta, minutos: t.minutos, cerrado: t.cerrado}] AS vecinas`,
  { id: id(idParada, "id") }, "leer", c);
  if (!filas.length) {
    throw new ErrorApi(404, "No existe la parada " + idParada);
  }
  const parada = filas[0];
  parada.rutas.sort((a, b) => a.id.localeCompare(b.id));
  parada.vecinas.sort((a, b) => a.minutos - b.minutos);
  return [200, { ...parada, cypher: c }];
}

// GET /api/red : paradas, tramos y rutas para dibujar el mapa
async function red() {
  const c = [];
  const paradas = await cypher(`
MATCH (p:Parada)
RETURN p.id AS id, p.nombre AS nombre, p.x AS x, p.y AS y
ORDER BY nombre`, {}, "leer", c);
  const tramos = await cypher(`
MATCH (a:Parada)-[t:TRAMO]->(b:Parada), (r:Ruta {id: t.ruta})
RETURN a.id AS a, b.id AS b, t.ruta AS ruta, t.minutos AS minutos,
       t.cerrado AS cerrado, r.color AS color`, {}, "leer", c);
  const rutas = await cypher(`
MATCH (r:Ruta)-[pp:PASA_POR]->(p:Parada)
WITH r, p ORDER BY pp.orden
RETURN r.id AS id, r.nombre AS nombre, r.color AS color,
       r.pasaje AS pasaje, collect(p.nombre) AS paradas
ORDER BY id`, {}, "leer", c);
  return [200, { paradas, tramos, rutas, cypher: c }];
}

// GET /api/como-llego?origen=rio&destino=uthh&orden=tiempo
async function comoLlego(q) {
  const c = [];
  const origen = id(q.get("origen"), "origen");
  const destino = id(q.get("destino"), "destino");
  if (origen === destino) {
    throw new ErrorApi(400, "Elige dos paradas distintas");
  }
  const orden = q.get("orden") || "tiempo";
  if (!ORDENES[orden]) {
    throw new ErrorApi(400, "orden debe ser tiempo, costo o transbordos");
  }
  await existenParadas([origen, destino], c);
  const filas = await cypher(`
MATCH (a:Parada {id: $origen}), (b:Parada {id: $destino})
MATCH p = (a)-[:TRAMO*1..10]-(b)
WHERE ${CAMINO_VALIDO}
WITH p, relationships(p) AS ts
WITH p, ts,
  reduce(m = 0, t IN ts | m + t.minutos) AS minutos,
  size([i IN range(1, size(ts) - 1)
        WHERE ts[i].ruta <> ts[i - 1].ruta]) AS transbordos,
  reduce(c = 0, i IN range(0, size(ts) - 1) |
    c + CASE WHEN i = 0 OR ts[i].ruta <> ts[i - 1].ruta
             THEN ts[i].pasaje ELSE 0 END) AS costo
RETURN [n IN nodes(p) | n.id] AS paradas, [t IN ts | t.ruta] AS rutas,
  minutos, transbordos, costo,
  minutos + transbordos * $espera AS tiempoTotal
ORDER BY ${ORDENES[orden]}
LIMIT 20`, { origen, destino, espera: ESPERA }, "leer", c);
  // Deja las 3 mejores con recorridos de paradas distintos
  const vistas = new Set();
  const opciones = [];
  for (const f of filas) {
    const firma = f.paradas.join(">");
    if (vistas.has(firma)) continue;
    vistas.add(firma);
    opciones.push(f);
    if (opciones.length === 3) break;
  }
  return [200, { origen, destino, orden, espera: ESPERA,
    opciones, cypher: c }];
}

// GET /api/alcance?origen=centro&minutos=15
async function alcance(q) {
  const c = [];
  const origen = id(q.get("origen"), "origen");
  const minutos = entero(q.get("minutos"), "minutos", 1, 60, 15);
  await existenParadas([origen], c);
  const filas = await cypher(`
MATCH (a:Parada {id: $origen})
MATCH p = (a)-[:TRAMO*1..10]-(n:Parada)
WHERE n <> a AND ${CAMINO_VALIDO}
WITH n, min(reduce(m = 0, t IN relationships(p) | m + t.minutos))
     AS minutos
WHERE minutos <= $minutos
RETURN n.id AS id, n.nombre AS nombre, minutos
ORDER BY minutos, nombre`, { origen, minutos }, "leer", c);
  return [200, { origen, minutos, alcance: filas, cypher: c }];
}

// GET /api/conectadas : paradas con mas rutas (para transbordar)
async function conectadas() {
  const c = [];
  const filas = await cypher(`
MATCH (p:Parada)<-[:PASA_POR]-(r:Ruta)
WITH p, r ORDER BY r.id
RETURN p.id AS id, p.nombre AS nombre, count(r) AS rutas,
       collect(r.id) AS cuales
ORDER BY rutas DESC, nombre LIMIT 5`, {}, "leer", c);
  return [200, { conectadas: filas, cypher: c }];
}

// GET /api/tramos/cerrados : respuesta pequena para el sondeo
async function cerrados() {
  const c = [];
  const filas = await cypher(`
MATCH (a:Parada)-[t:TRAMO]->(b:Parada)
WHERE t.cerrado
RETURN a.id AS a, b.id AS b, t.ruta AS ruta
ORDER BY ruta, a`, {}, "leer", c);
  return [200, { cerrados: filas, revisado: new Date().toISOString(),
    cypher: c }];
}

// -------------------------------------------------- escrituras

// PATCH /api/tramos  {"a":"mercado","b":"hospital","cerrado":true}
async function cambiarTramo(datos) {
  const c = [];
  const a = id(datos.a, "a");
  const b = id(datos.b, "b");
  if (typeof datos.cerrado !== "boolean") {
    throw new ErrorApi(400, "cerrado debe ser true o false");
  }
  const filas = await cypher(`
MATCH (:Parada {id: $a})-[t:TRAMO]-(:Parada {id: $b})
SET t.cerrado = $cerrado
RETURN t.ruta AS ruta, t.cerrado AS cerrado`,
  { a, b, cerrado: datos.cerrado }, "escribir", c);
  if (!filas.length) {
    throw new ErrorApi(404, "No hay un tramo entre " + a + " y " + b);
  }
  return [200, { a, b, tramos: filas, cypher: c }];
}

// POST /api/rutas : crea una ruta nueva con sus tramos
async function crearRuta(datos) {
  const c = [];
  const idRuta = id(datos.id, "id");
  if (!/^R[0-9]{1,3}$/.test(idRuta)) {
    throw new ErrorApi(400, "id debe tener la forma R6, R7...");
  }
  const nombre = texto(datos.nombre, "nombre", 60);
  if (typeof datos.color !== "string" ||
      !/^#[0-9A-Fa-f]{6}$/.test(datos.color)) {
    throw new ErrorApi(400, "color debe tener la forma #1F6FB4");
  }
  const pasaje = entero(datos.pasaje, "pasaje", 1, 50);
  const lista = datos.paradas;
  if (!Array.isArray(lista) || lista.length < 2 || lista.length > 12) {
    throw new ErrorApi(400, "paradas debe ser una lista de 2 a 12 ids");
  }
  const paradas = lista.map((x, i) => id(x, "paradas[" + i + "]"));
  if (new Set(paradas).size !== paradas.length) {
    throw new ErrorApi(400, "Una ruta no repite paradas");
  }
  const mins = datos.minutos;
  if (!Array.isArray(mins) || mins.length !== paradas.length - 1) {
    throw new ErrorApi(400,
      "minutos debe tener " + (paradas.length - 1) + " valores");
  }
  const minutos = mins.map((m, i) =>
    entero(m, "minutos[" + i + "]", 1, 60));
  await existenParadas(paradas, c);
  const [ya] = await cypher(`
RETURN EXISTS { (:Ruta {id: $id}) } AS existe`,
  { id: idRuta }, "leer", c);
  if (ya.existe) throw new ErrorApi(409, "Ya existe la ruta " + idRuta);
  // Todo en una sola transaccion: o se crea completa o nada.
  // toInteger(): JavaScript envia los numeros como decimales.
  await cypher(`
CREATE (r:Ruta {id: $id, nombre: $nombre, color: $color,
                pasaje: toInteger($pasaje)})
WITH r
UNWIND range(0, size($paradas) - 1) AS i
MATCH (p:Parada {id: $paradas[i]})
CREATE (r)-[:PASA_POR {orden: i + 1}]->(p)
WITH r, i
WHERE i < size($paradas) - 1
MATCH (a:Parada {id: $paradas[i]}), (b:Parada {id: $paradas[i + 1]})
CREATE (a)-[:TRAMO {ruta: $id, minutos: toInteger($minutos[i]),
                    pasaje: r.pasaje, cerrado: false}]->(b)`,
  { id: idRuta, nombre, color: datos.color, pasaje, paradas, minutos },
  "escribir", c);
  return [201, { id: idRuta, nombre, paradas, minutos, cypher: c }];
}

// DELETE /api/rutas/:id : borra una ruta nueva y sus tramos
async function eliminarRuta(idRuta) {
  const c = [];
  id(idRuta, "id");
  if (ORIGINALES.includes(idRuta)) {
    throw new ErrorApi(409, "Las rutas R1 a R5 no se borran desde la API");
  }
  const filas = await cypher(`
MATCH (r:Ruta {id: $id})
OPTIONAL MATCH ()-[t:TRAMO {ruta: $id}]->()
WITH r, collect(t) AS tramos
FOREACH (x IN tramos | DELETE x)
DETACH DELETE r
RETURN size(tramos) AS tramos`, { id: idRuta }, "escribir", c);
  if (!filas.length) throw new ErrorApi(404, "No existe la ruta " + idRuta);
  return [200, { id: idRuta, tramosBorrados: filas[0].tramos, cypher: c }];
}

module.exports = {
  ErrorApi, comprobarClave,
  salud, paradas, verParada, red, comoLlego, alcance, conectadas,
  cerrados, cambiarTramo, crearRuta, eliminarRuta,
};
