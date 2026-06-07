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

**Trigger:** No arguments, any unrecognised arguments, or invoked automatically by the hook.

Generate the message inline. No subprocess. No hook.sh.

### Step 0 — Detect language

If the arguments contain a language hint, resolve to ISO code:

| User says | lang |
|-----------|------|
| in hindi / hindi mein | hi |
| in marathi / marathi mein | mr |
| in english | en |
| in tamil | ta |
| in kannada | kn |
| in arabic | ar |
| in spanish | es |
| in portuguese | pt |
| in irish | en-ie |

### Step 1 — Load config and language pack

Read `~/.claude/skills/chill/config.yaml`. Extract: `name`, `language`/`languages`, `snooze_minutes`.

Pick language: use the override from Step 0 if set; otherwise pick randomly from `languages` list, or use `language` if single.

Read `~/.claude/skills/chill/languages/{lang}.yaml`.

### Step 2 — Determine tier

| Current hour | Tier |
|-------------|------|
| 21–22 | 1 |
| 23–0 | 2 |
| 1–3 | 3 |
| anything else | 1 |

Use the system date context. Do not run a Bash command for this.

### Step 3 — Output the message

Generate one message and output it directly. Nothing before it. Nothing after except the follow_up line.

Rules:
- Write in the language register from the YAML
- Draw from the film_industry listed
- Match the tone from `tone_guide.tier{N}`
- Address the user by name
- 2 lines maximum
- Output: message, blank line, `follow_up.text` (replace `{n}` with `snooze_minutes`)

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
