#!/bin/bash
# /chill PostToolUse hook — subprocess mode
# Generates the chill message in a fresh claude -p subprocess with minimal context.
# Main session sees only the finished message — no skill execution, no context cost.

SKILL_DIR="$HOME/.claude/skills/chill"
CONFIG="$SKILL_DIR/config.yaml"
LANGUAGES_DIR="$SKILL_DIR/languages"

[ ! -f "$CONFIG" ] && exit 0

FORCE=0
FORCED_TIER=""
CALENDAR_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1 ;;
    --tier=*) FORCED_TIER="${1#--tier=}" ;;
    --calendar-event) shift; CALENDAR_ARG="$1" ;;
    --calendar-event=*) CALENDAR_ARG="${1#--calendar-event=}" ;;
  esac
  shift
done

HOUR=$(date +%-H)
DATE=$(date +%Y%m%d)
FIRED_FLAG="/tmp/chill_fired_${DATE}_${HOUR}.flag"
SNOOZE_FLAG="/tmp/chill_snooze.flag"

if [ "$FORCE" -eq 0 ]; then
  # Only fire once per hour window
  [ -f "$FIRED_FLAG" ] && exit 0

  # Respect snooze
  if [ -f "$SNOOZE_FLAG" ]; then
    SNOOZE_MINS=$(grep 'snooze_minutes' "$CONFIG" | awk '{print $2}' | tr -d '"')
    SNOOZE_MINS=${SNOOZE_MINS:-30}
    SNOOZE_AGE=$(( ($(date +%s) - $(date -r "$SNOOZE_FLAG" +%s 2>/dev/null || echo 0)) / 60 ))
    [ "$SNOOZE_AGE" -lt "$SNOOZE_MINS" ] && exit 0
    rm -f "$SNOOZE_FLAG"
  fi
fi

# Map hour to tier
if [ -n "$FORCED_TIER" ]; then
  TIER="$FORCED_TIER"
else
  TIER=""
  if [[ $HOUR -eq 21 || $HOUR -eq 22 ]]; then TIER="1"; fi
  if [[ $HOUR -eq 23 || $HOUR -eq 0 ]]; then TIER="2"; fi
  if [[ $HOUR -ge 1 && $HOUR -le 3 ]]; then TIER="3"; fi
  [ -z "$TIER" ] && { [ "$FORCE" -eq 1 ] && TIER="1" || exit 0; }
fi

[ "$FORCE" -eq 0 ] && touch "$FIRED_FLAG"

# Read config values
NAME=$(grep '^name:' "$CONFIG" | awk '{print $2}' | tr -d '"')

# Support both `languages: [hi, mr, en]` (multi) and `language: hi` (single)
LANGS_RAW=$(grep '^languages:' "$CONFIG" | sed 's/languages: *//' | tr -d '[]"' | tr ',' ' ')
if [ -n "$LANGS_RAW" ]; then
  LANG_ARRAY=($LANGS_RAW)
  LANG=${LANG_ARRAY[$RANDOM % ${#LANG_ARRAY[@]}]}
else
  LANG=$(grep '^language:' "$CONFIG" | awk '{print $2}' | tr -d '"')
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

# Generate message via claude -p subprocess (fresh context, ~300 tokens, Haiku pricing)
if command -v claude &>/dev/null; then
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

  MSG=$(claude -p "$PROMPT" --model claude-haiku-4-5-20251001 2>/dev/null)

  # Fallback if subprocess fails or returns empty
  if [ -z "$MSG" ]; then
    MSG="$NAME bhai, bahut ho gaya aaj. Thoda rest le yaar."
  fi
else
  # claude not in PATH — fall back to inline instruction for main session
  echo "It is $(date +'%I:%M %p'). Remind $NAME to take a break. Tier $TIER. Hinglish. Two lines max. No explanation."
  exit 0
fi

# Output the finished message (main session displays, does not need to generate)
printf '\n%s\n\n%s\n' "$MSG" "$FOLLOW_UP"

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
