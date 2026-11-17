# DECISIONS.md — why Ablak is built the way it is

Every important decision in this project, with the reasoning behind it, the
options I considered, and what the choice costs. Most of them follow from one
question: **what does a person standing at a Hungarian counter actually need,
and what would hurt them?**

How AI tools were used to build it is in [`ai.md`](ai.md). How to run it is in
[`README.md`](README.md).

---

## Three tests every idea had to pass

Before choosing what to build, I set three conditions, and I dropped ideas that
failed any of them:

1. **It can be built well before the deadline.** I chose a narrow product I could
   finish and test properly, instead of a larger one I could only half build. That
   is why there are five places and 239 phrases rather than "all of Hungarian
   bureaucracy", and why the call agent is a simulator rather than real calls.
2. **Hiya can test it without any problems.** No key, no account, no install and no
   server of mine: open the live link, or clone the repository and run one command.
   Anything that needs a key is optional. A reviewer can also type instead of
   speaking, so a missing microphone does not block the demo.
3. **It solves a real problem.** It comes from my own experience at a hospital, and
   from the posts I see every week in Facebook groups for international people
   asking for someone who speaks Hungarian to come along.

---

## The rule everything else follows

> **When Ablak is not sure, it says so instead of guessing.**

A wrong answer is rarely the end of the visit. Many clerks see that you do not
speak Hungarian and try to help anyway: they slow down, point, or switch to
English. But a confident wrong answer gets in the way of that help. If you hand
over the wrong document or nod to something you misunderstood, the clerk thinks
you understood, and you lose time, come back another day, or agree to something
that is hard to undo. "I am not sure" does the opposite: it tells you to ask, and
Ablak gives you the phrases to ask with ("Please speak more slowly", "Could you
write it down?"). So whenever a decision traded coverage against correctness, I
chose correctness, and I made the uncertainty visible instead of hiding it.

Two practical rules come next:

- **It must run with no key, no account and no backend.** The people it is for
  are students; a reviewer should be able to open it in one command. Anything that
  needs a key is optional and off by default.
- **Hungarian is never translated or changed.** The Hungarian phrase is what is
  said at the counter. Only the explanation around it changes language.

---

## Product decisions

### 1. A counter-side guide, not a translator

**Decision.** For each phrase the clerk says, Ablak tells you three things — what
is being asked, what to do right now, and **which document to take out** — then
gives you a short Hungarian reply to say back.

**Why.** At the hospital, a translation app did not help me. Translating the words
was not the problem; knowing what was expected of me was. "Kérem a
lakcímkártyáját" translated as "I request your address card" still does not tell
a newcomer that it is the A4 sheet with a QR code, printed or on the phone, and
not the passport.

**Considered.** A general translator; a chat assistant like ChatGPT.
**Rejected because** both answer in words, not in actions, and neither tells you
when it is unsure (see decision 5).

**Cost.** It only knows the situations it was prepared for.

### 2. Who it is for and where

**Decision.** International students and newcomers who know shop-level Hungarian
and none for an official counter. Five places: the immigration office, a bank, a
clinic, a supermarket and a phone shop (mobile and home internet). Explanations in English and Russian.

**Why.** This is the group I belong to and know: I came from Kyrgyzstan on a
Stipendium Hungaricum scholarship, and I run Jany Jashoo, an information platform
for Central Asian students in Hungary. Every week I see posts in Facebook groups for
international people asking for someone who speaks Hungarian to come along to a
hospital, a bank or a public office. Russian covers most Central Asian students;
English covers almost everyone else. The five places are where these requests come
from, and where a mistake has a real cost.

**Cost.** Other languages (Ukrainian, Vietnamese, …) are not there yet. Adding one
is translation work, not engineering, because the Hungarian side never changes.

### 3. Voice as the main input, typing as a backup

**Decision.** You press one button and the app listens to the clerk. You can also
type.

**Why.** This is exactly the moment where a keyboard fails:
- both hands hold documents;
- eyes are on the clerk and the number display;
- the clerk is waiting, so there are no fifteen seconds to type;
- you cannot type a word you did not catch: Hungarian adds endings, so
  *lakcímkártya* (address card) is heard as *lakcímkártyáját*, which a newcomer
  cannot spell by ear.

**Where typing is better, the app offers typing** — the practice answers and the
courier card — because there the user has time and knows what they want to say.

### 4. It also speaks for you (the reply direction)

**Decision.** You say or type what you want in English or Russian, and Ablak gives
you a prepared Hungarian phrase that you can read or let it say aloud.

**Why.** Understanding the clerk is half of it; at the hospital I also could not
say "I want to see a dentist". A prepared phrase is matched first, because it is
checked and its meaning is shown. Only when nothing matches, and only with the
user's own key, a machine translation is offered — labelled **unverified**, with a
back-translation so the user can check what they are about to say.

**A safety detail.** "Block my card" and "My card has been blocked" share almost
all their words but mean opposite things. When two phrases are that close, the app
shows both and lets the user choose instead of picking one.

### 5. It refuses when it is not sure

**Decision.** Three visibly different results:

| Score | What the user sees |
|---|---|
| ≥ 0.52 | **High confidence:** the meaning, the action, the document and a reply |
| 0.30 – 0.52 | **Check this:** the best guess, alternatives and a caution |
| < 0.30 | **Not understood:** no guess, and a phrase to ask the clerk to repeat slowly |

On top of that, a **margin guard**: if the second-best match is within 0.08 of the
best, a confident answer is downgraded to "check this". Two near-equal scores mean
the app cannot tell the phrases apart, and the user should see that instead of a
coin flip.

**Why.** See the rule at the top. A language model gives a fluent answer to every
input, including one it misheard, and cannot say which of its answers are right.
This matcher returns a score, so it can.

**Considered.** Lowering the threshold to answer more often. **Rejected:** more
answers would include more confidently wrong ones.

**Cost.** It refuses some phrases it could have guessed. The thresholds were set on
my own test phrases, not on real recorded speech, so they need to be checked again
with real data.

### 6. The language model is optional, labelled, and never names a document

**Decision.** For phrases outside the prepared set, a user can add their own free
Groq or Gemini key. The model's answer is marked **unverified**, always shows the
caution banner, and **never names a document**.

**Why.** It is useful to get a rough idea of an unknown phrase. But a hallucinated
document instruction is the worst mistake this product could make, so the model is
told never to invent a document name, and the app never shows a document for a
model answer: that field is always empty.

**Also.** The model's explanation is in the interface language (English or
Russian). With Groq, if a model is retired, the app asks which models the key can
use and picks another, instead of breaking.

### 7. Four tools around the core

| Tool | Why it exists | Key decision |
|---|---|---|
| **Your reply in Hungarian** | Two-way conversation | Prepared phrases first; machine translation only opt-in and labelled |
| **Practice mode** | Rehearse a call or a visit before it happens | Scripted dialogues, no model: it works offline and every line is checked. Levels from easy (café) to hard (immigration) |
| **Courier card** | Couriers call and speak fast | Address in large type and fixed phrases. **Nothing is saved**, and the gate code never appears on the card or the clipboard |
| **Call simulator** | Shows how an agent could call on your behalf | **Scripted, no real call.** The agent says it is an AI first, pauses for your decision before accepting any change, and never gives ID or health-insurance numbers |

**Why the calls are simulated, not real.** A real outbound call needs telephony,
costs money per call and raises questions of consent and safety. For this deadline
the simulator demonstrates the rules a real agent would follow, and each rule is
tested.

### 8. Things I tried and decided against (for now)

- **A livelier voice (e.g. ElevenLabs).** The browser's Hungarian voice sounds
  mechanical. A voice picker was built and then removed: on a typical Mac there is
  only one Hungarian voice, so the menu offered no real choice. The better plan,
  for later, is to record the fixed phrases once with a natural voice and ship the
  audio files, which keeps the "no key" rule.
- **Real phone calls and a Telegram version.** Out of scope for the deadline; they
  are the next steps.
- **Phone plan prices and provider names.** The Mobile & Internet phrases explain
  terms that are the same at every provider (prepaid, monthly, commitment period,
  carried-over data, yearly price rises), but no prices or tariff names. Prices
  belong to one provider, change with promotions and inflation, and a stale amount
  shown with confidence is exactly the mistake the app is built to avoid.

---

## Technical decisions

### 9. How the matching works

The core compares what was heard with 239 prepared phrases (844 spoken forms). It
uses two signals, because each fails in a different way:

| Signal | Weight | What it handles |
|---|---|---|
| **Character 4-grams** (cosine similarity) | 40% | Hungarian endings: *lakcímkártya* and *lakcímkártyáját* share most 4-letter chunks. Also speech-recognition errors, which are usually a few letters wrong |
| **Keywords weighted by rarity (IDF)**, cut to 8-letter stems | 60% | Ignores shared openings like "Kérem a…", which start many phrases; a word found in one phrase is strong evidence |

**Why keywords weigh more:** at a counter, precision matters more than recall.

**Why 8-letter stems, not 6.** With 6 letters, *lakcím* (address) and
*lakcímkártya* (address card) became the same word, so "What is your address?"
was matched to "hand over your address card". A test caught it; the stems are now
8 letters and a test keeps the two apart.

**Choosing a place narrows the search.** Picking "Bank" rebuilds the index for bank
phrases only, so the rarity weights are recalculated: words that are common in
every bank phrase stop counting as evidence.

**Considered and not chosen now:**

| Option | Why not now |
|---|---|
| A real Hungarian morphological analyser (Hunspell-hu, emMorph) | Adds a dependency; 8-letter stems work well enough for 239 phrases |
| Edit distance (Levenshtein) | Handles typos, but handles long Hungarian endings worse than 4-grams |
| Meaning-based search with embeddings | Understands paraphrases, but needs a large model download or a key, and is harder to explain. **Good candidate once there is real data** |
| A language model as the classifier | Needs a key; answers change between runs; cannot be tested the same way |
| A trained classifier | Needs thousands of real labelled phrases. There are none yet |

**Known weakness.** If a clerk says the same thing with completely different
words, the match can miss. This is partly covered by several prepared variants per
phrase, and is the main reason the next step is collecting real phrases.

### 10. Speech recognition: the browser's, with Whisper as an option

**Decision.** By default, the browser's built-in speech recognition (Web Speech
API; in Chrome it is run by Google). Optionally, Whisper through Groq with the
user's own key.

**Why.** The built-in recognition is the only option that is free, needs no key, no
server of mine and no model download, shows the text while you speak, and handles
Hungarian. When I tested the microphone at my university, it did not recognise a
simple Hungarian question well, so Whisper was added as an option for noisy rooms.

| Option | Why (not) chosen |
|---|---|
| **Browser Web Speech API** ✅ default | Free, no key, live text. Works in Chrome and Edge, not Firefox; audio goes to Google |
| **Whisper via Groq** ✅ option | Better in noise, accepts a vocabulary hint (*lakcímkártya*, *TAJ*). Needs a key; text appears after recording, not live |
| Google Cloud / Azure speech | Good Hungarian, but paid after a small free tier and needs a server to hide the key |
| Whisper running in the browser | Fully private and free, but a large download and slow on phones. **Planned** |

**The engine is replaceable.** Everything after recognition works on text, so the
recognition engine can change without touching the matcher.

### 11. No framework, no build step, no dependencies

**Decision.** Plain JavaScript, HTML and CSS. `python3 -m http.server` and it runs.

**Why.**
- Anyone can run it in one command; there is no `npm install` that can fail.
- GitHub Pages serves the files exactly as they are in the repository.
- The browser already provides what is needed: speech recognition, speech output,
  audio recording and network requests.
- Nothing to go out of date: with zero dependencies there are no security updates
  to chase and nothing that stops building in a year.
- Every line can be read and explained without knowing a framework.

**Cost.** No type checking (tests catch errors instead) and scripts are loaded in
order by hand.

### 12. Hosting on GitHub Pages

Free, HTTPS (required for the microphone), and the live site and the code are in
one place. There is no server-side part, so no server is needed.

### 13. Privacy, stated plainly

| Stays in the browser | Goes out | Stored |
|---|---|---|
| The matcher and all 239 phrases; anything typed or tapped; the practice, simulator and courier card | Spoken input to the browser's speech service (Google in Chrome); fonts from Google Fonts; with a key, requests to Groq or Gemini | The interface language and, only if added, the API key — in the user's own browser |

There is no account, no analytics and no database. A content-security policy
limits the page to those hosts. I do not claim "nothing leaves the device",
because with Chrome the audio does.

### 14. How it is tested

| Suite | What it checks | Why it exists |
|---|---|---|
| **159 unit checks** (`tests/matcher.tests.js`, runs in the browser and in Node) | Every prepared phrase and variant finds its own card; the app refuses nonsense; every card is complete in both languages; the simulator's safety rules; the model prompt never allows a document | Fast, no dependencies; they protect the rules above |
| **51 end-to-end checks** (`tests/smoke_test.py`, Playwright + real Chrome) | The real page loads, buttons respond, results render | They caught bugs unit tests cannot see, such as a hidden panel that blocked every click |

Both suites must pass before a commit. Several checks exist specifically to make
sure the app **refuses** when it should.

---

## What would change these decisions

- **Real phrases from students and staff** would let me check the thresholds,
  add many more phrases, and possibly move to meaning-based matching.
- **Measured results** — how often it explains real phrases correctly, how often it
  refuses instead of being wrong, and whether people get through a visit without
  asking a stranger to come along — would show whether the refusal rule costs too
  much coverage.
- **A native Hungarian speaker's review** of the phrase wording is needed before
  real use.
