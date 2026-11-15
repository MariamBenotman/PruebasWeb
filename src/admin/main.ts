/**
 * MODO EDICIÓN
 * Se carga solo si hay sesión iniciada (ver /admin). Convierte la página real en editable:
 *  - clic en cualquier bloque → se abre el panel lateral con sus campos
 *  - botones "+" para añadir personas, categorías, pruebas, fotos…
 *  - la página se vuelve a dibujar en directo con el mismo código que la web publicada
 *  - "Guardar y publicar" hace un commit en GitHub y la web se actualiza sola
 */
import './admin.css';
import { clearToken, readFile, listDir, commit, deployStatus, rawUrl, isLocal, puedeBorrar, GitHubError, type FileChange } from './github';
import { kinds, type DocKind, type Field, type ObjSchema, type Reutilizar } from './schema';
import { pending, processFile, pickFiles } from './media';
import { tagStore, tagPicker } from './tags';
import { esc, asset, joinBase, slugify } from '../lib/render';

const base = window.__site.base;
const root = document.getElementById('page-root');
const uploaded = new Map<string, string>(); // fotos ya guardadas pero aún no publicadas → vista previa local

/* Fotos recién subidas que la web publicada todavía no tiene: se leen directamente del repositorio. */
window.__imgAdmin = (el) => {
	const p = el.getAttribute('data-path');
	if (!p || isLocal() || el.dataset.raw || /^(https?:|blob:|data:)/.test(p)) return false;
	el.dataset.raw = '1';
	el.src = rawUrl(`public/${p.replace(/^\//, '')}`);
	return true;
};

const h = <T extends HTMLElement = HTMLElement>(html: string) => {
	const t = document.createElement('template');
	t.innerHTML = html.trim();
	return t.content.firstElementChild as T;
};
const pad = (n: number) => String(n).padStart(2, '0');
const ctx = () => ({ base, admin: true, resolve: (p: string) => pending.get(p)?.url ?? uploaded.get(p) });

/* ───────────── Estado ───────────── */

let K: DocKind;
let data: any;
let savedJson = '';
let docId: string | null = null;
let isNew = false;
let existingIds: string[] = [];
let prevDoc: any = null;
let current: string | null = null; // ruta abierta en el panel ("" = datos generales)
let saving = false;

const segs = (p: string) => (p ? p.split('.') : []);
const getAt = (p: string) => segs(p).reduce((o: any, k) => o?.[k], data);
function setAt(p: string, v: any) {
	const s = segs(p);
	const last = s.pop()!;
	const parent = s.reduce((o: any, k) => o[k], data);
	parent[last] = v;
}
const isDirty = () => JSON.stringify(data) !== savedJson || tagStore.dirty;

/* ───────────── Barra inferior ───────────── */

const bar = h(`
<div class="adm-bar" role="region" aria-label="Modo edición">
	<div class="adm-bar-l"><span class="adm-dot"></span><b>Modo edición</b>${isLocal() ? '<span class="adm-local" title="Los cambios se guardan en los archivos de este ordenador, no en GitHub">LOCAL</span>' : ''}<span class="adm-doc"></span></div>
	<div class="adm-status" aria-live="polite"></div>
	<div class="adm-bar-r">
		<button type="button" class="adm-b" data-bar="general" hidden>Datos generales</button>
		<button type="button" class="adm-b" data-bar="discard" hidden>Descartar cambios</button>
		<button type="button" class="adm-b adm-b-main" data-bar="save" hidden>${isLocal() ? 'Guardar en este ordenador' : 'Guardar y publicar'}</button>
		<button type="button" class="adm-b adm-b-ghost" data-bar="logout" title="Cerrar sesión de editor">Salir</button>
	</div>
</div>`);
document.body.append(bar);
document.body.classList.add('adm-on');
const $status = bar.querySelector<HTMLElement>('.adm-status')!;
const $doc = bar.querySelector<HTMLElement>('.adm-doc')!;
const btn = (k: string) => bar.querySelector<HTMLButtonElement>(`[data-bar="${k}"]`)!;

function status(msg: string, tone: 'info' | 'ok' | 'error' | 'busy' = 'info') {
	$status.innerHTML = msg;
	$status.dataset.tone = tone;
}
function refreshBar() {
	const dirty = isDirty();
	btn('save').disabled = saving || (!dirty && !isNew);
	btn('discard').hidden = !dirty || isNew;
	bar.classList.toggle('is-dirty', dirty);
	if (K) $doc.textContent = K.titulo(K.normalize(data));
}

bar.addEventListener('click', (e) => {
	const k = (e.target as HTMLElement).closest<HTMLElement>('[data-bar]')?.dataset.bar;
	if (k === 'logout') {
		if (isDirty() && !bar.classList.contains('confirm-logout')) {
			bar.classList.add('confirm-logout');
			status('Tienes cambios sin guardar. Pulsa <b>Salir</b> otra vez para descartarlos.', 'error');
			return;
		}
		clearToken();
		window.onbeforeunload = null;
		location.reload();
	}
	if (k === 'general') open('');
	if (k === 'save') save();
	if (k === 'discard') {
		data = JSON.parse(savedJson);
		tagStore.dirty = false;
		renderPage();
		if (current !== null) open(current, false);
		status('Cambios descartados.');
	}
});

window.addEventListener('beforeunload', (e) => {
	if (K && isDirty()) e.preventDefault();
});
window.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && K) { e.preventDefault(); save(); }
	if (e.key === 'Escape' && current !== null && !(e.target as HTMLElement).closest('.f-tags')) close();
});

/* ───────────── Vista previa ───────────── */

let raf = 0;
function renderPage() {
	cancelAnimationFrame(raf);
	if (!root || !K) return;
	root.innerHTML = K.render(K.normalize(data), ctx());
	document.dispatchEvent(new Event('reset:rendered'));
	highlight(false);
	refreshBar();
}
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderPage); refreshBar(); };

function highlight(scroll: boolean) {
	root?.querySelectorAll('.adm-current').forEach((el) => el.classList.remove('adm-current'));
	if (current === null) return;
	const el = root?.querySelector(`[data-edit="${current}"]`);
	el?.classList.add('adm-current');
	if (scroll && el) {
		const r = el.getBoundingClientRect();
		if (r.top < 90 || r.top > innerHeight * 0.7) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
}

root?.addEventListener('click', (e) => {
	if (!K) return;
	const t = e.target as HTMLElement;
	const add = t.closest<HTMLElement>('[data-add]');
	if (add) { e.preventDefault(); addTo(add.dataset.add!); return; }
	const ed = t.closest<HTMLElement>('[data-edit]');
	if (ed) { e.preventDefault(); open(ed.dataset.edit!, false); }
});

/* ───────────── Esquema: qué hay en cada ruta ───────────── */

type ListField = Extract<Field, { type: 'list' }>;
type Crumb =
	| { type: 'object'; schema: ObjSchema; path: string; index: number; list?: ListField; listPath?: string }
	| { type: 'list'; field: Extract<Field, { type: 'list' | 'images' }>; path: string };

function chain(path: string): Crumb[] {
	const s = segs(path);
	const out: Crumb[] = [{ type: 'object', schema: K.schema, path: '', index: -1 }];
	let schema = K.schema;
	let i = 0;
	while (i < s.length) {
		const f = schema.fields.find((x) => x.key === s[i]);
		if (!f || (f.type !== 'list' && f.type !== 'images')) break;
		const listPath = s.slice(0, i + 1).join('.');
		out.push({ type: 'list', field: f, path: listPath });
		if (f.type === 'list' && i + 1 < s.length) {
			schema = f.item;
			out.push({ type: 'object', schema, path: s.slice(0, i + 2).join('.'), index: Number(s[i + 1]), list: f, listPath });
			i += 2;
		} else break;
	}
	return out;
}

/** Si una ruta ya no existe (p. ej. tras borrar), sube hasta la más cercana que sí exista. */
function safePath(path: string): string {
	let s = segs(path);
	while (s.length && getAt(s.join('.')) === undefined) s = s.slice(0, -1);
	return s.join('.');
}

function nameHint(path: string, fallback: string) {
	const c = chain(path).reverse().find((x) => x.type === 'object' && x.schema.nameKey) as Extract<Crumb, { type: 'object' }> | undefined;
	return (c && getAt(c.path)?.[c.schema.nameKey!]) || fallback;
}

/* ───────────── Panel lateral ───────────── */

const drawer = h(`
<aside class="adm-drawer" aria-label="Editor" hidden>
	<header class="adm-dh"><nav class="adm-crumbs"></nav><button type="button" class="adm-x" aria-label="Cerrar panel">×</button></header>
	<div class="adm-db"></div>
</aside>`);
document.body.append(drawer);
const $crumbs = drawer.querySelector<HTMLElement>('.adm-crumbs')!;
const $body = drawer.querySelector<HTMLElement>('.adm-db')!;
drawer.querySelector('.adm-x')!.addEventListener('click', () => close());
$crumbs.addEventListener('click', (e) => {
	const p = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
	if (p !== undefined) open(p);
});

function close() {
	current = null;
	drawer.hidden = true;
	document.body.classList.remove('adm-drawer-open');
	highlight(false);
}

function open(path: string, scroll = true) {
	if (!K) return;
	path = safePath(path);
	current = path;
	drawer.hidden = false;
	document.body.classList.add('adm-drawer-open');
	const c = chain(path);
	const target = c[c.length - 1];

	$crumbs.innerHTML = c
		.filter((x, i) => x.type === 'object' || i === c.length - 1)
		.map((x) => {
			const label = x.type === 'object' ? x.schema.title(getAt(x.path) ?? data, x.index) : x.field.label;
			return `<button type="button" data-go="${x.path}">${esc(label)}</button>`;
		})
		.join('<span>›</span>');

	$body.innerHTML = '';
	if (target.type === 'list') {
		$body.append(target.field.type === 'images' ? imagesField(target.field, target.path) : listField(target.field, target.path, true));
	} else {
		if (target.index >= 0) $body.append(h(`<p class="adm-sub">${esc(target.list!.label)} · ${pad(target.index + 1)}</p>`));
		if (target.index >= 0 && target.list?.reutilizar && vacio(getAt(target.path))) $body.append(reuseBox(target.list.reutilizar, target.path));
		for (const f of target.schema.fields) $body.append(field(f, target.path ? `${target.path}.${f.key}` : f.key, target.path));
		if (target.index >= 0) $body.append(itemActions(target.listPath!, target.index));
		if (target.path === '') $body.append(rootExtras());
	}
	highlight(scroll);
	const first = $body.querySelector<HTMLElement>('input:not([type=file]), textarea');
	if (first && getAt(path) && target.type === 'object' && target.index >= 0 && !Object.values(getAt(path)).some((v) => (Array.isArray(v) ? v.length : v))) first.focus();
}

const wrapField = (f: Field, control: HTMLElement | string) => {
	const el = h(`<div class="f"><span class="f-l">${esc(f.label)}</span></div>`);
	if (typeof control === 'string') el.insertAdjacentHTML('beforeend', control); else el.append(control);
	if (f.hint) el.append(h(`<small class="f-h">${esc(f.hint)}</small>`));
	return el;
};

function field(f: Field, path: string, ownerPath: string): HTMLElement {
	const v = getAt(path);
	switch (f.type) {
		case 'text':
		case 'date':
		case 'number': {
			const el = wrapField(f, `<input class="f-in" type="${f.type}" value="${esc(v ?? '')}" placeholder="${esc((f as any).placeholder ?? '')}">`);
			el.querySelector('input')!.addEventListener('input', (e) => {
				const val = (e.target as HTMLInputElement).value;
				setAt(path, f.type === 'number' ? Number(val) : val);
				schedule();
			});
			return el;
		}
		case 'markdown': {
			const el = wrapField(f, `
				<div class="f-md">
					<div class="f-md-tools" role="toolbar">
						<button type="button" data-md="b" title="Negrita"><b>B</b></button>
						<button type="button" data-md="i" title="Cursiva"><i>I</i></button>
						<button type="button" data-md="a" title="Enlace">Enlace</button>
						<button type="button" data-md="ul" title="Lista">• Lista</button>
						<button type="button" data-md="h" title="Subtítulo">Subtítulo</button>
					</div>
					<textarea class="f-in" rows="${f.rows ?? 5}">${esc(v ?? '')}</textarea>
				</div>`);
			el.append(h(`<small class="f-h">Formato: **negrita**, *cursiva*, [texto](https://enlace), líneas que empiezan por "- " para listas.</small>`));
			const ta = el.querySelector('textarea')!;
			const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 520)}px`; };
			ta.addEventListener('input', () => { setAt(path, ta.value); grow(); schedule(); });
			requestAnimationFrame(grow);
			el.querySelector('.f-md-tools')!.addEventListener('click', (e) => {
				const k = (e.target as HTMLElement).closest<HTMLElement>('[data-md]')?.dataset.md;
				if (!k) return;
				const { selectionStart: a, selectionEnd: b, value } = ta;
				const sel = value.slice(a, b) || { b: 'texto', i: 'texto', a: 'texto del enlace', ul: 'elemento', h: 'Subtítulo' }[k]!;
				const lineStart = value.lastIndexOf('\n', a - 1) + 1;
				let out = '';
				if (k === 'b') out = `**${sel}**`;
				if (k === 'i') out = `*${sel}*`;
				if (k === 'a') out = `[${sel}](https://)`;
				if (k === 'ul') out = sel.split('\n').map((l) => `- ${l}`).join('\n');
				if (k === 'h') out = `### ${sel}`;
				const pre = (k === 'ul' || k === 'h') && a !== lineStart ? '\n' : '';
				ta.setRangeText(pre + out, a, b, 'end');
				ta.focus();
				ta.dispatchEvent(new Event('input'));
			});
			return el;
		}
		case 'image':
			return imageField(f, path, ownerPath);
		case 'refs': {
			const sel: string[] = Array.isArray(v) ? v : [];
			const opts = f.options();
			// Lo marcado que ya no existe (p. ej. se borró ese taller) se enseña igualmente para poder desmarcarlo
			for (const id of sel) if (!opts.some((o) => o.value === id)) opts.push({ value: id, label: id, sub: 'ya no existe' });
			const el = wrapField(f, `<div class="f-refs">${opts.map((o) => `
				<label><input type="checkbox" value="${esc(o.value)}" ${sel.includes(o.value) ? 'checked' : ''}><span>${esc(o.label)}${o.sub ? ` <small>(${esc(o.sub)})</small>` : ''}</span></label>`).join('')
				|| '<p class="f-h">Todavía no hay otros talleres creados. Crea uno con «+ Nuevo taller» y luego márcalo aquí.</p>'}</div>`);
			el.querySelector('.f-refs')!.addEventListener('change', () => {
				// se guardan en el orden de la lista
				setAt(path, [...el.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value));
				schedule();
			});
			return el;
		}
		case 'check': {
			const el = h(`<label class="f f-check"><input type="checkbox" ${v ? 'checked' : ''}><span class="f-l">${esc(f.label)}</span></label>`);
			if (f.hint) el.append(h(`<small class="f-h">${esc(f.hint)}</small>`));
			el.querySelector('input')!.addEventListener('change', (e) => { setAt(path, (e.target as HTMLInputElement).checked); schedule(); });
			return el;
		}
		case 'select': {
			const opts = f.options();
			if (v && !opts.some((o) => o.value === v)) opts.push({ value: v, label: v });
			const el = wrapField(f, `<select class="f-in">${opts.map((o) => `<option value="${esc(o.value)}"${o.value === (v ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`);
			el.querySelector('select')!.addEventListener('change', (e) => { setAt(path, (e.target as HTMLSelectElement).value); schedule(); });
			return el;
		}
		case 'tags': {
			const picker = tagPicker(f.group, Array.isArray(v) ? v : [], f.placeholder ?? 'Añadir…', (val) => { setAt(path, val); schedule(); });
			return wrapField(f, picker);
		}
		case 'list':
			return listField(f, path, false);
		case 'images':
			return imagesField(f, path);
	}
}

const thumb = (p: string) => {
	if (!p) return '<span class="f-thumb-empty">Sin archivo</span>';
	const src = asset(p, ctx());
	return /\.(mp4|webm|mov)$/i.test(p)
		? `<video src="${esc(src)}" muted playsinline data-path="${esc(p)}" onerror="__img(this)"></video>`
		: `<img src="${esc(src)}" alt="" data-path="${esc(p)}" onerror="__img(this)">`;
};

async function upload(files: File[], path: string, f: { maxSize?: number; key: string }): Promise<string[]> {
	const out: string[] = [];
	for (const [i, file] of files.entries()) {
		status(`Procesando ${files.length > 1 ? `${i + 1}/${files.length} ` : ''}${esc(file.name)}…`, 'busy');
		try {
			out.push(await processFile(file, K.mediaFolder(K.normalize(data)), nameHint(path, f.key), f.maxSize));
		} catch (err: any) {
			status(esc(err.message || 'No se pudo procesar el archivo.'), 'error');
			return out;
		}
	}
	status(out.length ? 'Archivo listo. Se subirá al guardar.' : '');
	return out;
}

/* ───────────── Aviso de formato al poner una foto ───────────── */

const FORMATOS = {
	retrato: { ratios: [2 / 3], nombre: 'vertical 2:3', ejemplo: '1200 × 1800 px', efecto: 'se verá recortada por arriba y abajo o por los lados', minimo: 600 },
	cartel: { ratios: [Math.SQRT2, Math.SQRT1_2], nombre: 'A3 (horizontal o vertical)', ejemplo: '2000 × 1414 px', efecto: 'en las tarjetas se verá con bandas a los lados', minimo: 900 },
} as const;

/** Describe una proporción de forma legible: 1,41 → "A3 horizontal", 0,67 → "2:3 vertical"… */
function proporcion(r: number) {
	const conocidas: [number, string][] = [[Math.SQRT2, 'A3 horizontal'], [Math.SQRT1_2, 'A3 vertical'], [2 / 3, '2:3 vertical'], [3 / 2, '3:2 horizontal'], [4 / 5, '4:5 vertical'], [1, 'cuadrada'], [16 / 9, '16:9 horizontal'], [4 / 3, '4:3 horizontal'], [3 / 4, '3:4 vertical']];
	const [, n] = conocidas.reduce((a, b) => (Math.abs(b[0] / r - 1) < Math.abs(a[0] / r - 1) ? b : a));
	return n;
}

async function comprobarFormato(f: Extract<Field, { type: 'image' }>, p: string) {
	const fm = f.formato && FORMATOS[f.formato];
	if (!fm || VID_RE.test(p)) return;
	const im = new Image();
	im.src = asset(p, ctx());
	await im.decode().catch(() => {});
	if (!im.naturalWidth) return;
	const [w, h] = [im.naturalWidth, im.naturalHeight];
	const r = w / h;
	const avisos: string[] = [];
	if (!fm.ratios.some((x) => Math.abs(r / x - 1) < 0.06)) avisos.push(`tiene otra proporción (${w} × ${h} px, ${proporcion(r)}): lo recomendado es <b>${fm.nombre}</b>, por ejemplo ${fm.ejemplo}, y si no ${fm.efecto}`);
	if (Math.min(w, h) < fm.minimo) avisos.push(`es pequeña (${w} × ${h} px) y puede verse borrosa`);
	if (avisos.length) status(`⚠ Esta imagen ${avisos.join('; además, ')}. Puedes dejarla o poner otra.`, 'error');
}

function imageField(f: Extract<Field, { type: 'image' }>, path: string, ownerPath: string) {
	const v = getAt(path) as string;
	const el = wrapField(f, `
		<div class="f-img">
			<div class="f-thumb">${thumb(v)}</div>
			<div class="f-img-a">
				<button type="button" class="adm-b" data-up>${v ? 'Cambiar' : f.media ? 'Subir imagen o vídeo' : 'Subir foto'}</button>
				<button type="button" class="adm-b adm-b-ghost" data-pick>Elegir una ya subida</button>
				${v ? '<button type="button" class="adm-b adm-b-ghost" data-clear>Quitar</button>' : ''}
				${v ? `<code title="${esc(v)}">${esc(v.split('/').pop())}</code>` : ''}
			</div>
		</div>`);
	const poner = (p: string) => {
		setAt(path, p);
		renderPage();
		open(current ?? ownerPath, false);
		comprobarFormato(f, p);
	};
	el.querySelector('[data-pick]')!.addEventListener('click', () => {
		const prev = el.querySelector('.f-pick');
		if (prev) { prev.remove(); return; }
		el.append(pickBox(f, filtro(nameHint(ownerPath, '')), poner));
	});
	el.querySelector('[data-up]')!.addEventListener('click', async () => {
		const files = await pickFiles({ media: f.media });
		if (!files.length) return;
		const [p] = await upload(files, ownerPath, f);
		if (p) poner(p);
	});
	el.querySelector('[data-clear]')?.addEventListener('click', () => { setAt(path, ''); renderPage(); open(current ?? ownerPath, false); });
	// arrastrar y soltar
	el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-drop'); });
	el.addEventListener('dragleave', () => el.classList.remove('is-drop'));
	el.addEventListener('drop', async (e) => {
		e.preventDefault(); el.classList.remove('is-drop');
		const files = [...(e.dataTransfer?.files ?? [])];
		if (!files.length) return;
		const [p] = await upload(files.slice(0, 1), ownerPath, f);
		if (p) poner(p);
	});
	return el;
}

/* ───────────── Elegir una foto ya subida ───────────── */

/** Texto del filtro normalizado (vacío si no hay nada escrito; slugify('') devuelve "archivo") */
const filtro = (s: string) => (s.trim() ? slugify(s) : '');
const IMG_RE = /\.(jpe?g|png|webp|gif|svg|avif)$/i;
const VID_RE = /\.(mp4|webm|mov)$/i;
type Carpeta = { carpeta: string; fotos: string[] };
const galerias = new Map<string, Promise<Carpeta[]>>();

/** Fotos ya subidas en la carpeta de este tipo de contenido (p. ej. fotos/miembros/<curso>/…), por subcarpetas. */
function fotosSubidas(base: string) {
	if (!galerias.has(base)) {
		galerias.set(base, (async () => {
			const nombres = await listDir(`public/${base}`);
			const sueltas = nombres.filter((n) => n.includes('.')).map((n) => `${base}/${n}`);
			const subs = nombres.filter((n) => !n.includes('.')).sort().reverse();
			const carpetas = await Promise.all(subs.map(async (s) => ({
				carpeta: s,
				fotos: (await listDir(`public/${base}/${s}`)).filter((n) => n.includes('.')).map((n) => `${base}/${s}/${n}`),
			})));
			return [...carpetas, ...(sueltas.length ? [{ carpeta: '(sin carpeta)', fotos: sueltas }] : [])];
		})());
	}
	return galerias.get(base)!;
}

function pickBox(f: Extract<Field, { type: 'image' }>, sugerencia: string, elegir: (p: string) => void) {
	const propia = K.mediaFolder(K.normalize(data));
	const base = propia.split('/').slice(0, -1).join('/') || propia;
	const el = h(`
		<div class="f-pick">
			<input class="f-in" type="search" placeholder="Filtrar por nombre de archivo…" value="${esc(sugerencia)}" autocomplete="off">
			<div class="f-pick-list"><p class="f-h">Cargando las fotos de ${esc(base)}…</p></div>
		</div>`);
	const $in = el.querySelector('input')!;
	const $list = el.querySelector<HTMLElement>('.f-pick-list')!;
	let todas: Carpeta[] = [];
	const vale = (p: string) => IMG_RE.test(p) || (!!f.media && VID_RE.test(p));
	const pintar = () => {
		const q = filtro($in.value);
		const grupos = todas
			.map((c) => ({ ...c, fotos: c.fotos.filter((p) => vale(p) && (!q || slugify(p.split('/').pop()!).includes(q))) }))
			.filter((c) => c.fotos.length)
			// primero la carpeta de lo que estás editando
			.sort((a, b) => Number(`${base}/${b.carpeta}` === propia) - Number(`${base}/${a.carpeta}` === propia));
		$list.innerHTML = grupos.map((c) => `
			<p class="f-pick-h">${esc(c.carpeta)} <span>${c.fotos.length}</span></p>
			<div class="f-pick-grid">${c.fotos.map((p) => `
				<button type="button" class="f-pick-i" data-p="${esc(p)}" title="${esc(p)}">
					${VID_RE.test(p) ? `<video src="${esc(asset(p, ctx()))}" muted preload="metadata" data-path="${esc(p)}" onerror="__img(this)"></video>` : `<img src="${esc(asset(p, ctx()))}" alt="" loading="lazy" decoding="async" data-path="${esc(p)}" onerror="__img(this)">`}
					<small>${esc(p.split('/').pop()!)}</small>
				</button>`).join('')}
			</div>`).join('')
			|| `<p class="f-h">${todas.length ? `No hay fotos que se llamen «${esc($in.value)}». Borra el filtro para verlas todas.` : 'Todavía no hay fotos subidas aquí.'}</p>`;
	};
	fotosSubidas(base).then((x) => {
		todas = x;
		const q = filtro($in.value);
		// La sugerencia (el nombre de la persona) solo se usa si coincide con alguna foto
		if (q && !todas.some((c) => c.fotos.some((p) => vale(p) && slugify(p.split('/').pop()!).includes(q)))) $in.value = '';
		pintar();
	}).catch((e) => { $list.innerHTML = `<p class="f-h">No se han podido cargar: ${authError(e)}</p>`; });
	$in.addEventListener('input', pintar);
	$list.addEventListener('click', (e) => {
		const p = (e.target as HTMLElement).closest<HTMLElement>('[data-p]')?.dataset.p;
		if (p) elegir(p);
	});
	return el;
}

function move(listPath: string, i: number, d: number) {
	const arr = getAt(listPath) as any[];
	const j = i + d;
	if (j < 0 || j >= arr.length) return null;
	[arr[i], arr[j]] = [arr[j], arr[i]];
	return j;
}

/* ───────────── Reutilizar (p. ej. personas de otros cursos) ───────────── */

const vacio = (x: any) => !x || !Object.values(x).some((v) => (Array.isArray(v) ? v.length : v));

type Ficha = { item: any; clave: string; titulo: string; sub: string; foto?: string };
const catalogos = new Map<Reutilizar, Promise<Ficha[]>>();
/** Todo lo de los demás documentos (el más reciente primero, sin repetir). Se carga una vez. */
function catalogo(r: Reutilizar) {
	if (!catalogos.has(r)) {
		catalogos.set(r, (async () => {
			const ids = existingIds.filter((x) => x !== docId).sort().reverse();
			const docs = await Promise.all(ids.map(async (id) => {
				const txt = await readFile(`${K.dir}/${id}.json`).catch(() => null);
				return txt ? K.normalize(JSON.parse(txt)) : null;
			}));
			const out = new Map<string, Ficha>();
			for (const d of docs) if (d) for (const it of r.todos(d)) {
				const clave = r.clave(it);
				if (!clave) continue;
				const ya = out.get(clave);
				if (!ya) { out.set(clave, { item: { ...it }, clave, ...r.ficha(it, d) }); continue; }
				// Ya está (de un curso más reciente): si allí le faltaba algo (p. ej. la foto), se toma del anterior
				for (const [k, v] of Object.entries(it)) if (ya.item[k] === '' && typeof v === 'string' && v) ya.item[k] = v;
				ya.foto ||= r.ficha(ya.item, d).foto;
			}
			return [...out.values()];
		})());
	}
	return catalogos.get(r)!;
}

function reuseBox(r: Reutilizar, path: string) {
	const el = h(`
		<div class="f-reuse">
			<p class="f-reuse-h">¿Ya estuvo en ${esc(r.donde)}? Búscala y se añade con sus fotos y su rol, que luego puedes cambiar.</p>
			<input class="f-in" type="search" placeholder="Buscar en ${esc(r.donde)}…" autocomplete="off">
			<div class="f-reuse-list"><p class="f-h">Cargando…</p></div>
			<p class="f-reuse-o">Si es nueva, rellena sus datos aquí abajo.</p>
		</div>`);
	const $in = el.querySelector('input')!;
	const $list = el.querySelector<HTMLElement>('.f-reuse-list')!;
	let todas: Ficha[] = [];
	const pintar = () => {
		const ya = new Set(r.todos(K.normalize(data)).map(r.clave));
		const q = r.clave({ nombre: $in.value });
		const res = todas.filter((f) => !ya.has(f.clave) && (!q || f.clave.includes(q))).slice(0, 8);
		$list.innerHTML = res.map((f, i) => `
			<button type="button" class="f-reuse-i" data-i="${todas.indexOf(f)}">
				<span class="f-thumb">${thumb(f.foto ?? '')}</span>
				<span><b>${esc(f.titulo)}</b><small>${esc(f.sub)}</small></span>
				<span class="f-reuse-add">${i === 0 && q ? '↵ ' : ''}Añadir</span>
			</button>`).join('')
			|| `<p class="f-h">${todas.length ? (q ? 'No hay nadie con ese nombre en otros cursos.' : 'Ya están todas en este curso.') : `No hay nadie en ${esc(r.donde)}.`}</p>`;
	};
	const elegir = (f: Ficha) => {
		setAt(path, r.copia(f.item));
		if (Array.isArray(f.item.roles)) tagStore.seed('roles', f.item.roles);
		renderPage();
		open(path, false);
		status(`Se ha añadido a <b>${esc(f.titulo)}</b> con sus fotos. Cambia su rol si hace falta.`, 'ok');
	};
	catalogo(r).then((x) => { todas = x; pintar(); }).catch((e) => { $list.innerHTML = `<p class="f-h">No se ha podido cargar: ${authError(e)}</p>`; });
	$in.addEventListener('input', pintar);
	$in.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const first = $list.querySelector<HTMLElement>('[data-i]');
		if (first && $in.value.trim()) elegir(todas[Number(first.dataset.i)]);
	});
	$list.addEventListener('click', (e) => {
		const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i;
		if (i !== undefined) elegir(todas[Number(i)]);
	});
	return el;
}

function listField(f: ListField, path: string, standalone: boolean) {
	const arr = (getAt(path) as any[]) ?? [];
	const el = wrapField(f, `
		<div class="f-list">
			${arr.map((x, i) => `
			<div class="f-row">
				<button type="button" class="f-row-go" data-go="${path}.${i}"><span class="idx">${pad(i + 1)}</span><span>${esc(f.item.title(x, i))}</span><span class="f-row-arr">›</span></button>
				<button type="button" class="f-row-b" data-mv="${i}:-1" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
				<button type="button" class="f-row-b" data-mv="${i}:1" ${i === arr.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
			</div>`).join('') || '<p class="f-empty">Todavía no hay ninguno.</p>'}
			<button type="button" class="adm-b f-add" data-addlist>+ ${esc(f.addLabel)}</button>
			${f.reutilizar ? `<small class="f-h">Al añadir, puedes buscar a alguien de ${esc(f.reutilizar.donde)} y se añade con sus fotos.</small>` : ''}
		</div>`);
	el.classList.toggle('f-standalone', standalone);
	el.addEventListener('click', (e) => {
		const t = e.target as HTMLElement;
		const go = t.closest<HTMLElement>('[data-go]')?.dataset.go;
		if (go) return open(go);
		const mv = t.closest<HTMLElement>('[data-mv]')?.dataset.mv;
		if (mv) { const [i, d] = mv.split(':').map(Number); move(path, i, d); renderPage(); open(current!, false); return; }
		if (t.closest('[data-addlist]')) addTo(path);
	});
	return el;
}

function imagesField(f: Extract<Field, { type: 'images' }>, path: string) {
	const arr = (getAt(path) as string[]) ?? [];
	const el = wrapField(f, `
		<div class="f-gal">
			${arr.map((p, i) => `<div class="f-gal-i"><div class="f-thumb">${thumb(p)}</div>
				<div class="f-gal-a"><button type="button" data-mv="${i}:-1" ${i === 0 ? 'disabled' : ''} title="Mover antes">←</button><button type="button" data-mv="${i}:1" ${i === arr.length - 1 ? 'disabled' : ''} title="Mover después">→</button><button type="button" data-rm="${i}" title="Quitar">✕</button></div></div>`).join('')}
			<button type="button" class="f-gal-add" data-addimgs>+ Añadir fotos<small>o arrástralas aquí</small></button>
		</div>`);
	const addFiles = async (files: File[]) => {
		const paths = await upload(files, path, { ...f, key: 'galeria' });
		if (paths.length) { (getAt(path) as string[]).push(...paths); renderPage(); open(current ?? path, false); }
	};
	el.addEventListener('click', async (e) => {
		const t = e.target as HTMLElement;
		const mv = t.closest<HTMLElement>('[data-mv]')?.dataset.mv;
		if (mv) { const [i, d] = mv.split(':').map(Number); move(path, i, d); renderPage(); open(current!, false); return; }
		const rm = t.closest<HTMLElement>('[data-rm]')?.dataset.rm;
		if (rm) { (getAt(path) as string[]).splice(Number(rm), 1); renderPage(); open(current!, false); return; }
		if (t.closest('[data-addimgs]')) addFiles(await pickFiles({ multiple: true }));
	});
	el.addEventListener('dragover', (e) => e.preventDefault());
	el.addEventListener('drop', (e) => { e.preventDefault(); addFiles([...(e.dataTransfer?.files ?? [])]); });
	return el;
}

function confirmButton(label: string, confirmLabel: string, onConfirm: () => void) {
	const b = h<HTMLButtonElement>(`<button type="button" class="adm-b adm-b-danger">${esc(label)}</button>`);
	b.addEventListener('click', () => {
		if (b.dataset.armed) return onConfirm();
		b.dataset.armed = '1';
		b.textContent = confirmLabel;
		setTimeout(() => { delete b.dataset.armed; b.textContent = label; }, 4000);
	});
	return b;
}

function itemActions(listPath: string, index: number) {
	const arr = getAt(listPath) as any[];
	const el = h(`<div class="adm-actions">
		<button type="button" class="adm-b" data-mv="-1" ${index === 0 ? 'disabled' : ''}>↑ Mover antes</button>
		<button type="button" class="adm-b" data-mv="1" ${index === arr.length - 1 ? 'disabled' : ''}>↓ Mover después</button>
	</div>`);
	el.addEventListener('click', (e) => {
		const d = (e.target as HTMLElement).closest<HTMLElement>('[data-mv]')?.dataset.mv;
		if (!d) return;
		const j = move(listPath, index, Number(d));
		if (j !== null) { renderPage(); open(`${listPath}.${j}`); }
	});
	el.append(confirmButton('Eliminar', '¿Seguro? Pulsa otra vez', () => {
		arr.splice(index, 1);
		renderPage();
		open(listPath.split('.').slice(0, -1).join('.'));
	}));
	return el;
}

function rootExtras() {
	const el = h(`<div class="adm-extras"></div>`);
	if (isNew && K.copiar && prevDoc) {
		const b = h<HTMLButtonElement>(`<button type="button" class="adm-b adm-b-wide">⧉ ${esc(K.copiar.label(prevDoc))}</button>`);
		b.addEventListener('click', () => {
			data = K.copiar!.apply(K.normalize(data), prevDoc);
			renderPage();
			open('');
			status('Copiado. Ahora cambia, quita o añade lo que haga falta.', 'ok');
		});
		el.append(h(`<p class="f-h">¿Se parece al anterior? Empieza con una copia y ajusta lo que cambie.</p>`), b);
	}
	const ed = !isNew && docId ? K.nuevaEdicion?.(K.normalize(data), docId) : undefined;
	if (ed) {
		el.append(
			h(`<p class="f-h">¿Se repite (cada año, cada cuatrimestre…)? Crea una edición: saldrá agrupada debajo de esta en el menú y en esta página.</p>`),
			h(`<a class="adm-b adm-b-wide" href="${esc(joinBase(base, ed))}">+ Nueva edición</a>`),
		);
	}
	if (!isNew && docId) {
		el.append(h(`<p class="f-h adm-danger-note">Zona peligrosa</p>`));
		const motivo = K.noBorrar?.(docId);
		const ocultable = K.schema.fields.some((f) => f.key === 'oculto');
		if (motivo) el.append(h(`<p class="f-h">${esc(motivo)}</p>`));
		else {
			const zona = h(`<div><p class="f-h">Comprobando permisos…</p></div>`);
			el.append(zona);
			puedeBorrar().then((ok) => {
				zona.innerHTML = '';
				if (!ok) {
					zona.append(h(`<p class="f-h">Eliminar está reservado a la clave de administración.${ocultable ? ' Si ya no se usa, marca <b>Ocultar</b> arriba: desaparece de la web pero no se pierde.' : ''}</p>`));
					return;
				}
				zona.append(h(`<p class="f-h">${ocultable ? 'Si solo quieres quitarlo un tiempo, mejor marca <b>Ocultar</b>. ' : ''}Eliminar lo borra de la web al publicar. Si te equivocas, se puede recuperar desde el historial de GitHub.</p>`));
				zona.append(confirmButton(`Eliminar ${K.titulo(K.normalize(data))} por completo`, `Pulsa otra vez para eliminar ${K.titulo(K.normalize(data))}`, () => removeDoc()));
			});
		}
	}
	return el;
}

/* ───────────── Añadir ───────────── */

async function addTo(listPath: string) {
	const c = chain(listPath);
	const node = c[c.length - 1];
	if (node.type !== 'list' || node.path !== listPath) return;
	if (node.field.type === 'images') {
		const files = await pickFiles({ multiple: true });
		const paths = await upload(files, listPath, { ...node.field, key: 'galeria' });
		if (paths.length) { (getAt(listPath) as string[]).push(...paths); renderPage(); open(listPath); }
		return;
	}
	const arr = getAt(listPath) as any[];
	arr.push(node.field.newItem());
	renderPage();
	open(`${listPath}.${arr.length - 1}`);
}

/* ───────────── Guardar y publicar ───────────── */

function authError(e: unknown) {
	if (e instanceof GitHubError && (e.status === 401 || e.status === 403)) {
		return `GitHub ha rechazado la sesión (${esc(e.message)}). <a href="${joinBase(base, 'admin')}">Vuelve a iniciar sesión</a>.`;
	}
	return esc((e as Error)?.message || 'Error desconocido.');
}

async function save() {
	if (saving || !K) return;
	const d = K.normalize(data);
	const err = K.validate(d);
	if (err) { status(err, 'error'); open(''); return; }
	let id = K.fileId(d, isNew ? null : docId);
	if ((isNew || id !== docId) && existingIds.includes(id)) {
		if (K.kind === 'miembros' || K.kind === 'cybertech') {
			status(`Ya existe ${K.kind === 'miembros' ? 'el curso' : 'la edición'} ${esc(id)}. Cambia el ${K.kind === 'miembros' ? 'curso' : 'año'}.`, 'error');
			open('');
			return;
		}
		// Título repetido en una entrada nueva: se numera la dirección (rr-8-2, rr-8-3…)
		let n = 2;
		while (existingIds.includes(`${id}-${n}`)) n++;
		id = `${id}-${n}`;
	}
	const json = `${JSON.stringify(d, null, 2)}\n`;
	const changes: FileChange[] = [{ path: `${K.dir}/${id}.json`, text: json }];
	if (!isNew && docId && id !== docId) changes.push({ path: `${K.dir}/${docId}.json`, delete: true });
	const used = [...pending.keys()].filter((p) => json.includes(JSON.stringify(p)));
	for (const p of used) changes.push({ path: `public/${p}`, bytes: pending.get(p)!.bytes });
	if (tagStore.dirty) changes.push({ path: 'src/data/etiquetas.json', text: `${JSON.stringify(tagStore.data, null, 2)}\n` });

	saving = true;
	refreshBar();
	status(`Guardando${used.length ? ` (${used.length} ${used.length === 1 ? 'archivo' : 'archivos'})` : ''}…`, 'busy');
	try {
		const sha = await commit(changes, `${isNew ? 'Crear' : 'Actualizar'} ${K.titulo(d)} desde la web`);
		for (const p of used) { uploaded.set(p, pending.get(p)!.url); pending.delete(p); }
		data = d;
		savedJson = JSON.stringify(d);
		tagStore.dirty = false;
		if (!existingIds.includes(id)) existingIds.push(id);
		if (docId && docId !== id) existingIds = existingIds.filter((x) => x !== docId);
		docId = id;
		const wasNew = isNew;
		isNew = false;
		if (root) { root.dataset.kind = K.kind; root.dataset.id = id; }
		refreshBar();
		watchDeploy(sha, joinBase(base, K.url(id)), wasNew || location.pathname.replace(/\/$/, '') !== joinBase(base, K.url(id)).replace(/\/$/, ''));
		if (current === '') open('', false);
	} catch (e) {
		status(`No se ha podido guardar: ${authError(e)}`, 'error');
	} finally {
		saving = false;
		refreshBar();
	}
}

async function watchDeploy(sha: string, url: string, showLink: boolean) {
	const link = showLink ? ` <a href="${url}">Ver la página</a>` : '';
	if (sha === 'local') {
		status(`Guardado en tus archivos ✓ Para publicarlo, haz commit y súbelo a GitHub.${link}`, 'ok');
		return;
	}
	status('Guardado ✓ · Publicando en la web…', 'busy');
	const t0 = Date.now();
	while (Date.now() - t0 < 10 * 60_000) {
		await new Promise((r) => setTimeout(r, 7000));
		if (isDirty() || saving) return;
		const s = await deployStatus(sha);
		if (s === null) { status(`Guardado ✓ La web pública se actualizará en 1–2 minutos.${link}`, 'ok'); return; }
		if (s === 'publicado') { status(`Publicado ✓ Ya está en la web.${link}`, 'ok'); return; }
		if (s === 'error') { status('Guardado ✓ pero la publicación ha fallado. Revisa la pestaña "Actions" del repositorio en GitHub.', 'error'); return; }
	}
}

async function removeDoc() {
	if (!docId) return;
	if (!(await puedeBorrar())) { status('Eliminar está reservado a la clave de administración.', 'error'); return; }
	status('Eliminando…', 'busy');
	try {
		await commit([{ path: `${K.dir}/${docId}.json`, delete: true }], `Eliminar ${K.titulo(K.normalize(data))} desde la web`);
		savedJson = JSON.stringify(data);
		tagStore.dirty = false;
		window.onbeforeunload = null;
		status('Eliminado. Desaparecerá de la web en 1–2 minutos. Volviendo al inicio…', 'ok');
		setTimeout(() => (location.href = base), 2500);
	} catch (e) {
		status(`No se ha podido eliminar: ${authError(e)}`, 'error');
	}
}

/* ───────────── Arranque ───────────── */

async function boot() {
	const kindAttr = root?.dataset.kind;
	const kindKey = kindAttr === 'nuevo' ? new URLSearchParams(location.search).get('tipo') : kindAttr;
	const kind = kindKey ? kinds[kindKey] : undefined;
	if (!root || !kind) {
		status('Abre cualquier página de Miembros, Cybertech, Proyectos, Talleres, Servicios, Noticias o un apartado de Conócenos para editarla, o crea una nueva desde los menús.');
		return;
	}
	K = kind;
	status('Cargando la última versión…', 'busy');
	try {
		const [tagsText, files] = await Promise.all([readFile('src/data/etiquetas.json'), listDir(K.dir)]);
		tagStore.data = tagsText ? JSON.parse(tagsText) : {};
		existingIds = files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

		if (kindAttr === 'nuevo') {
			isNew = true;
			data = K.nuevo(existingIds);
			const prevId = K.previo ? K.previo(existingIds, data) : [...existingIds].sort().pop();
			const prevTxt = prevId ? await readFile(`${K.dir}/${prevId}.json`) : null;
			prevDoc = prevTxt ? K.normalize(JSON.parse(prevTxt)) : null;
			savedJson = JSON.stringify(data);
			document.title = `${K.titulo(data)} · Reset`;
		} else {
			docId = root.dataset.id!;
			const txt = await readFile(`${K.dir}/${docId}.json`);
			if (txt === null) throw new Error('Este contenido ya no existe en el repositorio (¿lo ha borrado alguien?).');
			data = K.normalize(JSON.parse(txt));
			savedJson = JSON.stringify(data);
		}
		if (K.kind === 'miembros') {
			const roles = (d: any) => d?.secciones?.flatMap((s: any) => s.miembros.flatMap((m: any) => m.roles)) ?? [];
			tagStore.seed('roles', [...roles(data), ...roles(prevDoc)]);
		}
		if (Array.isArray(data.etiquetas)) tagStore.seed(K.kind, data.etiquetas);
		btn('general').hidden = false;
		btn('save').hidden = false;
		renderPage();
		if (isNew) {
			open('');
			const que = K.kind === 'miembros' ? 'del nuevo curso' : K.kind === 'cybertech' ? 'de la nueva edición' : K.nombre === 'noticia' ? 'de la nueva noticia' : `del nuevo ${K.nombre}`;
			status(`Rellena los datos ${que} y pulsa <b>${btn('save').textContent}</b>.`);
		}
		else status('Haz clic en cualquier bloque para editarlo.');
	} catch (e) {
		status(`No se ha podido cargar: ${authError(e)}`, 'error');
	}
}

boot();
