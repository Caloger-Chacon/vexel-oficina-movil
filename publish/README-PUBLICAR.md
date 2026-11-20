# Publicar la oficina con PIN

Un solo archivo: `server-pin.mjs`. Sirve la app completa detrás de un PIN y una cookie de sesión.
No necesita dependencias ni build: Node 18 o superior y la carpeta tal como está.

## Arrancar

```bash
PIN=483920 node publish/server-pin.mjs
```

Abre `http://localhost:8080`, pide el PIN y entra. El PIN va **solo** en la variable de entorno.

| Variable | Por defecto | Para qué |
|---|---|---|
| `PIN` | — (obligatoria) | 6 a 12 dígitos. Si falta o no cumple, el servidor no arranca. |
| `PORT` | `8080` | Puerto local. |
| `HOST` | `0.0.0.0` | Interfaz de escucha. |
| `SESSION_HOURS` | `12` | Duración de la sesión (1–72). |
| `COOKIE_SECURE` | auto | `1` fuerza `Secure` en la cookie. Por defecto se activa si el proxy manda `X-Forwarded-Proto: https`. |
| `TRUST_PROXY` | `0` | `1` para tomar la IP real de `X-Forwarded-For` (límite de intentos). |
| `OFFICE_URL` | vacío | Opcional: proxya **solo GET** `/api/office` y `/api/state` a la oficina viva. Sin esto sirve el snapshot. |

## Lo que hace

- **Login** en `/login`: formulario con PIN, comparación en tiempo constante, **6 intentos por IP cada 15 minutos** y cookie `HttpOnly; SameSite=Strict` (más `Secure` con HTTPS).
- **Sesión** en memoria: token aleatorio de 32 bytes, caducidad de 12 h. Reiniciar el servidor cierra todas las sesiones.
- **Solo GET** para la app: cualquier `POST`, `PUT`, `PATCH`, `DELETE` u `OPTIONS` fuera de `/login` y `/logout` responde **405** con `Allow: GET`. No hay forma de alcanzar los endpoints de escritura de la oficina.
- **Cabeceras**: CSP sin terceros, `nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`, `Permissions-Policy`, HSTS cuando va por HTTPS.
- **Rutas**: sin traversal (403 fuera de la raíz), MIME correcto, `sw.js` e `index.html` sin caché.
- **`/health`** responde `{"ok":true}` sin sesión, para el chequeo del host.

## Lo que no hace

- No hay usuarios ni auditoría: un PIN para todos. Si quieres uno por persona, hay que añadirlo.
- Sesiones e intentos viven en memoria: al reiniciar se pierden (y todos vuelven a entrar con el PIN).
- No termina TLS: el HTTPS lo pone el host o el proxy delante.
- No sirve los POST de la oficina, ni el SSE `/events`.

## Host con HTTPS

1. Sube la carpeta `vexel-oficina-v3` (con `publish/` dentro).
2. Arranca con `PIN=... PORT=8080 node publish/server-pin.mjs` (o un servicio del host).
3. Pon el proxy delante con TLS y que pase `X-Forwarded-Proto: https` (o define `COOKIE_SECURE=1`).
4. Comprueba `https://tu-host/health` y entra con el PIN.

## Pruebas hechas

- `node publish/smoke.mjs`: 302 a `/login` sin sesión, 200 del formulario, 401 con PIN malo, 303 con cookie al acertar, 200 de la app y del CSS con sesión, 404 de `/api/office` sin oficina, 405 a `POST`/`PUT`, 403 en traversal, `/health` 200, 401 sin cookie en JSON y **429 al séptimo intento**.
- `node publish/e2e.mjs`: login real en navegador, app cargada con 10 puestos, service worker registrado, 0 errores de página; PIN malo se queda en `/login` con «Intentos restantes: 5».
