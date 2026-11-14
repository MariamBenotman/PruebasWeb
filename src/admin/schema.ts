/**
 * Qué se puede editar de cada tipo de contenido. El editor construye sus formularios a partir de esto.
 * Para añadir un campo nuevo: añádelo aquí, en src/lib/render.ts (normalize + render) y listo.
 */
import {
	normalizeCurso, normalizeEdicion, renderCurso, renderEdicion, cursoSlug, cursoCorto,
	type Curso, type Edicion, type RenderCtx,
} from '../lib/render';

export type Field =
	| { key: string; label: string; type: 'text'; hint?: string; placeholder?: string }
	| { key: string; label: string; type: 'number'; hint?: string }
	| { key: string; label: string; type: 'markdown'; hint?: string; rows?: number }
	| { key: string; label: string; type: 'image'; hint?: string; media?: boolean; maxSize?: number }
	| { key: string; label: string; type: 'tags'; group: string; hint?: string; placeholder?: string }
	| { key: string; label: string; type: 'list'; hint?: string; item: ObjSchema; addLabel: string; newItem: () => any }
	| { key: string; label: string; type: 'images'; hint?: string; maxSize?: number };

export interface ObjSchema {
	/** Título que se muestra en las migas de pan y en las listas */
	title: (value: any, index: number) => string;
	fields: Field[];
	/** Qué campo usar para nombrar las fotos subidas */
	nameKey?: string;
}

export interface DocKind<T = any> {
	kind: 'miembros' | 'cybertech';
	nombre: string;           // "curso" / "edición"
	dir: string;              // carpeta en el repo
	normalize: (raw: any) => T;
	render: (d: T, ctx: RenderCtx) => string;
	schema: ObjSchema;
	fileId: (d: T) => string;
	validate: (d: T) => string | null;
	mediaFolder: (d: T) => string;
	titulo: (d: T) => string;
	url: (id: string) => string;
	nuevo: (existing: string[]) => T;
	/** Copia la estructura de una entrada anterior al crear una nueva */
	copiar?: { label: (prev: T) => string; apply: (actual: T, prev: T) => T };
}

const MB = 1024 * 1024;

/* ───────────── Miembros ───────────── */

const miembroSchema: ObjSchema = {
	title: (m) => m?.nombre || 'Persona sin nombre',
	nameKey: 'nombre',
	fields: [
		{ key: 'nombre', label: 'Nombre', type: 'text', placeholder: 'Nombre y apellido' },
		{ key: 'roles', label: 'Rol o cargo', type: 'tags', group: 'roles', placeholder: 'Escribe o elige un rol…', hint: 'Los roles nuevos se guardan para los próximos cursos. Déjalo vacío para miembros sin cargo.' },
		{ key: 'foto', label: 'Foto', type: 'image', hint: 'Vertical (4:5) queda mejor. Se recorta y optimiza sola.' },
		{ key: 'fotoHover', label: 'Foto al pasar el ratón', type: 'image', hint: 'Opcional: la foto "divertida" que aparece al pasar el cursor.' },
	],
};

const seccionMiembrosSchema: ObjSchema = {
	title: (s) => s?.titulo || 'Sección sin título',
	nameKey: 'titulo',
	fields: [
		{ key: 'titulo', label: 'Título de la sección', type: 'text', placeholder: 'Junta, Vocales, Miembros…' },
		{
			key: 'miembros', label: 'Personas', type: 'list', item: miembroSchema, addLabel: 'Añadir persona',
			newItem: () => ({ nombre: '', roles: [], foto: '', fotoHover: '' }),
		},
	],
};

export const miembrosKind: DocKind<Curso> = {
	kind: 'miembros',
	nombre: 'curso',
	dir: 'src/content/miembros',
	normalize: normalizeCurso,
	render: renderCurso,
	fileId: (d) => cursoSlug(d.curso),
	validate: (d) => (/^\d{4}\/\d{2}$/.test(d.curso.trim()) ? null : 'El curso debe tener el formato 2025/26.'),
	mediaFolder: (d) => `fotos/miembros/${cursoSlug(d.curso) || 'nuevo'}`,
	titulo: (d) => `Miembros ${cursoCorto(d.curso) || '(nuevo)'}`,
	url: (id) => `miembros/${id}`,
	schema: {
		title: (d) => `Miembros ${cursoCorto(d?.curso ?? '')}`,
		fields: [
			{ key: 'curso', label: 'Curso', type: 'text', placeholder: '2025/26', hint: 'Formato 2025/26. Define también la dirección de la página.' },
			{ key: 'intro', label: 'Presentación (opcional)', type: 'markdown', rows: 3 },
			{ key: 'fotoGrupo', label: 'Foto de grupo (opcional)', type: 'image', hint: 'Horizontal. Aparece arriba, antes de las secciones.' },
			{
				key: 'secciones', label: 'Secciones', type: 'list', item: seccionMiembrosSchema, addLabel: 'Añadir sección',
				newItem: () => ({ titulo: 'Nueva sección', miembros: [] }),
			},
		],
	},
	nuevo: (existing) => {
		const last = existing.filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().pop();
		const y = last ? Number(last.slice(0, 4)) + 1 : new Date().getFullYear();
		return normalizeCurso({
			curso: `${y}/${String((y + 1) % 100).padStart(2, '0')}`,
			secciones: [{ titulo: 'Junta' }, { titulo: 'Vocales' }, { titulo: 'Miembros' }],
		});
	},
	copiar: {
		label: (prev) => `Copiar las personas de ${prev.curso}`,
		apply: (actual, prev) => ({ ...actual, secciones: structuredClone(prev.secciones) }),
	},
};

/* ───────────── Cybertech ───────────── */

const pruebaSchema: ObjSchema = {
	title: (p) => p?.nombre || 'Prueba sin nombre',
	nameKey: 'nombre',
	fields: [
		{ key: 'nombre', label: 'Nombre de la prueba', type: 'text' },
		{ key: 'descripcion', label: 'Descripción', type: 'markdown', rows: 5 },
		{ key: 'media', label: 'Imagen o vídeo (opcional)', type: 'image', media: true, maxSize: 15 * MB },
	],
};

const categoriaSchema: ObjSchema = {
	title: (c) => c?.nombre || 'Categoría sin nombre',
	nameKey: 'nombre',
	fields: [
		{ key: 'nombre', label: 'Nombre', type: 'text', placeholder: 'Classic, Pro, Sumo…' },
		{ key: 'descripcion', label: 'Descripción', type: 'markdown', rows: 6 },
		{ key: 'media', label: 'Imagen o vídeo (opcional)', type: 'image', media: true, maxSize: 15 * MB },
		{
			key: 'pruebas', label: 'Pruebas', type: 'list', item: pruebaSchema, addLabel: 'Añadir prueba',
			newItem: () => ({ nombre: 'Nueva prueba', descripcion: '', media: '' }),
		},
	],
};

export const cybertechKind: DocKind<Edicion> = {
	kind: 'cybertech',
	nombre: 'edición',
	dir: 'src/content/cybertech',
	normalize: normalizeEdicion,
	render: renderEdicion,
	fileId: (d) => String(d.anio),
	validate: (d) => (Number.isInteger(d.anio) && d.anio >= 2000 && d.anio <= 2100 ? null : 'El año no es válido.'),
	mediaFolder: (d) => `fotos/cybertech/${d.anio}`,
	titulo: (d) => `Cybertech ${d.anio}`,
	url: (id) => `cybertech/${id}`,
	schema: {
		title: (d) => `Cybertech ${d?.anio ?? ''}`,
		fields: [
			{ key: 'anio', label: 'Año', type: 'number' },
			{ key: 'lema', label: 'Lema', type: 'text', placeholder: 'La mayor competición de robótica de la UPM' },
			{ key: 'fechas', label: 'Fechas', type: 'text', placeholder: '25–28 de abril de 2026' },
			{ key: 'lugar', label: 'Lugar', type: 'text', placeholder: 'Pabellón de deportes de la ETSII' },
			{ key: 'tematica', label: 'Temática (opcional)', type: 'text', placeholder: 'Cyberpunk' },
			{ key: 'portada', label: 'Imagen de portada', type: 'image', media: true, maxSize: 15 * MB },
			{ key: 'intro', label: 'Introducción', type: 'markdown', rows: 7 },
			{
				key: 'datos', label: 'Datos destacados (franja naranja)', type: 'list', addLabel: 'Añadir dato',
				hint: 'Cifras cortas: "3000 €" + "en premios", "4" + "días"…',
				newItem: () => ({ valor: '', etiqueta: '' }),
				item: {
					title: (x) => (x?.valor || x?.etiqueta ? `${x.valor} ${x.etiqueta}`.trim() : 'Dato vacío'),
					fields: [
						{ key: 'valor', label: 'Cifra', type: 'text', placeholder: '3000 €' },
						{ key: 'etiqueta', label: 'Texto', type: 'text', placeholder: 'en premios y créditos ECTS' },
					],
				},
			},
			{
				key: 'categorias', label: 'Categorías', type: 'list', item: categoriaSchema, addLabel: 'Añadir categoría',
				newItem: () => ({ nombre: 'Nueva categoría', descripcion: '', media: '', pruebas: [] }),
			},
			{
				key: 'secciones', label: 'Bloques de texto', type: 'list', addLabel: 'Añadir bloque',
				hint: 'Inscripción, talleres, normativa, ganadores…',
				newItem: () => ({ titulo: 'Nuevo bloque', contenido: '', media: '' }),
				item: {
					title: (s) => s?.titulo || 'Bloque sin título',
					nameKey: 'titulo',
					fields: [
						{ key: 'titulo', label: 'Título', type: 'text' },
						{ key: 'contenido', label: 'Contenido', type: 'markdown', rows: 10 },
						{ key: 'media', label: 'Imagen o vídeo (opcional)', type: 'image', media: true, maxSize: 15 * MB },
					],
				},
			},
			{ key: 'galeria', label: 'Galería de fotos', type: 'images' },
		],
	},
	nuevo: (existing) => {
		const years = existing.map(Number).filter(Boolean);
		return normalizeEdicion({ anio: years.length ? Math.max(...years) + 1 : new Date().getFullYear() });
	},
	copiar: {
		label: (prev) => `Copiar categorías y bloques de ${prev.anio}`,
		apply: (actual, prev) => ({
			...actual,
			lema: prev.lema,
			lugar: prev.lugar,
			categorias: structuredClone(prev.categorias),
			secciones: structuredClone(prev.secciones),
		}),
	},
};

export const kinds = { miembros: miembrosKind, cybertech: cybertechKind };
