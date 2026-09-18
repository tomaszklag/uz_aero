/**
 * Ninerdeck - strona `/haslo/`: realizacja linku z e-maila (2.1.0, H-F F3; §3.3, §5.4).
 *
 * ══ OSOBNY PLIK, NIE SKRYPT W TREŚCI STRONY ══
 * Ta jedna strona ma WŁASNĄ, ścisłą politykę bezpieczeństwa (`staticSite.ts`,
 * `PASSWORD_PAGE_CSP`) - bez `'unsafe-inline'` - bo jako jedyna na całej stronie ma pole
 * HASŁA i stoi na origin panelu. Skrypt w treści pliku wymagałby luzu, którego właśnie
 * tu nie chcemy.
 *
 * ══ TOKEN JEDZIE WE FRAGMENCIE ADRESU ══
 * `/haslo/#<token>` - fragment nie trafia do logów serwera ani do nagłówka `Referer`,
 * a przeglądarka niesie go przez przekierowanie z hosta strony na host aplikacji
 * (`hostSplit.ts`). Sesji ta strona NIE dostaje: człowiek loguje się potem hasłem tam,
 * gdzie pracuje, więc token z e-maila nigdy nie staje się poświadczeniem.
 *
 * ══ CZTERY ODPOWIEDZI SERWERA, TRZY RÓŻNE ZDANIA ══
 *   204            → stan „gotowe";
 *   400 weak_password → ZOSTAJEMY NA FORMULARZU z powodem pod polem. To jest jedyna
 *                    odmowa, która NIE spala linku - pokazanie tu „link nie działa"
 *                    (tak robił szkic) odsyłałoby człowieka po nowy list w kółko,
 *                    choć ten, który ma, jest całkiem sprawny;
 *   401            → stan „link wygasł albo został użyty" (token obcy, po terminie,
 *                    zużyty - żaden z nich nie ma innej drogi wyjścia niż nowy link);
 *   brak sieci     → zdanie pod przyciskiem, formularz czynny. „Nie wiem, czy poszło"
 *                    to inna wiadomość niż „nie udało się".
 */
(function () {
  'use strict';

  var policy = window.NinerdeckPasswordPolicy;
  var main = document.querySelector('main.haslo');
  var form = document.getElementById('reset');
  var pass = document.getElementById('pass');
  var pass2 = document.getElementById('pass2');
  var hint = document.getElementById('pass-hint');
  var hint2 = document.getElementById('pass2-hint');
  var submit = document.getElementById('submit');

  var SUBMIT_LABEL = submit.innerHTML;

  /**
   * Zdania polityki - po jednym na powód z domeny.
   *
   * `contains_email` i `contains_name` przychodzą WYŁĄCZNIE z serwera: strona nie zna
   * ani adresu, ani nazwiska (token niczego o człowieku nie zdradza), więc sama ich nie
   * postawi - ale musi umieć je napisać, gdy serwer je odeśle.
   */
  var WEAKNESS_TEXT = {
    too_short: 'Co najmniej ' + policy.MIN_LENGTH + ' znaków.',
    too_long: 'Najwyżej ' + policy.MAX_LENGTH + ' znaków.',
    blocklisted: 'Za łatwe do odgadnięcia - wybierz inne.',
    contains_email: 'Za łatwe do odgadnięcia - zawiera Twój adres.',
    contains_name: 'Za łatwe do odgadnięcia - zawiera Twoje nazwisko.',
  };

  var weaknessText = function (reason) {
    return WEAKNESS_TEXT[reason] || 'Wybierz inne hasło.';
  };

  /** Ustawia zdanie pod polem; `null` = pole milczy. */
  function say(el, input, text, tone) {
    el.textContent = text || '';
    el.className = 'hint' + (text ? ' ' + tone : '');
    input.classList.toggle('invalid', Boolean(text) && tone === 'bad');
  }

  /**
   * Stan formularza po każdej zmianie.
   *
   * PUSTE POLE NIE DOSTAJE WYKŁADU: dopóki nic nie wpisano, zdania nie ma, a przycisk
   * jest zablokowany BEZ powodu - blokadę widać z pól nad nim. Zdanie pada dopiero
   * wtedy, gdy coś JEST wpisane i jest z tym problem.
   *
   * Powtórka odzywa się dopiero, gdy jest niepusta: czerwona ramka pod drugim polem
   * w chwili, gdy ktoś skończył pisać pierwsze, jest zarzutem postawionym za wcześnie.
   */
  function refresh() {
    var value = pass.value;
    var weakness = value.length === 0 ? null : policy.checkPassword(value);

    if (value.length === 0) say(hint, pass, null);
    else if (weakness) say(hint, pass, weaknessText(weakness), 'bad');
    else say(hint, pass, 'W porządku - bez wymogów co do rodzaju znaków.', 'ok');

    var same = pass2.value.length > 0 && pass2.value === pass.value;
    say(hint2, pass2, pass2.value.length > 0 && !same ? 'Hasła się różnią.' : null, 'bad');

    submit.disabled = !(value.length > 0 && !weakness && same);
  }

  /** Przełącznik „pokaż" - ikona mówi, CO ZROBI tapnięcie, nie jaki jest stan. */
  function bindEye(btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-toggle'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Ukryj hasło' : 'Pokaż hasło');
    });
  }

  /** Przywraca napis przycisku; o tym, czy jest czynny, rozstrzyga `refresh`. */
  function restoreSubmitLabel() {
    submit.innerHTML = SUBMIT_LABEL;
  }

  /**
   * Fragment adresu: token linku albo kotwica stanu podglądowego (zostaje po szkicu H-A -
   * `#wygasl` i `#gotowe` pozwalają obejrzeć pozostałe dwa stany bez ważnego linku).
   * Wejście BEZ tokenu nie ma czego ustawiać, więc od razu pokazuje stan „link nie działa".
   */
  var fragment = (location.hash || '').slice(1);
  var token = fragment;
  // Kotwice podglądowe SPRAWDZAMY PIERWSZE: obie są krótsze niż próg tokenu, więc
  // zwinięte z nim w jeden warunek wpadałyby w „link nie działa".
  if (fragment === 'wygasl') main.dataset.state = 'expired';
  else if (fragment === 'gotowe') main.dataset.state = 'done';
  else if (fragment.length < 20) main.dataset.state = 'expired';

  pass.addEventListener('input', refresh);
  pass2.addEventListener('input', refresh);
  Array.prototype.forEach.call(document.querySelectorAll('.eye'), bindEye);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    submit.textContent = 'Ustawianie…';

    fetch('../auth/password/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token, password: pass.value }),
    })
      .then(function (res) {
        if (res.status === 204) {
          main.dataset.state = 'done';
          return null;
        }
        if (res.status === 400) {
          // Polityka odrzuciła hasło, którego strona nie mogła sprawdzić sama (adres,
          // nazwisko). Link ŻYJE - zostajemy na formularzu i mówimy, co poprawić.
          // Pusty obiekt, nie `null`: brak ciała nie może wyglądać jak inna gałąź.
          return res.json().catch(function () {
            return {};
          });
        }
        main.dataset.state = 'expired';
        return null;
      })
      .then(function (weak) {
        if (weak === null) return;
        restoreSubmitLabel();
        say(hint, pass, weaknessText(weak.reason), 'bad');
        // Przycisk zostaje zablokowany aż do poprawki - `refresh` odblokuje go sam,
        // gdy człowiek zmieni wpis. Serwer właśnie powiedział, że TO hasło nie przejdzie.
        submit.disabled = true;
      })
      .catch(function () {
        restoreSubmitLabel();
        submit.disabled = false;
        say(hint2, pass2, 'Nie ma połączenia z serwerem. Spróbuj za chwilę.', 'bad');
      });
  });

  refresh();
})();
