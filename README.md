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
- **Actualizaciones automáticas activadas**: el repositorio de releases ([Ulisesfig/figueroatrainer-admin](https://github.com/Ulisesfig/figueroatrainer-admin)) ya está publicado y funcionando (1.2.3).

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

La app instalada busca versiones nuevas en **GitHub Releases** del repositorio `Ulisesfig/figueroatrainer-admin`
(ver `build.publish` en `package.json`). Para publicar una:

1. Subí el número de `version` en `package.json` (por ejemplo 1.1.0 → 1.2.0).
2. Creá un token de GitHub con permiso `repo` y definilo: `set GH_TOKEN=tu_token` (PowerShell: `$env:GH_TOKEN="tu_token"`).
3. Ejecutá `npm run release`: compila el instalador y lo sube como versión nueva.

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
