#!/bin/bash
# /chill PostToolUse hook — subprocess mode
# Generates the chill message in a fresh claude -p subprocess with minimal context.
# Main session sees only the finished message — no skill execution, no context cost.

SKILL_DIR="$HOME/.claude/skills/chill"
CONFIG="$SKILL_DIR/config.yaml"
LANGUAGES_DIR="$SKILL_DIR/languages"

[ ! -f "$CONFIG" ] && exit 0

FORCE=0
NOTIFY=0
FORCED_TIER=""
CALENDAR_ARG=""
FORCED_LANG=""
MODEL_CMD_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1 ;;
    --notify) NOTIFY=1 ;;
    --tier=*) FORCED_TIER="${1#--tier=}" ;;
    --lang=*) FORCED_LANG="${1#--lang=}" ;;
    --model-cmd=*) MODEL_CMD_ARG="${1#--model-cmd=}" ;;
    --model-cmd) shift; MODEL_CMD_ARG="$1" ;;
    --calendar-event) shift; CALENDAR_ARG="$1" ;;
    --calendar-event=*) CALENDAR_ARG="${1#--calendar-event=}" ;;
  esac
  shift
done

HOUR=$(date +%-H)
DATE=$(date +%Y%m%d)
SNOOZE_FLAG="/tmp/chill_snooze.flag"

# Snooze check runs before tier (doesn't depend on it)
if [ "$FORCE" -eq 0 ] && [ -f "$SNOOZE_FLAG" ]; then
  SNOOZE_MINS=$(grep 'snooze_minutes' "$CONFIG" | awk '{print $2}' | tr -d '"')
  SNOOZE_MINS=${SNOOZE_MINS:-30}
  SNOOZE_AGE=$(( ($(date +%s) - $(date -r "$SNOOZE_FLAG" +%s 2>/dev/null || echo 0)) / 60 ))
  [ "$SNOOZE_AGE" -lt "$SNOOZE_MINS" ] && exit 0
  rm -f "$SNOOZE_FLAG"
fi

# Map current time to tier — reads thresholds from config, supports HH:MM and legacy hour: N
if [ -n "$FORCED_TIER" ]; then
  TIER="$FORCED_TIER"
else
  TIER=""
  MIN=$(date +%-M)

  # Convert HH MM to minutes-since-6pm, wrapping midnight.
  # Hours 0-17 get +1440 so post-midnight times sort correctly after pre-midnight ones.
  to_mins() {
    local h=$1 m=$2 v
    v=$(( h * 60 + m ))
    [ "$h" -lt 18 ] && v=$(( v + 1440 ))
    echo "$v"
  }

  # Parse one threshold line (supports `time: "HH:MM"` and legacy `hour: N`) → minutes
  parse_thresh() {
    local raw=$1
    if echo "$raw" | grep -q 'time:'; then
      local val; val=$(echo "$raw" | sed 's/.*time: *//' | tr -d '"' | tr -d "'")
      local h; h=$(echo "$val" | cut -d: -f1 | sed 's/^0*//' ); h=${h:-0}
      local m; m=$(echo "$val" | cut -d: -f2 | sed 's/^0*//' ); m=${m:-0}
      to_mins "$h" "$m"
    else
      local h; h=$(echo "$raw" | awk '{print $NF}' | tr -d '"')
      to_mins "$h" 0
    fi
  }

  THRESH_LINES=$(grep -A20 '^thresholds:' "$CONFIG" | grep -E '^\s*- (time|hour):')
  T1_RAW=$(echo "$THRESH_LINES" | awk 'NR==1')
  T2_RAW=$(echo "$THRESH_LINES" | awk 'NR==2')
  T3_RAW=$(echo "$THRESH_LINES" | awk 'NR==3')

  if [ -n "$T1_RAW" ] && [ -n "$T2_RAW" ] && [ -n "$T3_RAW" ]; then
    NOW=$(to_mins "$HOUR" "$MIN")
    T1=$(parse_thresh "$T1_RAW")
    T2=$(parse_thresh "$T2_RAW")
    T3=$(parse_thresh "$T3_RAW")
    T3_END=$(( T3 + 180 ))
    if   [ "$NOW" -ge "$T1" ] && [ "$NOW" -lt "$T2" ]; then TIER="1"
    elif [ "$NOW" -ge "$T2" ] && [ "$NOW" -lt "$T3" ]; then TIER="2"
    elif [ "$NOW" -ge "$T3" ] && [ "$NOW" -lt "$T3_END" ]; then TIER="3"
    fi
  else
    # Fallback if config thresholds are missing or malformed
    [[ $HOUR -eq 21 || $HOUR -eq 22 ]] && TIER="1"
    [[ $HOUR -eq 23 || $HOUR -eq 0 ]] && TIER="2"
    [[ $HOUR -ge 1 && $HOUR -le 3 ]] && TIER="3"
  fi

  [ -z "$TIER" ] && { [ "$FORCE" -eq 1 ] && TIER="1" || exit 0; }
fi

# Per-tier flag: each tier fires at most once per day, independently
FIRED_FLAG="/tmp/chill_fired_${DATE}_tier${TIER}.flag"
if [ "$FORCE" -eq 0 ]; then
  [ -f "$FIRED_FLAG" ] && exit 0
  touch "$FIRED_FLAG"
fi

# Read config values
NAME=$(grep '^name:' "$CONFIG" | awk '{print $2}' | tr -d '"')

# Support --lang=XX override, else random from config
if [ -n "$FORCED_LANG" ]; then
  LANG="$FORCED_LANG"
else
  # Support both `languages: [hi, mr, en]` (multi) and `language: hi` (single)
  LANGS_RAW=$(grep '^languages:' "$CONFIG" | sed 's/languages: *//' | tr -d '[]"' | tr ',' ' ')
  if [ -n "$LANGS_RAW" ]; then
    LANG_ARRAY=($LANGS_RAW)
    LANG=${LANG_ARRAY[$RANDOM % ${#LANG_ARRAY[@]}]}
  else
    LANG=$(grep '^language:' "$CONFIG" | awk '{print $2}' | tr -d '"')
  fi
fi
OBSIDIAN_LOG=$(grep 'obsidian_log:' "$CONFIG" | sed 's/obsidian_log: *//' | tr -d '"')
SNOOZE_MINS=$(grep 'snooze_minutes' "$CONFIG" | awk '{print $2}' | tr -d '"')
SNOOZE_MINS=${SNOOZE_MINS:-30}
NAME=${NAME:-friend}
LANG=${LANG:-en}

# Load language pack
LANG_FILE="$LANGUAGES_DIR/${LANG}.yaml"
[ ! -f "$LANG_FILE" ] && LANG_FILE="$LANGUAGES_DIR/en.yaml"

# Extract the fields we need from the YAML
REGISTER=$(grep '^register:' "$LANG_FILE" | sed 's/register: *//')
FILM_INDUSTRY=$(grep '^film_industry:' "$LANG_FILE" | sed 's/film_industry: *//')
TONE=$(awk "/^  tier${TIER}:/{found=1; next} found{print; exit}" "$LANG_FILE" | sed 's/^ *"//' | sed 's/"$//')
FOLLOW_UP=$(grep -A2 '^follow_up:' "$LANG_FILE" | grep 'text:' | sed 's/.*text: *//' | tr -d '"' | sed "s/{n}/$SNOOZE_MINS/g")

# Calendar context — from --calendar-event arg (live MCP, passed by SKILL.md)
# or from cache file (populated by scripts/fetch_calendar.sh for auto-fire)
CALENDAR_CONTEXT=""
if [ -n "$CALENDAR_ARG" ]; then
  CALENDAR_CONTEXT="Also: their first meeting tomorrow is $CALENDAR_ARG — weave this in naturally if it strengthens the message."
else
  CALENDAR_ENABLED=$(grep 'calendar:' "$CONFIG" | awk '{print $2}' | tr -d '"')
  if [ "$CALENDAR_ENABLED" = "true" ] && [ -f "/tmp/chill_calendar_cache.txt" ]; then
    CALENDAR_EVENT=$(cat /tmp/chill_calendar_cache.txt)
    if [ -n "$CALENDAR_EVENT" ] && [ "$CALENDAR_EVENT" != "none" ]; then
      CALENDAR_CONTEXT="Also: their first meeting tomorrow is $CALENDAR_EVENT — weave this in naturally if it strengthens the message."
    fi
  fi
fi

# Resolve model command: --model-cmd flag > config model_cmd > claude default
MODEL_CMD="$MODEL_CMD_ARG"
if [ -z "$MODEL_CMD" ]; then
  MODEL_CMD=$(grep '^model_cmd:' "$CONFIG" | sed 's/model_cmd: *//' | tr -d '"')
fi

PROMPT="Generate one chill reminder message for a developer named $NAME who has been coding too late at night.

Register: $REGISTER
Film universe for parody references: $FILM_INDUSTRY
Tone for this tier: $TONE
$CALENDAR_CONTEXT

Rules:
- Write in the language register described, NOT in English
- Address $NAME by name
- Maximum 2 lines
- Output ONLY the message itself, no quotes, no explanation, no English translation"

# Generate message — use custom model_cmd if set, else claude -p (default)
if [ -n "$MODEL_CMD" ]; then
  MSG=$(eval "$MODEL_CMD \"$PROMPT\"" 2>/dev/null)
elif command -v claude &>/dev/null; then
  MSG=$(claude -p "$PROMPT" --model claude-haiku-4-5-20251001 2>/dev/null)
else
  # claude not in PATH — fall back to inline instruction for main session
  echo "It is $(date +'%I:%M %p'). Remind $NAME to take a break. Tier $TIER. Hinglish. Two lines max. No explanation."
  exit 0
fi

# Fallback if generation failed or returned empty
if [ -z "$MSG" ]; then
  MSG="$NAME bhai, bahut ho gaya aaj. Thoda rest le yaar."
fi

# Output — terminal print or system notification depending on --notify flag
if [ "$NOTIFY" -eq 1 ]; then
  # Send OS notification (for cron/Task Scheduler fires outside Claude Code)
  SAFE_MSG=$(echo "$MSG" | sed "s/'/\`'/g" | sed 's/"/\\"/g')
  if [[ "$OSTYPE" == "darwin"* ]]; then
    osascript -e "display notification \"$MSG\" with title \"/chill\"" 2>/dev/null
  elif command -v notify-send &>/dev/null; then
    notify-send "/chill" "$MSG" 2>/dev/null
  elif command -v powershell.exe &>/dev/null; then
    # Windows (Git Bash or WSL) — system tray balloon tip
    powershell.exe -WindowStyle Hidden -NonInteractive -Command "
Add-Type -AssemblyName System.Windows.Forms
\$n = New-Object System.Windows.Forms.NotifyIcon
\$n.Icon = [System.Drawing.SystemIcons]::Application
\$n.BalloonTipTitle = '/chill'
\$n.BalloonTipText = '$SAFE_MSG'
\$n.BalloonTipIcon = 'None'
\$n.Visible = \$true
\$n.ShowBalloonTip(7000)
Start-Sleep 7
\$n.Dispose()
" &
  fi
else
  # Print to terminal (Claude Code PostToolUse session)
  printf '\n%s\n\n%s\n' "$MSG" "$FOLLOW_UP"
fi

# Log to Obsidian directly — no Claude involvement
if [ -n "$OBSIDIAN_LOG" ]; then
  LOG_DATE=$(date '+%Y-%m-%d')
  LOG_TIME=$(date '+%H:%M')
  if [ ! -f "$OBSIDIAN_LOG" ]; then
    printf '# Chill Log\n\n| Date | Time | Tier | Language | Message |\n|------|------|------|----------|---------|\n' > "$OBSIDIAN_LOG"
  fi
  SAFE_MSG=$(echo "$MSG" | tr '|' '/')
  echo "| $LOG_DATE | $LOG_TIME | tier${TIER} | $LANG | $SAFE_MSG |" >> "$OBSIDIAN_LOG"
fi
