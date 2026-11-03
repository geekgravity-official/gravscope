import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const files = ['dist/gravscope.modern.js', 'dist/gravscope.modern.cjs', 'dist/gravscope.modern.iife.js'];

for (const file of files) {
  const code = readFileSync(file);
  const text = code.toString('utf8');
  if (text.includes('core-js') || text.includes('regeneratorRuntime') || text.includes('regenerator-runtime')) {
    throw new Error(`${file} still contains a language polyfill`);
  }
  const gzip = gzipSync(code).length;
  console.log(`${file}: ${(code.length / 1024).toFixed(1)} kB, gzip ${(gzip / 1024).toFixed(1)} kB`);
}

console.log(`modern bundles have no core-js or regenerator: ${files.join(', ')}`);
