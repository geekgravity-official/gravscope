import babel from '@rollup/plugin-babel';
import { fileURLToPath } from 'node:url';
import { defineConfig, type LibraryOptions } from 'vite';

const modernShim = fileURLToPath(new URL('./src/ui/legacy-dom-empty.ts', import.meta.url));

// esbuild stops at ES2015, which still emits const/let. Babel takes the
// bundle the rest of the way to ES5 for old WebViews. A post-build script
// rewrites template strings that the es2015 minifier puts back.
const legacyTargets = { ie: '11', ios: '9', android: '4.4' };

function legacySyntax() {
  return babel({
    babelHelpers: 'bundled',
    extensions: ['.js', '.ts'],
    exclude: /node_modules/,
    presets: [
      [
        '@babel/preset-env',
        {
          targets: legacyTargets,
          modules: false,
          bugfixes: true,
          useBuiltIns: 'usage',
          corejs: 3,
        },
      ],
    ],
  });
}

function legacyBuild(lib: LibraryOptions, emptyOutDir: boolean) {
  return {
    build: {
      emptyOutDir,
      sourcemap: 'hidden' as const,
      target: 'es2015' as const,
      lib,
      rollupOptions: {
        output: {
          generatedCode: 'es5' as const,
        },
        plugins: [legacySyntax()],
      },
    },
  };
}

function modernBuild(lib: LibraryOptions) {
  return {
    plugins: [
      {
        name: 'gravscope-drop-dom-shim',
        enforce: 'pre' as const,
        resolveId(source: string) {
          if (source === './legacy-dom' || source.endsWith('/legacy-dom.ts') || source.endsWith('/legacy-dom')) {
            return modernShim;
          }
          return null;
        },
      },
    ],
    build: {
      emptyOutDir: false,
      sourcemap: 'hidden' as const,
      target: 'es2020' as const,
      lib,
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return legacyBuild({
      entry: 'src/legacy.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'gravscope.js' : 'gravscope.cjs'),
    }, true);
  }

  if (mode === 'iife') {
    return legacyBuild({
      entry: 'src/iife-legacy.ts',
      name: 'GravScope',
      formats: ['iife'],
      fileName: () => 'gravscope.iife.js',
    }, false);
  }

  if (mode === 'modern') {
    return modernBuild({
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'gravscope.modern.js' : 'gravscope.modern.cjs'),
    });
  }

  if (mode === 'modern-iife') {
    return modernBuild({
      entry: 'src/iife.ts',
      name: 'GravScope',
      formats: ['iife'],
      fileName: () => 'gravscope.modern.iife.js',
    });
  }

  return {
    server: { port: 5173, host: '127.0.0.1' },
    preview: { port: 4173, host: '127.0.0.1' },
  };
});
