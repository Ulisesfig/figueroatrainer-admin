# Figueroa Trainer Admin (programa de escritorio)

Programa para Windows pensado para los administradores de Figueroa Trainer. Hace todo lo que el panel de la web
(alumnos, planes, ejercicios, tienda y pagos) con más comodidad: atajos de teclado, búsqueda instantánea,
editor de rutinas por arrastre y un borrador automático para no perder trabajo.

Usa el **mismo servidor** que la web y la app (`https://figueroatrainer-backend-production.up.railway.app`), así que
todo lo que se cambia acá se ve enseguida en los otros lados. Solo entran cuentas con rol **admin**.

## Qué incluye

- **Hoy**: pizarra con alumnos, quién entrenó esta semana, vencimientos y lo cobrado en el mes; renovar 1 mes con un clic (con "deshacer") y avisar por WhatsApp.
- **Alumnos**: búsqueda sin tildes, filtros (por vencer, vencidos, sin app, admins), selección múltiple, exportar CSV, alta de alumnos, panel con datos, planes, pesos y cuenta.
- **Planes**: rutinas por días (calentamiento, ejercicios, core, movilidad, cardio), series por separado, variantes, superseries, autocompletado del catálogo, reordenar arrastrando o con Alt+↑/↓, vista previa, planes de alimentación, importación de planes viejos en texto.
- **Ejercicios**: catálogo con video, variantes y papelera con restauración.
- **Tienda**: habilitar/ocultar, productos con imágenes y stock, pedidos.
- **Pagos**: historial con filtros, totales y exportación.
- **Mensajes**: lo que la gente escribe desde la página de Contacto del sitio (también llega por email, pero acá queda guardado siempre), con filtro por tema, búsqueda y respuesta directa por email.
- **Ctrl+K**: paleta de comandos para saltar a cualquier alumno, plan, ejercicio o mensaje.

## Novedades de la versión 1.2

- **Mensajes de contacto:** nueva sección que lista lo que llega desde la página de Contacto del sitio, con filtro por tema, búsqueda, aviso de "nuevo" y botón para responder por email o eliminar.
- **Vaciar todos los mensajes** de una vez, pidiendo escribir "VACIAR" para confirmar (1.2.1).
- Aviso de escritorio cuando llega un mensaje nuevo, igual que para pagos y registros.
- El formulario de Contacto ahora pide el teléfono (opcional): si lo dejan, se puede **responder por WhatsApp** además de por email (1.2.2).
- **Alimentación (1.2.7):** nueva pestaña en el panel de cada alumno para fijar sus objetivos diarios (calorías, proteínas, carbohidratos y grasas, con cálculo de calorías desde los macros) y ver qué registró en los últimos 14 días, marcando cada día como en objetivo, debajo o arriba.
- **Actualizaciones firmadas (1.2.6):** cada versión se verifica con una firma propia antes de instalarse; una versión subida al bucket sin la clave privada se rechaza. El CSV exportado ya no ejecuta fórmulas escritas por alumnos (`=`, `+`, `-`, `@`).
- **Actualizaciones automáticas activadas y probadas de punta a punta**: el repositorio de releases ([Ulisesfig/figueroatrainer-admin](https://github.com/Ulisesfig/figueroatrainer-admin)) está publicado y funcionando. Probado en la instalación real: detectó, descargó, verificó el hash e instaló la versión nueva sola, sin perder la sesión (1.2.3). La instalación ahora corre en silencio, sin ventanas intermedias (1.2.4).

## Novedades de la versión 1.1

- **Avisos en tanda por WhatsApp** con plantillas editables (por vencer, vencidos, sin entrenar, bienvenida, mensaje libre).
- **Seguimiento por alumno:** gráfico de días de rutina por semana, última actividad, filtro "Sin entrenar" y tarjeta en Hoy.
- **Notas privadas** por alumno (fijar, editar, borrar) e **historial de cambios** (quién hizo qué).
- **Editor de planes:** deshacer/rehacer (Ctrl+Z), traer días de otros planes y exportar a **PDF**.
- **Ingresos:** cobrado por mes (suscripciones y tienda), altas por mes y números clave.
- **Avisos de escritorio** (pagos aprobados, nuevos registros, vencimientos) con la app en la bandeja.
- **Actualizaciones automáticas.**

## Atajos

| Atajo | Acción |
| --- | --- |
| Ctrl+K | Buscar y ejecutar comandos |
| Ctrl+1 … 7 | Ir a Hoy, Alumnos, Planes, Ejercicios, Tienda, Pagos, Mensajes |
| Ctrl+N | Crear (según la pantalla) |
| Ctrl+S | Guardar el plan (en el editor) |
| Ctrl+D | Duplicar el día abierto (en el editor) |
| Ctrl+Z / Ctrl+Shift+Z | Deshacer / rehacer (en el editor) |
| Alt+↑ / Alt+↓ | Mover un ejercicio |
| Ctrl+B | Mostrar/ocultar la barra lateral |
| F5 | Actualizar datos |

## Desarrollo

```bash
npm install
npm start          # abre la app
npm run smoke      # prueba automática contra un servidor de mentira (test/mock-server.js)
npm run icon       # regenera build/icon.png
npm run dist       # genera el instalador en dist/ (Windows x64)
```

> Si tu terminal tiene la variable `ELECTRON_RUN_AS_NODE` definida (pasa en algunos editores), quitala antes de
> `npm start` o `npm run smoke`, si no Electron se ejecuta como Node.

## Publicar una versión nueva (actualización automática)

La app instalada busca versiones nuevas en `/updates` del backend (`figueroatrainer-backend-production`), que a su
vez sirve los archivos desde un bucket privado de Railway (ver `build.publish` en `package.json` y
`src/controllers/updatesController.js` en el backend). No hace falta ningún token de GitHub. Para publicar una:

1. Subí el número de `version` en `package.json` (por ejemplo 1.2.4 → 1.2.5).
2. Completá `tools/.env.updates` con las credenciales del bucket (una sola vez; mirá `tools/.env.updates.example`
   y `railway bucket credentials --bucket ft-admin-updates` si hay que regenerarlas).
3. Ejecutá `npm run release`: compila el instalador (`npm run dist`), lo firma y sube el `.exe`, el `.blockmap`,
   `latest.sig` y por último `latest.yml` al bucket (`npm run publish-update`).

**Firma de las actualizaciones (desde 1.2.6):** la app instalada solo instala una versión si `latest.sig` es una firma
Ed25519 válida de esa versión y su sha512, hecha con `UPDATES_SIGNING_KEY` (en `tools/.env.updates`, fuera de git).
La clave pública está en `src/updateSignature.js`. **Guardá una copia de `tools/.env.updates` en un lugar seguro:** si la
clave privada se pierde, las apps instaladas no aceptan más actualizaciones y habría que reinstalarlas a mano.

Las apps instaladas la descargan solas y avisan para reiniciar. Los avisos de escritorio y las actualizaciones solo
funcionan en la app instalada (no con `npm start`).

## Seguridad

- La sesión se guarda cifrada con Windows (`safeStorage`); la interfaz nunca ve el token.
- Todas las llamadas salen por el proceso principal (sin CORS y sin exponer credenciales).
- Sin `innerHTML`: todo el texto se inserta como texto, no como HTML.
- CSP estricta, `contextIsolation` y `sandbox` activados; los enlaces externos solo abren `http(s)`, `mailto` y `tel`.

## Estructura

```
main.js · preload.js        proceso principal y puente seguro
src/                        almacenamiento y cliente HTTP
renderer/                   interfaz (HTML + ES modules, sin dependencias)
  js/views/                 una pantalla por archivo
  js/lib/                   componentes, datos, formato, modelo del editor
test/                       servidor de mentira + prueba de humo
tools/                      generador del ícono
```
