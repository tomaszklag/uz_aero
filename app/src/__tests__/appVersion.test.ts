/**
 * UZ Aero - napis wersji w karcie „O aplikacji" (13) - `screens/logic/appVersion.ts`.
 *
 * Tester ma umieć powiedzieć, którą wersję ma na telefonie, TYM SAMYM zdaniem,
 * którym opisuje wydania `docs/CHANGELOG.md`: „wersja (build N)". Ten sam napis jedzie
 * w zgłoszeniu błędu (`deviceRelease.ts`), więc format ma jedno miejsce i jeden test.
 */

import { NO_RELEASE, releaseLabel, versionRowValue } from '../ui/screens/logic/appVersion';

describe('releaseLabel - „wersja (build N)"', () => {
  it('wersja z numerem builda - dokładnie jak w CHANGELOG', () => {
    expect(releaseLabel({ version: '1.0.0', build: '1' })).toBe('1.0.0 (build 1)');
    expect(releaseLabel({ version: '1.2.0', build: '14' })).toBe('1.2.0 (build 14)');
  });

  it('bez numeru builda zostaje sama wersja - nie „(build null)"', () => {
    expect(releaseLabel({ version: '1.0.0', build: null })).toBe('1.0.0');
  });
});

describe('versionRowValue - wiersz „Wersja" na 13', () => {
  it('znane wydanie = ten sam napis, co w zgłoszeniu błędu', () => {
    expect(versionRowValue({ version: '1.0.0', build: '1' })).toBe('1.0.0 (build 1)');
  });

  it('nieznane wydanie (Expo Go, web) = KRESKA, nigdy „undefined" ani plamka', () => {
    // `KeyValueRow` traktuje `null` jako „jeszcze czytamy" i rysuje plamkę (issue #33),
    // a brak wydania jest ODPOWIEDZIĄ - stąd napis, nie `null`.
    expect(versionRowValue(null)).toBe(NO_RELEASE);
    expect(versionRowValue(null)).toBe('-');
  });
});
