/**
 * Niveles de acceso del modo edición, con CÓDIGOS DE ACCESO.
 *
 * - Quien administra entra con el token de GitHub (el «maestro») y desde /admin genera códigos (RST-XXXX-…)
 *   con un nombre y un nivel. Dentro de cada código va el token maestro CIFRADO con el propio código
 *   (AES-GCM; la clave sale del código con PBKDF2). En el repositorio solo se guarda la versión cifrada.
 * - La persona pega su código en /admin: se descifra el token y se edita con el nivel de ese código.
 *   No necesita cuenta de GitHub. Sus guardados salen en el historial con su nombre como autor.
 * - Revocar = borrar su código de la lista (src/data/permisos.json): el editor deja de aceptarlo al momento.
 *
 * Importante: los límites los pone el editor. Quien sepa podría sacar el token de su navegador y saltárselos;
 * es un sistema de confianza. Si alguna vez hay dudas, crea un token maestro nuevo y vuelve a generar los códigos.
 */
import { isLocal, readFile, leerPublico, commit, usuarioGitHub, setAutor, getToken, setToken, checkToken } from './github';

export type Nivel = 'proyectos' | 'cybertech' | 'editor' | 'admin';

export const NIVELES: { id: Nivel; nombre: string; desc: string }[] = [
	{ id: 'proyectos', nombre: 'Crear proyectos', desc: 'Puede crear proyectos nuevos y editar los que ha creado. No puede editar los de otros ni eliminar.' },
	{ id: 'cybertech', nombre: 'Cybertech', desc: 'Lo anterior y además crear una edición nueva de Cybertech y editar las que ha creado. No toca ediciones pasadas.' },
	{ id: 'editor', nombre: 'Editar toda la web', desc: 'Puede crear y editar todo (y ocultar), pero no eliminar.' },
	{ id: 'admin', nombre: 'Administración', desc: 'Todo, incluido eliminar páginas y fotos y generar códigos de acceso.' },
];
const RANGO: Record<Nivel, number> = { proyectos: 1, cybertech: 2, editor: 3, admin: 4 };
export const nombreNivel = (n: Nivel) => NIVELES.find((x) => x.id === n)?.nombre ?? n;
const esNivel = (x: unknown): x is Nivel => typeof x === 'string' && x in RANGO;

/** Un código de acceso tal como se guarda (sin el código: solo el token cifrado con él) */
export interface Codigo { id: string; nombre: string; nivel: Nivel; creado: string; sal: string; iv: string; cifrado: string }
export interface Permisos { codigos: Codigo[] }
export const RUTA_PERMISOS = 'src/data/permisos.json';

export interface Sesion { login: string; nivel: Nivel; nombre: string; motivo: string }

/** En local (astro dev) no hay token: se puede probar cualquier nivel desde /admin */
export const NIVEL_LOCAL_KEY = 'reset-nivel-local';
const CODIGO_KEY = 'reset-codigo'; // { id, nombre } del código con el que se ha entrado

export class AccesoRevocado extends Error {
	constructor() { super('Tu código de acceso ya no es válido (lo han revocado o cambiado). Pide uno nuevo a quien administra la web.'); }
}

/* ───────────── Leer y guardar la lista ───────────── */

const normalizar = (raw: any): Permisos => ({
	codigos: (Array.isArray(raw?.codigos) ? raw.codigos : [])
		.filter((c: any) => c?.id && c?.cifrado)
		.map((c: any) => ({ id: String(c.id), nombre: String(c.nombre ?? ''), nivel: esNivel(c.nivel) ? c.nivel : 'proyectos', creado: String(c.creado ?? ''), sal: String(c.sal), iv: String(c.iv), cifrado: String(c.cifrado) })),
});

export async function leerPermisos(publico = false): Promise<Permisos> {
	const t = await (publico ? leerPublico(RUTA_PERMISOS) : readFile(RUTA_PERMISOS));
	return normalizar(t ? JSON.parse(t) : {});
}

export function guardarPermisos(p: Permisos, que: string) {
	return commit([{ path: RUTA_PERMISOS, text: `${JSON.stringify({ codigos: p.codigos }, null, 2)}\n` }], `Accesos: ${que} (desde la web)`);
}

/* ───────────── Cifrado ───────────── */

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L, para que no haya confusiones al copiarlo
const azar = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALFABETO[b % 32]).join('');
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function claveDe(secreto: string, sal: Uint8Array) {
	const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), 'PBKDF2', false, ['deriveKey']);
	return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: 150_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** «rst-k3f9 abcd-…» → { id: 'K3F9', secreto: 'ABCD…' } (acepta minúsculas, espacios y guiones de más) */
export function leerCodigo(texto: string) {
	const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
	const m = limpio.match(/^RST([A-Z2-9]{4})([A-Z2-9]{16})$/);
	return m ? { id: m[1], secreto: m[2] } : null;
}
export const pareceCodigo = (texto: string) => /^\s*rst[\s-]/i.test(texto);

/** Crea un código para alguien: devuelve el código (para dárselo, no se guarda) y lo que se guarda en la lista */
export async function crearCodigo(nombre: string, nivel: Nivel, token: string, usados: string[]) {
	let id = azar(4);
	while (usados.includes(id)) id = azar(4);
	const secreto = azar(16); // 80 bits
	const sal = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await claveDe(secreto, sal), new TextEncoder().encode(token)));
	const codigo = `RST-${id}-${secreto.match(/.{4}/g)!.join('-')}`;
	const guardado: Codigo = { id, nombre: nombre.trim(), nivel, creado: new Date().toISOString().slice(0, 10), sal: b64(sal), iv: b64(iv), cifrado: b64(cifrado) };
	return { codigo, guardado };
}

/** El token maestro guardado en un código, con el secreto del código. Falla si el código no es el correcto. */
export async function descifrar(secreto: string, e: Codigo) {
	try {
		return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(e.iv) }, await claveDe(secreto, deB64(e.sal)), deB64(e.cifrado)));
	} catch {
		throw new Error('El código no es correcto. Revisa que esté completo.');
	}
}

/** Entrar con un código: lo busca en la lista, descifra el token, comprueba que funciona y deja la sesión iniciada */
export async function entrarConCodigo(texto: string) {
	const c = leerCodigo(texto);
	if (!c) throw new Error('El código no tiene el formato correcto (RST-XXXX-XXXX-XXXX-XXXX-XXXX).');
	const e = (await leerPermisos(true)).codigos.find((x) => x.id === c.id);
	if (!e) throw new Error('Ese código no existe o lo han revocado. Si te lo acaban de dar, espera un par de minutos y vuelve a probar.');
	const token = await descifrar(c.secreto, e);
	try { await checkToken(token); } catch {
		throw new Error('El código es correcto, pero la clave maestra de la web ha caducado o se ha cambiado. Pide un código nuevo a quien administra.');
	}
	setToken(token);
	localStorage.setItem(CODIGO_KEY, JSON.stringify({ id: e.id, nombre: e.nombre }));
	return e;
}

/* ───────────── Quién eres ───────────── */

const codigoGuardado = (): { id: string; nombre: string } | null => {
	try { return JSON.parse(localStorage.getItem(CODIGO_KEY) || 'null'); } catch { return null; }
};

let cache: Promise<Sesion> | null = null;
export function sesion(): Promise<Sesion> {
	cache ??= (async (): Promise<Sesion> => {
		if (isLocal()) {
			let n: string | null = null;
			try { n = localStorage.getItem(NIVEL_LOCAL_KEY); } catch {}
			return { login: 'local', nombre: 'Este ordenador', nivel: esNivel(n) ? n : 'admin', motivo: 'modo local' };
		}
		const cod = codigoGuardado();
		if (cod && getToken()) {
			// Se comprueba cada vez: si lo han revocado (o cambiado de nivel), se nota al momento
			const e = (await leerPermisos()).codigos.find((x) => x.id === cod.id);
			if (!e) throw new AccesoRevocado();
			setAutor({ name: e.nombre || `Código ${e.id}`, email: `codigo-${e.id.toLowerCase()}@editor.reset` });
			return { login: `codigo:${e.id}`, nombre: e.nombre, nivel: e.nivel, motivo: `código de acceso ${e.id}` };
		}
		const u = await usuarioGitHub();
		return { login: u.login, nombre: u.name ?? u.login, nivel: 'admin', motivo: 'token de GitHub' };
	})();
	return cache;
}

/* ───────────── Qué puede hacer cada nivel ───────────── */

/** ¿Puede crear algo nuevo de este tipo? (proyectos, cybertech, talleres…) */
export function puedeCrear(s: Sesion, tipo: string) {
	const r = RANGO[s.nivel];
	return r >= 3 || tipo === 'proyectos' || (tipo === 'cybertech' && r >= 2);
}

/** ¿Puede editar esto que ya existe? Los niveles básicos, solo lo que han creado ellos. */
export function puedeEditar(s: Sesion, tipo: string, doc: { creadoPor?: string } | null) {
	if (RANGO[s.nivel] >= 3) return true;
	return puedeCrear(s, tipo) && !!doc?.creadoPor && doc.creadoPor.toLowerCase() === s.login.toLowerCase();
}

export const puedeEliminar = (s: Sesion) => s.nivel === 'admin';
export const puedeGestionarAccesos = (s: Sesion) => s.nivel === 'admin';

/** Explicación de por qué no puede editar algo */
export function motivoNoEditar(s: Sesion, tipo: string) {
	const nivel = `Tu nivel de acceso es «${nombreNivel(s.nivel)}»`;
	return puedeCrear(s, tipo)
		? `${nivel}: solo puedes editar lo que has creado tú, y esto lo creó otra persona (o es de antes de los niveles de acceso).`
		: `${nivel}: no puedes editar esta página.`;
}
