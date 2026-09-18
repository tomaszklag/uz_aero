/**
 * Ninerdeck - LUSTRO POLITYKI HASŁA dla strony `/haslo/` (2.1.0, H-F F3, D4).
 *
 * ══ DLACZEGO LUSTRO, A NIE IMPORT DOMENY ══
 * `packages/domain/src/auth/passwordPolicy.ts` jest źródłem prawdy dla serwera, telefonu
 * i panelu - każde z nich po prostu je importuje. Strona nie może: `site/` jest
 * ŚWIADOMIE poza workspace'ami npm i jej skrypty budujące nie mają ani jednej zależności
 * (`site/README.md`), a wciągnięcie TypeScriptu do przeglądarki wymagałoby pierwszej.
 * Dopisanie `site/` do `workspaces` ruszyłoby lockfile i obie linijki `npm ci -w …`
 * w `Dockerfile` - za jeden plik.
 *
 * Zamiast tego: lustro tutaj i TEST RÓWNOŚCI w `app/src/__tests__/passwordPolicyMirror.test.ts`,
 * który puszcza obie implementacje przez tę samą tablicę przypadków. Rozjazd przewraca
 * testy, a nie ustawianie hasła.
 *
 * ══ LUSTRO JEST MNIEJSZE NIŻ ORYGINAŁ I TO NIE JEST NIEDBAŁOŚĆ ══
 * Domena odrzuca też hasło zawierające ADRES albo NAZWISKO osoby (`contains_email`,
 * `contains_name`). Strona nie zna ani jednego, ani drugiego: token z linku jest
 * nieprzezroczysty i celowo niczego o człowieku nie zdradza. Te dwa powody rozstrzyga
 * więc SERWER i wracają jako `400 weak_password { reason }`, a strona pokazuje je pod
 * polem - patrz `haslo.js`. Tu zostaje to, co da się sprawdzić bez tożsamości: długość
 * i lista zablokowanych.
 */
(function (global) {
  'use strict';

  var MIN_LENGTH = 12;
  var MAX_LENGTH = 128;

  /** Kopia `PASSWORD_BLOCKLIST` z domeny - kolejność i treść pilnuje test równości. */
  var BLOCKLIST = [
    '123456789012',
    '1234567890123',
    '12345678901234',
    '111111111111',
    '000000000000',
    'qwertyuiop12',
    'qwertyuiopas',
    'qwertyuiopasdf',
    'qwertyuiopasdfgh',
    'password1234',
    'password12345',
    'passwordpassword',
    'haslohaslo12',
    'haslo1234567',
    'haslo12345678',
    'mojehaslo123',
    'zaq12wsxcde3',
    'zaq1xsw2cde3',
    '1q2w3e4r5t6y',
    'iloveyou1234',
    'aaaaaaaaaaaa',
    'abcdefghijkl',
    'abcd12345678',
    'admin1234567',
    'administrator',
    'administrator1',
    'ninerdeck123',
    'ninerdeck1234',
    'ninerdeckninerdeck',
    'aeroklub1234',
    'aeroklubaeroklub',
    'samolot12345',
    'samolotsamolot',
    'lotnisko1234',
    'pilotpilot12',
    'pilot1234567',
    'skoki1234567',
    'cessna152cessna',
    'cessna172cessna',
  ];

  /** Długość w PUNKTACH KODOWYCH - `'🛩️'.length` to 3, a znak jest jeden. */
  function codePoints(text) {
    return Array.from(text).length;
  }

  /**
   * Normalizacja do porównań: małe litery, bez znaków diakrytycznych (NFD + wycięcie
   * znaków łączących; `ł` nie ma rozkładu NFD, więc osobno), bez odstępów.
   * Znak w znak to samo, co `normalize` w domenie - i to jest przedmiot testu równości.
   */
  function normalize(text) {
    return text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[łŁ]/g, 'l')
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  var normalized = null;
  function blocklist() {
    if (normalized === null) {
      normalized = BLOCKLIST.map(normalize);
    }
    return normalized;
  }

  /**
   * Powód odrzucenia albo `null`. Te same kody, co w domenie - strona nadaje im napisy
   * u siebie, bo domena nie zna języka interfejsu.
   *
   * Kolejność odpowiada POWADZE, jak w domenie: długość jest warunkiem twardym
   * i najtańszym, lista zablokowanych drugim.
   */
  function checkPassword(password) {
    var length = codePoints(password);
    if (length < MIN_LENGTH) return 'too_short';
    if (length > MAX_LENGTH) return 'too_long';
    if (blocklist().indexOf(normalize(password)) !== -1) return 'blocklisted';
    return null;
  }

  global.NinerdeckPasswordPolicy = {
    MIN_LENGTH: MIN_LENGTH,
    MAX_LENGTH: MAX_LENGTH,
    BLOCKLIST: BLOCKLIST,
    normalize: normalize,
    checkPassword: checkPassword,
  };
})(window);
