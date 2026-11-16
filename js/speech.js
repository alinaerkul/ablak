/*
 * Ablak — speech I/O
 * ---------------------------------------------------------------------------
 * Thin wrappers over the two browser speech APIs, with the awkward parts
 * handled: vendor prefixes, the recognizer stopping itself every few
 * seconds, voices loading asynchronously, and the app hearing its own
 * voice through the microphone.
 *
 * Both APIs are free and require no key, which is the whole reason the
 * prototype runs on a reviewer's machine in thirty seconds.
 */

(function () {
  'use strict';

  /* ===================================================================== */
  /* Listener — speech recognition                                         */
  /* ===================================================================== */

  var SpeechRecognitionImpl =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;

  function Listener(options) {
    this.lang = options.lang || 'hu-HU';
    this.onPartial = options.onPartial || function () {};
    this.onFinal = options.onFinal || function () {};
    this.onStateChange = options.onStateChange || function () {};
    this.onError = options.onError || function () {};

    this.recognition = null;
    this.wantListening = false;   /* user intent */
    this.active = false;          /* actual recognizer state */
    this.muted = false;           /* true while we are speaking */
    this._restartTimer = null;
  }

  Listener.isSupported = function () {
    return SpeechRecognitionImpl !== null;
  };

  Listener.prototype._build = function () {
    var self = this;
    var rec = new SpeechRecognitionImpl();

    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      self.active = true;
      self.onStateChange('listening');
    };

    rec.onresult = function (event) {
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var result = event.results[i];
        var text = result[0].transcript;
        if (result.isFinal) {
          /*
           * We drop anything heard while muted. The recognizer keeps a
           * small audio buffer, so our own text-to-speech can land in it
           * and be transcribed as if the clerk had said it. Without this
           * guard the app answers its own answers.
           */
          if (!self.muted && text.trim()) {
            self.onFinal(text.trim(), result[0].confidence);
          }
        } else {
          interim += text;
        }
      }
      if (interim && !self.muted) self.onPartial(interim.trim());
    };

    rec.onerror = function (event) {
      /*
       * 'no-speech' and 'aborted' are routine in continuous mode and must
       * not be shown to the user — a person standing at a counter does not
       * need to be told the microphone heard a pause.
       */
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      self.onError(event.error);
    };

    rec.onend = function () {
      self.active = false;
      /*
       * Chrome ends recognition on its own after a period of silence even
       * with continuous = true. If the user still wants to listen, restart.
       * The small delay avoids a tight loop when the mic is unavailable.
       */
      if (self.wantListening) {
        clearTimeout(self._restartTimer);
        self._restartTimer = setTimeout(function () {
          if (self.wantListening && !self.active) {
            try { rec.start(); } catch (e) { /* already starting */ }
          }
        }, 250);
      } else {
        self.onStateChange('idle');
      }
    };

    return rec;
  };

  Listener.prototype.start = function () {
    if (!SpeechRecognitionImpl) {
      this.onError('unsupported');
      return;
    }
    this.wantListening = true;
    if (!this.recognition) this.recognition = this._build();
    if (!this.active) {
      try { this.recognition.start(); }
      catch (e) { /* start() throws if already running; harmless */ }
    }
  };

  Listener.prototype.stop = function () {
    this.wantListening = false;
    clearTimeout(this._restartTimer);
    if (this.recognition && this.active) {
      try { this.recognition.stop(); } catch (e) {}
    }
    this.onStateChange('idle');
  };

  Listener.prototype.setMuted = function (muted) {
    this.muted = muted;
  };

  Listener.prototype.setLang = function (lang) {
    this.lang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
      /* Language only takes effect on the next session, so cycle it. */
      if (this.active) {
        try { this.recognition.stop(); } catch (e) {}
      }
    }
  };

  /* ===================================================================== */
  /* Speaker — speech synthesis                                            */
  /* ===================================================================== */

  function Speaker() {
    this.supported = 'speechSynthesis' in window;
    this.voices = [];
    this._loadVoices();
  }

  Speaker.prototype._loadVoices = function () {
    var self = this;
    if (!this.supported) return;

    function load() {
      self.voices = window.speechSynthesis.getVoices() || [];
    }
    load();
    /*
     * getVoices() is empty on first call in Chrome; the list arrives
     * asynchronously via this event. Without the listener, the first
     * utterance of a session gets the wrong language.
     */
    window.speechSynthesis.onvoiceschanged = load;
  };

  /* Prefer an exact locale match, then any voice for the base language. */
  Speaker.prototype.pickVoice = function (lang) {
    if (!this.voices.length) this._loadVoices();
    var base = lang.split('-')[0].toLowerCase();

    var exact = this.voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase();
    });
    if (exact.length) return exact[0];

    var partial = this.voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf(base) === 0;
    });
    return partial.length ? partial[0] : null;
  };

  Speaker.prototype.hasVoiceFor = function (lang) {
    return this.pickVoice(lang) !== null;
  };

  /*
   * speak(text, lang, options) -> Promise
   * Resolves when the utterance finishes, so the caller can un-mute the
   * microphone at exactly the right moment.
   */
  Speaker.prototype.speak = function (text, lang, options) {
    var self = this;
    options = options || {};

    return new Promise(function (resolve) {
      if (!self.supported || !text) return resolve({ spoken: false, reason: 'unsupported' });

      if (options.interrupt !== false) window.speechSynthesis.cancel();

      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || 'hu-HU';
      utterance.rate = options.rate || 0.92;   /* slightly slow: this is
                                                  meant to be repeated */
      utterance.pitch = options.pitch || 1;
      utterance.volume = options.volume != null ? options.volume : 1;

      var voice = self.pickVoice(utterance.lang);
      if (voice) utterance.voice = voice;

      var settled = false;
      function finish(payload) {
        if (settled) return;
        settled = true;
        resolve(payload);
      }

      utterance.onend = function () { finish({ spoken: true, voice: voice ? voice.name : null }); };
      utterance.onerror = function () { finish({ spoken: false, reason: 'error' }); };

      /*
       * Safety net: speechSynthesis occasionally drops onend, which would
       * leave the microphone muted forever. Estimate the duration from
       * length and resolve anyway.
       */
      var estimate = Math.min(20000, 1200 + text.length * 80);
      setTimeout(function () { finish({ spoken: true, timedOut: true }); }, estimate);

      window.speechSynthesis.speak(utterance);
    });
  };

  Speaker.prototype.stop = function () {
    if (this.supported) window.speechSynthesis.cancel();
  };

  window.AblakSpeech = { Listener: Listener, Speaker: Speaker };
})();
