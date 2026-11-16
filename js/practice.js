/*
 * Ablak — booking practice
 * ---------------------------------------------------------------------------
 * A rehearsal room for the other half of the product. The app plays the
 * clerk (in Hungarian, spoken aloud); the user answers by voice, by typing,
 * or by tapping a suggested reply. Nothing here is network-bound and nothing
 * is ever sent anywhere: it is a scripted dialogue tree.
 *
 * Why a script and not a model:
 *   - Same reasoning as the main matcher. A rehearsal that invents things a
 *     real clerk would never say teaches the wrong reflexes.
 *   - Every line was written once and can be checked by a human.
 *   - It is the offline prototype of the outbound-calling design: the same
 *     scenario files could later drive a real call, with a model used only
 *     to classify the other side's reply, never to write the script.
 *
 * Engine:  Practice.start(id) -> session; Practice.say(session, text);
 *          Practice.choose(session, optionId). Pure functions, no DOM.
 * UI:      attaches itself only if #practice-panel exists in the page.
 *
 * Option matching works on diacritic-folded tokens, because speech
 * recognition and learners both drop accents. A key matches a token that
 * STARTS with it (Hungarian suffixes: "holnap", "holnapra"); a key prefixed
 * with "=" must equal the token (so "ma" does not match "majd").
 * An option with free:true accepts any reasonable answer: names, dates and
 * phone numbers cannot be enumerated.
 */

(function () {
  'use strict';

  var M = window.AblakMatcher;

  /* ------------------------------------------------------------------ */
  /* Script helpers                                                     */
  /* ------------------------------------------------------------------ */

  function L(hu, en, ru) { return { hu: hu, en: en, ru: ru }; }

  /* option: id derived from its step and position, so tests can address it */
  function O(hu, en, ru, keys, next, free) {
    return { hu: hu, en: en, ru: ru, keys: keys || [], next: next, free: !!free };
  }

  function S(id, clerk, options, end) {
    return { id: id, clerk: clerk, options: options || [], end: !!end };
  }

  var UNCLEAR = L('Elnézést, nem értettem. Megismételné, kérem?',
                  'Sorry, I did not understand. Could you repeat, please?',
                  'Извините, я не понял. Не могли бы вы повторить?');

  /* ------------------------------------------------------------------ */
  /* Scenarios                                                          */
  /* ------------------------------------------------------------------ */

  var SCENARIOS = [
    {
      id: 'cafe',
      level: 'easy',
      title: { en: 'Book a table at a café', ru: 'Забронировать столик в кафе' },
      intro: { en: 'You call a café to reserve a table for the evening.',
               ru: 'Вы звоните в кафе, чтобы забронировать столик на вечер.' },
      start: 'c_start',
      steps: [
        S('c_start', L('Jó napot kívánok, Kávéház. Miben segíthetek?',
                       'Good day, Café speaking. How can I help?',
                       'Добрый день, кафе. Чем могу помочь?'), [
          O('Asztalt szeretnék foglalni.', 'I would like to book a table.', 'Я хочу забронировать столик.',
            ['asztal', 'foglal'], 'c_when'),
          O('Van szabad asztaluk ma estére?', 'Do you have a free table this evening?', 'Есть ли у вас свободный столик на сегодня вечером?',
            ['szabad', 'asztaluk'], 'c_when')
        ]),
        S('c_when', L('Mikorra szeretne foglalni?', 'For when would you like to book?', 'На когда вы хотите забронировать?'), [
          O('Holnap este hétre.', 'Tomorrow evening at seven.', 'Завтра вечером на семь.',
            ['holnap', 'este', 'het'], 'c_people'),
          O('Szombaton délben, tizenkét órára.', 'On Saturday at noon, for twelve o\'clock.', 'В субботу в полдень, на двенадцать часов.',
            ['szombat', 'delben', 'tizenket'], 'c_people'),
          O('Ma este nyolcra.', 'Tonight at eight.', 'Сегодня вечером на восемь.',
            ['=ma', 'nyolc'], 'c_people')
        ]),
        S('c_people', L('Hány főre?', 'For how many people?', 'На сколько человек?'), [
          O('Két főre.', 'For two people.', 'На двоих.', ['ket', '2', '=ketto'], 'c_name'),
          O('Négy főre.', 'For four people.', 'На четверых.', ['negy', '4'], 'c_name'),
          O('Hat főre.', 'For six people.', 'На шестерых.', ['hat', '6'], 'c_name')
        ]),
        S('c_name', L('Milyen névre foglaljam?', 'Under what name shall I book it?', 'На какое имя записать?'), [
          O('Erkulova Alina.', 'Erkulova Alina. (say your own name)', 'Эркулова Алина. (назовите своё имя)',
            [], 'c_spell', true)
        ]),
        S('c_spell', L('Meg tudná betűzni?', 'Could you spell it?', 'Не могли бы вы произнести по буквам?'), [
          O('Igen. E, R, K, U, L, O, V, A.', 'Yes. E, R, K, U, L, O, V, A. (spell your own)', 'Да. Э, Р, К, У, Л, О, В, А. (по буквам своё)',
            [], 'c_phone', true)
        ]),
        S('c_phone', L('Kérek egy telefonszámot is, ha lehet.', 'I also need a phone number, please.', 'Мне также нужен номер телефона, пожалуйста.'), [
          O('Nulla, harminc, egy, kettő, három, négy, öt, hat, hét.', 'Zero, thirty, one, two, three, four, five, six, seven. (say yours)', 'Ноль, тридцать, один, два, три, четыре, пять, шесть, семь. (назовите свой)',
            [], 'c_confirm', true)
        ]),
        S('c_confirm', L('Rendben, lefoglaltam az asztalt. Van még valamilyen kérése?',
                         'Fine, the table is booked. Do you have any other request?',
                         'Хорошо, столик забронирован. Есть ли у вас ещё пожелания?'), [
          O('Ablak mellé szeretnék ülni, ha lehet.', 'I would like to sit by the window, if possible.', 'Я хотела бы сидеть у окна, если можно.',
            ['ablak'], 'c_end'),
          O('Van gluténmentes étel?', 'Do you have gluten-free food?', 'Есть ли у вас безглютеновая еда?',
            ['gluten'], 'c_end'),
          O('Nincs, köszönöm szépen.', 'No, thank you very much.', 'Нет, большое спасибо.',
            ['nincs', 'koszon'], 'c_end')
        ]),
        S('c_end', L('Köszönjük a foglalást. Viszontlátásra!', 'Thank you for booking. Goodbye!', 'Спасибо за бронь. До свидания!'), [], true)
      ]
    },
    {
      id: 'doctor',
      level: 'medium',
      title: { en: 'Book a doctor\'s appointment', ru: 'Записаться к врачу' },
      intro: { en: 'You phone a clinic. Note the TAJ question: say honestly that you do not have one if you do not.',
               ru: 'Вы звоните в клинику. Обратите внимание на вопрос про TAJ: если карты нет, скажите об этом честно.' },
      start: 'd_start',
      steps: [
        S('d_start', L('Rendelő, jó napot kívánok. Miben segíthetek?', 'Clinic, good day. How can I help?', 'Приёмная, добрый день. Чем могу помочь?'), [
          O('Időpontot szeretnék kérni az orvoshoz.', 'I would like to make an appointment with the doctor.', 'Я хотела бы записаться на приём к врачу.',
            ['idopont', 'orvos'], 'd_problem')
        ]),
        S('d_problem', L('Mi a panasza?', 'What is the problem?', 'На что жалуетесь?'), [
          O('Fáj a torkom, és köhögök.', 'My throat hurts and I cough.', 'У меня болит горло и я кашляю.',
            ['torok', 'torkom', 'kohog'], 'd_taj'),
          O('Fáj a fejem, és szédülök.', 'I have a headache and feel dizzy.', 'У меня болит голова и кружится.',
            ['fej', 'szedul'], 'd_taj'),
          O('Csak ellenőrzésre szeretnék jönni.', 'I only want to come for a check-up.', 'Я хочу прийти только на осмотр.',
            ['ellenor', 'kontroll'], 'd_taj')
        ]),
        S('d_taj', L('Van érvényes TAJ-kártyája?', 'Do you have a valid TAJ card?', 'Есть ли у вас действующая карта TAJ?'), [
          O('Igen, van.', 'Yes, I do.', 'Да, есть.', ['=igen', '=van'], 'd_slot'),
          O('Nincs, külföldi diák vagyok.', 'No, I am a foreign student.', 'Нет, я иностранная студентка.',
            ['nincs', 'kulfoldi', 'diak'], 'd_pay')
        ]),
        S('d_pay', L('Akkor a vizsgálatot saját költségen kell fizetnie. Így is jó?',
                     'Then you have to pay for the exam yourself. Is that okay?',
                     'Тогда обследование нужно оплатить самостоятельно. Вас это устраивает?'), [
          O('Igen, így is jó.', 'Yes, that is fine.', 'Да, так тоже подходит.', ['=igen', 'jo'], 'd_slot'),
          O('Mennyibe kerül?', 'How much does it cost?', 'Сколько это стоит?', ['mennyi', 'kerul'], 'd_price')
        ]),
        S('d_price', L('A vizsgálat díja az orvos típusától függ. Szeretne időpontot foglalni?',
                       'The fee depends on the type of doctor. Would you like to book?',
                       'Стоимость зависит от типа врача. Хотите записаться?'), [
          O('Igen, kérem.', 'Yes, please.', 'Да, пожалуйста.', ['=igen', 'kerem'], 'd_slot')
        ]),
        S('d_slot', L('Holnap délelőtt tízkor tudom fogadni. Megfelel?',
                      'I can see you tomorrow morning at ten. Does that suit you?',
                      'Могу принять вас завтра в десять утра. Вам подходит?'), [
          O('Igen, megfelel.', 'Yes, that suits me.', 'Да, подходит.', ['megfelel', '=igen', 'jo'], 'd_name'),
          O('Délután nem lenne lehetséges?', 'Would the afternoon not be possible?', 'А во второй половине дня нельзя?',
            ['delutan'], 'd_slot2')
        ]),
        S('d_slot2', L('Délután három órakor lenne még szabad időpontom. Jó lesz?',
                       'I still have a free slot at three in the afternoon. Will that do?',
                       'У меня есть свободное время в три часа дня. Подойдёт?'), [
          O('Igen, az jó lesz.', 'Yes, that will do.', 'Да, это подойдёт.', ['jo', '=igen'], 'd_name')
        ]),
        S('d_name', L('Kérem a nevét és a születési dátumát.', 'Your name and date of birth, please.', 'Назовите, пожалуйста, имя и дату рождения.'), [
          O('Erkulova Alina, kétezer-egy, május tizenegy.', 'Erkulova Alina, born 11 May 2001. (say your own)', 'Эркулова Алина, 11 мая 2001. (назовите свои)',
            [], 'd_docs', true)
        ]),
        S('d_docs', L('Kérem, hozza magával az útlevelét és a TAJ-kártyáját.',
                      'Please bring your passport and your TAJ card.',
                      'Пожалуйста, возьмите с собой паспорт и карту TAJ.'), [
          O('Rendben, köszönöm.', 'Okay, thank you.', 'Хорошо, спасибо.', ['rendben', 'koszon'], 'd_end')
        ]),
        S('d_end', L('Viszontlátásra, jobbulást!', 'Goodbye, get well soon!', 'До свидания, скорейшего выздоровления!'), [], true)
      ]
    },
    {
      id: 'bank',
      level: 'medium',
      title: { en: 'Bank: lost card or new card', ru: 'Банк: потеряна карта или новая карта' },
      intro: { en: 'You call your bank. Never read out your PIN or SMS codes; here you only give name and date of birth.',
               ru: 'Вы звоните в банк. Никогда не диктуйте PIN или коды из СМС; здесь только имя и дата рождения.' },
      start: 'b_start',
      steps: [
        S('b_start', L('Jó napot kívánok, banki ügyfélszolgálat. Miben segíthetek?',
                       'Good day, bank customer service. How can I help?',
                       'Добрый день, служба поддержки банка. Чем могу помочь?'), [
          O('Elvesztettem a bankkártyámat.', 'I have lost my bank card.', 'Я потеряла банковскую карту.',
            ['elvesztett', 'elveszett'], 'b_lost'),
          O('Új bankkártyát szeretnék igényelni.', 'I would like to order a new bank card.', 'Я хочу заказать новую банковскую карту.',
            ['=uj', 'igenyel'], 'b_new')
        ]),
        S('b_lost', L('Sajnálom. Azonnal le tudom tiltani a kártyát. Kéri?',
                      'I am sorry. I can block the card right away. Do you want that?',
                      'Сожалею. Я могу сразу заблокировать карту. Хотите?'), [
          O('Igen, kérem, tiltsák le azonnal.', 'Yes please, block it immediately.', 'Да, пожалуйста, заблокируйте сразу.',
            ['tilt', 'azonnal', '=igen'], 'b_id'),
          O('Előbb megnézem otthon.', 'I will check at home first.', 'Сначала посмотрю дома.',
            ['elobb', 'otthon', 'megnez'], 'b_wait')
        ]),
        S('b_wait', L('Rendben, de ha gyanús mozgást lát a számláján, hívjon vissza azonnal.',
                      'Fine, but if you see suspicious activity on your account, call back immediately.',
                      'Хорошо, но если увидите подозрительные операции по счёту, сразу перезвоните.'), [
          O('Értem, köszönöm.', 'I understand, thank you.', 'Я поняла, спасибо.', ['ertem', 'koszon'], 'b_end')
        ]),
        S('b_id', L('Kérem a nevét és a születési dátumát az azonosításhoz.',
                    'Your name and date of birth for identification, please.',
                    'Назовите имя и дату рождения для идентификации.'), [
          O('Erkulova Alina, kétezer-egy, május tizenegy.', 'Erkulova Alina, born 11 May 2001. (say your own)', 'Эркулова Алина, 11 мая 2001. (назовите свои)',
            [], 'b_after_block', true)
        ]),
        S('b_after_block', L('Letiltottam a kártyát. Kér újat a helyére?',
                             'The card is blocked. Would you like a new one?',
                             'Карта заблокирована. Хотите новую?'), [
          O('Igen, kérem.', 'Yes, please.', 'Да, пожалуйста.', ['=igen', 'kerem'], 'b_deliver'),
          O('Nem, köszönöm, egyelőre nem.', 'No, thank you, not for now.', 'Нет, спасибо, пока не нужно.',
            ['=nem', 'egyelore'], 'b_end')
        ]),
        S('b_new', L('Szívesen. Betéti kártyát szeretne, vagy hitelkártyát?',
                     'Gladly. Would you like a debit card or a credit card?',
                     'С удовольствием. Вам дебетовую карту или кредитную?'), [
          O('Betéti kártyát szeretnék.', 'I would like a debit card.', 'Я хочу дебетовую карту.', ['beteti', 'debit'], 'b_deliver'),
          O('Hitelkártyát szeretnék.', 'I would like a credit card.', 'Я хочу кредитную карту.', ['hitelkartya'], 'b_deliver')
        ]),
        S('b_deliver', L('A kártya postán érkezik. Jó a lakcíme a rendszerben?',
                         'The card arrives by post. Is your address in our system correct?',
                         'Карта придёт по почте. Адрес в нашей системе верный?'), [
          O('Igen, ugyanaz a lakcímem.', 'Yes, my address is the same.', 'Да, адрес прежний.',
            ['=igen', 'ugyanaz', 'lakcim'], 'b_end'),
          O('Nem, megváltozott a címem.', 'No, my address has changed.', 'Нет, мой адрес изменился.',
            ['=nem', 'megvaltozott'], 'b_addr')
        ]),
        S('b_addr', L('Kérem, mondja meg az új címét.', 'Please tell me your new address.', 'Назовите, пожалуйста, новый адрес.'), [
          O('Budapest, Példa utca tíz.', 'Budapest, Példa street 10. (say your own)', 'Будапешт, улица Пелда, 10. (назовите свой)',
            [], 'b_end', true)
        ]),
        S('b_end', L('Rendben, intézkedtem. Szép napot kívánok!', 'Done, I have arranged it. Have a nice day!', 'Готово, я всё оформил. Хорошего дня!'), [], true)
      ]
    },
    {
      id: 'supermarket',
      level: 'easy',
      title: { en: 'Supermarket: ask, weigh, pay', ru: 'Супермаркет: спросить, взвесить, оплатить' },
      intro: { en: 'You ask a shop assistant where things are, then pay at the till.',
               ru: 'Вы спрашиваете у сотрудника, где что лежит, затем платите на кассе.' },
      start: 's_start',
      steps: [
        S('s_start', L('Jó napot, segíthetek valamiben?', 'Good day, may I help you with something?', 'Добрый день, могу вам чем-то помочь?'), [
          O('Hol találom a tejet?', 'Where can I find the milk?', 'Где я найду молоко?', ['tej', '=hol'], 's_where'),
          O('Hogyan kell lemérni a gyümölcsöt?', 'How do I weigh the fruit?', 'Как нужно взвесить фрукты?',
            ['lemer', 'gyumolcs', 'merni'], 's_weigh')
        ]),
        S('s_where', L('A tej a hűtőpultnál van, a harmadik sorban.', 'The milk is at the fridge counter, in the third aisle.', 'Молоко у холодильной витрины, в третьем ряду.'), [
          O('Köszönöm szépen.', 'Thank you very much.', 'Большое спасибо.', ['koszon'], 's_bag')
        ]),
        S('s_weigh', L('Tegye a zacskót a mérlegre, nyomja meg a termék számát, és ragassza fel a címkét.',
                       'Put the bag on the scale, press the product number and stick on the label.',
                       'Поставьте пакет на весы, нажмите номер товара и наклейте этикетку.'), [
          O('Köszönöm, megpróbálom.', 'Thank you, I will try.', 'Спасибо, я попробую.', ['koszon', 'megprob'], 's_bag')
        ]),
        S('s_bag', L('A kasszánál: Kér szatyrot?', 'At the till: Would you like a bag?', 'На кассе: Вам нужен пакет?'), [
          O('Nem, van saját táskám.', 'No, I have my own bag.', 'Нет, у меня своя сумка.', ['=nem', 'sajat', 'taska'], 's_pay'),
          O('Igen, kérek egyet.', 'Yes, I would like one.', 'Да, один, пожалуйста.', ['=igen', 'egyet'], 's_pay')
        ]),
        S('s_pay', L('Kártyával vagy készpénzzel fizet?', 'Card or cash?', 'Картой или наличными?'), [
          O('Kártyával fizetek.', 'I will pay by card.', 'Я заплачу картой.', ['kartya'], 's_receipt'),
          O('Készpénzzel fizetek.', 'I will pay in cash.', 'Я заплачу наличными.', ['keszpenz'], 's_receipt')
        ]),
        S('s_receipt', L('Kéri a nyugtát?', 'Do you want the receipt?', 'Нужен ли вам чек?'), [
          O('Igen, kérem a nyugtát.', 'Yes, I would like the receipt.', 'Да, мне нужен чек.', ['=igen', 'nyugta'], 's_end'),
          O('Nem, köszönöm.', 'No, thank you.', 'Нет, спасибо.', ['=nem'], 's_end')
        ]),
        S('s_end', L('Köszönöm a vásárlást, viszontlátásra!', 'Thank you for shopping, goodbye!', 'Спасибо за покупку, до свидания!'), [], true)
      ]
    },
    {
      id: 'immigration',
      level: 'hard',
      title: { en: 'Immigration: book a renewal slot', ru: 'Иммиграционная служба: запись на продление' },
      intro: { en: 'You phone the immigration office to book an appointment to renew your permit.',
               ru: 'Вы звоните в иммиграционную службу, чтобы записаться на продление разрешения.' },
      start: 'i_start',
      steps: [
        S('i_start', L('Idegenrendészet, jó napot kívánok. Miben segíthetek?', 'Immigration office, good day. How can I help?', 'Иммиграционная служба, добрый день. Чем могу помочь?'), [
          O('Időpontot szeretnék kérni a tartózkodási engedélyem meghosszabbítására.',
            'I would like to book an appointment to renew my residence permit.',
            'Я хотела бы записаться на продление вида на жительство.',
            ['idopont', 'hosszabb', 'tartozkodasi'], 'i_type')
        ]),
        S('i_type', L('Milyen jogcímen tartózkodik Magyarországon?', 'On what basis are you staying in Hungary?', 'На каком основании вы находитесь в Венгрии?'), [
          O('Tanulmányi céllal, egyetemi hallgató vagyok.', 'For studies, I am a university student.', 'С целью учёбы, я студентка университета.',
            ['tanulm', 'egyetem', 'hallgato', 'diak'], 'i_expiry'),
          O('Munkavállalás céljából.', 'For work.', 'С целью работы.', ['munka'], 'i_expiry')
        ]),
        S('i_expiry', L('Mikor jár le a jelenlegi engedélye?', 'When does your current permit expire?', 'Когда истекает ваше текущее разрешение?'), [
          O('Három hónap múlva jár le.', 'It expires in three months. (give your own date)', 'Истекает через три месяца. (назовите свою дату)',
            [], 'i_slot', true)
        ]),
        S('i_slot', L('A legközelebbi szabad időpont jövő kedd, kilenc óra. Megfelel?',
                      'The next free slot is next Tuesday at nine. Does that suit you?',
                      'Ближайшее свободное время — в следующий вторник в девять. Подходит?'), [
          O('Igen, megfelel.', 'Yes, that suits me.', 'Да, подходит.', ['megfelel', '=igen'], 'i_docs'),
          O('Van korábbi időpont?', 'Is there an earlier slot?', 'Есть более раннее время?', ['korabbi', 'hamarabb'], 'i_slot2')
        ]),
        S('i_slot2', L('Sajnos korábban nincs. Jó lesz a keddi időpont?', 'Unfortunately not earlier. Will Tuesday do?', 'К сожалению, раньше нет. Вторник подойдёт?'), [
          O('Igen, jó lesz.', 'Yes, that will do.', 'Да, подойдёт.', ['jo', '=igen'], 'i_docs')
        ]),
        S('i_docs', L('Hozza magával az útlevelét, a lakcímkártyáját, az egyetemi igazolást és a biztosítási igazolást.',
                      'Bring your passport, address card, university certificate and insurance proof.',
                      'Возьмите паспорт, карту регистрации, справку из университета и подтверждение страховки.'), [
          O('Mit kell még hoznom?', 'What else do I need to bring?', 'Что ещё мне нужно принести?', ['mit', 'hozn'], 'i_more'),
          O('Rendben, köszönöm.', 'Okay, thank you.', 'Хорошо, спасибо.', ['rendben', 'koszon'], 'i_name')
        ]),
        S('i_more', L('Ha van, a bérleti szerződést is hozza. A pontos listát e-mailben is elküldjük.',
                      'If you have it, bring the rental contract too. We will also email the exact list.',
                      'Если есть, возьмите и договор аренды. Точный список мы пришлём и по e-mail.'), [
          O('Köszönöm.', 'Thank you.', 'Спасибо.', ['koszon'], 'i_name')
        ]),
        S('i_name', L('Kérem a nevét és az e-mail címét.', 'Your name and email address, please.', 'Назовите имя и адрес электронной почты.'), [
          O('Erkulova Alina, alina pont példa kukac gmail pont com.', 'Erkulova Alina, alina dot example at gmail dot com. (say your own)', 'Эркулова Алина, alina точка example собака gmail точка com. (назовите свой)',
            [], 'i_end', true)
        ]),
        S('i_end', L('Köszönöm, az időpontot rögzítettem. Viszontlátásra!', 'Thank you, the appointment is recorded. Goodbye!', 'Спасибо, время записано. До свидания!'), [], true)
      ]
    }
  ];

  /* ------------------------------------------------------------------ */
  /* Engine                                                             */
  /* ------------------------------------------------------------------ */

  function scenarioById(id) {
    for (var i = 0; i < SCENARIOS.length; i++) if (SCENARIOS[i].id === id) return SCENARIOS[i];
    return null;
  }

  function stepOf(session, id) {
    var steps = session.scenario.steps;
    for (var i = 0; i < steps.length; i++) if (steps[i].id === id) return steps[i];
    return null;
  }

  function currentStep(session) { return stepOf(session, session.stepId); }

  function start(scenarioId) {
    var scenario = scenarioById(scenarioId);
    if (!scenario) return null;
    var session = {
      scenario: scenario,
      stepId: scenario.start,
      said: [],          /* options the user has effectively chosen, in order */
      misses: 0,         /* consecutive unclear answers on the current step */
      done: false
    };
    var step = currentStep(session);
    session.done = step.end;
    return session;
  }

  function tokens(text) {
    return M.fold(text).split(' ').filter(function (t) { return t.length > 0; });
  }

  function keyHit(key, toks) {
    var exact = key.charAt(0) === '=';
    var k = M.fold(exact ? key.slice(1) : key);
    return toks.some(function (t) { return exact ? t === k : t.indexOf(k) === 0; });
  }

  /* Best option for the free text, or null. A keyed option wins over a
   * free one: "Nincs" must pick "no", not be swallowed as a name. */
  function matchOption(step, text) {
    var toks = tokens(text);
    if (!toks.length) return null;
    var best = null, bestScore = 0, free = null;
    step.options.forEach(function (opt) {
      if (opt.free) { free = opt; return; }
      var score = 0;
      opt.keys.forEach(function (k) { if (keyHit(k, toks)) score++; });
      if (score > bestScore) { best = opt; bestScore = score; }
    });
    if (best) return best;
    if (free && M.fold(text).replace(/\s/g, '').length >= 3) return free;
    return null;
  }

  function advance(session, option, typed) {
    session.said.push({ step: session.stepId, option: option, typed: typed || null });
    session.stepId = option.next;
    session.misses = 0;
    session.done = currentStep(session).end;
  }

  /* Free-text or spoken answer. */
  function say(session, text) {
    if (session.done) return { matched: false, finished: true };
    var step = currentStep(session);
    var option = matchOption(step, text);
    if (!option) {
      session.misses++;
      return { matched: false, finished: false, unclear: true };
    }
    advance(session, option, text);
    return { matched: true, option: option, finished: session.done };
  }

  /* Tapping a suggested reply is always understood. */
  function choose(session, optionIndex) {
    if (session.done) return { matched: false, finished: true };
    var option = currentStep(session).options[optionIndex];
    if (!option) return { matched: false, finished: false };
    advance(session, option);
    return { matched: true, option: option, finished: session.done };
  }

  window.AblakPractice = {
    SCENARIOS: SCENARIOS,
    UNCLEAR: UNCLEAR,
    start: start,
    say: say,
    choose: choose,
    currentStep: currentStep,
    matchOption: matchOption
  };

  /* ------------------------------------------------------------------ */
  /* UI — attaches only if the page has the panel                       */
  /* ------------------------------------------------------------------ */

  if (typeof document === 'undefined' || !document.getElementById ||
      !document.getElementById('practice-panel')) return;

  var I18n = window.AblakI18n;
  var Speech = window.AblakSpeech;
  var T = I18n.t;
  var $ = function (id) { return document.getElementById(id); };

  var speaker = new Speech.Speaker();
  var listener = null;
  var session = null;

  function gloss(obj) { return I18n.get() === 'ru' ? obj.ru : obj.en; }

  function rate() {
    var r = parseFloat(($('rate-range') || {}).value);
    return isNaN(r) ? 0.92 : r;
  }

  function speak(text) {
    return speaker.speak(text, 'hu-HU', { rate: rate() });
  }

  function bubble(who, line, extraClass) {
    var wrap = document.createElement('div');
    wrap.className = 'pr-bubble pr-' + who + (extraClass ? ' ' + extraClass : '');
    var name = document.createElement('span');
    name.className = 'pr-who';
    name.textContent = T(who === 'clerk' ? 'practice.clerk' : 'practice.you');
    var hu = document.createElement('p');
    hu.className = 'pr-hu';
    hu.textContent = line.hu;
    wrap.appendChild(name);
    wrap.appendChild(hu);
    if (line.en || line.ru) {
      var g = document.createElement('p');
      g.className = 'pr-gloss';
      g.textContent = gloss(line);
      wrap.appendChild(g);
    }
    $('practice-log').appendChild(wrap);
    wrap.scrollIntoView({ block: 'nearest' });
    return wrap;
  }

  var LEVELS = {
    easy:   { en: 'Easy', ru: 'Легко' },
    medium: { en: 'Medium', ru: 'Средне' },
    hard:   { en: 'Hard', ru: 'Сложно' }
  };
  var START = { en: 'Start practice →', ru: 'Начать →' };

  function renderPicker() {
    var root = $('practice-picker');
    root.innerHTML = '';
    SCENARIOS.forEach(function (sc) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scn-card' + (session && session.scenario.id === sc.id ? ' is-selected' : '');
      var title = document.createElement('span');
      title.className = 'scn-title';
      title.textContent = gloss(sc.title);
      var intro = document.createElement('span');
      intro.className = 'scn-intro';
      intro.textContent = gloss(sc.intro);
      var foot = document.createElement('span');
      foot.className = 'scn-foot';
      var badge = document.createElement('span');
      badge.className = 'badge badge-low';
      badge.textContent = gloss(LEVELS[sc.level] || LEVELS.easy);
      var go = document.createElement('span');
      go.className = 'scn-go';
      go.textContent = gloss(START);
      foot.appendChild(badge);
      foot.appendChild(go);
      b.appendChild(title);
      b.appendChild(intro);
      b.appendChild(foot);
      b.addEventListener('click', function () { begin(sc.id); });
      root.appendChild(b);
    });
  }

  function renderOptions() {
    var root = $('practice-options');
    root.innerHTML = '';
    if (!session || session.done) return;
    var hard = $('practice-hard').checked;
    root.hidden = hard;
    if (hard) return;
    currentStep(session).options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'say-btn';
      var s = document.createElement('span');
      s.textContent = opt.hu;
      var small = document.createElement('small');
      small.textContent = gloss(opt);
      b.appendChild(s);
      b.appendChild(small);
      b.addEventListener('click', function () { respond(function () { return choose(session, i); }, opt); });
      root.appendChild(b);
    });
  }

  function renderSummary() {
    var box = document.createElement('div');
    box.className = 'pr-summary';
    var h = document.createElement('strong');
    h.textContent = T('practice.done');
    box.appendChild(h);
    var p = document.createElement('p');
    p.textContent = T('practice.summary');
    box.appendChild(p);
    var ul = document.createElement('ul');
    session.said.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = (s.typed || s.option.hu) + ' — ' + gloss(s.option);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    $('practice-log').appendChild(box);
    box.scrollIntoView({ block: 'nearest' });
  }

  function clerkTurn() {
    var step = currentStep(session);
    bubble('clerk', step.clerk);
    renderOptions();
    $('practice-input-row').hidden = session.done;
    if (session.done) renderSummary();
    return speak(step.clerk.hu);
  }

  /* run(): performs the answer; opt: the option shown to the user if the
   * answer was a tap (a typed answer shows what the user actually typed). */
  function respond(run, tapped, typed) {
    if (!session || session.done) return;
    var result = run();
    if (!result.matched) {
      bubble('you', { hu: typed || '' });
      bubble('clerk', UNCLEAR, 'pr-unclear');
      speak(UNCLEAR.hu);
      return;
    }
    var shown = typed ? { hu: typed, en: result.option.en, ru: result.option.ru }
                      : result.option;
    bubble('you', shown);
    if (typed) { clerkTurn(); return; }
    /* Tapped reply: let the user hear the Hungarian first, then the clerk. */
    speak(result.option.hu).then(function () { clerkTurn(); });
  }

  function begin(id) {
    if (listener) { try { listener.stop(); } catch (e) {} }
    session = start(id);
    $('practice-session').hidden = false;
    $('practice-name').textContent = gloss(session.scenario.title);
    $('practice-intro').textContent = gloss(session.scenario.intro);
    renderPicker();
    $('practice-log').innerHTML = '';
    $('practice-input').value = '';
    clerkTurn();
  }

  function exit() {
    if (listener) { try { listener.stop(); } catch (e) {} }
    speaker.stop();
    session = null;
    $('practice-session').hidden = true;
  }

  function send() {
    var input = $('practice-input');
    var text = input.value.trim();
    if (!text || !session || session.done) return;
    input.value = '';
    respond(function () { return say(session, text); }, null, text);
  }

  function setupMic() {
    var btn = $('practice-mic');
    if (!window.AblakRecognition.isSupported()) { btn.hidden = true; return; }
    btn.addEventListener('click', function () {
      /* The main listener and this one cannot share the microphone. */
      var main = $('mic-btn');
      if (main && main.classList.contains('is-listening')) main.click();
      if (listener && btn.classList.contains('is-listening')) { listener.stop(); return; }
      listener = window.AblakRecognition.create({
        lang: 'hu-HU',
        onFinal: function (text) {
          listener.stop();
          if (!session || session.done) return;
          respond(function () { return say(session, text); }, null, text);
        },
        onStateChange: function (s) {
          btn.classList.toggle('is-listening', s === 'listening');
        },
        onError: function () { btn.classList.remove('is-listening'); }
      });
      listener.start();
    });
  }

  function rerender() {
    renderPicker();
    if (session) {
      $('practice-name').textContent = gloss(session.scenario.title);
      $('practice-intro').textContent = gloss(session.scenario.intro);
      renderOptions();
    }
  }

  $('practice-send').addEventListener('click', send);
  $('practice-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); send(); }
  });
  $('practice-restart').addEventListener('click', function () { if (session) begin(session.scenario.id); });
  $('practice-exit').addEventListener('click', exit);
  $('practice-hard').addEventListener('change', renderOptions);
  setupMic();
  renderPicker();

  window.AblakPractice.rerender = rerender;
})();
