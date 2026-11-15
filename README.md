# Web de Reset · ETSII-UPM

Web de la Asociación de Estudiantes Reset, hecha con [Astro](https://astro.build) y publicada gratis en GitHub Pages.

## Para editores (no hace falta saber programar)

La web se edita **desde la propia web**:

1. Ve al pie de página → **Acceso editores** (`/admin`).
2. Pega la clave de acceso (token de GitHub). En esa misma página se explica cómo crearla. Solo hace falta una vez por ordenador.
3. Navega a la página que quieras cambiar. Aparece una barra negra abajo:
   - **Haz clic en cualquier bloque** (una persona, una categoría, una prueba…) y se abre un panel a la derecha con sus campos. La página cambia en directo mientras escribes.
   - Los botones naranjas **+ Añadir…** añaden personas, secciones, categorías, pruebas, fotos…
   - **Guardar y publicar** sube los cambios. La web pública se actualiza sola en 1–2 minutos.
4. Para crear contenido nuevo, abre el menú correspondiente y pulsa el botón naranja **+ Nuevo…**: curso de miembros o apartado (*Conócenos*), edición de Cybertech, proyecto, taller, servicio o noticia. En los listados de Proyectos, Talleres, Servicios y Noticias también aparece el botón. Cursos y ediciones pueden empezar copiando el anterior.

**Ediciones de talleres** (Octubre Robótico 2024, 2025…): cualquier taller puede tener ediciones. Pulsa **+ Nueva edición** en el menú (al pasar el ratón por encima), en su página o en su panel de *Datos generales*: sale ya enlazada y puedes copiar el contenido de la anterior. En el menú, al pasar el ratón por encima aparecen sus ediciones. Para enlazar una entrada que ya existe, ábrela y elige la genérica en «¿Es una edición de algo que se repite?».

**Eliminar:** cualquier persona, categoría, prueba, foto… tiene un botón *Eliminar* en su panel, y cada página entera (curso, edición, taller, apartado…) se elimina desde *Datos generales → Zona peligrosa*. Siempre pide confirmación (hay que pulsar dos veces). Si te equivocas, todo queda en el historial de GitHub y se puede recuperar.

**Roles y etiquetas:** al escribir un rol (Presidente, Tesorería…) puedes elegir uno guardado o crear uno nuevo. Los nuevos se quedan guardados para los siguientes cursos (en `src/data/etiquetas.json`).

**Fotos:** se pueden subir desde el editor (se recortan y optimizan solas) o copiar a mano a `public/`. La lista de fotos que faltan y dónde va cada una está en [FOTOS-PENDIENTES.md](FOTOS-PENDIENTES.md).

### Editar en local, sin clave

Con la web arrancada en tu ordenador (`npx astro dev`), el modo edición se activa solo, sin token. Verás la etiqueta verde **LOCAL** en la barra. Los cambios se guardan directamente en los archivos de la carpeta del proyecto y no se publican: revisa con `git diff` y haz commit cuando quieras. Este modo no existe en la web publicada.

## Para desarrolladores

```sh
npm install
npx astro dev --background   # http://localhost:4321/PruebasWeb/
npx astro dev stop
npm run build                # compila en dist/
npm run fotos                # regenera FOTOS-PENDIENTES.md
```

### Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Miembros (un JSON por curso) | `src/content/miembros/2022-23.json` |
| Cybertech (un JSON por edición) | `src/content/cybertech/2023.json` |
| Proyectos, Talleres, Servicios, Noticias (un JSON por entrada) | `src/content/proyectos/rhex.json`, etc. |
| Apartados de Conócenos y sueltos (colaboradores, contacto, participa, calendario) | `src/content/paginas/` (editables desde la web) |
| Correo, dirección y redes sociales | `src/data/contacto.ts` |
| Etiquetas guardadas (roles…) | `src/data/etiquetas.json` |
| Repositorio en el que escribe el editor | `src/data/sitio.json` → `github` |
| Máximo de cosas por desplegable del menú (6) y noticias con foto (3) | `src/data/sitio.json` → `menu` |
| Diseño de Miembros y Cybertech (compartido con el editor) | `src/lib/render.ts` + `src/styles/global.css` |
| Modo edición | `src/admin/` (`schema.ts` define los campos de cada formulario) |
| Logos, fuente, fotos | `public/marca/`, `public/fuentes/`, `public/fotos/` |

**Idea clave:** las páginas de Miembros y Cybertech se dibujan con las funciones de `src/lib/render.ts`. Astro las usa al compilar y el modo edición las usa en el navegador para la vista previa. Por eso lo que se ve al editar es exactamente lo que se publica. Para añadir un campo nuevo: añádelo en `normalize…` y `render…` (`render.ts`) y en `src/admin/schema.ts`.

**Cómo guarda el editor:** hace un commit en la rama `main` mediante la API de GitHub (con el token del navegador). El workflow `.github/workflows/deploy-and-check.yml` compila y publica en GitHub Pages.

### Si el repositorio cambia de cuenta

Cuando el repositorio pase a la cuenta de Reset, actualiza:

1. `src/data/sitio.json` → `owner` y `repo`.
2. `astro.config.mjs` → `site` y `base`.
3. Crea un token nuevo desde la cuenta de Reset.
