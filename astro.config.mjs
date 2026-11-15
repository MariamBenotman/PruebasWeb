// @ts-check
import { defineConfig } from 'astro/config';
import { editorLocal } from './scripts/editor-local.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://mariambenotman.github.io',
	base: '/PruebasWeb',
	// Modo edición sin token mientras se trabaja en local (`astro dev`). No existe en la web publicada.
	vite: { plugins: [editorLocal()] },
});
