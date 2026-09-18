/**
 * Ninerdeck - CZYJA TO BINARKA (`infrastructure/release/ownRelease.ts`).
 *
 * `expo-application` opisuje aplikację, która NAPRAWDĘ działa - w Expo Go jest nią
 * Expo Go, nie my. Bez tej decyzji ekran 13 pisałby testerowi wersję klienta Expo
 * jako wersję Ninerdeck, a zgłoszenie błędu jechałoby na serwer z tym samym kłamstwem.
 * Wariant deweloperski (osobny pakiet) JEST nasz - ale nazwany, żeby dev build nie
 * podszywał się pod APK z produkcji tym samym napisem.
 */

import { ownRelease, type NativeRelease } from '../infrastructure/release/ownRelease';

const OWN = 'com.ninerdeck.app';
const DEV = 'com.ninerdeck.app.dev';

const facts = (over: Partial<NativeRelease> = {}): NativeRelease => ({
  version: '1.0.0',
  build: '1',
  applicationId: OWN,
  ownApplicationId: OWN,
  devApplicationId: DEV,
  ...over,
});

describe('ownRelease - wydanie własnej binarki', () => {
  it('nasz APK: wersja i build z pakietu, bez dopisku wariantu', () => {
    expect(ownRelease(facts())).toEqual({ version: '1.0.0', build: '1', dev: false });
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
    expect(ownRelease(facts({ build: null }))).toEqual({ version: '1.0.0', build: null, dev: false });
    expect(ownRelease(facts({ build: '' }))).toEqual({ version: '1.0.0', build: null, dev: false });
  });

  it('bez wzorca pakietu (platforma bez wpisu w app.json) ufa binarce', () => {
    // Porównanie nie ma z czym - odmowa „na wszelki wypadek" gasiłaby wiersz
    // na każdej platformie, dla której konfiguracja nie niesie identyfikatora.
    expect(
      ownRelease(facts({ ownApplicationId: null, devApplicationId: null, applicationId: 'com.x.y' })),
    ).toEqual({ version: '1.0.0', build: '1', dev: false });
  });

  it('pakiet znany, a binarka nie mówi swojego - własności nie da się potwierdzić', () => {
    expect(ownRelease(facts({ applicationId: null }))).toBeNull();
  });
});

describe('ownRelease - wariant deweloperski', () => {
  it('pakiet dev to nasza binarka, NAZWANA: `dev: true`', () => {
    expect(ownRelease(facts({ applicationId: DEV }))).toEqual({
      version: '1.0.0',
      build: '1',
      dev: true,
    });
  });

  it('bez wzorca wariantu pakiet dev jest cudzy - sufiks nie jest zgadywany z nazwy', () => {
    expect(ownRelease(facts({ applicationId: DEV, devApplicationId: null }))).toBeNull();
  });

  it('pakiet o podobnej nazwie, ale spoza obu wzorców, nie jest nasz', () => {
    expect(ownRelease(facts({ applicationId: 'com.ninerdeck.app.staging' }))).toBeNull();
  });
});
