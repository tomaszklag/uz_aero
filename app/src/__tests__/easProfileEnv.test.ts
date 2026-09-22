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
import {
  PILOT_CHANNEL,
  PILOT_REQUIRED,
  REQUIRED,
  profileTarget,
  requiredFor,
} from '../../scripts/eas-profile-env';

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
    expect(profileTarget(profileWith(PILOT_CHANNEL, OK), 'some')).toEqual({
      channel: PILOT_CHANNEL,
      env: OK,
    });
  });

  it('odmawia bez adresu serwera - bundle poszedłby z fallbackiem na localhost', () => {
    expect(() =>
      profileTarget(profileWith(PILOT_CHANNEL, without('EXPO_PUBLIC_API_URL')), 'some'),
    ).toThrow(/EXPO_PUBLIC_API_URL/);
    expect(() =>
      profileTarget(profileWith(PILOT_CHANNEL, { ...OK, EXPO_PUBLIC_API_URL: '   ' }), 'some'),
    ).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('odmawia bez adresu serwera TAKŻE poza kanałem pilotów', () => {
    // Staging jest zdalny jak produkcja - bundle bez adresu nie ma z czym rozmawiać.
    expect(() =>
      profileTarget(profileWith('development', without('EXPO_PUBLIC_API_URL')), 'some'),
    ).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('odmawia bez klienta Google w kanale PILOTÓW - logowanie nie miałoby innej drogi', () => {
    expect(() =>
      profileTarget(
        profileWith(PILOT_CHANNEL, without('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID')),
        'some',
      ),
    ).toThrow(/EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID/);
  });

  it('PRZEPUSZCZA brak klienta Google poza kanałem pilotów - na staging loguje się hasłem', () => {
    // Klient Google jest związany z pakietem `com.ninerdeck.app.dev` i bywa go po prostu
    // brak; wymóg blokowałby próbę generalną wydania z powodu, który jej nie dotyczy.
    const target = profileTarget(
      profileWith('development', without('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID')),
      'some',
    );
    expect(target.channel).toBe('development');
    expect(target.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID).toBeUndefined();
  });

  it('odmawia przy adresie bez https:// - to zwykle adres LAN z dev w złym profilu', () => {
    expect(() =>
      profileTarget(
        profileWith(PILOT_CHANNEL, { ...OK, EXPO_PUBLIC_API_URL: 'http://192.168.1.20:3000' }),
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
    expect(profileTarget(profileWith(PILOT_CHANNEL, env), 'some').env).toEqual(env);
  });

  it('wymagania rosną tylko w kanale pilotów', () => {
    expect(REQUIRED).toEqual(['EXPO_PUBLIC_API_URL']);
    expect(PILOT_REQUIRED).toEqual(['EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID']);
    expect(requiredFor(PILOT_CHANNEL)).toEqual([...REQUIRED, ...PILOT_REQUIRED]);
    expect(requiredFor('development')).toEqual(REQUIRED);
  });
});

describe('eas.json w repozytorium', () => {
  const easJson = JSON.parse(readFileSync(join(__dirname, '../../eas.json'), 'utf8')) as {
    build: Record<string, { env?: Record<string, string>; developmentClient?: boolean }>;
  };

  it('profil production jedzie kanałem pilotów na własny adres Ninerdeck', () => {
    const target = profileTarget(easJson, 'production');
    expect(target.channel).toBe(PILOT_CHANNEL);
    // Własna domena od issue #124: adres nadany przez hosting przestał obowiązywać.
    expect(target.env.EXPO_PUBLIC_API_URL).toBe('https://app.ninerdeck.pl');
  });

  it('profil production mówi JAWNIE APP_VARIANT=production - OTA nie odziedziczy wariantu dev z lokalnego .env', () => {
    // Runner wstrzykuje env profilu do procesu `eas-cli`, a zmienne procesu wygrywają
    // z `.env` Expo. Bez tego wpisu `eas update` na komputerze z `APP_VARIANT=development`
    // w `app/.env` pakowałoby manifest z nazwą i pakietem wariantu deweloperskiego.
    expect(profileTarget(easJson, 'production').env.APP_VARIANT).toBe('production');
  });

  it('profil development buduje wariant dev i wskazuje STAGING', () => {
    // Kanał dev builda niesie aktualizacje próby generalnej (`docs/staging.md`): telefon
    // bez Metro bierze z niego bundle, więc adres musi stać w profilu. Przy pracy z Metro
    // wygrywa `app/.env` - Expo bundluje wtedy lokalnie i to stamtąd bierze zmienne.
    const target = profileTarget(easJson, 'development');
    expect(target.channel).toBe('development');
    expect(easJson.build.development.developmentClient).toBe(true);
    expect(target.env.APP_VARIANT).toBe(DEVELOPMENT_VARIANT);
    expect(target.env.EXPO_PUBLIC_API_URL).toBe('https://app-staging.ninerdeck.pl');
  });

  it('profil development NIE ustawia klienta Google - jest związany z pakietem dev i bywa go brak', () => {
    // Świadomy brak, nie przeoczenie: na staging loguje się hasłem (2.1.0), a klient
    // dla `com.ninerdeck.app.dev` powstaje osobno, razem z odciskiem SHA-1 tego pakietu.
    expect(easJson.build.development.env?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID).toBeUndefined();
  });

  it('staging i produkcja stoją pod RÓŻNYMI adresami - inaczej próba generalna pisałaby do klubów', () => {
    expect(profileTarget(easJson, 'development').env.EXPO_PUBLIC_API_URL).not.toBe(
      profileTarget(easJson, 'production').env.EXPO_PUBLIC_API_URL,
    );
  });
});
