---
name: chill
description: One More Prompt fatigue skill. Fires culturally-native wellbeing reminders in the user's language when working too late. Escalates across 3 time tiers with movie quote parodies. Logs to Obsidian. Use when invoked manually or triggered by hook.
argument-hint: "[setup | snooze <minutes> | log]"
allowed-tools: Read Write Edit Bash Glob
---

You have been invoked with the /chill skill.

Arguments: $ARGUMENTS

SKILL_DIR: ~/.claude/skills/chill
CONFIG: ~/.claude/skills/chill/config.yaml
LANGUAGES_DIR: ~/.claude/skills/chill/languages

Determine the mode from the arguments and follow the instructions for that mode exactly.

---

## MODE: FIRE (default)

**Trigger:** No arguments, or invoked automatically by the hook.

### Step 1 — Read config.

Read CONFIG. Extract: `name`, `languages` (or `language` for single-language installs), `thresholds`, `obsidian_log`, `snooze_minutes`.

If `languages` is a list, pick one at random for this fire. If only `language` is set, use it directly.

Check for snooze flag: `/tmp/chill_snooze.flag`. If it exists and its modification time is less than `snooze_minutes` ago, exit silently.

### Step 2 — Determine tier.

Run `date +%-H` via Bash to get the current local hour (0-23).

Map hour to tier:
- Hour 21-22 → tier1
- Hour 23 or 0 → tier2
- Hour 1-3 → tier3
- Any other hour → tier1 (manual invocation outside thresholds)

### Step 3 — Load language pack.

Read `LANGUAGES_DIR/<selected-language>.yaml`. If the file does not exist, fall back to `LANGUAGES_DIR/en.yaml`.

Extract:
- `register` — the tone descriptor
- `film_industry` — for movie quote context
- `tone_guide.<tier>` — the tone instruction for this tier
- `examples.<tier>` — the few-shot example messages

### Step 4 — Generate a fresh message.

Using the loaded context, generate ONE message following these rules exactly:

- Write in the language register described — NOT in English
- Match the tone for the tier (tier1: warm/casual, tier2: firm but loving, tier3: short/serious)
- You MAY invent a new movie quote parody from the film industry — keep it clever, keep it short
- Address the user by their `name` from config
- Maximum 2 lines
- Do NOT translate the message or add English explanation
- Make it feel like a real friend sent it, not a system notification

### Step 5 — Display the message.

Show the generated message on its own, followed by a blank line, then the follow-up line from the language YAML (with `{n}` replaced by `snooze_minutes`).

Format:
```
[generated message]

[follow_up line]
```

### Step 6 — Log to Obsidian.

Append one row to the `obsidian_log` file. Create the file if it does not exist, with this header first:

```markdown
# Chill Log

| Date | Time | Tier | Language | Message |
|------|------|------|----------|---------|
```

Append:
```
| YYYY-MM-DD | HH:MM | tier{N} | {language} | {generated message} |
```

---

## MODE: SETUP

**Trigger:** Arguments are exactly "setup".

Walk the user through creating `config.yaml` interactively. Ask each question and wait for the answer:

1. "What's your first name?"
2. "Pick your language: hi (Hindi), ar (Egyptian Arabic), ta (Tamil), kn (Kannada), mr (Marathi), es (Spanish), pt (Portuguese), en-ie (Irish), en (English)"
3. "Your timezone (e.g. America/New_York, Asia/Kolkata, Africa/Cairo):"
4. "What time should I start nudging you? (default: 21 for 9pm)"
5. "Path to your Obsidian vault's Claude Sessions folder (or press enter to skip logging):"

Write the completed config to CONFIG. Confirm: "Config saved. Claude will remind {name} starting at {hour}:00 in {language}. Type /chill to test it now."

---

## MODE: SNOOZE

**Trigger:** Arguments start with "snooze".

Extract the number of minutes from arguments (default to config `snooze_minutes` if not provided).

Touch `/tmp/chill_snooze.flag` with current timestamp.

Reply with exactly one line in the user's configured language register — something warm that acknowledges they said "just a few more minutes" and you've heard that before. Pull tone from tier1 of their language pack. Generate fresh, do not use a canned response.

---

## MODE: LOG

**Trigger:** Arguments are exactly "log".

Read the `obsidian_log` file. Parse the table rows.

Show:
- Total reminders fired (all time)
- Breakdown by tier (how many tier1, tier2, tier3)
- Latest 5 entries
- The hour you most commonly get reminded (your peak "one more prompt" hour)

End with one dry observation about the pattern. Keep it honest. Keep it short.
