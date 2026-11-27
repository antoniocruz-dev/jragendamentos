# Hooks

`pre-commit-check.mjs` runs before any `git commit` made by Claude Code (PreToolUse on the Bash and PowerShell tools, wired in `.claude/settings.json`).
It runs the backend typecheck, the frontend typecheck and the frontend lint, and blocks the commit (exit 2) if any fails, so the error goes back to the AI to fix.

- The command uses `$CLAUDE_PROJECT_DIR` and the script resolves the repo root from its own location, so it works from any subfolder. Keep it that way: if `node` cannot find the script it exits 1, which Claude Code treats as a non-blocking error and the commit goes through unchecked.
- It is a Claude Code hook, not a git hook: commits made by hand (terminal, VS Code, Antigravity) are not checked by it.

Hook input arrives as JSON on stdin (`tool_input.command`), not in an environment variable.
