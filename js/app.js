/*
 * Ablak — application controller
 * ---------------------------------------------------------------------------
 * Wires the pieces together and owns every user-visible decision:
 *
 *   microphone  ->  Listener (hu-HU)  ->  matcher  ->  render
 *                                           |
 *                                      (if unknown and the user opted in)
 *                                           v
 *                                      optional model call
 *
 * The one rule that shapes this file: the interface must distinguish
 * "I know" from "I think" from "I did not understand", and must never
 * present the second or third as the first.
 *
 * Hungarian is fixed as the language being listened to and spoken. The
 * language the app EXPLAINS in is a parameter — see js/i18n.js — so every
 * user-facing string here goes through T() or I18n.card().
 */

(function () {
  'use strict';

  var M = window.AblakMatcher;
  var Speech = window.AblakSpeech;
  var LLM = window.AblakLLM;
  var I18n = window.AblakI18n;
  var T = I18n.t;

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */

  var state = {
    scenario: 'all',
    index: null,
    listening: false,
    speaking: false,
    autospeak: false,
    rate: 0.92,
    history: [],
    lastTranscript: null
  };

  var listener = null;
  var speaker = new Speech.Speaker();

  /* ------------------------------------------------------------------ */
  /* DOM                                                                */
  /* ------------------------------------------------------------------ */

  var el = {};
  [
    'unsupported', 'scenario-row', 'mic-btn', 'mic-label', 'status-dot',
    'status-text', 'transcript', 'result', 'result-badge', 'result-score',
    'result-meaning', 'result-action', 'result-doc-wrap', 'result-doc',
    'result-risk', 'reply-wrap', 'reply-hu', 'reply-ru', 'speak-reply',
    'alternatives', 'alternatives-list', 'say-list', 'text-input',
    'text-submit', 'example-list', 'history', 'clear-history',
    'settings', 'settings-toggle', 'settings-close', 'rate-range',
    'rate-value', 'autospeak', 'llm-provider', 'llm-key', 'llm-save',
    'llm-status', 'voice-report', 'voice-test', 'corpus-size',
    'lang-toggle', 'lang-current', 'mic-alert', 'mic-alert-text', 'mic-retry',
    'essentials', 'result-empty', 'whisper-on', 'whisper-status'
  ].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  /* ------------------------------------------------------------------ */
  /* Index building                                                     */
  /* ------------------------------------------------------------------ */

  /*
   * Narrowing to the current counter is the cheapest accuracy win available.
   * "Kérem a kártyáját" is ambiguous across the whole corpus and unambiguous
   * inside a clinic. Generic phrases stay in every scenario because a clerk
   * can always tell you to wait or go elsewhere.
   *
   * Rebuilding the index rather than filtering afterwards matters: IDF is
   * computed over the active set, so inside the bank "számla" stops being
   * a distinguishing word and the keywords that actually separate bank
   * phrases from each other gain weight.
   */
  function rebuildIndex() {
    var cards = window.ABLAK_PHRASES.filter(function (c) {
      return state.scenario === 'all' ||
             c.scenario === state.scenario ||
             c.scenario === 'generic';
    });
    state.index = M.buildIndex(cards);

    if (el['corpus-size']) {
      var text = window.ABLAK_PHRASES.length + ' ' + T('settings.corpusPhrases');
      if (state.scenario !== 'all') {
        text += ' (' + T('settings.corpusActive') + ' ' + cards.length + ')';
      }
      el['corpus-size'].textContent = text;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  function setStatus(key, mode) {
    el['status-text'].textContent = T(key);
    el['status-dot'].className = 'dot' +
      (mode === 'live' ? ' is-live' : mode === 'thinking' ? ' is-thinking' : '');
  }

  function idleStatus() {
    setStatus(state.listening ? 'status.listening' : 'status.done',
              state.listening ? 'live' : null);
  }

  function showTranscript(text, interim) {
    el.transcript.textContent = text || '—';
    el.transcript.className = 'transcript' + (interim ? ' is-interim' : '');
  }

  /*
   * One render path for both sources. `payload` carries the display fields;
   * `meta` carries how much to trust them. Corpus payloads are phrase cards,
   * so their text is resolved per language; model payloads already carry
   * resolved strings.
   */
  function renderResult(payload, meta) {
    var fromCorpus = meta.source !== 'model';

    var meaning = fromCorpus ? I18n.card(payload, 'meaning') : payload.meaning;
    var action  = fromCorpus ? I18n.card(payload, 'action')  : payload.action;
    var doc     = fromCorpus ? I18n.card(payload, 'doc')     : null;
    var replyHu = payload.reply_hu || '';
    var replyUi = fromCorpus ? I18n.reply(payload) : (payload.reply_gloss || '');

    var r = el.result;
    el['result-empty'].hidden = true;
    r.hidden = false;
    /* Keep `panel`: this element is both a card and a result, and
     * assigning className wholesale used to strip its card styling. */
    r.className = 'panel result is-' + meta.status;

    var badgeText, badgeClass;
    if (meta.source === 'model') {
      badgeText = T('badge.unverified') + ' · ' + meta.provider;
      badgeClass = 'badge is-model';
    } else if (meta.status === 'confident') {
      badgeText = T('badge.confident');
      badgeClass = 'badge is-confident';
    } else if (meta.status === 'uncertain') {
      badgeText = T('badge.uncertain');
      badgeClass = 'badge is-uncertain';
    } else {
      badgeText = T('badge.unknown');
      badgeClass = 'badge';
    }
    el['result-badge'].textContent = badgeText;
    el['result-badge'].className = badgeClass;

    el['result-score'].textContent = meta.score != null
      ? T('result.score') + ' ' + Math.round(meta.score * 100) + '%'
      : '';

    el['result-meaning'].textContent = meaning;
    el['result-action'].textContent = action;

    el['result-doc-wrap'].hidden = !doc;
    if (doc) el['result-doc'].textContent = doc;

    /*
     * The risk banner shows for cards flagged high-risk — signing,
     * medication, missing documents — and for anything the model produced,
     * because an unverified gloss at a counter deserves the same caution.
     */
    el['result-risk'].hidden = !(payload.risk === 'high' || meta.source === 'model');

    el['reply-wrap'].hidden = !replyHu;
    if (replyHu) {
      el['reply-hu'].textContent = replyHu;
      el['reply-ru'].textContent = replyUi;
      el['speak-reply'].dataset.text = replyHu;
    }
  }

  function renderUnknown(llmPending) {
    el['result-empty'].hidden = true;
    el.result.hidden = false;
    el.result.className = 'panel result is-unknown';
    el['result-badge'].textContent = T('badge.unknown');
    el['result-badge'].className = 'badge';
    el['result-score'].textContent = '';
    el['result-meaning'].textContent = T(llmPending ? 'unknown.pending' : 'unknown.final');
    el['result-action'].textContent = T('unknown.action');
    el['result-doc-wrap'].hidden = true;
    el['result-risk'].hidden = true;
    el['reply-wrap'].hidden = false;
    el['reply-hu'].textContent = T('unknown.replyHu');
    el['reply-ru'].textContent = T('unknown.replyUi');
    el['speak-reply'].dataset.text = T('unknown.replyHu');
  }

  function renderAlternatives(result) {
    var alts = (result.alternatives || []).filter(function (a) {
      return !result.card || a.card.id !== result.card.id;
    });

    el.alternatives.hidden = alts.length === 0;
    el['alternatives-list'].innerHTML = '';

    alts.forEach(function (alt) {
      var btn = document.createElement('button');
      btn.className = 'alt-btn';
      btn.type = 'button';
      btn.textContent = alt.card.hu;
      btn.addEventListener('click', function () {
        /* Treat the user's pick as ground truth and show it as certain. */
        renderResult(alt.card, { status: 'confident', source: 'corpus', score: null });
        renderAlternatives({ card: alt.card, alternatives: [] });
        if (state.autospeak) speakHungarian(alt.card.reply_hu);
      });
      el['alternatives-list'].appendChild(btn);
    });
  }

  function renderHistory() {
    el.history.innerHTML = '';
    if (!state.history.length) {
      var empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = T('history.empty');
      el.history.appendChild(empty);
      return;
    }
    state.history.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'is-' + item.status;
      var hu = document.createElement('span');
      hu.className = 'history-hu';
      hu.textContent = item.hu;
      var ui = document.createElement('span');
      ui.className = 'history-ru';
      /* Cards re-resolve per language; model text is kept as produced. */
      ui.textContent = item.card ? I18n.card(item.card, 'meaning')
                     : item.text ? item.text
                     : T('history.unknown');
      li.appendChild(hu);
      li.appendChild(ui);
      el.history.appendChild(li);
    });
  }

  function pushHistory(transcript, entry) {
    state.history.unshift({
      hu: transcript,
      card: entry.card || null,
      text: entry.text || null,
      status: entry.status
    });
    state.history = state.history.slice(0, 25);
    renderHistory();
  }

  /* ------------------------------------------------------------------ */
  /* Speaking                                                           */
  /* ------------------------------------------------------------------ */

  /*
   * Speaking and listening cannot overlap. We mute the recognizer's
   * results for the duration of the utterance rather than stopping it,
   * because stopping and restarting costs ~400ms of deafness and at a
   * counter the clerk does not wait.
   */
  function speakHungarian(text) {
    if (!text) return Promise.resolve();
    state.speaking = true;
    if (listener) listener.setMuted(true);
    setStatus('status.speaking', 'thinking');

    return speaker.speak(text, 'hu-HU', { rate: state.rate }).then(function () {
      state.speaking = false;
      if (listener) listener.setMuted(false);
      idleStatus();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Core handler                                                       */
  /* ------------------------------------------------------------------ */

  /* Bring a fresh answer into view: on a phone it renders below the fold. */
  function reveal(options) {
    if (options && options.replay) return;
    try { el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }

  function handleUtterance(transcript, options) {
    options = options || {};
    if (!transcript || !transcript.trim()) return;

    state.lastTranscript = transcript;
    showTranscript(transcript, false);

    var result = M.match(transcript, state.index);

    if (result.status === 'unknown') {
      /* On a language switch we re-render without re-spending a model call. */
      var useLLM = LLM.isEnabled() && !options.replay;
      renderUnknown(useLLM);
      renderAlternatives(result);
      if (!options.replay) pushHistory(transcript, { status: 'unknown' });

      if (useLLM) {
        setStatus('status.thinking', 'thinking');
        el['text-submit'].classList.add('is-loading');
        LLM.interpret(transcript).then(function (modelResult) {
          el['text-submit'].classList.remove('is-loading');
          idleStatus();
          if (!modelResult) {
            renderUnknown(false);
            return;
          }
          renderResult({
            meaning: modelResult.ru_meaning,
            action: modelResult.ru_action,
            reply_hu: modelResult.reply_hu,
            reply_gloss: modelResult.reply_ru
          }, {
            status: modelResult.modelConfident ? 'uncertain' : 'unknown',
            source: 'model',
            provider: modelResult.provider,
            score: null
          });
          pushHistory(transcript, { status: 'uncertain', text: modelResult.ru_meaning });
        });
      }
      reveal(options);
      return;
    }

    renderResult(result.card, {
      status: result.status,
      source: 'corpus',
      score: result.score
    });
    reveal(options);
    renderAlternatives(result);
    if (!options.replay) {
      pushHistory(transcript, { status: result.status, card: result.card });
    }

    /*
     * Auto-speak only on a confident match. Reading out a reply to a
     * phrase we are unsure about would put words in the user's mouth at
     * the exact moment precision matters.
     */
    if (state.autospeak && result.status === 'confident' && !options.replay) {
      speakHungarian(result.card.reply_hu);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Listener wiring                                                    */
  /* ------------------------------------------------------------------ */

  /* The recognition engine is chosen in one place (js/whisper.js): the
   * browser's own by default, or Whisper if the user opted in. Re-callable, so
   * the Settings switch takes effect without a reload. */
  function setupListener() {
    if (listener && state.listening) { try { listener.stop(); } catch (e) {} }
    listener = null;
    if (!window.AblakRecognition.isSupported()) {
      el.unsupported.hidden = false;
      el['mic-btn'].disabled = true;
      el['mic-label'].textContent = T('mic.unavailable');
      setStatus('status.noSpeech', null);
      return;
    }
    el.unsupported.hidden = true;
    el['mic-btn'].disabled = false;
    el['mic-label'].textContent = T('mic.start');

    listener = window.AblakRecognition.create({
      lang: 'hu-HU',
      onPartial: function (text) {
        showTranscript(text, true);
      },
      onFinal: function (text) {
        handleUtterance(text);
      },
      onStateChange: function (s) {
        if (s === 'listening') {
          state.listening = true;
          el['mic-alert'].hidden = true;
          el['mic-btn'].classList.add('is-listening');
          el['mic-label'].textContent = T('mic.stop');
          if (!state.speaking) setStatus('status.listening', 'live');
        } else if (s === 'transcribing') {
          state.listening = false;
          el['mic-btn'].classList.remove('is-listening');
          el['mic-label'].textContent = T('mic.start');
          setStatus('status.transcribing', 'thinking');
        } else {
          state.listening = false;
          el['mic-btn'].classList.remove('is-listening');
          el['mic-label'].textContent = T('mic.start');
          if (!state.speaking) setStatus('status.done', null);
        }
      },
      onError: function (code) {
        /* Recognition errors are reported verbatim: they are rare, and a
         * vague message would leave the user unable to fix the cause. */
        var messages = {
          'not-allowed': 'Microphone access denied. Allow it in the browser settings.',
          'service-not-allowed': 'The browser blocked speech recognition.',
          'audio-capture': 'No microphone found.',
          'network': 'Speech recognition needs an internet connection. Text input works offline.',
          'no-speech': 'I did not hear anything. Try again, closer to the microphone.',
          'bad-key': 'Groq rejected the key. Check it in Settings, or switch back to the browser engine.',
          'rate-limit': 'The Whisper free limit was reached. Wait a minute, or switch back to the browser engine in Settings.',
          'unsupported': T('unsupported.strong')
        };
        el['status-text'].textContent = T('status.ready');
        el['status-dot'].className = 'dot';
        /* An error is not a refusal: it gets its own red alert and a retry. */
        el['mic-alert-text'].textContent = messages[code] || ('Recognition error: ' + code);
        el['mic-alert'].hidden = false;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* UI population                                                      */
  /* ------------------------------------------------------------------ */

  /*
   * Speak-phrases are grouped by counter. With "Anywhere" every group shows;
   * with a specific counter selected, only that group and the general one do,
   * so a person at a bank is not scrolling past hospital phrases.
   */
  /* Hungarian first (it is what gets said and what the clerk will hear),
   * then the gloss in the user's language, then an explicit Speak cue. */
  function phraseCard(phrase) {
    var btn = document.createElement('button');
    btn.className = 'say-btn';
    btn.type = 'button';
    var hu = document.createElement('span');
    hu.textContent = phrase.hu;
    hu.setAttribute('lang', 'hu');
    var small = document.createElement('small');
    small.textContent = I18n.sayGloss(phrase) || I18n.sayLabel(phrase);
    var tag = document.createElement('em');
    tag.className = 'speak-tag';
    tag.textContent = '🔊 ' + T('phrase.speak');
    btn.appendChild(hu);
    btn.appendChild(small);
    btn.appendChild(tag);
    btn.addEventListener('click', function () { speakHungarian(phrase.hu); });
    return btn;
  }

  var ESSENTIALS = ['say_repeat', 'say_dont_understand', 'say_slower', 'say_write'];

  function buildEssentials() {
    el.essentials.innerHTML = '';
    ESSENTIALS.forEach(function (id) {
      var phrase = window.ABLAK_SAY.filter(function (p) { return p.id === id; })[0];
      if (phrase) el.essentials.appendChild(phraseCard(phrase));
    });
  }

  var SAY_ORDER = ['immigration', 'bank', 'clinic', 'supermarket', 'generic'];

  function buildSayList() {
    buildEssentials();
    var root = el['say-list'];
    root.innerHTML = '';
    SAY_ORDER.forEach(function (sc) {
      if (state.scenario !== 'all' && sc !== state.scenario && sc !== 'generic') return;
      var phrases = window.ABLAK_SAY.filter(function (p) {
        return (p.scenario || 'generic') === sc;
      });
      if (!phrases.length) return;

      var title = document.createElement('h3');
      title.className = 'say-group-title';
      title.textContent = T('say.group.' + sc);
      root.appendChild(title);

      var grid = document.createElement('div');
      grid.className = 'say-grid';
      phrases.forEach(function (phrase) {
        grid.appendChild(phraseCard(phrase));
      });
      root.appendChild(grid);
    });
  }

  /*
   * Examples chosen to demonstrate behaviour, not just to be convenient:
   *   1. an exact corpus phrase            -> confident
   *   2. the same phrase with no accents   -> still confident (folding)
   *   3. a reordered, partial phrase       -> confident (n-grams + stems)
   *   4. a high-risk phrase                -> risk banner
   *   5. something out of domain           -> refuses to answer
   */
  var EXAMPLES = [
    'Kérem a lakcímkártyáját.',
    'kerem a lakcimkartyajat',
    'holnap reggel nyolcra jöjjön vissza',
    'Hiánypótlásra fogjuk felszólítani.',
    'Van TAJ kártyája?',
    'A kutyám megette a házi feladatomat.'
  ];

  function buildExamples() {
    el['example-list'].innerHTML = '';
    EXAMPLES.forEach(function (text) {
      var btn = document.createElement('button');
      btn.className = 'alt-btn';
      btn.type = 'button';
      btn.textContent = text;
      btn.addEventListener('click', function () {
        el['text-input'].value = text;
        handleUtterance(text);
      });
      el['example-list'].appendChild(btn);
    });
  }

  function reportVoices() {
    if (!speaker.supported) {
      el['voice-report'].textContent = T('settings.noTts');
      return;
    }
    var hu = speaker.pickVoice('hu-HU');
    el['voice-report'].textContent = hu
      ? T('settings.voiceOk') + ' ' + hu.name
      : T('settings.voiceMissing');
  }

  function reportLlmStatus() {
    var saved = LLM.loadConfig();
    if (saved && saved.provider && LLM.PROVIDERS[saved.provider]) {
      el['llm-status'].textContent = T('settings.llmOn') + ' (' +
        LLM.PROVIDERS[saved.provider].label + ').';
    } else {
      el['llm-status'].textContent = '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Language                                                           */
  /* ------------------------------------------------------------------ */

  function applyLanguage() {
    I18n.apply(document);
    el['lang-current'].textContent = T('lang.name');

    /* Strings owned by JS rather than by a data-i18n attribute. */
    if (el['mic-btn'].disabled) {
      el['mic-label'].textContent = T('mic.unavailable');
      setStatus('status.noSpeech', null);
    } else {
      el['mic-label'].textContent = T(state.listening ? 'mic.stop' : 'mic.start');
      if (!state.speaking) {
        setStatus(state.listening ? 'status.listening' : 'status.ready',
                  state.listening ? 'live' : null);
      }
    }

    rebuildIndex();
    buildSayList();
    buildExamples();
    if (window.AblakPractice && window.AblakPractice.rerender) window.AblakPractice.rerender();
    if (window.AblakCourier && window.AblakCourier.rerender) window.AblakCourier.rerender();
    if (window.AblakCallSim && window.AblakCallSim.rerender) window.AblakCallSim.rerender();
    if (window.AblakSayIt && window.AblakSayIt.rerender) window.AblakSayIt.rerender();
    renderHistory();
    reportVoices();
    reportLlmStatus();

    /* Re-render the current result in the new language. */
    if (state.lastTranscript) {
      handleUtterance(state.lastTranscript, { replay: true });
    }
  }

  function toggleLanguage() {
    var langs = I18n.available();
    var next = langs[(langs.indexOf(I18n.get()) + 1) % langs.length];
    I18n.set(next);
    applyLanguage();
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                             */
  /* ------------------------------------------------------------------ */

  function reportWhisper() {
    var W = window.AblakWhisper;
    el['whisper-on'].checked = W.isEnabled();
    el['whisper-status'].textContent = W.isEnabled() ? T('settings.wOnStatus')
      : (W.hasKey() ? '' : T('settings.wNeedKey'));
  }

  function bindEvents() {
    el['lang-toggle'].addEventListener('click', toggleLanguage);

    el['mic-btn'].addEventListener('click', function () {
      if (!listener) return;
      if (state.listening) listener.stop();
      else listener.start();
    });

    document.getElementById('try').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      /* Tapping the selected counter again clears it: back to "anywhere". */
      state.scenario = (btn.dataset.scenario === state.scenario) ? 'all' : btn.dataset.scenario;
      Array.prototype.forEach.call(
        document.querySelectorAll('.chip[data-scenario]'),
        function (c) { c.classList.toggle('chip-active', c.dataset.scenario === state.scenario); }
      );
      rebuildIndex();
      buildSayList();
    });

    el['mic-retry'].addEventListener('click', function () {
      el['mic-alert'].hidden = true;
      if (listener && !state.listening) listener.start();
    });

    el['speak-reply'].addEventListener('click', function () {
      speakHungarian(this.dataset.text);
    });

    el['text-submit'].addEventListener('click', function () {
      handleUtterance(el['text-input'].value);
    });

    el['text-input'].addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleUtterance(el['text-input'].value);
    });

    el['clear-history'].addEventListener('click', function () {
      state.history = [];
      renderHistory();
    });

    el['settings-toggle'].addEventListener('click', function () {
      el.settings.hidden = false;
      reportVoices();
    });
    el['settings-close'].addEventListener('click', function () {
      el.settings.hidden = true;
    });
    el.settings.addEventListener('click', function (e) {
      if (e.target === el.settings) el.settings.hidden = true;
    });

    el['rate-range'].addEventListener('input', function () {
      state.rate = parseFloat(this.value);
      el['rate-value'].textContent = state.rate.toFixed(2) + '×';
    });

    el.autospeak.addEventListener('change', function () {
      state.autospeak = this.checked;
    });

    el['voice-test'].addEventListener('click', function () {
      speakHungarian('Jó napot kívánok. Kérem a lakcímkártyáját.');
    });

    el['whisper-on'].addEventListener('change', function () {
      var W = window.AblakWhisper;
      if (this.checked && !W.hasKey()) {
        this.checked = false;
        el['whisper-status'].textContent = T('settings.wNeedKey');
        return;
      }
      W.setEnabled(this.checked);
      reportWhisper();
      setupListener();
    });

    el['llm-save'].addEventListener('click', function () {
      var provider = el['llm-provider'].value;
      var key = el['llm-key'].value.trim();
      if (!provider || !key) {
        LLM.saveConfig(null, null);
        el['llm-status'].textContent = T('settings.llmOff');
        return;
      }
      LLM.saveConfig(provider, key);
      el['llm-status'].textContent = T('settings.llmSaved');
      reportWhisper();
      setupListener();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                               */
  /* ------------------------------------------------------------------ */

  function init() {
    I18n.restore();

    rebuildIndex();
    setupListener();
    bindEvents();

    var saved = LLM.loadConfig();
    if (saved && saved.provider) el['llm-provider'].value = saved.provider;
    reportWhisper();

    applyLanguage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
