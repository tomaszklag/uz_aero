/**
 * UZ Aero — testy SZKICU PREFLIGHTU (`ui/store/preflightDraft.ts`).
 *
 * Dwie reguły, które szkic egzekwuje sam — bo obie da się zepsuć z dowolnego ekranu
 * preflightu, a żadna nie ma szansy przetrwać, jeśli pilnuje jej pamięć programisty:
 * świeżość godziny meldunku (issue #12) i kształt trasy zależny od operacji (issue #13).
 *
 * Część „od kiedy":
 *
 * Godzina meldunku jest jedyną wartością szkicu, która **starzeje się sama**. Reszta pól
 * czeka na pilota; ta jedna udaje „teraz" i przestaje być prawdą w chwili, w której nikt
 * na nią nie patrzy. Zgłoszenie z urządzenia (issue #12) brzmiało dokładnie tak: godzina
 * ustawiała się w momencie uruchomienia aplikacji, a nie wejścia na ekran — bo szkic
 * powstaje raz, przy pierwszym dotknięciu store'u, i żyje tak długo jak proces.
 *
 * Testy pilnują obu stron tej reguły: świeżości przy wejściu i NIETYKALNOŚCI wpisu pilota
 * (bez tego drugiego powrót z kroku 2 kasowałby ręcznie wpisany meldunek — czyli lek
 * gorszy od choroby).
 */

import { usePreflightDraft } from '../ui/store/preflightDraft';

const T8 = Date.UTC(2026, 5, 22, 8, 0);
const T10 = Date.UTC(2026, 5, 22, 10, 0);

describe('szkic preflightu — czas meldowania', () => {
  beforeEach(() => {
    usePreflightDraft.getState().reset();
  });

  it('wejście na krok 1 podstawia „teraz" zamiast godziny sprzed sesji', () => {
    usePreflightDraft.getState().refreshDutyStart(T10);
    expect(usePreflightDraft.getState().dutyStart).toBe(T10);
  });

  it('godzina wpisana przez pilota przeżywa kolejne wejścia na ekran', () => {
    usePreflightDraft.getState().set('dutyStart', T8);
    usePreflightDraft.getState().refreshDutyStart(T10);

    expect(usePreflightDraft.getState().dutyStart).toBe(T8);
    expect(usePreflightDraft.getState().dutyStartEdited).toBe(true);
  });

  it('nowy dzień lotny (reset) znów przyjmuje „teraz"', () => {
    usePreflightDraft.getState().set('dutyStart', T8);
    usePreflightDraft.getState().reset();
    usePreflightDraft.getState().refreshDutyStart(T10);

    expect(usePreflightDraft.getState().dutyStart).toBe(T10);
  });
});

/**
 * Kształt trasy (issue #13). Formularz pyta o jedno lotnisko przy skokach, ale rekord
 * niesie obie wartości równe — inaczej każdy czytelnik dnia (projekcja, karta arkusza,
 * panel) musiałby znać wyjątek „przy skokach patrz tylko na start".
 */
describe('szkic preflightu — trasa wg rodzaju operacji', () => {
  beforeEach(() => {
    usePreflightDraft.getState().reset();
  });

  it('skoki: wpis lotniska wypełnia OBA kody', () => {
    const draft = usePreflightDraft.getState();
    draft.set('operation', 'skoki');
    draft.set('departureIcao', 'EPKK');

    expect(usePreflightDraft.getState().arrivalIcao).toBe('EPKK');
  });

  it('przelot: kody są niezależne — dzień może skończyć się gdzie indziej', () => {
    const draft = usePreflightDraft.getState();
    draft.set('operation', 'ferry');
    draft.set('departureIcao', 'EPKK');
    draft.set('arrivalIcao', 'EPWA');

    expect(usePreflightDraft.getState()).toMatchObject({
      departureIcao: 'EPKK',
      arrivalIcao: 'EPWA',
    });
  });

  it('przełączenie przelotu na skoki zwija trasę do lotniska startu', () => {
    const draft = usePreflightDraft.getState();
    draft.set('operation', 'ferry');
    draft.set('departureIcao', 'EPKK');
    draft.set('arrivalIcao', 'EPWA');
    draft.set('operation', 'skoki');

    expect(usePreflightDraft.getState().arrivalIcao).toBe('EPKK');
  });

  it('podpowiedź z ostatniego dnia też przechodzi przez kształt trasy', () => {
    // Pamięć trzyma trasę per samolot: wczoraj przelot EPKK → EPWA, dziś skoki.
    usePreflightDraft.getState().suggestTask(
      { operation: 'skoki', client: null },
      { departureIcao: 'EPKK', arrivalIcao: 'EPWA' },
    );

    expect(usePreflightDraft.getState().arrivalIcao).toBe('EPKK');
  });
});
