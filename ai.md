# ai.md — which AI tools I used, and how

The brief says vibe-coding is expected and that you grade the result and my
understanding of it. So this is a straight account of who did what, written so
that nothing here surprises either of us in the review.

---

## Tools

| Tool | What it was used for |
|---|---|
| **An AI coding assistant, in agentic coding sessions** | Nearly all of the implementation: the matcher, the speech wrappers, the UI, the test suites, the practice dialogues, the courier card, the call simulator, the site design, and the first drafts of these documents. |
| **Web search (run by the assistant)** | Checking which speech and LLM APIs currently have a free tier with no credit card, so the submission would run on your machine without a key of mine. |
| **Google Chrome + Playwright** | Driving the real page in a real browser for the end-to-end suite. Not an AI tool, but it is what caught the bugs the model did not. |

No other code generation tool was used. There is no framework, no dependency and
no build step in the repository, so nothing here is scaffolded from a template.

---

## How the work was actually split

**I chose the problem, the track and the central design constraint.** The
scenario is one I know firsthand: I moved from Kyrgyzstan to Budapest on a
Stipendium Hungaricum scholarship, and I run **Jany Jashoo**, a relocation guide
and support platform used by 100+ Central Asian students coming to Hungary. The
recurring questions there are about exactly these three counters. The decision
that the app must **refuse to answer when unsure** rather than guess is mine, and
it came from watching people hand over the wrong document because they
half-understood a question.

**The AI coding assistant wrote the code.** That covers the first version and
everything added afterwards: more phrases, the booking practice, the courier
card, the call simulator and the redesign of the site. I directed it at the level
of architecture and behaviour — key-free so you can run it, two scoring signals
rather than one, three visible confidence states, model output labelled
differently from corpus output, an agent that always says it is an AI and never
decides for the user — and reviewed what came back.

**The Hungarian corpus is the part I own most directly, with one caveat.** The
first 102 phrases are ones I have actually heard or been warned about. The
assistant drafted the structure and the Russian explanations; the judgement about
which phrases belong, which are high-risk, and which document each one is really
asking for comes from having stood at these windows. The other 110 (more bank,
clinic, immigration and supermarket situations) were written later by the
assistant from general knowledge, at my request. They are not from my own
experience, and a native Hungarian speaker has not yet reviewed them. Until that
review is done, treat the Hungarian wording as unreviewed.

**I did not write the n-gram and IDF scoring by hand.** I can explain why it is
there and what each half does — character n-grams for Hungarian's agglutination
and for ASR errors that are a few characters wrong, IDF-weighted keywords so
that shared boilerplate like "Kérem a…" does not dominate — and I can explain
the margin guard and why the thresholds sit where they do. But I would be
overclaiming if I said I derived the blend weights myself; they were tuned
against the test suite.

---

## Where AI got it wrong, and how that was caught

This is the part I think is worth your attention, because it is the difference
between generated code and code someone stands behind.

**1. A stem collision that would have handed over the wrong document.**
The matcher stemmed keywords to six characters. In Hungarian, `lakcím` (address)
and `lakcímkártya` (address card) share their first six. So *"Mi a lakcíme?"* —
*what is your address?* — matched the card that instructs the user to hand over a
physical document. The unit test asserting that every canonical phrase resolves
to its own card caught it. Fixed by moving to an eight-character stem and
removing the colliding keyword; both changes carry comments explaining why, and
there is now a test asserting the two stems stay distinct.

**2. A corpus phrase that was word-for-word another card.**
The bank card's canonical phrase was *"Kérem az útlevelét és a
lakcímkártyáját"* — which is literally the two immigration cards concatenated,
so it matched those instead. Fixed by making the distinctive phrasing canonical.
The lesson generalises: in a curated corpus, the phrases have to be chosen for
separability, not just for realism.

**3. A CSS bug that made the app unusable, invisible to the unit tests.**
The settings drawer is `display: flex`, which silently overrides the HTML
`hidden` attribute's weak user-agent rule. The drawer therefore covered the
entire viewport from page load and swallowed every click. No unit test could see
this; the Playwright suite hit it immediately, because it tries to click things.
Fixed with an explicit `[hidden] { display: none !important }`.

**4. A render path that stripped its own styling.**
`renderResult` assigned `className` wholesale and dropped the `panel` class, so
the result card lost its background and padding after the first match. I caught
this by looking at a screenshot, not from a test — which is why there is now a
regression test asserting the class survives.

**5. An inconsistent field name that would have leaked English into the
Russian build.**
Adding the second interface language, the document field came out as `doc_en`
while every other English field was `en_meaning`, `en_action`. The lookup
missed it, so the "take out this document" callout vanished — and worse, the
Russian lookup fell through to the English fallback, which would have shown an
English document name to a Russian-speaking user. The browser suite caught the
missing callout; the fallback bug I found while fixing it.

**6. Hungarian terms written without their accents.**
I generated the English explanations through a script and stripped the
diacritics: *lakcimkartya* instead of *lakcímkártya*. It reads as sloppy, but
it is also substantively wrong — the whole point of naming the document is that
the user matches that word against what is printed on the card in their hand.
No test caught this. I caught it looking at a screenshot.

**7. A gate code that would have been spoken before the user decided.**
In the call simulator, the address sentence builder added the gate code whenever
one was filled in, so the agent would have said it aloud before asking the user.
A unit test asserting that the code is only spoken when the user chooses to share
it failed, and the fix was to build the address without it.

**8. A syntax error in the English interface strings.**
An unescaped apostrophe in a new string stopped the whole script from loading, so
the app did not start. The unit tests did not load that file; the browser console
did show it, and a check in the real page confirmed the fix.

Most of these were caught by tests the assistant wrote or by a real browser
driving the page, and two by a human looking at the output. I think that split is
the honest argument for how to use these tools: they write more code than I could
in three days, and the verification has to be real.

---

## What I would want you to ask me

Fair game, and I would rather say so than have you discover it:

- Why the blend is 40/60 and not 50/50 — I can give you the reasoning
  (precision over recall at a counter) but the number came from tuning.
- Why `THRESHOLD_CONFIDENT` is 0.52. Same answer: fitted to the suite, and the
  suite is 212 phrases (102 mine, 110 written by the assistant), so it is not an
  unbiased estimate of real-world accuracy. With real logged phrases I would expect to move it.
- Whether the corpus approach scales. I think it scales *per counter* and not
  across the whole of bureaucracy, and that the honest product is a narrow one
  that is right, plus a clearly-labelled fallback that is sometimes right.
