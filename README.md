# VEXEL · Oficina v3 — planta cortada (prototipo)

Reconstrucción visual de la oficina según la referencia del dueño: planta en corte, muebles,
personajes sentados en su puesto, etiquetas, dock y cámara que baja al agente. **Solo lectura.**

- Decisión A (three.js) vs B (canvas 2D), arte v3 y números medidos: `DIRECCION-VISUAL.md`.
- Respaldos intactos: `../vexel-oficina-v2/` (antes del pase de arte) y `../vexel-movil/`.

## Correr

```bash
cd vexel-oficina-v3
node server-movil.mjs                 # http://127.0.0.1:4321
MOVIL_PORT=4333 node server-movil.mjs # otro puerto
```

En el teléfono, misma red: `MOVIL_HOST=0.0.0.0 node server-movil.mjs`.
Con estado real de la oficina: `OFFICE_URL=http://127.0.0.1:3101 node server-movil.mjs`.
`?demo=1` pinta datos de diseño marcados DEMO.

## Medir y capturar

```bash
node tools/measure.mjs      # peso, capturas 390/375 y banco three.js
node tools/measure-v3.mjs   # draws/s reales, coste por frame, ficha, 375
node tools/measure-frame.mjs # encuadre, figura, etiquetas y dock a 390 y 375
node tools/test-offline.mjs # cae la red de verdad y comprueba el estado guardado
```

Resultado (20-11-2026, escritorio headless, Intel Iris Xe, DPR 3):

| | Medido |
|---|---|
| Peso del cliente | 28,7 KB gzip · 77 KB de primera carga |
| Dibujos por segundo en reposo | **30,1** estables |
| Coste por frame | **3,7 ms p50 · 7,0 ms p95** |
| Encuadre | planta al **68 %** del alto útil; figura de **29 px** (390) / **27,6 px** (375) |
| Etiquetas en reposo | **3**, cero solapes, 41–45 px de separación |
| Durante el vuelo al puesto | dibuja cada frame (41,1/s en headless DPR 3, techo de rAF) |
| Caché offline | estado vivo guardado 24 h, marcado «guardado» |
| Escrituras | 0: 405 con `Allow: GET` en POST/PUT/PATCH/DELETE/OPTIONS/HEAD |

Detalle y conclusión en `DIRECCION-VISUAL.md`.

## Qué hace

| Zona | Comportamiento |
|---|---|
| Planta | Ciro en su oficina de cristal (alfombra dorada) y 9 puestos: Marketing, Creativo, Mentoría, CFO, Legal, Personas, Comercial, Operaciones y Admin en la sala de cristal. |
| Etiquetas | Nombre corto + punto de estado sobre cada personaje; 3 niveles de tamaño, sin solapes. |
| Toque | Vuela al puesto, abre la ficha de solo lectura y muestra «◀ Oficina». |
| Dock | Los 10 con avatar, color de estado y nombre; se desplaza en horizontal. |
| «Ahora» | Atenúa a quien no está en marcha ni esperando. |
| Ficha | Rol, estado, carga (semáforo derivado), tarea, última entrega, mensajes, borrar datos. |
| PWA | Manifest, service worker con caducidad de 24 h del último estado y marca de «guardado». |

## Solo lectura (igual que la v1)

`fetch` solo GET en `js/data.js`; el servidor de prueba responde 405 a todo lo demás; el service worker
descarta lo que no sea GET; el único enlace saliente (chat en Maus) está desactivado hasta tener su URL.
El borrado de caché y la limpieza de versiones solo tocan claves `vexel-oficina*`.

## Pendiente

- Medir en un Android de gama media y un iPhone (draws/s y batería). Sin eso, los números son de escritorio.
- `MAUS_CHAT_URL` (esquema del enlace al chat) y PIN/HTTPS en el despliegue.
- Montar `/movil` en `server.mjs` de la oficina (plan de Operaciones) — el repo de la oficina sigue sin tocar.
