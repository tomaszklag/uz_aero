/**
 * Ninerdeck - cel aktualizacji OTA odczytany z `eas.json`
 * (`scripts/eas-profile-env.js`, runner `scripts/eas-update.js`).
 *
 * Kontekst: `eas update` nie czyta `build.<profil>.env` z `eas.json`, więc aktualizacja
 * brała adres serwera z lokalnego `.env` - w dev ZAKOMENTOWANY - i wysłałaby telefonom
 * bundle z fallbackiem `apiBaseUrl()` na localhost. Runner ma odmówić, zanim cokolwiek
 * pójdzie na serwer EAS.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEVELOPMENT_VARIANT } from '../../scripts/app-variant';
import { REQUIRED, profileTarget } from '../../scripts/eas-profile-env';

const profileWith = (channel: string, env: Record<string, unknown>) => ({
  build: { some: { channel, env } },
});

const OK = {
  EXPO_PUBLIC_API_URL: 'https://app.ninerdeck.pl',
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: '1-abc.apps.googleusercontent.com',
};

const without = (name: keyof typeof OK): Record<string, unknown> => {
  const rest: Record<string, unknown> = { ...OK };
  delete rest[name];
  return rest;
};

describe('profileTarget - kanał i zmienne profilu builda dla `eas update`', () => {
  it('oddaje kanał profilu i komplet jego zmiennych', () => {
    expect(profileTarget(profileWith('production', OK), 'some')).toEqual({
      channel: 'production',
      env: OK,
    });
  });

  it('odmawia bez adresu serwera - bundle poszedłby z fallbackiem na localhost', () => {
    expect(() =>
      profileTarget(profileWith('production', without('EXPO_PUBLIC_API_URL')), 'some'),
    ).toThrow(/EXPO_PUBLIC_API_URL/);
    expect(() =>
      profileTarget(profileWith('production', { ...OK, EXPO_PUBLIC_API_URL: '   ' }), 'some'),
    ).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('odmawia bez klienta Google - logowanie nie miałoby innej drogi', () => {
    expect(() =>
      profileTarget(
        profileWith('production', without('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID')),
        'some',
      ),
    ).toThrow(/EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID/);
  });

  it('odmawia przy adresie bez https:// - to zwykle adres LAN z dev w złym profilu', () => {
    expect(() =>
      profileTarget(
        profileWith('production', { ...OK, EXPO_PUBLIC_API_URL: 'http://192.168.1.20:3000' }),
        'some',
      ),
    ).toThrow(/https/);
  });

  it('odmawia, gdy profil nie ma kanału - aktualizacja nie ma dokąd pojechać', () => {
    expect(() => profileTarget({ build: { some: { env: OK } } }, 'some')).toThrow(/kanał/);
    expect(() => profileTarget({ build: { some: { channel: '  ', env: OK } } }, 'some')).toThrow(
      /kanał/,
    );
  });

  it('odmawia, gdy profil nie ma sekcji env albo eas.json ma inny kształt', () => {
    expect(() => profileTarget({ build: { some: { channel: 'x' } } }, 'some')).toThrow(/env/);
    expect(() => profileTarget({ build: {} }, 'some')).toThrow(/some/);
    expect(() => profileTarget(null, 'some')).toThrow(/some/);
    expect(() => profileTarget({ build: { other: { channel: 'x', env: OK } } }, 'some')).toThrow(
      /some/,
    );
  });

  it('nie dotyka innych zmiennych profilu - jadą dalej bez zmian', () => {
    const env = { ...OK, EXPO_PUBLIC_EXTRA: 'x' };
    expect(profileTarget(profileWith('production', env), 'some').env).toEqual(env);
  });

  it('lista wymaganych to dokładnie adres serwera i klient Google', () => {
    expect(REQUIRED).toEqual(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID']);
  });
});

describe('eas.json w repozytorium', () => {
  const easJson = JSON.parse(readFileSync(join(__dirname, '../../eas.json'), 'utf8')) as {
    build: Record<
      string,
      { channel?: string; env?: Record<string, string>; developmentClient?: boolean }
    >;
  };

  it('profil production jedzie kanałem production na własny adres Ninerdeck', () => {
    const target = profileTarget(easJson, 'production');
    expect(target.channel).toBe('production');
    // Własna domena od issue #124: adres nadany przez hosting przestał obowiązywać.
    expect(target.env.EXPO_PUBLIC_API_URL).toBe('https://app.ninerdeck.pl');
  });

  it('profil production mówi JAWNIE APP_VARIANT=production - OTA nie odziedziczy wariantu dev z lokalnego .env', () => {
    // Runner wstrzykuje env profilu do procesu `eas-cli`, a zmienne procesu wygrywają
    // z `.env` Expo. Bez tego wpisu `eas update` na komputerze z `APP_VARIANT=development`
    // w `app/.env` pakowałoby manifest z nazwą i pakietem wariantu deweloperskiego.
    expect(profileTarget(easJson, 'production').env.APP_VARIANT).toBe('production');
  });

  it('profil development buduje wariant dev i NIE ustawia adresu serwera ani klienta Google', () => {
    // Dev client bierze JS z Metro, więc adres i klient Google przychodzą z `app/.env`
    // w chwili bundlowania - wartość w profilu nie miałaby jak trafić do aplikacji,
    // a klient produkcyjny i tak jest związany z innym pakietem.
    const development = easJson.build.development;
    expect(development.developmentClient).toBe(true);
    expect(development.env?.APP_VARIANT).toBe(DEVELOPMENT_VARIANT);
    expect(development.env?.EXPO_PUBLIC_API_URL).toBeUndefined();
    expect(development.env?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID).toBeUndefined();
  });

  it('profilu development nie da się opublikować runnerem - i tak ma być', () => {
    // Bundle dev builda powstaje lokalnie pod Metro, więc publikowanie go na kanał
    // `development` wysłałoby aplikację bez adresu serwera.
    expect(() => profileTarget(easJson, 'development')).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});
