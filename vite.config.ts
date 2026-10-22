import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		// ForceGraph3D is imported dynamically from onMount. Pre-bundle it and
		// its renderer dependencies before serving the page, avoiding a first-load
		// optimizer reload while the 3D module is already being requested.
		include: ['3d-force-graph', 'd3-force-3d', 'three']
	}
});
