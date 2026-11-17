/**
 * MODO EDICIÓN
 * Se carga solo si hay sesión iniciada (ver /admin). Convierte la página real en editable:
 *  - clic en cualquier bloque → se abre el panel lateral con sus campos
 *  - botones "+" para añadir personas, categorías, pruebas, fotos…
 *  - la página se vuelve a dibujar en directo con el mismo código que la web publicada
 *  - "Guardar y publicar" hace un commit en GitHub y la web se actualiza sola
 */
import './admin.css';
import { clearToken, readFile, listDir, listTree, commit, deployStatus, rawUrl, isLocal, GitHubError, type FileChange } from './github';
import { sesion, puedeCrear, puedeEditar, puedeEliminar, motivoNoEditar, nombreNivel, AccesoRevocado } from './permisos';
import { kinds, type DocKind, type Field, type ObjSchema, type Reutilizar } from './schema';
import { pending, processFile, pickFiles } from './media';
import { tagStore, tagPicker } from './tags';
import * as R from './roles';
import type { Curso } from '../lib/render';
import { esc, asset, joinBase, slugify, indiceFotos, ordenarMiembros } from '../lib/render';

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
const ctx = () => ({
	base, admin: true, resolve: (p: string) => pending.get(p)?.url ?? uploaded.get(p),
	// Miembros: quien no tiene foto este curso se ve con la de otro curso suyo (como en la web)
	fotosDe: otrosCursos.length && data?.curso !== undefined ? indiceFotos(otrosCursos, String(data.curso)) : undefined,
	hoverDe: otrosCursos.length && data?.curso !== undefined ? indiceFotos(otrosCursos, String(data.curso), 'fotoHover') : undefined,
});

/* ───────────── Estado ───────────── */

let K: DocKind;
let data: any;
let savedJson = '';
let docId: string | null = null;
let isNew = false;
let existingIds: string[] = [];
let prevDoc: any = null;
let prevId: string | undefined; // plantilla propuesta por defecto al crear algo nuevo
let current: string | null = null; // ruta abierta en el panel ("" = datos generales)
let saving = false;
let otrosCursos: Curso[] = []; // Miembros: los demás cursos, del más reciente al más antiguo

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
	<div class="adm-bar-l"><span class="adm-dot"></span><b>Modo edición</b>${isLocal() ? '<span class="adm-local" title="Los cambios se guardan en los archivos de este ordenador, no en GitHub">LOCAL</span>' : ''}<a class="adm-quien" href="${base}admin" hidden></a><span class="adm-doc"></span></div>
	<div class="adm-status" aria-live="polite"></div>
	<div class="adm-bar-r">
		<button type="button" class="adm-b" data-bar="general" hidden>Datos generales</button>
		<button type="button" class="adm-b" data-bar="discard" hidden>Descartar cambios</button>
		<button type="button" class="adm-b adm-b-main" data-bar="save" hidden>${isLocal() ? 'Guardar en este ordenador' : 'Guardar y publicar'}</button>
		<a class="adm-b adm-b-ghost adm-fotos" href="${base}fototeca" title="Todas las fotos de la web: ver dónde se usan, subir y eliminar">Fotos</a>
		<button type="button" class="adm-b adm-b-ghost" data-bar="logout" title="Cerrar sesión de editor">Salir</button>
	</div>
</div>`);
document.body.append(bar);
document.body.classList.add('adm-on');
const $status = bar.querySelector<HTMLElement>('.adm-status')!;
const $doc = bar.querySelector<HTMLElement>('.adm-doc')!;
const btn = (k: string) => bar.querySelector<HTMLButtonElement>(`[data-bar="${k}"]`)!;

/* ───────────── Quién eres y qué puedes hacer ───────────── */

let soloLectura = false; // esta página no la puede editar tu nivel
sesion().then((s) => {
	const q = bar.querySelector<HTMLAnchorElement>('.adm-quien')!;
	q.textContent = `${s.login === 'local' ? '' : s.login.startsWith('codigo:') ? `${s.nombre} · ` : `@${s.login} · `}${nombreNivel(s.nivel)}`;
	q.title = `Tu nivel de acceso: ${nombreNivel(s.nivel)} (${s.motivo}). Pulsa para ver los detalles.`;
	q.hidden = false;
	// Los «+ Nuevo…» de los menús y las páginas: solo los que tu nivel puede crear
	document.querySelectorAll<HTMLAnchorElement>('a[href*="editar?tipo="]').forEach((a) => {
		const tipo = new URL(a.href, location.href).searchParams.get('tipo') ?? '';
		if (!puedeCrear(s, tipo)) (a.closest<HTMLElement>('li.sub-add') ?? a).hidden = true;
	});
}).catch(() => {});

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
	syncBarraPagina();
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
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && K && !soloLectura) { e.preventDefault(); save(); }
	if (e.key === 'Escape' && current !== null && !(e.target as HTMLElement).closest('.f-tags')) close();
});

/* ───────────── Vista previa ───────────── */

let raf = 0;
function renderPage() {
	cancelAnimationFrame(raf);
	if (!root || !K) return;
	// Lo que se actualiza solo (en la portada: Cybertech, noticias…) no lo dibuja el editor: se conserva tal cual
	const fijos = new Map([...root.querySelectorAll<HTMLElement>('[data-keep]')].map((el) => [el.dataset.keep!, el]));
	root.innerHTML = K.render(K.normalize(data), ctx());
	root.querySelectorAll<HTMLElement>('[data-keep]').forEach((hueco) => { const el = fijos.get(hueco.dataset.keep!); if (el) hueco.replaceWith(el); });
	document.dispatchEvent(new Event('reset:rendered'));
	highlight(false);
	refreshBar();
}
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderPage); refreshBar(); };

function highlight(scroll: boolean) {
	root?.querySelectorAll('.adm-current').forEach((el) => el.classList.remove('adm-current'));
	if (current === null) return;
	// Avisar a la página de qué se está editando (el carrusel enseña esa diapositiva)
	document.dispatchEvent(new CustomEvent('reset:editando', { detail: current }));
	const el = root?.querySelector(`[data-edit="${current}"]`);
	el?.classList.add('adm-current');
	if (scroll && el) {
		const r = el.getBoundingClientRect();
		if (r.top < 90 || r.top > innerHeight * 0.7) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
}

root?.addEventListener('click', (e) => {
	if (!K || soloLectura) return;
	const t = e.target as HTMLElement;
	const add = t.closest<HTMLElement>('[data-add]');
	if (add) { e.preventDefault(); addTo(add.dataset.add!, add.dataset.nuevo ? JSON.parse(add.dataset.nuevo) : undefined); return; }
	const ed = t.closest<HTMLElement>('[data-edit]');
	if (ed) { e.preventDefault(); const pista = pistaDe(t, ed); open(ed.dataset.edit!, false); irAlCampo(pista); }
});

/* ───────────── Ir al campo de lo que se ha pulsado ───────────── */

/** Qué se ha pulsado en la página: un campo indicado (data-campo), una foto (su ruta) o un texto */
type Pista = { campo?: string; foto?: string; texto?: string; esFoto?: boolean };
function pistaDe(t: HTMLElement, ed: HTMLElement): Pista {
	const dentro = <T extends HTMLElement>(x: T | null) => (x && ed.contains(x) ? x : null);
	const campo = dentro(t.closest<HTMLElement>('[data-campo]'))?.dataset.campo;
	// La ruta del marco (su foto principal, aunque se vea la de «al pasar el ratón» o una prestada de otro curso)
	const foto = dentro(t.closest<HTMLElement>('figure[data-path]') ?? t.closest<HTMLElement>('[data-path]'))?.dataset.path;
	const esFoto = !!dentro(t.closest<HTMLElement>('.frame'));
	const bloque = dentro(t.closest<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li,dt,dd,figcaption,blockquote,td,th,a,strong,em,b,i,span,small,time,label')) ?? t;
	const texto = bloque.innerText?.trim() ?? '';
	return { campo, foto, esFoto, texto: !esFoto && texto.length <= 400 ? texto : undefined };
}

/** Texto comparable: sin tildes, mayúsculas, enlaces ni símbolos de formato */
const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
	.replace(/https?:\/\/\S+/g, ' ').replace(/[*_#>`[\]()|~«»"“”:;.,!¡?¿-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Tras abrir el panel, lo lleva hasta el campo de lo que se ha pulsado (y pone ahí el cursor) */
function irAlCampo(p: Pista) {
	const campos = [...$body.querySelectorAll<HTMLElement>('[data-campo]')];
	const valor = (c: HTMLElement) => getAt(c.dataset.ruta!);
	let el = p.campo ? campos.find((c) => c.dataset.campo === p.campo) : undefined;
	if (!el && p.foto) el = campos.find((c) => { const v = valor(c); return v === p.foto || (Array.isArray(v) && v.includes(p.foto)); });
	if (!el && p.texto) {
		const q = plano(p.texto);
		let mejor = 0;
		if (q.length >= 2) for (const c of campos) {
			const v = valor(c);
			for (const x of Array.isArray(v) ? v : [v]) {
				if (typeof x !== 'string') continue;
				const px = plano(x);
				if (!px) continue;
				// igual > lo pulsado está dentro del campo (un párrafo de un texto) > el campo está dentro de lo pulsado
				const nota = px === q ? 3 : px.includes(q.slice(0, 80)) ? 2 : px.length >= 3 && q.includes(px) ? 1 : 0;
				if (nota > mejor) { mejor = nota; el = c; }
			}
		}
	}
	// Un hueco de foto vacío: al primer campo de foto
	if (!el && p.esFoto) el = campos.find((c) => c.querySelector('.f-img, .f-gal'));
	if (!el) return;
	const top = el.getBoundingClientRect().top - $body.getBoundingClientRect().top + $body.scrollTop - 24;
	$body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
	el.classList.remove('f-ir'); void el.offsetWidth; el.classList.add('f-ir');
	setTimeout(() => el!.classList.remove('f-ir'), 1800);
	const inp = el.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input:not([type=checkbox]):not([type=file]):not([type=search]), select');
	if (!inp) return;
	inp.focus({ preventScroll: true });
	// En un texto largo, el cursor va al párrafo pulsado
	if (inp instanceof HTMLTextAreaElement && p.texto) {
		const palabras = p.texto.split(/\s+/).slice(0, 4).join(' ').toLowerCase();
		const i = inp.value.toLowerCase().indexOf(palabras);
		if (i >= 0) {
			inp.setSelectionRange(i, i);
			const lh = parseFloat(getComputedStyle(inp).lineHeight) || 20;
			inp.scrollTop = Math.max(0, (inp.value.slice(0, i).split('\n').length - 2) * lh);
		}
	} else if (inp instanceof HTMLInputElement) inp.setSelectionRange?.(inp.value.length, inp.value.length);
}

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
		const obj = getAt(target.path) ?? data;
		for (const f of target.schema.fields) {
			if (f.si && !f.si(obj)) continue;
			const ruta = target.path ? `${target.path}.${f.key}` : f.key;
			const fe = field(f, ruta, target.path);
			fe.dataset.campo = f.key; fe.dataset.ruta = ruta; // para ir a este campo al pulsar en la página
			$body.append(fe);
		}
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
		case 'rango': {
			const val = Number(v) || f.porDefecto;
			const el = wrapField(f, `<div class="f-rango"><input type="range" min="${f.min}" max="${f.max}" step="${f.paso ?? 1}" value="${val}"><output>${val}${esc(f.unidad ?? '')}</output><button type="button" class="f-rango-x" title="Volver al de siempre">↺</button></div>`);
			const r = el.querySelector<HTMLInputElement>('input[type=range]')!, o = el.querySelector('output')!;
			const poner = (n: number) => { r.value = String(n); o.textContent = `${n}${f.unidad ?? ''}`; setAt(path, n); schedule(); };
			r.addEventListener('input', () => poner(Number(r.value)));
			el.querySelector('.f-rango-x')!.addEventListener('click', () => poner(f.porDefecto));
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
			const el = wrapField(f, `${opts.length > 8 ? `<input class="f-in f-buscar" type="search" placeholder="Buscar… (Enter marca el primero)" autocomplete="off">` : ''}<div class="f-refs"${f.columnas ? ` style="grid-template-columns: repeat(${f.columnas}, 1fr)"` : ''}>${opts.map((o) => `
				<label><input type="checkbox" value="${esc(o.value)}" ${sel.includes(o.value) ? 'checked' : ''}><span>${esc(o.label)}${o.sub ? ` <small>(${esc(o.sub)})</small>` : ''}</span></label>`).join('')
				|| '<p class="f-h">Todavía no hay otros talleres creados. Crea uno con «+ Nuevo taller» y luego márcalo aquí.</p>'}</div>`);
			el.querySelector('.f-refs')!.addEventListener('change', () => {
				// se guardan en el orden de la lista
				setAt(path, [...el.querySelectorAll<HTMLInputElement>('.f-refs input:checked')].map((i) => i.value));
				schedule();
			});
			buscador(el, '.f-refs > label', (primero) => {
				const c = primero.querySelector('input')!;
				c.checked = !c.checked;
				c.dispatchEvent(new Event('change', { bubbles: true }));
			});
			return el;
		}
		case 'check': {
			const el = h(`<label class="f f-check"><input type="checkbox" ${v ? 'checked' : ''}><span class="f-l">${esc(f.label)}</span></label>`);
			if (f.hint) el.append(h(`<small class="f-h">${esc(f.hint)}</small>`));
			el.querySelector('input')!.addEventListener('change', (e) => {
				const val = (e.target as HTMLInputElement).checked;
				setAt(path, val);
				f.alCambiar?.(ownerPath ? getAt(ownerPath) : data, val);
				if (f.reabrir && current !== null) { renderPage(); open(current, false); } else schedule();
			});
			return el;
		}
		case 'select': {
			const opts = f.options();
			if (v && !opts.some((o) => o.value === v)) opts.push({ value: v, label: v });
			const el = wrapField(f, `<select class="f-in">${opts.map((o) => `<option value="${esc(o.value)}"${o.value === (v ?? f.porDefecto ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`);
			el.querySelector('select')!.addEventListener('change', (e) => {
				setAt(path, (e.target as HTMLSelectElement).value);
				f.alCambiar?.(ownerPath ? getAt(ownerPath) : data, (e.target as HTMLSelectElement).value);
				if (f.reabrir && current !== null) { renderPage(); open(current, false); } else schedule();
			});
			return el;
		}
		case 'tags': {
			if (K.kind === 'miembros' && f.key === 'roles') return rolesField(f, path);
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

/** Fotos ya subidas bajo una carpeta (p. ej. fotos/miembros, o todas: fotos), agrupadas por carpeta. */
function fotosSubidas(base: string) {
	if (!galerias.has(base)) {
		galerias.set(base, (async () => {
			const porCarpeta = new Map<string, string[]>();
			for (const { path } of await listTree(`public/${base}`)) {
				const p = path.replace(/^public\//, '');
				const carpeta = p.split('/').slice(0, -1).join('/');
				if (!porCarpeta.has(carpeta)) porCarpeta.set(carpeta, []);
				porCarpeta.get(carpeta)!.push(p);
			}
			return [...porCarpeta].sort(([a], [b]) => b.localeCompare(a)).map(([carpeta, fotos]) => ({ carpeta, fotos: fotos.sort() }));
		})());
	}
	return galerias.get(base)!;
}

function pickBox(f: Extract<Field, { type: 'image' }>, sugerencia: string, elegir: (p: string) => void) {
	const propia = K.mediaFolder(K.normalize(data));
	const seccion = propia.split('/').slice(0, -1).join('/') || propia;
	let base = seccion;
	const el = h(`
		<div class="f-pick">
			<input class="f-in" type="search" placeholder="Filtrar por nombre de archivo o carpeta…" value="${esc(sugerencia)}" autocomplete="off">
			<label class="f-pick-todas"><input type="checkbox"> Buscar en todas las fotos de Reset (también las del archivo)</label>
			<div class="f-pick-list"><p class="f-h">Cargando las fotos…</p></div>
		</div>`);
	const $in = el.querySelector<HTMLInputElement>('input[type=search]')!;
	const $list = el.querySelector<HTMLElement>('.f-pick-list')!;
	let todas: Carpeta[] = [];
	const vale = (p: string) => IMG_RE.test(p) || (!!f.media && VID_RE.test(p));
	const pintar = () => {
		const q = filtro($in.value);
		const grupos = todas
			.map((c) => ({ ...c, fotos: c.fotos.filter((p) => vale(p) && (!q || slugify(p).includes(q))) }))
			.filter((c) => c.fotos.length)
			// primero la carpeta de lo que estás editando
			.sort((a, b) => Number(b.carpeta === propia) - Number(a.carpeta === propia));
		$list.innerHTML = grupos.map((c) => `
			<p class="f-pick-h">${esc(c.carpeta.replace(/^fotos\//, ''))} <span>${c.fotos.length}</span></p>
			<div class="f-pick-grid">${c.fotos.map((p) => `
				<button type="button" class="f-pick-i" data-p="${esc(p)}" title="${esc(p)}">
					${VID_RE.test(p) ? `<video src="${esc(asset(p, ctx()))}" muted preload="metadata" data-path="${esc(p)}" onerror="__img(this)"></video>` : `<img src="${esc(asset(p, ctx()))}" alt="" loading="lazy" decoding="async" data-path="${esc(p)}" onerror="__img(this)">`}
					<small>${esc(p.split('/').pop()!)}</small>
				</button>`).join('')}
			</div>`).join('')
			|| `<p class="f-h">${todas.length ? `No hay fotos que se llamen «${esc($in.value)}». Borra el filtro para verlas todas.` : 'Todavía no hay fotos subidas aquí.'}</p>`;
	};
	const cargar = (primera: boolean) => {
		$list.innerHTML = '<p class="f-h">Cargando las fotos…</p>';
		fotosSubidas(base).then((x) => {
			todas = x;
			const q = filtro($in.value);
			// La sugerencia (el nombre de la persona) solo se usa si coincide con alguna foto
			if (primera && q && !todas.some((c) => c.fotos.some((p) => vale(p) && slugify(p).includes(q)))) $in.value = '';
			pintar();
		}).catch((e) => { $list.innerHTML = `<p class="f-h">No se han podido cargar: ${authError(e)}</p>`; });
	};
	cargar(true);
	el.querySelector<HTMLInputElement>('.f-pick-todas input')!.addEventListener('change', (e) => {
		base = (e.target as HTMLInputElement).checked ? 'fotos' : seccion;
		cargar(false);
	});
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
			<p class="f-reuse-h">¿Ya estuvo en ${esc(r.donde)}? Búscala y se añade con sus fotos${K.kind === 'miembros' ? ' (y su cargo, si es de esta sección)' : ' y su rol, que luego puedes cambiar'}.</p>
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
		if (K.kind === 'miembros') { const [, si, , mj] = path.split('.').map(Number); R.alEntrar(data, si, mj); }
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
	// Miembros en orden automático: se listan como salen en la página y sin flechas
	const auto = ordenAutomatico(path);
	const filas = auto ? ordenarMiembros(auto.s).map(({ m, j }) => ({ x: m as any, i: j })) : arr.map((x, i) => ({ x, i }));
	const el = wrapField(f, `
		${arr.length > 8 ? `<input class="f-in f-buscar" type="search" placeholder="Buscar… (Enter abre el primero)" autocomplete="off">` : ''}
		${auto ? `<small class="f-h adm-orden-auto">Orden ${NOMBRE_ORDEN[auto.s.orden] ?? 'automático'}. Para colocarlas a mano, marca «Ordenar a mano» arriba.</small>` : ''}
		<div class="f-list">
			${filas.map(({ x, i }, k) => `
			<div class="f-row">
				<button type="button" class="f-row-go" data-go="${path}.${i}"><span class="idx">${pad(k + 1)}</span><span>${esc(f.item.title(x, i))}</span><span class="f-row-arr">›</span></button>
				${auto ? '' : `<button type="button" class="f-row-b" data-mv="${i}:-1" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
				<button type="button" class="f-row-b" data-mv="${i}:1" ${i === arr.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>`}
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
	buscador(el, '.f-list > .f-row', (primero) => primero.querySelector<HTMLElement>('[data-go]')!.click());
	return el;
}

/**
 * Buscador de una lista del panel: al escribir, deja solo lo que coincide (sin importar tildes ni mayúsculas).
 * Enter hace `alElegir` con el primero que queda.
 */
function buscador(el: HTMLElement, filas: string, alElegir: (primero: HTMLElement) => void) {
	const q = el.querySelector<HTMLInputElement>('.f-buscar');
	if (!q) return;
	const nada = h(`<p class="f-h f-buscar-nada" hidden>No hay nada que coincida.</p>`);
	q.after(nada);
	const visibles = () => [...el.querySelectorAll<HTMLElement>(filas)].filter((x) => !x.hidden);
	q.addEventListener('input', () => {
		const t = plano(q.value);
		el.querySelectorAll<HTMLElement>(filas).forEach((x) => { x.hidden = !!t && !plano(x.textContent ?? '').includes(t); });
		nada.hidden = !t || visibles().length > 0;
	});
	q.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; q.dispatchEvent(new Event('input')); }
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const [primero] = visibles();
		if (primero && q.value.trim()) { alElegir(primero); if (q.isConnected) { q.value = ''; q.dispatchEvent(new Event('input')); q.focus(); } }
	});
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

/** Miembros: la sección de una lista «secciones.N.miembros» si su orden es automático (entonces no se puede mover a nadie) */
function ordenAutomatico(listPath: string) {
	const m = listPath.match(/^secciones\.(\d+)\.miembros$/);
	if (K.kind !== 'miembros' || !m) return null;
	const s = (data as Curso).secciones[Number(m[1])];
	return s && !s.manual ? { s, path: `secciones.${m[1]}` } : null;
}
const NOMBRE_ORDEN: Record<string, string> = { cargo: 'por cargo', vocalia: 'por vocalía', alfabetico: 'alfabético' };

function itemActions(listPath: string, index: number) {
	const arr = getAt(listPath) as any[];
	const auto = ordenAutomatico(listPath);
	const el = h(`<div class="adm-actions">
		<button type="button" class="adm-b" data-mv="-1" ${index === 0 || auto ? 'disabled' : ''}>↑ Mover antes</button>
		<button type="button" class="adm-b" data-mv="1" ${index === arr.length - 1 || auto ? 'disabled' : ''}>↓ Mover después</button>
		${auto ? `<p class="f-h adm-orden-auto">«${esc(auto.s.titulo)}» va en orden ${NOMBRE_ORDEN[auto.s.orden] ?? 'automático'}. Para colocar a las personas a mano, <button type="button" class="adm-link" data-go="${auto.path}">marca «Ordenar a mano» en la sección</button>.</p>` : ''}
	</div>`);
	el.addEventListener('click', (e) => {
		const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
		if (go !== undefined) { open(go); return; }
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

/* ───────────── Miembros: cargos por sección y repaso rápido de personas ───────────── */

/** Ruta «secciones.1.miembros.4» → [1, 4] */
const posDe = (p: string) => { const x = p.split('.'); return [Number(x[1]), Number(x[3])] as const; };

function rolesField(f: Field, path: string) {
	const mp = path.replace(/\.roles$/, '');
	const [si, mj] = posDe(mp);
	const v = getAt(path);
	const picker = tagPicker('roles', Array.isArray(v) ? v : [], (f as any).placeholder ?? 'Añadir…', (val) => {
		setAt(path, val);
		const r = R.colocar(data, si, mj);
		if (r.movida) {
			renderPage();
			open(`secciones.${r.si}.miembros.${r.mj}`);
			status(val.length ? `Se ha movido a <b>${esc(r.movida)}</b> por su cargo.` : `Sin cargo: vuelve a <b>${esc(r.movida)}</b>.`, 'ok');
		} else { schedule(); pintarAviso(); }
	}, R.opcionesPicker(data, si, mj));
	const el = wrapField(f, picker);
	const $aviso = h(`<p class="f-aviso" hidden></p>`);
	el.insertBefore($aviso, picker);
	const pintarAviso = () => { const t = R.aviso(data, si, mj); $aviso.hidden = !t; $aviso.textContent = t ? `⚠ ${t}` : ''; };
	pintarAviso();
	return el;
}

/** El curso más reciente con personas (para empezar uno nuevo) */
const cursoAnterior = () => otrosCursos.find((c) => c.secciones.some((s) => s.miembros.length) && c.curso !== (data as Curso).curso);

/** Mete a todas las personas del curso anterior en la sección general, sin cargo */
function traerPersonas() {
	const prev = cursoAnterior();
	if (!prev) return 0;
	const d = data as Curso;
	if (!d.secciones.length) d.secciones.push({ titulo: 'Miembros', orden: 'alfabetico', manual: false, miembros: [] });
	const ya = new Set(d.secciones.flatMap((s) => s.miembros.map((m) => m.nombre.trim().toLowerCase())));
	const nuevas = R.personasDe(prev).filter((m) => !ya.has(m.nombre.trim().toLowerCase()));
	d.secciones[R.seccionBase(d)].miembros.push(...nuevas);
	return nuevas.length;
}

/** Repaso rápido: todas las personas del curso, con su cargo (se mueven solas de sección) y un botón para quitarlas */
function personasBox() {
	const el = h(`<div class="adm-personas"></div>`);
	const opcionesCargo = (actual: string[]) => {
		const secs = [...new Set([...R.seccionesConCargos(), ...(tagStore.list('roles').map(R.seccionDeRol).filter(Boolean) as string[])])];
		const grupos = secs.map((t) => `<optgroup label="${esc(t)}">${tagStore.list('roles').filter((r) => R.seccionDeRol(r) === t)
			.map((r) => `<option value="${esc(r)}"${actual.length === 1 && actual[0] === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</optgroup>`).join('');
		const varios = actual.length > 1 ? `<option value="" selected disabled>${esc(actual.join(' + '))}</option>` : '';
		return `<option value=""${actual.length ? '' : ' selected'}>Sin cargo</option>${varios}${grupos}`;
	};
	let filtro = '';
	const pintar = () => {
		const d = data as Curso;
		const total = d.secciones.reduce((n, s) => n + s.miembros.length, 0);
		const prev = cursoAnterior();
		el.innerHTML = `
			<p class="f-l">Personas de este curso <span class="adm-personas-n">${total}</span></p>
			${!total && prev ? `<button type="button" class="adm-b adm-b-wide" data-traer>Traer a las personas de ${esc(prev.curso)}</button><small class="f-h">Se añaden todas como miembros, sin cargo. Luego quitas a quien no siga y eliges los cargos.</small>` : ''}
			${total ? `<input class="f-in adm-personas-q" type="search" placeholder="Buscar persona…" value="${esc(filtro)}">` : ''}
			<div class="adm-personas-l">${d.secciones.map((s, si) => !s.miembros.length ? '' : `
				<p class="adm-personas-sec">${esc(s.titulo)} · ${s.miembros.length}</p>
				${s.miembros.map((m, mj) => ({ m, mj })).sort((a, b) => (s.orden !== 'manual' ? a.m.nombre.localeCompare(b.m.nombre, 'es') : 0)).map(({ m, mj }) => {
					const av = R.aviso(d, si, mj);
					return `
					<div class="adm-persona${av ? ' con-aviso' : ''}" data-p="${si}.${mj}" data-q="${esc(m.nombre.toLowerCase())}">
						<span class="f-thumb">${thumb(m.foto)}</span>
						<button type="button" class="adm-persona-n" data-go="secciones.${si}.miembros.${mj}" title="${esc(av || 'Abrir su ficha')}">${av ? '⚠ ' : ''}${esc(m.nombre || 'Sin nombre')}</button>
						<select class="f-in" aria-label="Cargo de ${esc(m.nombre)}">${opcionesCargo(m.roles)}</select>
						<button type="button" class="adm-persona-x" data-x title="Quitar de este curso" aria-label="Quitar a ${esc(m.nombre)}">×</button>
					</div>`;
				}).join('')}`).join('')}</div>`;
		filtrar();
	};
	const filtrar = () => {
		const t = filtro.trim().toLowerCase();
		el.querySelectorAll<HTMLElement>('.adm-persona').forEach((x) => { x.hidden = !!t && !x.dataset.q!.includes(t); });
	};
	el.addEventListener('input', (e) => {
		const q = e.target as HTMLInputElement;
		if (!q.classList.contains('adm-personas-q')) return;
		filtro = q.value;
		filtrar();
	});
	el.addEventListener('click', (e) => {
		const t = e.target as HTMLElement;
		if (t.closest('[data-traer]')) { const n = traerPersonas(); renderPage(); pintar(); status(`Se han añadido <b>${n}</b> personas como miembros.`, 'ok'); return; }
		const go = t.closest<HTMLElement>('[data-go]')?.dataset.go;
		if (go) { open(go); return; }
		if (t.closest('[data-x]')) {
			const [si, mj] = t.closest<HTMLElement>('[data-p]')!.dataset.p!.split('.').map(Number);
			const [m] = (data as Curso).secciones[si].miembros.splice(mj, 1);
			renderPage(); pintar();
			status(`Se ha quitado a <b>${esc(m.nombre)}</b> de este curso.`, 'ok');
		}
	});
	el.addEventListener('change', (e) => {
		const sel = e.target as HTMLSelectElement;
		if (sel.tagName !== 'SELECT') return;
		const [si, mj] = sel.closest<HTMLElement>('[data-p]')!.dataset.p!.split('.').map(Number);
		const m = (data as Curso).secciones[si].miembros[mj];
		m.roles = sel.value ? [sel.value] : [];
		const r = R.colocar(data, si, mj);
		renderPage(); pintar();
		status(r.movida ? `<b>${esc(m.nombre)}</b> pasa a <b>${esc(r.movida)}</b>.` : `Cargo de <b>${esc(m.nombre)}</b> cambiado.`, 'ok');
	});
	pintar();
	return el;
}

/**
 * Curso nuevo: pantalla de inicio (solo la primera vez) con todas las personas del curso anterior.
 * × para quitar a quien ya no esté, ▾ para elegir su cargo (por secciones) y «Terminar»: se colocan solas.
 */
function asistenteCurso(prev: Curso) {
	const gente = R.personasDe(prev).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((m) => ({ m, fuera: false, rol: '' }));
	// Secciones con sus cargos ya existentes: Junta → Presidente, Secretaria…; Vocales → Vocal de Taller…
	const roles = tagStore.list('roles');
	const secs = [...new Set([...R.seccionesConCargos(), ...(roles.map(R.seccionDeRol).filter(Boolean) as string[])])]
		.map((t) => ({ t, roles: roles.filter((r) => R.seccionDeRol(r) === t) })).filter((x) => x.roles.length);

	const el = h(`<div class="adm-asis" role="dialog" aria-modal="true" aria-label="Nuevo curso"><div class="asis-in"></div><div class="asis-menu" hidden></div></div>`);
	const $in = el.querySelector<HTMLElement>('.asis-in')!;
	const $menu = el.querySelector<HTMLElement>('.asis-menu')!;
	let abierto = -1;

	const pintar = () => {
		const siguen = gente.filter((g) => !g.fuera);
		const cuenta = (t: string) => siguen.filter((g) => g.rol && R.seccionDeRol(g.rol) === t).length;
		$in.innerHTML = `
			<header class="asis-head">
				<p class="kicker"><span>Nuevo curso</span><span>${esc((data as Curso).curso)}</span></p>
				<h2>¿Quién sigue este curso?</h2>
				<p>Estas son las personas de <b>${esc(prev.curso)}</b>. Pasa el ratón por encima y pulsa <b>×</b> para quitar a quien ya no esté.
				Con <b>▾</b> puedes darle ya su cargo, y irá solo a su sección. Los cargos son opcionales: también se pueden poner después.</p>
			</header>
			<div class="asis-grid">${gente.map((g, i) => `
				<div class="asis-p${g.fuera ? ' fuera' : ''}${g.rol ? ' con-rol' : ''}" data-i="${i}">
					<div class="asis-foto"><span class="asis-ini" aria-hidden="true">${esc(g.m.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</span>${g.m.foto ? thumb(g.m.foto) : ''}
						<button type="button" class="asis-x" data-x title="${g.fuera ? 'Volver a añadir' : 'No sigue este curso'}" aria-label="${g.fuera ? 'Volver a añadir' : 'Quitar'} a ${esc(g.m.nombre)}">${g.fuera ? '↺' : '×'}</button>
						${g.fuera ? '<span class="asis-fuera">No sigue</span>' : ''}
					</div>
					<p class="asis-n">${esc(g.m.nombre)}</p>
					${g.fuera ? '' : `<button type="button" class="asis-rol" data-rol aria-haspopup="menu">${g.rol ? `<b>${esc(g.rol)}</b>` : 'Miembro'} <span>▾</span></button>`}
				</div>`).join('')}
			</div>
			<footer class="asis-pie">
				<p class="asis-resumen"><b>${siguen.length}</b> de ${gente.length} siguen${secs.map((x) => (cuenta(x.t) ? ` · ${cuenta(x.t)} en ${esc(x.t)}` : '')).join('')}</p>
				<button type="button" class="adm-b" data-saltar>Empezar sin nadie</button>
				<button type="button" class="adm-b adm-b-main" data-fin>Terminar →</button>
			</footer>`;
	};

	const cerrarMenu = () => { $menu.hidden = true; abierto = -1; };
	const abrirMenu = (i: number, boton: HTMLElement) => {
		abierto = i;
		const actual = gente[i].rol;
		$menu.innerHTML = `
			<button type="button" class="asis-op${actual ? '' : ' is-on'}" data-set="">Miembro <small>sin cargo</small></button>
			${secs.map((x) => `
			<div class="asis-grupo"><span class="asis-op">${esc(x.t)} <i>›</i></span>
				<div class="asis-sub">${x.roles.map((r) => `<button type="button" class="asis-op${r === actual ? ' is-on' : ''}" data-set="${esc(r)}">${esc(r)}</button>`).join('')}</div>
			</div>`).join('')}`;
		$menu.hidden = false;
		// Cada submenú (cargos de Junta, de Vocales…) se abre donde quepa: si por abajo se sale de la pantalla, sube;
		// si por la derecha no hay sitio, se abre a la izquierda.
		$menu.querySelectorAll<HTMLElement>('.asis-grupo').forEach((g) => {
			const sub = g.querySelector<HTMLElement>('.asis-sub')!;
			const colocarSub = () => {
				$menu.querySelectorAll('.asis-grupo.is-open').forEach((x) => x !== g && x.classList.remove('is-open'));
				g.classList.add('is-open');
				sub.style.top = ''; sub.style.left = ''; sub.style.right = '';
				const r = sub.getBoundingClientRect(), margen = 8;
				const sobra = r.bottom - (innerHeight - margen);
				if (sobra > 0) sub.style.top = `${-5 - Math.min(sobra, r.top - margen)}px`;
				if (r.right > innerWidth - margen) { sub.style.left = 'auto'; sub.style.right = '100%'; }
			};
			g.addEventListener('mouseenter', colocarSub);
			g.addEventListener('focusin', colocarSub);
		});
		const b = boton.getBoundingClientRect();
		const w = $menu.offsetWidth, hgt = $menu.offsetHeight;
		$menu.style.left = `${Math.min(b.left, innerWidth - w - 230)}px`;
		$menu.style.top = `${b.bottom + hgt + 8 > innerHeight ? b.top - hgt - 4 : b.bottom + 4}px`;
	};

	el.addEventListener('click', (e) => {
		const t = e.target as HTMLElement;
		const set = t.closest<HTMLElement>('[data-set]');
		if (set && abierto >= 0) { gente[abierto].rol = set.dataset.set!; cerrarMenu(); pintar(); return; }
		if (t.closest('.asis-menu')) return;
		const card = t.closest<HTMLElement>('[data-i]');
		const i = card ? Number(card.dataset.i) : -1;
		if (t.closest('[data-x]')) { gente[i].fuera = !gente[i].fuera; gente[i].rol = ''; cerrarMenu(); pintar(); return; }
		if (t.closest('[data-rol]')) { if (abierto === i) cerrarMenu(); else abrirMenu(i, t.closest<HTMLElement>('[data-rol]')!); return; }
		cerrarMenu();
		if (t.closest('[data-saltar]')) terminar([]);
		else if (t.closest('[data-fin]')) terminar(gente.filter((g) => !g.fuera));
	});
	el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierto >= 0) { e.stopPropagation(); cerrarMenu(); } });
	$in.addEventListener('scroll', cerrarMenu, { passive: true });

	const terminar = (quienes: typeof gente) => {
		const d = data as Curso;
		if (!d.secciones.length) d.secciones.push({ titulo: 'Miembros', orden: 'alfabetico', manual: false, miembros: [] });
		const nuevas = quienes.map((g) => ({ ...g.m, roles: g.rol ? [g.rol] : [], meses: [] }));
		d.secciones[R.seccionBase(d)].miembros.push(...nuevas);
		// Los que tienen cargo, a su sección
		for (const m of nuevas) if (m.roles.length) {
			const b = R.seccionBase(d);
			R.colocar(d, b, d.secciones[b].miembros.indexOf(m));
		}
		el.remove();
		document.body.classList.remove('adm-asis-on');
		renderPage();
		open('');
		const resumen = d.secciones.filter((x) => x.miembros.length).map((x) => `${x.miembros.length} en ${esc(x.titulo)}`).join(', ');
		status(quienes.length ? `Curso preparado: ${resumen}. Revísalo y pulsa <b>${btn('save').textContent}</b>.` : 'Curso vacío: añade a las personas desde cada sección.', 'ok');
	};

	pintar();
	document.body.append(el);
	document.body.classList.add('adm-asis-on');
}

function rootExtras() {
	const el = h(`<div class="adm-extras"></div>`);
	if (K.kind === 'miembros') el.append(personasBox());
	if (isNew && K.copiar && existingIds.length) el.append(plantillaBox());
	const ed = !isNew && docId ? K.nuevaEdicion?.(K.normalize(data), docId) : undefined;
	if (ed) {
		el.append(
			h(`<p class="f-h">¿Se repite (cada año, cada cuatrimestre…)? Crea una edición: saldrá agrupada debajo de esta en el menú y en esta página.</p>`),
			h(`<a class="adm-b adm-b-wide" href="${esc(joinBase(base, ed))}">+ Nueva edición</a>`),
		);
	}
	if (!isNew && docId) {
		el.append(h(`<p class="f-h adm-danger-note">Zona peligrosa</p>`));
		const z = zonaEliminar();
		if (z) el.append(z);
	}
	return el;
}

/* ───────────── Plantilla: empezar algo nuevo copiando uno que ya existe (cualquiera, no solo el último) ───────────── */

const titulos = new Map<string, Promise<string>>();
/** Título legible de un documento existente (se lee una vez) */
const tituloDe = (id: string) => {
	if (!titulos.has(id)) titulos.set(id, readFile(`${K.dir}/${id}.json`).then((t) => (t ? K.titulo(K.normalize(JSON.parse(t))) : id)).catch(() => id));
	return titulos.get(id)!;
};

function plantillaBox() {
	// Los más recientes primero (los nombres de archivo de cursos y ediciones empiezan por el año)
	const ids = [...existingIds].sort((a, b) => b.localeCompare(a, 'es', { numeric: true }));
	const el = h(`
		<div class="adm-plantilla">
			<p class="f-h">¿Se parece a otro que ya existe? Úsalo como plantilla y luego cambia lo que haga falta. ${esc(K.copiar!.que)}</p>
			<label class="f"><span class="f-l">Usar como plantilla</span>
				<select class="f-in">${ids.map((id) => `<option value="${esc(id)}"${id === prevId ? ' selected' : ''}>${esc(id)}</option>`).join('')}</select>
			</label>
			<button type="button" class="adm-b adm-b-wide">⧉ Copiar</button>
		</div>`);
	const sel = el.querySelector('select')!;
	// Poner los títulos de verdad en el desplegable según se vayan leyendo
	ids.forEach((id, i) => tituloDe(id).then((t) => { if (sel.options[i]) sel.options[i].textContent = t; }));
	el.querySelector('button')!.addEventListener('click', async () => {
		const id = sel.value;
		status('Copiando…', 'busy');
		try {
			const txt = await readFile(`${K.dir}/${id}.json`);
			if (!txt) throw new Error('Ese ya no existe.');
			data = K.copiar!.apply(K.normalize(data), K.normalize(JSON.parse(txt)));
			renderPage();
			open('');
			status(`Copiado de <b>${esc(await tituloDe(id))}</b>. Ahora cambia, quita o añade lo que haga falta.`, 'ok');
		} catch (e) { status(`No se ha podido copiar: ${authError(e)}`, 'error'); }
	});
	return el;
}

/** Eliminar (con permisos y avisos). Se usa en el panel lateral y en la barra de arriba de la página. */
function zonaEliminar(compacta = false): HTMLElement | null {
	if (isNew || !docId) return null;
	const motivo = K.noBorrar?.(docId);
	const ocultable = K.schema.fields.some((f) => f.key === 'oculto');
	const zona = h(`<div class="adm-eliminar"><p class="f-h">${motivo ? esc(motivo) : 'Comprobando permisos…'}</p></div>`);
	if (motivo) return compacta ? null : zona;
	sesion().then((s) => puedeEliminar(s), () => false).then((ok) => {
		zona.innerHTML = '';
		if (!ok) {
			if (compacta) {
				const pb = zona.closest('.adm-pagebar');
				zona.remove();
				if (pb && !pb.querySelector('.adm-pb-check')) { pb.remove(); pageBar = null; }
				return;
			}
			zona.append(h(`<p class="f-h">Eliminar está reservado al nivel «Administración».${ocultable ? ' Si ya no se usa, marca <b>Ocultar</b>: desaparece de la web pero no se pierde.' : ''}</p>`));
			return;
		}
		if (!compacta) zona.append(h(`<p class="f-h">${ocultable ? 'Si solo quieres quitarlo un tiempo, mejor marca <b>Ocultar</b>. ' : ''}Eliminar lo borra de la web al publicar. Si te equivocas, se puede recuperar desde el historial de GitHub.</p>`));
		const b = confirmButton(compacta ? 'Eliminar…' : `Eliminar ${K.titulo(K.normalize(data))} por completo`, `Pulsa otra vez para eliminar ${K.titulo(K.normalize(data))}${compacta ? ' (se puede recuperar desde el historial de GitHub)' : ''}`, () => removeDoc());
		if (compacta) b.title = `${ocultable ? 'Si solo quieres quitarlo un tiempo, mejor usa Ocultar. ' : ''}Eliminar lo borra de la web al publicar. Si te equivocas, se puede recuperar desde el historial de GitHub.`;
		zona.append(b);
	});
	return zona;
}

/* ───────────── Barra de la página (arriba): Destacar, Ocultar, Mostrar en la sección, Eliminar ───────────── */

let pageBar: HTMLElement | null = null;
/** Las casillas de «Datos generales» (las mismas, con sus mismas explicaciones) y Eliminar, a mano arriba de la página. */
function montarBarraPagina() {
	pageBar?.remove(); pageBar = null;
	if (!root) return;
	const checks = K.schema.fields.filter((f): f is Extract<Field, { type: 'check' }> => f.type === 'check');
	const eliminar = zonaEliminar(true);
	if (!checks.length && !eliminar) return;
	pageBar = h(`<div class="adm-pagebar" role="toolbar" aria-label="Opciones de esta página"><div class="wrap adm-pagebar-in"><span class="adm-pagebar-l">${esc(K.nombre.charAt(0).toUpperCase() + K.nombre.slice(1))}</span></div></div>`);
	const inn = pageBar.querySelector('.adm-pagebar-in')!;
	for (const f of checks) {
		const c = h(`<label class="adm-pb-check" data-hint="${esc(f.hint ?? '')}"><input type="checkbox" data-key="${esc(f.key)}"><span>${esc(f.label)}</span>${f.hint ? '<i aria-hidden="true">?</i>' : ''}</label>`);
		c.querySelector('input')!.addEventListener('change', (e) => {
			setAt(f.key, (e.target as HTMLInputElement).checked);
			renderPage();
			if (current === '') open('', false); // el panel lateral, si está abierto, también se actualiza
		});
		inn.append(c);
	}
	if (eliminar) { eliminar.classList.add('adm-pb-del'); inn.append(eliminar); }
	root.before(pageBar);
	syncBarraPagina();
}
function syncBarraPagina() {
	pageBar?.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((i) => { i.checked = !!getAt(i.dataset.key!); });
}

/* ───────────── Añadir ───────────── */

async function addTo(listPath: string, valores?: Record<string, unknown>) {
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
	arr.push({ ...node.field.newItem(), ...valores });
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
	if (saving || !K || soloLectura) return;
	const s = await sesion().catch(() => null);
	if (!s) { status('No se ha podido comprobar tu acceso. Revisa la conexión y vuelve a intentarlo.', 'error'); return; }
	// Lo nuevo se apunta a nombre de quien lo crea (así los niveles básicos pueden seguir editándolo)
	// (solo lo conservan proyectos, talleres, servicios, noticias y Cybertech; el resto lo ignora al normalizar)
	if (isNew) data.creadoPor ??= s.login;
	if (isNew ? !puedeCrear(s, K.kind) : !puedeEditar(s, K.kind, data)) { status(esc(motivoNoEditar(s, K.kind)), 'error'); return; }
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
		// Recién creado: la dirección pasa a ser la de lo guardado, para que recargar no cree otro nuevo (y no entrar en bucle)
		if (wasNew && tipoNuevo) history.replaceState(null, '', `${joinBase(base, 'editar')}?tipo=${encodeURIComponent(tipoNuevo)}&id=${encodeURIComponent(id)}`);
		watchDeploy(sha, joinBase(base, K.url(id)), wasNew || location.pathname.replace(/\/$/, '') !== joinBase(base, K.url(id)).replace(/\/$/, ''), wasNew);
		if (current === '') open('', false);
	} catch (e) {
		status(`No se ha podido guardar: ${authError(e)}`, 'error');
	} finally {
		saving = false;
		refreshBar();
	}
}

async function watchDeploy(sha: string, url: string, showLink: boolean, irAlTerminar = false) {
	const link = showLink ? ` <a href="${url}">Ver la página</a>` : '';
	if (sha === 'local') {
		status(`Guardado en tus archivos ✓ ${irAlTerminar ? 'Abriendo su página…' : 'Para publicarlo, haz commit y súbelo a GitHub.'}${link}`, 'ok');
		if (irAlTerminar) irCuandoExista(url, 25);
		return;
	}
	status('Guardado ✓ · Publicando en la web…', 'busy');
	const t0 = Date.now();
	while (Date.now() - t0 < 10 * 60_000) {
		await new Promise((r) => setTimeout(r, 7000));
		if (isDirty() || saving) return;
		const s = await deployStatus(sha);
		if (s === null) { status(`Guardado ✓ La web pública se actualizará en 1–2 minutos.${link}`, 'ok'); return; }
		if (s === 'publicado') {
			status(`Publicado ✓ Ya está en la web.${irAlTerminar ? ' Abriendo su página…' : ''}${link}`, 'ok');
			if (irAlTerminar) irCuandoExista(url, 15);
			return;
		}
		if (s === 'error') { status('Guardado ✓ pero la publicación ha fallado. Revisa la pestaña "Actions" del repositorio en GitHub.', 'error'); return; }
	}
}

async function removeDoc() {
	if (!docId) return;
	if (!puedeEliminar(await sesion())) { status('Eliminar está reservado al nivel «Administración».', 'error'); return; }
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

let tipoNuevo = ''; // en la página de crear: el tipo (?tipo=miembros…)

/** Cuando la página de algo recién creado ya existe (en local, al momento; en GitHub, al publicarse), se va a ella */
async function irCuandoExista(url: string, intentos: number) {
	for (let i = 0; i < intentos; i++) {
		try {
			if ((await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok) {
				// No se sale si hay cambios sin guardar (antes de cargar nada, no hay cambios)
				const ocupado = data !== undefined && (isDirty() || saving);
				if (!ocupado) location.replace(url);
				return !ocupado;
			}
		} catch {}
		await new Promise((r) => setTimeout(r, 800));
	}
	return false;
}

async function boot() {
	const kindAttr = root?.dataset.kind;
	const params = new URLSearchParams(location.search);
	const kindKey = kindAttr === 'nuevo' ? params.get('tipo') : kindAttr;
	const kind = kindKey ? kinds[kindKey] : undefined;
	// «editar?tipo=miembros&id=2026-27»: algo recién creado cuya página aún no está publicada. Se edita aquí (no se crea otro);
	// si su página ya existe, se va directamente a ella.
	const idGuardado = kindAttr === 'nuevo' ? params.get('id') : null;
	if (kind && idGuardado && (await irCuandoExista(joinBase(base, kind.url(idGuardado)), 1))) return;
	if (kindAttr === 'nuevo' && kindKey) tipoNuevo = kindKey;
	if (!root || !kind) {
		status(location.pathname.replace(/\/$/, '').endsWith('/fototeca')
			? 'Fototeca: todas las fotos de la web. Aquí puedes ver dónde se usa cada una, subir fotos y eliminar las que sobren.'
			: 'Abre cualquier página de Miembros, Cybertech, Proyectos, Talleres, Servicios, Noticias o un apartado de Conócenos para editarla, o crea una nueva desde los menús.');
		return;
	}
	K = kind;
	status('Cargando la última versión…', 'busy');
	let s;
	try { s = await sesion(); } catch (e) {
		soloLectura = true;
		// Código revocado: se cierra la sesión en este ordenador
		if (e instanceof AccesoRevocado) { clearToken(); status(`${esc(e.message)} <a href="${joinBase(base, 'admin')}">Ir al acceso</a>`, 'error'); return; }
		status(`No se ha podido comprobar tu acceso: ${authError(e)}`, 'error');
		return;
	}
	if (kindAttr === 'nuevo' && !idGuardado && !puedeCrear(s, kind.kind)) {
		soloLectura = true;
		status(`Tu nivel de acceso es «${esc(nombreNivel(s.nivel))}»: no puedes crear ${esc(kind.nombre.endsWith('ón') ? `${kind.nombre.slice(0, -2)}ones` : `${kind.nombre}s`)}.`, 'error');
		return;
	}
	try {
		const [tagsText, files] = await Promise.all([readFile('src/data/etiquetas.json'), listDir(K.dir)]);
		tagStore.data = tagsText ? JSON.parse(tagsText) : {};
		existingIds = files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

		if (kindAttr === 'nuevo' && !idGuardado) {
			isNew = true;
			data = K.nuevo(existingIds);
			prevId = K.previo ? K.previo(existingIds, data) : [...existingIds].sort().pop();
			const prevTxt = prevId ? await readFile(`${K.dir}/${prevId}.json`) : null;
			prevDoc = prevTxt ? K.normalize(JSON.parse(prevTxt)) : null;
			savedJson = JSON.stringify(data);
			document.title = `${K.titulo(data)} · Reset`;
		} else {
			docId = idGuardado ?? root.dataset.id!;
			const txt = await readFile(`${K.dir}/${docId}.json`);
			if (txt === null) throw new Error('Este contenido ya no existe en el repositorio (¿lo ha borrado alguien?).');
			data = K.normalize(JSON.parse(txt));
			savedJson = JSON.stringify(data);
			// Recién creado y su página aún no está: en cuanto exista (en local, segundos; en GitHub, al publicarse) se va a ella
			if (idGuardado) irCuandoExista(joinBase(base, K.url(idGuardado)), isLocal() ? 40 : 300);
		}
		if (K.kind === 'miembros') {
			// Todos los cursos: de ellos se aprende de qué sección es cada cargo (Presidente → Junta…)
			const ids = existingIds.filter((x) => x !== docId).sort().reverse();
			otrosCursos = (await Promise.all(ids.map((id) => readFile(`${K.dir}/${id}.json`).then((t) => (t ? K.normalize(JSON.parse(t)) : null)).catch(() => null)))).filter(Boolean);
			R.aprenderDe([data, ...otrosCursos]);
			// Curso nuevo: empieza con todas las personas del último curso, como miembros sin cargo
			if (isNew) { const prev = cursoAnterior(); if (prev) asistenteCurso(prev); }
		}
		// Algo que ya existe y tu nivel no puede editar: se ve como en la web, sin controles
		if (!isNew && !puedeEditar(s, K.kind, data)) {
			soloLectura = true;
			document.body.classList.add('adm-solo-lectura');
			status(`${esc(motivoNoEditar(s, K.kind))} <a href="${joinBase(base, 'admin')}">Ver tu acceso</a>`, 'info');
			return;
		}
		if (Array.isArray(data.etiquetas)) tagStore.seed(K.kind, data.etiquetas);
		btn('general').hidden = false;
		btn('save').hidden = false;
		renderPage();
		montarBarraPagina();
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
