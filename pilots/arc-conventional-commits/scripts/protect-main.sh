#!/bin/bash
# Claude Code PreToolUse hook: blocks staging and commits directly to main/master.
# Reads JSON from stdin (Claude Code hook format), checks if the command
# is a git add or git commit and the current branch is main/master.
# Returns "ask" so the user sees a permission prompt and can override if needed.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only care about git add and git commit commands
if ! echo "$COMMAND" | grep -qE "^git (add|commit)"; then
  exit 0
fi

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  if echo "$COMMAND" | grep -qE "^git add"; then
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "You are about to stage files on main. Create a feature branch instead."
      }
    }'
  else
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "You are about to commit directly to main. Create a feature branch instead."
      }
    }'
  fi
  exit 0
fi

exit 0
