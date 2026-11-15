import { getCollection } from 'astro:content';
import { normalizeCurso, normalizeEdicion, normalizeEntrada, normalizePagina, ordenEntradas, cursoCorto, SECCIONES, type SeccionKey } from './render';

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

/** Proyectos, Talleres, Servicios o Noticias, ordenados (lo más reciente primero). */
export async function getEntradas(seccion: SeccionKey) {
	const entries = await getCollection(seccion);
	return entries
		.map((e) => ({ id: e.id, data: normalizeEntrada(e.data), url: href(`${seccion}/${e.id}`) }))
		.sort((a, b) => ordenEntradas(a.data, b.data));
}

export type EntradaItem = Awaited<ReturnType<typeof getEntradas>>[number];
export interface Raiz extends EntradaItem {
	/** Ediciones (lo más reciente primero), incluidas las ocultas. Vacío si no se repite. */
	ediciones: EntradaItem[];
	/** Las que se ven en la web (sin las ocultas) */
	visibles: EntradaItem[];
	/** Sale en el menú y en el listado de la sección (no está oculta y tiene «Mostrar en la sección» marcado) */
	listada: boolean;
	/** Fecha más reciente entre la entrada y sus ediciones (para ordenar) */
	reciente: string;
}

/**
 * Agrupa las entradas de una sección: lo genérico arriba ("Octubre Robótico") y sus ediciones
 * debajo ("Octubre Robótico 2024"…). Una edición cuya entrada genérica no existe se trata como independiente.
 */
export async function getArbol(seccion: SeccionKey) {
	const todas = await getEntradas(seccion);
	const porId = new Map(todas.map((e) => [e.id, e]));
	const conEdiciones = SECCIONES[seccion].ediciones;
	const padreDe = (e: EntradaItem) => {
		const p = conEdiciones && e.data.serie && e.data.serie !== e.id ? porId.get(e.data.serie) : undefined;
		return p && !p.data.serie ? p : undefined;
	};
	const raiz: Raiz[] = todas.filter((e) => !padreDe(e)).map((e) => {
		const ediciones = todas.filter((x) => padreDe(x)?.id === e.id);
		const visibles = ediciones.filter((x) => !x.data.oculto);
		const reciente = [e.data.fecha, ...visibles.map((x) => x.data.fecha)].filter(Boolean).sort().pop() ?? '';
		return { ...e, ediciones, visibles, reciente, listada: !e.data.oculto && e.data.enListado };
	});
	raiz.sort((a, b) => b.reciente.localeCompare(a.reciente) || a.data.titulo.localeCompare(b.data.titulo, 'es'));
	/** Qué ediciones incluyen una entrada (bloque "Talleres de esta edición"), solo las visibles */
	const incluidaEn = (id: string) => todas.filter((x) => !x.data.oculto && x.data.incluye.includes(id));
	/** Datos mínimos de las entradas, para dibujar el bloque "Talleres de esta edición" */
	const refs = todas.filter((x) => !x.data.oculto).map((x) => ({ id: x.id, titulo: x.data.titulo, resumen: x.data.resumen, portada: x.data.portada }));
	return { todas, raiz, padreDe, incluidaEn, refs };
}

/** Apartados sueltos (Colaboradores, Contacto, Participa…), en el orden del menú. */
export async function getPaginas() {
	const entries = await getCollection('paginas');
	return entries
		.map((e) => ({ id: e.id, data: normalizePagina(e.data), url: href(e.id) }))
		.sort((a, b) => (a.data.orden || 99) - (b.data.orden || 99) || a.data.titulo.localeCompare(b.data.titulo, 'es'));
}

export const img = (p?: string) => (p ? (/^(https?:|\/)/.test(p) ? p : href(p)) : '');

export { fechaLarga as fecha } from './render';
