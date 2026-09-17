/**
 * Ninerdeck - zmienne środowiskowe profilu builda z `eas.json` dla aktualizacji OTA.
 *
 * Czysta logika bez importów Node (testy: `src/__tests__/easProfileEnv.test.ts`).
 *
 * Kontekst: `eas update` NIE CZYTA `build.<profil>.env` z `eas.json` - to pole obsługuje
 * wyłącznie `eas build`. Aktualizacja OTA brała więc `EXPO_PUBLIC_*` z lokalnego `app/.env`,
 * w którym adres serwera jest w dev ZAKOMENTOWANY, i wysłałaby telefonom bundle
 * z fallbackiem `apiBaseUrl()` na localhost (`hostUri` istnieje tylko pod Metro). Runner
 * `eas-update.js` wstrzykuje zmienne profilu do środowiska PRZED wywołaniem `eas-cli`,
 * więc build i OTA czytają JEDNO źródło - a tutaj mieszka reguła, co w tym źródle musi być.
 */

'use strict';

/**
 * Zmienne, bez których bundle produkcyjny jest wadliwy - brak to ODMOWA, nie ostrzeżenie:
 * adres serwera (inaczej localhost) i klient Google (inaczej logowanie mówi „ta wersja
 * aplikacji nie ma skonfigurowanego logowania").
 */
const REQUIRED = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'];

/**
 * Zmienne profilu builda gotowe do wstrzyknięcia w środowisko `eas update`.
 *
 * @param {unknown} easJson sparsowane `eas.json`
 * @param {string} profile nazwa profilu builda (`production`)
 * @returns {Record<string, string>}
 */
function profileEnv(easJson, profile) {
  const build = easJson != null && typeof easJson === 'object' ? easJson.build : undefined;
  const env = build != null && typeof build === 'object' ? build[profile]?.env : undefined;
  if (env == null || typeof env !== 'object') {
    throw new Error(`eas.json: profil "${profile}" nie ma sekcji env`);
  }
  for (const name of REQUIRED) {
    const value = env[name];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `eas.json: profil "${profile}" nie ustawia ${name} - aktualizacja OTA bez niego ` +
          'wysłałaby telefonom wadliwy bundle',
      );
    }
  }
  // Produkcja rozmawia z serwerem wyłącznie po TLS: `http://` w tym polu to zwykle adres
  // LAN z dev wklejony w zły profil, a bundle z nim odcina każdy telefon poza tą siecią.
  const apiUrl = env.EXPO_PUBLIC_API_URL;
  if (!/^https:\/\/[^/\s]+/.test(apiUrl)) {
    throw new Error(`eas.json: profil "${profile}" ma EXPO_PUBLIC_API_URL bez https:// (${apiUrl})`);
  }
  return { ...env };
}

module.exports = { profileEnv, REQUIRED };
