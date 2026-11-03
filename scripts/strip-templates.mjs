import { readFileSync, writeFileSync } from 'node:fs';
import { transformAsync } from '@babel/core';

const files = ['dist/gravscope.js', 'dist/gravscope.cjs', 'dist/gravscope.iife.js'];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes('`')) continue;
  const result = await transformAsync(source, {
    babelrc: false,
    configFile: false,
    filename: file,
    sourceMaps: true,
    inputSourceMap: JSON.parse(readFileSync(`${file}.map`, 'utf8')),
    plugins: [['@babel/plugin-transform-template-literals', { loose: true }]],
  });
  if (!result?.code) throw new Error(`Babel produced no code for ${file}`);
  writeFileSync(file, result.code);
  if (result.map) writeFileSync(`${file}.map`, JSON.stringify(result.map));
  console.log(`rewrote templates in ${file}`);
}
