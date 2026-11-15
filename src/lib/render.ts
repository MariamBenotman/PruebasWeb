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
/** `alfabetico`: las personas salen por orden alfabético; `manual`: en el orden en que se colocan en el editor */
export type OrdenMiembros = 'alfabetico' | 'manual';
export interface SeccionMiembros { titulo: string; orden: OrdenMiembros; miembros: Miembro[] }
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
			// Por defecto: alfabético si nadie de la sección tiene cargo (p. ej. "Miembros"); manual si lo tienen (Junta, Vocales)
			orden: s?.orden === 'alfabetico' || s?.orden === 'manual' ? s.orden
				: (Array.isArray(s?.miembros) && s.miembros.some((m: any) => Array.isArray(m?.roles) && m.roles.length) ? 'manual' : 'alfabetico'),
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

	// El índice original (j) se conserva para que el editor sepa qué persona es cada tarjeta
	const ordenar = (s: SeccionMiembros) => {
		const lista = s.miembros.map((m, j) => ({ m, j }));
		return s.orden === 'alfabetico'
			? lista.sort((a, b) => a.m.nombre.localeCompare(b.m.nombre, 'es', { sensitivity: 'base' }))
			: lista;
	};

	const sections = d.secciones.map((s, i) => `
		<section class="m-sec${i === 0 ? ' is-lead' : ''}${s.miembros.some((m) => m.roles.length) ? '' : ' is-plain'}">
			<header class="sec-head${reveal(ctx)}"${editAttr(ctx, `secciones.${i}`)}>
				<span class="idx">§${pad(i + 1)}</span>
				<h2>${esc(s.titulo) || 'Sección sin título'}</h2>
				<span class="rule"></span>
				<span class="count">${pad(s.miembros.length)}</span>
			</header>
			<ul class="m-grid">
				${ordenar(s).map(({ m, j }) => card(m, i, j)).join('')}
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

/* ───────────── Entradas: Proyectos, Talleres, Servicios y Noticias ───────────── */

export interface Entrada {
	titulo: string;
	fecha: string;        // AAAA-MM-DD (opcional salvo en noticias)
	etiquetas: string[];
	resumen: string;
	portada: string;
	cuerpo: string;
	galeria: string[];
	/**
	 * Para lo que se repite cada año: id de la entrada "genérica" de la que esta es una edición
	 * (p. ej. "octubre-robotico-2024" tiene serie "octubre-robotico"). Vacío si es independiente.
	 */
	serie: string;
	/** Texto corto, en gris, debajo del título en el menú desplegable ("C, Python, Linux, PCB…") */
	descMenu: string;
	/** Oculto: no sale en ningún sitio de la web, pero se conserva (para volver a mostrarlo otro año) */
	oculto: boolean;
	/** Sale en el menú y en el listado de su sección. Si no, solo se llega desde otras páginas (p. ej. desde un Octubre Robótico) */
	enListado: boolean;
	/** «Destacar en el menú»: sale el primero, con estrella y franja naranja */
	destacado: boolean;
	/** Talleres que incluye esta edición (ids), p. ej. Octubre Robótico 2024 → programacion-en-c, taller-de-python */
	incluye: string[];
}

/** Entrada genérica a la que pertenece una edición (para las migas de pan). */
export interface PadreRef { id: string; titulo: string }
/** Otra entrada enlazada desde esta (bloque "Talleres de esta edición") */
export interface RefEntrada { id: string; titulo: string; resumen: string; portada: string }

export const SECCIONES = {
	proyectos: { titulo: 'Proyectos', singular: 'proyecto', nuevo: 'Nuevo proyecto', intro: 'Proyectos de robótica, electrónica, automática e informática desarrollados por miembros de Reset. Cualquiera puede apuntarse a uno o proponer el suyo.', fecha: false, ediciones: false },
	talleres: { titulo: 'Talleres', singular: 'taller', nuevo: 'Nuevo taller', intro: 'Talleres formativos y totalmente gratuitos organizados por Reset.', fecha: false, ediciones: true },
	servicios: { titulo: 'Servicios', singular: 'servicio', nuevo: 'Nuevo servicio', intro: 'Servicios de Reset para el alumnado y el personal de la ETSII.', fecha: false, ediciones: false },
	noticias: { titulo: 'Noticias', singular: 'noticia', nuevo: 'Nueva noticia', intro: 'Actualidad, actividades y proyectos de la Asociación de Estudiantes Reset.', fecha: true, ediciones: false },
} as const;
export type SeccionKey = keyof typeof SECCIONES;

export function normalizeEntrada(raw: any = {}): Entrada {
	return {
		titulo: str(raw.titulo),
		fecha: str(raw.fecha).slice(0, 10),
		etiquetas: arr(raw.etiquetas, str).filter(Boolean),
		resumen: str(raw.resumen),
		portada: str(raw.portada),
		cuerpo: str(raw.cuerpo),
		galeria: arr(raw.galeria, str).filter(Boolean),
		serie: str(raw.serie),
		descMenu: str(raw.descMenu),
		oculto: !!raw.oculto,
		enListado: raw.enListado === undefined ? true : !!raw.enListado,
		incluye: arr(raw.incluye, str).filter(Boolean),
		destacado: !!raw.destacado,
	};
}

/** "2021-11-15" → "15 de noviembre de 2021" */
export function fechaLarga(iso: string) {
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return iso;
	const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
	return `${Number(m[3])} de ${meses[Number(m[2]) - 1]} de ${m[1]}`;
}

/** Orden de los listados: lo más reciente primero; lo que no tiene fecha, por orden alfabético al final. */
export const ordenEntradas = (a: Entrada, b: Entrada) =>
	(b.fecha || '').localeCompare(a.fecha || '') || a.titulo.localeCompare(b.titulo, 'es');

export function renderEntrada(d: Entrada, ctx: RenderCtx, seccion: SeccionKey, padre?: PadreRef, refs: RefEntrada[] = []): string {
	const sec = SECCIONES[seccion];
	// Talleres de esta edición: solo los que existen (si se borró uno, simplemente no sale)
	const incl = d.incluye.map((id) => refs.find((r) => r.id === id)).filter((r): r is RefEntrada => !!r);
	const talleres = incl.length || (ctx.admin && seccion === 'talleres' && padre) ? `
	<section class="wrap en-incl">
		<header class="sec-head${reveal(ctx)}"${editAttr(ctx, '')}><span class="idx">${pad(incl.length)}</span><h2>${sec.titulo} de esta edición</h2><span class="rule"></span></header>
		<ul class="en-incl-grid">
			${incl.map((r, i) => `
			<li class="${reveal(ctx).trim()}" style="--d:${i}">
				<a href="${esc(joinBase(ctx.base, `${seccion}/${r.id}`))}">
					${frame(r.portada, ctx, { label: r.titulo })}
					<div><h3>${esc(r.titulo)}</h3>${r.resumen ? `<p>${esc(r.resumen)}</p>` : ''}<span class="en-incl-arr" aria-hidden="true">→</span></div>
				</a>
			</li>`).join('')}
			${ctx.admin ? `<li><button type="button" class="adm-add" data-edit=""><span>+</span>Elegir ${sec.titulo.toLowerCase()} (en «Datos generales»)</button></li>` : ''}
		</ul>
	</section>` : '';
	const migas = [
		`<a href="${esc(joinBase(ctx.base, seccion))}">${sec.titulo}</a>`,
		...(padre ? [`<a href="${esc(joinBase(ctx.base, `${seccion}/${padre.id}`))}">${esc(padre.titulo)}</a>`] : []),
		...d.etiquetas.filter((t) => t !== padre?.titulo).map((t) => `<span>${esc(t)}</span>`),
		...(d.fecha ? [`<span><time datetime="${esc(d.fecha)}">${esc(fechaLarga(d.fecha))}</time></span>`] : []),
	];
	const gal = d.galeria.length || ctx.admin ? `
	<section class="wrap en-gal">
		<header class="sec-head${reveal(ctx)}"${editAttr(ctx, 'galeria')}><span class="idx">§</span><h2>Galería</h2><span class="rule"></span></header>
		<div class="gal"${editAttr(ctx, 'galeria')}>
			${d.galeria.map((g, i) => frame(g, ctx, { label: `Foto ${pad(i + 1)}`, cls: `${reveal(ctx)} g${i % 5}` })).join('')}
		</div>
		${addBtn(ctx, 'galeria', 'Añadir fotos', 'adm-add-wide')}
	</section>` : '';

	return `
	${ctx.admin && d.oculto ? `<p class="wrap adm-oculto"${editAttr(ctx, '')}>Oculto: no sale en la web. Desmarca «Ocultar» en «Datos generales» para volver a mostrarlo.</p>` : ''}
	<article class="en">
		<header class="wrap pg-head en-head"${editAttr(ctx, '')}>
			<p class="kicker">${migas.join('')}</p>
			<h1 class="en-t">${esc(d.titulo) || (ctx.admin ? `<span class="muted">Título ${sec.singular === 'noticia' ? 'de la noticia' : `del ${sec.singular}`}</span>` : '')}</h1>
			${d.resumen || ctx.admin ? `<p class="lede en-lede">${esc(d.resumen) || (ctx.admin ? '<span class="muted">Resumen corto (sale también en el listado)…</span>' : '')}</p>` : ''}
		</header>
		${d.portada || ctx.admin ? `<div class="wrap en-cover${reveal(ctx)}"${editAttr(ctx, '')}>${frame(d.portada, ctx, { label: d.titulo || sec.titulo, cls: 'natural', eager: true })}</div>` : ''}
		<div class="wrap en-body"${editAttr(ctx, '')}>
			<div class="prose">${md(d.cuerpo) || (ctx.admin ? '<p class="muted">Escribe aquí el contenido…</p>' : '')}</div>
		</div>
		${talleres}
		${gal}
	</article>`;
}

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

/* ───────────── Apartados sueltos: Colaboradores, Contacto, Participa… ───────────── */

export interface Pagina {
	titulo: string;
	intro: string;
	cuerpo: string;
	/** Imagen junto al texto (opcional) */
	imagen: string;
	/** Sale en el desplegable "Conócenos" */
	menu: boolean;
	/** Posición en el menú (1, 2, 3…; vacío = al final) */
	orden: number;
}

export function normalizePagina(raw: any = {}): Pagina {
	return {
		titulo: str(raw.titulo),
		intro: str(raw.intro),
		cuerpo: str(raw.cuerpo),
		imagen: str(raw.imagen),
		menu: raw.menu === undefined ? true : !!raw.menu,
		orden: Number(raw.orden) || 0,
	};
}

export function renderPagina(d: Pagina, ctx: RenderCtx): string {
	const e = editAttr(ctx, '');
	return `
	<div class="wrap gp">
		<header class="pg-head"${e}>
			<p class="kicker"><span>${d.menu ? 'Conócenos' : 'Reset'}</span><span>${esc(d.titulo)}</span></p>
			<h1 class="display gp-t">${esc(d.titulo) || (ctx.admin ? '<span class="muted">Título del apartado</span>' : '')}</h1>
			${d.intro || ctx.admin ? `<p class="lede gp-lede">${esc(d.intro) || (ctx.admin ? '<span class="muted">Frase de presentación…</span>' : '')}</p>` : ''}
		</header>
		<div class="gp-main${d.imagen ? ' con-img' : ''}"${e}>
			<div class="prose gp-body">${md(d.cuerpo) || (ctx.admin ? '<p class="muted">Escribe aquí el contenido…</p>' : '')}</div>
			${d.imagen ? frame(d.imagen, ctx, { label: d.titulo, cls: 'natural gp-img' }) : ''}
		</div>
	</div>`;
}
