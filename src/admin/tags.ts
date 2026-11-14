/**
 * Etiquetas reutilizables (estilo Notion). Se guardan en src/data/etiquetas.json:
 * cuando alguien crea "Presidente" una vez, aparece en el desplegable para siempre.
 */
import { esc } from '../lib/render';

export const tagStore = {
	data: {} as Record<string, string[]>,
	dirty: false,
	list(group: string) { return (this.data[group] ??= []); },
	add(group: string, tag: string) {
		const l = this.list(group);
		if (!l.some((t) => t.toLowerCase() === tag.toLowerCase())) {
			l.push(tag);
			l.sort((a, b) => a.localeCompare(b, 'es'));
			this.dirty = true;
		}
	},
	remove(group: string, tag: string) {
		this.data[group] = this.list(group).filter((t) => t !== tag);
		this.dirty = true;
	},
	/** Añade a la lista las etiquetas que ya se usan en el contenido (sin marcarlo como cambio). */
	seed(group: string, used: string[]) {
		const l = this.list(group);
		for (const t of used) if (t && !l.some((x) => x.toLowerCase() === t.toLowerCase())) l.push(t);
		l.sort((a, b) => a.localeCompare(b, 'es'));
	},
};

/** Selector de etiquetas: chips + buscador + "Crear «…»". */
export function tagPicker(group: string, value: string[], placeholder: string, onChange: (v: string[]) => void): HTMLElement {
	let selected = [...value];
	let active = 0;
	const el = document.createElement('div');
	el.className = 'f-tags';
	el.innerHTML = `<ul class="f-chips"></ul><input type="text" autocomplete="off" placeholder="${esc(placeholder)}"><div class="f-menu" role="listbox" hidden></div>`;
	const chips = el.querySelector('ul')!;
	const input = el.querySelector('input')!;
	const menu = el.querySelector<HTMLDivElement>('.f-menu')!;

	let open = false;
	const commit = () => { onChange([...selected]); drawChips(); drawMenu(); };
	const drawChips = () => {
		chips.innerHTML = selected.map((t, i) => `<li>${esc(t)}<button type="button" data-rm="${i}" aria-label="Quitar ${esc(t)}">×</button></li>`).join('');
	};
	const options = () => {
		const q = input.value.trim().toLowerCase();
		const opts: { label: string; value: string; create?: boolean }[] = tagStore.list(group)
			.filter((t) => !selected.includes(t) && t.toLowerCase().includes(q))
			.map((t) => ({ label: t, value: t }));
		const raw = input.value.trim();
		if (raw && !tagStore.list(group).some((t) => t.toLowerCase() === raw.toLowerCase())) {
			opts.push({ label: raw, value: raw, create: true });
		}
		return opts;
	};
	const drawMenu = () => {
		const opts = options();
		active = Math.min(active, Math.max(0, opts.length - 1));
		if (document.activeElement !== input || !open) { menu.hidden = true; return; }
		menu.hidden = false;
		menu.innerHTML = opts.length
			? opts.map((o, i) => `<div class="f-opt${i === active ? ' is-active' : ''}${o.create ? ' is-create' : ''}" data-i="${i}" role="option">
				${o.create ? `<span class="f-plus">+</span> Crear <b>${esc(o.label)}</b>` : `<span>${esc(o.label)}</span><button type="button" class="f-del" data-del="${esc(o.value)}" title="Borrar de la lista de etiquetas guardadas">borrar</button>`}
			</div>`).join('')
			: `<div class="f-empty">${tagStore.list(group).length ? 'No hay más etiquetas. Escribe para crear una.' : 'Escribe para crear la primera etiqueta.'}</div>`;
		(menu as any)._opts = opts;
	};
	const choose = (i: number) => {
		const o = ((menu as any)._opts || [])[i];
		if (!o) return;
		if (o.create) tagStore.add(group, o.value);
		selected.push(o.value);
		input.value = '';
		active = 0;
		open = false; // se cierra al elegir; se reabre al escribir o al pulsar el campo
		commit();
	};

	chips.addEventListener('click', (e) => {
		const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rm]');
		if (b) { selected.splice(Number(b.dataset.rm), 1); commit(); }
	});
	menu.addEventListener('mousedown', (e) => {
		e.preventDefault();
		const del = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-del]');
		if (del) { tagStore.remove(group, del.dataset.del!); drawMenu(); return; }
		const opt = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
		if (opt) choose(Number(opt.dataset.i));
	});
	input.addEventListener('focus', () => { open = true; drawMenu(); });
	input.addEventListener('mousedown', () => { open = true; requestAnimationFrame(drawMenu); });
	input.addEventListener('blur', () => setTimeout(() => (menu.hidden = true), 100));
	input.addEventListener('input', () => { open = true; active = 0; drawMenu(); });
	input.addEventListener('keydown', (e) => {
		const n = ((menu as any)._opts || []).length;
		if (e.key === 'ArrowDown') { e.preventDefault(); open = true; active = (active + 1) % Math.max(n, 1); drawMenu(); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + n) % Math.max(n, 1); drawMenu(); }
		else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
		else if (e.key === 'Backspace' && !input.value && selected.length) { selected.pop(); commit(); }
		else if (e.key === 'Escape') { if (open) { e.stopPropagation(); open = false; drawMenu(); } else input.blur(); }
	});
	drawChips();
	return el;
}
