/**
 * UZ Aero - CZYJA TO BINARKA (`infrastructure/release/ownRelease.ts`).
 *
 * `expo-application` opisuje aplikację, która NAPRAWDĘ działa - w Expo Go jest nią
 * Expo Go, nie my. Bez tej decyzji ekran 13 pisałby testerowi wersję klienta Expo
 * jako wersję UZ Aero, a zgłoszenie błędu jechałoby na serwer z tym samym kłamstwem.
 */

import { ownRelease, type NativeRelease } from '../infrastructure/release/ownRelease';

const OWN = 'com.tomekklag.uzaero';

const facts = (over: Partial<NativeRelease> = {}): NativeRelease => ({
  version: '1.0.0',
  build: '1',
  applicationId: OWN,
  ownApplicationId: OWN,
  ...over,
});

describe('ownRelease - wydanie własnej binarki', () => {
  it('nasz APK: wersja i build z pakietu, bez zmian', () => {
    expect(ownRelease(facts())).toEqual({ version: '1.0.0', build: '1' });
  });

  it('Expo Go opisuje SIEBIE - cudzy pakiet znaczy „wydania nie znamy"', () => {
    // Wersja nie jest pusta (to wersja Expo Go), a mimo to odpowiedź brzmi `null`:
    // liczba prawdziwa o niewłaściwej rzeczy jest gorsza od kreski.
    expect(
      ownRelease(facts({ version: '54.0.0', build: '1017', applicationId: 'host.exp.exponent' })),
    ).toBeNull();
  });

  it('bez wersji nie ma wydania (web, brak danych) - także przy zgodnym pakiecie', () => {
    expect(ownRelease(facts({ version: null }))).toBeNull();
    expect(ownRelease(facts({ version: '' }))).toBeNull();
  });

  it('brak numeru builda nie kasuje wersji - build jest `null`, wersja zostaje', () => {
    expect(ownRelease(facts({ build: null }))).toEqual({ version: '1.0.0', build: null });
    expect(ownRelease(facts({ build: '' }))).toEqual({ version: '1.0.0', build: null });
  });

  it('bez wzorca pakietu (platforma bez wpisu w app.json) ufa binarce', () => {
    // Porównanie nie ma z czym - odmowa „na wszelki wypadek" gasiłaby wiersz
    // na każdej platformie, dla której konfiguracja nie niesie identyfikatora.
    expect(ownRelease(facts({ ownApplicationId: null, applicationId: 'com.x.y' }))).toEqual({
      version: '1.0.0',
      build: '1',
    });
  });

  it('pakiet znany, a binarka nie mówi swojego - własności nie da się potwierdzić', () => {
    expect(ownRelease(facts({ applicationId: null }))).toBeNull();
  });
});
