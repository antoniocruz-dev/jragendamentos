---
paths:
  - "front-end/frontend/src/**/*.{ts,tsx,css}"
---
# Frontend Rules

- Use design tokens from `globals.css` (`brand-*`, `neon-*`, `gold-*`, `surface-*`); no hard-coded hex colors.
- Forms use `Field`/`inputCls` from `src/components/crud.tsx` or `src/components/ui`; required fields get the `required` attribute (the asterisk is added by CSS, never type " *" in labels).
- No `any`: type `catch (err: unknown)` and use `errorMessage(err)` from `src/components/crud.tsx`.
- Components using `usePathname` must sit inside `Suspense`. Images use `next/image` with `unoptimized`.
