/**
 * Ninerdeck - PLIK `google-services.json` W KONFIGURACJI EXPO (3.1.0, epik R-J, J1/Z2).
 *
 * Powiadomienia push na Androidzie idą przez FCM, a FCM potrzebuje w aplikacji pliku
 * konfiguracyjnego Firebase (`android.googleServicesFile`). Plik NIE leży w repozytorium:
 * repozytorium jest publiczne, a choć sam plik nie jest sekretem (to konfiguracja
 * klienta), Google odradza jego publikowanie - i nie ma po co, skoro build i tak
 * dostaje go inaczej. Trzy źródła, w tej kolejności:
 *
 *  1. zmienna `GOOGLE_SERVICES_JSON` - ŚCIEŻKA do pliku, którą podaje EAS z własnej
 *     zmiennej środowiskowej typu „file" (`eas env:create --scope project
 *     --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json`);
 *     to jest droga buildu produkcyjnego i dev builda;
 *  2. lokalny `app/google-services.json` (w `.gitignore`) - komputer dewelopera przy
 *     `expo run:android`;
 *  3. nic - konfiguracja zostaje BEZ pola. Metro tego pola nie czyta, więc `npm run app`
 *     działa jak dotąd; build EAS bez pliku przejdzie, ale `getExpoPushTokenAsync` na
 *     telefonie odpowie błędem i telefon po prostu nie zarejestruje tokenu (§12.1:
 *     budzik, który nie dzwoni, niczego nie gubi).
 *
 * Czysty CommonJS bez importów Node (jak `app-variant.js`): czyta go `app.config.js`
 * gołym Node, a test podaje istnienie pliku funkcją.
 */

'use strict';

/** Zmienna EAS/typu „file" ze ścieżką do pliku Firebase. */
const GOOGLE_SERVICES_ENV = 'GOOGLE_SERVICES_JSON';

/** Lokalna kopia dewelopera - względem katalogu `app/`. */
const LOCAL_GOOGLE_SERVICES = './google-services.json';

/**
 * Ścieżka pliku Firebase dla tego uruchomienia albo `null`, gdy go nie ma.
 * @param {Record<string, string | undefined> | undefined} env
 * @param {(relativePath: string) => boolean} exists czy plik istnieje (względem `app/`)
 * @returns {string | null}
 */
function googleServicesFile(env, exists) {
  const fromEnv = env == null ? undefined : env[GOOGLE_SERVICES_ENV];
  if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv;
  return exists(LOCAL_GOOGLE_SERVICES) ? LOCAL_GOOGLE_SERVICES : null;
}

/**
 * Konfiguracja Expo z polem `android.googleServicesFile` - albo BEZ ZMIAN (ten sam
 * obiekt), gdy pliku nie ma z żadnego źródła.
 * @param {Record<string, any>} config
 * @param {Record<string, string | undefined> | undefined} env
 * @param {(relativePath: string) => boolean} exists
 * @returns {Record<string, any>}
 */
function withGoogleServices(config, env, exists) {
  const file = googleServicesFile(env, exists);
  if (file == null) return config;
  return { ...config, android: { ...config.android, googleServicesFile: file } };
}

module.exports = { GOOGLE_SERVICES_ENV, LOCAL_GOOGLE_SERVICES, googleServicesFile, withGoogleServices };
