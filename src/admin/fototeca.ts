/**
 * FOTOTECA: todas las fotos de public/fotos, por carpetas.
 *  - dónde se usa cada una (lo calcula la página al compilar: #usos-data)
 *  - subir fotos a cualquier carpeta (se optimizan igual que en el editor y se guardan al momento)
 *  - eliminar las que sobren (solo con el nivel «Administración»; avisa si la foto se usa en algún sitio)
 */
import './admin.css';
import { listTree, commit, isLocal, GitHubError } from './github';
import { sesion, puedeEliminar } from './permisos';
import { processFile, pickFiles, pending } from './media';
import { esc, slugify } from '../lib/render';

type Uso = { titulo: string; url: string };
type Foto = { path: string; size: number };

const base = (window as any).__site.base as string;
const IMG = /\.(jpe?g|png|webp|gif|svg|avif)$/i;
const VID = /\.(mp4|webm|mov)$/i;
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const h = <T extends HTMLElement = HTMLElement>(html: string) => {
	const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as T;
};
const errorTexto = (e: unknown) => e instanceof GitHubError && (e.status === 401 || e.status === 403)
	? `GitHub ha rechazado la sesión (${esc(e.message)}). Vuelve a iniciar sesión en Acceso editores.`
	: esc((e as Error)?.message || 'Error desconocido.');

export async function montar() {
	const root = document.getElementById('fototeca')!;
	const usos: Record<string, Uso[]> = JSON.parse(document.getElementById('usos-data')?.textContent || '{}');
	let fotos: Foto[] = [];
	const admin = sesion().then(puedeEliminar, () => false);

	root.innerHTML = `
		<div class="ftk-barra">
			<input class="f-in ftk-buscar" type="search" placeholder="Buscar por nombre o carpeta…">
			<select class="f-in ftk-carpeta"><option value="">Todas las carpetas</option></select>
			<label class="ftk-check"><input type="checkbox" class="ftk-sinuso"> Solo las que no se usan</label>
			<span class="ftk-cuenta"></span>
		</div>
		<details class="ftk-subir">
			<summary>+ Subir fotos</summary>
			<div class="ftk-subir-in">
				<label>Carpeta <select class="f-in ftk-destino"></select></label>
				<label class="ftk-nueva" hidden>Nueva carpeta (dentro de fotos/) <input class="f-in" placeholder="archivo/cybertech-2026"></label>
				<button type="button" class="adm-b adm-b-main ftk-elegir">Elegir fotos…</button>
				<p class="f-h">Se optimizan solas (máximo 1800 px) y se ${isLocal() ? 'guardan en este ordenador' : 'publican en la web'} al momento.</p>
			</div>
		</details>
		<p class="ftk-estado" aria-live="polite"></p>
		<div class="ftk-lista"><p class="f-h">Cargando las fotos…</p></div>`;
	const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
	const estado = (msg: string, tono: 'ok' | 'error' | '' = '') => { const e = $('.ftk-estado'); e.innerHTML = msg; e.dataset.tono = tono; };

	const carpetaDe = (p: string) => p.split('/').slice(0, -1).join('/');
	const pintar = () => {
		const q = slugify($<HTMLInputElement>('.ftk-buscar').value.trim() || '_');
		const filtro = $<HTMLInputElement>('.ftk-buscar').value.trim() ? q : '';
		const carpeta = $<HTMLSelectElement>('.ftk-carpeta').value;
		const soloSinUso = $<HTMLInputElement>('.ftk-sinuso').checked;
		const vis = fotos.filter((f) => (!carpeta || carpetaDe(f.path) === carpeta)
			&& (!soloSinUso || !usos[f.path])
			&& (!filtro || slugify(f.path).includes(filtro)));
		const sinUso = fotos.filter((f) => !usos[f.path]).length;
		$('.ftk-cuenta').textContent = `${fotos.length} fotos · ${sinUso} sin usar · ${kb(fotos.reduce((n, f) => n + f.size, 0))}`;
		const grupos = new Map<string, Foto[]>();
		for (const f of vis) { const c = carpetaDe(f.path); if (!grupos.has(c)) grupos.set(c, []); grupos.get(c)!.push(f); }
		$('.ftk-lista').innerHTML = [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([c, lista]) => `
			<details class="ftk-grupo" open>
				<summary><b>${esc(c.replace(/^fotos\//, ''))}</b> <span>${lista.length} · ${kb(lista.reduce((n, f) => n + f.size, 0))}</span></summary>
				<div class="ftk-grid">${lista.map((f) => {
					const u = usos[f.path] ?? [];
					const src = `${base}${f.path}`;
					return `<figure class="ftk-foto${u.length ? '' : ' sin-uso'}" data-p="${esc(f.path)}">
						<a class="ftk-mini" href="${esc(src)}" target="_blank" rel="noopener" title="Abrir en grande">
							${VID.test(f.path) ? `<video src="${esc(src)}" muted preload="metadata" data-path="${esc(f.path)}"></video>` : IMG.test(f.path) ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" data-path="${esc(f.path)}" onerror="__img(this)">` : '<span>archivo</span>'}
						</a>
						<figcaption>
							<span class="ftk-nombre" title="${esc(f.path)}">${esc(f.path.split('/').pop()!)}</span>
							<span class="ftk-peso">${kb(f.size)}</span>
							${u.length ? `<span class="ftk-usos">Se usa en: ${u.map((x) => `<a href="${esc(x.url)}">${esc(x.titulo)}</a>`).join(', ')}</span>` : '<span class="ftk-libre">Sin usar</span>'}
							<span class="ftk-acc">
								<button type="button" class="adm-b adm-b-ghost" data-copiar>Copiar ruta</button>
								<button type="button" class="adm-b adm-b-danger" data-borrar>Eliminar</button>
							</span>
						</figcaption>
					</figure>`;
				}).join('')}</div>
			</details>`).join('') || '<p class="f-h">No hay fotos que coincidan.</p>';
	};

	const rellenarCarpetas = () => {
		const carpetas = [...new Set(fotos.map((f) => carpetaDe(f.path)))].sort();
		const sel = $<HTMLSelectElement>('.ftk-carpeta'), v = sel.value;
		sel.innerHTML = `<option value="">Todas las carpetas</option>${carpetas.map((c) => `<option value="${esc(c)}">${esc(c.replace(/^fotos\//, ''))}</option>`).join('')}`;
		sel.value = v;
		const dest = $<HTMLSelectElement>('.ftk-destino'), d = dest.value;
		dest.innerHTML = `${carpetas.map((c) => `<option value="${esc(c)}">${esc(c.replace(/^fotos\//, ''))}</option>`).join('')}<option value="__nueva">Otra carpeta nueva…</option>`;
		if (d) dest.value = d;
	};

	const cargar = async () => {
		try {
			fotos = (await listTree('public/fotos')).map((f) => ({ path: f.path.replace(/^public\//, ''), size: f.size }))
				.filter((f) => !/(^|\/)(LEEME|README)\.md$/i.test(f.path));
			rellenarCarpetas();
			pintar();
		} catch (e) { $('.ftk-lista').innerHTML = `<p class="f-h">No se han podido cargar las fotos: ${errorTexto(e)}</p>`; }
	};

	// Filtros
	root.querySelector('.ftk-barra')!.addEventListener('input', pintar);
	$<HTMLSelectElement>('.ftk-destino').addEventListener('change', (e) => {
		($('.ftk-nueva') as HTMLElement).hidden = (e.target as HTMLSelectElement).value !== '__nueva';
	});

	// Subir
	$('.ftk-elegir').addEventListener('click', async () => {
		let carpeta = $<HTMLSelectElement>('.ftk-destino').value;
		if (carpeta === '__nueva') {
			const nueva = $<HTMLInputElement>('.ftk-nueva input').value.replace(/^\/*fotos\//, '').split('/').map((x) => x.trim()).filter(Boolean).map(slugify).join('/');
			if (!nueva) { estado('Escribe el nombre de la carpeta nueva.', 'error'); return; }
			carpeta = `fotos/${nueva}`;
		}
		const files = await pickFiles({ multiple: true, media: true });
		if (!files.length) return;
		const nuevas: string[] = [];
		try {
			for (const [i, file] of files.entries()) {
				estado(`Optimizando ${i + 1}/${files.length}: ${esc(file.name)}…`);
				nuevas.push(await processFile(file, carpeta, file.name.replace(/\.[^.]+$/, ''), 15 * 1024 * 1024));
			}
			estado(isLocal() ? 'Guardando…' : 'Subiendo a GitHub…');
			await commit(nuevas.map((p) => ({ path: `public/${p}`, bytes: pending.get(p)!.bytes })), `Subir ${nuevas.length} foto${nuevas.length > 1 ? 's' : ''} a ${carpeta} desde la fototeca`);
			nuevas.forEach((p) => fotos.push({ path: p, size: pending.get(p)!.bytes.length }));
			rellenarCarpetas(); pintar();
			estado(`${nuevas.length} foto${nuevas.length > 1 ? 's subidas' : ' subida'} a <b>${esc(carpeta.replace(/^fotos\//, ''))}</b>.${isLocal() ? '' : ' Aparecerán en la web publicada en 1–2 minutos.'}`, 'ok');
		} catch (e) { estado(`No se han podido subir: ${errorTexto(e)}`, 'error'); }
	});

	// Copiar ruta / eliminar
	$('.ftk-lista').addEventListener('click', async (e) => {
		const t = e.target as HTMLElement;
		const fig = t.closest<HTMLElement>('[data-p]');
		if (!fig) return;
		const p = fig.dataset.p!;
		if (t.closest('[data-copiar]')) {
			await navigator.clipboard?.writeText(p).catch(() => {});
			estado(`Ruta copiada: <code>${esc(p)}</code>. Puedes pegarla en cualquier campo de foto del editor.`, 'ok');
			return;
		}
		const b = t.closest<HTMLButtonElement>('[data-borrar]');
		if (!b) return;
		if (!(await admin)) { estado('Eliminar fotos está reservado al nivel «Administración».', 'error'); return; }
		const u = usos[p] ?? [];
		if (!b.dataset.armed) {
			b.dataset.armed = '1';
			b.textContent = u.length ? `Se usa en ${u.length} sitio${u.length > 1 ? 's' : ''}: ¿eliminar igualmente?` : '¿Seguro? Pulsa otra vez';
			setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Eliminar'; } }, 4000);
			return;
		}
		b.disabled = true;
		try {
			await commit([{ path: `public/${p}`, delete: true }], `Eliminar ${p} desde la fototeca`);
			fotos = fotos.filter((f) => f.path !== p);
			rellenarCarpetas(); pintar();
			estado(`Eliminada <code>${esc(p)}</code>.${u.length ? ` Revisa ${u.map((x) => `<a href="${esc(x.url)}">${esc(x.titulo)}</a>`).join(', ')}: ahí ahora falta esa foto.` : ''} Si fue un error, se puede recuperar desde el historial de GitHub.`, 'ok');
		} catch (err) { b.disabled = false; estado(`No se ha podido eliminar: ${errorTexto(err)}`, 'error'); }
	});

	await cargar();
}
