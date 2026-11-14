# RESET ETSII UPM

Web de la Asociación de Estudiantes RESET, hecha con Astro y publicada en GitHub Pages.

## Editar contenido en local

La primera vez, instala las dependencias:

```sh
npm install
```

Abre dos terminales en la carpeta del proyecto.

En la primera, arranca la web:

```sh
npx astro dev --background
```

En la segunda, arranca el editor:

```sh
npm run cms:local
```

Abre <http://localhost:4321/PruebasWeb/admin/index.html#/>. El editor local guarda los cambios en el repo de tu ordenador; no los publica ni hace commits.

Para parar el editor, pulsa `Ctrl+C` en su terminal. Para parar Astro:

```sh
npx astro dev stop
```

## Qué se puede editar

- **Noticias:** título, fecha, resumen, categoría, imagen y texto.
- **Equipos de miembros:** curso, presentación, integrantes, cargos, foto principal y foto alternativa.
- **Cybertech:** edición, año, fechas, resumen, imagen y contenido.

Al guardar desde el editor, se crea o modifica un archivo Markdown dentro de `src/content/`. Revisa después el cambio, haz commit y súbelo a `main`; GitHub Actions compilará y publicará la web.

## Publicar el editor en internet

GitHub Pages publica la web, pero no proporciona la autenticación que Decap necesita para escribir en el repositorio. Para editar desde el `/admin` publicado hay que desplegar un OAuth proxy (por ejemplo, un Cloudflare Worker) y configurarlo en `public/admin/config.yml`. No se deben poner secretos de GitHub en el código del sitio.

## Comandos

| Comando | Acción |
| --- | --- |
| `npm run dev` | Arranca Astro en primer plano |
| `npm run cms:local` | Arranca el backend local del editor |
| `npm run build` | Compila la web en `dist/` |
| `npm run preview` | Previsualiza la compilación |
