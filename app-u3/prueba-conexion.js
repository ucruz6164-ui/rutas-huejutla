// Prueba de conexion: node prueba-conexion.js
const { conectar, cypher, cerrar } = require("./bd");

async function main() {
  const inicio = Date.now();
  const agente = await conectar();
  console.log("Servidor:", agente, "·", Date.now() - inicio, "ms");
  const [n] = await cypher(`
RETURN COUNT { (:Parada) } AS paradas,
       COUNT { (:Ruta) } AS rutas,
       COUNT { ()-[:TRAMO]->() } AS tramos`, {}, "leer");
  console.log("Paradas:", n.paradas, "· Rutas:", n.rutas,
    "· Tramos:", n.tramos);
}

main()
  .catch(e => console.error("Fallo la conexion:", e.code, e.message))
  .finally(cerrar);
