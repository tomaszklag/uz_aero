/**
 * UZ Aero — testy SZKICU PREFLIGHTU (`ui/store/preflightDraft.ts`), część „od kiedy".
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
