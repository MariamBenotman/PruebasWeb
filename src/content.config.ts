import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const noticias = defineCollection({
	loader: glob({ base: './src/content/noticias', pattern: '**/*.md' }),
	schema: z.object({
		title: z.string(),
		pubDate: z.coerce.date(),
		summary: z.string(),
		category: z.string().optional(),
		image: z.string().optional(),
	}),
});

// Miembros y Cybertech se guardan como JSON porque el modo edición de la web los escribe directamente.
// La forma de los datos está en src/lib/render.ts (normalizeCurso / normalizeEdicion).
const miembros = defineCollection({
	loader: glob({ base: './src/content/miembros', pattern: '*.json' }),
});

const cybertech = defineCollection({
	loader: glob({ base: './src/content/cybertech', pattern: '*.json' }),
});

export const collections = { noticias, miembros, cybertech };
