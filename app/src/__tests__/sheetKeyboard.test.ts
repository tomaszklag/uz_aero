/**
 * UZ Aero - KLAWIATURA ARKUSZA NIE JEST KLAWIATURĄ EKRANU.
 *
 * Zgłoszenie z urządzenia (2026-09-04): „czasem jak mam na manualnym locie przejście
 * na ekran z przebiegiem operacji, to tak jakby dwa razy muszę kliknąć DALEJ".
 *
 * Mechanizm: zdarzenia klawiatury są w RN globalne, a arkusz żyje w osobnym oknie
 * (`Modal`). Ekran pod spodem kurczył się więc o wysokość klawiatury, której u siebie
 * nie miał - i wracał na miejsce dopiero po `keyboardDidHide`, czyli po animacji
 * chowania. Przycisk „DALEJ" zjeżdżał wtedy w dół dokładnie w chwili, w której pilot
 * już w niego celował.
 *
 * Test odtwarza tamtą sekwencję krok po kroku, bo to KOLEJNOŚĆ zdarzeń była usterką,
 * a nie pojedyncza wartość.
 */

import { keyboardBorrowedBySheet } from '../ui/hooks/keyboardGeometry';
import { registerSheet, resetSheetPresence, sheetsOpen } from '../ui/hooks/sheetPresence';

/** Wysokość, jaką `Screen` ma wziąć pod uwagę - dokładnie rachunek z hooka. */
const screenKeyboard = (raw: number, borrowed: boolean, open: boolean): number =>
  open || borrowed ? 0 : raw;

describe('sheetPresence', () => {
  beforeEach(() => resetSheetPresence());

  it('licznik, nie flaga: arkusz nad arkuszem zostawia obecność zapaloną', () => {
    // Zamykany arkusz trzyma jeszcze okno przez animację wyjazdu, gdy następny już
    // się montuje. Flaga zgasłaby na tym styku i ekran złapałby cudzą klawiaturę.
    const first = registerSheet();
    const second = registerSheet();
    expect(sheetsOpen()).toBe(true);

    first();
    expect(sheetsOpen()).toBe(true);

    second();
    expect(sheetsOpen()).toBe(false);
  });

  it('podwójne zwolnienie nie schodzi poniżej zera', () => {
    // Inaczej licznik przestałby widzieć NASTĘPNE arkusze - a wada byłaby niewidoczna
    // do chwili, w której ktoś zamknie ten sam arkusz dwa razy.
    const release = registerSheet();
    release();
    release();

    registerSheet();
    expect(sheetsOpen()).toBe(true);
  });
});

describe('keyboardBorrowedBySheet - sekwencja ze zgłoszenia', () => {
  it('ekran nie kurczy się ani przez chwilę, gdy pilot pisze w arkuszu', () => {
    // 1. Krok 2 wpisu ręcznego, nic nie jest otwarte.
    let borrowed = keyboardBorrowedBySheet(false, 0, false);
    expect(screenKeyboard(0, borrowed, false)).toBe(0);

    // 2. Arkusz lotniska wchodzi RAZEM z klawiaturą (`useSheetInputFocus`).
    borrowed = keyboardBorrowedBySheet(borrowed, 320, true);
    expect(screenKeyboard(320, borrowed, true)).toBe(0);

    // 3. Arkusz zamknięty, ale klawiatura schodzi jeszcze ~300 ms - TU pilot tapie
    //    „DALEJ". Ekran musi stać w miejscu, w którym pilot widzi przycisk.
    borrowed = keyboardBorrowedBySheet(borrowed, 320, false);
    expect(borrowed).toBe(true);
    expect(screenKeyboard(320, borrowed, false)).toBe(0);

    // 4. `keyboardDidHide` - pożyczka gaśnie, bo nie ma już czego pożyczać.
    borrowed = keyboardBorrowedBySheet(borrowed, 0, false);
    expect(borrowed).toBe(false);
  });

  it('własne pole ekranu podnosi treść jak dotąd', () => {
    // Poprawka nie może wyłączyć mechanizmu, dla którego `Screen` w ogóle mierzy
    // klawiaturę: pole formularza NA EKRANIE nadal ma stać nad nią.
    const borrowed = keyboardBorrowedBySheet(false, 320, false);
    expect(borrowed).toBe(false);
    expect(screenKeyboard(320, borrowed, false)).toBe(320);
  });

  it('arkusz bez pola nie pożycza niczego', () => {
    // Klawiatury nie było, więc po zamknięciu arkusza ekran od razu jest sobą.
    const borrowed = keyboardBorrowedBySheet(false, 0, true);
    expect(borrowed).toBe(false);
    expect(keyboardBorrowedBySheet(borrowed, 0, false)).toBe(false);
  });

  it('reguła jest idempotentna - powtórzenie na tych samych danych nic nie zmienia', () => {
    // Hook liczy ją przy każdym zdarzeniu klawiatury i przy każdej zmianie obecności
    // arkusza; gdyby wynik zależał od LICZBY wywołań, stan pełzałby po ekranie.
    for (const raw of [0, 320]) {
      for (const open of [false, true]) {
        for (const prev of [false, true]) {
          const once = keyboardBorrowedBySheet(prev, raw, open);
          expect(keyboardBorrowedBySheet(once, raw, open)).toBe(once);
        }
      }
    }
  });
});
