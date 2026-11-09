// Rutas de Huejutla · otro cliente de la misma API.
// No usa Neo4j: consume la API REST, igual que las paginas web.
// Uso: node cliente.js rio uthh [tiempo|costo|transbordos]
const BASE = process.env.API_URL || "http://localhost:3000";

// Pide una ruta de la API y devuelve el JSON (o lanza el error)
async function api(ruta) {
  const r = await fetch(BASE + "/api" + ruta);
  const datos = await r.json();
  if (!r.ok) throw new Error(r.status + " " + datos.error);
  return datos;
}

async function main() {
  const [origen = "rio", destino = "uthh", orden = "tiempo"] =
    process.argv.slice(2);
  // Dos peticiones en paralelo: nombres de paradas y opciones
  const p = new URLSearchParams({ origen, destino, orden });
  const [lista, r] = await Promise.all([
    api("/paradas"),
    api("/como-llego?" + p),
  ]);
  const nombre = {};
  for (const x of lista.paradas) nombre[x.id] = x.nombre;
  console.log(nombre[origen] + " -> " + nombre[destino] +
    " (orden: " + orden + ")");
  if (!r.opciones.length) console.log("No hay forma de llegar.");
  r.opciones.forEach((op, k) => {
    console.log("\n" + (k + 1) + ". " + op.tiempoTotal + " min · " +
      op.transbordos + " transbordo(s) · $" + op.costo);
    for (let i = 0; i < op.rutas.length; i++) {
      console.log("   " + op.rutas[i] + "  " + nombre[op.paradas[i]] +
        " -> " + nombre[op.paradas[i + 1]]);
    }
  });
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
