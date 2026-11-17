# ai.md — which AI tools I used, and how

Here is the breakdown of AI usage in this project. The reasoning behind the
product and technical decisions is in [`DECISIONS.md`](DECISIONS.md).

---

## Tools

| Tool | What it was used for |
|---|---|
| **Claude (Anthropic), used through Claude Code in agentic coding sessions; called "the assistant" below.** The first version used Claude Opus 5; the later additions (more phrases, practice mode, courier card, call simulator, site redesign, write-up) used Claude Sonnet 5.5; the final fixes and documentation used Claude Opus 5.5. | Nearly all of the implementation: the matcher, the speech wrappers, the UI, the test suites, the practice dialogues, the courier card, the call simulator, the site's HTML and CSS built to match the design image below, and the first drafts of these documents. |
| **ChatGPT (OpenAI)** | The visual design. I wrote a detailed description of the project, its functions and its goal, and asked for several design options. I chose one, had ChatGPT generate an image of it, and gave that image to the assistant to build the site from. No code came from ChatGPT. |
| **Web search (run by the assistant)** | Checking which speech and LLM APIs currently have a free tier with no credit card, so the submission would run on your machine without a key of mine. |
| **Google Chrome + Playwright** | Running the automated end-to-end suite (51 checks) against the real page in Chrome. A test tool, not an AI tool. Most of the problems that mattered in practice were found by me using the site and telling the assistant how it should work (see below). |

No other code generation tool was used. There is no framework, no dependency and
no build step in the repository, so nothing here is scaffolded from a template.

---

## How I worked with the agent

**One agent, one session at a time.** I did not run several agents or sessions in
parallel. All the work was done by one Claude Code agent, which I directed in a
series of sessions. Inside a session the agent could use tools: run the test
suites, open the page in a browser and take screenshots, search the web, use git,
and run small scripts (for example, to turn the write-up into a PDF). The
orchestration was mine: what to build next, in which order, how to check it, and
what to keep.

This is the loop I used:

**1. Plan first, no code.** For each larger piece of work I asked for a plan before
any code, and for clarifying questions until nothing was ambiguous. For example,
when I turned the first version into a guide with several tools, I asked for a
ten-point plan (purpose, audience, positioning, pages, design, technology, content,
timeline and so on), answered the questions, and only then let the code be written.
For smaller changes I asked for options first and chose one (for example, the
structure of this write-up).

**2. Rules the agent reads at the start of every session.** The project has a
rules file for the agent (`CLAUDE.md`, kept local). It says what the project is,
how to run and test it, how fields are named, and five rules that must never be
broken:
1. It must run with no API key, no account and no backend.
2. It must refuse when unsure; raising recall by lowering the threshold is not an
   improvement.
3. Model output is never presented as verified and never names a document.
4. Hungarian is never translated: the Hungarian phrases are identical in every
   interface language.
5. Every card is complete in both languages.

It also says that both test suites must pass before any commit. This file is how
decisions from earlier sessions survive into later ones: when a long session was
summarised and continued, the rules were still there.

**3. Small tasks, one at a time.** I described each task concretely — what it
should do and how it should behave — rather than asking for "an app". For the
design, I described the project to ChatGPT, chose one of the options it offered,
had it generate an image of that design, and gave the image to the agent, which
built the site to match.

**4. Checks after every change.** The agent ran the unit and browser suites after
each change and reported the result, and checked the running page in a browser.
Then I tested the site myself, on my own computer and the live site, and sent
screenshots of anything wrong. Most of the issues that mattered to a user were
found this way (see items 9–14 below).

**5. Keeping, rejecting and undoing.** Not everything the agent built stayed. For
example, a voice picker was built, I tested it, saw that my Mac had only one
Hungarian voice so the menu offered no real choice, and had all of it reverted to
the previous commit.

**6. Checking that the text is true.** I read every document the agent drafted,
and rewrote anything that was not accurate: an anecdote that was not mine, and
claims about where the phrases came from (see item 12).

**7. I decide what ships.** The agent commits and pushes only when I ask, after
the checks pass.

---

## How the work was actually split

**I defined the problem and the idea, and I specified the tasks.** The scenario is
one I know firsthand: I moved from Kyrgyzstan to Budapest on a Stipendium
Hungaricum scholarship, and when I tried to book a dentist at a state hospital I
could not follow the receptionist, waited an hour and left without an
appointment. I also run **Jany Jashoo**, an information platform for Central
Asian students coming to Hungary. I described what I wanted built, step by step,
and made the product decisions: the scope for the deadline, the name, which of the
design options to use, which tools to include, and what to leave for later.

Before anything was built, I chose the idea against three conditions: it had to be
realistic to finish well before the deadline, Hiya had to be able to test it
without any problems (no key, no account, no install), and it had to solve a real
problem. Ideas that failed one of these were dropped or left for later, such as
real phone calls. The details are in [`DECISIONS.md`](DECISIONS.md).

**Claude implemented it.** That covers all of the code: the matcher, the speech
wrappers, the interface (built to match the design image I chose), the test suites, the
booking practice, the courier card, the call simulator, and the first drafts of
the documents. I directed it at the level
of what the product should do — it must run without a key, show three visibly
different confidence states, label model output differently from verified output,
and have an agent that always says it is an AI and never decides for the user —
and I reviewed what came back and tested it as a real user.

**The Hungarian corpus was generated by the assistant.** All 239 phrase cards and
their English and Russian explanations, and the 119 phrases the user says, were
generated by the AI assistant (some based on reception dialogues I supplied, and
the bank branch practice on a visit I described). I
went through them and checked the content: what is being asked, what to do and
which document is meant. A native Hungarian speaker has not yet reviewed the
Hungarian wording, so until that review is done, treat it as unreviewed.

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

To be exact about who did what: the assistant wrote the code and its automated
tests. The eight code-level bugs below (1 to 8) were found by those tests, by the
browser console or by reviewing screenshots of the running app, and the assistant
fixed them; I did not find them myself. The user-visible problems listed after
them (9 to 14) were found by my own testing as a user. My part was to direct the
work, to test the site and tell the assistant how I wanted it to behave, and to
review what came back.

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
the result card lost its background and padding after the first match. It was
found by reviewing a screenshot of the running app, not by a test — which is why
there is now a regression test asserting the class survives.

**5. An inconsistent field name that would have leaked English into the
Russian build.**
Adding the second interface language, the document field came out as `doc_en`
while every other English field was `en_meaning`, `en_action`. The lookup
missed it, so the "take out this document" callout vanished — and worse, the
Russian lookup fell through to the English fallback, which would have shown an
English document name to a Russian-speaking user. The browser suite caught the
missing callout; the fallback bug was found while fixing it.

**6. Hungarian terms written without their accents.**
The English explanations were generated through a script that stripped the
diacritics: *lakcimkartya* instead of *lakcímkártya*. It reads as sloppy, but
it is also substantively wrong — the whole point of naming the document is that
the user matches that word against what is printed on the document in their hand.
No test caught this. It was found by reviewing a screenshot of the running app.

**7. A gate code that would have been spoken before the user decided.**
In the call simulator, the address sentence builder added the gate code whenever
one was filled in, so the agent would have said it aloud before asking the user.
A unit test asserting that the code is only spoken when the user chooses to share
it failed, and the fix was to build the address without it.

**8. A syntax error in the English interface strings.**
An unescaped apostrophe in a new string stopped the whole script from loading, so
the app did not start. The unit tests did not load that file; the browser console
did show it, and a check in the real page confirmed the fix.

**Problems found by my own testing as a user**

**9. Hungarian speech was not recognised well in Chrome.** When I tried the
microphone at my university, Chrome's recognition did not correctly pick up a
simple Hungarian question. This led to an optional Whisper microphone engine
(opt-in, with my own key), so the two can be compared.

**10. "I want to see a dentist" was answered with the doctor phrase.** The reply
box matched on the words they had in common and silently dropped the one that
mattered. I reported it, and the assistant changed the matching so that a phrase
must cover most of what was said, and added dentist phrases.

**11. Translation failed with an `http-404` error.** The cause was a model that
the provider had retired. I reported the error from the screen; the assistant made
the app choose an available model automatically and show the provider's own
message.

**12. The documentation overstated things.** An anecdote in the first drafts was
not my real story, and some claims about where the phrases came from and what the
platform I run provides were not accurate. I noticed this when I read the texts,
and they were corrected (see "How the work was actually split").

**13. The address card was described wrongly.** The app told users the
lakcímkártya is "the small white plastic card". From my own experience it is an A4
sheet with a QR code, which you can also show on your phone. Since the point of
naming a document is that the user recognises it, this was corrected in the app
and in every document.

**14. "The two plans" was translated as "the two plants".** In the reply box I
asked to explain the difference between two phone plans. No prepared phrase
matched, so the optional machine translation was used, and it chose *növény*
(plant). The back-translation showed the mistake before I said it, which is why
it is there. The fix: the prepared phrase now covers this wording and names the
*csomag* (package), and the translator is told where the user is and that "plan"
means a package at a counter. Two tests keep it that way.

The first eight were found by tests and by reviewing the running app; the last
six by me using the site. I think that is the honest argument for how to use
these tools: they write more code than I could in three days, so the verification
has to be real, and a person's job is to direct the work, to test it as a user
and to check that what was written is true.

---

## Known limits

The weak spots, stated plainly so nobody has to find them:

- **The 40/60 mix was found by trying, not calculated.** The matcher combines two
  signals: 40% from small 4-letter pieces of words (which survive Hungarian
  endings) and 60% from rare keywords (a word found in only one phrase is strong
  evidence). We tried different mixes and kept the one under which the test
  phrases matched correctly. Nobody proved that 40/60 is the best mix. Keywords
  weigh more on purpose: at a counter it is more important to be right when the
  app answers than to answer as often as possible.
- **The confidence threshold (0.52) was chosen with the same phrases it is tested
  on.** Above 0.52 the app says "High confidence". That number was set using the
  same 239 phrases the tests use, which is like practising on the exact questions
  of an exam: a perfect score does not show how the app does with a real clerk,
  who uses other words, speaks fast, in a noisy room. The phrases were written by
  the AI assistant (a few based on visits I described) and I checked their
  content, but they are not recordings of real clerks. Real accuracy is not
  measured yet. The fix is to collect real phrases from students and from
  hospital and office staff, test on those, and adjust the threshold.
- **It works place by place, not for all of bureaucracy.** It works because each
  place has a limited set of phrases that repeat all day, so a prepared list can
  cover them and every phrase can be checked. One list for every office in
  Hungary would be too big to check and full of phrases that look alike. So the
  honest product is a narrow core that is right, extended one place at a time,
  plus a clearly labelled optional model that is sometimes right, for anything
  outside the list.
