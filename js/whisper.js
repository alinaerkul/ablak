/*
 * Ablak — optional Whisper recognition
 * ---------------------------------------------------------------------------
 * The default microphone path is the browser's own speech service. In a noisy
 * room, or with a non-native accent, it can return the wrong Hungarian. This
 * file adds an OPT-IN alternative: record a short clip in the browser and send
 * it to Groq's hosted Whisper model, then feed the transcript to exactly the
 * same matcher as before.
 *
 * Constraints, in the order they matter:
 *
 * 1. OFF BY DEFAULT. The product must run with no key and no account. This is
 *    only used when the user has saved a Groq key (in the same Settings block
 *    as the optional AI fallback) AND ticked the box. Otherwise nothing here
 *    runs and the browser engine is used.
 *
 * 2. THE AUDIO LEAVES THE DEVICE, so the UI says so. With the browser engine
 *    the audio also goes to a third party (Google, in Chrome); this swaps who.
 *    Nothing is stored by Ablak.
 *
 * 3. THE KEY STAYS IN THE USER'S BROWSER. It is read from the AI-fallback
 *    config in localStorage; there is no server for it to go to.
 *
 * 4. THE MATCHER IS UNCHANGED. A better transcript does not loosen any
 *    threshold: a wrong transcript is still refused, never guessed at.
 *
 * Recording stops by itself shortly after the person stops talking, so the
 * microphone behaves like the browser one: press once, speak, get an answer.
 */

(function () {
  'use strict';

  var FLAG_KEY = 'ablak.whisper.enabled';
  var URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
  var MODEL = 'whisper-large-v3';

  /* Whisper uses this as a hint about vocabulary and spelling. Naming the
   * words that matter at these counters, with their accents, biases it
   * towards "lakcímkártya" and away from near-misses. It is not a script. */
  var PROMPT = 'Kérem a lakcímkártyáját. Az útlevelét, a személyi igazolványát ' +
    'és a TAJ-kártyáját kérem. Tartózkodási engedély, bankszámla, bankkártya, ' +
    'időpont, háziorvos, recept, nyugta, aláírás, hiánypótlás.';

  var MAX_MS = 12000;          /* hard cap on one recording */
  var NO_SPEECH_MS = 6000;     /* give up if nobody starts talking */
  var SILENCE_MS = 1100;       /* stop this long after speech ends */
  var MIN_SPEECH_MS = 350;     /* shorter than this is a cough, not speech */

  /* ---- config ------------------------------------------------------ */

  function groqKey() {
    var c = window.AblakLLM && window.AblakLLM.loadConfig();
    return (c && c.provider === 'groq' && c.apiKey) ? c.apiKey : '';
  }

  function flag() {
    try { return window.localStorage.getItem(FLAG_KEY) === '1'; } catch (e) { return false; }
  }

  function setEnabled(on) {
    try {
      if (on) window.localStorage.setItem(FLAG_KEY, '1');
      else window.localStorage.removeItem(FLAG_KEY);
    } catch (e) {}
  }

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  function isEnabled() {
    return flag() && !!groqKey() && isSupported();
  }

  /* ---- errors ------------------------------------------------------ */

  /* Pure, so it can be tested without a network. */
  function errorCode(status) {
    if (status === 401 || status === 403) return 'bad-key';
    if (status === 429) return 'rate-limit';
    return 'http-' + status;
  }

  /* ---- recorder ---------------------------------------------------- */

  function pickMime() {
    var options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < options.length; i++) {
      try { if (window.MediaRecorder.isTypeSupported(options[i])) return options[i]; } catch (e) {}
    }
    return '';
  }

  function extensionFor(mime) {
    if (/mp4/.test(mime)) return 'mp4';
    if (/ogg/.test(mime)) return 'ogg';
    return 'webm';
  }

  /* Same shape as AblakSpeech.Listener so the rest of the app does not care
   * which engine it is talking to. */
  function Recorder(options) {
    this.lang = (options.lang || 'hu').slice(0, 2);
    this.onPartial = options.onPartial || function () {};
    this.onFinal = options.onFinal || function () {};
    this.onStateChange = options.onStateChange || function () {};
    this.onError = options.onError || function () {};
    this.muted = false;
    this.active = false;
    this._timers = [];
  }

  Recorder.prototype.setMuted = function (m) { this.muted = !!m; };
  Recorder.prototype.setLang = function (l) { this.lang = (l || 'hu').slice(0, 2); };

  Recorder.prototype._clear = function () {
    this._timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
    this._timers = [];
  };

  Recorder.prototype.start = function () {
    var self = this;
    if (this.active) return;
    this.active = true;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var mime = pickMime();
      var chunks = [];
      var recorder;
      try { recorder = new window.MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch (e) { recorder = new window.MediaRecorder(stream); }

      /* Voice activity: poll the loudness; learn the room's noise floor from
       * the first moments, then treat anything clearly above it as speech. */
      var ctx = null, analyser = null, buf = null;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        buf = new Float32Array(analyser.fftSize);
      } catch (e) { analyser = null; }

      var startedAt = Date.now(), speechAt = 0, lastLoud = 0, floor = 0, floorN = 0;
      var spoke = false, stopped = false;

      function level() {
        analyser.getFloatTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        return Math.sqrt(sum / buf.length);
      }

      function stop() {
        if (stopped) return;
        stopped = true;
        self._clear();
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch (e) {}
      }

      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (ctx && ctx.close) { try { ctx.close(); } catch (e) {} }
        self.active = false;
        var blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
        /* Without the loudness probe we cannot tell speech from silence, so
         * trust the recording and let Whisper decide. */
        if (analyser && !spoke) { self.onStateChange('idle'); self.onError('no-speech'); return; }
        self.onStateChange('transcribing');
        self._transcribe(blob);
      };

      recorder.start();
      self.onStateChange('listening');

      self._timers.push(setTimeout(stop, MAX_MS));
      if (analyser) {
        self._timers.push(setInterval(function () {
          var now = Date.now(), l = level();
          if (now - startedAt < 400) { floor += l; floorN++; return; }
          var threshold = Math.max(0.018, (floorN ? floor / floorN : 0) * 3);
          if (l > threshold) {
            lastLoud = now;
            if (!speechAt) speechAt = now;
            if (now - speechAt > MIN_SPEECH_MS) spoke = true;
          }
          if (spoke && now - lastLoud > SILENCE_MS) stop();
          if (!speechAt && now - startedAt > NO_SPEECH_MS) stop();
        }, 80));
      }
      self._stop = stop;
    }).catch(function (err) {
      self.active = false;
      self.onStateChange('idle');
      self.onError(err && err.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture');
    });
  };

  Recorder.prototype.stop = function () {
    if (this._stop) this._stop();
  };

  Recorder.prototype._transcribe = function (blob) {
    var self = this;
    var key = groqKey();
    if (!key) { self.onStateChange('idle'); self.onError('bad-key'); return; }

    var form = new FormData();
    form.append('file', blob, 'speech.' + extensionFor(blob.type));
    form.append('model', MODEL);
    form.append('language', this.lang);
    form.append('temperature', '0');
    form.append('response_format', 'json');
    if (this.lang === 'hu') form.append('prompt', PROMPT);

    fetch(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form })
      .then(function (res) {
        if (!res.ok) { var e = new Error('http'); e.code = errorCode(res.status); throw e; }
        return res.json();
      })
      .then(function (data) {
        self.onStateChange('idle');
        var text = ((data && data.text) || '').trim();
        if (!text) { self.onError('no-speech'); return; }
        if (!self.muted) self.onFinal(text, null);
      })
      .catch(function (err) {
        self.onStateChange('idle');
        self.onError(err && err.code ? err.code : 'network');
      });
  };

  /* ---- factory ----------------------------------------------------- */

  /* Everything that needs a microphone asks here, so the engine choice lives
   * in one place. */
  function create(options) {
    if (isEnabled()) return new Recorder(options);
    return new window.AblakSpeech.Listener(options);
  }

  function supported() {
    return isEnabled() ? true : window.AblakSpeech.Listener.isSupported();
  }

  window.AblakWhisper = {
    MODEL: MODEL,
    PROMPT: PROMPT,
    isEnabled: isEnabled,
    isSupported: isSupported,
    setEnabled: setEnabled,
    hasKey: function () { return !!groqKey(); },
    errorCode: errorCode,
    extensionFor: extensionFor,
    Recorder: Recorder
  };
  window.AblakRecognition = {
    create: create,
    isSupported: supported,
    engine: function () { return isEnabled() ? 'whisper' : 'browser'; }
  };
})();
