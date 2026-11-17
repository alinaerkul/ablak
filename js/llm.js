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
      /* llama-3.3-70b-versatile was retired on Groq's free tier on 2026-08-16;
       * openai/gpt-oss-120b is the replacement Groq recommends. It is a
       * reasoning model, so keep the reasoning short or it eats the token
       * budget before any answer is written. Check console.groq.com/docs/deprecations
       * if requests start failing with 400/404. */
      model: 'openai/gpt-oss-120b',
      modelsUrl: 'https://api.groq.com/openai/v1/models',
      extra: { reasoning_effort: 'low' },
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
  /* Built per call, in the interface language. The first version was
   * written for Russian only, so an English user got a Russian explanation
   * from the model while every corpus card answered in English. */
  function systemPrompt(lang) {
    var L = lang === 'ru' ? 'Russian' : 'English';
    return [
      'You help an international student understand what a Hungarian',
      'official just said to them at a government office, bank or clinic',
      'counter. The student reads ' + L + '.',
      '',
      'Reply with ONLY a JSON object, no markdown fence, with these keys:',
      '  "meaning"     - what the official is asking, in plain ' + L + ', one sentence.',
      '  "action"      - what the student should do right now, in ' + L + ', one sentence.',
      '  "reply_hu"    - a short, polite Hungarian sentence the student can say back.',
      '  "reply_gloss" - a gloss of reply_hu in ' + L + '.',
      '  "confident"   - true only if you are sure what the Hungarian means.',
      '',
      'Rules you must follow:',
      '- Write "meaning", "action" and "reply_gloss" in ' + L + ' only.',
      '- Never invent a document name, a fee amount, a deadline or a legal',
      '  requirement. If the phrase implies a document you cannot identify',
      '  with certainty, set "confident" to false and make "action" tell the',
      '  student to ask the official to write it down.',
      '- If the input looks like speech recognition noise rather than a',
      '  sentence, set "confident" to false.',
      '- Keep reply_hu simple enough for a beginner to pronounce.'
    ].join('\n');
  }

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
   * Talking to the provider.
   *
   * Hosted model names are retired every few months (llama-3.3-70b-versatile
   * disappeared from Groq's free tier on 2026-08-16). So the model named in
   * PROVIDERS is only the first guess: if the provider answers 404 or 400 for
   * it, we ask the provider which models THIS key can use, pick the best chat
   * model from that list, remember it for the session, and retry once. The
   * provider's own error text is passed back so the UI can show what happened.
   */
  var modelCache = {};

  var NON_CHAT = /whisper|tts|orpheus|guard|safeguard|embed|compound|moderation/i;
  var PREFERRED = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b',
                   'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

  function listModels(provider, key) {
    if (!provider.modelsUrl) return Promise.resolve(null);
    return fetch(provider.modelsUrl, { headers: { 'Authorization': 'Bearer ' + key } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.data ? j.data.map(function (m) { return m.id; }) : null; })
      .catch(function () { return null; });
  }

  /* Pure, so it can be tested: best usable chat model from a list of ids. */
  function pickModel(ids) {
    if (!ids || !ids.length) return null;
    for (var i = 0; i < PREFERRED.length; i++) {
      if (ids.indexOf(PREFERRED[i]) !== -1) return PREFERRED[i];
    }
    var chatOnly = ids.filter(function (id) { return !NON_CHAT.test(id); });
    return chatOnly[0] || null;
  }

  /* -> Promise<{ok:true, data} | {ok:false, status, detail}> */
  function chat(config, provider, messages) {
    function attempt(model, canRetry) {
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 15000);
      var body = { model: model, temperature: 0.1, max_tokens: 1500, messages: messages };
      /* Short reasoning only makes sense for the reasoning models. */
      if (provider.extra && /gpt-oss/.test(model)) {
        Object.keys(provider.extra).forEach(function (k) { body[k] = provider.extra[k]; });
      }
      return fetch(provider.url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
        body: JSON.stringify(body)
      })
        .then(function (res) {
          clearTimeout(timeout);
          if (res.ok) return res.json().then(function (data) { return { ok: true, data: data }; });
          return res.json().catch(function () { return null; }).then(function (j) {
            var detail = (j && j.error && j.error.message) || '';
            if ((res.status === 404 || res.status === 400) && canRetry && provider.modelsUrl) {
              return listModels(provider, config.apiKey).then(function (ids) {
                var better = pickModel(ids);
                if (better && better !== model) {
                  modelCache[provider.label] = better;
                  return attempt(better, false);
                }
                return { ok: false, status: res.status, detail: detail };
              });
            }
            return { ok: false, status: res.status, detail: detail };
          });
        })
        .catch(function () {
          clearTimeout(timeout);
          return { ok: false, status: 0, detail: 'network' };
        });
    }
    return attempt(modelCache[provider.label] || provider.model, true);
  }

  function contentOf(data) {
    return data && data.choices && data.choices[0] &&
           data.choices[0].message && data.choices[0].message.content;
  }

  /*
   * interpret(transcript) -> Promise<result|null>
   * Resolves null on any failure. A failed fallback must degrade to
   * "I did not understand, ask them to repeat" — never to an error dialog
   * while the user is mid-conversation at a counter.
   */
  function interpret(transcript, lang) {
    lang = lang === 'ru' ? 'ru' : 'en';
    var config = loadConfig();
    if (!config || !config.apiKey) return Promise.resolve(null);
    var provider = PROVIDERS[config.provider];
    if (!provider) return Promise.resolve(null);

    return chat(config, provider, [
      { role: 'system', content: systemPrompt(lang) },
      { role: 'user', content: 'The official said, in Hungarian: "' + transcript + '"' }
    ]).then(function (res) {
      if (!res.ok) return null;
      var parsed = extractJson(contentOf(res.data));
      /* Older key names are still accepted, in case a model echoes them. */
      if (!parsed) return null;
      var meaning = parsed.meaning || parsed['meaning_' + lang];
      if (!meaning) return null;

      /* Normalise into the same shape the corpus produces, so app.js
       * renders both through one path. Note doc is always null here. */
      return {
        source: 'model',
        provider: provider.label,
        lang: lang,
        meaning: meaning,
        action: parsed.action || parsed['action_' + lang] || '',
        reply_hu: parsed.reply_hu || '',
        reply_gloss: parsed.reply_gloss || parsed['reply_' + lang] || '',
        doc: null,
        modelConfident: parsed.confident === true
      };
    });
  }

  /*
   * translate(text, lang) -> Promise<{hu, back, provider} | {error, detail} | null>
   *
   * The OTHER direction: the user speaks English or Russian and wants to say it
   * in Hungarian. Prepared phrases are tried first and are the only verified
   * path; this is the opt-in fallback for everything else, and the UI labels its
   * output as a machine translation. It also returns a back-translation into
   * the user's own language so they can check what is about to be said.
   */
  var TRANSLATE_PROMPT = [
    'You translate what a newcomer says into Hungarian, to be spoken aloud to a',
    'clerk at a government office, bank, clinic or shop in Hungary.',
    '',
    'Reply with ONLY a JSON object, no markdown fence, with these keys:',
    '  "hu"   - the Hungarian sentence(s), polite and formal (use "kérem" and the',
    '           formal "Ön" address), simple enough for a beginner to say aloud.',
    '  "back" - a literal back-translation of YOUR Hungarian into the language the',
    '           user spoke, so they can check it.',
    '',
    'Rules you must follow:',
    '- Translate faithfully. Do not add, remove or soften anything the user said.',
    '- Never invent a document name, an amount, a date or a requirement.',
    '- Keep every number, name and date exactly as given.',
    '- Keep Hungarian diacritics (á é í ó ö ő ú ü ű).',
    '- If the input is not a sentence you can translate, return "hu": "".'
  ].join('\n');

  function translate(text, lang) {
    var config = loadConfig();
    if (!config || !config.apiKey) return Promise.resolve(null);
    var provider = PROVIDERS[config.provider];
    if (!provider) return Promise.resolve(null);

    return chat(config, provider, [
      { role: 'system', content: TRANSLATE_PROMPT },
      { role: 'user', content: 'The user spoke ' + (lang === 'ru' ? 'Russian' : 'English') + ': "' + text + '"' }
    ]).then(function (res) {
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return { error: 'bad-key' };
        if (res.status === 429) return { error: 'rate-limit' };
        if (res.status === 0) return { error: 'network' };
        return { error: 'http-' + res.status, detail: res.detail };
      }
      var parsed = extractJson(contentOf(res.data));
      if (!parsed || !parsed.hu || !String(parsed.hu).trim()) return { error: 'no-translation' };
      return { hu: String(parsed.hu).trim(), back: String(parsed.back || '').trim(), provider: provider.label };
    });
  }

  window.AblakLLM = {
    PROVIDERS: PROVIDERS,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    isEnabled: isEnabled,
    interpret: interpret,
    translate: translate,
    pickModel: pickModel,
    systemPrompt: systemPrompt,
    extractJson: extractJson
  };
})();
