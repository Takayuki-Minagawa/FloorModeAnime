import { defineConfig } from 'vite';

export default defineConfig({
  base: '/FloorModeAnime/',
  build: {
    outDir: 'dist',
    // three-core is a lazy vendor chunk (~529 kB minified / ~132 kB gzip).
    // Keep the warning threshold just above that audited dependency boundary.
    chunkSizeWarningLimit: 550,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-addons',
              test: /node_modules[\\/]three[\\/]examples[\\/]jsm/,
              includeDependenciesRecursively: false,
              priority: 20,
            },
            {
              name: 'three-core',
              // three.module.js re-exports three.core.js. Keep the complete
              // package remainder together so vendor chunks never import the
              // application viewer chunk through a split re-export cycle.
              test: /node_modules[\\/]three[\\/]/,
              includeDependenciesRecursively: false,
              priority: 10,
            },
            {
              name: 'yaml',
              test: /node_modules[\\/]yaml[\\/]/,
              priority: 5,
            },
          ],
        },
      },
    },
  },
});
