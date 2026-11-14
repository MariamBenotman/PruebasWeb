/** Prepara las fotos antes de subirlas: las reduce y comprime para que la web cargue rápido. */
import { slugify } from '../lib/render';

export interface Pending { bytes: Uint8Array; url: string }
/** Archivos subidos en esta sesión y aún no publicados: ruta (relativa a public/) → contenido */
export const pending = new Map<string, Pending>();

const MAX_SIDE = 1800;

export async function processFile(file: File, folder: string, nameHint: string, maxSize = 8 * 1024 * 1024): Promise<string> {
	const isVideo = file.type.startsWith('video/');
	const isPlain = isVideo || file.type === 'image/gif' || file.type === 'image/svg+xml';
	let blob: Blob = file;
	let ext = (file.name.split('.').pop() || 'bin').toLowerCase();

	if (!isPlain) {
		if (!file.type.startsWith('image/')) throw new Error('Ese archivo no es una imagen.');
		const bmp = await createImageBitmap(file);
		const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bmp.width * scale);
		canvas.height = Math.round(bmp.height * scale);
		canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
		const hasAlpha = file.type === 'image/png' || file.type === 'image/webp';
		blob = await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('No se pudo procesar la imagen.'))), hasAlpha ? 'image/webp' : 'image/jpeg', 0.84));
		ext = hasAlpha ? 'webp' : 'jpg';
	}
	if (blob.size > maxSize) {
		throw new Error(`El archivo pesa ${(blob.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${Math.round(maxSize / 1024 / 1024)} MB.${isVideo ? ' Recorta o comprime el vídeo.' : ''}`);
	}
	const id = Math.random().toString(36).slice(2, 6);
	const path = `${folder}/${slugify(nameHint || file.name.replace(/\.[^.]+$/, ''))}-${id}.${ext}`;
	pending.set(path, { bytes: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob) });
	return path;
}

export function pickFiles(opts: { multiple?: boolean; media?: boolean }): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = opts.media ? 'image/*,video/mp4,video/webm' : 'image/*';
		input.multiple = !!opts.multiple;
		input.addEventListener('change', () => resolve([...(input.files ?? [])]));
		input.click();
	});
}
