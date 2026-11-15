/**
 * MODO LOCAL DEL EDITOR (solo con `astro dev`, nunca en la web publicada).
 * Permite usar el modo edición sin token: los cambios se escriben directamente
 * en los archivos de este ordenador. Después se revisan y se hace commit a mano.
 */
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
// Solo se puede leer/escribir aquí:
const ALLOWED = ['src/content/', 'src/data/etiquetas.json', 'public/fotos/'];

function safe(path) {
	const abs = resolve(ROOT, String(path || ''));
	const rel = relative(ROOT, abs).split(sep).join('/');
	if (rel.startsWith('..') || !ALLOWED.some((a) => rel === a || rel.startsWith(a))) {
		throw Object.assign(new Error(`Ruta no permitida: ${rel}`), { status: 403 });
	}
	return abs;
}

const send = (res, status, body) => {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify(body));
};

async function body(req) {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function editorLocal() {
	return {
		name: 'reset-editor-local',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/__editor-local', async (req, res) => {
				try {
					const url = new URL(req.url, 'http://x');
					if (req.method === 'GET' && url.pathname === '/file') {
						try { return send(res, 200, { text: await readFile(safe(url.searchParams.get('path')), 'utf8') }); }
						catch (e) { if (e.code === 'ENOENT') return send(res, 404, { message: 'No existe' }); throw e; }
					}
					if (req.method === 'GET' && url.pathname === '/dir') {
						try { return send(res, 200, { names: await readdir(safe(url.searchParams.get('path').replace(/\/?$/, '/'))) }); }
						catch (e) { if (e.code === 'ENOENT') return send(res, 200, { names: [] }); throw e; }
					}
					if (req.method === 'POST' && url.pathname === '/save') {
						const { changes } = await body(req);
						const targets = changes.map((c) => ({ ...c, abs: safe(c.path) })); // valida todo antes de escribir nada
						for (const c of targets) {
							if (c.delete) { await rm(c.abs, { force: true }); continue; }
							await mkdir(dirname(c.abs), { recursive: true });
							await writeFile(c.abs, c.b64 != null ? Buffer.from(c.b64, 'base64') : c.text);
						}
						server.config.logger.info(`[editor local] guardado: ${changes.map((c) => c.path).join(', ')}`);
						return send(res, 200, { ok: true });
					}
					send(res, 404, { message: 'No encontrado' });
				} catch (e) {
					send(res, e.status || 500, { message: e.message });
				}
			});
		},
	};
}
