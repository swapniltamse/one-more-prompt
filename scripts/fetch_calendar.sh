#!/bin/bash
# fetch_calendar.sh — cache tomorrow's first calendar event for /chill hook
#
# This script uses claude -p to call the Google Calendar MCP and write
# the first event of tomorrow to /tmp/chill_calendar_cache.txt
# Run this on a schedule (e.g. cron at 6pm daily) so the hook has fresh data.
#
# Setup (cron example — runs every day at 6pm):
#   0 18 * * * bash ~/.claude/skills/chill/scripts/fetch_calendar.sh
#
# Requires: Google Calendar MCP connected to your Claude account
# Docs: https://github.com/swapniltamse/one-more-prompt#calendar-awareness

CACHE_FILE="/tmp/chill_calendar_cache.txt"

PROMPT="Use the Google Calendar MCP to list events for tomorrow. Find the first event of the day. Output ONLY this format, nothing else:
HH:MM EventTitle

Example: 09:00 Team Standup
If there are no events tomorrow, output: none"

RESULT=$(claude -p "$PROMPT" 2>/dev/null)

if [ -n "$RESULT" ] && [ "$RESULT" != "none" ]; then
  echo "$RESULT" > "$CACHE_FILE"
else
  rm -f "$CACHE_FILE"
fi
