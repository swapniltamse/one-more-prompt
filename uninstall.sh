#!/bin/bash
# /chill uninstaller — removes everything install.sh registered
# Safe to run multiple times. Does not delete your config.yaml by default.

SKILL_DIR="$HOME/.claude/skills/chill"
CONFIG="$SKILL_DIR/config.yaml"

echo ""
echo "Uninstalling /chill..."
echo ""
echo "This will remove:"
echo "  1. The PostToolUse hook from ~/.claude/settings.json"
echo "  2. Scheduled notifications (cron entries or Task Scheduler tasks)"
echo ""
echo "Your config.yaml will be kept unless you choose to remove it."
echo ""
read -p "Continue? [y/N]: " CONFIRM
CONFIRM="${CONFIRM:-N}"
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── OS detection ─────────────────────────────────────────────────────────────

detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif grep -qi microsoft /proc/version 2>/dev/null || [[ -n "$WSLENV" ]]; then
    echo "wsl"
  elif [[ -n "$MSYSTEM" ]] || command -v schtasks.exe &>/dev/null; then
    echo "windows"
  else
    echo "linux"
  fi
}

OS=$(detect_os)

# ── Step 1: Remove PostToolUse hook ──────────────────────────────────────────

echo ""
echo "Removing Claude Code hook..."

HOOK_CMD="bash ~/.claude/skills/chill/hook.sh"

python3 - <<PYEOF
import json, os, sys

settings_path = os.path.expanduser("~/.claude/settings.json")
hook_cmd = "$HOOK_CMD"

if not os.path.exists(settings_path):
    print("  ~/.claude/settings.json not found. Nothing to remove.")
    sys.exit(0)

with open(settings_path, "r") as f:
    try:
        settings = json.load(f)
    except json.JSONDecodeError:
        print("  settings.json is not valid JSON. Skipping.")
        sys.exit(0)

hooks = settings.get("hooks", {})
post_tool_use = hooks.get("PostToolUse", [])

original_len = len(post_tool_use)

# Remove entries that contain our hook command
filtered = []
for entry in post_tool_use:
    filtered_hooks = [h for h in entry.get("hooks", []) if h.get("command") != hook_cmd]
    if filtered_hooks:
        entry["hooks"] = filtered_hooks
        filtered.append(entry)

hooks["PostToolUse"] = filtered
settings["hooks"] = hooks

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)

removed = original_len - len(filtered)
if removed > 0:
    print(f"  Removed {removed} hook entry from ~/.claude/settings.json")
else:
    print("  Hook not found in settings.json. Nothing removed.")
PYEOF

# ── Step 2: Remove scheduled notifications ───────────────────────────────────

echo ""
echo "Removing scheduled notifications..."

if [ "$OS" = "windows" ] || [ "$OS" = "wsl" ]; then
  for tier in 1 2 3; do
    task_name="chill\\chill-tier${tier}"
    schtasks.exe /delete /tn "$task_name" /f 2>/dev/null \
      && echo "  Removed Task Scheduler task: $task_name" \
      || echo "  Task not found: $task_name (already removed or never created)"
  done
else
  if crontab -l 2>/dev/null | grep -q '# chill-tier'; then
    crontab -l 2>/dev/null | grep -v '# chill-tier' | grep -v 'hook.sh --notify' | crontab -
    echo "  Removed chill cron entries."
  else
    echo "  No chill cron entries found."
  fi
fi

# ── Step 3: Optional config removal ──────────────────────────────────────────

echo ""
if [ -f "$CONFIG" ]; then
  read -p "Remove config.yaml too? [y/N]: " REMOVE_CONFIG
  REMOVE_CONFIG="${REMOVE_CONFIG:-N}"
  if [[ "$REMOVE_CONFIG" =~ ^[Yy]$ ]]; then
    rm "$CONFIG"
    echo "  config.yaml removed."
  else
    echo "  config.yaml kept at $CONFIG"
  fi
fi

echo ""
echo "────────────────────────────────────────────────────────"
echo "  /chill uninstalled."
echo ""
echo "  The skill files remain at $SKILL_DIR"
echo "  To remove them: rm -rf $SKILL_DIR"
echo "────────────────────────────────────────────────────────"
echo ""
