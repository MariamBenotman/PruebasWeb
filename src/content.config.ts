import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// Todo el contenido editable se guarda como JSON porque el modo edición de la web lo escribe directamente.
// La forma de los datos está en src/lib/render.ts (normalizeCurso / normalizeEdicion / normalizeEntrada).
const json = (dir: string) => defineCollection({ loader: glob({ base: `./src/content/${dir}`, pattern: '*.json' }) });

export const collections = {
	miembros: json('miembros'),
	cybertech: json('cybertech'),
	proyectos: json('proyectos'),
	talleres: json('talleres'),
	servicios: json('servicios'),
	noticias: json('noticias'),
	paginas: json('paginas'), // Colaboradores, Contacto, Participa… (una por archivo)
	inicio: json('inicio'), // la portada (un solo archivo: portada.json)
};
