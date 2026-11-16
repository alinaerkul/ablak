/*
 * Ablak — optional open-vocabulary fallback
 * ---------------------------------------------------------------------------
 * The curated corpus covers the moves that actually happen at these three
 * counters, and it is the only path that ever produces a VERIFIED answer.
 * But counters produce surprises, so when the matcher returns 'unknown'
 * the user can opt into a model call for a best-effort gloss.
 *
 * Three deliberate constraints:
 *
 * 1. OPTIONAL AND OFF BY DEFAULT. The prototype must run for a reviewer
 *    with no key, no account and no network. Nothing here is on the
 *    critical path; if this file never executes, the product still works.
 *
 * 2. THE OUTPUT IS LABELLED DIFFERENTLY. Corpus answers are marked
 *    verified; model answers are marked unverified in the UI and never
 *    produce a "hand over this document" instruction, because a
 *    hallucinated document instruction is the single most expensive error
 *    this product could make.
 *
 * 3. THE KEY NEVER TOUCHES THE REPOSITORY. It is typed into the UI and
 *    kept in localStorage on the user's own device. There is no server,
 *    so there is nowhere else for it to go.
 *
 * Providers below both have a standing free tier that needs no credit card,
 * which keeps the "no cost to run this" property intact.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'ablak.llm.config';

  var PROVIDERS = {
    groq: {
      label: 'Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      style: 'openai'
    },
    gemini: {
      label: 'Google AI Studio (Gemini)',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'gemini-2.5-flash',
      style: 'openai'
    }
  };

  /*
   * The prompt is narrow on purpose. We are not asking for a translation;
   * we are asking for the same three fields the corpus provides, so the UI
   * can render either source through one code path.
   */
  var SYSTEM_PROMPT = [
    'You help a Russian-speaking international student understand what a',
    'Hungarian official just said to them at a government office, bank or',
    'clinic counter.',
    '',
    'Reply with ONLY a JSON object, no markdown fence, with these keys:',
    '  "meaning_ru"  - what the official is asking, in plain Russian, one sentence.',
    '  "action_ru"   - what the student should do right now, in Russian, one sentence.',
    '  "reply_hu"    - a short, polite Hungarian sentence the student can say back.',
    '  "reply_ru"    - a Russian gloss of reply_hu.',
    '  "confident"   - true only if you are sure what the Hungarian means.',
    '',
    'Rules you must follow:',
    '- Never invent a document name, a fee amount, a deadline or a legal',
    '  requirement. If the phrase implies a document you cannot identify',
    '  with certainty, set "confident" to false and make action_ru tell the',
    '  student to ask the official to write it down.',
    '- If the input looks like speech recognition noise rather than a',
    '  sentence, set "confident" to false.',
    '- Keep reply_hu simple enough for a beginner to pronounce.'
  ].join('\n');

  function loadConfig() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveConfig(provider, apiKey) {
    try {
      if (!apiKey) {
        window.localStorage.removeItem(STORAGE_KEY);
        return true;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        provider: provider,
        apiKey: apiKey
      }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function isEnabled() {
    var c = loadConfig();
    return !!(c && c.apiKey && PROVIDERS[c.provider]);
  }

  /* Models wrap JSON in prose or fences often enough to need this. */
  function extractJson(text) {
    if (!text) return null;
    var cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
    var start = cleaned.indexOf('{');
    var end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (e) {
      return null;
    }
  }

  /*
   * interpret(transcript) -> Promise<result|null>
   * Resolves null on any failure. A failed fallback must degrade to
   * "I did not understand, ask them to repeat" — never to an error dialog
   * while the user is mid-conversation at a counter.
   */
  function interpret(transcript) {
    var config = loadConfig();
    if (!config || !config.apiKey) return Promise.resolve(null);

    var provider = PROVIDERS[config.provider];
    if (!provider) return Promise.resolve(null);

    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);

    return fetch(provider.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.1,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'The official said, in Hungarian: "' + transcript + '"' }
        ]
      })
    })
      .then(function (response) {
        clearTimeout(timeout);
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (data) {
        if (!data) return null;
        var content = data.choices && data.choices[0] &&
                      data.choices[0].message && data.choices[0].message.content;
        var parsed = extractJson(content);
        if (!parsed || !parsed.meaning_ru) return null;

        /* Normalise into the same shape the corpus produces, so app.js
         * renders both through one path. Note doc is always null here. */
        return {
          source: 'model',
          provider: provider.label,
          ru_meaning: parsed.meaning_ru,
          ru_action: parsed.action_ru || '',
          reply_hu: parsed.reply_hu || '',
          reply_ru: parsed.reply_ru || '',
          doc: null,
          modelConfident: parsed.confident === true
        };
      })
      .catch(function () {
        clearTimeout(timeout);
        return null;
      });
  }

  window.AblakLLM = {
    PROVIDERS: PROVIDERS,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    isEnabled: isEnabled,
    interpret: interpret,
    extractJson: extractJson
  };
})();
