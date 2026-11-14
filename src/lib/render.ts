/**
 * Renderizado compartido de las páginas editables (Miembros y Cybertech).
 *
 * Estas funciones devuelven HTML y se usan en DOS sitios:
 *  - Astro, al compilar la web pública.
 *  - El modo edición, en el navegador, para la vista previa en directo.
 * Como es el mismo código, lo que se ve al editar es exactamente lo que se publica.
 */
import { marked } from 'marked';

/* ───────────── Tipos ───────────── */

export interface Miembro { nombre: string; roles: string[]; foto: string; fotoHover: string }
export interface SeccionMiembros { titulo: string; miembros: Miembro[] }
export interface Curso { curso: string; intro: string; fotoGrupo: string; secciones: SeccionMiembros[] }

export interface Prueba { nombre: string; descripcion: string; media: string }
export interface Categoria { nombre: string; descripcion: string; media: string; pruebas: Prueba[] }
export interface Dato { valor: string; etiqueta: string }
export interface SeccionEdicion { titulo: string; contenido: string; media: string }
export interface Edicion {
	anio: number; lema: string; tematica: string; fechas: string; lugar: string; portada: string; intro: string;
	datos: Dato[]; categorias: Categoria[]; secciones: SeccionEdicion[]; galeria: string[];
}

export interface RenderCtx {
	/** BASE_URL de Astro, p. ej. "/PruebasWeb/" */
	base: string;
	/** Modo edición: añade botones "+" y zonas clicables */
	admin?: boolean;
	/** Permite al editor sustituir rutas de fotos aún no subidas por su vista previa local */
	resolve?: (path: string) => string | undefined;
}

/* ───────────── Normalización (rellena huecos para que nunca falle) ───────────── */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = <T>(v: unknown, map: (x: any) => T): T[] => (Array.isArray(v) ? v.map(map) : []);

export function normalizeCurso(raw: any = {}): Curso {
	return {
		curso: str(raw.curso),
		intro: str(raw.intro),
		fotoGrupo: str(raw.fotoGrupo),
		secciones: arr(raw.secciones, (s) => ({
			titulo: str(s?.titulo),
			miembros: arr(s?.miembros, (m) => ({
				nombre: str(m?.nombre),
				roles: arr(m?.roles, str).filter(Boolean),
				foto: str(m?.foto),
				fotoHover: str(m?.fotoHover),
			})),
		})),
	};
}

export function normalizeEdicion(raw: any = {}): Edicion {
	return {
		anio: Number(raw.anio) || new Date().getFullYear(),
		lema: str(raw.lema),
		tematica: str(raw.tematica),
		fechas: str(raw.fechas),
		lugar: str(raw.lugar),
		portada: str(raw.portada),
		intro: str(raw.intro),
		datos: arr(raw.datos, (d) => ({ valor: str(d?.valor), etiqueta: str(d?.etiqueta) })),
		categorias: arr(raw.categorias, (c) => ({
			nombre: str(c?.nombre),
			descripcion: str(c?.descripcion),
			media: str(c?.media),
			pruebas: arr(c?.pruebas, (p) => ({ nombre: str(p?.nombre), descripcion: str(p?.descripcion), media: str(p?.media) })),
		})),
		secciones: arr(raw.secciones, (s) => ({ titulo: str(s?.titulo), contenido: str(s?.contenido), media: str(s?.media) })),
		galeria: arr(raw.galeria, str).filter(Boolean),
	};
}

/** "2022/23" → "2022-23" (nombre de archivo y URL) */
export const cursoSlug = (curso: string) => curso.trim().replace(/\s+/g, '').replace('/', '-');
/** "2022/23" → "22/23" */
export const cursoCorto = (curso: string) => {
	const m = curso.match(/^\d{2}(\d{2})\/(\d{2})$/);
	return m ? `${m[1]}/${m[2]}` : curso;
};

export const slugify = (s: string) =>
	s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'archivo';

/* ───────────── Utilidades HTML ───────────── */

export const esc = (s: unknown) =>
	str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const md = (s: string) => (s.trim() ? (marked.parse(s, { async: false, gfm: true, breaks: true }) as string) : '');

const pad = (n: number) => String(n).padStart(2, '0');

export const joinBase = (base: string, path: string) => `${base.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`;

export function asset(path: string, ctx: RenderCtx) {
	if (!path) return '';
	const local = ctx.resolve?.(path);
	if (local) return local;
	if (/^(https?:|blob:|data:|\/)/.test(path)) return path;
	return joinBase(ctx.base, path);
}

const isVideo = (p: string) => /\.(mp4|webm|mov)$/i.test(p);

const initials = (name: string) =>
	name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '··';

/**
 * Imagen con hueco de reserva: si el archivo aún no existe se ve un marco de plano
 * con una etiqueta (y en modo edición, la ruta donde debe ir la foto).
 */
function frame(path: string, ctx: RenderCtx, opts: { label: string; cls?: string; alt?: string; extra?: string; eager?: boolean }) {
	const src = asset(path, ctx);
	let inner = '';
	if (src) {
		inner = isVideo(path)
			? `<video src="${esc(src)}" autoplay muted loop playsinline preload="metadata" onerror="__img(this)" data-path="${esc(path)}"></video>`
			: `<img src="${esc(src)}" alt="${esc(opts.alt ?? '')}" ${opts.eager ? '' : 'loading="lazy"'} decoding="async" onerror="__img(this)" data-path="${esc(path)}">`;
	}
	return `<figure class="frame ${opts.cls ?? ''}" data-label="${esc(opts.label)}"${path ? ` data-path="${esc(path)}"` : ''}>${inner}${opts.extra ?? ''}</figure>`;
}

const addBtn = (ctx: RenderCtx, path: string, label: string, cls = '') =>
	ctx.admin ? `<button type="button" class="adm-add ${cls}" data-add="${path}"><span>+</span>${esc(label)}</button>` : '';

const editAttr = (ctx: RenderCtx, path: string) => (ctx.admin ? ` data-edit="${path}"` : '');
const reveal = (ctx: RenderCtx) => (ctx.admin ? '' : ' reveal');

/* ───────────── Página de miembros ───────────── */

export function renderCurso(d: Curso, ctx: RenderCtx): string {
	const total = d.secciones.reduce((n, s) => n + s.miembros.length, 0);
	const corto = cursoCorto(d.curso) || '··/··';

	const tally = d.secciones
		.filter((s) => s.miembros.length)
		.map((s) => `<div><dt>${esc(s.titulo)}</dt><dd>${pad(s.miembros.length)}</dd></div>`)
		.join('');

	const card = (m: Miembro, i: number, j: number) => `
		<li class="m-card${reveal(ctx)}" style="--d:${j % 12}"${editAttr(ctx, `secciones.${i}.miembros.${j}`)}>
			${frame(m.foto, ctx, {
				label: initials(m.nombre),
				cls: 'm-photo',
				alt: m.nombre,
				extra: m.fotoHover ? frameAlt(m.fotoHover, ctx) : '',
			})}
			<div class="m-meta">
				<h3>${esc(m.nombre) || '<span class="muted">Sin nombre</span>'}</h3>
				${m.roles.length ? `<ul class="tags">${m.roles.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
			</div>
		</li>`;

	const sections = d.secciones.map((s, i) => `
		<section class="m-sec${i === 0 ? ' is-lead' : ''}${s.miembros.some((m) => m.roles.length) ? '' : ' is-plain'}">
			<header class="sec-head${reveal(ctx)}"${editAttr(ctx, `secciones.${i}`)}>
				<span class="idx">§${pad(i + 1)}</span>
				<h2>${esc(s.titulo) || 'Sección sin título'}</h2>
				<span class="rule"></span>
				<span class="count">${pad(s.miembros.length)}</span>
			</header>
			<ul class="m-grid">
				${s.miembros.map((m, j) => card(m, i, j)).join('')}
				${ctx.admin ? `<li class="m-card m-card-add">${addBtn(ctx, `secciones.${i}.miembros`, 'Añadir persona')}</li>` : ''}
			</ul>
		</section>`).join('');

	return `
	<div class="wrap m-page">
		<header class="pg-head"${editAttr(ctx, '')}>
			<p class="kicker"><span>Conócenos</span><span>Curso ${esc(d.curso || '—')}</span></p>
			<h1 class="display">Miembros <em>${esc(corto)}</em></h1>
			<div class="pg-head-row">
				${d.intro ? `<div class="lede prose">${md(d.intro)}</div>` : '<div></div>'}
				${total ? `<dl class="tally"><div><dt>Personas</dt><dd>${pad(total)}</dd></div>${tally}</dl>` : ''}
			</div>
		</header>
		${d.fotoGrupo || ctx.admin ? `<div class="group-photo${reveal(ctx)}"${editAttr(ctx, '')}>${frame(d.fotoGrupo, ctx, { label: 'Foto de grupo', cls: 'wide' })}</div>` : ''}
		${sections || (ctx.admin ? '' : '<p class="empty">Todavía no hay personas en este curso.</p>')}
		${addBtn(ctx, 'secciones', 'Añadir sección', 'adm-add-wide')}
	</div>`;
}

const frameAlt = (path: string, ctx: RenderCtx) =>
	`<img class="alt" src="${esc(asset(path, ctx))}" alt="" loading="lazy" decoding="async" onerror="__img(this)" data-path="${esc(path)}">`;

/* ───────────── Página de Cybertech ───────────── */

export function renderEdicion(d: Edicion, ctx: RenderCtx): string {
	const block = [
		['Edición', String(d.anio)],
		['Fechas', d.fechas],
		['Lugar', d.lugar],
		['Temática', d.tematica],
	].filter(([, v]) => v);

	let n = 0;
	const head = (title: string, path: string) =>
		`<header class="sec-head${reveal(ctx)}"${editAttr(ctx, path)}><span class="idx">${pad(++n)}</span><h2>${esc(title)}</h2><span class="rule"></span></header>`;

	const hero = `
	<section class="ct-hero"${editAttr(ctx, '')}>
		<div class="ct-grid" aria-hidden="true"></div>
		<div class="wrap ct-hero-in">
			<div class="ct-title">
				<p class="kicker on-dark"><span>Competición de robótica</span><span>ETSII · UPM</span></p>
				<h1 class="ct-word"><span class="ct-name">Cybertech</span><span class="ct-year">${esc(d.anio)}</span></h1>
				${d.lema ? `<p class="ct-lema">${esc(d.lema)}</p>` : ''}
			</div>
			${d.portada || ctx.admin ? frame(d.portada, ctx, { label: `Cybertech ${d.anio}`, cls: 'ct-cover natural on-dark', eager: true }) : ''}
			<dl class="titleblock">${block.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
		</div>
	</section>`;

	const datos = d.datos.length || ctx.admin ? `
	<section class="ct-stats"${editAttr(ctx, 'datos')}>
		<div class="wrap">
			${d.datos.map((x, i) => `<div class="stat${reveal(ctx)}" style="--d:${i}"${editAttr(ctx, `datos.${i}`)}><strong>${esc(x.valor)}</strong><span>${esc(x.etiqueta)}</span></div>`).join('')}
			${addBtn(ctx, 'datos', 'Añadir dato')}
		</div>
	</section>` : '';

	const intro = d.intro || ctx.admin ? `
	<section class="wrap ct-intro${reveal(ctx)}"${editAttr(ctx, '')}>
		<div class="prose lead">${md(d.intro) || (ctx.admin ? '<p class="muted">Escribe aquí la introducción de la edición…</p>' : '')}</div>
	</section>` : '';

	const cats = d.categorias.length || ctx.admin ? `
	<section class="wrap ct-cats">
		${head('Categorías', 'categorias')}
		${d.categorias.map((c, i) => `
		<article class="ct-cat${reveal(ctx)}"${editAttr(ctx, `categorias.${i}`)}>
			<div class="ct-cat-side">
				<span class="idx">Cat. ${pad(i + 1)}</span>
				<h3>${esc(c.nombre) || 'Sin nombre'}</h3>
				${c.pruebas.length ? `<p class="ct-cat-n">${c.pruebas.length} ${c.pruebas.length === 1 ? 'prueba' : 'pruebas'}</p>` : ''}
			</div>
			<div class="ct-cat-body">
				${c.descripcion ? `<div class="prose">${md(c.descripcion)}</div>` : ''}
				${c.media ? frame(c.media, ctx, { label: c.nombre, cls: 'ct-cat-media natural' }) : ''}
				${c.pruebas.length || ctx.admin ? `<ul class="ct-tests">
					${c.pruebas.map((p, k) => `
					<li class="ct-test"${editAttr(ctx, `categorias.${i}.pruebas.${k}`)}>
						${p.media ? frame(p.media, ctx, { label: p.nombre }) : ''}
						<div class="ct-test-txt"><span class="idx">${pad(i + 1)}.${pad(k + 1)}</span><h4>${esc(p.nombre)}</h4>${p.descripcion ? `<div class="prose">${md(p.descripcion)}</div>` : ''}</div>
					</li>`).join('')}
					${ctx.admin ? `<li class="ct-test ct-test-add">${addBtn(ctx, `categorias.${i}.pruebas`, 'Añadir prueba')}</li>` : ''}
				</ul>` : ''}
			</div>
		</article>`).join('')}
		${addBtn(ctx, 'categorias', 'Añadir categoría', 'adm-add-wide')}
	</section>` : '';

	const secs = d.secciones.map((s, i) => `
	<section class="wrap ct-block${s.media ? ' has-media' : ''}${i % 2 ? ' flip' : ''}">
		${head(s.titulo || 'Sin título', `secciones.${i}`)}
		<div class="ct-block-in${reveal(ctx)}"${editAttr(ctx, `secciones.${i}`)}>
			<div class="prose">${md(s.contenido)}</div>
			${s.media ? frame(s.media, ctx, { label: s.titulo, cls: 'natural' }) : ''}
		</div>
	</section>`).join('');

	const gal = d.galeria.length || ctx.admin ? `
	<section class="wrap ct-gallery">
		${head('Galería', 'galeria')}
		<div class="gal"${editAttr(ctx, 'galeria')}>
			${d.galeria.map((g, i) => frame(g, ctx, { label: `Foto ${pad(i + 1)}`, cls: `${reveal(ctx)} g${i % 5}` })).join('')}
		</div>
		${addBtn(ctx, 'galeria', 'Añadir fotos', 'adm-add-wide')}
	</section>` : '';

	return `${hero}${datos}<div class="ct-body">${intro}${cats}${secs}${ctx.admin ? `<div class="wrap">${addBtn(ctx, 'secciones', 'Añadir bloque de texto', 'adm-add-wide')}</div>` : ''}${gal}</div>`;
}
