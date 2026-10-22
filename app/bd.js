// Rutas de Huejutla · conexion con Neo4j AuraDB.
// La direccion, el usuario y la contrasena NO estan en el codigo: se leen de los
// secretos del codespace (variables de entorno NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD).
const neo4j = require("neo4j-driver");               // controlador oficial de Neo4j para Node.js

const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = process.env;
if (!NEO4J_URI || !NEO4J_PASSWORD) {
  console.error("Faltan los secretos NEO4J_URI, NEO4J_USERNAME y NEO4J_PASSWORD (Parte 5 de la guia).");
  process.exit(1);
}

// Un solo "driver" para toda la aplicacion; administra las conexiones con Aura
const driver = neo4j.driver(
  NEO4J_URI,                                          // neo4j+s://xxxx.databases.neo4j.io (conexion cifrada)
  neo4j.auth.basic(NEO4J_USERNAME || "neo4j", NEO4J_PASSWORD),
  { disableLosslessIntegers: true }                   // enteros de Neo4j como numeros normales de JavaScript
);

// Ejecuta una consulta Cypher con parametros ($nombre) y devuelve las filas como objetos.
// Anota el Cypher en la bitacora para mostrarlo en la pagina.
async function cypher(consulta, parametros = {}, bitacora) {
  if (bitacora) bitacora.push(consulta.trim() + (Object.keys(parametros).length ? "\n// parametros: " + JSON.stringify(parametros) : ""));
  const r = await driver.executeQuery(consulta, parametros);
  return r.records.map(registro => registro.toObject());
}

module.exports = { driver, neo4j, cypher };
