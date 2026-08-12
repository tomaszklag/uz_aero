/**
 * UZ Aero — bramka skeletonu (issue #33, wzorzec `design/LOADERY.html` reguła 5).
 *
 * Test pilnuje JEDNEJ własności: skeleton nigdy nie mruga. Znaczy to dwie rzeczy naraz,
 * pozornie sprzeczne — nie pokazuje się przy szybkim odczycie (a takich jest większość:
 * lokalne SQLite) i nie znika zaraz po tym, jak się pokazał. Progi same w sobie są
 * dowolne; łamanie którejkolwiek z tych własności — nie jest.
 */

import {
  SKELETON_DELAY_MS,
  SKELETON_MIN_MS,
  skeletonNextChangeIn,
  skeletonVisible,
} from '../ui/screens/logic/skeletonGate';

const T0 = 1_000_000;

describe('szybki odczyt nie pokazuje niczego', () => {
  it('przed progiem plamek nie ma', () => {
    expect(
      skeletonVisible({
        pending: true,
        pendingSince: T0,
        shownSince: null,
        now: T0 + SKELETON_DELAY_MS - 1,
      }),
    ).toBe(false);
  });

  it('dane, które przyszły przed progiem, nie zostawiają po sobie skeletonu', () => {
    // Najczęstszy przypadek w aplikacji: doba pilota wczytana w 40 ms. Ekran ma wtedy
    // pokazać treść, jakby nie było na co czekać — bo nie było.
    expect(
      skeletonVisible({ pending: false, pendingSince: null, shownSince: null, now: T0 + 40 }),
    ).toBe(false);
  });

  it('bramka budzi Reacta dokładnie na progu, nie wcześniej', () => {
    expect(
      skeletonNextChangeIn({ pending: true, pendingSince: T0, shownSince: null, now: T0 + 50 }),
    ).toBe(SKELETON_DELAY_MS - 50);
  });
});

describe('długi odczyt pokazuje plamki i ich nie urywa', () => {
  it('na progu skeleton wchodzi', () => {
    expect(
      skeletonVisible({
        pending: true,
        pendingSince: T0,
        shownSince: null,
        now: T0 + SKELETON_DELAY_MS,
      }),
    ).toBe(true);
  });

  it('dane tuż po progu NIE kasują skeletonu — dotrzymuje minimum', () => {
    const shownSince = T0 + SKELETON_DELAY_MS;
    expect(
      skeletonVisible({
        pending: false,
        pendingSince: null,
        shownSince,
        now: shownSince + SKELETON_MIN_MS - 1,
      }),
    ).toBe(true);
  });

  it('po minimum skeleton schodzi', () => {
    const shownSince = T0 + SKELETON_DELAY_MS;
    expect(
      skeletonVisible({
        pending: false,
        pendingSince: null,
        shownSince,
        now: shownSince + SKELETON_MIN_MS,
      }),
    ).toBe(false);
  });

  it('widoczny skeleton nie potrzebuje już budzenia, dopóki dane nie przyjdą', () => {
    expect(
      skeletonNextChangeIn({
        pending: true,
        pendingSince: T0,
        shownSince: T0 + SKELETON_DELAY_MS,
        now: T0 + 5_000,
      }),
    ).toBeNull();
  });

  it('po nadejściu danych budzik jest ustawiony na resztę minimum', () => {
    const shownSince = T0 + SKELETON_DELAY_MS;
    expect(
      skeletonNextChangeIn({
        pending: false,
        pendingSince: null,
        shownSince,
        now: shownSince + 100,
      }),
    ).toBe(SKELETON_MIN_MS - 100);
  });
});

describe('drugie czekanie w tym samym ekranie', () => {
  it('kolejny odczyt przy plamkach na ekranie nie każe czekać na próg drugi raz', () => {
    // Ekran 12 przelicza historię, gdy pętla synca opróżni outbox. Gdyby skeleton
    // znikał na czas progu, lista mrugałaby w rytm synchronizacji.
    expect(
      skeletonVisible({
        pending: true,
        pendingSince: T0 + 1_000,
        shownSince: T0 + SKELETON_DELAY_MS,
        now: T0 + 1_000,
      }),
    ).toBe(true);
  });
});
