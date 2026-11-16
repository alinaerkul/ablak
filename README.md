# Ablak

**A voice assistant for the counter.** Hungarian in, your own language out, in real time —
for the moment a newcomer is standing at an immigration window with documents in
both hands and does not understand the question they were just asked.

*Ablak* is Hungarian for "window" — the counter you get called to at a Hungarian
government office. "Fáradjon a kettes ablakhoz." Go to window two.

Submitted to the **Hiya Voice AI Challenge**, track: *Real-Time Assistance*.

---

## Run it

No API key. No account. No install. No network required after the first load.

```bash
git clone <this-repo>
cd ablak
python3 -m http.server 8000
```

Open **http://localhost:8000** in **Chrome** or **Edge**.

The interface opens in **English**. The **EN / RU** button in the header switches
the explanation language — Russian is what the actual user would run it in.
Hungarian is always the language it listens to and speaks; only the language it
*explains* in changes.

That is the whole setup. `localhost` counts as a secure context, so the
microphone works; opening `index.html` directly from the filesystem will not get
microphone permission, which is why the server is needed.

### If you don't speak Hungarian

You don't need to. Scroll to **«Ввод текстом»** (*Text input*) and click any of
the six example buttons. They run through exactly the same matcher as speech —
the microphone is just one way in.

The examples are chosen to show behaviour, not to flatter it:

| Example | What it demonstrates |
|---|---|
| `Kérem a lakcímkártyáját.` | Exact match → confident, names the document to hand over |
| `kerem a lakcimkartyajat` | Same phrase, no accents → still confident |
| `holnap reggel nyolcra jöjjön vissza` | Reordered, partial → still resolves |
| `Hiánypótlásra fogjuk felszólítani.` | High-stakes phrase → raises a warning banner |
| `Van TAJ kártyája?` | Different counter (clinic) |
| `A kutyám megette a házi feladatomat.` | **Out of domain → refuses to answer** |

That last one is the important one. See *Design* below.

### Browser support

| | Speech in | Speech out | Text input |
|---|---|---|---|
| Chrome / Edge | yes | yes | yes |
| Safari | partial | yes | yes |
| Firefox | no | yes | yes |

The app detects what is missing and degrades to the text path rather than
breaking. For Hungarian speech *output* you need a Hungarian system voice;
Settings → *Проверить венгерский голос* reports whether one was found.

---

## Run the tests

```bash
node tests/matcher.tests.js     # 54 assertions, no dependencies
```

Or open **http://localhost:8000/tests/index.html** for the same assertions in the
browser.

There is also a browser-driven end-to-end suite (40 assertions) in
`tests/smoke_test.py`, which loads the real page in Chrome and drives it:

```bash
pip install playwright && playwright install chromium
python3 tests/smoke_test.py      # needs the server running on :8111
```

Both suites found real bugs during development, listed in `ai.md`.

---

## What it does

1. **Listens in Hungarian** (`hu-HU`) continuously via the Web Speech API.
2. **Matches** the transcript against a curated corpus of 212 things officials
   actually say at four counters — immigration, bank, clinic, supermarket — in 765 surface
   forms.
3. **Answers in the user's language** (English or Russian) with three things,
   in this order:
   - *What they are asking* — in plain language, not a word-for-word translation
   - *What to do right now* — the physical action
   - *Which document to take out* — named, when the phrase implies one
4. **Speaks a reply back in Hungarian**, so the user can repeat it or hold up the
   phone. Understanding is only half of standing at a counter.
5. **Refuses when unsure.** Below the confidence threshold it says it did not
   understand and offers to ask the official to repeat more slowly.

The user can also initiate: eight ready phrases ("please speak more slowly",
"could you write that down", "which documents do I need to bring") spoken aloud
in Hungarian on one tap.

---

## Design

Three decisions carry the whole thing.

### Why voice is the right interface here

The brief asks for the moments where a keyboard would not do. This is one:

- **Hands busy.** Passport in one hand, folder in the other, phone on the counter.
- **Eyes busy.** You are looking at the clerk, the form, the number display.
- **No time.** The clerk has asked a question and is waiting. Typing what you
  half-heard into a translation app takes fifteen seconds you do not have, and
  you cannot type a word you could not make out.
- **You cannot spell what you cannot parse.** Hungarian agglutinates:
  *lakcímkártya* arrives as *lakcímkártyáját*. A newcomer cannot retype that.
  A microphone does not need them to.
- **The pressure is audible.** The app hears the real sentence, including the
  speed and the register that made it hard to follow in the first place.

### Why a curated corpus and not a general translator

A general translator renders words. At a counter, words are not the problem —
*knowing which document to pull out of the folder* is. "Kérem a lakcímkártyáját"
translated as "I request your address card" leaves the user no better off; they
still do not know that it is the small white plastic card and not the passport.

Bureaucratic Hungarian is also formulaic. The same forty phrases recur across
every appointment, which makes a curated corpus tractable in a way that general
conversation is not — and makes every single answer auditable by a human before
it is ever shown to a user.

### Why it refuses

**A confidently wrong answer at an immigration counter is worse than no answer.**
Hand over the wrong document and you lose the appointment. Sign the wrong form
and you may have agreed to something you cannot undo.

An LLM produces fluent output for every input, including inputs it misheard, and
cannot tell you which ones it got right. The matcher can: it returns a calibrated
score, and below threshold it declines and offers to ask the clerk to repeat.
Five of the 54 unit tests assert that it refuses. The refusal is a feature, and
it is the feature that makes the rest trustworthy.

There is a **margin guard** on top of the threshold: if the runner-up scores
within 0.08 of the winner, the result is downgraded to *uncertain* even when the
absolute score is high — two near-identical scores mean the matcher cannot tell
the cards apart, and that ambiguity has to reach the user rather than be settled
by a coin flip.

### How the matcher works

Two signals with deliberately different failure modes, blended 40/60:

1. **Character 4-gram cosine similarity.** Hungarian is agglutinative, so
   word-level matching misses *lakcímkártya* → *lakcímkártyáját*. Character
   n-grams catch it, and the same property makes it tolerant of speech
   recognition errors, which are usually a few characters wrong rather than a
   whole word wrong.
2. **IDF-weighted keyword stem hits.** N-grams alone get fooled by shared
   boilerplate — "Kérem a…" opens half the corpus. So each card declares its
   content words, weighted by inverse document frequency: a keyword in one card
   is strong evidence, one in twelve is nearly none. Matching is on an
   eight-character stem prefix, a crude stand-in for a Hungarian stemmer.

Keywords get the larger weight because precision matters more than recall here.

**Scenario narrowing** rebuilds the index rather than filtering results, so IDF
is recomputed over the active set: inside the bank, *számla* stops being a
distinguishing word and the keywords that actually separate bank phrases gain
weight.

### Privacy

In the default mode no audio and no transcript leaves the device beyond the
browser's own speech recognition. There is no backend, no account, no analytics
and nothing to log. That matters when the audio is a person's immigration
interview.

---

## Optional: open-vocabulary fallback

Off by default and not on the critical path — if it never runs, the product still
works.

When a phrase falls outside the corpus, the user can opt into a model call for a
best-effort gloss. Settings → *Открытый словарь*. Both supported providers have a
standing free tier that needs no credit card:

- **Groq** — https://console.groq.com
- **Google AI Studio (Gemini)** — https://aistudio.google.com/apikey

The key is typed into the UI and kept in `localStorage` on the user's own device.
There is no server, so there is nowhere else for it to go, and nothing is ever
committed to the repository.

Model answers are treated differently from corpus answers, by design:

- labelled **«Не проверено»** (*unverified*) with the provider named
- they always raise the caution banner
- **they never produce a "hand over this document" instruction** — a
  hallucinated document name is the most expensive error this product could make

---

## Project layout

```
index.html              the whole UI
css/styles.css          styling; constraints come from the use case, not taste
js/i18n.js              interface language (en/ru); Hungarian is never translated
js/phrases.js           the corpus — 212 cards, 765 surface forms, 109 user phrases
js/matcher.js           n-gram + IDF matcher and confidence calibration
js/speech.js            Web Speech API wrappers (recognition + synthesis)
js/llm.js               optional, opt-in open-vocabulary fallback
js/app.js               controller: state, rendering, the three-state UI
tests/matcher.tests.js  54 assertions, runs in node and in the browser
tests/index.html        browser test runner
tests/smoke_test.py     40 end-to-end assertions driven through real Chrome
ai.md                   which AI tools were used and how
WRITEUP.md              the one-page submission write-up
```

No dependencies, no build step, no framework. ~3,700 lines including tests and
comments.

---

## What I'd do next

In rough order of how much each would matter to a real user:

1. **Replace the corpus with the real one.** Mine the recurring questions from
   Jany Jashoo, the relocation platform I run for Central Asian students in
   Hungary (100+ users), and sit in the waiting room at Budapest's immigration
   office for a day with consent to log phrases. The matcher is ready; the
   corpus is the product and mine is 212 phrases written from experience, not
   from data.
2. **More explanation languages.** The architecture already carries two —
   `js/i18n.js` holds the interface strings and each phrase card holds its
   explanation per language, with the Hungarian side untouched. Adding
   Ukrainian, Serbian, Vietnamese or Mongolian is a translation task, not a
   rewrite: those are the next largest groups at these counters.
3. **On-device recognition.** The Web Speech API routes audio through the browser
   vendor. `whisper.cpp` compiled to WASM would make the privacy claim absolute
   rather than merely good, at the cost of a model download.
4. **Learn from refusals.** Every unmatched phrase is a gap in the corpus. Log
   them locally, let the user flag the useful ones, and grow the corpus from
   real counters rather than from my imagination.
5. **Diarisation.** Right now the app cannot tell the clerk's voice from the
   user's. Two-speaker separation would let it follow a whole appointment
   instead of one phrase at a time.
6. **Offline Hungarian TTS.** System voices are inconsistent across devices, and
   the reply is useless if it is unintelligible to the clerk.

---

## License

MIT. See `LICENSE`.
