# Project Context

JR Agendamentos / JR Garage Center: management system for an auto repair shop in
Parauapebas, PA (Brazil). Covers appointments, work orders (O.S.), catalog and stock,
financial/fiscal control, team, and two portals (client and mechanic). Initially used by
~10 people; a single developer maintains it. Production: https://app.jrgaragecenter.com.br

# Stack

- Backend (repo root): NestJS 12, Prisma 6, PostgreSQL (Neon), JWT auth (passport-jwt, bcrypt).
- Frontend (`front-end/frontend`): Next.js 16 (Cache Components), React 19, Tailwind CSS 4.
- Node 24 locally; deploy on Vercel as two services (see `vercel.json`): NestJS under `/api/*`, Next.js for everything else.
- Payments: Mercado Pago (PIX) today, Nubank planned; manual payment also supported.
- Spec-driven changes live in `openspec/`.

# Commands

```
# Install (backend, then frontend)
npm install
cd front-end/frontend && npm install

# Run dev (backend :3001, frontend :3000)
npm run start:dev
cd front-end/frontend && npm run dev

# Test
# No automated tests exist yet. Verify by running the app.

# Lint + typecheck
npx tsc --noEmit                                   # backend
cd front-end/frontend && npx tsc --noEmit && npm run lint   # frontend

# Build
npm run build
cd front-end/frontend && npm run build

# Database
npx prisma migrate dev          # create/apply a migration locally (schema: src/prisma/schema.prisma)
npm run prisma:migrate:deploy   # apply in production
```

# File Structure

```
src/                     NestJS modules: auth, clients, work-orders, appointments, catalog,
                         financial, payments, portal, mechanic, team, dashboard, health, common
src/prisma/              schema.prisma, migrations, seed
front-end/frontend/src/  app/ (routes), components/, services/ (api, auth), lib/
openspec/                specs and change proposals
scripts/                 seed-demo.mjs
```

# Workflow Rules

- Run backend and frontend typecheck plus frontend lint after code changes, before calling a task done (a pre-commit hook enforces it).
- All money math uses `Prisma.Decimal` through `src/financial/financial-calc.ts`; never `number` arithmetic or floats.
- Never change business rules (see `agent_docs/business-rules.md`) without asking first.
- Database changes always go through a Prisma migration; never edit production data by hand.
- Do not use `next/image` optimization (`/_next/image` returns 404 on this Vercel setup); use `unoptimized`.
- Conventional-style commit messages in Portuguese, one logical change per commit.

# Deeper Context (read when relevant)

- Business rules and domain logic: @agent_docs/business-rules.md
- Security practices for this project: @agent_docs/security.md
- Engineering standards and quality philosophy: @agent_docs/engineering-standards.md
- Architecture decisions: @agent_docs/architecture.md
- Productivity tools and workflows: @agent_docs/productivity.md
- Path-scoped conventions (frontend/backend): see `.claude/rules/`

# Keeping This File Current

If real work surfaces something that should be a permanent rule (a business rule, a security
constraint, an architectural decision, a mistake worth never repeating), do not apply it
silently: ask whether to add it, and add it to the right file above, not into this one.

# Response Language

Always respond in Brazilian Portuguese, regardless of the language used in the prompt.
