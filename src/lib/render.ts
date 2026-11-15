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
	/** Plazo de inscripción (AAAA-MM-DD, ambos incluidos) y enlace al formulario. Dentro del plazo sale «Inscripciones abiertas». */
	inscripcionDesde: string; inscripcionHasta: string; inscripcionEnlace: string;
}

/**
 * Atributos para lo que solo debe verse dentro de un plazo (lo enseña Layout.astro en el navegador,
 * así que aparece y desaparece solo, sin tener que volver a publicar la web).
 */
export const attrPlazo = (desde: string, hasta: string) =>
	`data-plazo="${esc(desde)}|${esc(hasta)}" hidden`;
export const enPlazo = (d: { inscripcionDesde: string; inscripcionHasta: string }) => !!(d.inscripcionDesde || d.inscripcionHasta);

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
		inscripcionDesde: str(raw.inscripcionDesde).slice(0, 10),
		inscripcionHasta: str(raw.inscripcionHasta).slice(0, 10),
		inscripcionEnlace: str(raw.inscripcionEnlace),
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
	/** Proyectos: en marcha (sale en «Proyectos activos») o ya terminado (solo en el historial) */
	activo: boolean;
	/** Proyectos: año (opcional), para ordenar el historial */
	anio: string;
	/** Proyectos: miembros de Reset que lo han hecho (por su nombre, tal como sale en Miembros) */
	autores: string[];
	/** Proyectos: otras personas que han colaborado y no están en Miembros */
	otrosAutores: string;
	/** Talleres que incluye esta edición (ids), p. ej. Octubre Robótico 2024 → programacion-en-c, taller-de-python */
	incluye: string[];
}

/** Entrada genérica a la que pertenece una edición (para las migas de pan). */
export interface PadreRef { id: string; titulo: string }
/** Miembro de Reset (para el bloque de autores de un proyecto) */
export interface Persona { nombre: string; foto: string; url: string }
export const clavePersona = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
		// Si no se ha marcado nunca, cuenta como activo lo que tiene la etiqueta «En desarrollo»
		activo: raw.activo !== undefined ? !!raw.activo : arr(raw.etiquetas, str).includes('En desarrollo'),
		anio: str(raw.anio).trim(),
		autores: arr(raw.autores, str).filter(Boolean),
		otrosAutores: str(raw.otrosAutores),
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

export function renderEntrada(d: Entrada, ctx: RenderCtx, seccion: SeccionKey, padre?: PadreRef, refs: RefEntrada[] = [], personas: Persona[] = []): string {
	const sec = SECCIONES[seccion];
	// Autores (proyectos): miembros con su foto, y luego otros colaboradores en texto
	const otros = d.otrosAutores.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
	const autores = seccion === 'proyectos' && (d.autores.length || otros.length || ctx.admin) ? `
	<section class="wrap en-autores">
		<header class="sec-head${reveal(ctx)}"${editAttr(ctx, '')}><span class="idx">${pad(d.autores.length + otros.length)}</span><h2>Quién lo ha hecho</h2><span class="rule"></span></header>
		<ul class="en-autores-grid"${editAttr(ctx, '')}>
			${d.autores.map((n, i) => {
				const p = personas.find((x) => clavePersona(x.nombre) === clavePersona(n));
				const tag = p?.url && !ctx.admin ? 'a' : 'div';
				return `<li class="${reveal(ctx).trim()}" style="--d:${i}"><${tag} class="en-autor"${tag === 'a' ? ` href="${esc(p!.url)}"` : ''}>
					${frame(p?.foto ?? '', ctx, { label: initials(n), cls: 'm-photo' })}
					<span>${esc(n)}</span></${tag}></li>`;
			}).join('')}
			${ctx.admin && !d.autores.length && !otros.length ? `<li><button type="button" class="adm-add" data-edit=""><span>+</span>Elegir autores (en «Datos generales»)</button></li>` : ''}
		</ul>
		${otros.length ? `<p class="en-otros">También han colaborado: ${otros.map(esc).join(', ')}</p>` : ''}
	</section>` : '';
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
		...(d.anio && !d.fecha ? [`<span>${esc(d.anio)}</span>`] : []),
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
		${autores}
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
				${enPlazo(d) ? `<p class="ct-inscripcion" ${ctx.admin ? '' : attrPlazo(d.inscripcionDesde, d.inscripcionHasta)}>
					${d.inscripcionEnlace ? `<a class="btn primary" href="${esc(d.inscripcionEnlace)}"${/^https?:/.test(d.inscripcionEnlace) ? ' target="_blank" rel="noopener"' : ''}>Inscríbete <span class="arr">→</span></a>` : ''}
					<span>Inscripciones abiertas${d.inscripcionHasta ? ` hasta el ${esc(fechaLarga(d.inscripcionHasta))}` : ''}${ctx.admin ? ' <em>(en modo edición se ve siempre)</em>' : ''}</span>
				</p>` : ''}
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
	/** Botón a un formulario externo (p. ej. Google Forms), con su texto */
	formulario: string;
	formularioTexto: string;
}

export function normalizePagina(raw: any = {}): Pagina {
	return {
		titulo: str(raw.titulo),
		intro: str(raw.intro),
		cuerpo: str(raw.cuerpo),
		imagen: str(raw.imagen),
		menu: raw.menu === undefined ? true : !!raw.menu,
		orden: Number(raw.orden) || 0,
		formulario: str(raw.formulario),
		formularioTexto: str(raw.formularioTexto),
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
			<div class="gp-col">
				<div class="prose gp-body">${md(d.cuerpo) || (ctx.admin ? '<p class="muted">Escribe aquí el contenido…</p>' : '')}</div>
				<div class="gp-acciones">
					${d.formulario ? `<a class="btn primary" href="${esc(d.formulario)}"${/^https?:/.test(d.formulario) ? ' target="_blank" rel="noopener"' : ''}>${esc(d.formularioTexto || 'Rellenar el formulario')} <span class="arr">→</span></a>` : ''}
					<div data-keep="acciones"></div>
				</div>
			</div>
			${d.imagen ? frame(d.imagen, ctx, { label: d.titulo, cls: 'natural gp-img' }) : ''}
		</div>
	</div>`;
}

/* ───────────── Portada (página de inicio) ───────────── */

export interface Diapositiva { imagen: string; titulo: string; texto: string; enlaceTexto: string; enlace: string }
export interface Bloque { titulo: string; texto: string; enlace: string }
export interface Inicio {
	/** Lema grande. Lo que va entre *asteriscos* sale en naranja. */
	lema: string;
	intro: string;
	diapositivas: Diapositiva[];
	areas: Bloque[];
	quienesDestacado: string;
	quienesTexto: string;
	queHacemos: Bloque[];
	uneteTitulo: string;
	uneteTexto: string;
	uneteBoton: string;
}

export function normalizeInicio(raw: any = {}): Inicio {
	const bloque = (b: any): Bloque => ({ titulo: str(b?.titulo), texto: str(b?.texto), enlace: str(b?.enlace) });
	return {
		lema: str(raw.lema),
		intro: str(raw.intro),
		diapositivas: arr(raw.diapositivas, (s) => ({ imagen: str(s?.imagen), titulo: str(s?.titulo), texto: str(s?.texto), enlaceTexto: str(s?.enlaceTexto), enlace: str(s?.enlace) })),
		areas: arr(raw.areas, bloque),
		quienesDestacado: str(raw.quienesDestacado),
		quienesTexto: str(raw.quienesTexto),
		queHacemos: arr(raw.queHacemos, bloque),
		uneteTitulo: str(raw.uneteTitulo),
		uneteTexto: str(raw.uneteTexto),
		uneteBoton: str(raw.uneteBoton),
	};
}

/** "Tocar, entender y *construir.*" → lo de entre asteriscos, resaltado */
const resaltar = (s: string) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
/** Enlace escrito por un editor: "talleres" → dentro de la web; "https://…" → tal cual */
const enlaceWeb = (u: string, ctx: RenderCtx) => (/^(https?:|mailto:|#)/.test(u) ? u : joinBase(ctx.base, u));

/**
 * Lo editable de la portada. Lo que se actualiza solo (Cybertech, noticias, botón de la última edición,
 * enlace al curso actual) va en huecos `data-keep` que rellena la página (y que el editor conserva).
 */
export function renderInicio(d: Inicio, ctx: RenderCtx): string {
	const hueco = (k: string, tag = 'div') => `<${tag} data-keep="${k}"></${tag}>`;
	const n = d.diapositivas.length;
	const slides = n || ctx.admin ? `
	<div class="car" data-car${editAttr(ctx, 'diapositivas')} aria-roledescription="carrusel" aria-label="Reset en fotos">
		<div class="car-track">
			${d.diapositivas.map((s, i) => `
			<figure class="car-slide${i === 0 ? ' is-on' : ''}"${editAttr(ctx, `diapositivas.${i}`)} aria-roledescription="diapositiva" aria-label="${i + 1} de ${n}">
				${s.imagen ? `<img src="${esc(asset(s.imagen, ctx))}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" data-path="${esc(s.imagen)}" onerror="__img(this)">` : ''}
				<figcaption class="car-cap">
					<span class="car-n">${pad(i + 1)} / ${pad(n)}</span>
					${s.titulo ? `<strong class="car-t">${esc(s.titulo)}</strong>` : ''}
					${s.texto ? `<span class="car-x">${esc(s.texto)}</span>` : ''}
					${s.enlace ? `<a class="car-a" href="${esc(enlaceWeb(s.enlace, ctx))}">${esc(s.enlaceTexto || 'Ver más')} <span aria-hidden="true">→</span></a>` : ''}
				</figcaption>
			</figure>`).join('')}
			${!n && ctx.admin ? `<div class="car-slide is-on car-vacio">${addBtn(ctx, 'diapositivas', 'Añadir la primera diapositiva')}</div>` : ''}
		</div>
		${n > 1 ? `
		<div class="car-ui">
			<button type="button" class="car-btn" data-car-prev aria-label="Anterior">←</button>
			<ol class="car-dots">${d.diapositivas.map((_, i) => `<li><button type="button" data-car-go="${i}" aria-label="Diapositiva ${i + 1}"${i === 0 ? ' aria-current="true"' : ''}><i></i></button></li>`).join('')}</ol>
			<button type="button" class="car-btn" data-car-next aria-label="Siguiente">→</button>
		</div>` : ''}
		${ctx.admin && n ? `<div class="car-adm">${addBtn(ctx, 'diapositivas', 'Añadir diapositiva')}</div>` : ''}
	</div>` : '';

	const bloques = (lista: Bloque[], path: string, cls: string, conEnlace: boolean) => lista.map((b, i) => {
		const tag = conEnlace && b.enlace && !ctx.admin ? 'a' : 'div';
		return `<${tag} class="${cls}${reveal(ctx)}" style="--d:${i}"${tag === 'a' ? ` href="${esc(enlaceWeb(b.enlace, ctx))}"` : ''}${editAttr(ctx, `${path}.${i}`)}>
			<span class="idx">${pad(i + 1)}</span>
			<${cls === 'area' ? 'h2' : 'h3'}>${esc(b.titulo)}</${cls === 'area' ? 'h2' : 'h3'}>
			<p>${esc(b.texto)}</p>
			${conEnlace ? '<span class="svc-arr" aria-hidden="true">→</span>' : ''}
		</${tag}>`;
	}).join('');

	return `
	<section class="hero"${editAttr(ctx, '')}>
		<div class="wrap hero-in">
			<div class="hero-copy">
				<h1 class="hero-t">${resaltar(d.lema) || (ctx.admin ? '<span class="muted">Lema de la portada</span>' : '')}</h1>
				<div class="hero-side">
					${d.intro ? `<p class="hero-lede">${esc(d.intro)}</p>` : ''}
					<div class="hero-cta">${hueco('cta-cybertech', 'span')}<a class="btn" href="${esc(joinBase(ctx.base, 'participa'))}">Únete a Reset <span class="arr">→</span></a></div>
				</div>
			</div>
			${slides}
		</div>
	</section>

	<section class="areas"${editAttr(ctx, 'areas')}>
		<div class="wrap areas-in">${bloques(d.areas, 'areas', 'area', false)}${ctx.admin ? `<div class="area">${addBtn(ctx, 'areas', 'Añadir área')}</div>` : ''}</div>
	</section>

	<section class="wrap about">
		<header class="sec-head${reveal(ctx)}"${editAttr(ctx, '')}><span class="idx">§01</span><h2>Quiénes somos</h2><span class="rule"></span></header>
		<div class="about-in"${editAttr(ctx, '')}>
			<p class="about-big${reveal(ctx)}">${resaltar(d.quienesDestacado)}</p>
			<div class="prose${reveal(ctx)}" style="--d:2">${md(d.quienesTexto)}${hueco('curso', 'p')}</div>
		</div>
	</section>

	${hueco('cybertech')}

	<section class="wrap services">
		<header class="sec-head${reveal(ctx)}"${editAttr(ctx, 'queHacemos')}><span class="idx">§02</span><h2>Qué hacemos</h2><span class="rule"></span></header>
		<div class="svc-grid"${editAttr(ctx, 'queHacemos')}>${bloques(d.queHacemos, 'queHacemos', 'svc', true)}</div>
		${addBtn(ctx, 'queHacemos', 'Añadir', 'adm-add-wide')}
	</section>

	${hueco('noticias')}

	<section class="join"${editAttr(ctx, '')}>
		<div class="wrap join-in">
			<h2 class="display">${resaltar(d.uneteTitulo)}</h2>
			<div>
				<p>${esc(d.uneteTexto)}</p>
				<a class="btn" href="${esc(joinBase(ctx.base, 'participa'))}">${esc(d.uneteBoton || 'Quiero participar')} <span class="arr">→</span></a>
			</div>
		</div>
	</section>`;
}
