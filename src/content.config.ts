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

const miembros = defineCollection({
	loader: glob({ base: './src/content/miembros', pattern: '**/*.md' }),
	schema: z.object({
		title: z.string(),
		academicYear: z.string(),
		introduction: z.string().optional(),
		members: z.array(z.object({
			name: z.string(),
			role: z.string().optional(),
			photo: z.string().optional(),
			photoHover: z.string().optional(),
		})).default([]),
	}),
});

const cybertech = defineCollection({
	loader: glob({ base: './src/content/cybertech', pattern: '**/*.md' }),
	schema: z.object({
		title: z.string(),
		year: z.number().int(),
		eventDate: z.string().optional(),
		summary: z.string(),
		image: z.string().optional(),
	}),
});

export const collections = { noticias, miembros, cybertech };