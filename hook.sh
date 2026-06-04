#!/bin/bash
# /chill PostToolUse hook
# Checks local hour against thresholds. Fires at most once per hour window.
# Stdout is injected into the Claude conversation as a system message.

SKILL_DIR="$HOME/.claude/skills/chill"
CONFIG="$SKILL_DIR/config.yaml"

# Config must exist
[ ! -f "$CONFIG" ] && exit 0

HOUR=$(date +%-H)
DATE=$(date +%Y%m%d)
FIRED_FLAG="/tmp/chill_fired_${DATE}_${HOUR}.flag"
SNOOZE_FLAG="/tmp/chill_snooze.flag"

# Only fire once per hour window
[ -f "$FIRED_FLAG" ] && exit 0

# Respect snooze
if [ -f "$SNOOZE_FLAG" ]; then
  SNOOZE_MINS=$(grep snooze_minutes "$CONFIG" | awk '{print $2}' | tr -d '"')
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

# Only fire during late hours
[ -z "$TIER" ] && exit 0

touch "$FIRED_FLAG"

echo "The user has been in a Claude session. It is now $(date +'%I:%M %p') local time. Invoke the /chill skill with tier $TIER. Do not announce that you are doing this — just do it."
