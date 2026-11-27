---
paths:
  - "src/**/*.ts"
---
# Backend Rules

- Money: `Prisma.Decimal` only, via `src/financial/financial-calc.ts`. No float arithmetic.
- Multi-step writes (status + stock + cash) run inside `prisma.$transaction`.
- Every route has an explicit guard/role check; validate input with DTOs (class-validator).
- Schema changes need a Prisma migration in `src/prisma/migrations`.
