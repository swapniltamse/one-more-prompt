#!/bin/bash
# /chill installer — runs once after git clone
# Sets up config.yaml and registers the PostToolUse hook in ~/.claude/settings.json

set -e

SKILL_DIR="$HOME/.claude/skills/chill"
CONFIG="$SKILL_DIR/config.yaml"
SETTINGS="$HOME/.claude/settings.json"

echo ""
echo "Setting up /chill..."
echo ""

# ── Step 1: config.yaml ──────────────────────────────────────────────────────

if [ -f "$CONFIG" ]; then
  echo "config.yaml already exists. Skipping config setup."
  echo "Edit $CONFIG to change your settings."
else
  echo "Let's set up your config."
  echo ""

  read -p "Your first name: " NAME
  echo ""
  echo "Pick your language:"
  echo "  hi     Hindi (Bollywood tapori)"
  echo "  mr     Marathi (Pune/Mumbai tapori)"
  echo "  ar     Egyptian Arabic"
  echo "  ta     Tamil (Kollywood/Rajinikanth)"
  echo "  kn     Kannada (Sandalwood/KGF)"
  echo "  es     Spanish (LatAm)"
  echo "  pt     Portuguese (Brazilian)"
  echo "  en-ie  Irish English (In Bruges)"
  echo "  en     English"
  read -p "Language code [hi]: " LANG
  LANG="${LANG:-hi}"
  echo ""

  read -p "Timezone (e.g. America/New_York, Asia/Kolkata) [America/New_York]: " TZ
  TZ="${TZ:-America/New_York}"
  echo ""

  read -p "Path to your Obsidian Claude Sessions folder (leave blank to skip): " OBSIDIAN

  cat > "$CONFIG" <<EOF
name: $NAME
language: $LANG
timezone: $TZ

thresholds:
  - hour: 21    # 9pm  — tier 1: gentle nudge
  - hour: 23    # 11pm — tier 2: firmer
  - hour: 1     # 1am  — tier 3: no more jokes

snooze_minutes: 30
calendar: false
obsidian_log: "$OBSIDIAN"
EOF

  echo ""
  echo "config.yaml saved."
fi

# ── Step 2: hook registration ────────────────────────────────────────────────

HOOK_CMD="bash ~/.claude/skills/chill/hook.sh"

python3 - <<PYEOF
import json, os, sys

settings_path = os.path.expanduser("~/.claude/settings.json")
hook_cmd = "$HOOK_CMD"

# Load or create settings
if os.path.exists(settings_path):
    with open(settings_path, "r") as f:
        try:
            settings = json.load(f)
        except json.JSONDecodeError:
            print("ERROR: ~/.claude/settings.json is not valid JSON. Fix it and re-run install.sh.")
            sys.exit(1)
else:
    settings = {}

# Navigate to hooks.PostToolUse, creating structure as needed
hooks = settings.setdefault("hooks", {})
post_tool_use = hooks.setdefault("PostToolUse", [])

# Check if our hook is already registered (idempotent)
for entry in post_tool_use:
    for h in entry.get("hooks", []):
        if h.get("command") == hook_cmd:
            print("Hook already registered. Nothing to do.")
            sys.exit(0)

# Append our hook entry
post_tool_use.append({
    "matcher": "*",
    "hooks": [
        {
            "type": "command",
            "command": hook_cmd
        }
    ]
})

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)

print("Hook registered in ~/.claude/settings.json")
PYEOF

# ── Done ─────────────────────────────────────────────────────────────────────

NAME_DISPLAY=$(grep '^name:' "$CONFIG" | awk '{print $2}' | tr -d '"')
LANG_DISPLAY=$(grep '^language:' "$CONFIG" | awk '{print $2}' | tr -d '"')
NAME_DISPLAY="${NAME_DISPLAY:-friend}"
LANG_DISPLAY="${LANG_DISPLAY:-en}"

echo ""
echo "Done. Claude will remind $NAME_DISPLAY starting at 9pm (language: $LANG_DISPLAY)."
echo "Test it now: type /chill in any Claude Code session."
echo ""
