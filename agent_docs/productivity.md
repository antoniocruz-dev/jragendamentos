# Productivity & Tooling

- **Editors/agents:** Claude Code (Desktop app), Antigravity and VS Code. All read `AGENTS.md`; `CLAUDE.md` only imports it.
- **Vercel CLI** (`vercel ls`) to inspect deployments; the GitHub CLI (`gh`) is not installed here. Repo: antoniocruz-dev/jragendamentos. Pushing to `main` deploys to production, so test on a branch first (Vercel builds a preview per branch).
- **Prisma CLI** for migrations and `prisma studio`. Database is Neon (production) and a local Postgres for development.
- **OpenSpec** (`openspec/`) for proposing and tracking larger changes.
- **Seed:** `scripts/seed-demo.mjs` and `src/prisma/seed.ts` create demo data.
- **Git worktrees** are useful to test a change on a branch without disturbing `main`.
