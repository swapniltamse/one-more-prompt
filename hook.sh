#!/bin/bash
# /chill PostToolUse hook — subprocess mode
# Generates the chill message in a fresh claude -p subprocess with minimal context.
# Main session sees only the finished message — no skill execution, no context cost.

SKILL_DIR="$HOME/.claude/skills/chill"
CONFIG="$SKILL_DIR/config.yaml"
LANGUAGES_DIR="$SKILL_DIR/languages"

[ ! -f "$CONFIG" ] && exit 0

HOUR=$(date +%-H)
DATE=$(date +%Y%m%d)
FIRED_FLAG="/tmp/chill_fired_${DATE}_${HOUR}.flag"
SNOOZE_FLAG="/tmp/chill_snooze.flag"

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

# Map hour to tier
TIER=""
if [[ $HOUR -eq 21 || $HOUR -eq 22 ]]; then TIER="1"; fi
if [[ $HOUR -eq 23 || $HOUR -eq 0 ]]; then TIER="2"; fi
if [[ $HOUR -ge 1 && $HOUR -le 3 ]]; then TIER="3"; fi
[ -z "$TIER" ] && exit 0

touch "$FIRED_FLAG"

# Read config values
NAME=$(grep '^name:' "$CONFIG" | awk '{print $2}' | tr -d '"')
LANG=$(grep '^language:' "$CONFIG" | awk '{print $2}' | tr -d '"')
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

# Generate message via claude -p subprocess (fresh context, ~300 tokens, Haiku pricing)
if command -v claude &>/dev/null; then
  PROMPT="Generate one chill reminder message for a developer named $NAME who has been coding too late at night.

Register: $REGISTER
Film universe for parody references: $FILM_INDUSTRY
Tone for this tier: $TONE

Rules:
- Write in the language register described, NOT in English
- Address $NAME by name
- Maximum 2 lines
- You may include a film parody — pick one you haven't used recently, vary it
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
