# Productivity & Tooling

- **Editors/agents:** Claude Code (Desktop app), Antigravity and VS Code. All read `AGENTS.md`; `CLAUDE.md` only imports it.
- **Vercel CLI** (`vercel ls`) to inspect deployments; the GitHub CLI (`gh`) is not installed here. Repo: antoniocruz-dev/jragendamentos. Pushing to `main` deploys to production, so test on a branch first (Vercel builds a preview per branch).
- **Previews use the production database.** `DATABASE_URL` is set for both Preview and Production in Vercel, so anything created while testing a preview is real production data. Test with existing records or delete what you create. Previews do not apply migrations (`scripts/migrate-if-production.mjs`), so a branch with a new migration runs its code against the old production schema and may fail there; test schema changes locally.
- **Prisma CLI** for migrations and `prisma studio`. Database is Neon (production) and a local Postgres for development.
- **OpenSpec** (`openspec/`) for proposing and tracking larger changes.
- **Seed:** `scripts/seed-demo.mjs` and `src/prisma/seed.ts` create demo data.
- **Database cleanup:** `scripts/limpar-banco.mjs` deletes everything except one client's full history, the team, profile permissions, fiscal settings and named catalog items. It simulates by default and only deletes with `--executar`; the keep-list is hardcoded for the 2026-11-27 production cleanup, so edit it before reusing. Back up the Neon database first.
- **Git worktrees** are useful to test a change on a branch without disturbing `main`.
