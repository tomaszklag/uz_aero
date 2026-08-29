/**
 * UZ Aero - panel: dwa kroki przebudowy - werdykt i bramki (`A11`).
 *
 * Reguła z mockupu, którą ten plik zapisuje wykonywalnie: „Nadpisanie odblokowuje się
 * dopiero po świeżym porównaniu i podaniu powodu". Bramka jest dla CZŁOWIEKA - serwer
 * odmawia niezależnie - więc jej wartością jest to, że NAZYWA, czego brakuje.
 *
 * ══ CO PRZYBYŁO 2026-08-02 ══
 * Raport z porównania i raport z zapisu mają ten sam kształt i różnią się polem `mode`.
 * Ekran tej różnicy nie widział, więc zaraz po UDANYM nadpisaniu wołał „to incydent,
 * ustal przyczynę", pokazywał różnice, które właśnie zniknęły, i wracał do przycisku
 * CZYNNEGO - czyli zapraszał do drugiego zapisu, który nadpisywał zero wierszy
 * i dopisywał drugi wpis do dziennika audytu. Przypadki niżej przybijają, że każda
 * z tych trzech rzeczy jest teraz zależna od trybu.
 */

import { describe, expect, it } from 'vitest';

import type { RebuildReportDto } from '../../api/dto';
import {
  compareGate,
  currentReport,
  rebuildFailure,
  rebuildVerdict,
  runFacts,
  writeGate,
} from './rebuildRun';

const report = (over: Partial<RebuildReportDto> = {}): RebuildReportDto => ({
  mode: 'dry_run',
  sessions: 1291,
  rowsDiffering: 0,
  fieldsDiffering: 0,
  written: 0,
  remaining: 0,
  diffs: [],
  ...over,
});

/** Raport z ZAPISU: dwa wiersze się rozjechały i dwa zostały nadpisane. */
const written = (over: Partial<RebuildReportDto> = {}): RebuildReportDto =>
  report({ mode: 'write', rowsDiffering: 2, fieldsDiffering: 3, written: 2, ...over });

const NOW = Date.UTC(2026, 6, 31, 14, 30);
const AT = Date.UTC(2026, 6, 31, 14, 22);

describe('który raport opisuje bazę TERAZ', () => {
  it('bez żadnego raportu - nic i żadnego stempla', () => {
    expect(currentReport({ data: undefined, at: 0 }, { data: undefined, at: 0 })).toEqual({
      report: undefined,
      at: null,
    });
  });

  it('po ZAPISIE wygrywa raport z zapisu - tamten opisuje bazę, której już nie ma', () => {
    const chosen = currentReport({ data: report(), at: 100 }, { data: written(), at: 200 });
    expect(chosen.report?.mode).toBe('write');
    expect(chosen.at).toBe(200);
  });

  it('po KOLEJNYM porównaniu wygrywa znów porównanie - rozstrzyga stempel, nie kolejność', () => {
    // ══ TO JEST TA ASERCJA ══
    // `rebuild.data ?? compare.data` zwracało raport z zapisu także wtedy, gdy człowiek
    // przeliczył jeszcze raz: wynik mutacji żyje w hooku, dopóki go ktoś nie zresetuje.
    // Ekran pokazywałby wtedy skutek sprzed pięciu minut jako odpowiedź na pytanie
    // zadane przed chwilą, a bramka „Nadpisz" zostawałaby zamknięta mimo świeżych liczb.
    const chosen = currentReport(
      { data: report({ rowsDiffering: 5 }), at: 300 },
      { data: written(), at: 200 },
    );
    expect(chosen.report?.mode).toBe('dry_run');
    expect(chosen.report?.rowsDiffering).toBe(5);
    expect(chosen.at).toBe(300);
  });
});

describe('werdykt nad tabelą różnic', () => {
  it('bez porównania NIE MA werdyktu - ekran nie mówi o bazie, której nie czytał', () => {
    expect(rebuildVerdict(undefined)).toBeNull();
  });

  it('zero różnic jest wynikiem OCZEKIWANYM i świeci na zielono', () => {
    // Narzędzie, które przy braku dryfu wygląda na „nic nie znalazłem, spróbuj jeszcze",
    // uczy klikania - a to jest ostatnia rzecz, której ten ekran ma uczyć.
    const verdict = rebuildVerdict(report());
    expect(verdict?.tone).toBe('ok');
    expect(verdict?.title).toContain('zgadza się');
    expect(verdict?.body).toContain('1291');
  });

  it('niezerowa różnica jest nazwana INCYDENTEM, nie zadaniem do sprzątnięcia', () => {
    const verdict = rebuildVerdict(report({ rowsDiffering: 2, fieldsDiffering: 3 }));
    expect(verdict?.tone).toBe('warn');
    expect(verdict?.title).toContain('incydent');
    // Zdanie musi ostrzegać przed skutkiem zapisu, nie zachęcać do niego.
    expect(verdict?.body).toContain('skasuje jedyny ślad');
  });

  it('po ZAPISIE mówi o SKUTKU, a nie powtarza diagnozy sprzed zapisu', () => {
    // Wada: zaraz po udanym nadpisaniu baner dalej wołał „to incydent, ustal przyczynę,
    // dopiero potem nadpisuj" - nad wierszami, które właśnie przestały się różnić,
    // i po operacji, która zatarła jedyny ślad po przyczynie.
    const verdict = rebuildVerdict(written())!;
    expect(verdict.tone).toBe('ok');
    expect(verdict.title).toContain('Nadpisano 2 wiersze');
    expect(verdict.title).not.toContain('incydent');
    expect(verdict.body).not.toContain('dopiero potem nadpisuj');
    // …i mówi wprost, że kolejny zapis wymaga nowego porównania.
    expect(verdict.body).toContain('nowego porównania');
  });

  it('zapis CZĘŚCIOWY mówi, ile zostało - limit jest bezpiecznikiem, nie sekretem', () => {
    const verdict = rebuildVerdict(
      written({ rowsDiffering: 1291, written: 200, remaining: 1091 }),
    )!;
    expect(verdict.tone).toBe('warn');
    expect(verdict.title).toContain('200');
    expect(verdict.title).toContain('1291');
    expect(verdict.title).toContain('1091');
    expect(verdict.body).toContain('kolejnych uruchomieniach');
  });
});

describe('bramka NADPISANIA - pięć warunków, każdy z własnym zdaniem', () => {
  const base = { report: report({ rowsDiffering: 2 }), reason: 'wyjaśnione', mayWrite: true, pending: false };

  it('brak uprawnienia wygrywa ze wszystkim', () => {
    // Bez tego pierwszeństwa panel mówiłby „najpierw porównaj" komuś, kto i tak nie zapisze.
    const gate = writeGate({ ...base, mayWrite: false, report: undefined, reason: '' });
    expect(gate.disabled).toBe(true);
    expect(gate.reason).toContain('administrator');
  });

  it('bez porównania - zablokowane z powodem', () => {
    const gate = writeGate({ ...base, report: undefined });
    expect(gate.disabled).toBe(true);
    expect(gate.reason).toBe('najpierw przelicz i porównaj');
  });

  it('porównanie bez różnic - nie ma czego nadpisywać', () => {
    const gate = writeGate({ ...base, report: report() });
    expect(gate.disabled).toBe(true);
    expect(gate.reason).toContain('projekcja się zgadza');
  });

  it('bez powodu - zablokowane, i to jest LUSTRO reguły serwera', () => {
    // Serwer odmawia `reason_required`; panel mówi to samo, zanim wyśle żądanie.
    expect(writeGate({ ...base, reason: '' }).disabled).toBe(true);
    expect(writeGate({ ...base, reason: '   ' }).reason).toContain('powód');
  });

  it('świeże porównanie z różnicami + powód = odblokowane, z LICZBĄ w etykiecie', () => {
    const gate = writeGate(base);
    expect(gate.disabled).toBe(false);
    expect(gate.reason).toBeNull();
    // Przycisk zmieniający liczby klubu ma powiedzieć ILE wierszy ruszy.
    expect(gate.label).toBe('Nadpisz 2 wiersze');
  });

  it('RAPORT Z ZAPISU bramki NIE OTWIERA - „świeże porównanie" ma wreszcie postać', () => {
    // ══ TO JEST TA ASERCJA ══
    // Reguła mockupu („odblokowuje się dopiero po ŚWIEŻYM porównaniu") nie miała żadnej
    // postaci w kodzie: bramka patrzyła tylko na to, czy jakikolwiek raport istnieje.
    // Po udanym zapisie przycisk wracał CZYNNY z etykietą „Nadpisz 2 wiersze", a drugie
    // kliknięcie nadpisywało zero wierszy i dopisywało DRUGI wpis do audytu.
    const gate = writeGate({ ...base, report: written() });
    expect(gate.disabled).toBe(true);
    expect(gate.reason).toContain('pochodzi z zapisu');
    // Etykieta traci liczbę, bo nie jest już obietnicą „tyle wierszy ruszy".
    expect(gate.label).toBe('Nadpisz projekcję');
  });

  it('kolejne PORÓWNANIE po zapisie otwiera bramkę z powrotem', () => {
    // Bramka nie może być zamknięta na zawsze: zapis częściowy zostawia resztę,
    // a domyka się ją właśnie kolejnym porównaniem i kolejnym nadpisaniem.
    const gate = writeGate({ ...base, report: report({ rowsDiffering: 1091 }) });
    expect(gate.disabled).toBe(false);
    expect(gate.label).toBe('Nadpisz 1091 wierszy');
  });

  it('w trakcie zapisu mówi o zajętości, a nie o brakach', () => {
    const gate = writeGate({ ...base, pending: true });
    expect(gate.disabled).toBe(true);
    expect(gate.label).toBe('Nadpisuję…');
    expect(gate.reason).toBeNull();
  });
});

describe('bramka PORÓWNANIA', () => {
  it('bez uprawnienia - zablokowane z powodem, nigdy ukryte', () => {
    expect(compareGate(false, false)).toMatchObject({ disabled: true });
    expect(compareGate(false, false).reason).toContain('administrator');
  });

  it('z uprawnieniem - czynne; w trakcie - zajęte', () => {
    expect(compareGate(true, false).disabled).toBe(false);
    expect(compareGate(true, true)).toMatchObject({ disabled: true, label: 'Przeliczam…' });
  });
});

describe('liczby przebiegu', () => {
  it('bez raportu - same kreski, nigdy zera', () => {
    // „0 wierszy różnych" przy awarii pobrania wygląda jak dobra wiadomość.
    const facts = runFacts({ report: undefined, at: null }, NOW);
    expect(facts.filter((f) => f.value === '-').length).toBeGreaterThanOrEqual(4);
    expect(facts.some((f) => f.value === '0')).toBe(false);
  });

  it('zero różnic świeci zielono, niezerowe - czerwono; nadpisane na bursztynowo', () => {
    const clean = runFacts({ report: report(), at: AT }, NOW);
    expect(clean.find((f) => f.label === 'Wierszy różnych')?.tone).toBe('green');

    const dirty = runFacts({ report: written(), at: AT }, NOW);
    expect(dirty.find((f) => f.label === 'Wierszy rozjechanych')).toMatchObject({
      tone: 'red',
      unit: '3 pól',
    });
    expect(dirty.find((f) => f.label === 'Wierszy nadpisanych')?.tone).toBe('amber');
  });

  it('ETYKIETY zależą od trybu - po zapisie te same liczby znaczą co innego', () => {
    // „Wierszy różnych: 2" po udanym nadpisaniu czytałoby się jak stan bazy TERAZ,
    // a jest stanem sprzed zapisu.
    const labels = (r: RebuildReportDto) => runFacts({ report: r, at: AT }, NOW).map((f) => f.label);
    expect(labels(report())).toContain('Raport z porównania');
    expect(labels(report())).toContain('Wierszy różnych');
    expect(labels(written())).toContain('Raport z zapisu');
    expect(labels(written())).toContain('Wierszy rozjechanych');
    expect(labels(written())).toContain('Zostało do nadpisania');
  });

  it('POKAZUJE STEMPEL POBRANIA - obietnica docblocka `useMaintenance` z pokryciem', () => {
    // ══ TO JEST TA ASERCJA ══
    // `useMaintenance.ts` twierdził: „Ekran pokazuje przy nim godzinę pobrania, żeby
    // »przelicz i porównaj« nie było mylone z »tak jest teraz«". Nie pokazywał nigdzie.
    // Przy `staleTime: Infinity` i wyłączonym odświeżaniu na fokusie raport wisi bez
    // terminu ważności, więc akurat tu stempel ma znaczenie.
    const fact = runFacts({ report: report(), at: AT }, NOW).find((f) =>
      f.label.startsWith('Raport z'),
    )!;
    expect(fact.value).toBe('31 JUL 2026 14:22');
    // Wiek, nie sama godzina: „14:22 UTC" nie mówi, czy to było przed chwilą, czy rano.
    expect(fact.unit).toContain('UTC');
    expect(fact.unit).toContain('temu');
  });

  it('mówi wprost, że rejestr zdarzeń jest tylko do odczytu', () => {
    expect(runFacts({ report: report(), at: AT }, NOW).some((f) => f.value === 'tylko odczyt')).toBe(
      true,
    );
  });
});

describe('odmowa serwera → komunikat', () => {
  it('409 `nothing_to_rebuild` NIE JEST awarią i mówi, że dziennik został pusty', () => {
    const failure = rebuildFailure(409, { error: 'nothing_to_rebuild' });
    expect(failure.tone).toBe('status');
    expect(failure.title).toContain('Nie ma czego nadpisywać');
    expect(failure.body).toContain('NIE dostał wpisu');
  });

  it('400 `reason_required` kieruje do pola, a nie do zgadywania', () => {
    const failure = rebuildFailure(400, { error: 'reason_required' });
    expect(failure.tone).toBe('danger');
    expect(failure.body).toContain('Powód nadpisania');
  });

  it('403 mówi, KTÓREJ zdolności brakuje', () => {
    expect(rebuildFailure(403, { error: 'forbidden' }).body).toContain('maintenance.run');
  });

  it('awaria bez statusu (brak sieci) też dostaje zdanie, nie ciszę', () => {
    const failure = rebuildFailure(null, null);
    expect(failure.tone).toBe('danger');
    expect(failure.body).toContain('nietknięta');
  });
});
