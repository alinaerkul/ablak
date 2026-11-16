/*
 * Ablak — intent matcher
 * ---------------------------------------------------------------------------
 * Maps a noisy Hungarian speech transcript onto one of the counter "moves"
 * in phrases.js, and returns a calibrated confidence so the UI can decide
 * whether to answer, hedge, or admit it does not know.
 *
 * WHY THIS AND NOT AN LLM CALL
 * ----------------------------
 * The whole product rests on one claim: at an immigration counter, a
 * confidently wrong answer is worse than no answer. An LLM gives fluent
 * output for every input, including inputs it has misheard, and it cannot
 * tell you which of those it got right. This matcher can: it returns a score,
 * and below a threshold it refuses to answer and asks the clerk to repeat.
 * That refusal is the feature. It also runs offline, in ~1ms, with no key,
 * no network, and no audio leaving the device — which matters when the audio
 * is a person's immigration interview.
 *
 * HOW IT SCORES (two signals, deliberately different failure modes)
 * -----------------------------------------------------------------
 * 1. Character 4-gram cosine similarity.
 *    Hungarian is agglutinative: "lakcímkártya" becomes "lakcímkártyáját"
 *    when it is the object of a sentence. Word-level matching misses that;
 *    character n-grams catch it, because the two strings share most of their
 *    4-character windows. The same property makes it tolerant of speech
 *    recognition errors, which are usually a few characters wrong, not a
 *    whole word wrong. Hungarian's 6-character stem would have been
 *    cheaper, but see STEM_LENGTH below for why it is 8.
 *
 * 2. IDF-weighted keyword stem hits.
 *    N-grams alone reward long cards and get fooled by shared boilerplate
 *    ("kérem a ..." opens half the corpus). So each card also declares its
 *    content words, and we weight a hit by inverse document frequency: a
 *    keyword that appears in one card is strong evidence, one that appears
 *    in twelve is nearly none. We match on a 6-character stem prefix, which
 *    is a crude but effective stand-in for a Hungarian stemmer — enough to
 *    link "igazolás", "igazolást" and "igazolása" without collapsing
 *    "lakcím" into "lakcímkártya".
 *
 * The two are blended; keywords get the larger share because precision
 * matters more than recall here. Full reasoning in README.md, section "How the matcher works".
 */

(function () {
  'use strict';

  var NGRAM_SIZE = 4;
  /*
   * Stem length was 6 until the test suite caught a real collision:
   * "lakcím" (address) and "lakcímkártya" (address card) share their first
   * six characters, so asking "Mi a lakcíme?" matched the card that tells
   * you to hand over a document. Eight characters separates them while
   * still linking "igazolás" / "igazolást" / "igazolása".
   */
  var STEM_LENGTH = 8;
  var W_NGRAM = 0.40;
  var W_KEYWORD = 0.60;

  /* Confidence bands. Tuned against tests/matcher.tests.js, not by vibes. */
  var THRESHOLD_CONFIDENT = 0.52;  /* answer directly                     */
  var THRESHOLD_HEDGE     = 0.30;  /* offer a guess, ask user to confirm  */
                                   /* below THRESHOLD_HEDGE: do not guess */

  /* --------------------------------------------------------------------- */
  /* Text normalisation                                                    */
  /* --------------------------------------------------------------------- */

  /* Lowercase, strip punctuation, collapse whitespace. Accents preserved. */
  function normalize(text) {
    if (!text) return '';
    return String(text)
      .toLowerCase()
      .replace(/[.,!?;:()"'`„”–—\/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /*
   * "Fold" removes diacritics: á→a, ő→o, ű→u.
   * Speech recognition and users are both unreliable about Hungarian
   * accents, and a missing accent should never cost a match. We fold for
   * comparison only — never for display.
   */
  function fold(text) {
    return normalize(text)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function tokenize(text) {
    var t = fold(text);
    return t ? t.split(' ').filter(function (w) { return w.length > 0; }) : [];
  }

  /* --------------------------------------------------------------------- */
  /* Character n-gram cosine similarity                                    */
  /* --------------------------------------------------------------------- */

  /* Multiset of character n-grams, as {gram: count}. Spaces kept: they
   * carry word-boundary information that helps short phrases. */
  function ngrams(text, n) {
    n = n || NGRAM_SIZE;
    var s = fold(text);
    var out = {};
    if (s.length < n) {
      if (s.length) out[s] = 1;
      return out;
    }
    for (var i = 0; i <= s.length - n; i++) {
      var g = s.substr(i, n);
      out[g] = (out[g] || 0) + 1;
    }
    return out;
  }

  /* Standard cosine over sparse count vectors. Range 0..1. */
  function cosine(a, b) {
    var dot = 0, normA = 0, normB = 0, g;
    for (g in a) {
      if (!Object.prototype.hasOwnProperty.call(a, g)) continue;
      normA += a[g] * a[g];
      if (Object.prototype.hasOwnProperty.call(b, g)) dot += a[g] * b[g];
    }
    for (g in b) {
      if (!Object.prototype.hasOwnProperty.call(b, g)) continue;
      normB += b[g] * b[g];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /* --------------------------------------------------------------------- */
  /* Index construction                                                    */
  /* --------------------------------------------------------------------- */

  function stemOf(word) {
    var f = fold(word);
    return f.length <= STEM_LENGTH ? f : f.substr(0, STEM_LENGTH);
  }

  /*
   * Build the searchable index once at load.
   * For each card we precompute:
   *   - ngramsBySurface: n-grams of each surface form (canonical + variants),
   *     scored independently so a long variant list cannot dilute a match
   *   - stems: deduplicated keyword stems
   * And across the corpus:
   *   - idf[stem]: log(N / cardsContainingStem), floored at 0
   */
  function buildIndex(cards) {
    var N = cards.length;
    var docFreq = {};

    var entries = cards.map(function (card) {
      var surfaces = [card.hu].concat(card.variants || []);
      var stems = {};

      (card.keywords || []).forEach(function (kw) {
        stems[stemOf(kw)] = true;
      });

      Object.keys(stems).forEach(function (s) {
        docFreq[s] = (docFreq[s] || 0) + 1;
      });

      return {
        card: card,
        surfaces: surfaces,
        surfaceNgrams: surfaces.map(function (s) { return ngrams(s); }),
        stems: Object.keys(stems)
      };
    });

    var idf = {};
    Object.keys(docFreq).forEach(function (s) {
      /* +1 smoothing keeps a stem present in every card at weight 0, not
       * negative, and keeps a unique stem well below infinity. */
      idf[s] = Math.log((N + 1) / (docFreq[s] + 1)) + 0.1;
    });

    entries.forEach(function (e) {
      e.maxKeywordScore = e.stems.reduce(function (sum, s) {
        return sum + (idf[s] || 0);
      }, 0);
    });

    return { entries: entries, idf: idf, size: N };
  }

  /* --------------------------------------------------------------------- */
  /* Scoring                                                              */
  /* --------------------------------------------------------------------- */

  /*
   * Fraction of this card's keyword evidence present in the query,
   * weighted by IDF. A query token counts as a hit if it begins with the
   * card's keyword stem, or the stem begins with the token — the second
   * direction catches the case where ASR drops a suffix.
   */
  function keywordScore(entry, queryTokens, idf) {
    if (!entry.maxKeywordScore) return { score: 0, hits: [] };

    var found = 0;
    var hits = [];

    entry.stems.forEach(function (stem) {
      var matched = queryTokens.some(function (tok) {
        return tok.indexOf(stem) === 0 || stem.indexOf(tok) === 0 && tok.length >= 4;
      });
      if (matched) {
        found += (idf[stem] || 0);
        hits.push(stem);
      }
    });

    return { score: found / entry.maxKeywordScore, hits: hits };
  }

  /* Best cosine across the card's surface forms. */
  function ngramScore(entry, queryNgrams) {
    var best = 0;
    for (var i = 0; i < entry.surfaceNgrams.length; i++) {
      var s = cosine(queryNgrams, entry.surfaceNgrams[i]);
      if (s > best) best = s;
    }
    return best;
  }

  /*
   * match(transcript, index) -> result
   *
   * {
   *   status: 'confident' | 'uncertain' | 'unknown',
   *   score, card, hits,
   *   alternatives: [{card, score}, ...]   // for the "did they mean" list
   * }
   */
  function match(transcript, index) {
    var queryTokens = tokenize(transcript);
    var queryNgrams = ngrams(transcript);

    if (!queryTokens.length) {
      return { status: 'unknown', score: 0, card: null, hits: [], alternatives: [] };
    }

    var scored = index.entries.map(function (entry) {
      var kw = keywordScore(entry, queryTokens, index.idf);
      var ng = ngramScore(entry, queryNgrams);
      return {
        card: entry.card,
        score: W_NGRAM * ng + W_KEYWORD * kw.score,
        ngram: ng,
        keyword: kw.score,
        hits: kw.hits
      };
    });

    scored.sort(function (a, b) { return b.score - a.score; });

    var top = scored[0];
    var status = top.score >= THRESHOLD_CONFIDENT ? 'confident'
               : top.score >= THRESHOLD_HEDGE     ? 'uncertain'
               : 'unknown';

    /*
     * Margin guard: if the runner-up is nearly as good, we are not
     * confident even if the absolute score is high. Two cards scoring 0.6
     * and 0.58 means the matcher cannot tell them apart, and at a counter
     * that ambiguity must surface rather than be resolved by a coin flip.
     */
    if (status === 'confident' && scored[1] && (top.score - scored[1].score) < 0.08) {
      status = 'uncertain';
    }

    return {
      status: status,
      score: top.score,
      ngram: top.ngram,
      keyword: top.keyword,
      card: status === 'unknown' ? null : top.card,
      hits: top.hits,
      alternatives: scored.slice(0, 3).filter(function (s) { return s.score >= 0.12; })
    };
  }

  window.AblakMatcher = {
    normalize: normalize,
    fold: fold,
    tokenize: tokenize,
    ngrams: ngrams,
    cosine: cosine,
    stemOf: stemOf,
    buildIndex: buildIndex,
    match: match,
    THRESHOLD_CONFIDENT: THRESHOLD_CONFIDENT,
    THRESHOLD_HEDGE: THRESHOLD_HEDGE
  };
})();
