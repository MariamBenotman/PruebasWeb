/**
 * Conexión con GitHub: la web guarda los cambios haciendo commits en el repositorio.
 * GitHub Actions vuelve a compilar y publicar la web en 1–2 minutos.
 */

const TOKEN_KEY = 'reset-admin-token';

declare global {
	interface Window {
		__site: { gh: { owner: string; repo: string; branch: string }; base: string };
		__img: (el: HTMLImageElement) => void;
		__imgAdmin?: (el: HTMLImageElement) => boolean;
	}
}

export const repo = () => window.__site.gh;

export const getToken = () => {
	try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class GitHubError extends Error {
	constructor(public status: number, message: string) { super(message); }
}

async function api<T = any>(path: string, init: RequestInit = {}, token = getToken()): Promise<T> {
	const res = await fetch(`https://api.github.com${path}`, {
		...init,
		cache: 'no-store',
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28',
			...(init.body ? { 'Content-Type': 'application/json' } : {}),
			...init.headers,
		},
	});
	if (!res.ok) {
		let msg = res.statusText;
		try { msg = (await res.json()).message || msg; } catch {}
		throw new GitHubError(res.status, msg);
	}
	return res.status === 204 ? (undefined as T) : res.json();
}

const R = () => `/repos/${repo().owner}/${repo().repo}`;

/** Comprueba que el token sirve para escribir en el repositorio. */
export async function checkToken(token: string) {
	const info = await api<any>(R(), {}, token);
	if (!info.permissions?.push) throw new GitHubError(403, 'El token no tiene permiso de escritura en el repositorio.');
	return info;
}

const b64ToUtf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const utf8ToB64 = (s: string) => bytesToB64(new TextEncoder().encode(s));
export function bytesToB64(bytes: Uint8Array) {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(bin);
}

/** Lee un archivo de texto del repositorio (versión más reciente, no la publicada). Devuelve null si no existe. */
export async function readFile(path: string): Promise<string | null> {
	try {
		const f = await api<any>(`${R()}/contents/${encodeURI(path)}?ref=${repo().branch}&t=${Date.now()}`);
		return b64ToUtf8(f.content);
	} catch (e) {
		if (e instanceof GitHubError && e.status === 404) return null;
		throw e;
	}
}

export async function listDir(path: string): Promise<string[]> {
	try {
		const items = await api<any[]>(`${R()}/contents/${encodeURI(path)}?ref=${repo().branch}&t=${Date.now()}`);
		return items.map((i) => i.name);
	} catch (e) {
		if (e instanceof GitHubError && e.status === 404) return [];
		throw e;
	}
}

export type FileChange =
	| { path: string; text: string }
	| { path: string; bytes: Uint8Array }
	| { path: string; delete: true };

/** Hace UN commit con todos los cambios (JSON, fotos, borrados). Devuelve el SHA del commit. */
export async function commit(changes: FileChange[], message: string): Promise<string> {
	const { branch } = repo();
	const ref = await api<any>(`${R()}/git/ref/heads/${branch}`);
	const parentSha: string = ref.object.sha;
	const parent = await api<any>(`${R()}/git/commits/${parentSha}`);

	const tree = await Promise.all(changes.map(async (c) => {
		if ('delete' in c) return { path: c.path, mode: '100644', type: 'blob', sha: null };
		const content = 'text' in c ? utf8ToB64(c.text) : bytesToB64(c.bytes);
		const blob = await api<any>(`${R()}/git/blobs`, { method: 'POST', body: JSON.stringify({ content, encoding: 'base64' }) });
		return { path: c.path, mode: '100644', type: 'blob', sha: blob.sha };
	}));

	const newTree = await api<any>(`${R()}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
	const newCommit = await api<any>(`${R()}/git/commits`, {
		method: 'POST',
		body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] }),
	});
	try {
		await api(`${R()}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
	} catch (e) {
		if (e instanceof GitHubError && e.status === 422) {
			throw new GitHubError(409, 'Alguien ha guardado otro cambio a la vez. Recarga la página y vuelve a intentarlo.');
		}
		throw e;
	}
	return newCommit.sha;
}

/** Estado de la publicación (GitHub Actions) para un commit. Devuelve null si no se puede consultar. */
export async function deployStatus(sha: string): Promise<'pendiente' | 'publicando' | 'publicado' | 'error' | null> {
	try {
		const r = await api<any>(`${R()}/actions/runs?head_sha=${sha}&per_page=5`);
		const run = r.workflow_runs?.[0];
		if (!run) return 'pendiente';
		if (run.status !== 'completed') return 'publicando';
		return run.conclusion === 'success' ? 'publicado' : 'error';
	} catch {
		return null;
	}
}

export const rawUrl = (path: string) => `https://raw.githubusercontent.com/${repo().owner}/${repo().repo}/${repo().branch}/${path}`;
