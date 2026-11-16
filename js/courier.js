/*
 * Ablak — courier card
 * ---------------------------------------------------------------------------
 * A delivery person is the shortest conversation in the product, and the one
 * where a phone call is most often unnecessary: they need an address, a floor,
 * a door and a gate code, and a few fixed sentences. This builds the address
 * sentence in Hungarian and speaks it; the phrases are fixed and written once.
 *
 * Nothing is stored. A gate code is sensitive and the card has no reason to
 * outlive the page.
 */

(function () {
  'use strict';

  var PHRASES = [
    { hu: 'Mindjárt lemegyek.', en: 'I am coming down now.', ru: 'Сейчас спущусь.' },
    { hu: 'Kérem, hívjon fel, ha megérkezett.', en: 'Please call me when you arrive.', ru: 'Позвоните мне, пожалуйста, когда приедете.' },
    { hu: 'Kérem, csengessen.', en: 'Please ring the bell.', ru: 'Позвоните, пожалуйста, в звонок.' },
    { hu: 'Kérem, hagyja a csomagot az ajtó előtt.', en: 'Please leave the package at the door.', ru: 'Оставьте, пожалуйста, посылку у двери.' },
    { hu: 'Most nem vagyok otthon, tíz perc múlva érek vissza.', en: 'I am not home right now; I will be back in ten minutes.', ru: 'Сейчас меня нет дома, вернусь через десять минут.' },
    { hu: 'A bejárat az udvar felől van.', en: 'The entrance is from the courtyard side.', ru: 'Вход со стороны двора.' },
    { hu: 'Nem beszélek jól magyarul. Kérem, beszéljen lassabban.', en: 'I do not speak Hungarian well. Please speak more slowly.', ru: 'Я плохо говорю по-венгерски. Говорите, пожалуйста, медленнее.' },
    { hu: 'Köszönöm szépen, viszontlátásra!', en: 'Thank you very much, goodbye!', ru: 'Большое спасибо, до свидания!' }
  ];

  /* Pure: builds the Hungarian address sentence from the fields. Exposed so
   * the test suite can check it without a DOM. Fields are plain text from the
   * user and are never altered beyond trimming. */
  function buildAddress(f) {
    var street = (f.street || '').trim();
    if (!street) return '';
    var parts = ['A címem: ' + street.replace(/\.*$/, '') + '.'];
    var floor = (f.floor || '').trim();
    var door = (f.door || '').trim();
    var code = (f.code || '').trim();
    if (floor) parts.push(floor + '. emelet.');
    if (door) parts.push(door + '. ajtó.');
    if (code) parts.push('A kapukód: ' + code + '.');
    return parts.join(' ');
  }

  window.AblakCourier = { PHRASES: PHRASES, buildAddress: buildAddress };

  if (typeof document === 'undefined' || !document.getElementById ||
      !document.getElementById('courier-panel')) return;

  var I18n = window.AblakI18n;
  var speaker = new window.AblakSpeech.Speaker();
  var $ = function (id) { return document.getElementById(id); };
  var T = I18n.t;

  function rate() {
    var r = parseFloat(($('rate-range') || {}).value);
    return isNaN(r) ? 0.92 : r;
  }
  function speak(text) { return speaker.speak(text, 'hu-HU', { rate: rate() }); }
  function gloss(p) { return I18n.get() === 'ru' ? p.ru : p.en; }
  function val(id) { return $(id).value.trim(); }

  function floorDoor() {
    var parts = [];
    if (val('courier-floor')) parts.push(T('courier.floor') + ' ' + val('courier-floor'));
    if (val('courier-door')) parts.push(T('courier.door') + ' ' + val('courier-door'));
    return parts.join(' · ');
  }

  /* What gets copied or shown. The gate code is deliberately left out of the
   * card and the clipboard: it is only ever said aloud, by choice. */
  function plainText() {
    return [val('courier-name'), val('courier-street'), floorDoor(), val('courier-phone')]
      .filter(Boolean).join('\n');
  }

  function renderCard() {
    var street = val('courier-street');
    var hu = buildAddress({
      street: street, floor: val('courier-floor'),
      door: val('courier-door'), code: val('courier-code')
    });
    $('courier-card').hidden = !street;
    $('courier-empty').hidden = !!street;
    $('courier-name-label').textContent = val('courier-name') ? T('courier.name') + ': ' + val('courier-name') : '';
    $('courier-addr').textContent = street;
    $('courier-sub').textContent = floorDoor();
    $('courier-phone-out').textContent = val('courier-phone') ? T('courier.phone') + ': ' + val('courier-phone') : '';
    $('courier-hu').textContent = hu;
  }

  function renderPhrases() {
    var root = $('courier-phrases');
    root.innerHTML = '';
    PHRASES.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'say-btn';
      var s = document.createElement('span');
      s.textContent = p.hu;
      s.setAttribute('lang', 'hu');
      var small = document.createElement('small');
      small.textContent = gloss(p);
      var tag = document.createElement('em');
      tag.className = 'speak-tag';
      tag.textContent = '🔊 ' + T('phrase.speak');
      b.appendChild(s);
      b.appendChild(small);
      b.appendChild(tag);
      b.addEventListener('click', function () { speak(p.hu); });
      root.appendChild(b);
    });
  }

  ['courier-name', 'courier-street', 'courier-floor', 'courier-door', 'courier-phone', 'courier-code'].forEach(function (id) {
    $(id).addEventListener('input', renderCard);
  });
  $('courier-speak').addEventListener('click', function () { speak($('courier-hu').textContent); });

  $('courier-copy').addEventListener('click', function () {
    var btn = this;
    var text = plainText();
    function done() {
      var old = btn.textContent;
      btn.textContent = T('courier.copied');
      setTimeout(function () { btn.textContent = T('courier.copy'); }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
  });

  function rerender() { renderPhrases(); renderCard(); }
  renderPhrases();
  renderCard();
  window.AblakCourier.rerender = rerender;
})();
