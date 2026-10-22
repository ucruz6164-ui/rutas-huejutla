// Rutas de Huejutla · datos de la red (ficticia, inspirada en Huejutla)
// Ejecuta cada sentencia (termina en ;) por separado en Aura → Query (boton ▶).

// 1. Restricciones: el id de cada parada y de cada ruta es unico (como UNIQUE en SQL)
CREATE CONSTRAINT parada_id IF NOT EXISTS FOR (p:Parada) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT ruta_id IF NOT EXISTS FOR (r:Ruta) REQUIRE r.id IS UNIQUE;

// 2. Las 13 paradas (nodos). x, y = posicion en el mapa de la aplicacion (0 a 100)
UNWIND [
  {id:'terminal',    nombre:'Terminal de Autobuses',  x:8,  y:50},
  {id:'rio',         nombre:'Col. Del Rio',           x:10, y:20},
  {id:'centro',      nombre:'Centro',                 x:35, y:50},
  {id:'mercado',     nombre:'Mercado',                x:35, y:28},
  {id:'flores',      nombre:'Col. Las Flores',        x:15, y:82},
  {id:'pedregal',    nombre:'Fracc. Pedregal',        x:38, y:90},
  {id:'hospital',    nombre:'Hospital General',       x:56, y:22},
  {id:'deportiva',   nombre:'Unidad Deportiva',       x:58, y:55},
  {id:'plaza',       nombre:'Plaza Comercial',        x:55, y:80},
  {id:'libramiento', nombre:'Libramiento',            x:74, y:40},
  {id:'uthh',        nombre:'UTHH',                   x:90, y:15},
  {id:'loma',        nombre:'Col. Loma Bonita',       x:90, y:55},
  {id:'jardines',    nombre:'Col. Jardines',          x:84, y:86}
] AS dato
MERGE (p:Parada {id: dato.id})
SET p.nombre = dato.nombre, p.x = dato.x, p.y = dato.y;

// 3. Las 5 rutas de combi: cada ruta PASA_POR sus paradas en orden,
//    y entre cada par de paradas seguidas se crea un TRAMO con los minutos del recorrido.
UNWIND [
  {id:'R1', nombre:'Ruta 1 · Terminal - UTHH',        color:'#1F6FB4', pasaje:12, paradas:['terminal','centro','mercado','hospital','libramiento','uthh'], minutos:[5,3,5,4,6]},
  {id:'R2', nombre:'Ruta 2 · Las Flores - Loma Bonita', color:'#2E8B57', pasaje:12, paradas:['flores','centro','deportiva','loma'], minutos:[7,5,6]},
  {id:'R3', nombre:'Ruta 3 · Del Rio - Jardines',     color:'#D9822B', pasaje:12, paradas:['rio','mercado','centro','plaza','jardines'], minutos:[6,3,6,8]},
  {id:'R4', nombre:'Ruta 4 · Pedregal - UTHH',        color:'#8E44AD', pasaje:14, paradas:['pedregal','plaza','deportiva','libramiento','uthh'], minutos:[4,5,4,6]},
  {id:'R5', nombre:'Ruta 5 · Loma Bonita - Hospital', color:'#C0392B', pasaje:10, paradas:['loma','libramiento','hospital'], minutos:[5,4]}
] AS dato
MERGE (r:Ruta {id: dato.id})
SET r.nombre = dato.nombre, r.color = dato.color, r.pasaje = dato.pasaje
WITH r, dato
UNWIND range(0, size(dato.paradas) - 1) AS i
MATCH (p:Parada {id: dato.paradas[i]})
MERGE (r)-[pp:PASA_POR]->(p)
SET pp.orden = i + 1
WITH r, dato, i
WHERE i < size(dato.paradas) - 1
MATCH (a:Parada {id: dato.paradas[i]}), (b:Parada {id: dato.paradas[i + 1]})
MERGE (a)-[t:TRAMO {ruta: dato.id}]->(b)
SET t.minutos = dato.minutos[i], t.pasaje = dato.pasaje, t.cerrado = false;
