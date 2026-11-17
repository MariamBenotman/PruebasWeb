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

export interface Miembro {
	nombre: string; roles: string[]; foto: string; fotoHover: string;
	/** Meses del curso en los que ha sido «resetero del mes» ('noviembre', 'diciembre'…). Cada curso empieza de cero. */
	meses: string[];
}
/** Meses de un curso académico, en orden (de septiembre a agosto) */
export const MESES_CURSO = ['septiembre', 'octubre', 'noviembre', 'diciembre', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto'];
/** «noviembre» del curso «2026/27» → «2026-11»; «enero» → «2027-01» */
export function mesDelCurso(curso: string, mes: string): string {
	const y0 = parseInt(curso, 10), i = MESES_CURSO.indexOf(mes);
	if (!y0 || i < 0) return '';
	const n = (i + 8) % 12 + 1;
	return `${i < 4 ? y0 : y0 + 1}-${String(n).padStart(2, '0')}`;
}
/**
 * Orden automático de una sección de miembros:
 * `cargo`: por cargo, siempre en el mismo orden (Presidencia, Vicepresidencia, Secretaría, Tesorería, Logística; el resto después,
 * por nombre). Es el de la Junta. `vocalia`: juntos los de la misma vocalía (por orden alfabético de vocalía) y, dentro, por nombre.
 * `alfabetico`: por nombre.
 * Si la sección tiene `manual`, en cambio, van en el orden en que se colocan en el editor.
 */
export type OrdenMiembros = 'cargo' | 'vocalia' | 'alfabetico';
/** Orden de los cargos de la Junta (vale masculino y femenino: Presidente/Presidenta…) */
export const ORDEN_CARGOS = [/^presiden/i, /^vicepresiden/i, /^secretari/i, /^tesorer/i, /^log[ií]st/i];
const rangoCargo = (roles: string[]) => Math.min(ORDEN_CARGOS.length, ...roles.map((r) => {
	const i = ORDEN_CARGOS.findIndex((re) => re.test(r.trim()));
	return i < 0 ? ORDEN_CARGOS.length : i;
}));
/** Orden por defecto de una sección según su título: la Junta, por cargo; Vocales, por vocalía; el resto, alfabético */
export const ordenPorDefecto = (titulo: string): OrdenMiembros => (/junta/i.test(titulo) ? 'cargo' : /vocal/i.test(titulo) ? 'vocalia' : 'alfabetico');
export interface SeccionMiembros { titulo: string; orden: OrdenMiembros; /** Ordenadas a mano en el editor (si no, orden automático) */ manual: boolean; miembros: Miembro[] }

/**
 * Las personas de una sección en el orden en que salen en la web. Conserva el índice original (j) para que el editor
 * sepa qué persona es cada tarjeta.
 */
export function ordenarMiembros(s: Pick<SeccionMiembros, 'orden' | 'manual' | 'miembros'>) {
	const lista = s.miembros.map((m, j) => ({ m, j }));
	if (s.manual) return lista;
	const cmp = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
	const porNombre = (a: { m: Miembro }, b: { m: Miembro }) => cmp(a.m.nombre, b.m.nombre);
	if (s.orden === 'cargo') return lista.sort((a, b) => rangoCargo(a.m.roles) - rangoCargo(b.m.roles) || porNombre(a, b));
	if (s.orden === 'vocalia') {
		// Sin vocalía, al final
		const voc = (m: Miembro) => (m.roles[0] ?? '').trim();
		return lista.sort((a, b) => (+!voc(a.m) - +!voc(b.m)) || cmp(voc(a.m), voc(b.m)) || porNombre(a, b));
	}
	return lista.sort(porNombre);
}
export interface Curso {
	curso: string; intro: string;
	/** Fotos de grupo: salen abajo del todo (con varias, van rotando). La primera es la de la lista de cursos. */
	fotosGrupo: string[];
	secciones: SeccionMiembros[];
}

export interface Prueba { nombre: string; descripcion: string; media: string }
export interface Categoria { nombre: string; descripcion: string; media: string; pruebas: Prueba[] }
export interface Dato { valor: string; etiqueta: string }
export interface SeccionEdicion { titulo: string; contenido: string; media: string }
export interface Edicion {
	anio: number; lema: string; tematica: string; fechas: string; lugar: string; portada: string; intro: string;
	datos: Dato[]; categorias: Categoria[]; secciones: SeccionEdicion[]; galeria: string[];
	/** Plazo de inscripción (AAAA-MM-DD, ambos incluidos) y enlace al formulario. Dentro del plazo sale «Inscripciones abiertas». */
	inscripcionDesde: string; inscripcionHasta: string; inscripcionEnlace: string;
	/** Usuario de GitHub que la creó desde el editor (los niveles básicos solo editan lo suyo) */
	creadoPor?: string;
}

/** Quién lo creó desde el editor: solo se guarda si se sabe (para no ensuciar los archivos antiguos) */
const conAutor = (raw: any) => (raw?.creadoPor ? { creadoPor: str(raw.creadoPor) } : {});

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
	/** Miembros: fotos de esa persona en otros cursos (la del curso más cercano primero), por si no tiene foto en este */
	fotosDe?: (nombre: string) => string[];
	/** Igual, para la foto de «al pasar el ratón» */
	hoverDe?: (nombre: string) => string[];
}

/**
 * Fotos de cada persona en los demás cursos, de la del curso más cercano al actual a la más lejana.
 * Así, quien no tiene foto un año sale con la de otro año (mejor eso que un hueco).
 */
export function indiceFotos(cursos: Curso[], actual: string, campo: 'foto' | 'fotoHover' = 'foto') {
	const anio = (c: string) => parseInt(c, 10) || 0;
	const a0 = anio(actual);
	const fotos = new Map<string, string[]>();
	[...cursos]
		.filter((c) => c.curso !== actual)
		.sort((a, b) => Math.abs(anio(a.curso) - a0) - Math.abs(anio(b.curso) - a0) || anio(b.curso) - anio(a.curso))
		.forEach((c) => c.secciones.forEach((s) => s.miembros.forEach((m) => {
			const k = clavePersona(m.nombre);
			const f = m[campo];
			if (!k || !f) return;
			const l = fotos.get(k) ?? [];
			if (!l.includes(f)) l.push(f);
			fotos.set(k, l);
		})));
	return (nombre: string) => fotos.get(clavePersona(nombre)) ?? [];
}

/* ───────────── Normalización (rellena huecos para que nunca falle) ───────────── */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = <T>(v: unknown, map: (x: any) => T): T[] => (Array.isArray(v) ? v.map(map) : []);

export function normalizeCurso(raw: any = {}): Curso {
	return {
		curso: str(raw.curso),
		intro: str(raw.intro),
		// (antes era una sola: «fotoGrupo»)
		fotosGrupo: Array.isArray(raw.fotosGrupo) ? arr(raw.fotosGrupo, str).filter(Boolean) : raw.fotoGrupo ? [str(raw.fotoGrupo)] : [],
		secciones: arr(raw.secciones, (s) => ({
			titulo: str(s?.titulo),
			// Por defecto: alfabético si nadie de la sección tiene cargo (p. ej. "Miembros"); manual si lo tienen (Junta, Vocales)
			orden: ['cargo', 'vocalia', 'alfabetico'].includes(s?.orden) ? s.orden : ordenPorDefecto(str(s?.titulo)),
			// (antes «manual» era un tipo de orden más)
			manual: !!s?.manual || s?.orden === 'manual',
			miembros: arr(s?.miembros, (m) => ({
				nombre: str(m?.nombre),
				roles: arr(m?.roles, str).filter(Boolean),
				foto: str(m?.foto),
				fotoHover: str(m?.fotoHover),
				meses: MESES_CURSO.filter((x) => Array.isArray(m?.meses) && m.meses.includes(x)),
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
		...conAutor(raw),
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
function frame(path: string, ctx: RenderCtx, opts: { label: string; cls?: string; alt?: string; extra?: string; eager?: boolean; respaldo?: string[] }) {
	// Respaldo: otras fotos que probar, en orden, si esta no existe (o no hay). Si se usa una, la figura lleva .es-prestada.
	const resp = (opts.respaldo ?? []).filter((p) => p && p !== path && !isVideo(p));
	const prestada = !path && resp.length > 0;
	const usar = prestada ? resp[0] : path;
	const fb = (prestada ? resp.slice(1) : resp).map((p) => asset(p, ctx));
	const src = asset(usar, ctx);
	let inner = '';
	if (src) {
		inner = isVideo(usar)
			? `<video src="${esc(src)}" autoplay muted loop playsinline preload="metadata" onerror="__img(this)" data-path="${esc(usar)}"></video>`
			: `<img src="${esc(src)}" alt="${esc(opts.alt ?? '')}" ${opts.eager ? '' : 'loading="lazy"'} decoding="async" onerror="__img(this)" data-path="${esc(usar)}"${fb.length ? ` data-fb="${esc(fb.join('|'))}"` : ''}>`;
	}
	if (prestada) opts = { ...opts, cls: `${opts.cls ?? ''} es-prestada` };
	// En modo edición, si la foto aún no existe, se ve dónde debe ir (centrado y partido en líneas para que no se corte)
	const ruta = ctx.admin && path ? `<span class="adm-ruta">${esc(path)}</span>` : '';
	return `<figure class="frame ${opts.cls ?? ''}" data-label="${esc(opts.label)}"${path ? ` data-path="${esc(path)}"` : ''}>${inner}${ruta}${opts.extra ?? ''}</figure>`;
}

/** Botón «+» del modo edición. `nuevo`: valores iniciales de lo que se añade (p. ej. un bloque de tipo «fotos») */
const addBtn = (ctx: RenderCtx, path: string, label: string, cls = '', nuevo?: object) =>
	ctx.admin ? `<button type="button" class="adm-add ${cls}" data-add="${path}"${nuevo ? ` data-nuevo="${esc(JSON.stringify(nuevo))}"` : ''}><span>+</span>${esc(label)}</button>` : '';

const editAttr = (ctx: RenderCtx, path: string) => (ctx.admin ? ` data-edit="${path}"` : '');
const reveal = (ctx: RenderCtx) => (ctx.admin ? '' : ' reveal');

/** Engranaje (SVG en línea, toma el color del texto): 8 dientes y un agujero en el centro */
const ENGRANAJE = (() => {
	const n = 8, R = 11.5, r = 8.6, h = 3.4, paso = (2 * Math.PI) / n;
	const pt = (rad: number, a: number) => `${(12 + rad * Math.cos(a)).toFixed(2)} ${(12 + rad * Math.sin(a)).toFixed(2)}`;
	const dientes = Array.from({ length: n }, (_, k) => {
		const c = k * paso;
		return [pt(r, c - paso * 0.3), pt(R, c - paso * 0.16), pt(R, c + paso * 0.16), pt(r, c + paso * 0.3)].join(' L ');
	}).join(' L ');
	return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M ${dientes} Z M ${12 + h} 12 A ${h} ${h} 0 1 0 ${12 - h} 12 A ${h} ${h} 0 1 0 ${12 + h} 12 Z"/></svg>`;
})();

/* ───────────── Página de miembros ───────────── */

export function renderCurso(d: Curso, ctx: RenderCtx): string {
	const total = d.secciones.reduce((n, s) => n + s.miembros.length, 0);
	const corto = cursoCorto(d.curso) || '··/··';

	const tally = d.secciones
		.filter((s) => s.miembros.length)
		.map((s) => `<div><dt>${esc(s.titulo)}</dt><dd>${pad(s.miembros.length)}</dd></div>`)
		.join('');

	// Resetero del mes: un engranaje por cada mes, en fila arriba a la derecha de la foto. Con los 12, «Resetero del año».
	// Quién lo es ahora (el último mes ya empezado de este curso) lo decide el navegador con la fecha de hoy (Layout.astro),
	// y su foto lleva un marco de ondas (.rdm-marco).
	const engranajes = (m: Miembro) => !m.meses.length ? '' :
		(m.meses.length === MESES_CURSO.length
			? `<span class="rda" title="Resetero del mes los 12 meses del curso">${ENGRANAJE}<span>Resetero del año</span></span>`
			: `<span class="rdm" role="img" aria-label="Resetero del mes: ${esc(m.meses.join(', '))}">${
				m.meses.map((mes, k) => `<i style="--k:${m.meses.length - 1 - k}" data-mes="${esc(mes[0].toUpperCase() + mes.slice(1))} ${esc(mesDelCurso(d.curso, mes).slice(0, 4))}">${ENGRANAJE}</i>`).join('')}</span>`)
		+ '<span class="rdm-marco" aria-hidden="true"></span>';
	const card = (m: Miembro, i: number, j: number) => `
		<li class="m-card${reveal(ctx)}" style="--d:${j % 12}"${m.meses.length ? ` data-rdm="${m.meses.map((x) => mesDelCurso(d.curso, x)).join(' ')}"` : ''}${editAttr(ctx, `secciones.${i}.miembros.${j}`)}>
			${frame(m.foto, ctx, {
				label: initials(m.nombre),
				cls: 'm-photo',
				alt: m.nombre,
				respaldo: ctx.fotosDe?.(m.nombre),
				extra: frameAlt(m.fotoHover, ctx, ctx.hoverDe?.(m.nombre) ?? []) + engranajes(m),
			})}
			<div class="m-meta">
				<h3>${esc(m.nombre) || '<span class="muted">Sin nombre</span>'}</h3>
				${ctx.admin && !m.roles.length && /junta|vocal/i.test(d.secciones[i].titulo) ? `<p class="adm-aviso-card">⚠ Falta su cargo de ${esc(d.secciones[i].titulo)}</p>` : ''}
				${m.roles.length || m.meses.length ? `<ul class="tags">${m.roles.map((r) => `<li>${esc(r)}</li>`).join('')}${m.meses.length ? '<li class="rdm-tag">Resetero del mes</li>' : ''}</ul>` : ''}
			</div>
		</li>`;
	// La leyenda solo sale si este curso tiene algún resetero del mes
	const hayRdm = d.secciones.some((s) => s.miembros.some((m) => m.meses.length));


	const sections = d.secciones.map((s, i) => `
		<section class="m-sec${i === 0 ? ' is-lead' : ''}${s.miembros.some((m) => m.roles.length) ? '' : ' is-plain'}">
			<header class="sec-head${reveal(ctx)}"${editAttr(ctx, `secciones.${i}`)}>
				<span class="idx">§${pad(i + 1)}</span>
				<h2>${esc(s.titulo) || 'Sección sin título'}</h2>
				<span class="rule"></span>
				<span class="count">${pad(s.miembros.length)}</span>
			</header>
			<ul class="m-grid">
				${ordenarMiembros(s).map(({ m, j }) => card(m, i, j)).join('')}
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
				${total ? `<div class="tally-col"><dl class="tally"><div><dt>Personas</dt><dd>${pad(total)}</dd></div>${tally}</dl>${hayRdm ? `<p class="rdm-leyenda">Cada <span class="rdm-ico" role="img" aria-label="engranaje">${ENGRANAJE}</span> representa un mes como resetero del mes</p>` : ''}</div>` : ''}
			</div>
		</header>
		${sections || (ctx.admin ? '' : '<p class="empty">Todavía no hay personas en este curso.</p>')}
		${addBtn(ctx, 'secciones', 'Añadir sección', 'adm-add-wide')}
		${fotosGrupo(d, ctx)}
	</div>`;
}

/** Fotos de grupo, abajo del todo. Con varias, van rotando solas (lo hace Layout.astro: [data-rotar]) y con puntos para elegir. */
function fotosGrupo(d: Curso, ctx: RenderCtx) {
	const n = d.fotosGrupo.length;
	if (!n && !ctx.admin) return '';
	const alt = `Equipo de Reset, curso ${d.curso}`;
	return `
	<section class="m-grupo${reveal(ctx)}">
		<header class="sec-head"${editAttr(ctx, 'fotosGrupo')}><span class="idx">§</span><h2>${n > 1 ? 'Fotos de grupo' : 'Foto de grupo'}</h2><span class="rule"></span>${n > 1 ? `<span class="count">${pad(n)}</span>` : ''}</header>
		${n ? `<div class="m-grupo-fotos"${n > 1 ? ' data-rotar' : ''}${editAttr(ctx, 'fotosGrupo')}>
			${d.fotosGrupo.map((f, k) => frame(f, ctx, { label: 'Foto de grupo', alt, cls: `wide${k === 0 ? ' is-on' : ''}` })).join('')}
		</div>
		${n > 1 ? `<div class="m-grupo-dots" role="group" aria-label="Elegir foto">${d.fotosGrupo.map((_, k) => `<button type="button" data-i="${k}"${k === 0 ? ' aria-current="true"' : ''} aria-label="Foto ${k + 1} de ${n}"></button>`).join('')}</div>` : ''}` : ''}
		${addBtn(ctx, 'fotosGrupo', n ? 'Añadir más fotos de grupo (irán rotando)' : 'Añadir fotos de grupo (con varias, van rotando)', 'adm-add-wide')}
	</section>`;
}

/** Foto de «al pasar el ratón». Si no hay (o no existe), se prueban las de otros cursos (respaldo), en orden. */
function frameAlt(path: string, ctx: RenderCtx, respaldo: string[] = []) {
	const lista = [path, ...respaldo].filter((p, i, a) => p && a.indexOf(p) === i);
	if (!lista.length) return '';
	const [usar, ...resto] = lista;
	return `<img class="alt" src="${esc(asset(usar, ctx))}" alt="" loading="lazy" decoding="async" onerror="__img(this)" data-path="${esc(usar)}"${resto.length ? ` data-fb="${esc(resto.map((p) => asset(p, ctx)).join('|'))}"` : ''}>`;
}

/* ───────────── Entradas: Proyectos, Talleres, Servicios y Noticias ───────────── */

/**
 * Secciones libres de una entrada (proyecto, taller, servicio o noticia): cada una con un título opcional y sus bloques,
 * en el orden que se quiera: texto, fotos (una grande o varias en mosaico) o foto y texto uno al lado del otro.
 */
export type TipoBloque = 'texto' | 'fotos' | 'foto-texto';
export interface Bloque { tipo: TipoBloque; texto: string; fotos: string[]; /** En «foto y texto»: dónde va la foto */ lado: 'izquierda' | 'derecha' }
export interface SeccionEntrada { titulo: string; bloques: Bloque[] }
const normBloque = (b: any): Bloque => ({
	tipo: ['texto', 'fotos', 'foto-texto'].includes(b?.tipo) ? b.tipo : 'texto',
	texto: str(b?.texto),
	fotos: arr(b?.fotos, str).filter(Boolean),
	lado: b?.lado === 'derecha' ? 'derecha' : 'izquierda',
});

export interface Entrada {
	titulo: string;
	fecha: string;        // AAAA-MM-DD (opcional salvo en noticias)
	etiquetas: string[];
	resumen: string;
	portada: string;
	cuerpo: string;
	galeria: string[];
	/** Secciones libres (título + bloques de texto, fotos o foto y texto). Salen después del contenido principal. */
	secciones: SeccionEntrada[];
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
	/** Proyectos: cursos en los que se hizo ("2020/21", "2021/22"…), del más antiguo al más reciente */
	cursos: string[];
	/** Proyectos: miembros de Reset que lo han hecho (por su nombre, tal como sale en Miembros) */
	autores: string[];
	/** Proyectos: texto libre debajo de los autores («También han participado…», «Mención especial a…»). Markdown. */
	otrosAutores: string;
	/** Usuario de GitHub que lo creó desde el editor (los niveles básicos solo editan lo suyo) */
	creadoPor?: string;
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
		secciones: Array.isArray(raw.secciones)
			? arr(raw.secciones, (s) => ({ titulo: str(s?.titulo), bloques: arr(s?.bloques, normBloque) }))
			// (versión anterior: «galerías con título»)
			: arr(raw.galerias, (g) => ({ titulo: str(g?.titulo), bloques: arr(g?.fotos, str).filter(Boolean).length ? [normBloque({ tipo: 'fotos', fotos: g.fotos })] : [] })),
		serie: str(raw.serie),
		descMenu: str(raw.descMenu),
		oculto: !!raw.oculto,
		enListado: raw.enListado === undefined ? true : !!raw.enListado,
		incluye: arr(raw.incluye, str).filter(Boolean),
		destacado: !!raw.destacado,
		// Si no se ha marcado nunca, cuenta como activo lo que tiene la etiqueta «En desarrollo»
		activo: raw.activo !== undefined ? !!raw.activo : arr(raw.etiquetas, str).includes('En desarrollo'),
		cursos: normalizarCursos(raw),
		autores: arr(raw.autores, str).filter(Boolean),
		otrosAutores: str(raw.otrosAutores),
		...conAutor(raw),
	};
}

/** Cursos válidos ("2020/21"), ordenados y sin repetir. Acepta también el antiguo campo «anio» ("2021" → "2021/22"). */
function normalizarCursos(raw: any): string[] {
	let c = arr(raw.cursos, str).map((x) => x.trim()).filter((x) => /^\d{4}\/\d{2}$/.test(x));
	if (!c.length && /^\d{4}$/.test(str(raw.anio).trim())) {
		const a = Number(str(raw.anio).trim());
		c = [`${a}/${String((a + 1) % 100).padStart(2, '0')}`];
	}
	return [...new Set(c)].sort();
}

/**
 * Cómo se enseñan los cursos de un proyecto: uno solo → "2021/22"; varios → el rango de años
 * (["2020/21", "2021/22"] → "2020–2022").
 */
export function rangoCursos(cursos: string[]): string {
	if (!cursos.length) return '';
	if (cursos.length === 1) return cursos[0];
	const ini = Number(cursos[0].slice(0, 4));
	const fin = Number(cursos[cursos.length - 1].slice(0, 4)) + 1;
	return `${ini}–${fin}`;
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
	// Autores (proyectos): miembros con su foto, y debajo un texto libre (otros colaboradores, menciones especiales…)
	const otros = d.otrosAutores.trim();
	const autores = seccion === 'proyectos' && (d.autores.length || otros.length || ctx.admin) ? `
	<section class="wrap en-autores">
		<header class="sec-head${reveal(ctx)}"${editAttr(ctx, '')}><span class="idx">${pad(d.autores.length)}</span><h2>Quién lo ha hecho</h2><span class="rule"></span></header>
		<ul class="en-autores-grid"${editAttr(ctx, '')}>
			${d.autores.map((n, i) => {
				const p = personas.find((x) => clavePersona(x.nombre) === clavePersona(n));
				const tag = p?.url && !ctx.admin ? 'a' : 'div';
				return `<li class="${reveal(ctx).trim()}" style="--d:${i}"><${tag} class="en-autor"${tag === 'a' ? ` href="${esc(p!.url)}"` : ''}>
					${frame(p?.foto ?? '', ctx, { label: initials(n), cls: 'm-photo' })}
					<span>${esc(n)}</span></${tag}></li>`;
			}).join('')}
			${ctx.admin && !d.autores.length ? `<li><button type="button" class="adm-add" data-edit="" data-campo="autores"><span>+</span>Elegir autores (en «Datos generales»)</button></li>` : ''}
		</ul>
		${otros ? `<div class="en-otros prose"${editAttr(ctx, '')} data-campo="otrosAutores">${md(otros)}</div>`
			: ctx.admin ? `<p class="en-otros adm-vacio"${editAttr(ctx, '')} data-campo="otrosAutores">Aquí puedes añadir un texto libre, por ejemplo «También han participado…» o «Mención especial a…» (en «Datos generales»).</p>` : ''}
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
		...(d.cursos.length && !d.fecha ? [`<span>${esc(rangoCursos(d.cursos))}</span>`] : []),
	];
	const gal = d.galeria.length || ctx.admin ? `
	<section class="wrap en-gal">
		<header class="sec-head${reveal(ctx)}"${editAttr(ctx, 'galeria')}><span class="idx">§</span><h2>Galería</h2><span class="rule"></span></header>
		<div class="gal"${editAttr(ctx, 'galeria')}>
			${d.galeria.map((g, i) => frame(g, ctx, { label: `Foto ${pad(i + 1)}`, cls: `${reveal(ctx)} g${i % 5}` })).join('')}
		</div>
		${addBtn(ctx, 'galeria', 'Añadir fotos', 'adm-add-wide')}
	</section>` : '';

	// Secciones libres: título + bloques (texto, fotos, foto y texto) en el orden que se quiera
	const muted = (t: string) => (ctx.admin ? `<p class="muted">${t}</p>` : '');
	const bloque = (b: Bloque, i: number, j: number) => {
		const e = editAttr(ctx, `secciones.${i}.bloques.${j}`);
		if (b.tipo === 'texto') {
			if (!b.texto && !ctx.admin) return '';
			return `<div class="en-b en-b-texto${reveal(ctx)}"${e}><div class="prose">${md(b.texto) || muted('Escribe aquí el texto…')}</div></div>`;
		}
		if (b.tipo === 'fotos') {
			if (!b.fotos.length) return ctx.admin ? `<div class="en-b"${e}><p class="adm-vacio">Bloque de fotos vacío: pulsa aquí para añadir fotos.</p></div>` : '';
			return b.fotos.length === 1
				? `<div class="en-b en-b-foto${reveal(ctx)}"${e}>${frame(b.fotos[0], ctx, { label: 'Foto', cls: 'natural' })}</div>`
				: `<div class="en-b"${e}><div class="gal">${b.fotos.map((f, k) => frame(f, ctx, { label: `Foto ${pad(k + 1)}`, cls: `${reveal(ctx)} g${k % 5}` })).join('')}</div></div>`;
		}
		if (!b.texto && !b.fotos.length && !ctx.admin) return '';
		const foto = b.fotos[0] ? frame(b.fotos[0], ctx, { label: 'Foto', cls: 'natural' }) : (ctx.admin ? '<p class="adm-vacio">Sin foto: pulsa aquí para añadirla.</p>' : '');
		return `<div class="en-b en-ft foto-${b.lado}${b.fotos[0] || ctx.admin ? '' : ' sin-foto'}${reveal(ctx)}"${e}>${foto}<div class="prose">${md(b.texto) || muted('Escribe aquí el texto…')}</div></div>`;
	};
	const secciones = d.secciones.map((s, i) => {
		const cuerpo = s.bloques.map((b, j) => bloque(b, i, j)).join('');
		// Una sección vacía (p. ej. «Después», sin fotos aún) no sale en la web
		if (!ctx.admin && !cuerpo.trim()) return '';
		return `
	<section class="wrap en-sec">
		${s.titulo || ctx.admin ? `<header class="sec-head${reveal(ctx)}"${editAttr(ctx, `secciones.${i}`)}><span class="idx">§${pad(i + 1)}</span><h2>${esc(s.titulo) || (ctx.admin ? '<span class="muted">Sección sin título</span>' : '')}</h2><span class="rule"></span></header>` : ''}
		${cuerpo}
		${ctx.admin ? `<div class="en-sec-add"><span>Añadir a «${esc(s.titulo || 'esta sección')}»:</span>${addBtn(ctx, `secciones.${i}.bloques`, 'Texto', '', { tipo: 'texto' })}${addBtn(ctx, `secciones.${i}.bloques`, 'Fotos', '', { tipo: 'fotos' })}${addBtn(ctx, `secciones.${i}.bloques`, 'Foto y texto', '', { tipo: 'foto-texto' })}</div>` : ''}
	</section>`;
	}).join('')
		+ (ctx.admin ? `<div class="wrap en-sec-nueva">${addBtn(ctx, 'secciones', 'Añadir una sección (texto, fotos o foto y texto, en el orden que quieras)', 'adm-add-wide')}</div>` : '');

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
		${secciones}
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
	const lede = d.intro || ctx.admin ? `<p class="lede gp-lede">${esc(d.intro) || (ctx.admin ? '<span class="muted">Frase de presentación…</span>' : '')}</p>` : '';
	// Con imagen, la frase va en la columna del texto y la imagen empieza a su altura (sin hueco encima de la imagen)
	return `
	<div class="wrap gp${d.imagen ? ' gp-con-img' : ''}">
		<header class="pg-head"${e}>
			<p class="kicker"><span>${d.menu ? 'Conócenos' : 'Reset'}</span><span>${esc(d.titulo)}</span></p>
			<h1 class="display gp-t">${esc(d.titulo) || (ctx.admin ? '<span class="muted">Título del apartado</span>' : '')}</h1>
			${d.imagen ? '' : lede}
		</header>
		<div class="gp-main${d.imagen ? ' con-img' : ''}"${e}>
			<div class="gp-col">
				${d.imagen ? lede : ''}
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
/** Tamaño del lema (px en pantalla ancha; en las estrechas se reduce en proporción). 52 es el de siempre */
export const LEMA = { min: 28, max: 96, normal: 52 };

export interface Inicio {
	/** Lema grande. Lo que va entre *asteriscos* sale en naranja. */
	lema: string;
	/** Tamaño de letra del lema, en px (pantalla ancha) */
	tamLema: number;
	intro: string;
	/** GIF o vídeos cortos bajo el lema (van rotando). Si no hay, salen las cifras de Reset. */
	mediaLema: string[];
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
		tamLema: Math.min(LEMA.max, Math.max(LEMA.min, Number(raw.tamLema) || LEMA.normal)),
		intro: str(raw.intro),
		mediaLema: arr(raw.mediaLema, str).filter(Boolean),
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
				<div class="hero-main">
					<h1 class="hero-t" data-encajar${d.tamLema !== LEMA.normal ? ` style="--lema-k: ${+(d.tamLema / LEMA.normal).toFixed(3)}"` : ''}>${resaltar(d.lema) || (ctx.admin ? '<span class="muted">Lema de la portada</span>' : '')}</h1>
					${d.mediaLema.length
						// GIF o vídeos cortos (con varios, van rotando: Layout.astro, [data-rotar])
						? `<div class="hero-media"${d.mediaLema.length > 1 ? ' data-rotar' : ''}${editAttr(ctx, 'mediaLema')}>${d.mediaLema.map((f, k) => frame(f, ctx, { label: 'Reset', cls: k === 0 ? 'is-on' : '', eager: k === 0 })).join('')}</div>`
						// Si no, las cifras de Reset (las calcula la portada con los datos de la web)
						: hueco('cifras')}
				</div>
				<div class="hero-side">
					${d.intro ? `<div class="hero-lede">${md(d.intro)}</div>` : ''}
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
