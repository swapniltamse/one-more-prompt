# /chill — One More Prompt, But Make It Your Last

> "Just one more prompt."
> — Every developer, 2am, right before they broke production.

A Claude Code skill that fires when you've been at it too long. Speaks as your street-smart, sassy best friend. In your own language. Escalates. And if you have a 9am standup, it will tell you that too.

---

## The Problem

You opened Claude to fix a bug. That was four hours ago. It's now past midnight. You're refactoring things that weren't broken. Claude is happy to keep going. Claude does not sleep. Claude does not have a mortgage. Claude is not you.

This skill is for **you**.

---

## What It Does

- Detects the local time and fires a warm reminder when you cross a threshold (9pm, 11pm, 1am)
- Delivers the reminder in **your language**. Not just translated. In the register you'd use texting a friend at midnight.
- Speaks as your **street-smart, sassy best friend**, not a wellness app. Hindi/Marathi fires in tapori register. "Aye bidu chal re, kitna ho gaya screen pe?"
- Draws from **15+ film universes**: Bollywood tapori (Munna Bhai, Hera Pheri), Kollywood, KGF, In Bruges, El Chavo, and more. Never the same reference twice.
- Escalates in tone. The 9pm message is a suggestion. The 1am message is two words.
- Calendar awareness (optional): if you have a standup at 9am, it will tell you. "Bhai kal 9am standup hai bidu. So ja."
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
| `en` | English | Silicon Valley, The Office, Succession, Nolan |

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

```bash
git clone https://github.com/swapniltamse/one-more-prompt ~/.claude/skills/chill
bash ~/.claude/skills/chill/install.sh
```

The installer runs three steps and tells you exactly what it's doing at each one:

**Step 1 — config.yaml.** Asks your name, language, and timezone. Skipped if config already exists.

**Step 2 — Claude Code hook.** Adds one entry to `~/.claude/settings.json` under `hooks.PostToolUse`. This fires after every Claude Code tool call and prints your reminder in the terminal. Safe to run twice — it checks before adding.

**Step 3 — System notifications (optional, you choose y/n).** For when you're on claude.ai, Cursor, VS Code, or anywhere else. On Windows, creates 3 tasks in Task Scheduler under `chill\` — one per threshold. On macOS/Linux, adds 3 cron entries. The installer prints exactly what it will register before doing it. Tasks run as your user account. No admin rights required.

To remove everything:

```bash
bash ~/.claude/skills/chill/uninstall.sh
```

This removes the settings.json hook, the scheduled tasks or cron entries, and optionally your config.yaml. The skill files stay unless you delete them manually.

### Manual setup (optional)

If you prefer to configure by hand or already have a `config.yaml`:

```bash
cp ~/.claude/skills/chill/config.example.yaml ~/.claude/skills/chill/config.yaml
# edit config.yaml, then:
bash ~/.claude/skills/chill/install.sh
# installer skips config questions and goes straight to hook + notification setup
```

---

## Usage

| Command | What Happens |
|---------|-------------|
| `/chill` | Fire immediately — tier based on current hour |
| `/chill in hindi` | Fire in a specific language |
| `/chill setup` | Interactive config wizard |
| `/chill snooze 30` | Suppress for 30 minutes. You're still not almost done. |
| `/chill log` | Show your late-night pattern from Obsidian |

---

## How It Works

The hook checks local time after every Claude tool call. When you cross a threshold, it spawns a separate `claude -p` subprocess with only your language pack as context. No conversation history. No accumulated tokens from your session. The message is generated on `claude-haiku`, costs roughly $0.0001, and lands as a finished reminder.

Your main Claude session never does the work. It does not read your code. It only checks the clock.

Every message is generated fresh from the tone guide and film references in your language YAML. You will never see the exact same message twice. The Bollywood language pack draws from 15+ films and will not repeat the same reference in consecutive fires.

The messages escalate:

- **Tier 1 (9pm):** "bhai thanda le zara" — warm, casual, a friend noticing
- **Tier 2 (11pm):** "Swapnil... just chill yaar. Dhondu style. laptop band. bas." — firmer, still loving
- **Tier 3 (1am):** "bas bidu. so ja." — short sentences. no jokes. it's time.

![Dhondu just chill](https://media1.tenor.com/m/cVOPRBRLThsAAAAC/all-the-best-sanjay-mishra-raghu-dhondu-just-chill.gif)

---

## Calendar Awareness (Optional)

When `calendar: true` is set in your config, /chill checks your first meeting tomorrow and weaves it into the message naturally.

> "aye bidu, kal 9am standup hai. band kar laptop aur so ja."

For manual `/chill`: Claude calls Google Calendar MCP directly (requires MCP connected to your Claude account).

For the auto-fire hook: it reads a cache file at `/tmp/chill_calendar_cache.txt`. Populate it by running `scripts/fetch_calendar.sh` on a schedule:

```bash
# Add to crontab (runs every day at 6pm)
0 18 * * * bash ~/.claude/skills/chill/scripts/fetch_calendar.sh
```

`fetch_calendar.sh` uses `claude -p` with Calendar MCP to get tomorrow's first event and writes it to the cache. If you're not comfortable connecting Calendar MCP, leave `calendar: false`. Everything else works fine.

---

## Using with Other Tools

The hook script works with any AI coding tool that supports running a shell command after tool calls. The only Claude-specific part is the message generation. You can swap that out.

Set `model_cmd` in your `config.yaml` to use a different LLM CLI:

```yaml
# llm (Simon Willison's tool — works with OpenAI, Anthropic, local models)
model_cmd: "llm"

# shell-gpt
model_cmd: "sgpt"

# local Ollama model
model_cmd: "ollama run llama3"

# Gemini CLI
model_cmd: "gemini -p"
```

The command receives the prompt as its last argument. Output goes directly to your terminal as the chill message.

For wiring the hook in other tools:

| Tool | Hook type | Config location |
|------|-----------|----------------|
| Claude Code | PostToolUse | `~/.claude/settings.json` |
| Codex CLI | after-tool | `~/.codex/config.toml` |
| Gemini CLI | PostToolUse | `~/.gemini/settings.json` |

`install.sh` currently wires Claude Code only. For other tools, add the equivalent hook manually pointing to `bash ~/.claude/skills/chill/hook.sh`.

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

I built this after a friend texted me a prompt at 2:47 AM. He wasn't stuck. The original task was done hours ago. He just couldn't stop.

I recognized it. I do it too.

Send it to whoever needs it.

The tapori register was inspired by [bhai-lang](https://github.com/DulLabs/bhai-lang). If bhai-lang could make `print` feel like home, /chill could make "close the laptop" feel the same way.

---

## Contributing

PRs welcome, especially:
- New language packs (see `languages/README.md`)
- New movie quote parodies (submit with the English translation)
- Better Tier 3 messages (they need to be devastating)

---

## License

MIT. Use it. Share it. Go to sleep.
