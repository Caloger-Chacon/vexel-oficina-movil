# Dirección visual v3 · oficina cortada — decisión A/B, arte aplicado y números reales

Fecha: 20-11-2026 · Referencia del dueño: «Mi oficina de agentes de IA» (David Chavarin).
Artefacto: `vexel-oficina-v3/` · respaldos intactos: `vexel-oficina-v2/` y `vexel-movil/`.

## Qué se copió de la referencia

| Elemento | Cómo está en el prototipo |
|---|---|
| Planta cortada | Planta de 880×620 con muros perimetrales a media altura (150) y paredes de cristal (104) en la oficina de Ciro y en la sala de Operaciones. Se ve el interior desde arriba en 3/4. |
| Suelo en loseta | Losetas de 60×60 (`#202b3c` / `#18202d`, contraste 1,15:1) con junta de 1 px y brillo suave; alfombras por zona. |
| Muebles que cuentan el trabajo | 10 escritorios (alto 40) con monitor encendido, teclado, ratón, papeles, taza, silla; estantería, plantas, rincón de café, recepción y sofá. |
| Personajes sentados | Cuerpo 36×26×34, cabeza 32×32 (36 % de la figura), pelo, brazos al teclado y tecleo animado; color de área. |
| Etiqueta flotante | Píldora de 17/18/20 px con punto de estado y nombre corto, anclada con línea guía; anti-solape por empujes. |
| Luz de pantalla | Gradiente radial de 56 u en el color del estado, en `lighter`, sobre mesa y personaje: enlaza área, persona y estado. |
| Cámara que baja al puesto | Toque → la vista vuela al escritorio (zoom 2.15) y se abre la ficha; botón «◀ Oficina» y doble toque para volver. Límite práctico de inclinación: 28–30°. |
| Dock inferior | Los 10, con avatar, color de estado y nombre; el seleccionado se marca. |
| Panel del agente | Ficha inferior de solo lectura: rol, estado, tarea, última entrega, mensajes y carga. |

No se copió: chat dentro de la app, tarjetas accionables, la marca de la serie ni el encuadre vertical
recortado (la nuestra es responsive 375–390). La paleta sigue siendo VEXEL: oscuro, vidrio y oro.

## Lo que cambió el pase de arte (v3)

| # | Corrección | Valor aplicado |
|---|---|---|
| 1 | Suelo y muro | Loseta `#202b3c`/`#18202d` (contraste 1,15:1), junta 1 px `rgba(4,7,12,.55)`; muro `#212c3d`, remate 8 px `#a3b9d6`, banda `#0d141e` bajo el remate. |
| 2 | Vidrio | Paños 0,08 / 0,12 / 0,18 con tinte `#a9d4ff`; riel superior 2 px `#d9ecff` a 0,55; montante cada 62 u a 0,28; reflejo al 5 %; contacto de 3 px. |
| 3 | Densidad | Paso 206×146 (pasillo 78 u ≈ 0,85 m); huella 23 %; sala de estar en la banda vacía; pila de carpetas por puesto, nada suelto en el pasillo. |
| 4 | Personaje/escritorio | Escritorio 40 de alto; monitor 34×22; asiento 22; cuerpo 36×26×34; cabeza 32×32; brazos 26×11; figura 88 u. |
| 5 | Etiquetas | 17/18/20 px y fuente 10,5/11/12 en tres niveles; anti-solape; con zoom ≥ 1,6 se ocultan. Sin solapes a 390 y 375 según la medición del pase de arte. |
| 6 | Luz de pantalla | Radial de 56 u `rgba(color,.15)` a `.05` a 0 en `lighter`, 1 draw por puesto. |

## Encuadre y etiquetas (ajuste v3.1)

| Criterio | 390×844 | 375×812 |
|---|---|---|
| Alto de planta / alto útil | **0,680** (445 / 654) | **0,680** (423 / 622) |
| Alto de figura sentada | **29,0 px** | **27,6 px** |
| Etiquetas en reposo | **3** | **3** |
| Solapes de etiquetas | **0** | **0** |
| Separación mínima | **45,1 px** | **41,2 px** |
| Puestos con el punto de toque en pantalla, sin arrastrar | **8 de 10** | **8 de 10** |
| Nombres del dock truncados | **0 de 10** | **0 de 10** |

Decisiones: la escala inicial la manda el alto (0,68 del alto útil), así que la planta se desborda
unos 90 px por lado y se recorre con arrastre; Ops y Admin quedan fuera del encuadre inicial y se
alcanzan con un arrastre corto o desde el dock. En reposo se ven como mucho 3 etiquetas: primero las
de agentes activos o en riesgo y, si no hay, las de actividad más reciente (si no, con todo el equipo
inactivo la escena se quedaba sin nombres). Al acercar aparecen las de todas las cabezas visibles
(7 a 1,36×, sin solapes). El dock usa nombres cortos
propios (Ops, Admin, Diseño, Finanzas…) para que ninguno se corte.

La colocación es codiciosa: se prueba la posición natural sobre la cabeza y solo se empuja si la
guía sigue midiendo ≤ 40 px; si no cabe con guía corta, esa etiqueta no se pinta, nunca se apila.
En las capturas las tres guías miden 10 px.

## A vs B, con números medidos (no estimados)

Escenario: 390×844, DPR 3 (canvas capado a 2 → 780×1688), Chrome escritorio headless, GPU Intel
Iris Xe. `A` = banco three.js 0.169 sin etiquetas, dock, ficha ni picking (115 draw calls).
`B` = la app completa.

| | A · three.js | B · canvas 2D |
|---|---|---|
| Peso de la escena | **138 KB** solo la librería | **28,7 KB gzip** todo el cliente |
| Primera carga | ~208 KB | **77 KB** medidos con iconos y manifest |
| Dibujos por segundo en reposo | ~60 (rAF continuo) | **30,1** estables (medidos 151 draws en 5,01 s) |
| Coste de dibujo | 1,0–1,1 ms es *submit* de JS, no frame; GPU ociosa 0,02–0,05 ms con `gl.finish()` | **3,7 ms p50 · 7,0 ms p95** por frame |
| Arranque | 52 ms de tarea larga (escritorio); 294 ms con CPU a 4× | no medido |
| 60 fps | sí, con 115 draw calls y GPU real | **solo durante la transición**; en headless DPR 3 dio 41,1 dibujos/s (techo de rAF con rasterizado por software) |
| Etiquetas, dock, ficha | a mano: sprites/CSS2D + HTML | incluidos |
| Riesgo en gama media | arranque y pérdida de contexto WebGL; el shader compile no manda (2 programas, 0,1 ms) | GPU no; CPU y batería sí |

**Conclusión: B para la fase 1.** A gana en sombras/luz reales, oclusión y cámara libre a altura de
ojos; B gana en peso (4,8× menos que A), cero riesgo de GPU y que ya trae la interfaz completa.
B **no** es una app de 60 fps: está diseñada a 30 estables y solo dibuja a 60 durante el vuelo al
puesto. Para 60 sostenidos haría falta `OffscreenCanvas`, gradientes cacheados, capa estática y
etiquetas solo al cambiar; para A, merge/instancing y materiales básicos (10–16 días de ingeniería).

Lo que **no** se puede afirmar: fps ni batería en un teléfono real (ni A ni B), GPU Mali/Adreno,
iOS, primera carga en 4G.

## Solo lectura y offline: lo verificado en esta sesión

- 6 métodos no-GET (`POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`) → **405 con `Allow: GET`**,
  contra el servidor de prueba. Cliente: un solo `fetch`, siempre GET.
- Sin red, con estado en vivo cacheado: cabecera **«guardado»**, aviso «Estado guardado hace 3 s»
  y los agentes del último estado vivo (2), no el snapshot de diseño (10). Probado matando los dos
  servidores, no simulando el modo offline del navegador.
- Caché del estado: 24 h y botón «Borrar datos guardados»; ambos con alcance limitado a
  `vexel-oficina*` (antes borraban/afectaban cachés de todo el origen).

## Cómo probarlo

```bash
cd vexel-oficina-v3
node server-movil.mjs            # http://127.0.0.1:4321 (MOVIL_PORT)
node tools/measure.mjs           # peso, capturas 390/375 y banco A
node tools/measure-v3.mjs        # draws/s reales, coste por frame, ficha, 375
node tools/test-offline.mjs      # cae la red de verdad y comprueba el estado guardado
```

## Siguiente paso

1. Integración: montar `/movil` en `server.mjs` de la oficina (plan de Operaciones) y PIN + HTTPS
   antes de salir de la LAN.
2. Medir en un Android de gama media y un iPhone: draws/s, batería 10 min y arranque.
3. Decidir si se paga el salto a 60 fps o se queda el diseño a 30.
