/**
 * MODO EDICIÓN
 * Se carga solo si hay sesión iniciada (ver /admin). Convierte la página real en editable:
 *  - clic en cualquier bloque → se abre el panel lateral con sus campos
 *  - botones "+" para añadir personas, categorías, pruebas, fotos…
 *  - la página se vuelve a dibujar en directo con el mismo código que la web publicada
 *  - "Guardar y publicar" hace un commit en GitHub y la web se actualiza sola
 */
import './admin.css';
import { clearToken, readFile, listDir, commit, deployStatus, rawUrl, GitHubError, type FileChange } from './github';
import { kinds, type DocKind, type Field, type ObjSchema } from './schema';
import { pending, processFile, pickFiles } from './media';
import { tagStore, tagPicker } from './tags';
import { esc, asset, joinBase } from '../lib/render';

const base = window.__site.base;
const root = document.getElementById('page-root');
const uploaded = new Map<string, string>(); // fotos ya guardadas pero aún no publicadas → vista previa local

/* Fotos recién subidas que la web publicada todavía no tiene: se leen directamente del repositorio. */
window.__imgAdmin = (el) => {
	const p = el.getAttribute('data-path');
	if (!p || el.dataset.raw || /^(https?:|blob:|data:)/.test(p)) return false;
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
	<div class="adm-bar-l"><span class="adm-dot"></span><b>Modo edición</b><span class="adm-doc"></span></div>
	<div class="adm-status" aria-live="polite"></div>
	<div class="adm-bar-r">
		<button type="button" class="adm-b" data-bar="general" hidden>Datos generales</button>
		<button type="button" class="adm-b" data-bar="discard" hidden>Descartar cambios</button>
		<button type="button" class="adm-b adm-b-main" data-bar="save" hidden>Guardar y publicar</button>
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
		case 'number': {
			const el = wrapField(f, `<input class="f-in" type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(v ?? '')}" placeholder="${esc((f as any).placeholder ?? '')}">`);
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

function imageField(f: Extract<Field, { type: 'image' }>, path: string, ownerPath: string) {
	const v = getAt(path) as string;
	const el = wrapField(f, `
		<div class="f-img">
			<div class="f-thumb">${thumb(v)}</div>
			<div class="f-img-a">
				<button type="button" class="adm-b" data-up>${v ? 'Cambiar' : f.media ? 'Subir imagen o vídeo' : 'Subir foto'}</button>
				${v ? '<button type="button" class="adm-b adm-b-ghost" data-clear>Quitar</button>' : ''}
				${v ? `<code title="${esc(v)}">${esc(v.split('/').pop())}</code>` : ''}
			</div>
		</div>`);
	el.querySelector('[data-up]')!.addEventListener('click', async () => {
		const files = await pickFiles({ media: f.media });
		if (!files.length) return;
		const [p] = await upload(files, ownerPath, f);
		if (p) { setAt(path, p); renderPage(); open(current ?? ownerPath, false); }
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
		if (p) { setAt(path, p); renderPage(); open(current ?? ownerPath, false); }
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
	if (!isNew && docId) {
		el.append(h(`<p class="f-h adm-danger-note">Zona peligrosa</p>`));
		el.append(confirmButton(`Eliminar ${K.nombre} entero`, `Pulsa otra vez para eliminar ${K.titulo(K.normalize(data))}`, () => removeDoc()));
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
	const id = K.fileId(d);
	if ((isNew || id !== docId) && existingIds.includes(id)) {
		status(`Ya existe ${K.nombre === 'curso' ? 'el curso' : 'la edición'} ${esc(id)}. Cambia el ${K.nombre === 'curso' ? 'curso' : 'año'}.`, 'error');
		open('');
		return;
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
	const kind = kindKey ? (kinds as Record<string, DocKind>)[kindKey] : undefined;
	if (!root || !kind) {
		status('Puedes editar las páginas de <b>Miembros</b> y <b>Cybertech</b>, o crear nuevas desde los menús.');
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
			const prevId = [...existingIds].sort().pop();
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
		btn('general').hidden = false;
		btn('save').hidden = false;
		renderPage();
		if (isNew) { open(''); status(`Rellena los datos ${K.kind === 'miembros' ? 'del nuevo curso' : 'de la nueva edición'} y pulsa <b>Guardar y publicar</b>.`); }
		else status('Haz clic en cualquier bloque para editarlo.');
	} catch (e) {
		status(`No se ha podido cargar: ${authError(e)}`, 'error');
	}
}

boot();
