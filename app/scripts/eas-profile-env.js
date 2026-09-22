/**
 * Ninerdeck - CEL aktualizacji OTA odczytany z `eas.json`: kanał i zmienne profilu builda.
 *
 * Czysta logika bez importów Node (testy: `src/__tests__/easProfileEnv.test.ts`).
 *
 * Kontekst: `eas update` NIE CZYTA `build.<profil>.env` z `eas.json` - to pole obsługuje
 * wyłącznie `eas build`. Aktualizacja OTA brała więc `EXPO_PUBLIC_*` z lokalnego `app/.env`,
 * w którym adres serwera jest w dev ZAKOMENTOWANY, i wysłałaby telefonom bundle
 * z fallbackiem `apiBaseUrl()` na localhost. Runner `eas-update.js` wstrzykuje zmienne
 * profilu do środowiska PRZED wywołaniem `eas-cli`, więc build i OTA czytają JEDNO
 * źródło - a tutaj mieszka reguła, co w tym źródle musi być.
 *
 * ══ GAŁĄŹ = KANAŁ PROFILU ══
 * Binarka pyta o aktualizacje swojego KANAŁU (`build.<profil>.channel`), a `eas update`
 * publikuje na GAŁĄŹ - wiąże je mapowanie kanał→gałąź o tej samej nazwie. Gałąź
 * wyprowadzamy więc z kanału profilu, zamiast trzymać ją drugą stałą obok: dwie
 * wartości opisujące jedno wydanie rozjeżdżają się po cichu, a cichy rozjazd tutaj
 * znaczy aktualizację wysłaną tam, gdzie nikt jej nie czeka.
 *
 * ══ OTA MA DZIŚ JEDEN CEL: PROFIL `production` ══
 * Profil `development` NIE NIESIE adresu serwera ani klienta Google i nie ma ich nieść:
 * dev build ładuje JS z Metro, więc obie wartości przychodzą z `app/.env` w chwili
 * bundlowania. Wywołanie tej funkcji dla `development` skończy się odmową i to jest
 * poprawne - nie ma czego publikować na kanał, którego bundle i tak powstaje lokalnie.
 */

'use strict';

/**
 * Zmienne, bez których bundle jest wadliwy - brak to ODMOWA, nie ostrzeżenie: adres
 * serwera (inaczej localhost) i klient Google (inaczej logowanie mówi „ta wersja
 * aplikacji nie ma skonfigurowanego logowania").
 */
const REQUIRED = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'];

/** Po co ta zmienna - żeby odmowa mówiła o SKUTKU braku, a nie tylko o nazwie pola. */
const REASONS = {
  EXPO_PUBLIC_API_URL: 'bundle poszedłby z adresem zastępczym na localhost',
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID:
    'logowanie mówiłoby, że ta wersja aplikacji nie ma skonfigurowanego Google',
};

/**
 * Cel aktualizacji: kanał (czyli gałąź) i komplet zmiennych profilu, gotowy do
 * wstrzyknięcia w środowisko `eas update`.
 *
 * @param {unknown} easJson sparsowane `eas.json`
 * @param {string} profile nazwa profilu builda (`production`)
 * @returns {{ channel: string, env: Record<string, string> }}
 */
function profileTarget(easJson, profile) {
  const build = easJson != null && typeof easJson === 'object' ? easJson.build : undefined;
  const entry = build != null && typeof build === 'object' ? build[profile] : undefined;
  if (entry == null || typeof entry !== 'object') {
    throw new Error(`eas.json: nie ma profilu "${profile}"`);
  }

  const channel = entry.channel;
  if (typeof channel !== 'string' || channel.trim() === '') {
    throw new Error(
      `eas.json: profil "${profile}" nie ma kanału - aktualizacja nie ma dokąd pojechać`,
    );
  }

  const env = entry.env;
  if (env == null || typeof env !== 'object') {
    throw new Error(`eas.json: profil "${profile}" nie ma sekcji env`);
  }

  for (const name of REQUIRED) {
    const value = env[name];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`eas.json: profil "${profile}" nie ustawia ${name} - ${REASONS[name]}`);
    }
  }

  // Aplikacja rozmawia z serwerem wyłącznie po TLS: `http://` w tym polu to zwykle adres
  // LAN z dev wklejony w zły profil, a bundle z nim odcina każdy telefon poza tą siecią.
  const apiUrl = env.EXPO_PUBLIC_API_URL;
  if (!/^https:\/\/[^/\s]+/.test(apiUrl)) {
    throw new Error(`eas.json: profil "${profile}" ma EXPO_PUBLIC_API_URL bez https:// (${apiUrl})`);
  }

  return { channel, env: { ...env } };
}

module.exports = { profileTarget, REQUIRED };
