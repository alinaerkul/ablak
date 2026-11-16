/*
 * Ablak — call simulator
 * ---------------------------------------------------------------------------
 * A rehearsed phone call, played in the browser. The user fills in a few
 * details; an agent "phones" a simulated venue and speaks Hungarian on the
 * user's behalf; the venue's replies are scripted. No network, no telephony,
 * no model.
 *
 * It exists to show the design of the real thing, not to fake one:
 *   - The agent says first that it is an AI assistant.
 *   - It never agrees to anything the user has not decided. When the venue
 *     offers something new (a different time, a gate code, a question about
 *     a health-insurance number) the call PAUSES and the user chooses.
 *   - It never gives identity or health numbers. That moment hands the call
 *     back to the human.
 * The same scripts could later drive a real call, with a model used only to
 * classify what the other side said — never to write the agent's lines.
 *
 * Engine:  AblakCallSim.start(id, slots) -> session; session.next() returns
 *          the next node or null; session.answer(i) resolves a pause.
 *          Pure functions, no DOM. UI attaches only if #sim-panel exists.
 */

(function () {
  'use strict';

  function L(hu, en, ru) { return { hu: hu, en: en, ru: ru }; }
  function who(w, line) { return { who: w, hu: line.hu, en: line.en, ru: line.ru }; }
  function agent(hu, en, ru) { return who('agent', L(hu, en, ru)); }
  function venue(hu, en, ru) { return who('venue', L(hu, en, ru)); }

  var DAYS = {
    today:    { hu: 'ma', en: 'today', ru: 'сегодня' },
    tomorrow: { hu: 'holnap', en: 'tomorrow', ru: 'завтра' },
    saturday: { hu: 'szombaton', en: 'on Saturday', ru: 'в субботу' }
  };

  function nameOf(slots) {
    return (slots.name || '').trim() || 'az ügyfelem';
  }

  function disclosure(slots, verb) {
    var n = nameOf(slots);
    return agent(
      'Jó napot kívánok! Mesterséges intelligencia asszisztens vagyok, ' + n + ' nevében ' + verb + '.',
      'Good day! I am an AI assistant, ' + verb.replace('telefonálok', 'calling').replace('hívom', 'calling') + ' on behalf of ' + n + '.',
      'Добрый день! Я ИИ-ассистент и звоню от имени ' + n + '.');
  }

  var HOLD = agent('Egy pillanat, megkérdezem az ügyfelemet.',
                   'One moment, I will ask my client.',
                   'Одну минуту, я уточню у клиента.');

  /* ------------------------------------------------------------------ */
  /* Scenarios. A script is a function from the user's details to nodes. */
  /* Node kinds: a spoken line {who}, a pause {ask}, a result {outcome}. */
  /* ------------------------------------------------------------------ */

  var SCENARIOS = [
    {
      id: 'cafe',
      title: { en: 'Book a table at a café', ru: 'Забронировать столик в кафе' },
      intro: { en: 'The agent phones a café and books a table. Turn on "venue is full" to see it ask you before accepting a new time.',
               ru: 'Агент звонит в кафе и бронирует столик. Включите «нет мест», чтобы увидеть, как он спросит вас перед тем, как принять другое время.' },
      fields: [
        { id: 'name', type: 'text', label: { en: 'Name for the booking', ru: 'Имя для брони' }, value: 'Alina' },
        { id: 'day', type: 'select', label: { en: 'Day', ru: 'День' }, value: 'tomorrow',
          options: [['today', { en: 'Today', ru: 'Сегодня' }], ['tomorrow', { en: 'Tomorrow', ru: 'Завтра' }], ['saturday', { en: 'Saturday', ru: 'Суббота' }]] },
        { id: 'hour', type: 'select', label: { en: 'Time', ru: 'Время' }, value: '19',
          options: [['18', { en: '18:00', ru: '18:00' }], ['19', { en: '19:00', ru: '19:00' }], ['20', { en: '20:00', ru: '20:00' }]] },
        { id: 'people', type: 'select', label: { en: 'People', ru: 'Человек' }, value: '2',
          options: [['1', { en: '1', ru: '1' }], ['2', { en: '2', ru: '2' }], ['4', { en: '4', ru: '4' }], ['6', { en: '6', ru: '6' }]] },
        { id: 'full', type: 'checkbox', label: { en: 'Simulate: the café is full at that time', ru: 'Имитация: в это время мест нет' }, value: true }
      ],
      script: function (s) {
        var day = DAYS[s.day] || DAYS.tomorrow;
        var hour = s.hour || '19';
        var n = String(s.people || '2');
        var name = nameOf(s);

        var tail = [
          venue('Milyen névre foglaljam?', 'Under what name shall I book it?', 'На какое имя записать?'),
          agent(name + '.', name + '.', name + '.'),
          venue('Rendben, lefoglaltam az asztalt. Viszontlátásra!', 'Fine, the table is booked. Goodbye!', 'Хорошо, столик забронирован. До свидания!'),
          agent('Köszönöm, viszontlátásra!', 'Thank you, goodbye!', 'Спасибо, до свидания!'),
          { outcome: { status: 'done',
            title: { en: 'Table booked', ru: 'Столик забронирован' },
            details: [
              { en: day.en + ' at ' + hour + ':00 (or as agreed), for ' + n + ' people', ru: day.ru + ' в ' + hour + ':00 (или как договорились), на ' + n + ' чел.' },
              { en: 'Name: ' + name, ru: 'Имя: ' + name }
            ] } }
        ];

        var nodes = [
          venue('Kávéház, jó napot kívánok!', 'Café, good day!', 'Кафе, добрый день!'),
          disclosure(s, 'telefonálok'),
          agent('Asztalt szeretnék foglalni ' + day.hu + ' ' + hour + ' órára, ' + n + ' főre.',
                'I would like to book a table ' + day.en + ' for ' + hour + ':00, for ' + n + ' people.',
                'Я хотела бы забронировать столик ' + day.ru + ' на ' + hour + ':00, на ' + n + ' чел.')
        ];

        if (s.full) {
          nodes.push(
            venue('Sajnos akkorra már nincs szabad asztalunk. Fél órával később megfelel?',
                  'Sorry, we have no free table then. Would half an hour later suit you?',
                  'К сожалению, на это время мест нет. Подойдёт на полчаса позже?'),
            HOLD,
            { ask: {
              prompt: { en: 'The café offers a time half an hour later. The agent will not accept for you.',
                        ru: 'Кафе предлагает время на полчаса позже. Агент не примет за вас.' },
              options: [
                { label: { en: 'Accept the later time', ru: 'Принять время позже' },
                  then: [agent('Igen, a fél órával későbbi időpont megfelel.', 'Yes, half an hour later suits us.', 'Да, время на полчаса позже подходит.')].concat(tail) },
                { label: { en: 'No, do not book', ru: 'Нет, не бронировать' },
                  then: [
                    agent('Köszönöm, akkor most nem foglalunk. Viszontlátásra!', 'Thank you, then we will not book now. Goodbye!', 'Спасибо, тогда сейчас не бронируем. До свидания!'),
                    { outcome: { status: 'declined', title: { en: 'Nothing booked', ru: 'Ничего не забронировано' },
                      details: [{ en: 'You declined the later time, so the agent ended the call.', ru: 'Вы отказались от другого времени, и агент завершил звонок.' }] } }
                  ] }
              ] } }
          );
          return nodes;
        }
        nodes.push(venue('Rendben, van szabad asztal.', 'Fine, there is a free table.', 'Хорошо, есть свободный столик.'));
        return nodes.concat(tail);
      }
    },
    {
      id: 'courier',
      title: { en: 'Tell a courier where you are', ru: 'Объяснить курьеру, где вы' },
      intro: { en: 'A courier cannot find the entrance. The agent gives your address, and asks you before it says the gate code.',
               ru: 'Курьер не может найти вход. Агент называет адрес и спрашивает вас, прежде чем назвать код домофона.' },
      fields: [
        { id: 'name', type: 'text', label: { en: 'Your name', ru: 'Ваше имя' }, value: 'Alina' },
        { id: 'street', type: 'text', label: { en: 'Street and number', ru: 'Улица и номер' }, value: 'Példa utca 10.' },
        { id: 'floor', type: 'text', label: { en: 'Floor', ru: 'Этаж' }, value: '3' },
        { id: 'door', type: 'text', label: { en: 'Door', ru: 'Квартира' }, value: '5' },
        { id: 'code', type: 'text', label: { en: 'Gate code (optional)', ru: 'Код домофона (необязательно)' }, value: '1234' }
      ],
      script: function (s) {
        var C = window.AblakCourier;
        /* The address sentence must NOT carry the gate code: that is a separate
         * decision the user makes later. buildAddress adds it when present. */
        var address = C ? C.buildAddress({ street: s.street, floor: s.floor, door: s.door }) : '';
        var code = (s.code || '').trim();
        var close = [
          venue('Rendben, itt várok.', 'Fine, I will wait here.', 'Хорошо, я жду здесь.'),
          agent('Köszönöm, mindjárt lejön.', 'Thank you, they will be down shortly.', 'Спасибо, сейчас спустятся.')
        ];

        var options = [];
        if (code) {
          options.push({ label: { en: 'Share the gate code', ru: 'Назвать код' },
            then: [agent('A kapukód: ' + code + '.', 'The gate code is ' + code + '.', 'Код домофона: ' + code + '.')].concat(close, [
              { outcome: { status: 'done', title: { en: 'Courier informed', ru: 'Курьер проинформирован' },
                details: [{ en: 'Address and gate code given, because you chose to share it.', ru: 'Адрес и код названы, потому что вы решили их сообщить.' }] } }]) });
        }
        options.push({ label: { en: 'Do not share the code', ru: 'Не называть код' },
          then: [agent('A kódot nem adhatom meg, de az ügyfelem mindjárt lejön és beengedi.',
                       'I cannot give the code, but my client will come down and let you in.',
                       'Я не могу назвать код, но клиент сейчас спустится и впустит вас.')].concat(close, [
            { outcome: { status: 'done', title: { en: 'Courier informed', ru: 'Курьер проинформирован' },
              details: [{ en: 'Address given. The gate code was not shared.', ru: 'Адрес назван. Код домофона не сообщали.' }] } }]) });

        return [
          venue('Halló, itt a futár. Megérkeztem, de nem találom a bejáratot.',
                'Hello, this is the courier. I have arrived but cannot find the entrance.',
                'Алло, это курьер. Я приехал, но не могу найти вход.'),
          disclosure(s, 'hívom'),
          agent(address || 'Kérem, várjon, mindjárt lemegyek.',
                address ? 'My client\'s address: ' + [s.street, s.floor && (s.floor + 'th floor'), s.door && ('door ' + s.door)].filter(Boolean).join(', ') + '.' : 'Please wait, my client will come down shortly.',
                address ? 'Адрес клиента: ' + [s.street, s.floor && (s.floor + ' этаж'), s.door && ('кв. ' + s.door)].filter(Boolean).join(', ') + '.' : 'Подождите, клиент скоро спустится.'),
          venue('Rendben. Mi a kapukód?', 'Fine. What is the gate code?', 'Хорошо. Какой код домофона?'),
          HOLD,
          { ask: { prompt: { en: 'The courier asks for the gate code. The agent will not decide for you.',
                             ru: 'Курьер просит код домофона. Агент не решит за вас.' },
                   options: options } }
        ];
      }
    },
    {
      id: 'doctor',
      title: { en: 'Book a doctor\'s appointment', ru: 'Записаться к врачу' },
      intro: { en: 'The agent phones a clinic. When the clinic asks for a health-insurance number, the agent stops and hands the call back to you.',
               ru: 'Агент звонит в клинику. Когда клиника просит номер медицинской страховки, агент останавливается и передаёт звонок вам.' },
      fields: [
        { id: 'name', type: 'text', label: { en: 'Your name', ru: 'Ваше имя' }, value: 'Alina' },
        { id: 'reason', type: 'select', label: { en: 'Reason', ru: 'Причина' }, value: 'cough',
          options: [['cough', { en: 'Cough and sore throat', ru: 'Кашель и боль в горле' }], ['checkup', { en: 'General check-up', ru: 'Общий осмотр' }]] }
      ],
      script: function (s) {
        var cough = s.reason !== 'checkup';
        return [
          venue('Rendelő, jó napot kívánok!', 'Clinic, good day!', 'Приёмная, добрый день!'),
          disclosure(s, 'telefonálok'),
          agent('Időpontot szeretnék kérni ' + nameOf(s) + ' nevében ' + (cough ? 'köhögés miatt.' : 'általános ellenőrzésre.'),
                'I would like to book an appointment for ' + nameOf(s) + ' ' + (cough ? 'because of a cough.' : 'for a general check-up.'),
                'Я хотела бы записать ' + nameOf(s) + ' на приём ' + (cough ? 'из-за кашля.' : 'на общий осмотр.')),
          venue('Rendben. Kérem a TAJ-számát.', 'Fine. I need the TAJ number, please.', 'Хорошо. Мне нужен номер TAJ.'),
          agent('Egy pillanat.', 'One moment.', 'Одну минуту.'),
          { ask: { prompt: { en: 'The clinic asks for your TAJ (health-insurance) number. The agent never gives identity or health numbers.',
                             ru: 'Клиника просит номер TAJ (медицинской страховки). Агент никогда не называет личные и медицинские номера.' },
                   options: [
            { label: { en: 'I will give it myself', ru: 'Я назову его сама' },
              then: [
                agent('Ezt az adatot az ügyfelem személyesen adja meg. Átadom neki a telefont.',
                      'My client gives this information personally. I am handing over the phone.',
                      'Эти данные клиент сообщает лично. Передаю ему телефон.'),
                { outcome: { status: 'handover', title: { en: 'Your turn: the call is handed to you', ru: 'Ваша очередь: звонок передан вам' },
                  details: [{ en: 'The agent did not say any health-insurance number.', ru: 'Агент не называл номер медицинской страховки.' },
                            { en: 'Reason given: ' + (cough ? 'cough and sore throat' : 'general check-up'), ru: 'Причина: ' + (cough ? 'кашель и боль в горле' : 'общий осмотр') }] } }
              ] },
            { label: { en: 'Cancel the call', ru: 'Отменить звонок' },
              then: [
                agent('Köszönöm, akkor most nem foglalunk. Viszontlátásra!', 'Thank you, we will not book now. Goodbye!', 'Спасибо, сейчас не записываемся. До свидания!'),
                { outcome: { status: 'declined', title: { en: 'Call cancelled', ru: 'Звонок отменён' },
                  details: [{ en: 'Nothing was booked and no personal data was given.', ru: 'Ничего не забронировано, личные данные не передавались.' }] } }
              ] }
          ] } }
        ];
      }
    }
  ];

  /* ------------------------------------------------------------------ */
  /* Engine                                                             */
  /* ------------------------------------------------------------------ */

  function scenarioById(id) {
    for (var i = 0; i < SCENARIOS.length; i++) if (SCENARIOS[i].id === id) return SCENARIOS[i];
    return null;
  }

  function defaults(scenario) {
    var out = {};
    scenario.fields.forEach(function (f) { out[f.id] = f.value; });
    return out;
  }

  function start(id, slots) {
    var scenario = scenarioById(id);
    if (!scenario) return null;
    var merged = defaults(scenario);
    Object.keys(slots || {}).forEach(function (k) { merged[k] = slots[k]; });
    var queue = scenario.script(merged).slice();
    var pending = null;
    var session = {
      scenario: scenario,
      slots: merged,
      outcome: null,
      /* The next node to play, or null when finished or paused. A pause
       * returns its ask node once; the call then waits for answer(). */
      next: function () {
        if (pending || session.outcome) return null;
        var node = queue.shift();
        if (!node) return null;
        if (node.ask) { pending = node.ask; return node; }
        if (node.outcome) { session.outcome = node.outcome; }
        return node;
      },
      answer: function (i) {
        if (!pending || !pending.options[i]) return false;
        queue = pending.options[i].then.slice().concat(queue);
        pending = null;
        return true;
      },
      isPaused: function () { return !!pending; }
    };
    return session;
  }

  /* Plays a session to the end, picking option `pick` at every pause.
   * Used by the tests to walk every path. */
  function playThrough(id, slots, picks) {
    var s = start(id, slots), lines = [], p = 0, guard = 0;
    while (guard++ < 200) {
      var node = s.next();
      if (!node) {
        if (s.isPaused()) { s.answer((picks || [])[p++] || 0); continue; }
        break;
      }
      if (node.who) lines.push(node);
    }
    return { lines: lines, outcome: s.outcome };
  }

  window.AblakCallSim = {
    SCENARIOS: SCENARIOS,
    start: start,
    playThrough: playThrough
  };

  /* ------------------------------------------------------------------ */
  /* UI — attaches only if the page has the panel                       */
  /* ------------------------------------------------------------------ */

  if (typeof document === 'undefined' || !document.getElementById ||
      !document.getElementById('sim-panel')) return;

  var I18n = window.AblakI18n;
  var speaker = new window.AblakSpeech.Speaker();
  var $ = function (id) { return document.getElementById(id); };

  var STR = {
    title:   { en: 'Call simulator (demo)', ru: 'Симулятор звонка (демо)' },
    hint:    { en: 'See how an agent could phone on your behalf. The venue is simulated: no real call is made and nothing leaves your device.',
               ru: 'Посмотрите, как агент мог бы звонить за вас. Заведение имитируется: настоящий звонок не совершается, ничего не покидает устройство.' },
    start:   { en: 'Start call', ru: 'Начать звонок' },
    again:   { en: 'Run again', ru: 'Ещё раз' },
    mute:    { en: 'Mute voices (text only)', ru: 'Без голоса (только текст)' },
    agent:   { en: 'Agent', ru: 'Агент' },
    venue:   { en: 'Venue', ru: 'Заведение' },
    decide:  { en: 'Your decision', ru: 'Ваше решение' },
    result:  { en: 'Result', ru: 'Итог' },
    badge:   { en: 'Simulation', ru: 'Симуляция' },
    badgeText: { en: 'No real call is made. The venue is simulated and nothing leaves your device.', ru: 'Настоящий звонок не совершается. Заведение имитируется, ничего не покидает устройство.' },
    end:     { en: 'End call', ru: 'Завершить звонок' },
    st: {
      idle:    { en: 'Ready', ru: 'Готово' },
      ringing: { en: 'Ringing…', ru: 'Идут гудки…' },
      live:    { en: 'Connected', ru: 'Соединено' },
      waiting: { en: 'Waiting for your decision', ru: 'Ждёт вашего решения' },
      ended:   { en: 'Call ended', ru: 'Звонок завершён' }
    },
    never:   { en: 'The agent always says it is an AI, never accepts a change for you, and never gives ID or health numbers.',
               ru: 'Агент всегда говорит, что он ИИ, никогда не принимает изменения за вас и не называет личные и медицинские номера.' }
  };
  function g(o) { return I18n.get() === 'ru' ? o.ru : o.en; }

  var current = null;   /* scenario id selected */
  var started = false;  /* a call has been run since the scenario was chosen */
  var statusKey = 'idle';

  function setStatus(key) {
    statusKey = key;
    $('sim-status').textContent = g(STR.st[key]);
    $('sim-dot').className = 'dot' + (key === 'live' ? ' is-live' : key === 'ringing' || key === 'waiting' ? ' is-thinking' : '');
    $('sim-end').hidden = !(key === 'ringing' || key === 'live' || key === 'waiting');
  }
  var run = 0;          /* bumps on every start/reset so old playback stops */

  function renderStatic() {
    $('sim-title').textContent = g(STR.title);
    $('sim-hint').textContent = g(STR.hint);
    $('sim-badge').textContent = g(STR.badge);
    $('sim-badge-text').textContent = g(STR.badgeText);
    $('sim-end').textContent = g(STR.end);
    $('sim-start').textContent = g(started ? STR.again : STR.start);
    setStatus(statusKey);
    $('sim-mute-label').textContent = g(STR.mute);
    renderPicker();
    if (current) renderFields();
  }

  function renderPicker() {
    var root = $('sim-picker');
    root.innerHTML = '';
    SCENARIOS.forEach(function (sc) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scn-card' + (sc.id === current ? ' is-selected' : '');
      var title = document.createElement('span');
      title.className = 'scn-title';
      title.textContent = g(sc.title);
      var intro = document.createElement('span');
      intro.className = 'scn-intro';
      intro.textContent = g(sc.intro);
      b.appendChild(title);
      b.appendChild(intro);
      b.addEventListener('click', function () { choose(sc.id); });
      root.appendChild(b);
    });
  }

  function choose(id) {
    current = id;
    run++;
    started = false;
    speaker.stop();
    setStatus('idle');
    $('sim-start').textContent = g(STR.start);
    $('sim-form').hidden = false;
    $('sim-log').innerHTML = '';
    renderPicker();
    renderFields();
  }

  function renderFields() {
    var sc = scenarioById(current);
    $('sim-intro').textContent = g(sc.intro);
    var root = $('sim-fields');
    var keep = readSlots();
    root.innerHTML = '';
    sc.fields.forEach(function (f) {
      var wrap = document.createElement('label');
      wrap.className = 'sim-field' + (f.type === 'checkbox' ? ' sim-check' : '');
      var span = document.createElement('span');
      span.textContent = g(f.label);
      var input;
      if (f.type === 'select') {
        input = document.createElement('select');
        f.options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0];
          opt.textContent = g(o[1]);
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = f.type === 'checkbox' ? 'checkbox' : 'text';
        input.autocomplete = 'off';
      }
      input.dataset.field = f.id;
      var v = keep.hasOwnProperty(f.id) ? keep[f.id] : f.value;
      if (f.type === 'checkbox') input.checked = !!v; else input.value = v;
      if (f.type === 'checkbox') { wrap.appendChild(input); wrap.appendChild(span); }
      else { wrap.appendChild(span); wrap.appendChild(input); }
      root.appendChild(wrap);
    });
  }

  function readSlots() {
    var out = {};
    Array.prototype.forEach.call($('sim-fields').querySelectorAll('[data-field]'), function (el) {
      out[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  function addLine(node) {
    var wrap = document.createElement('div');
    wrap.className = 'pr-bubble ' + (node.who === 'agent' ? 'pr-you' : 'pr-clerk');
    var name = document.createElement('span');
    name.className = 'pr-who';
    name.textContent = g(node.who === 'agent' ? STR.agent : STR.venue);
    var hu = document.createElement('p');
    hu.className = 'pr-hu';
    hu.textContent = node.hu;
    var gl = document.createElement('p');
    gl.className = 'pr-gloss';
    gl.textContent = g(node);
    wrap.appendChild(name); wrap.appendChild(hu); wrap.appendChild(gl);
    $('sim-log').appendChild(wrap);
    wrap.scrollIntoView({ block: 'nearest' });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function rate() {
    var r = parseFloat(($('rate-range') || {}).value);
    return isNaN(r) ? 0.92 : r;
  }

  function say(node) {
    if ($('sim-mute').checked) return wait(900);
    var pitch = node.who === 'venue' ? 1.25 : 1;
    return speaker.speak(node.hu, 'hu-HU', { rate: rate(), pitch: pitch });
  }

  function showAsk(ask, session, token) {
    var box = document.createElement('div');
    box.className = 'pr-summary';
    var h = document.createElement('strong');
    h.textContent = g(STR.decide);
    var p = document.createElement('p');
    p.textContent = g(ask.prompt);
    box.appendChild(h); box.appendChild(p);
    var row = document.createElement('div');
    row.className = 'say-grid';
    ask.options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'say-btn';
      var s = document.createElement('span');
      s.textContent = g(opt.label);
      b.appendChild(s);
      b.addEventListener('click', function () {
        box.remove();
        session.answer(i);
        setStatus('live');
        play(session, token);
      });
      row.appendChild(b);
    });
    box.appendChild(row);
    $('sim-log').appendChild(box);
    box.scrollIntoView({ block: 'nearest' });
  }

  function showOutcome(o) {
    var box = document.createElement('div');
    box.className = 'pr-summary sim-outcome sim-' + o.status;
    var h = document.createElement('strong');
    h.textContent = g(STR.result) + ': ' + g(o.title);
    box.appendChild(h);
    var ul = document.createElement('ul');
    o.details.forEach(function (d) {
      var li = document.createElement('li');
      li.textContent = g(d);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    var note = document.createElement('p');
    note.className = 'hint';
    note.textContent = g(STR.never);
    box.appendChild(note);
    $('sim-log').appendChild(box);
    box.scrollIntoView({ block: 'nearest' });
    $('sim-start').textContent = g(STR.again);
    started = true;
    setStatus('ended');
  }

  function play(session, token) {
    if (token !== run) return;
    var node = session.next();
    if (!node) return;
    if (node.ask) { setStatus('waiting'); showAsk(node.ask, session, token); return; }
    if (node.outcome) { showOutcome(node.outcome); return; }
    addLine(node);
    say(node).then(function () { play(session, token); });
  }

  $('sim-start').addEventListener('click', function () {
    if (!current) return;
    run++;
    speaker.stop();
    $('sim-log').innerHTML = '';
    var session = start(current, readSlots());
    started = true;
    var token = run;
    setStatus('ringing');
    setTimeout(function () {
      if (token !== run) return;
      setStatus('live');
      play(session, token);
    }, 900);
  });

  $('sim-end').addEventListener('click', function () {
    run++;
    speaker.stop();
    setStatus('ended');
  });

  window.AblakCallSim.rerender = renderStatic;
  renderStatic();
  $('sim-form').hidden = true;
})();
