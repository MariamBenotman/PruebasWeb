/**
 * Cargos de Miembros ligados a su sección: «Presidente» es de Junta, «Vocal de Taller» es de Vocales…
 *
 * - Cada cargo pertenece a una sección. Se guarda en src/data/etiquetas.json, en listas «roles@Junta», «roles@Vocales»…
 *   y además se deduce de todos los cursos ya publicados (dónde estaba quien lo tenía).
 * - Al poner un cargo a alguien, se mueve solo a la sección de ese cargo; al quitarle todos, vuelve a la sección
 *   general (Miembros).
 * - Nadie puede tener a la vez cargos de dos secciones (p. ej. de Junta y de Vocales).
 */
import { tagStore } from './tags';
import type { Curso, Miembro, SeccionMiembros } from '../lib/render';

const PREFIJO = 'roles@';
const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Secciones que tienen cargos propios (las que aparecen en etiquetas.json) */
export const seccionesConCargos = () =>
	Object.keys(tagStore.data).filter((k) => k.startsWith(PREFIJO) && tagStore.data[k].length).map((k) => k.slice(PREFIJO.length));

/** Sección a la que pertenece un cargo, o null si no se sabe */
export function seccionDeRol(rol: string): string | null {
	for (const s of seccionesConCargos()) if (tagStore.list(PREFIJO + s).some((r) => igual(r, rol))) return s;
	return /^vocal\b/i.test(rol.trim()) ? 'Vocales' : null;
}

/** Apunta un cargo como de una sección (al crearlo). Marca etiquetas.json para guardarlo. */
export function asignarSeccion(rol: string, seccion: string) {
	tagStore.add('roles', rol);
	tagStore.add(PREFIJO + seccion, rol);
}

/** Aprende de los cursos publicados de qué sección es cada cargo (sin marcar cambios) */
export function aprenderDe(cursos: Curso[]) {
	for (const c of cursos) for (const s of c.secciones) for (const m of s.miembros) for (const r of m.roles) {
		tagStore.seed('roles', [r]);
		if (!seccionDeRol(r) && s.orden === 'manual') tagStore.seed(PREFIJO + s.titulo, [r]);
	}
}

/** La sección general, donde va quien no tiene cargo: la primera en orden alfabético (Miembros), o la última */
export function seccionBase(d: Curso): number {
	const i = d.secciones.findIndex((s) => s.orden === 'alfabetico');
	return i >= 0 ? i : d.secciones.length - 1;
}

/** ¿Es una sección de cargos (Junta, Vocales…)? */
export const esDeCargos = (s: SeccionMiembros) => s.orden === 'manual' && (seccionesConCargos().some((t) => igual(t, s.titulo)) || /junta|vocal/i.test(s.titulo));

/** Aviso para el panel: está en una sección de cargos sin cargo, o con cargos de otra sección */
export function aviso(d: Curso, si: number, mj: number): string {
	const s = d.secciones[si], m = s?.miembros[mj];
	if (!s || !m || !esDeCargos(s)) return '';
	if (!m.roles.length) return `Está en ${s.titulo} pero no tiene ningún cargo. Elige su cargo de ${s.titulo} aquí abajo, o quítalo de ${s.titulo}.`;
	const otra = m.roles.map(seccionDeRol).find((x) => x && !igual(x, s.titulo));
	return otra ? `Tiene un cargo de ${otra}, pero está en ${s.titulo}.` : '';
}

/**
 * Coloca a la persona en la sección que le corresponde por sus cargos. Devuelve su nueva ruta
 * («secciones.0.miembros.3») y el nombre de la sección si se ha movido.
 */
export function colocar(d: Curso, si: number, mj: number): { si: number; mj: number; movida?: string } {
	const s = d.secciones[si], m = s?.miembros[mj];
	if (!m) return { si, mj };
	let destino: number;
	if (m.roles.length) {
		const t = m.roles.map(seccionDeRol).find(Boolean);
		if (!t || igual(t, s.titulo)) return { si, mj };
		destino = d.secciones.findIndex((x) => igual(x.titulo, t));
		if (destino < 0) {
			// Esa sección no existe en este curso: se crea, antes de la general
			const nueva: SeccionMiembros = { titulo: t, orden: 'manual', miembros: [] };
			const base = seccionBase(d);
			d.secciones.splice(base, 0, nueva);
			destino = base;
			if (base <= si) si++;
		}
	} else {
		if (!esDeCargos(s)) return { si, mj };
		destino = seccionBase(d);
		if (destino === si) return { si, mj };
	}
	d.secciones[si].miembros.splice(mj, 1);
	d.secciones[destino].miembros.push(m);
	return { si: destino, mj: d.secciones[destino].miembros.length - 1, movida: d.secciones[destino].titulo };
}

/** Al añadir a alguien de otro curso: se queda solo con los cargos que encajan en la sección donde se añade */
export function alEntrar(d: Curso, si: number, mj: number) {
	const s = d.secciones[si], m = s?.miembros[mj];
	if (!m) return;
	m.roles = m.roles.filter((r) => { const t = seccionDeRol(r); return t ? igual(t, s.titulo) : esDeCargos(s); });
	m.meses = [];
}

/** Personas de un curso anterior, todas como miembros sin cargo, para empezar un curso nuevo */
export function personasDe(prev: Curso): Miembro[] {
	const vistas = new Set<string>();
	const out: Miembro[] = [];
	for (const s of prev.secciones) for (const m of s.miembros) {
		const k = m.nombre.trim().toLowerCase();
		if (!k || vistas.has(k)) continue;
		vistas.add(k);
		out.push({ nombre: m.nombre, roles: [], foto: m.foto, fotoHover: m.fotoHover, meses: [] });
	}
	return out;
}

/** Opciones del selector de cargos para una persona: solo los de su sección si ya tiene alguno */
export function opcionesPicker(d: Curso, si: number, mj: number) {
	const m = d.secciones[si]?.miembros[mj];
	const fijada = () => (m?.roles.length ? m.roles.map(seccionDeRol).find(Boolean) ?? null : null);
	const secciones = () => {
		const f = fijada();
		if (f) return [f];
		const todas = [...seccionesConCargos(), ...d.secciones.filter(esDeCargos).map((s) => s.titulo)];
		return todas.filter((t, i) => todas.findIndex((x) => igual(x, t)) === i);
	};
	return {
		filtrar: (rol: string) => { const f = fijada(), t = seccionDeRol(rol); return !f || !t || igual(t, f); },
		sub: (rol: string) => seccionDeRol(rol) ?? '',
		crear: () => secciones().map((t) => ({ texto: `como cargo de ${t}`, alCrear: (rol: string) => asignarSeccion(rol, t) })),
		nota: () => { const f = fijada(); return f ? `Solo cargos de ${f}: no se puede estar en dos secciones a la vez.` : ''; },
	};
}
