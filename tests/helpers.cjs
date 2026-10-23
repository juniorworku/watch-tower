const ts = require('typescript');
const fs = require('node:fs');
function compile(path, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', 'module', code)(mod.exports, id => Object.hasOwn(imports, id) ? imports[id] : require(id), mod);
  return mod.exports;
}
const lifecycle = compile('lib/data/lifecycle.ts');
const workflows = compile('lib/data/workflows.ts', { './lifecycle': lifecycle });
module.exports = { compile, lifecycle, workflows };
