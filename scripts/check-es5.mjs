import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;
const files = ['dist/gravscope.js', 'dist/gravscope.cjs', 'dist/gravscope.iife.js'];
const problems = [];

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  const ast = parse(code, { sourceType: 'unambiguous', plugins: [] });
  traverse(ast, {
    VariableDeclaration(path) {
      if (path.node.kind !== 'var') problems.push(`${file}:${path.node.loc?.start.line} ${path.node.kind}`);
    },
    ArrowFunctionExpression(path) {
      problems.push(`${file}:${path.node.loc?.start.line} arrow`);
    },
    Class(path) {
      problems.push(`${file}:${path.node.loc?.start.line} class`);
    },
    Function(path) {
      if (path.node.async) problems.push(`${file}:${path.node.loc?.start.line} async`);
      if (path.node.generator) problems.push(`${file}:${path.node.loc?.start.line} generator`);
    },
    ForOfStatement(path) {
      problems.push(`${file}:${path.node.loc?.start.line} for-of`);
    },
    TemplateLiteral(path) {
      problems.push(`${file}:${path.node.loc?.start.line} template`);
    },
    OptionalMemberExpression(path) {
      problems.push(`${file}:${path.node.loc?.start.line} optional`);
    },
    OptionalCallExpression(path) {
      problems.push(`${file}:${path.node.loc?.start.line} optional-call`);
    },
    LogicalExpression(path) {
      if (path.node.operator === '??') problems.push(`${file}:${path.node.loc?.start.line} nullish`);
    },
    SpreadElement(path) {
      problems.push(`${file}:${path.node.loc?.start.line} spread`);
    },
    RestElement(path) {
      problems.push(`${file}:${path.node.loc?.start.line} rest`);
    },
    AwaitExpression(path) {
      problems.push(`${file}:${path.node.loc?.start.line} await`);
    },
    ObjectMethod(path) {
      problems.push(`${file}:${path.node.loc?.start.line} object-method`);
    },
  });
}

if (problems.length) {
  console.error(problems.slice(0, 40).join('\n'));
  console.error(`${problems.length} ES5 violations`);
  process.exit(1);
}

console.log(`ES5 syntax ok: ${files.join(', ')}`);
