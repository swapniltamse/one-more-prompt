# /chill — One More Prompt, But Make It Your Last

> "Just one more prompt."
> — Every developer, 2am, right before they broke production.

A Claude Code skill that fires when you've been at it too long. Speaks as your street-smart best friend. In your own language. Escalates. And if you have a 9am standup, it will tell you that too.

---

## The problem

You opened Claude to fix a bug. That was four hours ago. It's now past midnight. You're refactoring things that weren't broken. Claude is happy to keep going. Claude does not sleep. Claude does not have a mortgage. Claude is not you.

This skill is for you.

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

### Fictional / pop culture languages

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

The installer runs three steps and tells you exactly what it's doing at each one.

Step 1 sets up config.yaml: asks your name, language, and timezone. Skipped if a config already exists.

Step 2 wires the Claude Code hook: adds one entry to `~/.claude/settings.json` under `hooks.PostToolUse`. This fires after every tool call. Checks before adding, so safe to run twice.

Step 3 sets up system notifications (optional, you choose y/n). For when you're on claude.ai, Cursor, VS Code, or anywhere else. On Windows, creates 3 tasks in Task Scheduler under `chill\`, one per threshold. On macOS/Linux, adds 3 cron entries. The installer prints exactly what it will register before doing it. No admin rights required.

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

## How it works

The hook checks local time after every Claude tool call. When you cross a threshold, it picks a message and prints it.

Your main Claude session never does the work. The hook runs as a separate subprocess. Two modes:

- Cache mode (default): reads a pre-generated message from disk instantly. No API call. No latency.
- Context-aware mode: reads what tool you just ran and what you were working on, then generates a message specific to that moment. Takes ~25 seconds but personalized. Enable with `context_aware: true` in config.yaml.

### Message caching (recommended)

By default, if a cache exists, the hook reads a random pre-generated message from disk instantly. No API call, no latency.

To build the cache:

```bash
bash ~/.claude/skills/chill/scripts/refresh_cache.sh
```

This generates 5 messages per tier × language combination (45 total for the default hi/mr/en config) and stores them in `~/.claude/skills/chill/cache/`. Run it once, then refresh weekly or whenever you change config.

If you skip the cache, the hook calls `claude -p` live. Fresh message every time, but 25-30 seconds is a long time to wait for someone to tell you to sleep. The cache is the right default.

Run the cache script and messages appear instantly. You get a pool of 5 per tier before anything repeats. Falls back to live generation automatically if the cache is empty.

### Why it works (or tries to)

The reason you can't stop coding at midnight isn't willpower. It's the Zeigarnik effect: your brain marks incomplete tasks as urgent and keeps them active until they're resolved. "Just one more" is your brain lying to you about how close you are.

Each message does two things: names the cognitive state ("your brain is flagging this as urgent because it's incomplete, not a real deadline"), then contrasts it with your future self ("the 9am version of you fixes this in 15 minutes"). Hal Hershfield has spent a decade studying this. Vivid future-self contrasts change behavior. Vague reminders don't.

Tone is doing real work here too. A message that sounds like a friend catches you differently than a productivity nudge.

### The messages escalate

Each message has two parts: a psychological reframe first, then the tapori line. The reframe does the actual work. The tapori line makes it feel like a friend, not a productivity app.

**Tier 1 — 9pm (warm, a friend noticing):**
```
Kal subah 9 baje wala Swapnil ye bug 15 minute mein fix karega.
Aaj raat wala ise aur bada karega.
Bhai thanda le zara — tu almost done nahi hai, tu almost thaka hua hai.
```

**Tier 2 — 11pm (firmer, still loving):**
```
Tera dimag is kaam ko urgent feel kara raha hai kyunki ye incomplete hai.
Ye Zeigarnik effect hai, real deadline nahi.
Swapnil... bidu, laptop band kar. Dhondu style. Bas.
```

**Tier 3 — 1am (short sentences, no jokes):**
```
Thaka hua brain bugs fix nahi karta. Naye banata hai.
Bas. So ja.
```

English equivalent (Tier 1):
```
The 9am version of you fixes this in 15 minutes.
The midnight version creates two new bugs and doesn't notice.
You are not almost done. You are almost asleep.
```

![Dhondu just chill](https://media1.tenor.com/m/cVOPRBRLThsAAAAC/all-the-best-sanjay-mishra-raghu-dhondu-just-chill.gif)

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

`fetch_calendar.sh` uses `claude -p` with Calendar MCP to get tomorrow's first event and writes it to the cache. If you're not comfortable connecting Calendar MCP, leave `calendar: false`. Everything else works fine.

---

## Using with other tools

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

## Adding a new language

1. Copy `languages/en.yaml` as a template
2. Fill in `language`, `register`, `film_industry`, `tone_guide`
3. Add 2-3 examples per tier in romanized script
4. Add 1-2 movie quote parodies per tier (the funnier the better)
5. Add a `follow_up` line
6. Name the file with the ISO 639-1 code (e.g. `de.yaml` for German)
7. Open a PR

See `languages/README.md` for the full contributor guide.

---

## The story behind this

I built this after a friend texted me a prompt at 2:47 AM. He wasn't stuck. The original task was done hours ago. He just couldn't stop.

I recognized it. I do it too.

Send it to whoever needs it.

The tapori register was inspired by [bhai-lang](https://github.com/DulLabs/bhai-lang). If bhai-lang could make `print` feel like home, /chill could make "close the laptop" feel the same way.

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
