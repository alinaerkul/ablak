/*
 * Ablak — matcher test suite
 * ---------------------------------------------------------------------------
 * Runs in two places with no build step and no test framework:
 *   node tests/matcher.tests.js      (terminal)
 *   open tests/index.html            (browser, same assertions)
 *
 * These tests are how the confidence thresholds in matcher.js were chosen.
 * The interesting cases are the last two groups: phrases the matcher is
 * SUPPOSED to refuse. A matcher that answers everything would pass the
 * happy-path tests and fail the product.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    /* Node: shim the browser global the source files expect, then load. */
    global.window = global.window || global;
    /* i18n touches document/localStorage only inside its functions, so it is
       safe to load headless for the data-completeness assertions below. */
    global.document = global.document || { documentElement: { setAttribute: function () {} } };
    require('../js/i18n.js');
    require('../js/phrases.js');
    require('../js/matcher.js');
    require('../js/practice.js');
    require('../js/courier.js');
    require('../js/callsim.js');
    module.exports = factory(global.window);
    if (require.main === module) module.exports.run(true);
  } else {
    root.AblakTests = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (win) {
  'use strict';

  var results = [];

  function record(name, pass, detail) {
    results.push({ name: name, pass: pass, detail: detail || '' });
  }

  function assert(name, condition, detail) {
    record(name, !!condition, detail);
  }

  function assertEqual(name, actual, expected) {
    var pass = actual === expected;
    record(name, pass, pass ? '' : 'expected ' + JSON.stringify(expected) +
                                  ', got ' + JSON.stringify(actual));
  }

  function assertClose(name, actual, expected, tolerance) {
    var pass = Math.abs(actual - expected) <= tolerance;
    record(name, pass, pass ? '' : 'expected ~' + expected + ', got ' + actual);
  }

  function run(printToConsole) {
    results = [];

    var M = win.AblakMatcher;
    var allCards = win.ABLAK_PHRASES;
    var index = M.buildIndex(allCards);

    /* ---------------------------------------------------------------- */
    /* 1. Text normalisation                                            */
    /* ---------------------------------------------------------------- */

    assertEqual('normalize strips punctuation',
      M.normalize('Kérem a lakcímkártyáját.'), 'kérem a lakcímkártyáját');

    assertEqual('normalize collapses whitespace',
      M.normalize('  Van   TAJ    kártyája?  '), 'van taj kártyája');

    assertEqual('fold removes Hungarian diacritics',
      M.fold('Kérem az útlevelét'), 'kerem az utlevelet');

    assertEqual('fold handles double acute (ő, ű)',
      M.fold('tűz őr'), 'tuz or');

    assertEqual('stem truncates to eight characters',
      M.stemOf('lakcímkártyáját'), 'lakcimka');

    assertEqual('stem separates lakcím from lakcímkártya',
      M.stemOf('lakcím') === M.stemOf('lakcímkártya'), false);

    assertEqual('stem leaves short words intact',
      M.stemOf('fáj'), 'faj');

    /* ---------------------------------------------------------------- */
    /* 2. N-gram similarity primitives                                  */
    /* ---------------------------------------------------------------- */

    var g1 = M.ngrams('lakcimkartya');
    assert('ngrams produces windows', Object.keys(g1).length > 5);

    assertClose('cosine of identical strings is 1',
      M.cosine(M.ngrams('kérem a lakcímkártyáját'),
               M.ngrams('kérem a lakcímkártyáját')), 1, 0.0001);

    assertClose('cosine of unrelated strings is near 0',
      M.cosine(M.ngrams('allergia'), M.ngrams('bankszámla')), 0, 0.25);

    assert('cosine is symmetric',
      Math.abs(
        M.cosine(M.ngrams('taj kártya'), M.ngrams('taj kártyája')) -
        M.cosine(M.ngrams('taj kártyája'), M.ngrams('taj kártya'))
      ) < 0.0001);

    assertEqual('cosine with empty input is 0',
      M.cosine(M.ngrams(''), M.ngrams('bármi')), 0);

    /* ---------------------------------------------------------------- */
    /* 3. Index construction                                            */
    /* ---------------------------------------------------------------- */

    assertEqual('index covers every card', index.size, allCards.length);

    assert('every card has a positive keyword ceiling',
      index.entries.every(function (e) { return e.maxKeywordScore > 0; }),
      'cards with no usable keywords: ' + index.entries
        .filter(function (e) { return !(e.maxKeywordScore > 0); })
        .map(function (e) { return e.card.id; }).join(', '));

    assert('card ids are unique',
      new Set(allCards.map(function (c) { return c.id; })).size === allCards.length);

    assert('every card has the required display fields',
      allCards.every(function (c) {
        return c.hu && c.ru_meaning && c.ru_action && c.reply_hu && c.reply_ru &&
               ['low', 'medium', 'high'].indexOf(c.risk) !== -1;
      }),
      'incomplete: ' + allCards.filter(function (c) {
        return !(c.hu && c.ru_meaning && c.ru_action && c.reply_hu && c.reply_ru);
      }).map(function (c) { return c.id; }).join(', '));

    /* ---------------------------------------------------------------- */
    /* 4. Exact canonical phrases must all resolve to themselves        */
    /* ---------------------------------------------------------------- */

    var exactFailures = [];
    allCards.forEach(function (card) {
      var r = M.match(card.hu, index);
      if (!r.card || r.card.id !== card.id) {
        exactFailures.push(card.id + ' -> ' + (r.card ? r.card.id : 'none') +
                           ' @' + r.score.toFixed(2));
      }
    });
    assert('all ' + allCards.length + ' canonical phrases match their own card',
      exactFailures.length === 0, exactFailures.join(' | '));

    /* ---------------------------------------------------------------- */
    /* 5. Every declared variant must resolve to its card               */
    /* ---------------------------------------------------------------- */

    var variantTotal = 0, variantFailures = [];
    allCards.forEach(function (card) {
      (card.variants || []).forEach(function (v) {
        variantTotal++;
        var r = M.match(v, index);
        if (!r.card || r.card.id !== card.id) {
          variantFailures.push('"' + v + '" -> ' + (r.card ? r.card.id : 'none'));
        }
      });
    });
    assert('all ' + variantTotal + ' variants match their own card',
      variantFailures.length === 0, variantFailures.join(' | '));

    /* ---------------------------------------------------------------- */
    /* 6. Robustness: the shapes real speech input actually takes        */
    /* ---------------------------------------------------------------- */

    var robustness = [
      /* accents dropped entirely — very common in ASR and typing */
      ['kerem a lakcimkartyajat', 'imm_address_card'],
      ['van taj kartyaja', 'clinic_taj'],
      ['kerem az utlevelet', 'imm_passport'],
      /* partial phrase: clerk trails off, or ASR truncates */
      ['lakcímkártya', 'imm_address_card'],
      ['adóazonosító jele', 'bank_tax_id'],
      ['hiánypótlás', 'imm_missing_document'],
      /* reordered / embedded in a longer sentence */
      ['holnap reggel nyolcra jöjjön vissza', 'clinic_appointment'],
      ['most akkor írja alá itt ezt a papírt', 'imm_sign_here'],
      ['szóval milyen típusú számlát szeretne', 'bank_account_type'],
      /* morphological variation not present verbatim in the corpus */
      ['az igazolását kérem az egyetemről', 'imm_student_certificate'],
      ['allergiás bármire', 'clinic_allergy'],
      /* filler words around the content, as in natural speech */
      ['hát szóval vegyen sorszámot ott', 'imm_queue_number']
    ];

    robustness.forEach(function (pair) {
      var r = M.match(pair[0], index);
      assertEqual('robust: "' + pair[0] + '"', r.card ? r.card.id : 'none', pair[1]);
    });

    /* ---------------------------------------------------------------- */
    /* 7. Refusal: the behaviour the product depends on                  */
    /* ---------------------------------------------------------------- */

    var mustRefuse = [
      'A kutyám megette a házi feladatomat.',
      'Szép idő van ma odakint, nem gondolja?',
      'asdf qwerty zxcv',
      'Melyik a kedvenc filmje?',
      ''
    ];

    mustRefuse.forEach(function (text) {
      var r = M.match(text, index);
      assertEqual('refuses out-of-domain: "' + (text || '(empty)') + '"',
        r.status, 'unknown');
    });

    /* ---------------------------------------------------------------- */
    /* 8. Scenario narrowing changes the active corpus and the IDF      */
    /* ---------------------------------------------------------------- */

    function scenarioIndex(scenario) {
      return M.buildIndex(allCards.filter(function (c) {
        return c.scenario === scenario || c.scenario === 'generic';
      }));
    }

    var bankIndex = scenarioIndex('bank');
    assert('bank index is smaller than the full corpus',
      bankIndex.size < index.size);

    assert('bank index excludes clinic cards',
      bankIndex.entries.every(function (e) { return e.card.scenario !== 'clinic'; }));

    assert('generic cards survive scenario narrowing',
      bankIndex.entries.some(function (e) { return e.card.id === 'gen_wait'; }));

    /* An ambiguous phrase inside the bank should land on a bank card. */
    var ambiguous = M.match('kérem a kártyáját', bankIndex);
    assert('ambiguous phrase resolves within the active scenario',
      !ambiguous.card || ambiguous.card.scenario === 'bank' ||
      ambiguous.card.scenario === 'generic',
      'resolved to ' + (ambiguous.card ? ambiguous.card.id : 'none'));

    /* ---------------------------------------------------------------- */
    /* 9. Confidence must be ordered, not just thresholded              */
    /* ---------------------------------------------------------------- */

    var exact = M.match('Kérem a lakcímkártyáját.', index);
    var partial = M.match('lakcímkártya', index);
    var noise = M.match('Szép idő van ma.', index);

    assert('exact scores above partial',
      exact.score > partial.score,
      exact.score.toFixed(2) + ' vs ' + partial.score.toFixed(2));

    assert('partial scores above noise',
      partial.score > noise.score,
      partial.score.toFixed(2) + ' vs ' + noise.score.toFixed(2));

    assertEqual('exact match is reported confident', exact.status, 'confident');

    /* ---------------------------------------------------------------- */
    /* 10. Margin guard: near-ties are never reported as confident      */
    /* ---------------------------------------------------------------- */

    var tieIndex = M.buildIndex([
      {
        id: 'a', scenario: 'generic', hu: 'Kérem az aláírását.',
        variants: [], keywords: ['aláírását'],
        ru_meaning: 'm', ru_action: 'a', reply_hu: 'r', reply_ru: 'r', risk: 'low'
      },
      {
        id: 'b', scenario: 'generic', hu: 'Kérem az aláírását itt.',
        variants: [], keywords: ['aláírását'],
        ru_meaning: 'm', ru_action: 'a', reply_hu: 'r', reply_ru: 'r', risk: 'low'
      }
    ]);
    var tie = M.match('kérem az aláírását', tieIndex);
    assertEqual('indistinguishable cards downgrade to uncertain', tie.status, 'uncertain');

    /* ---------------------------------------------------------------- */
    /* 11. Bilingual completeness                                       */
    /* ---------------------------------------------------------------- */

    /* A card missing an English field renders as a blank panel rather than
       an error, so only a test catches it. */
    var missingEn = allCards.filter(function (c) {
      return !c.en_meaning || !c.en_action || !c.reply_en;
    }).map(function (c) { return c.id; });
    assert('every card has English meaning, action and reply',
      missingEn.length === 0, missingEn.join(', '));

    var missingRu = allCards.filter(function (c) {
      return !c.ru_meaning || !c.ru_action || !c.reply_ru;
    }).map(function (c) { return c.id; });
    assert('every card has Russian meaning, action and reply',
      missingRu.length === 0, missingRu.join(', '));

    /* A document instruction must exist in both languages or neither: a
       card that names a document in one language and not the other would
       silently drop the single most important instruction. */
    var docMismatch = allCards.filter(function (c) {
      return (!!c.ru_doc) !== (!!c.en_doc);
    }).map(function (c) { return c.id; });
    assert('document instructions are present in both languages or neither',
      docMismatch.length === 0, docMismatch.join(', '));

    assert('say-bank entries are bilingual',
      win.ABLAK_SAY.every(function (p) { return p.label && p.label_en && p.ru && p.en; }));

    /* The two UI string tables must have identical key sets, or switching
       language leaves raw keys on screen. */
    if (win.AblakI18n) {
      var I = win.AblakI18n;
      var langs = I.available();
      assert('at least two interface languages', langs.length >= 2, langs.join(','));

      var keysByLang = langs.map(function (lang) {
        I.set(lang);
        /* t() falls back to the key itself, so probe with a known key set
           gathered from the default language. */
        return lang;
      });

      I.set('en');
      var sample = ['app.tagline', 'mic.start', 'result.meaning', 'badge.confident',
                    'settings.save', 'history.empty', 'unknown.action'];
      var enMissing = sample.filter(function (k) { return I.t(k) === k; });
      assert('English table resolves core keys', enMissing.length === 0, enMissing.join(', '));

      I.set('ru');
      var ruMissing = sample.filter(function (k) { return I.t(k) === k; });
      assert('Russian table resolves core keys', ruMissing.length === 0, ruMissing.join(', '));

      /* card() resolves per active language */
      var probe = allCards[0];
      I.set('en');
      assertEqual('card() resolves English', I.card(probe, 'meaning'), probe.en_meaning);
      I.set('ru');
      assertEqual('card() resolves Russian', I.card(probe, 'meaning'), probe.ru_meaning);
      I.set('en');
    }

    /* ---------------------------------------------------------------- */
    /* 12. The user-initiated phrase bank                               */
    /* ---------------------------------------------------------------- */

    assert('say-bank entries are complete',
      win.ABLAK_SAY.every(function (p) { return p.id && p.label && p.hu && p.ru; }));

    assert('say-bank ids are unique',
      new Set(win.ABLAK_SAY.map(function (p) { return p.id; })).size === win.ABLAK_SAY.length);

    /* ---------------------------------------------------------------- */
    /* 13. Booking practice scripts                                     */
    /* ---------------------------------------------------------------- */

    var PR = win.AblakPractice;
    assert('practice module loaded with scenarios', PR && PR.SCENARIOS.length >= 5);

    if (PR) {
      PR.SCENARIOS.forEach(function (sc) {
        var ids = sc.steps.map(function (s) { return s.id; });
        var tag = 'practice[' + sc.id + ']';

        assert(tag + ' step ids are unique',
          new Set(ids).size === ids.length);

        assert(tag + ' every option leads to an existing step',
          sc.steps.every(function (s) {
            return s.options.every(function (o) { return ids.indexOf(o.next) !== -1; });
          }));

        assert(tag + ' only end steps have no options',
          sc.steps.every(function (s) { return s.end === (s.options.length === 0); }));

        assert(tag + ' every line is bilingual',
          sc.steps.every(function (s) {
            return s.clerk.hu && s.clerk.en && s.clerk.ru && s.options.every(function (o) {
              return o.hu && o.en && o.ru;
            });
          }));

        /* every step is reachable from the start */
        var seen = {}, queue = [sc.start];
        while (queue.length) {
          var id = queue.pop();
          if (seen[id]) continue;
          seen[id] = true;
          sc.steps.forEach(function (s) {
            if (s.id === id) s.options.forEach(function (o) { queue.push(o.next); });
          });
        }
        assert(tag + ' has no unreachable steps',
          ids.every(function (i) { return seen[i]; }),
          ids.filter(function (i) { return !seen[i]; }).join(', '));

        /* Typing an option's own Hungarian must select that option, not a sibling. */
        var confused = [];
        sc.steps.forEach(function (s) {
          s.options.forEach(function (o) {
            var got = PR.matchOption(s, o.hu);
            if (got !== o) confused.push(s.id + ': ' + o.hu);
          });
        });
        assert(tag + ' each reply resolves to itself', confused.length === 0, confused.join(' | '));

        /* Every option of every step can be walked to a finish. */
        var stuck = [];
        sc.steps.forEach(function (s) {
          s.options.forEach(function (o, idx) {
            var session = PR.start(sc.id);
            session.stepId = s.id;
            PR.choose(session, idx);
            var guard = 0;
            while (!session.done && guard++ < 30) PR.choose(session, 0);
            if (!session.done) stuck.push(s.id + '#' + idx);
          });
        });
        assert(tag + ' every path reaches the end', stuck.length === 0, stuck.join(', '));
      });

      var doc = PR.start('doctor');
      PR.say(doc, 'Időpontot szeretnék kérni.');
      assert('practice: spoken answer advances the call', doc.stepId === 'd_problem');

      var before = doc.stepId;
      var miss = PR.say(doc, 'A kutyám megette a házi feladatomat.');
      assert('practice: unrelated answer is not accepted',
        !miss.matched && miss.unclear && doc.stepId === before && doc.misses === 1);

      var tajStep = PR.start('doctor');
      tajStep.stepId = 'd_taj';
      PR.say(tajStep, 'Nincs, külföldi vagyok');
      assert('practice: "no" branches to the paying path', tajStep.stepId === 'd_pay');

      var accents = PR.start('cafe');
      PR.say(accents, 'asztalt szeretnek foglalni');
      assert('practice: accent-free answers are understood', accents.stepId === 'c_when');

      var exact = PR.start('cafe');
      exact.stepId = 'c_when';
      var r = PR.say(exact, 'majd');
      assert('practice: exact-token keys do not match prefixes', !r.matched);

      var nameStep = PR.start('cafe');
      nameStep.stepId = 'c_name';
      assert('practice: a name is accepted as a free answer',
        PR.say(nameStep, 'Kovács Anna').matched && nameStep.stepId === 'c_spell');
    }

    /* ---------------------------------------------------------------- */
    /* 14. Courier card                                                 */
    /* ---------------------------------------------------------------- */

    var CC = win.AblakCourier;
    assert('courier module loaded', CC && CC.PHRASES.length >= 6);
    if (CC) {
      assert('courier phrases are bilingual',
        CC.PHRASES.every(function (p) { return p.hu && p.en && p.ru; }));
      assert('courier: empty street builds nothing', CC.buildAddress({ street: '  ' }) === '');
      assert('courier: full address sentence',
        CC.buildAddress({ street: 'Példa utca 10.', floor: '3', door: '5', code: '1234' }) ===
        'A címem: Példa utca 10. 3. emelet. 5. ajtó. A kapukód: 1234.');
      assert('courier: optional fields are skipped',
        CC.buildAddress({ street: 'Példa utca 10' }) === 'A címem: Példa utca 10.');
    }

    /* ---------------------------------------------------------------- */
    /* 15. Call simulator                                               */
    /* ---------------------------------------------------------------- */

    var CS = win.AblakCallSim;
    assert('call simulator loaded with scenarios', CS && CS.SCENARIOS.length >= 3);

    if (CS) {
      var AI_WORD = /mesters.ges intelligencia/i;

      CS.SCENARIOS.forEach(function (sc) {
        var tag = 'callsim[' + sc.id + ']';

        /* Walk every combination of choices the user could make. */
        var paths = [[0], [1], [0, 0], [1, 1]];
        var runs = paths.map(function (p) { return CS.playThrough(sc.id, {}, p); });

        assert(tag + ' every path ends with an outcome',
          runs.every(function (r) { return r.outcome && r.outcome.title && r.outcome.details.length; }));

        assert(tag + ' every spoken line is trilingual',
          runs.every(function (r) {
            return r.lines.every(function (l) { return l.hu && l.en && l.ru; });
          }));

        /* The first thing the agent says must disclose that it is an AI. */
        assert(tag + ' agent discloses it is an AI first',
          runs.every(function (r) {
            var first = r.lines.filter(function (l) { return l.who === 'agent'; })[0];
            return first && AI_WORD.test(first.hu);
          }));

        /* The agent never speaks before the venue picks up. */
        assert(tag + ' venue answers first',
          runs.every(function (r) { return r.lines[0].who === 'venue'; }));

        /* Every pause is a real choice: at least one option. */
        var s = CS.start(sc.id, {}), asks = 0, n;
        while ((n = s.next()) || s.isPaused()) {
          if (n && n.ask) { asks++; assert(tag + ' pause has options', n.ask.options.length >= 1); s.answer(0); }
          if (!n && !s.isPaused()) break;
        }
        assert(tag + ' pauses for the user at least once', asks >= 1);
      });

      /* Safety properties, per scenario. */
      var docRun = CS.playThrough('doctor', {}, [0]);
      assert('callsim: agent never says a TAJ number',
        docRun.lines.filter(function (l) { return l.who === 'agent'; })
          .every(function (l) { return !/\d{3}/.test(l.hu); }));
      assert('callsim: TAJ request ends in a handover',
        docRun.outcome.status === 'handover');

      var noShare = CS.playThrough('courier', { code: '4471' }, [1]);
      assert('callsim: gate code is not spoken unless the user shares it',
        noShare.lines.every(function (l) { return l.hu.indexOf('4471') === -1; }));
      var shared = CS.playThrough('courier', { code: '4471' }, [0]);
      assert('callsim: gate code is spoken when the user chooses to share it',
        shared.lines.some(function (l) { return l.who === 'agent' && l.hu.indexOf('4471') !== -1; }));

      var declined = CS.playThrough('cafe', { full: true }, [1]);
      assert('callsim: a new time is not accepted unless the user accepts',
        declined.outcome.status === 'declined' &&
        !declined.lines.some(function (l) { return /megfelel\./.test(l.hu) && l.who === 'agent'; }));
      var accepted = CS.playThrough('cafe', { full: true }, [0]);
      assert('callsim: accepted new time books the table', accepted.outcome.status === 'done');
      var open = CS.playThrough('cafe', { full: false }, []);
      assert('callsim: a free table books without asking', open.outcome.status === 'done');
    }

    /* ---------------------------------------------------------------- */
    /* Summary                                                          */
    /* ---------------------------------------------------------------- */

    var passed = results.filter(function (r) { return r.pass; }).length;
    var failed = results.length - passed;

    if (printToConsole) {
      results.forEach(function (r) {
        if (!r.pass) console.log('  FAIL  ' + r.name + (r.detail ? '\n          ' + r.detail : ''));
      });
      console.log('\n' + passed + ' passed, ' + failed + ' failed, ' +
                  results.length + ' total\n');
      if (typeof process !== 'undefined' && failed > 0) process.exitCode = 1;
    }

    return { results: results, passed: passed, failed: failed };
  }

  return { run: run };
});
