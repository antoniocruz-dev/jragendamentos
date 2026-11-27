// Bloqueia `git commit` se o typecheck/lint falhar. Lê o JSON do hook em stdin.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Raiz do repositório a partir da localização deste arquivo (.claude/hooks/),
// para não depender da pasta em que a sessão estiver quando o commit for feito.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cmd = '';
try {
  cmd = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '';
} catch {}
// Aceita opções globais entre `git` e `commit` (ex.: `git -C pasta commit`, `git -c x=y commit`),
// sem atravessar separadores de comando (; & | quebra de linha).
if (!/\bgit\b[^;&|\r\n]*\scommit\b/.test(cmd)) process.exit(0);

const steps = [
  ['npx tsc --noEmit', '.'],
  ['npx tsc --noEmit', 'front-end/frontend'],
  ['npm run lint --silent -- --quiet', 'front-end/frontend'],
];
for (const [c, dir] of steps) {
  try {
    execSync(c, { cwd: resolve(root, dir), stdio: 'pipe' });
  } catch (e) {
    console.error(`Validação falhou (${c} em ${dir}). Corrija antes de commitar.\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    process.exit(2);
  }
}
