# Hooks

`pre-commit-check.mjs` runs before any `git commit` made by Claude Code (PreToolUse on Bash, wired in `.claude/settings.json`).
It runs the backend typecheck, the frontend typecheck and the frontend lint, and blocks the commit (exit 2) if any fails, so the error goes back to the AI to fix.

Hook input arrives as JSON on stdin (`tool_input.command`), not in an environment variable.
