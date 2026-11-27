# Security Considerations

- **Auth:** JWT (passport-jwt) with bcrypt-hashed passwords. Roles: ADMIN, OPERATOR, CLIENT; staff also have a `StaffProfile` with per-profile permissions. Every controller route must enforce role/profile; never add a route without a guard unless it is intentionally public (health, client portal link, payment webhook).
- **Authorization by ownership:** client and portal endpoints must filter by the authenticated client's id; never trust an id from the body or URL alone.
- **Secrets:** `.env*` is gitignored (only `.env.example` is committed). Secrets: `JWT_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`. In production they live in Vercel environment variables. Never print or commit them.
- **Input validation:** global `ValidationPipe` with DTOs (class-validator) in `src/main.ts`; keep DTOs strict. Prisma parameterizes queries; avoid `$queryRaw` with string interpolation.
- **Personal data:** the system stores client name, phone, e-mail and CNPJ. Treat CNPJ and contacts as personal data (LGPD): do not log them, do not return them to other clients, mask them in logs and error messages.
- **Payments:** the Mercado Pago webhook must validate its signature with `MERCADO_PAGO_WEBHOOK_SECRET` and be idempotent (a repeated notification must not post cash twice). Never store card data; PIX and manual only.
- **CORS:** same-domain in production; `CORS_ORIGIN` restricts origins when set. Do not leave it open (`true`) in production.
- **Serverless:** Vercel functions are stateless; use the pooled `DATABASE_URL` at runtime and `DIRECT_URL` only for migrations.
- **Dependencies:** run `npm audit` before releases; prefer pinned, maintained packages.
