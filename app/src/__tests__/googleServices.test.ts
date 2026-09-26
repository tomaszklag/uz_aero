/**
 * Ninerdeck - plik Firebase w konfiguracji Expo (`scripts/google-services.js`, epik R-J).
 *
 * Pod obserwacją: zmienna EAS wygrywa z lokalnym plikiem, brak obu zostawia
 * konfigurację nietkniętą (Metro nie czyta tego pola), a pole ląduje tam, gdzie czyta
 * je prebuild - w `android`.
 */

import {
  GOOGLE_SERVICES_ENV,
  LOCAL_GOOGLE_SERVICES,
  googleServicesFile,
  withGoogleServices,
} from '../../scripts/google-services';

const BASE = { name: 'Ninerdeck', android: { package: 'com.ninerdeck.app', versionCode: 5 } };

describe('googleServicesFile', () => {
  it('zmienna EAS ze ścieżką wygrywa z lokalnym plikiem', () => {
    expect(googleServicesFile({ [GOOGLE_SERVICES_ENV]: '/tmp/gs.json' }, () => true)).toBe('/tmp/gs.json');
  });

  it('bez zmiennej bierze lokalny plik, jeśli istnieje', () => {
    expect(googleServicesFile({}, (p) => p === LOCAL_GOOGLE_SERVICES)).toBe(LOCAL_GOOGLE_SERVICES);
    expect(googleServicesFile(undefined, () => false)).toBeNull();
    // Pusta zmienna nie jest ścieżką.
    expect(googleServicesFile({ [GOOGLE_SERVICES_ENV]: '' }, () => false)).toBeNull();
  });
});

describe('withGoogleServices', () => {
  it('bez pliku oddaje TĘ SAMĄ konfigurację - Metro i produkcja bez Firebase nie zależą od helpera', () => {
    expect(withGoogleServices(BASE, {}, () => false)).toBe(BASE);
  });

  it('z plikiem dokłada wyłącznie `android.googleServicesFile`', () => {
    const out = withGoogleServices(BASE, { [GOOGLE_SERVICES_ENV]: '/eas/gs.json' }, () => false);
    expect(out.android).toEqual({ package: 'com.ninerdeck.app', versionCode: 5, googleServicesFile: '/eas/gs.json' });
    expect(out.name).toBe('Ninerdeck');
  });
});
