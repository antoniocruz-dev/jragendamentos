# Business Rules & Domain Knowledge

Rules the code must never violate. The "Known gaps" section lists where the current code
still diverges from them; do not "fix" those silently, they are tracked as separate work.

## Work order (O.S.) flow

- Status flow: DRAFT → QUOTE → APPROVED → IN_PROGRESS ⇄ WAITING_PARTS / TESTING → COMPLETED → BILLED. BILLED and CANCELLED are final.
  Valid transitions: `allowedTransitions` in `src/work-orders/work-orders.service.ts`.
- **Only the client approves a quote, through the client portal.** Staff never approve on the client's behalf.
- Stock is deducted only at approval. Missing parts send the O.S. to WAITING_PARTS.
- Cancelling requires a reason. Cancelling a BILLED O.S. is Administrator-only with explicit confirmation; cash and stock are NOT reverted automatically (a manual refund pendency is created for audit).

## Financial and fiscal

- **Discount applies only to products (parts).** It never reduces labor, ISS base, or mechanic commission, and it can never exceed the parts total (creating or billing an O.S. with a larger discount is rejected).
- Per billed O.S.: parts sale = parts total − discount; labor = services total (no discount); total billed = parts sale + labor; gross profit = billed − parts cost.
- ISS = labor × ISS rate (parts are outside the ISS base, they fall under ICMS).
- **Commission = labor × 50%, fixed for every mechanic** (`COMMISSION_RATE` in `src/financial/financial-calc.ts`). There is no per-mechanic rate (`users.commission_rate` is no longer used).
- **O.S. result = gross profit − ISS − commission.**
- Values must be exact: `Prisma.Decimal` only, rounded to cents (half up) per O.S. and only then summed. Values are frozen at billing; later edits to rates or costs never rewrite billed O.S.s. One exception was approved by the owner on 2026-11-26: when "discount only on parts" and the fixed 50% commission were adopted, already billed O.S.s started being calculated by the new rule (labor, ISS and commission are derived by `computeOrder`, not stored). If a legacy O.S. has a discount larger than its parts total, the excess still comes out of labor so the billed total keeps matching the cash received.
- The system does NOT issue fiscal documents (no NFS-e/NF-e); it only calculates taxes for control.
- Tax regime (SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL, MEI) is set in the fiscal settings and must follow current Brazilian legislation. Never hardcode a rate or invent one: ISS is municipal (shop is in Parauapebas, PA; LC 116/2003 allows 2%-5%), Simples Nacional collects ISS inside the DAS, MEI pays a fixed amount. Rates are configurable and must be confirmed with the shop's accountant.

## Payments

- Payment is via Mercado Pago PIX (migrating to Nubank) or recorded manually. Receiving payment moves the O.S. to BILLED and posts the cash entry in one transaction.

## No duplicate records (global)

- The system never accepts a duplicate record; the API answers 409 with a message in Portuguese and the screen shows it (error toast from `fetchApi`). Approved by the owner on 2026-11-27.
- What counts as a duplicate (checks in `src/common/duplicates.ts` and in each service):
  - Client: same CPF/CNPJ, same phone (digits only, with or without 55) or same e-mail (case-insensitive). The client portal "Primeiro acesso" links to the existing client instead of creating another.
  - Vehicle: same license plate. Staff user: same e-mail.
  - Service / part: same name ignoring accents, case and extra spaces (an inactive one also counts: reactivate it instead). Part: also same SKU.
  - Appointment: any active appointment overlapping the same time slot.
- On edit the check only runs when the field changes, so an old duplicate stays editable in its other fields.

## Known gaps between rules and code (pending fixes)

1. Staff profiles (Administrador, Gerente Geral, Auxiliar Administrativo) can still approve quotes: `PATCH /work-orders/:id/approve` and the status update path (`src/work-orders/work-orders.service.ts`, `APPROVER_PROFILES`). Should be client-only via the portal.
