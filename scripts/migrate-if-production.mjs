// Aplica as migrations do Prisma durante o build da Vercel, só no deploy de produção.
//
// Por quê: as variáveis do banco são "sensíveis" na Vercel e não podem ser baixadas pela CLI,
// então a migration roda aqui, onde DIRECT_URL está disponível. Fora da produção (build local,
// previews de branch) não faz nada, para um preview nunca alterar o banco de produção.
// Se a migration falhar, o build falha e a versão atual continua no ar.
import { execSync } from 'node:child_process';

if (process.env.VERCEL_ENV !== 'production') {
  console.log(`[migrate] VERCEL_ENV=${process.env.VERCEL_ENV ?? '(não definido)'}: migrations não aplicadas.`);
  process.exit(0);
}

console.log('[migrate] Deploy de produção: aplicando migrations (prisma migrate deploy)...');
execSync('npx prisma migrate deploy', { stdio: 'inherit' });
