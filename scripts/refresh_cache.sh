#!/bin/bash
# scripts/refresh_cache.sh — pre-generate chill messages into a local cache
# Run once daily (or on demand) so hook.sh fires instantly without an API call.
#
# Usage:
#   bash scripts/refresh_cache.sh              # all tiers × all configured languages
#   bash scripts/refresh_cache.sh --count=10   # 10 messages per tier/lang (default: 5)
#   bash scripts/refresh_cache.sh --lang=hi    # one language only
#   bash scripts/refresh_cache.sh --tier=2     # one tier only
#
# Cache location: ~/.claude/skills/chill/cache/tier{N}_{lang}.txt
# Each line is one message. Internal newlines stored as | and restored at read time.

SKILL_DIR="$HOME/.claude/skills/chill"
CONFIG="$SKILL_DIR/config.yaml"
LANGUAGES_DIR="$SKILL_DIR/languages"
CACHE_DIR="$SKILL_DIR/cache"

COUNT=5
FILTER_LANG=""
FILTER_TIER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --count=*) COUNT="${1#--count=}" ;;
    --lang=*)  FILTER_LANG="${1#--lang=}" ;;
    --tier=*)  FILTER_TIER="${1#--tier=}" ;;
  esac
  shift
done

[ ! -f "$CONFIG" ] && echo "No config.yaml found. Run /chill setup first." && exit 1
mkdir -p "$CACHE_DIR"

NAME=$(grep '^name:' "$CONFIG" | awk '{print $2}' | tr -d '"')
NAME=${NAME:-friend}

LANGS_RAW=$(grep '^languages:' "$CONFIG" | sed 's/languages: *//' | tr -d '[]"' | tr ',' ' ')
if [ -n "$LANGS_RAW" ]; then
  LANGS=($LANGS_RAW)
else
  LANG_SINGLE=$(grep '^language:' "$CONFIG" | awk '{print $2}' | tr -d '"')
  LANGS=(${LANG_SINGLE:-en})
fi

TOTAL=0
FAILED=0

for LANG in "${LANGS[@]}"; do
  [ -n "$FILTER_LANG" ] && [ "$LANG" != "$FILTER_LANG" ] && continue

  LANG_FILE="$LANGUAGES_DIR/${LANG}.yaml"
  [ ! -f "$LANG_FILE" ] && LANG_FILE="$LANGUAGES_DIR/en.yaml"

  REGISTER=$(grep '^register:' "$LANG_FILE" | sed 's/register: *//')
  FILM_INDUSTRY=$(grep '^film_industry:' "$LANG_FILE" | sed 's/film_industry: *//')

  for TIER in 1 2 3; do
    [ -n "$FILTER_TIER" ] && [ "$TIER" != "$FILTER_TIER" ] && continue

    TONE=$(awk "/^  tier${TIER}:/{found=1; next} found{print; exit}" "$LANG_FILE" \
          | sed 's/^ *"//' | sed 's/"$//')

    CACHE_FILE="$CACHE_DIR/tier${TIER}_${LANG}.txt"
    > "$CACHE_FILE"

    echo "tier${TIER} / ${LANG} — generating ${COUNT} messages..."

    for i in $(seq 1 "$COUNT"); do
      PROMPT="Generate one chill reminder message for a developer named $NAME who has been coding too late at night.

Register: $REGISTER
Film universe for parody references: $FILM_INDUSTRY
Tone for this tier: $TONE

Rules:
- Write in the language register described, NOT in English
- Address $NAME by name
- Maximum 2 lines
- Output ONLY the message itself, no quotes, no explanation, no English translation"

      MSG=""
      if command -v claude &>/dev/null; then
        MSG=$(claude -p "$PROMPT" --model claude-haiku-4-5-20251001 2>/dev/null)
      fi

      if [ -n "$MSG" ]; then
        # Store multi-line messages as single line with | as newline placeholder
        echo "$MSG" | tr '\n' '|' | sed 's/|$//' >> "$CACHE_FILE"
        echo "" >> "$CACHE_FILE"
        TOTAL=$(( TOTAL + 1 ))
        printf "  [%d/%d] ok\n" "$i" "$COUNT"
      else
        FAILED=$(( FAILED + 1 ))
        printf "  [%d/%d] failed — skipped\n" "$i" "$COUNT"
      fi
    done
  done
done

echo ""
echo "Done. $TOTAL messages cached, $FAILED failed."
echo "Cache lives at: $CACHE_DIR"
echo "hook.sh will use it automatically on next fire."
