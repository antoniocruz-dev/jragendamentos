// Bloqueia `git commit` se o typecheck/lint falhar. Lê o JSON do hook em stdin.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let cmd = '';
try {
  cmd = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '';
} catch {}
if (!/\bgit\s+commit\b/.test(cmd)) process.exit(0);

const steps = [
  ['npx tsc --noEmit', '.'],
  ['npx tsc --noEmit', 'front-end/frontend'],
  ['npm run lint --silent -- --quiet', 'front-end/frontend'],
];
for (const [c, cwd] of steps) {
  try {
    execSync(c, { cwd, stdio: 'pipe' });
  } catch (e) {
    console.error(`Validação falhou (${c} em ${cwd}). Corrija antes de commitar.\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    process.exit(2);
  }
}
