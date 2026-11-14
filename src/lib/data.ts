import { getCollection } from 'astro:content';
import { normalizeCurso, normalizeEdicion, cursoCorto } from './render';

export const BASE = import.meta.env.BASE_URL;

export const href = (slug = '') => `${BASE.replace(/\/?$/, '/')}${slug.replace(/^\//, '')}`;

export async function getCursos() {
	const entries = await getCollection('miembros');
	return entries
		.map((e) => ({ id: e.id, data: normalizeCurso(e.data) }))
		.sort((a, b) => b.id.localeCompare(a.id))
		.map((c) => ({ ...c, label: `Miembros ${cursoCorto(c.data.curso)}`, url: href(`miembros/${c.id}`) }));
}

export async function getEdiciones() {
	const entries = await getCollection('cybertech');
	return entries
		.map((e) => ({ id: e.id, data: normalizeEdicion(e.data) }))
		.sort((a, b) => b.data.anio - a.data.anio)
		.map((c) => ({ ...c, label: `Cybertech ${c.data.anio}`, url: href(`cybertech/${c.id}`) }));
}

export async function getNoticias() {
	return (await getCollection('noticias')).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export const fecha = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
