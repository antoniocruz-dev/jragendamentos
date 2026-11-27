# Architecture

- **Two services, one domain.** `vercel.json` routes `/api/*` to the NestJS service (repo root) and everything else to the Next.js service (`front-end/frontend`). The browser calls the API on the same origin; in dev, Next (:3000) calls the API (:3001).
- **Backend is feature-modular NestJS:** one folder per domain (`work-orders`, `financial`, `clients`...), each with controller, service, DTOs. Cross-cutting code (stock logic) is in `src/common/`.
- **Money logic has a single source of truth:** `src/financial/financial-calc.ts`. Reuse `computeOrder`; do not recompute totals elsewhere.
- **Stock and cash are updated inside Prisma transactions** together with the O.S. status change (approve, bill, cancel). Keep it that way so a failure never leaves stock and status out of sync.
- **Frontend:** Next.js App Router with Cache Components. Any component using `usePathname` must be inside a `Suspense` boundary in the layout. Design tokens are in `front-end/frontend/src/app/globals.css` (Tailwind v4 `@theme`); shared UI in `src/components/ui` and `src/components/crud.tsx`.
- **Auth session** is client-side (localStorage key `jr_auth`), read through `src/services/auth`; HTTP goes through `src/services/api.ts`.
- **Do not** use `next/image` optimization (the `/_next/image` endpoint returns 404 in this multi-service Vercel setup); pass `unoptimized`.
- **Windows dev machine:** Node needs `C:/...` style paths, not `/c/...`.
