// Rutas de Huejutla · Unidad III · conexion con Neo4j.
// La direccion, el usuario y la contrasena se leen de los
// secretos del codespace; nunca se escriben en el codigo.
const neo4j = require("neo4j-driver");

const URI = process.env.NEO4J_URI;
const USUARIO = process.env.NEO4J_USERNAME || "neo4j";
const CLAVE = process.env.NEO4J_PASSWORD;
if (!URI || !CLAVE) {
  console.error("Faltan los secretos NEO4J_URI y NEO4J_PASSWORD.");
  process.exit(1);
}

// Un solo driver para toda la aplicacion. Administra un grupo
// (pool) de conexiones que se reutilizan entre peticiones.
const driver = neo4j.driver(URI, neo4j.auth.basic(USUARIO, CLAVE), {
  // como maximo 10 conexiones abiertas al mismo tiempo
  maxConnectionPoolSize: 10,
  // si en 5 s no hay conexion libre, falla con un error claro
  connectionAcquisitionTimeout: 5000,
  // enteros de Neo4j como numeros normales de JavaScript
  disableLosslessIntegers: true,
  // nombre con el que la aplicacion se identifica ante el servidor
  userAgent: "rutas-huejutla-u3/1.0",
});

// Comprueba la conexion antes de abrir el servidor web
async function conectar() {
  const info = await driver.verifyConnectivity();
  return info.agent;
}

// Ejecuta Cypher con parametros ($nombre) y devuelve las filas.
// modo: "leer" o "escribir". En un cluster, las lecturas pueden
// ir a cualquier servidor y las escrituras van al principal.
// bitacora: arreglo donde se anota la consulta para mostrarla.
async function cypher(consulta, parametros, modo, bitacora) {
  if (bitacora) {
    bitacora.push(consulta.trim() + "\n// parametros: " +
      JSON.stringify(parametros));
  }
  const ruteo = modo === "escribir"
    ? neo4j.routing.WRITE : neo4j.routing.READ;
  const r = await driver.executeQuery(consulta, parametros,
    { routing: ruteo });
  return r.records.map(registro => registro.toObject());
}

// Cierra todas las conexiones al apagar la aplicacion
async function cerrar() {
  await driver.close();
}

module.exports = { driver, conectar, cypher, cerrar };
