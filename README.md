# Ablak

**A counter-side guide for Hungary.** Hungarian in, your own language out, in real time —
for the moment a newcomer is standing at an immigration window with documents in
both hands and does not understand the question they were just asked.

*Ablak* is Hungarian for "window" — the counter you get called to at a Hungarian
government office. "Fáradjon a kettes ablakhoz." Go to window two.

Submitted to the **Hiya Voice AI Challenge**, track: *Real-Time Assistance*.

**Live demo: https://alinaerkul.github.io/ablak/** (Chrome or Edge, for the microphone).

Why it exists: in the Facebook groups for international people in Hungary that I
am part of, every week I see a few posts asking for someone who speaks Hungarian
and English to come along to a hospital, a bank or a public office. Ablak is for
the moment at the counter when there is nobody to ask. The longer story is in
[`WRITEUP.md`](WRITEUP.md).

Why each decision was made, with the alternatives considered, is in
[`DECISIONS.md`](DECISIONS.md). How AI tools were used and how I directed the
agent is in [`ai.md`](ai.md).

---

## Run it

No API key. No account. No install. The matcher runs entirely in the page; speech
recognition in Chrome and the web fonts need an internet connection.

```bash
git clone https://github.com/alinaerkul/ablak.git
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

You don't need to. In the middle column of the workspace, click any of the
example buttons under the text box (or type your own). They run through exactly
the same matcher as speech — the microphone is just one way in. The remaining
examples below are the same phrases to type.

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

Open **http://localhost:8000/tests/index.html** (with the server running): it
runs 159 assertions in the browser and should report `159 passed · 0 failed`.
The same file also runs under node if you have it:

```bash
node tests/matcher.tests.js     # same assertions, no dependencies
```

There is also a browser-driven end-to-end suite in `tests/smoke_test.py`, which
loads the real page in Chrome and drives it. It uses the server on port 8000, and
it looks for Chrome in the usual macOS and Linux places (set `ABLAK_CHROME` to point at another):

```bash
pip install playwright && playwright install chromium
python3 tests/smoke_test.py      # needs the server running on :8000
```

Both suites found real bugs during development, listed in `ai.md`.

---

## What it does

1. **Listens in Hungarian** (`hu-HU`) continuously via the Web Speech API.
2. **Matches** the transcript against a curated corpus of 239 things officials
   actually say at five places — immigration, bank, clinic, supermarket, mobile & internet — in 844 surface
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

The user can also initiate. Four essential phrases ("could you repeat that",
"please speak more slowly", "could you write that down", "I do not understand")
and 119 ready phrases grouped by counter are spoken aloud in Hungarian on one tap.

The other direction is covered too: **Your reply in Hungarian**, in the result column
right under the guidance. Speak or type in English or Russian; the app matches your words to the closest of the 119 prepared
Hungarian phrases and shows what it means before you tap *Speak it*. Nothing is
said aloud automatically, because word overlap cannot tell "block my card" from
"my card has been blocked". If a free AI key is saved in Settings, anything that is
not a prepared phrase is translated by the model instead, labelled as an
unverified machine translation with a back-translation to check.

Three more tools sit on the home page, each opening in place:

- **Practice a booking call.** The app plays the clerk in Hungarian for seven
  scripted situations (café, doctor, bank by phone, bank branch, supermarket,
  mobile shop, immigration); you answer by
  voice, typing or tapping a suggested reply.
- **Courier card.** Your address, floor, door and phone in large type, with fixed
  Hungarian phrases for a delivery person. Nothing is saved.
- **Call simulator.** A scripted, simulated call in which an agent speaks Hungarian
  on your behalf. It says first that it is an AI, pauses to ask you before it
  accepts a change or says a gate code, and hands the call back to you when asked
  for a health-insurance number. No real call is made; it shows the design of the
  planned real thing.

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
- **You cannot spell what you did not catch.** Hungarian adds endings, so
  *lakcímkártya* (address card) is heard as *lakcímkártyáját*, which a newcomer
  cannot spell by ear. A microphone does not need them to.
- **The pressure is audible.** The app hears the real sentence, including the
  speed and the register that made it hard to follow in the first place.

### Why a curated corpus and not a general translator

A general translator renders words. At a counter, words are not the problem —
*knowing which document to pull out of the folder* is. "Kérem a lakcímkártyáját"
translated as "I request your address card" leaves the user no better off; they
still do not know that it is the A4 sheet with a QR code (printed or on the
phone) and not the passport.

Bureaucratic Hungarian is also formulaic. The same forty phrases recur across
every appointment, which makes a curated corpus tractable in a way that general
conversation is not — and makes every single answer auditable by a human before
it is ever shown to a user.

### Why it refuses

**When it is not sure, it says so instead of guessing.**
Many clerks see that you do not speak Hungarian and try to help, so a wrong answer
is rarely the end of the visit. But a confident wrong answer gets in the way of
that help: you hand over the wrong document or nod to something you
misunderstood, the clerk thinks you understood, and you lose time or agree to
something that is hard to undo. "I am not sure" tells you to ask instead, and the
app gives you the phrases to ask with.

An LLM produces fluent output for every input, including inputs it misheard, and
cannot tell you which ones it got right. The matcher can: it returns a calibrated
score, and below threshold it declines and offers to ask the clerk to repeat.
Several of the 159 checks assert that it refuses. The refusal is a feature, and
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

Typed text and the matcher stay on the device. Spoken input goes through the
browser's own speech service (in Chrome, Google's), which Ablak never receives.
The page loads three web fonts from Google Fonts, so a visitor's IP address is
sent to Google at load. There is no backend, no account, no analytics and nothing
to log. A content security policy in each page limits where it can send data to
Google Fonts and the two optional AI providers. `privacy.html` states this in full.

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

### Optional: Whisper recognition

If Chrome mishears Hungarian (noise, accent), Settings → *Better Hungarian
recognition* switches the microphone to Groq's hosted Whisper large v3: it records
a short clip, stops when you stop talking, sends it to Groq with your own free key
(the same one saved above), and feeds the transcript to the same matcher. It is off
by default, the audio leaves the device, and nothing about the matcher or its
refusal thresholds changes. It also lets the microphone work in browsers without
built-in speech recognition.

Model answers are treated differently from corpus answers, by design:

- labelled **«Не проверено»** (*unverified*) with the provider named
- they always raise the caution banner
- **they never produce a "hand over this document" instruction** — a
  hallucinated document name is the most expensive error this product could make

---

## Project layout

```
index.html              the app: hero, workspace, tool cards that open in place
how-it-works.html       design and engineering explanation
privacy.html            what stays in the browser, what leaves, limits
about.html              story, contact
css/styles.css          the design system; class names are a contract with js/
js/i18n.js              interface language (en/ru); Hungarian is never translated
js/phrases.js           the corpus — 239 cards, 844 surface forms, 119 user phrases
js/matcher.js           n-gram + IDF matcher and confidence calibration
js/speech.js            Web Speech API wrappers (recognition + synthesis)
js/llm.js               optional, opt-in open-vocabulary fallback
js/whisper.js           optional Whisper microphone engine (Groq, own key)
js/sayit.js             say it in Hungarian: prepared phrases, optional translation
js/practice.js          booking practice: scripted clerk dialogues
js/courier.js           courier card
js/callsim.js           call simulator: scripted agent-on-your-behalf calls
js/app.js               controller: state, rendering, the three-state UI
js/home.js, js/site.js  tool panels that open in place; mobile menu
img/                    hero image
tests/matcher.tests.js  159 assertions, runs in the browser and in node
tests/index.html        browser test runner
tests/smoke_test.py     end-to-end checks driven through real Chrome
DECISIONS.md            why each decision was made, and what else was considered
ai.md                   which AI tools were used and how
WRITEUP.md              the one-page submission write-up
```

No dependencies, no build step, no framework.

---

## What I'd do next

In rough order of how much each would matter to a real user:

1. **Replace the corpus with the real one, and make it much larger.** Survey
   international students about what they were asked at hospitals, banks and
   offices and could not follow, and ask staff at those places which phrases
   they say most. Use that to add many more phrases and the words inside them,
   not just to rewrite the current 239. The
   matcher is ready; the corpus is the product. All 239 phrases were generated by
   an AI assistant and I reviewed their content; they still need review by a
   native Hungarian speaker, and none of them come from data.
2. **Real phone calls on the user's behalf.** The call simulator shows the
   design: scripted dialogue, an agent that says it is an AI, pauses for the
   user's decisions, no identity or health numbers. A real version needs
   telephony and Hungarian speech services, and starts with low-risk calls
   (a table, a courier). A Telegram version is also planned.
3. **More explanation languages.** The architecture already carries two —
   `js/i18n.js` holds the interface strings and each phrase card holds its
   explanation per language, with the Hungarian side untouched. Adding
   Ukrainian, Serbian, Vietnamese or Mongolian is a translation task, not a
   rewrite: those are the next largest groups at these counters.
4. **On-device recognition.** The Web Speech API routes audio through the browser
   vendor. `whisper.cpp` compiled to WASM would make the privacy claim absolute
   rather than merely good, at the cost of a model download.
5. **Learn from refusals.** Every unmatched phrase is a gap in the corpus. Log
   them locally, let the user flag the useful ones, and grow the corpus from
   real counters rather than from my imagination.
6. **Diarisation.** Right now the app cannot tell the clerk's voice from the
   user's. Two-speaker separation would let it follow a whole appointment
   instead of one phrase at a time.
7. **Offline Hungarian TTS.** System voices are inconsistent across devices, and
   the reply is useless if it is unintelligible to the clerk.

---

## License

MIT. See `LICENSE`.
