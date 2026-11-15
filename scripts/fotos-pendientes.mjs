// Genera FOTOS-PENDIENTES.md: lista de todas las imágenes que usa la web y todavía no existen.
// Uso: npm run fotos
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PUB = join(ROOT, 'public');
const exists = (p) => existsSync(join(PUB, p));
const readJson = (dir) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.json')).sort().reverse()
	.map((f) => ({ id: f.replace('.json', ''), d: JSON.parse(readFileSync(join(ROOT, dir, f), 'utf8')) }));

const grupos = [];
const grupo = (titulo, nota = '') => { const g = { titulo, nota, items: [] }; grupos.push(g); return g; };
const add = (g, path, que, alt = []) => {
	if (!path || /^https?:/.test(path)) return;
	g.items.push({ path, que, ok: exists(path) || alt.some(exists) });
};

/* Marca */
const marca = grupo('Logos, fuente e imagen de portada', 'Los logos mejor en **SVG**. Si solo tienes PNG, usa el mismo nombre con .png (fondo transparente, mínimo 600 px de ancho).');
const logo = (n, que) => add(marca, `marca/${n}.svg`, que, [`marca/${n}.png`]);
logo('reset-logo-horizontal', 'Logo de Reset **con el nombre al lado**, en color (para fondo claro: cabecera)');
logo('reset-logo-horizontal-blanco', 'Logo de Reset con el nombre, **en blanco** (para fondo oscuro: pie de página)');
logo('reset-simbolo', 'Logo de Reset **solo el símbolo**, en color');
logo('reset-simbolo-blanco', 'Logo de Reset solo el símbolo, en blanco');
logo('cybertech-logo', 'Logo de Cybertech, en color');
logo('cybertech-logo-blanco', 'Logo de Cybertech, en blanco');
add(marca, 'marca/favicon.png', 'Icono de la pestaña del navegador (símbolo de Reset, PNG cuadrado 512×512)');
add(marca, 'fuentes/LTAtomatic.woff2', 'Fuente de marca LTAtomatic en formato .woff2 (si tienes .ttf/.otf, pásamela y la convierto)');
// Fotos del carrusel de la portada
for (const { d } of readJson('src/content/inicio')) (d.diapositivas ?? []).forEach((s, i) => add(marca, s.imagen, `Portada: diapositiva ${i + 1} «${s.titulo}» (horizontal, mínimo 1600 px de ancho)`));

/* Miembros */
for (const { d } of readJson('src/content/miembros')) {
	const g = grupo(`Miembros ${d.curso}`);
	add(g, d.fotoGrupo, 'Foto de grupo (horizontal)');
	for (const s of d.secciones ?? []) for (const m of s.miembros ?? []) {
		const rol = m.roles?.length ? m.roles.join(', ') : s.titulo;
		add(g, m.foto, `${m.nombre} · ${rol} — foto principal`);
		add(g, m.fotoHover, `${m.nombre} · ${rol} — foto al pasar el ratón`);
	}
}

/* Cybertech */
for (const { d } of readJson('src/content/cybertech')) {
	const g = grupo(`Cybertech ${d.anio}`);
	add(g, d.portada, 'Imagen de portada');
	for (const c of d.categorias ?? []) {
		add(g, c.media, `Categoría ${c.nombre}`);
		for (const p of c.pruebas ?? []) add(g, p.media, `Prueba ${p.nombre} (${c.nombre})`);
	}
	for (const s of d.secciones ?? []) add(g, s.media, `Bloque «${s.titulo}»`);
	(d.galeria ?? []).forEach((p, i) => add(g, p, `Galería, foto ${i + 1}`));
}

/* Proyectos, Talleres, Servicios y Noticias */
for (const [sec, titulo] of [['proyectos', 'Proyectos'], ['talleres', 'Talleres'], ['servicios', 'Servicios'], ['noticias', 'Noticias']]) {
	const g = grupo(titulo);
	for (const { d } of readJson(`src/content/${sec}`)) {
		add(g, d.portada, `«${d.titulo}» — imagen principal`);
		(d.galeria ?? []).forEach((p, i) => add(g, p, `«${d.titulo}» — galería, foto ${i + 1}`));
	}
}

/* Apartados (Colaboradores, Participa…) */
const gp = grupo('Apartados de Conócenos');
for (const { d } of readJson('src/content/paginas')) add(gp, d.imagen, `«${d.titulo}» — imagen`);

/* Salida */
const total = grupos.reduce((n, g) => n + g.items.length, 0);
const faltan = grupos.reduce((n, g) => n + g.items.filter((i) => !i.ok).length, 0);
let out = `# Fotos pendientes

> Archivo generado con \`npm run fotos\`. No lo edites a mano: vuelve a ejecutar el comando cuando añadas fotos.

**Faltan ${faltan} de ${total} imágenes.** Mientras falte una, la web muestra un recuadro azul con las iniciales o el nombre.

## Cómo añadirlas

- **La forma fácil:** entra en la web en modo edición (pie de página → *Acceso editores*), haz clic en la persona o el bloque y pulsa *Subir foto*. Se recorta, se optimiza y se guarda sola, con cualquier nombre de archivo.
- **A mano:** guarda el archivo en la carpeta \`public/\` del proyecto con **exactamente** la ruta de la columna derecha. Por ejemplo, \`fotos/miembros/2022-23/antonio-cameo.jpg\` va en \`public/fotos/miembros/2022-23/antonio-cameo.jpg\`. Las fotos de personas deben ser **.jpg** y **verticales 2:3** (por ejemplo, 1200 × 1800 px). Los carteles, **A3** horizontal o vertical (por ejemplo, 2000 × 1414 px).

`;
for (const g of grupos) {
	const miss = g.items.filter((i) => !i.ok);
	if (!g.items.length) continue;
	out += `\n## ${g.titulo} — ${miss.length ? `faltan ${miss.length} de ${g.items.length}` : `completo ✓`}\n\n`;
	if (g.nota) out += `${g.nota}\n\n`;
	if (!miss.length) continue;
	out += '| Qué es | Dónde guardarlo (dentro de `public/`) |\n|---|---|\n';
	for (const i of miss) out += `| ${i.que} | \`${i.path}\` |\n`;
}
writeFileSync(join(ROOT, 'FOTOS-PENDIENTES.md'), out);
console.log(`FOTOS-PENDIENTES.md: faltan ${faltan} de ${total} imágenes.`);
