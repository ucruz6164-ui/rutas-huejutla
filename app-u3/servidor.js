// Rutas de Huejutla · Unidad III · servidor web y API REST.
// Entrega las paginas de web/ y responde /api/... con JSON.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { conectar, cerrar } = require("./bd");
const api = require("./api");

const PUERTO = 3000;
const WEB = path.join(__dirname, "web");
// Tamano maximo del cuerpo de una peticion: 10 KB
const MAXIMO = 10 * 1024;
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

// Lee el cuerpo JSON de la peticion (413 si es muy grande)
async function leerJSON(req) {
  let cuerpo = "";
  for await (const parte of req) {
    cuerpo += parte;
    if (cuerpo.length > MAXIMO) {
      throw new api.ErrorApi(413, "El cuerpo supera 10 KB");
    }
  }
  try {
    const datos = JSON.parse(cuerpo || "{}");
    if (datos === null || typeof datos !== "object" ||
        Array.isArray(datos)) throw new Error();
    return datos;
  } catch (e) {
    throw new api.ErrorApi(400, "El cuerpo debe ser un objeto JSON");
  }
}

// Tabla de rutas: metodo + ruta -> funcion de api.js
async function rutaApi(req, url) {
  const q = url.searchParams;
  const ruta = url.pathname;
  const m = req.method;
  const conId = ruta.match(/^\/api\/(paradas|rutas)\/([^/]+)$/);
  if (m === "GET" && ruta === "/api/salud") return api.salud();
  if (m === "GET" && ruta === "/api/paradas") return api.paradas();
  if (m === "GET" && ruta === "/api/red") return api.red();
  if (m === "GET" && ruta === "/api/como-llego") return api.comoLlego(q);
  if (m === "GET" && ruta === "/api/alcance") return api.alcance(q);
  if (m === "GET" && ruta === "/api/conectadas") return api.conectadas();
  if (m === "GET" && ruta === "/api/tramos/cerrados") {
    return api.cerrados();
  }
  if (m === "GET" && conId && conId[1] === "paradas") {
    return api.verParada(decodeURIComponent(conId[2]));
  }
  // Escrituras: primero se comprueba la clave (encabezado X-Clave)
  if (m === "PATCH" && ruta === "/api/tramos") {
    api.comprobarClave(req.headers["x-clave"]);
    return api.cambiarTramo(await leerJSON(req));
  }
  if (m === "POST" && ruta === "/api/rutas") {
    api.comprobarClave(req.headers["x-clave"]);
    return api.crearRuta(await leerJSON(req));
  }
  if (m === "DELETE" && conId && conId[1] === "rutas") {
    api.comprobarClave(req.headers["x-clave"]);
    return api.eliminarRuta(decodeURIComponent(conId[2]));
  }
  return [404, { error: "Ruta no encontrada: " + m + " " + ruta }];
}

// Traduce un error a [codigo, respuesta] sin revelar detalles
function traducirError(e) {
  if (e instanceof api.ErrorApi) return [e.codigo, { error: e.message }];
  if (e instanceof URIError) return [400, { error: "URL mal formada" }];
  if (e.code === "Neo.ClientError.Schema.ConstraintValidationFailed") {
    return [409, { error: "Ese id ya existe" }];
  }
  if (e.code === "ServiceUnavailable" || e.code === "SessionExpired") {
    return [503, { error: "La base de datos no responde" }];
  }
  console.error("Error inesperado:", e.code || "", e.message);
  return [500, { error: "Error interno del servidor" }];
}

// Entrega un archivo de web/ (nunca fuera de esa carpeta)
function archivoEstatico(ruta, res) {
  const pedido = ruta === "/" ? "index.html" : path.normalize(ruta);
  const archivo = path.join(WEB, pedido);
  if (!archivo.startsWith(WEB + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(archivo, (e, contenido) => {
    if (e) {
      res.writeHead(404);
      return res.end("No encontrado");
    }
    const tipo = TIPOS[path.extname(archivo)] || "text/plain";
    res.writeHead(200, { "Content-Type": tipo });
    res.end(contenido);
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) {
    return archivoEstatico(url.pathname, res);
  }
  let codigo, respuesta;
  try {
    [codigo, respuesta] = await rutaApi(req, url);
  } catch (e) {
    [codigo, respuesta] = traducirError(e);
  }
  console.log(req.method, url.pathname, codigo);
  res.writeHead(codigo, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(respuesta));
});

// Primero se comprueba la conexion; despues se abre el puerto
conectar()
  .then(agente => {
    console.log("Conectado a " + agente);
    servidor.listen(PUERTO, () =>
      console.log("Rutas de Huejutla en el puerto " + PUERTO));
  })
  .catch(e => {
    console.error("No se pudo conectar con Neo4j:", e.message);
    process.exit(1);
  });

// Ctrl + C: cierra las conexiones con la base antes de salir
process.on("SIGINT", async () => {
  await cerrar();
  console.log("\nConexiones cerradas. Hasta luego.");
  process.exit(0);
});
