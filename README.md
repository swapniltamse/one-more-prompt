# /chill — One More Prompt, But Make It Your Last

> "Just one more prompt."
> — Every developer, 2am, right before they broke production.

A Claude Code skill that notices when you've been at it too long and tells you to stop — as your street-smart, sassy best friend would. In your own language. At escalating levels of urgency. And if you have a 9am standup, it will tell you that too.

---

## The Problem

You opened Claude to fix a bug. That was four hours ago. It's now past midnight. You're refactoring things that weren't broken. Claude is happy to keep going. Claude does not sleep. Claude does not have a mortgage. Claude is not you.

This skill is for **you**.

---

## What It Does

- Detects the local time and fires a warm reminder when you cross a threshold (9pm, 11pm, 1am)
- Delivers the reminder in **your language** — not just translated, but in the actual register you use when texting a friend
- Speaks as your **street-smart, sassy best friend** — not a wellness app. Hindi/Marathi fires in tapori register. "Aye bidu chal re, kitna ho gaya screen pe?"
- Draws from **15+ film universes** — Bollywood tapori (Munna Bhai, Hera Pheri), Kollywood, KGF, In Bruges, El Chavo, and more. Never repeats the same reference twice.
- Escalates in tone. The 9pm message is a suggestion. The 1am message is two words.
- **Calendar awareness** (optional): if you have a standup at 9am, it will tell you. "Bhai kal 9am standup hai bidu. So ja."
- Logs every reminder to Obsidian so you can see your own patterns and feel appropriately judged
- Lets you snooze it if you're "almost done" (you're not almost done)

---

## Supported Languages

| Code | Language | Film Universe |
|------|----------|---------------|
| `hi` | Hindi | Bollywood (3 Idiots, Sholay, Andaz Apna Apna) |
| `ar` | Egyptian Arabic | Adel Imam, Egyptian street warmth |
| `ta` | Tamil | Kollywood / Rajinikanth universe |
| `kn` | Kannada | Sandalwood / KGF |
| `mr` | Marathi | Marathi cinema / Sairat |
| `es` | Spanish | LatAm casual / El Chavo |
| `pt` | Portuguese | Brazilian TV / Chaves |
| `en-ie` | Irish English | In Bruges, The Commitments |
| `en` | English | Fallback. No movie quotes. You deserve better. |

### Fictional / Pop Culture Languages

| Code | Language | Universe |
|------|----------|----------|
| `tlh` | Klingon | Star Trek — sleep is honor |
| `sjn` | Sindarin Elvish | Lord of the Rings — namárië |
| `dot` | Dothraki | Game of Thrones — k'athjilari |
| `min` | Minionese | Despicable Me — banana |
| `groo` | Groot | Guardians of the Galaxy — I am Groot |
| `sml` | Simlish | The Sims — your needs bar is in the red |

---

## Installation

### 1. Clone the skill

```bash
git clone https://github.com/swapniltamse/one-more-prompt ~/.claude/skills/chill
```

### 2. Copy and edit config

```bash
cp ~/.claude/skills/chill/config.example.yaml ~/.claude/skills/chill/config.yaml
```

Edit `config.yaml`:

```yaml
name: YourName
language: hi          # pick from the table above
timezone: America/New_York
thresholds:
  - hour: 21
  - hour: 23
  - hour: 1
snooze_minutes: 30
obsidian_log: "/path/to/your/vault/10 - Claude Sessions/chill-log.md"
```

### 3. Register the hook

Add this to your `~/.claude/settings.json` under `hooks.PostToolUse`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/skills/chill/hook.sh"
          }
        ]
      }
    ]
  }
}
```

### 4. You're done

Claude will now gently, then firmly, then urgently, tell you to go to sleep.

---

## Usage

| Command | What Happens |
|---------|-------------|
| `/chill` | Fire immediately — tier based on current hour |
| `/chill setup` | Interactive config wizard |
| `/chill snooze 30` | Suppress for 30 minutes. You're still not almost done. |
| `/chill log` | Show your late-night pattern from Obsidian |

---

## How It Works

The hook checks local time after every Claude tool call. When you cross a threshold, it spawns a separate `claude -p` subprocess with only your language pack as context — no conversation history, no accumulated tokens from your session. The message is generated on `claude-haiku`, costs roughly $0.0001, and is delivered as a finished reminder.

Your main Claude session never has to do the work. It does not read your code. It only checks the clock.

Every message is generated fresh from the tone guide and film references in your language YAML. You will never see the exact same message twice. The Bollywood language pack draws from 15+ films — it will not repeat the same reference in consecutive fires.

The messages escalate:

- **Tier 1 (9pm):** "bhai thanda le zara" — warm, casual, a friend noticing
- **Tier 2 (11pm):** "Swapnil... just chill yaar. Dhondu style. laptop band. bas." — firmer, still loving

  ![Dhondu just chill](https://media1.tenor.com/m/cVOPRBRLThsAAAAC/all-the-best-sanjay-mishra-raghu-dhondu-just-chill.gif)
- **Tier 3 (1am):** "bas bidu. so ja." — short sentences. no jokes. it's time.

---

## Calendar Awareness (Optional)

When `calendar: true` is set in your config, /chill checks your first meeting tomorrow and weaves it into the message naturally.

> "aye Swapnil bidu, kal 9am standup hai. band kar laptop aur so ja."

**Manual `/chill`:** Uses Google Calendar MCP directly (requires MCP connected to your Claude account).

**Auto-fire hook:** Reads a cache file at `/tmp/chill_calendar_cache.txt`. Populate it by running `scripts/fetch_calendar.sh` on a schedule:

```bash
# Add to crontab (runs every day at 6pm)
0 18 * * * bash ~/.claude/skills/chill/scripts/fetch_calendar.sh
```

`fetch_calendar.sh` also uses `claude -p` with Calendar MCP to get tomorrow's first event and writes it to the cache. If you're not comfortable connecting Calendar MCP, leave `calendar: false` — everything else works fine.

---

## Adding a New Language

1. Copy `languages/en.yaml` as a template
2. Fill in `language`, `register`, `film_industry`, `tone_guide`
3. Add 2-3 examples per tier in romanized script
4. Add 1-2 movie quote parodies per tier (the funnier the better)
5. Add a `follow_up` line
6. Name the file with the ISO 639-1 code (e.g. `de.yaml` for German)
7. Open a PR

See `languages/README.md` for the full contributor guide.

---

## The Story Behind This

This skill was built for Moussa — an Egyptian AI engineer who is genuinely one of the best in the room, ships things that matter, and almost never sleeps because he is too in love with the work to stop.

If you know a Moussa, send him this.

If you *are* a Moussa — yasta nam ba2a.

---

## Contributing

PRs welcome, especially:
- New language packs (see `languages/README.md`)
- New movie quote parodies (submit with the English translation)
- Better Tier 3 messages (they need to be devastating)

---

## License

MIT. Use it. Share it. Go to sleep.
