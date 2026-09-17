/**
 * Ninerdeck - zmienne profilu builda z `eas.json` dla aktualizacji OTA
 * (`scripts/eas-profile-env.js`, runner `scripts/eas-update.js`).
 *
 * Kontekst: `eas update` nie czyta `build.<profil>.env` z `eas.json`, więc aktualizacja
 * brała adres serwera z lokalnego `.env` - w dev ZAKOMENTOWANY - i wysłałaby telefonom
 * bundle z fallbackiem `apiBaseUrl()` na localhost. Runner ma odmówić, zanim cokolwiek
 * pójdzie na serwer EAS.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { profileEnv, REQUIRED } from '../../scripts/eas-profile-env';

const production = (env: Record<string, unknown>) => ({ build: { production: { env } } });

const OK = {
  EXPO_PUBLIC_API_URL: 'https://app.ninerdeck.pl',
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: '1-abc.apps.googleusercontent.com',
};

const without = (name: keyof typeof OK): Record<string, unknown> => {
  const rest: Record<string, unknown> = { ...OK };
  delete rest[name];
  return rest;
};

describe('profileEnv - zmienne profilu builda dla `eas update`', () => {
  it('oddaje komplet zmiennych profilu', () => {
    expect(profileEnv(production(OK), 'production')).toEqual(OK);
  });

  it('odmawia bez adresu serwera - bundle poszedłby z fallbackiem na localhost', () => {
    expect(() => profileEnv(production(without('EXPO_PUBLIC_API_URL')), 'production')).toThrow(
      /EXPO_PUBLIC_API_URL/,
    );
    expect(() =>
      profileEnv(production({ ...OK, EXPO_PUBLIC_API_URL: '   ' }), 'production'),
    ).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('odmawia bez klienta Google - logowanie mówiłoby, że nie jest skonfigurowane', () => {
    expect(() =>
      profileEnv(production(without('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID')), 'production'),
    ).toThrow(/EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID/);
  });

  it('odmawia przy adresie bez https:// - to zwykle adres LAN z dev w złym profilu', () => {
    expect(() =>
      profileEnv(production({ ...OK, EXPO_PUBLIC_API_URL: 'http://192.168.1.20:3000' }), 'production'),
    ).toThrow(/https/);
  });

  it('odmawia, gdy profil nie ma sekcji env albo eas.json ma inny kształt', () => {
    expect(() => profileEnv({ build: {} }, 'production')).toThrow(/production/);
    expect(() => profileEnv(null, 'production')).toThrow(/production/);
    expect(() => profileEnv({ build: { development: { env: OK } } }, 'production')).toThrow(
      /production/,
    );
  });

  it('nie dotyka innych zmiennych profilu - jadą dalej bez zmian', () => {
    const env = { ...OK, EXPO_PUBLIC_EXTRA: 'x' };
    expect(profileEnv(production(env), 'production')).toEqual(env);
  });

  it('lista wymaganych to dokładnie adres serwera i klient Google', () => {
    expect(REQUIRED).toEqual(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID']);
  });
});

describe('eas.json w repozytorium', () => {
  it('profil production przechodzi bramkę runnera i wskazuje własny adres Ninerdeck', () => {
    const easJson: unknown = JSON.parse(readFileSync(join(__dirname, '../../eas.json'), 'utf8'));
    const env = profileEnv(easJson, 'production');
    // Własna domena od issue #124: adres nadany przez hosting przestał obowiązywać.
    expect(env.EXPO_PUBLIC_API_URL).toBe('https://app.ninerdeck.pl');
  });
});
