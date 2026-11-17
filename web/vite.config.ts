import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

// L'appli est construite en un seul fichier HTML (plus le manifeste et l'icône),
// pour pouvoir être servie par l'assistant local ou ouverte directement depuis un dossier.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: {
    outDir: '../appli',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
