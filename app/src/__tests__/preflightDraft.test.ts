/**
 * UZ Aero — testy SZKICU PREFLIGHTU (`ui/store/preflightDraft.ts`).
 *
 * Reguła, którą szkic egzekwuje sam — bo da się ją zepsuć z dowolnego ekranu przejęcia,
 * a nie ma szansy przetrwać, jeśli pilnuje jej pamięć programisty: kształt trasy zależny
 * od rodzaju operacji (issue #13).
 *
 * GODZINY MELDUNKU W SZKICU JUŻ NIE MA (§3.6a, 2026-08-07) i razem z nią zniknęły testy
 * jej starzenia się. Nie jest to uproszczenie testów, tylko konsekwencja modelu: służba
 * jest klamrą wokół wzlotów, więc godzina bierze się z pierwszego wzlotu doby, a pilot
 * poprawia ją po fakcie na ekranie 01 — nie ma już wartości, która „udaje teraz"
 * i starzeje się między wejściami na ekran (issue #12).
 */

import { usePreflightDraft } from '../ui/store/preflightDraft';
import type { ReferenceAircraft } from '../domain';

const axa = (over: Partial<ReferenceAircraft> = {}): ReferenceAircraft => ({
  id: 'SP-AXA',
  reg: 'SP-AXA',
  type: 'Cessna 182',
  year: 2019,
  capacityL: 330,
  mhFormat: 'hhmm',
  dualRequired: false,
  serviceStatus: 'active',
  claimPicId: null,
  claimSince: null,
  handover: null,
  consumption: null,
  fetchedAt: 0,
  ...over,
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

/**
 * Bramka „wstecz" na kroku 1 (issue #55). `dirty()` rozstrzyga, czy jest czego bronić:
 * arkusz rezygnacji nad pustym formularzem pytałby o zgodę na nic, a jego brak przy
 * wybranym samolocie pozwoliłby przypadkowemu gestowi skasować wybory bez pytania —
 * bo potwierdzona rezygnacja CZYŚCI szkic.
 */
describe('szkic preflightu — dirty() dla bramki rezygnacji', () => {
  beforeEach(() => {
    usePreflightDraft.getState().reset();
  });

  it('świeży szkic nie ma czego bronić', () => {
    expect(usePreflightDraft.getState().dirty()).toBe(false);
  });

  it('wybór samolotu podnosi bramkę', () => {
    usePreflightDraft.getState().setAircraft(axa());
    expect(usePreflightDraft.getState().dirty()).toBe(true);
  });

  it('sam Dual (bez samolotu) też podnosi bramkę', () => {
    usePreflightDraft.getState().set('dualId', 'AKO');
    expect(usePreflightDraft.getState().dirty()).toBe(true);
  });

  it('reset opuszcza bramkę — potwierdzona rezygnacja wychodzi bez drugiego pytania', () => {
    usePreflightDraft.getState().setAircraft(axa());
    usePreflightDraft.getState().reset();
    expect(usePreflightDraft.getState().dirty()).toBe(false);
  });
});

/**
 * Baner „Skąd te dane?" na 02E (uwaga z urządzenia, 2026-08-27): rozwinięty ma dawać
 * przycisk czyszczący formularz do stanu pustego. Szkic niesie do tego dwie rzeczy:
 * `clearTask()` (pola zadania wracają do początkowych, podpowiedź nie wraca) oraz
 * flagę `suggested` — baner mówi o podstawionych danych tylko wtedy, gdy one
 * faktycznie stoją w formularzu, także po powrocie na ekran.
 */
describe('szkic preflightu — clearTask() dla banera „Skąd te dane?"', () => {
  beforeEach(() => {
    usePreflightDraft.getState().reset();
  });

  it('podpowiedź podnosi flagę suggested, clearTask ją opuszcza', () => {
    const draft = usePreflightDraft.getState();
    expect(draft.suggested).toBe(false);
    draft.suggestTask({ operation: 'ferry', client: 'SKY CAMP' }, { departureIcao: 'EPKK', arrivalIcao: 'EPWA' });
    expect(usePreflightDraft.getState().suggested).toBe(true);

    usePreflightDraft.getState().clearTask();
    expect(usePreflightDraft.getState().suggested).toBe(false);
  });

  it('clearTask przywraca pola zadania do stanu początkowego', () => {
    const draft = usePreflightDraft.getState();
    draft.suggestTask({ operation: 'ferry', client: 'SKY CAMP' }, { departureIcao: 'EPKK', arrivalIcao: 'EPWA' });
    usePreflightDraft.getState().clearTask();

    expect(usePreflightDraft.getState()).toMatchObject({
      operation: 'skoki',
      departureIcao: '',
      arrivalIcao: '',
      client: null,
    });
  });

  it('po wyczyszczeniu podpowiedź NIE wraca — czysty formularz zostaje czysty', () => {
    const draft = usePreflightDraft.getState();
    draft.suggestTask({ operation: 'ferry', client: 'SKY CAMP' }, { departureIcao: 'EPKK', arrivalIcao: 'EPWA' });
    usePreflightDraft.getState().clearTask();
    // Ten sam efekt, który podstawił dane za pierwszym razem (remount ekranu).
    usePreflightDraft.getState().suggestTask(
      { operation: 'ferry', client: 'SKY CAMP' },
      { departureIcao: 'EPKK', arrivalIcao: 'EPWA' },
    );

    expect(usePreflightDraft.getState()).toMatchObject({ operation: 'skoki', client: null, suggested: false });
  });

  it('notatka pilota przeżywa czyszczenie — nigdy nie była podpowiedzią', () => {
    const draft = usePreflightDraft.getState();
    draft.set('notes', 'lot z uczniem');
    usePreflightDraft.getState().suggestTask({ operation: 'ferry', client: null }, { departureIcao: 'EPKK', arrivalIcao: 'EPKK' });
    // suggestTask po dotknięciu pól NIE nadpisuje (taskTouched)? — notatka nie jest
    // polem zadania, więc podpowiedź weszła; czyszczenie ma jej nie ruszyć.
    usePreflightDraft.getState().clearTask();
    expect(usePreflightDraft.getState().notes).toBe('lot z uczniem');
  });

  it('reset() opuszcza też flagę suggested', () => {
    usePreflightDraft.getState().suggestTask({ operation: 'ferry', client: null }, { departureIcao: 'EPKK', arrivalIcao: 'EPKK' });
    usePreflightDraft.getState().reset();
    expect(usePreflightDraft.getState().suggested).toBe(false);
  });
});
