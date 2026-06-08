# /chill — One More Prompt, But Make It Your Last

> "Just one more prompt."
> — Every developer, 2am, right before they broke production.

A Claude Code skill that fires when you've been at it too long. Speaks as your street-smart best friend. In your own language. Escalates. And if you have a 9am standup, it will tell you that too.

---

## The problem

You opened Claude to fix a bug. That was four hours ago. It's now past midnight. You're refactoring things that weren't broken. Claude is happy to keep going. Claude does not sleep. Claude does not get lower back pain. Claude is not you.

This skill is for you.

![Dhondu just chill](https://media1.tenor.com/m/cVOPRBRLThsAAAAC/all-the-best-sanjay-mishra-raghu-dhondu-just-chill.gif)

---

## What it does

- Detects the local time and fires a reminder when you cross a threshold (9pm, 11pm, 1am)
- Delivers the reminder in your language. Not just translated. In the register you'd use texting a friend at midnight.
- Speaks as your street-smart best friend, not a wellness app. Hindi/Marathi fires in tapori register. "Aye bidu chal re, kitna ho gaya screen pe?"
- Draws from 15+ film universes: Bollywood tapori (Munna Bhai, Hera Pheri), Kollywood, KGF, In Bruges, El Chavo, and more. Never the same reference twice.
- Escalates in tone. The 9pm message is a suggestion. The 1am message is two words.
- Calendar awareness (optional): if you have a standup at 9am, it will tell you. "Bhai kal 9am standup hai bidu. So ja."
- Logs every reminder to Obsidian so you can see your own patterns and feel appropriately judged
- Lets you snooze it if you're "almost done" (you're not almost done)


https://github.com/user-attachments/assets/53a08815-ef2a-4301-944f-c3f53232fa0f


---

## Supported languages

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

Six fictional/pop culture packs also included: Klingon, Sindarin Elvish, Dothraki, Minionese, Groot, and Simlish. Because why not.

---

## Installation

```bash
git clone https://github.com/swapniltamse/one-more-prompt ~/.claude/skills/chill
bash ~/.claude/skills/chill/install.sh
```

The installer runs three steps and tells you exactly what it's doing at each one.

Step 1 sets up config.yaml: asks your name, language, and timezone. Skipped if a config already exists.

Step 2 wires the Claude Code hook: adds one entry to `~/.claude/settings.json` under `hooks.PostToolUse`. This fires after every tool call. Checks before adding, so safe to run twice.

Step 3 sets up system notifications (optional, you choose y/n). For when you're on claude.ai, Cursor, VS Code, or anywhere else. On Windows, creates 3 tasks in Task Scheduler under `chill\`, one per threshold. On macOS/Linux, adds 3 cron entries. No admin rights required.

To remove everything: `bash ~/.claude/skills/chill/uninstall.sh`

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

## How it works

The hook checks local time after every Claude tool call. When you cross a threshold, it picks a message and prints it. Your main Claude session never does the work.

Two modes:

- Cache mode (default): pre-generated messages read from disk instantly. No API call. No latency. Run `bash ~/.claude/skills/chill/scripts/refresh_cache.sh` once to build the cache — generates 5 messages per tier × language, refreshes in seconds. Falls back to live generation if cache is empty.
- Context-aware mode: reads what tool you just ran and what you were working on, generates a message specific to that moment. Takes ~25 seconds. Enable with `context_aware: true` in config.yaml.

### Why it works (or tries to)

The reason you can't stop coding at midnight isn't willpower. It's the Zeigarnik effect: your brain marks incomplete tasks as urgent and keeps them active until they're resolved. "Just one more" is your brain lying to you about how close you are.

Each message does two things: names the cognitive state ("your brain is flagging this as urgent because it's incomplete, not a real deadline"), then contrasts it with your future self ("the 9am version of you fixes this in 15 minutes"). Hal Hershfield has spent a decade studying this. Vivid future-self contrasts change behavior. Vague reminders don't.

Tone is doing real work here too. A message that sounds like a friend catches you differently than a productivity nudge.

### The messages escalate

Each message has two parts: a reframe first, then the tapori line. The reframe names what is actually happening. The tapori line makes it feel like a friend, not an app.

**Tier 1 — 9pm (warm, a friend noticing):**
```
Aye bidu, kal subah 9 baje tu ye 15 minute mein fix kar dega.
Aaj raat? Aur bada kar dega. Pakka.
Bhai thanda le zara — tu almost done nahi hai, tu almost thaka hua hai.
```

**Tier 2 — 11pm (firmer, done waiting):**
```
Ye 'urgent' feeling apun jaanta hai kahan se aati hai.
Kaam adha hai toh dimag chalta rehta hai. Actual deadline kuch nahi. Chal so.
Tu Babu Bhaiya mode mein hai — har plan ke baad ek aur plan. Aaj ka plan: band kar aur so ja.
```

**Tier 3 — 1am (two words, no jokes):**
```
bas bidu. so ja.
```

English (Tier 1):
```
The 9am version of you fixes this in 15 minutes.
The midnight version creates two new bugs and doesn't notice.
You are not almost done. You are almost asleep.
```

### Context-aware mode

When `context_aware: true` is set, the hook reads what you were just doing and calls you out specifically. Real example from a live session:

```
> /chill

Swapnil bhai, tune abhi API cost compare kiya — Haiku vs Opus vs Sonnet.
Matlab tu abhi productivity calculate kar raha hai, kaam nahi. Chal band kar.
```

It read the last tool call, saw a cost comparison, and named exactly what was happening. No generic reminder. Enable it with `context_aware: true` in config.yaml. Takes ~25 seconds to generate. Worth it.

---

## Calendar awareness (optional)

When `calendar: true` is set in your config, /chill checks your first meeting tomorrow and includes it in the message.

> "aye bidu, kal 9am standup hai. band kar laptop aur so ja."

For manual `/chill`: Claude calls Google Calendar MCP directly (requires MCP connected to your Claude account).

For the auto-fire hook: it reads a cache file at `/tmp/chill_calendar_cache.txt`. Populate it by running `scripts/fetch_calendar.sh` on a schedule:

```bash
# Add to crontab (runs every day at 6pm)
0 18 * * * bash ~/.claude/skills/chill/scripts/fetch_calendar.sh
```

If you're not comfortable connecting Calendar MCP, leave `calendar: false`. Everything else works fine.

---

## Using with other tools

The hook works with any AI coding tool that supports running a shell command after tool calls. Set `model_cmd` in config.yaml to swap the LLM:

```yaml
model_cmd: "llm"          # Simon Willison's llm — OpenAI, Anthropic, local models
model_cmd: "sgpt"         # shell-gpt
model_cmd: "ollama run llama3"  # local Ollama
model_cmd: "gemini -p"    # Gemini CLI
```

| Tool | Hook type | Config location |
|------|-----------|----------------|
| Claude Code | PostToolUse | `~/.claude/settings.json` |
| Codex CLI | after-tool | `~/.codex/config.toml` |
| Gemini CLI | PostToolUse | `~/.gemini/settings.json` |

`install.sh` wires Claude Code only. For other tools, point the hook manually to `bash ~/.claude/skills/chill/hook.sh`.

---

## Adding a new language

1. Copy `languages/en.yaml` as a template
2. Fill in `language`, `register`, `film_industry`, `tone_guide`
3. Add 2-3 examples per tier in romanized script
4. Add 1-2 movie quote parodies per tier (the funnier the better)
5. Name the file with the ISO 639-1 code (e.g. `de.yaml` for German)
6. Open a PR

See `languages/README.md` for the full contributor guide.

---

## The story behind this

The tapori register was inspired by [bhai-lang](https://github.com/DulLabs/bhai-lang). If bhai-lang could make `print` feel like home, /chill could make "close the laptop" feel the same way.

Send it to whoever needs it.

Built by [Swapnil Tamse](https://www.linkedin.com/in/swapniltamse/), Engineering Leader in AI/AI Security.

---

## Contributing

PRs welcome, especially:
- New language packs (see `languages/README.md`)
- New movie quote parodies (submit with the English translation)
- Better Tier 3 messages (they need to be devastating)

---

## License

MIT. Use it. Share it. Go to sleep.
