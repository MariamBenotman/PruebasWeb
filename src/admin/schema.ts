/**
 * Qué se puede editar de cada tipo de contenido. El editor construye sus formularios a partir de esto.
 * Para añadir un campo nuevo: añádelo aquí, en src/lib/render.ts (normalize + render) y listo.
 */
import {
	normalizeCurso, normalizeEdicion, normalizeEntrada, normalizePagina, renderCurso, renderEdicion, renderEntrada, renderPagina, cursoSlug, cursoCorto, slugify,
	SECCIONES, type Curso, type Edicion, type Entrada, type Pagina, type SeccionKey, type RenderCtx,
} from '../lib/render';

export type Field =
	| { key: string; label: string; type: 'check'; hint?: string }
	| { key: string; label: string; type: 'refs'; hint?: string; options: () => { value: string; label: string; sub?: string }[] }
	| { key: string; label: string; type: 'text'; hint?: string; placeholder?: string }
	| { key: string; label: string; type: 'number'; hint?: string }
	| { key: string; label: string; type: 'date'; hint?: string }
	| { key: string; label: string; type: 'markdown'; hint?: string; rows?: number }
	| { key: string; label: string; type: 'image'; hint?: string; media?: boolean; maxSize?: number; /** Proporción esperada: avisa al subir si no encaja */ formato?: 'retrato' | 'cartel' }
	| { key: string; label: string; type: 'tags'; group: string; hint?: string; placeholder?: string }
	| { key: string; label: string; type: 'select'; hint?: string; options: () => { value: string; label: string }[] }
	| { key: string; label: string; type: 'list'; hint?: string; item: ObjSchema; addLabel: string; newItem: () => any; reutilizar?: Reutilizar }
	| { key: string; label: string; type: 'images'; hint?: string; maxSize?: number };

/**
 * Permite añadir a una lista algo que ya estaba en otro documento del mismo tipo
 * (p. ej. una persona de un curso anterior, con sus fotos), en vez de crearlo de cero.
 */
export interface Reutilizar {
	/** "otros cursos" → "Buscar en otros cursos…" */
	donde: string;
	/** Todos los elementos de un documento (normalizado) */
	todos: (doc: any) => any[];
	/** Identidad: dos elementos con la misma clave son la misma persona */
	clave: (item: any) => string;
	/** Cómo se muestra en el buscador */
	ficha: (item: any, doc: any) => { titulo: string; sub: string; foto?: string };
	/** Qué se copia al añadirlo */
	copia: (item: any) => any;
}

export interface ObjSchema {
	/** Título que se muestra en las migas de pan y en las listas */
	title: (value: any, index: number) => string;
	fields: Field[];
	/** Qué campo usar para nombrar las fotos subidas */
	nameKey?: string;
}

export interface DocKind<T = any> {
	kind: string;
	nombre: string;           // "curso" / "edición"
	dir: string;              // carpeta en el repo
	normalize: (raw: any) => T;
	render: (d: T, ctx: RenderCtx) => string;
	schema: ObjSchema;
	/** Nombre del archivo. `actual` es el de un contenido ya existente (null si es nuevo). */
	fileId: (d: T, actual: string | null) => string;
	validate: (d: T) => string | null;
	mediaFolder: (d: T) => string;
	titulo: (d: T) => string;
	url: (id: string) => string;
	nuevo: (existing: string[]) => T;
	/** Copia la estructura de una entrada anterior al crear una nueva */
	copiar?: { label: (prev: T) => string; apply: (actual: T, prev: T) => T };
	/** Qué entrada se ofrece copiar al crear una nueva (por defecto, la última por nombre de archivo) */
	previo?: (existing: string[], nuevo: T) => string | undefined;
	/** Dirección para crear una edición nueva de esta entrada (solo lo que puede repetirse) */
	nuevaEdicion?: (d: T, id: string) => string | undefined;
	/** Si no se puede eliminar, el motivo (p. ej. porque otro sitio de la web enlaza a ello) */
	noBorrar?: (id: string) => string | undefined;
}

const MB = 1024 * 1024;

/* ───────────── Miembros ───────────── */

const miembroSchema: ObjSchema = {
	title: (m) => m?.nombre || 'Persona sin nombre',
	nameKey: 'nombre',
	fields: [
		{ key: 'nombre', label: 'Nombre', type: 'text', placeholder: 'Nombre y apellido' },
		{ key: 'roles', label: 'Rol o cargo', type: 'tags', group: 'roles', placeholder: 'Escribe o elige un rol…', hint: 'Los roles nuevos se guardan para los próximos cursos. Déjalo vacío para miembros sin cargo.' },
		{ key: 'foto', label: 'Foto', type: 'image', formato: 'retrato', hint: 'Vertical 2:3 (por ejemplo, 1200 × 1800 px). Se optimiza sola.' },
		{ key: 'fotoHover', label: 'Foto al pasar el ratón', type: 'image', formato: 'retrato', hint: 'Opcional: la foto "divertida" que aparece al pasar el cursor. Vertical 2:3, como la principal.' },
	],
};

const seccionMiembrosSchema: ObjSchema = {
	title: (s) => s?.titulo || 'Sección sin título',
	nameKey: 'titulo',
	fields: [
		{ key: 'titulo', label: 'Título de la sección', type: 'text', placeholder: 'Junta, Vocales, Miembros…' },
		{
			key: 'orden', label: 'Orden de las personas', type: 'select',
			hint: 'En Junta y Vocales suele ir el orden que tú elijas (con ↑ ↓); en Miembros, alfabético.',
			options: () => [
				{ value: 'alfabetico', label: 'Alfabético (por nombre)' },
				{ value: 'manual', label: 'El que yo elija (con ↑ ↓)' },
			],
		},
		{
			key: 'miembros', label: 'Personas', type: 'list', item: miembroSchema, addLabel: 'Añadir persona',
			newItem: () => ({ nombre: '', roles: [], foto: '', fotoHover: '' }),
			reutilizar: {
				donde: 'otros cursos',
				todos: (d: Curso) => d.secciones.flatMap((s) => s.miembros),
				clave: (m) => (m?.nombre ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
				ficha: (m, d: Curso) => ({ titulo: m.nombre, sub: `${m.roles.join(', ') || 'Miembro'} · ${cursoCorto(d.curso)}`, foto: m.foto }),
				// Mismas fotos (no se duplican) y mismo rol, que luego se puede cambiar
				copia: (m) => ({ nombre: m.nombre, roles: [...m.roles], foto: m.foto, fotoHover: m.fotoHover }),
			},
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
			secciones: [{ titulo: 'Junta', orden: 'manual' }, { titulo: 'Vocales', orden: 'manual' }, { titulo: 'Miembros', orden: 'alfabetico' }],
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
		{ key: 'media', label: 'Imagen o vídeo (opcional)', type: 'image', media: true, maxSize: 15 * MB, formato: 'cartel', hint: 'Si es un cartel: A3, horizontal o vertical (por ejemplo, 2000 × 1414 px).' },
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
			{ key: 'portada', label: 'Imagen de portada', type: 'image', media: true, maxSize: 15 * MB, formato: 'cartel', hint: 'El cartel de la edición: A3, horizontal o vertical (por ejemplo, 2000 × 1414 px).' },
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

/* ───────────── Proyectos, Talleres, Servicios y Noticias ───────────── */

/** Entradas genéricas de cada sección y sus ediciones (lo escribe el menú en la página: #series-data). */
type Serie = { id: string; titulo: string; ediciones: string[]; resumen?: string; portada?: string; oculto?: boolean };
const series = (seccion: SeccionKey): Serie[] => {
	try { return JSON.parse(document.getElementById('series-data')?.textContent || '{}')[seccion] ?? []; } catch { return []; }
};
const serieDe = (seccion: SeccionKey, id: string) => (id ? series(seccion).find((s) => s.id === id) : undefined);

function entradaKind(seccion: SeccionKey): DocKind<Entrada> {
	const sec = SECCIONES[seccion];
	const el = sec.singular === 'noticia' ? 'la' : 'el';
	const serieField: Field = {
		key: 'serie', label: '¿Es una edición de algo que se repite?', type: 'select',
		hint: `Por ejemplo, «Octubre Robótico 2025» es una edición de «Octubre Robótico». Así sale agrupado en el menú y en la página genérica.`,
		options: () => {
			const yo = document.getElementById('page-root')?.dataset.id;
			return [
				{ value: '', label: `No: es ${el === 'la' ? 'una' : 'un'} ${sec.singular} independiente o genérico` },
				...series(seccion).filter((s) => s.id !== yo).map((s) => ({ value: s.id, label: `Sí, de «${s.titulo}»` })),
			];
		},
	};
	const incluyeField: Field = {
		key: 'incluye', label: `${sec.titulo} de esta edición (opcional)`, type: 'refs',
		hint: `Marca los ${sec.titulo.toLowerCase()} que tienen su propia página: saldrán como tarjetas enlazadas. Si no marcas ninguno, el bloque no aparece.`,
		options: () => {
			const yo = document.getElementById('page-root')?.dataset.id;
			// Talleres sueltos: ni este, ni los que tienen ediciones (Octubre Robótico)
			return series(seccion).filter((x) => x.id !== yo && !x.ediciones.length)
				.map((x) => ({ value: x.id, label: x.titulo, sub: x.oculto ? 'oculto' : undefined }));
		},
	};
	return {
		kind: seccion,
		nombre: sec.singular,
		dir: `src/content/${seccion}`,
		normalize: normalizeEntrada,
		render: (d, ctx) => renderEntrada(d, ctx, seccion, serieDe(seccion, d.serie),
			series(seccion).filter((x) => !x.oculto).map((x) => ({ id: x.id, titulo: x.titulo, resumen: x.resumen ?? '', portada: x.portada ?? '' }))),
		// La dirección se fija al crearla y no cambia aunque se edite el título (para no romper enlaces).
		fileId: (d, actual) => actual ?? slugify(d.titulo),
		validate: (d) =>
			!d.titulo.trim() ? `Ponle un título a ${el} ${sec.singular}.`
			: sec.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? 'Pon la fecha de la noticia.'
			: null,
		mediaFolder: (d) => `fotos/${seccion}/${slugify(d.titulo) || 'nuevo'}`,
		titulo: (d) => d.titulo || sec.nuevo,
		url: (id) => `${seccion}/${id}`,
		schema: {
			title: (d) => d?.titulo || sec.nuevo,
			nameKey: 'titulo',
			fields: [
				{ key: 'titulo', label: 'Título', type: 'text' },
				...(sec.ediciones ? [serieField] : []),
				{ key: 'fecha', label: sec.fecha ? 'Fecha' : 'Fecha (opcional)', type: 'date', hint: sec.fecha ? undefined : 'Sirve para ordenar: lo más reciente sale primero. En las ediciones, ponla siempre.' },
				{ key: 'etiquetas', label: 'Etiquetas', type: 'tags', group: seccion, placeholder: 'Escribe o elige…', hint: seccion === 'proyectos' ? 'Por ejemplo "En desarrollo" o "Finalizado". Sirven para filtrar el listado.' : 'Sirven para filtrar el listado. Las nuevas se guardan para la próxima vez.' },
				{ key: 'resumen', label: 'Resumen', type: 'text', hint: 'Una o dos frases. Sale en el listado y debajo del título.' },
				{ key: 'portada', label: 'Imagen principal', type: 'image', media: true, maxSize: 15 * MB, ...(sec.ediciones ? { formato: 'cartel' as const, hint: 'Normalmente el cartel: A3, horizontal o vertical (por ejemplo, 2000 × 1414 px).' } : {}) },
				{ key: 'cuerpo', label: 'Contenido', type: 'markdown', rows: 14 },
				...(sec.ediciones ? [incluyeField] : []),
				{ key: 'galeria', label: 'Galería de fotos', type: 'images' },
				...(seccion === 'noticias' ? [] : [
					{ key: 'descMenu', label: 'Descripción corta en el menú (opcional)', type: 'text', placeholder: sec.ediciones ? 'C, Python, Linux, PCB…' : '', hint: 'Sale en gris debajo del título en el desplegable. Una línea como mucho.' } as Field,
					{ key: 'enListado', label: `Mostrar en el menú y en la lista de ${sec.titulo}`, type: 'check', hint: sec.ediciones ? 'Desmárcalo si este taller solo va dentro de otro (por ejemplo, dentro de un Octubre Robótico).' : undefined } as Field,
					{ key: 'destacado', label: 'Destacar en el menú', type: 'check', hint: 'Sale el primero del desplegable, con una estrella y una franja naranja. Úsalo para lo importante del momento (por ejemplo, el Octubre Robótico en septiembre).' } as Field,
				]),
				{ key: 'oculto', label: 'Ocultar', type: 'check', hint: `No sale en ningún sitio de la web, pero no se borra: puedes volver a mostrarlo cuando quieras (por ejemplo, ${el === 'la' ? 'una' : 'un'} ${sec.singular} que un año no se hace).` },
			],
		},
		nuevo: () => {
			// "+ Nueva edición" llega con ?serie=octubre-robotico
			const s = serieDe(seccion, new URLSearchParams(location.search).get('serie') ?? '');
			return normalizeEntrada({
				fecha: sec.fecha ? new Date().toISOString().slice(0, 10) : '',
				serie: s?.id ?? '',
				titulo: s ? `${s.titulo} ${new Date().getFullYear()}` : '',
			});
		},
		previo: (_, d) => serieDe(seccion, d.serie)?.ediciones[0],
		nuevaEdicion: !sec.ediciones ? undefined : (d, id) => (d.serie ? undefined : `editar?tipo=${seccion}&serie=${encodeURIComponent(id)}`),
		copiar: {
			label: (prev) => `Copiar el contenido de «${prev.titulo}»`,
			apply: (actual, prev) => ({ ...actual, etiquetas: [...prev.etiquetas], resumen: prev.resumen, cuerpo: prev.cuerpo }),
		},
	};
}

/* ───────────── Apartados sueltos: Colaboradores, Contacto, Participa… ───────────── */

/** Direcciones que ya usa la web: un apartado no puede llamarse así */
const RESERVADAS = ['admin', 'buscar', 'editar', 'cybertech', 'miembros', 'proyectos', 'talleres', 'servicios', 'noticias', 'fotos', 'marca', 'fuentes', 'media'];

export const paginasKind: DocKind<Pagina> = {
	kind: 'paginas',
	nombre: 'apartado',
	dir: 'src/content/paginas',
	normalize: normalizePagina,
	render: renderPagina,
	fileId: (d, actual) => {
		if (actual) return actual;
		const s = slugify(d.titulo);
		return RESERVADAS.includes(s) ? `${s}-reset` : s;
	},
	validate: (d) => (d.titulo.trim() ? null : 'Ponle un título al apartado.'),
	mediaFolder: (d) => `fotos/paginas/${slugify(d.titulo) || 'nuevo'}`,
	titulo: (d) => d.titulo || 'Nuevo apartado',
	url: (id) => id,
	schema: {
		title: (d) => d?.titulo || 'Nuevo apartado',
		nameKey: 'titulo',
		fields: [
			{ key: 'titulo', label: 'Título', type: 'text', placeholder: 'Colaboradores, Contacto…' },
			{ key: 'intro', label: 'Frase de presentación', type: 'text', hint: 'Sale debajo del título, en grande.' },
			{ key: 'cuerpo', label: 'Contenido', type: 'markdown', rows: 14, hint: 'Usa "Subtítulo" para separar bloques (por ejemplo, un colaborador por subtítulo).' },
			{ key: 'imagen', label: 'Imagen (opcional)', type: 'image', media: true, maxSize: 15 * MB, hint: 'Sale al lado del texto.' },
			{ key: 'menu', label: 'Mostrar en el menú «Conócenos»', type: 'check' },
			{ key: 'orden', label: 'Posición en el menú', type: 'number', hint: '1 = el primero. Si lo dejas en 0, va al final (por orden alfabético).' },
		],
	},
	nuevo: () => normalizePagina({ menu: true }),
	noBorrar: (id) => (id === 'participa' ? 'Este apartado no se puede eliminar: el botón «Únete» de toda la web lleva aquí. Puedes cambiar su texto.' : undefined),
};

export const kinds: Record<string, DocKind> = {
	paginas: paginasKind,
	miembros: miembrosKind,
	cybertech: cybertechKind,
	proyectos: entradaKind('proyectos'),
	talleres: entradaKind('talleres'),
	servicios: entradaKind('servicios'),
	noticias: entradaKind('noticias'),
};
