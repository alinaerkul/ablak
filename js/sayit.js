/*
 * Ablak — "Say it in Hungarian"
 * ---------------------------------------------------------------------------
 * The other half of a conversation. The user speaks (or types) in English or
 * Russian; the app says it in Hungarian. Two paths, kept visibly different:
 *
 *   1. A PREPARED PHRASE. The utterance is matched against the ready-made
 *      Hungarian phrases (js/phrases.js, ABLAK_SAY). If one is clearly the
 *      closest, its Hungarian is shown with what it means. These were written
 *      once and can be checked by a person, so this is the trusted path.
 *
 *      Word overlap cannot tell "block my card" from "my card has been blocked":
 *      the same words, opposite meaning. So the meaning is always on screen next
 *      to the Hungarian, and automatic speech can be switched off.
 *
 *   2. A MACHINE TRANSLATION, only if the user has opted into the AI fallback
 *      (a free Groq or Gemini key in Settings). It is labelled as unverified,
 *      comes with a back-translation so the user can check what is about to be
 *      said.
 *
 * With neither, the app says so and offers the nearest prepared phrases. It does
 * not guess. Matching here is a small weighted word-overlap, separate from the
 * Hungarian matcher: that one is tuned for Hungarian suffixes and speech noise,
 * this one compares plain English or Russian words.
 *
 * Engine: AblakSayIt.resolve(text, lang). Pure, no DOM. UI attaches only if
 * #sayit-input exists.
 */

(function () {
  'use strict';

  var EN_STOP = ('a an the i me my we our you your is are am be do does did to of for in on at it ' +
    'this that these those and or but with please sorry could can would may might will shall ' +
    'have has had just very so if as by from about there here ' +
    'hello hi hey like want need wish').split(' ');
  var RU_STOP = ('и в на с по к у о от для а но я мы вы ты мне меня мой моя мои мне нам нас ' +
    'это эта этот что как бы ли же извините пожалуйста можете могли можно будет есть ' +
    'привет здравствуйте хочу').split(' ');

  var STOP = { en: {}, ru: {} };
  EN_STOP.forEach(function (w) { STOP.en[w] = true; });
  RU_STOP.forEach(function (w) { STOP.ru[w] = true; });

  var CONFIDENT = 0.66;    /* clearly this phrase */
  var MARGIN = 0.12;       /* ... and clearly ahead of the runner-up */
  var SUGGEST = 0.34;      /* close enough to offer as a suggestion */

  /* Overlap is not enough on its own: "I want to see a dentist" shares "see"
   * with "I would like to see a doctor" and nothing else, and offering the
   * doctor phrase would silently drop the one word that mattered. So a phrase
   * must also COVER most of the user's meaningful words (weighted by how
   * distinctive they are) before it is offered at all. */
  var COVER_CONFIDENT = 0.85;
  var COVER_SUGGEST = 0.7;

  function detectLang(text) {
    return /[а-яё]/i.test(text || '') ? 'ru' : 'en';
  }

  /* Lowercase words, minus filler, cut to a 4-letter stem so that "slowly" and
   * "slower", or "медленнее" and "медленно", count as the same word. */
  function stems(text, lang) {
    var words = String(text || '').toLowerCase()
      .replace(/n['’]t\b/g, ' not')     /* "don't" -> "do not", so "not" survives */
      .replace(/['’]s\b/g, '')
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9\s]/g, ' ')
      .split(/\s+/);
    var out = [];
    words.forEach(function (w) {
      if (w.length < 3 || STOP[lang][w]) return;
      out.push(w.length > 4 ? w.slice(0, 4) : w);
    });
    return out;
  }

  var index = { en: null, ru: null };

  function formsOf(p, lang) {
    /* alts_en / alts_ru are optional extra ways people say the same thing
     * ("I want to see a dentist" for an appointment phrase). */
    return lang === 'ru' ? [p.ru, p.label].concat(p.alts_ru || [])
                         : [p.en, p.label_en].concat(p.alts_en || []);
  }

  function build(lang) {
    var phrases = window.ABLAK_SAY || [];
    var df = {};
    var entries = phrases.map(function (p) {
      var forms = formsOf(p, lang).filter(Boolean).map(function (f) { return stems(f, lang); });
      var seen = {};
      forms.forEach(function (st) { st.forEach(function (w) { seen[w] = true; }); });
      Object.keys(seen).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
      return { phrase: p, forms: forms };
    });
    var n = Math.max(entries.length, 1);
    function idf(w) { return Math.log((n + 1) / ((df[w] || 0) + 0.5)) + 1; }
    return { entries: entries, idf: idf };
  }

  /* -> {dice, cover}: how alike the two word lists are, and what share of the
   * query's (distinctiveness-weighted) words the form contains. */
  function overlap(q, f, idf) {
    if (!q.length || !f.length) return { dice: 0, cover: 0 };
    var fset = {};
    f.forEach(function (w) { fset[w] = true; });
    var qset = {}, shared = 0, wq = 0, wf = 0;
    q.forEach(function (w) { if (!qset[w]) { qset[w] = true; wq += idf(w); if (fset[w]) shared += idf(w); } });
    var seen = {};
    f.forEach(function (w) { if (!seen[w]) { seen[w] = true; wf += idf(w); } });
    return { dice: (2 * shared) / (wq + wf), cover: wq ? shared / wq : 0 };
  }

  function rank(text, lang) {
    if (!index[lang]) index[lang] = build(lang);
    var ix = index[lang];
    var q = stems(text, lang);
    return ix.entries.map(function (e) {
      var best = { dice: 0, cover: 0 };
      e.forms.forEach(function (f) {
        var o = overlap(q, f, ix.idf);
        if (o.dice > best.dice) best = o;
      });
      return { phrase: e.phrase, score: best.dice, cover: best.cover };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* -> {kind:'phrase', phrase, score} | {kind:'suggest', options} | {kind:'none'} */
  function resolve(text, lang) {
    lang = lang || detectLang(text);
    var ranked = rank(text, lang);
    var top = ranked[0], next = ranked[1];
    if (!top || top.score < SUGGEST) return { kind: 'none', lang: lang };
    if (top.score >= CONFIDENT && top.cover >= COVER_CONFIDENT &&
        (!next || top.score - next.score >= MARGIN)) {
      return { kind: 'phrase', phrase: top.phrase, score: top.score, lang: lang };
    }
    var options = ranked.filter(function (r) {
      return r.score >= SUGGEST && r.cover >= COVER_SUGGEST;
    }).slice(0, 3);
    return options.length ? { kind: 'suggest', lang: lang, options: options }
                          : { kind: 'none', lang: lang };
  }

  /* Dropped when the phrase list changes (tests swap it). */
  function reset() { index = { en: null, ru: null }; }

  window.AblakSayIt = {
    resolve: resolve,
    rank: rank,
    detectLang: detectLang,
    stems: stems,
    reset: reset,
    THRESHOLDS: { confident: CONFIDENT, margin: MARGIN, suggest: SUGGEST, coverConfident: COVER_CONFIDENT, coverSuggest: COVER_SUGGEST }
  };

  /* ------------------------------------------------------------------ */
  /* UI                                                                 */
  /* ------------------------------------------------------------------ */

  if (typeof document === 'undefined' || !document.getElementById ||
      !document.getElementById('sayit-input')) return;

  var I18n = window.AblakI18n;
  var $ = function (id) { return document.getElementById(id); };
  var speaker = new window.AblakSpeech.Speaker();
  var listener = null;
  var run = 0;

  var STR = {
    title:   { en: 'Your reply in Hungarian', ru: 'Ваш ответ по-венгерски' },
    hint:    { en: 'Say or type your reply in English or Russian. You get a prepared Hungarian phrase, or, with a free AI key in Settings, a translation of anything. You see the text first; with automatic speech on, you also hear it at once.',
               ru: 'Скажите или введите ответ по-английски или по-русски. Вы получите готовую венгерскую фразу или, с бесплатным ИИ-ключом в настройках, перевод чего угодно. Вы видите текст; при включённой автоозвучке он сразу звучит.' },
    ph:      { en: 'Say or type: “Could you speak more slowly?”', ru: 'Скажите или введите: «Говорите медленнее»' },
    go:      { en: 'Say it', ru: 'Сказать' },
    listen:  { en: 'Speak', ru: 'Говорить' },
    stop:    { en: 'Stop', ru: 'Стоп' },
    hearing: { en: 'Listening…', ru: 'Слушаю…' },
    working: { en: 'Translating…', ru: 'Перевожу…' },
    prepared:{ en: 'Prepared phrase', ru: 'Готовая фраза' },
    machine: { en: 'Machine translation · unverified', ru: 'Машинный перевод · не проверено' },
    back:    { en: 'Back-translation: ', ru: 'Обратный перевод: ' },
    check:   { en: 'Check it before you say it. If you are unsure, show the Hungarian text to the clerk.',
               ru: 'Проверьте перед тем, как говорить. Если не уверены, покажите венгерский текст сотруднику.' },
    means:   { en: 'Means: ', ru: 'Значит: ' },
    speak:   { en: '🔊 Speak it', ru: '🔊 Произнести' },
    none:    { en: 'That is not one of the prepared phrases. Add a free Groq key in Settings (⚙) to translate anything, or try one of the phrases below.',
               ru: 'Такой готовой фразы нет. Добавьте бесплатный ключ Groq в настройках (⚙), чтобы переводить что угодно, или выберите фразу ниже.' },
    maybe:   { en: 'Did you mean one of these?', ru: 'Возможно, вы имели в виду:' },
    nomic:   { en: 'The microphone could not start. You can type instead.', ru: 'Микрофон не запустился. Можно ввести текстом.' },
    heardnone:{ en: 'I did not hear anything. Try again.', ru: 'Ничего не услышал. Попробуйте ещё раз.' },
    badkey:  { en: 'The AI key was rejected. Check it in Settings.', ru: 'Ключ ИИ отклонён. Проверьте его в настройках.' },
    rate:    { en: 'The free limit was reached. Wait a minute and try again.', ru: 'Достигнут бесплатный лимит. Подождите минуту и повторите.' },
    fail:    { en: 'The translation did not work. Try again, or pick a prepared phrase.', ru: 'Перевод не получился. Повторите или выберите готовую фразу.' },
    code:    { en: 'Error code: ', ru: 'Код ошибки: ' },
    auto:    { en: 'Speak it aloud automatically', ru: 'Произносить автоматически' }
  };
  function g(o) { return I18n.get() === 'ru' ? o.ru : o.en; }
  function gl(p) { return I18n.get() === 'ru' ? p.ru : p.en; }

  function rate() {
    var r = parseFloat(($('rate-range') || {}).value);
    return isNaN(r) ? 0.92 : r;
  }
  function speak(hu) { return speaker.speak(hu, 'hu-HU', { rate: rate() }); }

  function setStatus(text) { $('sayit-status').textContent = text || ''; }

  /* On by default: the point of this box is to be heard. The text and, for a
   * machine translation, the back-translation are always on screen as well. */
  var AUTO_KEY = 'ablak.sayit.auto';
  function autoOn() {
    try { return window.localStorage.getItem(AUTO_KEY) !== '0'; } catch (e) { return true; }
  }
  function setAuto(on) {
    try { window.localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch (e) {}
  }

  function clearResult() {
    $('sayit-result').hidden = true;
    $('sayit-more').innerHTML = '';
    $('sayit-more-wrap').hidden = true;
  }

  function showCard(opts) {
    $('sayit-result').hidden = false;
    $('sayit-result').className = 'sayit-card ' + (opts.model ? 'is-model' : 'is-prepared');
    var badge = $('sayit-badge');
    badge.textContent = g(opts.model ? STR.machine : STR.prepared);
    badge.className = 'badge ' + (opts.model ? 'is-model' : 'is-confident');
    $('sayit-hu').textContent = opts.hu;
    $('sayit-gloss').textContent = opts.gloss || '';
    $('sayit-note').textContent = opts.model ? g(STR.check) : '';
    $('sayit-note').hidden = !opts.model;
    $('sayit-speak').dataset.text = opts.hu;
    try { $('sayit-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }

  function showSuggestions(options) {
    var wrap = $('sayit-more-wrap'), list = $('sayit-more');
    list.innerHTML = '';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'alt-btn';
      b.textContent = gl(o.phrase);
      b.addEventListener('click', function () {
        showCard({ hu: o.phrase.hu, gloss: g(STR.means) + gl(o.phrase) });
        if (autoOn()) speak(o.phrase.hu);
      });
      list.appendChild(b);
    });
    wrap.hidden = !options.length;
  }

  /* Entry point for both typed and spoken text. `auto` = came from the mic. */
  function handle(text) {
    text = (text || '').trim();
    if (!text) return;
    var token = ++run;
    clearResult();
    var lang = window.AblakSayIt.detectLang(text);
    var r = resolve(text, lang);

    if (r.kind === 'phrase') {
      setStatus('');
      showCard({ hu: r.phrase.hu, gloss: g(STR.means) + gl(r.phrase) });
      if (autoOn()) speak(r.phrase.hu);
      return;
    }

    var LLM = window.AblakLLM;
    if (LLM && LLM.isEnabled()) {
      setStatus(g(STR.working));
      $('sayit-go').classList.add('is-loading');
      /* The chosen counter tells the model which meaning of an ambiguous word
       * is meant ("plan" at a phone shop is a package, not a plant). */
      var chip = document.querySelector('#scenario-row .chip-active[data-scenario]');
      var place = chip ? chip.getAttribute('data-scenario') : '';
      LLM.translate(text, lang, place).then(function (res) {
        if (token !== run) return;
        $('sayit-go').classList.remove('is-loading');
        setStatus('');
        if (res && res.hu) {
          showCard({ model: true, hu: res.hu, gloss: res.back ? g(STR.back) + res.back : '' });
          if (autoOn()) speak(res.hu);
          if (r.kind === 'suggest') showSuggestions(r.options);
          return;
        }
        var code = res && res.error;
        setStatus(g(code === 'bad-key' ? STR.badkey : code === 'rate-limit' ? STR.rate : STR.fail) +
                  (code && code !== 'bad-key' && code !== 'rate-limit'
                    ? ' (' + g(STR.code) + code + (res.detail ? ': ' + String(res.detail).slice(0, 160) : '') + ')' : ''));
        if (r.kind === 'suggest') showSuggestions(r.options);
      });
      return;
    }

    setStatus(g(STR.none));
    if (r.kind === 'suggest') showSuggestions(r.options);
  }

  function setupMic() {
    var btn = $('sayit-mic');
    if (!window.AblakSpeech.Listener.isSupported()) { btn.hidden = true; return; }
    btn.addEventListener('click', function () {
      var main = $('mic-btn');
      if (main && main.classList.contains('is-listening')) main.click();
      if (listener && btn.classList.contains('is-listening')) { listener.stop(); return; }
      listener = new window.AblakSpeech.Listener({
        lang: I18n.get() === 'ru' ? 'ru-RU' : 'en-US',
        onPartial: function (text) { $('sayit-input').value = text; },
        onFinal: function (text) {
          listener.stop();
          $('sayit-input').value = text;
          handle(text);
        },
        onStateChange: function (s) {
          var on = s === 'listening';
          btn.classList.toggle('is-listening', on);
          btn.querySelector('span').textContent = g(on ? STR.stop : STR.listen);
          if (on) setStatus(g(STR.hearing));
          else if (!$('sayit-go').classList.contains('is-loading')) setStatus('');
        },
        onError: function (code) {
          btn.classList.remove('is-listening');
          setStatus(g(code === 'no-speech' ? STR.heardnone : STR.nomic));
        }
      });
      listener.start();
    });
  }

  function renderStatic() {
    $('sayit-title').textContent = g(STR.title);
    $('sayit-hint').textContent = g(STR.hint);
    $('sayit-input').placeholder = g(STR.ph);
    $('sayit-go').textContent = g(STR.go);
    $('sayit-speak').textContent = g(STR.speak);
    $('sayit-more-label').textContent = g(STR.maybe);
    $('sayit-auto-label').textContent = g(STR.auto);
    $('sayit-auto').checked = autoOn();
    var mic = $('sayit-mic');
    if (mic.querySelector('span')) mic.querySelector('span').textContent = g(mic.classList.contains('is-listening') ? STR.stop : STR.listen);
  }

  $('sayit-go').addEventListener('click', function () { handle($('sayit-input').value); });
  $('sayit-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); handle($('sayit-input').value); }
  });
  $('sayit-speak').addEventListener('click', function () { speak(this.dataset.text); });
  $('sayit-auto').addEventListener('change', function () { setAuto(this.checked); });

  window.AblakSayIt.rerender = renderStatic;
  setupMic();
  renderStatic();
})();
