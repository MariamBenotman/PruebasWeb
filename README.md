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
4. Para crear un **curso nuevo de miembros** o una **edición nueva de Cybertech**, abre el menú *Conócenos* o *Cybertech* y pulsa **+ Nuevo curso** / **+ Nueva edición**. Puedes empezar copiando el anterior.

**Roles y etiquetas:** al escribir un rol (Presidente, Tesorería…) puedes elegir uno guardado o crear uno nuevo. Los nuevos se quedan guardados para los siguientes cursos (en `src/data/etiquetas.json`).

**Fotos:** se pueden subir desde el editor (se recortan y optimizan solas) o copiar a mano a `public/`. La lista de fotos que faltan y dónde va cada una está en [FOTOS-PENDIENTES.md](FOTOS-PENDIENTES.md).

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
| Noticias (Markdown) | `src/content/noticias/*.md` |
| Páginas fijas (proyectos, talleres, servicios, contacto…) | `src/data/paginas.ts` |
| Etiquetas guardadas (roles…) | `src/data/etiquetas.json` |
| Repositorio en el que escribe el editor | `src/data/sitio.json` |
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
