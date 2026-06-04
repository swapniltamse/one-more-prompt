# Adding a New Language Pack

This folder contains language packs for the `/chill` skill. Each file defines the tone, examples, and film references Claude uses to generate fresh wellbeing reminders.

The files are **tone guides**, not message banks. Claude reads them as few-shot anchors and generates a new message every time. This means infinite variety while staying culturally grounded.

---

## How to Add a Language

### 1. Copy the template

```bash
cp en.yaml xx.yaml   # replace xx with ISO 639-1 code (e.g. de, fr, jp, sw)
```

### 2. Fill in the header fields

```yaml
language: German
register: Casual German texting — du-form, Berlin startup energy, warm
film_industry: German cinema (Lola Rennt, Good Bye Lenin)
```

**`register`** is the most important field. Be specific: describe the voice, the relationship implied, the social context. "Casual" isn't enough. "How a Berlin dev texts a friend at midnight" is perfect.

### 3. Fill in tone_guide for each tier

```yaml
tone_guide:
  tier1: "Light and friendly. A nudge, not a warning."
  tier2: "Firmer. Like someone who actually cares."
  tier3: "Short. Direct. No jokes left."
```

### 4. Add 2-3 examples per tier

Use **romanized script** (Latin characters) for all languages. This keeps it:
- Terminal-safe
- Readable for contributors who don't speak the language
- Consistent with how most developers actually text in their native language

Each example has two fields:
```yaml
- text: "alter mach mal pause, du bist schon ewig online"
  en: "(dude take a break, you've been online forever)"
```

The `en` field is for contributors only — it never shows to the user.

### 5. Add 1-2 movie quote parodies per tier

These should be:
- Recognizable to someone from that culture
- Adapted to the "go take a break" context (not a literal quote)
- Funny enough to make someone actually smile at 1am

```yaml
- text: "wie Lola in Lola rennt - aber heute rennst du ins Bett"
  en: "(like Lola in Run Lola Run — but today you run to bed)"
```

### 6. Add a follow_up line

```yaml
follow_up:
  text: "5 Minuten Stretch? Oder schreib /chill snooze {n}"
  en: "(5 min stretch? or type /chill snooze {n})"
```

`{n}` gets replaced with the user's configured snooze duration.

### 7. Name the file

Use the ISO 639-1 two-letter code. For regional variants, use `xx-YY` format:
- `en-ie.yaml` for Irish English
- `pt-br.yaml` for Brazilian Portuguese (if you want to split from European)
- `zh-cn.yaml` for Simplified Chinese

### 8. Open a PR

Update the language table in the main `README.md` with your new entry.

---

## Quality bar

A good language pack makes someone from that culture laugh when they read it. If you're not sure, ask a friend who texts in that language to review it.

The worst outcome is a message that feels translated. The best outcome is a message that feels like it was written by someone who was there.

---

## Current Language Packs

| File | Language | Contributor |
|------|----------|-------------|
| `hi.yaml` | Hindi | @swapniltamse |
| `ar.yaml` | Egyptian Arabic | @swapniltamse |
| `ta.yaml` | Tamil | @swapniltamse |
| `kn.yaml` | Kannada | @swapniltamse |
| `mr.yaml` | Marathi | @swapniltamse |
| `es.yaml` | Spanish | @swapniltamse |
| `pt.yaml` | Portuguese | @swapniltamse |
| `en-ie.yaml` | Irish English | @swapniltamse |
| `en.yaml` | English (fallback) | @swapniltamse |
