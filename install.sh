#!/bin/bash
# /chill installer — runs once after git clone
# Sets up config.yaml, registers the PostToolUse hook, and optionally
# registers scheduled system notifications for when you're outside Claude Code.

set -e

SKILL_DIR="$HOME/.claude/skills/chill"
CONFIG="$SKILL_DIR/config.yaml"
SETTINGS="$HOME/.claude/settings.json"

echo ""
echo "Setting up /chill..."
echo ""

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
  echo "  en     English (Silicon Valley / Nolan)"
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

# ── Step 2: PostToolUse hook (Claude Code sessions) ──────────────────────────

echo ""
echo "Step 2: Registering Claude Code hook..."

HOOK_CMD="bash ~/.claude/skills/chill/hook.sh"

python3 - <<PYEOF
import json, os, sys

settings_path = os.path.expanduser("~/.claude/settings.json")
hook_cmd = "$HOOK_CMD"

if os.path.exists(settings_path):
    with open(settings_path, "r") as f:
        try:
            settings = json.load(f)
        except json.JSONDecodeError:
            print("ERROR: ~/.claude/settings.json is not valid JSON. Fix it and re-run install.sh.")
            sys.exit(1)
else:
    settings = {}

hooks = settings.setdefault("hooks", {})
post_tool_use = hooks.setdefault("PostToolUse", [])

for entry in post_tool_use:
    for h in entry.get("hooks", []):
        if h.get("command") == hook_cmd:
            print("  Hook already registered.")
            sys.exit(0)

post_tool_use.append({
    "matcher": "*",
    "hooks": [{"type": "command", "command": hook_cmd}]
})

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)

print("  Registered in ~/.claude/settings.json")
print("  This runs after every Claude Code tool call.")
PYEOF

# ── Step 3: System notifications (optional) ──────────────────────────────────

echo ""
echo "────────────────────────────────────────────────────────"
echo "  Step 3: System notifications (optional)"
echo "────────────────────────────────────────────────────────"
echo ""
echo "  The Claude Code hook only fires inside Claude Code."
echo "  System notifications cover everything else: claude.ai,"
echo "  Cursor, VS Code, or just a YouTube rabbit hole at 1am."
echo ""
echo "  What this will do:"

# Read thresholds from config
TIER1_HOUR=$(grep -A10 '^thresholds:' "$CONFIG" | grep '- hour:' | awk 'NR==1{print $3}')
TIER2_HOUR=$(grep -A10 '^thresholds:' "$CONFIG" | grep '- hour:' | awk 'NR==2{print $3}')
TIER3_HOUR=$(grep -A10 '^thresholds:' "$CONFIG" | grep '- hour:' | awk 'NR==3{print $3}')
TIER1_HOUR=${TIER1_HOUR:-21}
TIER2_HOUR=${TIER2_HOUR:-23}
TIER3_HOUR=${TIER3_HOUR:-1}

if [ "$OS" = "windows" ] || [ "$OS" = "wsl" ]; then
  echo "    - Creates 3 tasks in Windows Task Scheduler under 'chill\'"
  echo "      chill\chill-tier1  — fires at ${TIER1_HOUR}:00 daily"
  echo "      chill\chill-tier2  — fires at ${TIER2_HOUR}:00 daily"
  echo "      chill\chill-tier3  — fires at ${TIER3_HOUR}:00 daily"
  echo "    - Tasks run as your user account. No admin rights required."
  echo "    - Shows a Windows system tray notification with your message."
  echo "    - To view: open Task Scheduler > Task Scheduler Library > chill"
else
  echo "    - Adds 3 lines to your crontab (crontab -l to verify):"
  printf "      0 %s * * * bash %s/hook.sh --notify --force --tier=1\n" "$TIER1_HOUR" "$SKILL_DIR"
  printf "      0 %s * * * bash %s/hook.sh --notify --force --tier=2\n" "$TIER2_HOUR" "$SKILL_DIR"
  printf "      0 %s * * * bash %s/hook.sh --notify --force --tier=3\n" "$TIER3_HOUR" "$SKILL_DIR"
  echo "    - Sends a system notification (macOS: Notification Center,"
  echo "      Linux: notify-send)."
fi
echo ""
echo "  To remove everything later: bash $SKILL_DIR/uninstall.sh"
echo ""
read -p "  Set up system notifications? [y/N]: " SETUP_NOTIFY
SETUP_NOTIFY="${SETUP_NOTIFY:-N}"

if [[ "$SETUP_NOTIFY" =~ ^[Yy]$ ]]; then
  HOOK_PATH="$SKILL_DIR/hook.sh"

  if [ "$OS" = "windows" ] || [ "$OS" = "wsl" ]; then
    # Windows: use schtasks.exe with cygpath for reliable path conversion
    if command -v cygpath &>/dev/null; then
      WIN_BASH=$(cygpath -w "$(which bash)")
      WIN_HOOK=$(cygpath -w "$HOOK_PATH")
    else
      WIN_BASH="bash.exe"
      WIN_HOOK="$HOOK_PATH"
    fi

    register_task() {
      local hour=$1
      local tier=$2
      local task_name="chill\\chill-tier${tier}"
      local hour_padded
      hour_padded=$(printf "%02d" "$hour")
      echo "  Registering Task Scheduler task: $task_name at ${hour_padded}:00..."
      schtasks.exe /create \
        /tn "$task_name" \
        /tr "\"$WIN_BASH\" \"$WIN_HOOK\" --notify --force --tier=${tier}" \
        /sc daily \
        /st "${hour_padded}:00" \
        /f 2>/dev/null && echo "    Done." || echo "    Failed — check Task Scheduler manually."
    }

    register_task "$TIER1_HOUR" 1
    register_task "$TIER2_HOUR" 2
    register_task "$TIER3_HOUR" 3

  else
    # macOS / Linux: cron
    register_cron() {
      local hour=$1
      local tier=$2
      local cron_tag="# chill-tier${tier}"
      local cron_line="0 ${hour} * * * bash ${HOOK_PATH} --notify --force --tier=${tier}"
      # Remove existing entry for this tier, then add fresh
      ( crontab -l 2>/dev/null | grep -v "$cron_tag"; echo "$cron_tag"; echo "$cron_line" ) | crontab -
      echo "  cron tier${tier} registered (hour ${hour})."
    }

    register_cron "$TIER1_HOUR" 1
    register_cron "$TIER2_HOUR" 2
    register_cron "$TIER3_HOUR" 3
  fi

  echo ""
  echo "  System notifications active."
else
  echo ""
  echo "  Skipped. You can set this up later by re-running install.sh."
fi

# ── Done ─────────────────────────────────────────────────────────────────────

NAME_DISPLAY=$(grep '^name:' "$CONFIG" | awk '{print $2}' | tr -d '"')
LANG_DISPLAY=$(grep '^language:' "$CONFIG" | awk '{print $2}' | tr -d '"')
NAME_DISPLAY="${NAME_DISPLAY:-friend}"
LANG_DISPLAY="${LANG_DISPLAY:-en}"

echo ""
echo "────────────────────────────────────────────────────────"
echo "  Done."
echo ""
echo "  Claude will remind $NAME_DISPLAY starting at ${TIER1_HOUR}:00 (language: $LANG_DISPLAY)."
echo "  Test it now: type /chill in any Claude Code session."
echo "  Uninstall everything: bash $SKILL_DIR/uninstall.sh"
echo "────────────────────────────────────────────────────────"
echo ""
