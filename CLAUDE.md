@AGENTS.md

# Claude Code specifics

- Use Plan Mode before touching `src/financial/`, `src/work-orders/` status transitions, or `src/prisma/schema.prisma`.
- Path-scoped rules live in `.claude/rules/`; the validation hook is configured in `.claude/settings.json`.
