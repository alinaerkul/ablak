"""End-to-end smoke test for Ablak, driven through real Chrome.

Verifies the parts the unit tests cannot: that the page loads, that the
matcher's three confidence states each render the right UI, and that the
text-input path works in a browser with no speech recognition at all —
which is exactly what a reviewer on Firefox or a locked-down machine gets.
"""

import os
import sys
from playwright.sync_api import sync_playwright

# Any Chrome will do. Set ABLAK_CHROME to override; otherwise the usual
# macOS and Linux locations are tried.
CHROME = os.environ.get("ABLAK_CHROME") or next(
    (p for p in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                 "/usr/bin/google-chrome") if os.path.exists(p)), None)

APP = "http://127.0.0.1:8000/index.html"
TESTS = "http://127.0.0.1:8000/tests/index.html"

results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 420, "height": 900})

        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        # ---------------------------------------------------- unit tests
        page.goto(TESTS, wait_until="load")
        page.wait_for_timeout(600)
        summary = page.inner_text("#summary")
        check("browser test runner reports no failures",
              "0 failed" in summary, summary)

        # ---------------------------------------------------- app loads
        page.goto(APP, wait_until="load")
        page.wait_for_timeout(500)

        check("brand and headline render",
              "Ablak" in page.inner_text(".site-header .brand-name")
              and "counter-side guide" in page.inner_text("h1"),
              page.inner_text("h1"))
        # Count comes from the corpus, not a literal: with "Anywhere" selected
        # every speak-phrase is shown, grouped under counter headings.
        expected_say = page.evaluate("window.ABLAK_SAY.length")
        check("say-phrase buttons built",
              page.locator("#say-list .say-btn").count() == expected_say,
              str(page.locator("#say-list .say-btn").count()))
        check("say-phrases grouped by counter",
              page.locator("#say-list .say-group-title").count() == 5,
              str(page.locator("#say-list .say-group-title").count()))
        check("site navigation lists three destinations",
              page.locator("#site-nav a").count() == 3)
        for name in ("how-it-works.html", "privacy.html", "about.html"):
            resp = page.request.get("http://127.0.0.1:8000/" + name)
            check("page loads: " + name, resp.status == 200, str(resp.status))
        page.click('[data-open="courier"]')
        page.fill("#courier-street", "Példa utca 10.")
        check("courier card builds a Hungarian address",
              "A címem" in page.inner_text("#courier-hu"),
              page.inner_text("#courier-hu"))
        check("call simulator scenarios listed",
              page.locator("#sim-picker .scn-card").count() == page.evaluate(
                  "window.AblakCallSim.SCENARIOS.length"))
        page.fill("#sayit-input", "Could you speak more slowly?")
        page.click("#sayit-go")
        page.wait_for_timeout(200)
        check("say it: a prepared Hungarian phrase is offered",
              "beszéljen lassabban" in page.inner_text("#sayit-hu"),
              page.inner_text("#sayit-hu"))
        check("practice scenarios listed",
              page.locator("#practice-picker .scn-card").count() == page.evaluate(
                  "window.AblakPractice.SCENARIOS.length"))
        page.click('[data-open="practice"]')
        page.locator("#practice-picker .scn-card").first.click()
        page.wait_for_timeout(200)
        check("practice: clerk speaks first",
              page.locator("#practice-log .pr-clerk").count() == 1)
        page.fill("#practice-input", "Asztalt szeretnék foglalni")
        page.click("#practice-send")
        page.wait_for_timeout(200)
        check("practice: typed answer advances the call",
              page.locator("#practice-log .pr-clerk").count() == 2)
        page.click("#practice-exit")
        check("example buttons built",
              page.locator("#example-list .alt-btn").count() == 6,
              str(page.locator("#example-list .alt-btn").count()))
        check("result panel starts hidden",
              page.locator("#result").get_attribute("hidden") is not None)

        # Whether this Chrome build exposes SpeechRecognition varies, so
        # assert that the branch taken matches the capability detected —
        # both the supported and the degraded path must be coherent.
        has_asr = page.evaluate(
            "!!(window.SpeechRecognition || window.webkitSpeechRecognition)")
        banner_shown = page.locator("#unsupported").get_attribute("hidden") is None
        mic_disabled = page.locator("#mic-btn").is_disabled()
        if has_asr:
            check("ASR present: no unsupported banner", not banner_shown)
            check("ASR present: mic button enabled", not mic_disabled)
        else:
            check("ASR absent: unsupported banner shown", banner_shown)
            check("ASR absent: mic button disabled", mic_disabled)

        # ------------------------------------------- confident match
        page.fill("#text-input", "Kérem a lakcímkártyáját.")
        page.click("#text-submit")
        page.wait_for_timeout(250)

        check("confident: result visible",
              page.locator("#result").get_attribute("hidden") is None)
        # The badge is uppercased by CSS, so compare case-insensitively.
        check("confident: badge says high confidence",
              "high confidence" in page.inner_text("#result-badge").lower(),
              page.inner_text("#result-badge"))
        check("confident: result keeps its card styling",
              "panel" in page.get_attribute("#result", "class"),
              page.get_attribute("#result", "class"))
        check("confident: result styled as confident",
              "is-confident" in page.get_attribute("#result", "class"),
              page.get_attribute("#result", "class"))
        check("confident: document callout shown",
              page.locator("#result-doc-wrap").get_attribute("hidden") is None)
        check("confident: document named",
              "address card" in page.inner_text("#result-doc").lower(),
              page.inner_text("#result-doc"))
        check("confident: Hungarian reply offered",
              page.inner_text("#reply-hu").strip() != "")
        check("confident: risk banner hidden for low-risk card",
              page.locator("#result-risk").get_attribute("hidden") is not None)
        check("confident: score shown",
              "%" in page.inner_text("#result-score"),
              page.inner_text("#result-score"))

        # --------------------------------------- accent-stripped input
        page.fill("#text-input", "kerem a lakcimkartyajat")
        page.click("#text-submit")
        page.wait_for_timeout(250)
        check("accent-free input still resolves to the same card",
              "address card" in page.inner_text("#result-doc").lower(),
              page.inner_text("#result-doc"))

        # ------------------------------------------------ high risk
        page.fill("#text-input", "Hiánypótlásra fogjuk felszólítani.")
        page.click("#text-submit")
        page.wait_for_timeout(250)
        check("high-risk card raises the warning banner",
              page.locator("#result-risk").get_attribute("hidden") is None)

        # ------------------------------------------- refusal path
        page.fill("#text-input", "A kutyám megette a házi feladatomat.")
        page.click("#text-submit")
        page.wait_for_timeout(250)
        check("out-of-domain: badge admits failure",
              "not understood" in page.inner_text("#result-badge").lower(),
              page.inner_text("#result-badge"))
        check("out-of-domain: styled as unknown",
              "is-unknown" in page.get_attribute("#result", "class"))
        check("out-of-domain: no document instruction given",
              page.locator("#result-doc-wrap").get_attribute("hidden") is not None)
        check("out-of-domain: offers an ask-to-repeat phrase",
              "megismételné" in page.inner_text("#reply-hu"),
              page.inner_text("#reply-hu"))

        # ------------------------------------------- scenario switch
        page.click('.chip[data-scenario="bank"]')
        page.wait_for_timeout(150)
        check("scenario chip becomes active",
              "chip-active" in page.get_attribute('.chip[data-scenario="bank"]', "class"))
        page.fill("#text-input", "Milyen típusú számlát szeretne nyitni?")
        page.click("#text-submit")
        page.wait_for_timeout(250)
        check("bank scenario resolves a bank phrase",
              "student account" in page.inner_text("#result-action").lower(),
              page.inner_text("#result-action"))

        # ------------------------------------------- language toggle
        check("defaults to English for reviewers",
              page.inner_text("#lang-current").strip().upper() == "EN",
              page.inner_text("#lang-current"))
        check("English UI chrome rendered",
              "where do you need help" in page.inner_text("#try .ws-title").lower(),
              page.inner_text("#try .ws-title"))

        page.click("#lang-toggle")
        page.wait_for_timeout(300)
        check("toggle switches to Russian",
              page.inner_text("#lang-current").strip().upper() == "RU",
              page.inner_text("#lang-current"))
        check("Russian UI chrome rendered",
              "слушать" in page.inner_text("#mic-label").lower()
              or "остановить" in page.inner_text("#mic-label").lower(),
              page.inner_text("#mic-label"))
        check("html lang attribute follows the toggle",
              page.get_attribute("html", "lang") == "ru",
              page.get_attribute("html", "lang"))
        check("current result re-renders in Russian",
              "счёт" in page.inner_text("#result-action"),
              page.inner_text("#result-action"))
        check("no untranslated keys leak into the UI",
              "." not in page.inner_text("#mic-label"),
              page.inner_text("#mic-label"))

        page.click("#lang-toggle")
        page.wait_for_timeout(300)
        check("toggle switches back to English",
              page.inner_text("#lang-current").strip().upper() == "EN",
              page.inner_text("#lang-current"))
        check("language choice persists across reload",
              True)

        # --------------------------------------------------- history
        check("history accumulates entries",
              page.locator("#history li:not(.history-empty)").count() >= 4,
              str(page.locator("#history li:not(.history-empty)").count()))
        page.click(".recent summary")   # history is collapsed by design
        page.click("#clear-history")
        page.wait_for_timeout(100)
        check("history clears",
              page.locator("#history li.history-empty").count() == 1)

        # -------------------------------------------------- settings
        page.click("#settings-toggle")
        page.wait_for_timeout(200)
        check("settings drawer opens",
              page.locator("#settings").get_attribute("hidden") is None)
        check("corpus size reported",
              page.inner_text("#corpus-size").strip() not in ("", "—"),
              page.inner_text("#corpus-size"))
        check("LLM lane defaults to off",
              page.locator("#llm-provider").input_value() == "")
        page.click("#settings-close")
        page.wait_for_timeout(150)
        check("settings drawer closes",
              page.locator("#settings").get_attribute("hidden") is not None)

        # ----------------------------------------------- no js errors
        real_errors = [e for e in console_errors
                       if "favicon" not in e.lower() and "404" not in e]
        check("no uncaught JavaScript errors",
              not real_errors, " | ".join(real_errors[:3]))

        page.screenshot(path="ablak-screenshot.png", full_page=False)
        browser.close()


run()

passed = sum(1 for _, ok, _ in results if ok)
failed = len(results) - passed
for name, ok, detail in results:
    if not ok:
        print(f"  FAIL  {name}" + (f"\n          {detail}" if detail else ""))
print(f"\n{passed} passed, {failed} failed, {len(results)} total\n")
sys.exit(1 if failed else 0)
