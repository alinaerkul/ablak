# Ablak — a voice assistant for the counter

**Hiya Voice AI Challenge · Real-Time Assistance · Alina Erkulova**

---

*"Kérem a lakcímkártyáját."* I did not know what it meant, and the clerk had
already said it twice. I had the right document in my folder. I handed over my
passport.

**Ablak** is for that twenty seconds. It listens to the Hungarian spoken at an
immigration, bank, clinic or supermarket counter and answers in your own language — Russian,
or English — with the only three things that matter while someone is waiting
for you: what they are asking, what
to do right now, and **which document to take out of the folder**. Then it speaks
a reply back in Hungarian, so you can repeat it. Understanding is only half of
standing at a counter.

## Who it is for

International students and newcomers who have functional Hungarian for a shop
and none for a government office. I am one of them — I moved from Bishkek to
Budapest on a Stipendium Hungaricum scholarship — and I run **Jany Jashoo**, a
relocation platform used by 100+ Central Asian students arriving in Hungary. The
questions people bring there are, over and over, the questions asked at these
three windows.

## Why voice, and not a keyboard

Both hands hold documents. Your eyes are on the clerk and the number display.
And you cannot type a word you could not make out: Hungarian agglutinates, so
*lakcímkártya* reaches you as *lakcímkártyáját*, and a newcomer cannot retype
that into a translation box. A microphone does not ask them to. The clerk is
waiting; fifteen seconds of typing is not available.

## What it does differently

**It refuses to answer when it is not sure.** That is the design, not a
limitation. A confidently wrong answer at an immigration counter costs the
appointment — or a signature you cannot take back. A language model is fluent
about inputs it misheard and cannot tell you which ones it got right.

So the core is not a model call. It is a curated corpus of 212 phrases officials
actually say, in 765 surface forms, matched by two signals with different failure
modes: character 4-gram similarity, which survives Hungarian suffixes and
speech-recognition noise, and IDF-weighted keyword stems, so that the boilerplate
opening half the corpus does not dominate. The matcher returns a calibrated
score, and below threshold it says so and offers to ask the clerk to repeat more
slowly. Five of the 54 unit tests assert that it refuses. A margin guard
downgrades near-ties, because two indistinguishable scores are ambiguity the user
must see, not a coin flip to settle silently.

Every answer is therefore auditable by a human before a user ever sees it. An
optional model fallback exists for phrases outside the corpus — off by default,
labelled *unverified*, and never permitted to name a document.

It runs with **no API key, no account and no backend**: `python3 -m http.server`
and Chrome. Typed text and the matcher stay on the device; spoken input goes
through the browser's own speech service.

## With more time

Replace my 212 phrases with real ones — mined from Jany Jashoo and logged, with
consent, in an actual waiting room. The matcher is finished; the corpus is the
product, and mine is written from memory rather than from data. Then Ukrainian,
Serbian and Vietnamese — the app already carries two explanation languages, and
the Hungarian side never changes, so each new one is translation rather than
engineering; on-device
recognition via `whisper.cpp` in WASM, to make the privacy claim absolute; and
learning from every refusal, since each unmatched phrase is a gap the corpus
should close.

---

Repository, setup and design notes: `README.md` · AI tool use: `ai.md`
