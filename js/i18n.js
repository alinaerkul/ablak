/*
 * Ablak — interface language
 * ---------------------------------------------------------------------------
 * The app has two languages and they do different jobs:
 *
 *   hu  is the language it LISTENS to and SPEAKS. Fixed — it is the counter.
 *   ui  is the language it EXPLAINS in. This file. Currently en and ru.
 *
 * Keeping the explanation language as a parameter rather than hardcoding it is
 * what makes "add Ukrainian, Serbian, Vietnamese" a content task instead of a
 * rewrite: the Hungarian side of every phrase card stays exactly as it is, and
 * only the explanation fields change.
 *
 * Default is English so that a reviewer who does not read Russian can evaluate
 * the app on load. Russian is the language the real user would run it in, and
 * the toggle is in the header.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'ablak.ui.lang';
  var DEFAULT_LANG = 'en';

  var STRINGS = {
    en: {
      'lang.name':          'EN',
      'lang.switchTo':      'Переключить на русский',

      'app.tagline':        'A counter-side guide for Hungary',
      'app.settings':       'Settings',

      'unsupported.strong': 'This browser cannot do speech recognition.',
      'unsupported.text':   'Open the app in Google Chrome or Microsoft Edge. The text input below works in any browser.',

      'scenario.title':     'Where you are',
      'scenario.all':       'Anywhere',
      'scenario.immigration': 'Immigration office',
      'scenario.bank':      'Bank',
      'scenario.clinic':    'Doctor',
      'scenario.supermarket': 'Supermarket',
      'scenario.telecom':   'Mobile & Internet',
      'scenario.hint':      'Choosing the counter improves accuracy: phrases from that setting are given priority.',

      'mic.start':          'Listen',
      'mic.stop':           'Stop',
      'mic.unavailable':    'Microphone unavailable',

      'status.ready':       'Ready. Press, then put the phone on the counter.',
      'status.listening':   'Listening…',
      'status.speaking':    'Speaking Hungarian…',
      'status.done':        'Ready.',
      'status.thinking':    'Checking the open vocabulary…',
      'status.noSpeech':    'Speech recognition is not supported here. Use the text input.',

      'transcript.label':   'Heard in Hungarian',

      'result.meaning':     'What they are asking',
      'result.action':      'What to do',
      'result.doc':         'Take out this document',
      'result.risk':        'This is a moment that matters. Do not sign or agree until you fully understand.',
      'result.reply':       'Say this back',
      'result.speak':       '🔊 Say it in Hungarian',
      'result.alternatives': 'They may have meant',
      'result.score':       'match',

      'badge.confident':    'High confidence',
      'badge.uncertain':    'Medium confidence: check this',
      'badge.unknown':      'Not understood',
      'badge.unverified':   'Unverified',

      'unknown.pending':    'Not in the phrase corpus. Requesting a best-effort reading…',
      'unknown.final':      'This phrase is not in the app’s corpus.',
      'unknown.action':     'Ask them to repeat more slowly, or to write it down. The buttons below will say that in Hungarian.',
      'unknown.replyHu':    'Elnézést, megismételné lassabban, kérem?',
      'unknown.replyUi':    'Sorry, could you repeat that more slowly?',

      'say.title':          'Say something yourself',
      'say.hint':           'The app will say the phrase in Hungarian. Hold the phone towards the window.',
      'say.group.generic':  'Any counter',
      'say.group.immigration': 'Immigration office',
      'say.group.bank':     'Bank',
      'say.group.clinic':   'Doctor / hospital',
      'say.group.supermarket': 'Supermarket',
      'say.group.telecom':  'Mobile & Internet',

      'hero.title':         'Not a translator. A counter-side guide.',
      'hero.text':          'It tells you what is being asked, what to do, and which document to hand over.',
      'hero.cta':           'Try it now',
      'hero.more':          'See how it works',
      'nav.try':            'Try it',
      'nav.how':            'How it works',
      'nav.privacy':        'Privacy and limits',
      'nav.about':          'About',
      'footer.text':        'Built by Alina Erkulova for the Hiya Voice AI Challenge',
      'courier.title':      'Courier card',
      'courier.hint':       'Fill in your details, then show the phone to the delivery person or let the app speak to them. Nothing is saved: close the page and it is gone.',
      'courier.street':     'Street and number (e.g. Példa utca 10.)',
      'courier.floor':      'Floor',
      'courier.door':       'Door',
      'courier.code':       'Gate code',
      'courier.speak':      'Say my address aloud',
      'courier.phrases':    'Useful things to say',
      'practice.title':     'Practice a booking call',
      'practice.hint':      'The app plays the clerk in Hungarian. Answer by voice, by typing, or by tapping a suggested reply. Typed and tapped answers stay on your device; spoken ones go through your browser\'s speech service.',
      'practice.restart':   'Restart',
      'practice.exit':      'Finish',
      'practice.hard':      'Hard mode: hide suggested replies',
      'practice.placeholder': 'Answer in Hungarian…',
      'practice.send':      'Send',
      'practice.mic':       'Answer by voice',
      'practice.clerk':     'Clerk',
      'practice.you':       'You',
      'practice.done':      'Well done: you completed the call.',
      'practice.summary':   'What you said:',

      'text.title':         'Type it instead',
      'text.hint':          'No microphone, or you do not speak Hungarian? Type a phrase here. It runs through the same matcher as speech.',
      'text.submit':        'Analyse',
      'text.examples':      'Examples',

      'nav.cta': 'Try it now',
      'nav.menu': 'Menu',
      'hero.label': 'Prototype · Hiya Voice AI Challenge',
      'sample.badge': 'Example',
      'sample.conf': 'High confidence',
      'sample.meaning': 'The receptionist is asking for your passport.',
      'sample.action': 'Take out your passport and hand it to the receptionist.',
      'sample.gloss': 'Here is my passport.',
      'guide.title': 'Your guidance',
      'guide.meaning': 'What they mean',
      'guide.action': 'What to do',
      'guide.doc': 'Document to prepare',
      'guide.say': 'Say this in Hungarian',
      'sec.where.title': 'Where are you going?',
      'sec.where.sub': 'Choosing the counter narrows the search and improves accuracy.',
      'loc.immigration': 'Immigration',
      'loc.immigration.d': 'Residence permits and documents',
      'loc.bank': 'Bank',
      'loc.bank.d': 'Accounts and transactions',
      'loc.clinic': 'Clinic',
      'loc.clinic.d': 'Appointments and reception',
      'loc.supermarket': 'Supermarket',
      'loc.supermarket.d': 'Shopping and everyday questions',
      'loc.telecom': 'Mobile & Internet',
      'loc.telecom.d': 'SIM cards, plans and home internet',
      'sec.say.title': 'What did they say?',
      'sec.say.sub': 'Press the microphone and hold the phone towards the counter, or type what you heard.',
      'err.retry': 'Try again',
      'sec.phrases.title': 'Need to say something yourself?',
      'sec.phrases.sub': 'Tap a card and the app says it in Hungarian.',
      'phrases.more': 'More phrases by counter',
      'sec.practice.title': 'Practice before making a call.',
      'sec.practice.sub': 'The app plays the clerk in Hungarian. Answer by voice, by typing, or by tapping a suggested reply.',
      'sec.courier.title': 'Your delivery details, ready to share.',
      'courier.name': 'Recipient name',
      'courier.streetLabel': 'Street and number',
      'courier.phone': 'Phone number',
      'courier.copy': 'Copy address',
      'courier.copied': 'Copied',
      'courier.empty': 'Fill in your details and the card appears here.',
      'sec.sim.title': 'Make your next call with confidence.',
      'footer.copy': '© 2026 Alina Erkulova',
      'phrase.speak': 'Speak',
      'nav.github': 'View on GitHub',
      'panel.close': 'Close',
      'ws.where': 'Where do you need help?',
      'ws.speak': 'Speak or type your request',
      'ws.typeph': 'or type here…',
      'ws.result': 'Your result',
      'ws.empty': 'Your result will appear here.',
      'feat.label': 'Key features',
      'feat.title': 'Help for real-life situations',
      'feat.1.t': 'Know when to say “I don’t know”',
      'feat.1.d': 'We refuse to guess when we are not sure.',
      'feat.2.t': 'Get the right document',
      'feat.2.d': 'Not just a translation, but clear next steps.',
      'feat.3.t': 'Speak with confidence',
      'feat.3.d': 'Prepared Hungarian phrases, ready to use.',
      'prac.title': 'Practice a booking call',
      'prac.text': 'Try 7 scripted scenarios, from booking a table to renewing a permit.',
      'prac.cta': 'Start practice',
      'prac.p1': 'Book a table at a café',
      'prac.p2': 'Book a doctor’s appointment',
      'prac.p3': 'Bank: lost or new card',
      'prac.p4': 'Supermarket: ask, weigh, pay',
      'prac.p5': 'Immigration: book a renewal slot',
      'prac.p6': 'Bank: get a card at a branch',
      'prac.p7': 'Mobile shop: buy a SIM card',
      'card.phrases.t': 'Useful phrases',
      'card.phrases.d': 'Prepared Hungarian phrases: one tap and the app says them.',
      'card.phrases.cta': 'Open',
      'card.courier.t': 'Courier card',
      'card.courier.d': 'Your address and key phrases in large format.',
      'card.courier.cta': 'View card',
      'card.sim.t': 'Call simulator',
      'card.sim.d': 'Watch an agent call and book for you. A simulation: no real call is made.',
      'card.sim.cta': 'Try it',
      'footer.tag': 'A counter-side guide for Hungary',
      'footer.contact': 'Contact',
      'status.transcribing': 'Transcribing…',
      'settings.wHeading': 'Better Hungarian recognition (optional)',
      'settings.wHint': 'Sends a short recording of your speech to Groq (Whisper large v3) instead of using the browser’s speech service. Off by default. It uses the free Groq key saved above. The audio leaves your device; Ablak does not store it.',
      'settings.wOn': 'Use Whisper for the microphone',
      'settings.wNeedKey': 'Choose Groq above and save a key first.',
      'settings.wOnStatus': 'On. The microphone now records a clip and sends it to Groq.',
      'history.title':      'Conversation history',
      'history.empty':      'Nothing recognised yet.',
      'history.clear':      'Clear',
      'history.unknown':    'Not recognised',

      'settings.title':     'Settings',
      'settings.close':     'Close',
      'settings.rate':      'Speaking speed',
      'settings.autospeak': 'Say the reply immediately',
      'settings.autospeakHint': 'Useful when your hands are full of documents.',
      'settings.llmHeading': 'Open vocabulary (optional)',
      'settings.llmHint':   'The main mode needs no key and no internet: a built-in phrase corpus. If a phrase is not in it, you can connect a free API for an approximate reading. Those answers are marked unverified. The key is stored only in this browser.',
      'settings.provider':  'Provider',
      'settings.providerOff': 'Off',
      'settings.apiKey':    'API key',
      'settings.save':      'Save',
      'settings.llmOff':    'Open vocabulary is off. The app runs on the built-in corpus.',
      'settings.llmSaved':  'Key stored in this browser. Used only when a phrase is not found in the corpus.',
      'settings.llmOn':     'Open vocabulary is on',
      'settings.voices':    'Voice check',
      'settings.voiceTest': 'Test the Hungarian voice',
      'settings.voiceOk':   'Hungarian voice found:',
      'settings.voiceMissing': 'No Hungarian voice installed. Add Hungarian in your system settings, otherwise phrases will be read with the wrong accent.',
      'settings.noTts':     'Speech synthesis is unavailable in this browser.',
      'settings.corpus':    'Corpus:',
      'settings.corpusPhrases': 'counter phrases.',
      'settings.corpusActive': 'active',
      'settings.privacy':   'Typed text and the matcher stay on your device. Spoken input goes through your browser\'s own speech service (Chrome uses Google).'
    },

    ru: {
      'lang.name':          'RU',
      'lang.switchTo':      'Switch to English',

      'app.tagline':        'Помощник у окошка в Венгрии',
      'app.settings':       'Настройки',

      'unsupported.strong': 'Этот браузер не поддерживает распознавание речи.',
      'unsupported.text':   'Откройте приложение в Google Chrome или Microsoft Edge. Ввод текстом ниже работает в любом браузере.',

      'scenario.title':     'Где вы сейчас',
      'scenario.all':       'Везде',
      'scenario.immigration': 'Иммиграционная служба',
      'scenario.bank':      'Банк',
      'scenario.clinic':    'Врач',
      'scenario.supermarket': 'Супермаркет',
      'scenario.telecom':   'Связь и интернет',
      'scenario.hint':      'Выбор места повышает точность: приоритет отдаётся фразам этого окна.',

      'mic.start':          'Слушать',
      'mic.stop':           'Остановить',
      'mic.unavailable':    'Микрофон недоступен',

      'status.ready':       'Готово. Нажмите и положите телефон на стойку.',
      'status.listening':   'Слушаю…',
      'status.speaking':    'Говорю по-венгерски…',
      'status.done':        'Готово.',
      'status.thinking':    'Запрашиваю открытый словарь…',
      'status.noSpeech':    'Распознавание речи не поддерживается. Используйте ввод текстом.',

      'transcript.label':   'Слышу по-венгерски',

      'result.meaning':     'Что просят',
      'result.action':      'Что делать',
      'result.doc':         'Достаньте документ',
      'result.risk':        'Это важный момент. Не подписывайте и не соглашайтесь, пока не поняли полностью.',
      'result.reply':       'Скажите в ответ',
      'result.speak':       '🔊 Произнести по-венгерски',
      'result.alternatives': 'Может быть, имели в виду',
      'result.score':       'совпадение',

      'badge.confident':    'Высокая уверенность',
      'badge.uncertain':    'Средняя уверенность: проверьте',
      'badge.unknown':      'Не понял',
      'badge.unverified':   'Не проверено',

      'unknown.pending':    'Фразы нет в словаре. Запрашиваю приблизительный перевод…',
      'unknown.final':      'Эта фраза не входит в словарь приложения.',
      'unknown.action':     'Попросите сотрудника повторить медленнее или записать. Кнопки ниже произнесут это по-венгерски.',
      'unknown.replyHu':    'Elnézést, megismételné lassabban, kérem?',
      'unknown.replyUi':    'Извините, повторите медленнее, пожалуйста?',

      'say.title':          'Сказать самой',
      'say.hint':           'Приложение произнесёт фразу по-венгерски. Поднесите телефон к окну.',
      'say.group.generic':  'Любое окно',
      'say.group.immigration': 'Иммиграционная служба',
      'say.group.bank':     'Банк',
      'say.group.clinic':   'Врач / больница',
      'say.group.supermarket': 'Супермаркет',
      'say.group.telecom':  'Связь и интернет',

      'hero.title':         'Не переводчик. Помощник у окошка.',
      'hero.text':          'Он подсказывает, о чём вас спрашивают, что делать и какой документ передать.',
      'hero.cta':           'Попробовать',
      'hero.more':          'Как это работает',
      'nav.try':            'Попробовать',
      'nav.how':            'Как это работает',
      'nav.privacy':        'Приватность и границы',
      'nav.about':          'О проекте',
      'footer.text':        'Сделала Алина Эркулова для Hiya Voice AI Challenge',
      'courier.title':      'Карточка для курьера',
      'courier.hint':       'Заполните данные, затем покажите телефон курьеру или дайте приложению заговорить с ним. Ничего не сохраняется: закроете страницу, и данные исчезнут.',
      'courier.street':     'Улица и номер (например Példa utca 10.)',
      'courier.floor':      'Этаж',
      'courier.door':       'Квартира',
      'courier.code':       'Код домофона',
      'courier.speak':      'Произнести мой адрес вслух',
      'courier.phrases':    'Что можно сказать',
      'practice.title':     'Тренировка: запись по телефону',
      'practice.hint':      'Приложение играет роль сотрудника по-венгерски. Отвечайте голосом, текстом или нажимая подсказку. Текст и нажатия остаются на устройстве; голос обрабатывает речевой сервис браузера.',
      'practice.restart':   'Заново',
      'practice.exit':      'Закончить',
      'practice.hard':      'Сложный режим: скрыть подсказки',
      'practice.placeholder': 'Ответьте по-венгерски…',
      'practice.send':      'Отправить',
      'practice.mic':       'Ответить голосом',
      'practice.clerk':     'Сотрудник',
      'practice.you':       'Вы',
      'practice.done':      'Отлично: вы прошли весь разговор.',
      'practice.summary':   'Что вы сказали:',

      'text.title':         'Или введите текстом',
      'text.hint':          'Если микрофона нет или вы не говорите по-венгерски — впишите фразу здесь. Работает тот же механизм, что и для речи.',
      'text.submit':        'Анализ',
      'text.examples':      'Примеры',

      'nav.cta': 'Попробовать',
      'nav.menu': 'Меню',
      'hero.label': 'Прототип · Hiya Voice AI Challenge',
      'sample.badge': 'Пример',
      'sample.conf': 'Высокая уверенность',
      'sample.meaning': 'Сотрудница просит ваш паспорт.',
      'sample.action': 'Достаньте паспорт и передайте его сотруднице.',
      'sample.gloss': 'Вот мой паспорт.',
      'guide.title': 'Ваша подсказка',
      'guide.meaning': 'Что это значит',
      'guide.action': 'Что делать',
      'guide.doc': 'Какой документ подготовить',
      'guide.say': 'Скажите по-венгерски',
      'sec.where.title': 'Куда вы идёте?',
      'sec.where.sub': 'Выбор места сужает поиск и повышает точность.',
      'loc.immigration': 'Иммиграция',
      'loc.immigration.d': 'Вид на жительство и документы',
      'loc.bank': 'Банк',
      'loc.bank.d': 'Счета и операции',
      'loc.clinic': 'Клиника',
      'loc.clinic.d': 'Запись и регистратура',
      'loc.supermarket': 'Супермаркет',
      'loc.supermarket.d': 'Покупки и повседневные вопросы',
      'loc.telecom': 'Связь и интернет',
      'loc.telecom.d': 'SIM-карты, тарифы и домашний интернет',
      'sec.say.title': 'Что вам сказали?',
      'sec.say.sub': 'Нажмите микрофон и поднесите телефон к окошку или введите услышанное.',
      'err.retry': 'Повторить',
      'sec.phrases.title': 'Нужно что-то сказать самому?',
      'sec.phrases.sub': 'Нажмите на карточку, и приложение произнесёт фразу по-венгерски.',
      'phrases.more': 'Больше фраз по местам',
      'sec.practice.title': 'Потренируйтесь перед звонком.',
      'sec.practice.sub': 'Приложение играет сотрудника по-венгерски. Отвечайте голосом, текстом или нажимая подсказку.',
      'sec.courier.title': 'Данные для доставки, готовые показать.',
      'courier.name': 'Имя получателя',
      'courier.streetLabel': 'Улица и номер',
      'courier.phone': 'Номер телефона',
      'courier.copy': 'Скопировать адрес',
      'courier.copied': 'Скопировано',
      'courier.empty': 'Заполните данные, и карточка появится здесь.',
      'sec.sim.title': 'Позвоните уверенно.',
      'footer.copy': '© 2026 Алина Эркулова',
      'phrase.speak': 'Произнести',
      'nav.github': 'GitHub',
      'panel.close': 'Закрыть',
      'ws.where': 'Где нужна помощь?',
      'ws.speak': 'Скажите или введите услышанное',
      'ws.typeph': 'или введите текст…',
      'ws.result': 'Ваш результат',
      'ws.empty': 'Здесь появится результат.',
      'feat.label': 'Ключевые возможности',
      'feat.title': 'Помощь в реальных ситуациях',
      'feat.1.t': 'Умеет сказать «не знаю»',
      'feat.1.d': 'Мы не гадаем, когда не уверены.',
      'feat.2.t': 'Нужный документ',
      'feat.2.d': 'Не просто перевод, а понятные следующие шаги.',
      'feat.3.t': 'Говорите уверенно',
      'feat.3.d': 'Готовые венгерские фразы, которые можно сразу сказать.',
      'prac.title': 'Тренировка звонка',
      'prac.text': 'Семь сценариев: от брони столика до продления разрешения.',
      'prac.cta': 'Начать тренировку',
      'prac.p1': 'Бронь столика в кафе',
      'prac.p2': 'Запись к врачу',
      'prac.p3': 'Банк: потеряна или новая карта',
      'prac.p4': 'Супермаркет: спросить, взвесить, оплатить',
      'prac.p5': 'Иммиграция: запись на продление',
      'prac.p6': 'Банк: оформить карту в отделении',
      'prac.p7': 'Салон связи: купить SIM-карту',
      'card.phrases.t': 'Полезные фразы',
      'card.phrases.d': 'Готовые венгерские фразы: одно нажатие, и приложение произнесёт.',
      'card.phrases.cta': 'Открыть',
      'card.courier.t': 'Карточка для курьера',
      'card.courier.d': 'Ваш адрес и ключевые фразы крупно.',
      'card.courier.cta': 'Открыть',
      'card.sim.t': 'Симулятор звонка',
      'card.sim.d': 'Посмотрите, как агент звонит и записывает за вас. Симуляция: настоящий звонок не совершается.',
      'card.sim.cta': 'Попробовать',
      'footer.tag': 'Помощник у окошка в Венгрии',
      'footer.contact': 'Контакты',
      'status.transcribing': 'Расшифровываю…',
      'settings.wHeading': 'Улучшенное распознавание венгерского (по желанию)',
      'settings.wHint': 'Отправляет короткую запись голоса в Groq (Whisper large v3) вместо речевого сервиса браузера. По умолчанию выключено. Используется бесплатный ключ Groq, сохранённый выше. Звук покидает ваше устройство; Ablak его не хранит.',
      'settings.wOn': 'Использовать Whisper для микрофона',
      'settings.wNeedKey': 'Сначала выберите Groq выше и сохраните ключ.',
      'settings.wOnStatus': 'Включено. Микрофон теперь записывает фрагмент и отправляет его в Groq.',
      'history.title':      'История разговора',
      'history.empty':      'Пока ничего не распознано.',
      'history.clear':      'Очистить',
      'history.unknown':    'Не распознано',

      'settings.title':     'Настройки',
      'settings.close':     'Закрыть',
      'settings.rate':      'Скорость произношения',
      'settings.autospeak': 'Сразу произносить ответную фразу',
      'settings.autospeakHint': 'Удобно, когда руки заняты документами.',
      'settings.llmHeading': 'Открытый словарь (необязательно)',
      'settings.llmHint':   'Основной режим работает без ключей и без интернета: встроенный словарь фраз. Если фраза в него не попала, можно подключить бесплатный API, чтобы получить приблизительный перевод. Такие ответы помечаются как непроверенные. Ключ хранится только в этом браузере.',
      'settings.provider':  'Провайдер',
      'settings.providerOff': 'Выключено',
      'settings.apiKey':    'API-ключ',
      'settings.save':      'Сохранить',
      'settings.llmOff':    'Открытый словарь выключен. Приложение работает на встроенном словаре.',
      'settings.llmSaved':  'Ключ сохранён в этом браузере. Используется только когда фраза не найдена в словаре.',
      'settings.llmOn':     'Открытый словарь включён',
      'settings.voices':    'Проверка голосов',
      'settings.voiceTest': 'Проверить венгерский голос',
      'settings.voiceOk':   'Венгерский голос найден:',
      'settings.voiceMissing': 'Венгерский голос не установлен. Установите венгерский язык в системе, иначе фразы будут звучать с чужим акцентом.',
      'settings.noTts':     'Синтез речи недоступен в этом браузере.',
      'settings.corpus':    'Словарь:',
      'settings.corpusPhrases': 'фраз у окна.',
      'settings.corpusActive': 'активно',
      'settings.privacy':   'Введённый текст и подбор фраз остаются на устройстве. Голос обрабатывает речевой сервис браузера (в Chrome это Google).'
    }
  };

  var current = DEFAULT_LANG;

  function available() {
    return Object.keys(STRINGS);
  }

  function get() {
    return current;
  }

  function set(lang) {
    if (!STRINGS[lang]) return false;
    current = lang;
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    document.documentElement.setAttribute('lang', lang);
    return true;
  }

  function restore() {
    var saved = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch (e) {}
    set(STRINGS[saved] ? saved : DEFAULT_LANG);
    return current;
  }

  /* Missing keys return the key itself: a visible, searchable failure rather
   * than a blank element that looks like a layout bug. */
  function t(key) {
    var table = STRINGS[current] || STRINGS[DEFAULT_LANG];
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
  }

  /*
   * Phrase cards carry their explanation fields per language: ru_meaning /
   * en_meaning and so on. This resolves the right one without the callers
   * needing to know the naming scheme.
   */
  function card(cardObj, field) {
    if (!cardObj) return '';
    var key = current + '_' + field;
    if (cardObj[key]) return cardObj[key];
    var fallback = DEFAULT_LANG + '_' + field;
    return cardObj[fallback] || '';
  }

  /* reply_en / reply_ru, and the say-bank's label_en / label (ru). */
  function reply(cardObj) {
    if (!cardObj) return '';
    return current === 'en' ? (cardObj.reply_en || '') : (cardObj.reply_ru || '');
  }

  function sayLabel(phrase) {
    return current === 'en' ? (phrase.label_en || phrase.label) : phrase.label;
  }

  function sayGloss(phrase) {
    return current === 'en' ? (phrase.en || '') : (phrase.ru || '');
  }

  /* Applies every data-i18n / data-i18n-ph / data-i18n-title in the document. */
  function apply(root) {
    root = root || document;

    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-ph]'), function (node) {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-ph')));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-title]'), function (node) {
      var v = t(node.getAttribute('data-i18n-title'));
      node.setAttribute('title', v);
      node.setAttribute('aria-label', v);
    });
  }

  window.AblakI18n = {
    DEFAULT_LANG: DEFAULT_LANG,
    available: available,
    get: get,
    set: set,
    restore: restore,
    t: t,
    card: card,
    reply: reply,
    sayLabel: sayLabel,
    sayGloss: sayGloss,
    apply: apply
  };
})();
