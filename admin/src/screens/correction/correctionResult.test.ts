/**
 * UZ Aero - panel: skutek i odmowa korekty (moduł czysty).
 *
 * ══ PRZYPADEK, DLA KTÓREGO TEN PLIK ISTNIEJE ══
 * `reexport: null` - korekta ZAPISANA, arkusz NIE zregenerowany. Sugerowanie sukcesu
 * byłoby kłamstwem (klub czyta stare liczby), a sugerowanie porażki kłamstwem GORSZYM:
 * administrator dopisałby korektę drugi raz do rejestru, który już ją ma. Test pilnuje,
 * że komunikat mówi obie połowy i wprost odradza powtórzenie.
 */

import { describe, expect, it } from 'vitest';

import type { CorrectionResultDto } from '../../api/dto';
import { correctionFailure, correctionOutcome, violationMessages } from './correctionResult';

const result = (over: Partial<CorrectionResultDto> = {}): CorrectionResultDto =>
  ({
    sessionUuid: 'sess-1',
    correctionUuid: 'corr-1',
    targetUuid: 'b8d41f27-4c18',
    action: 'retime',
    recordedAt: '2026-08-01T14:22:07.000Z',
    state: {} as CorrectionResultDto['state'],
    reexport: { exported: true, tab: '2026-07-30_SP-KLM', revision: 3, url: 'http://x/3' },
    ...over,
  }) as CorrectionResultDto;

describe('korekta zapisana i arkusz odświeżony', () => {
  const outcome = correctionOutcome(result());

  it('podaje NUMER REWIZJI, a nie samo „zapisano"', () => {
    expect(outcome.tone).toBe('ok');
    expect(outcome.steps.join(' ')).toContain('rewizja 3');
    expect(outcome.steps.join(' ')).toContain('2026-07-30_SP-KLM');
  });

  it('wypisuje cztery kroki w kolejności, w której naprawdę zachodzą', () => {
    expect(outcome.steps).toHaveLength(4);
    expect(outcome.steps[0]).toContain('Rejestr');
    expect(outcome.steps[1]).toContain('Audyt');
    expect(outcome.steps[2]).toContain('Arkusz');
    expect(outcome.steps[3]).toContain('Flagi');
  });

  it('flaga ZOSTAJE otwarta - korekta poprawia liczbę, nie rozstrzyga rozbieżności', () => {
    expect(outcome.steps[3]).toContain('bez zmian');
  });

  it('przypomina, że zmiana NIE wróci na telefon pilota', () => {
    expect(outcome.note).toContain('jednokierunkowa');
  });

  it('stempluje korektę czasem UTC z odpowiedzi serwera', () => {
    expect(outcome.steps[0]).toContain('14:22:07 UTC');
  });
});

describe('korekta zapisana, arkusz NIE (reexport === null)', () => {
  const outcome = correctionOutcome(result({ reexport: null }));

  it('mówi obie połowy prawdy w tytule', () => {
    expect(outcome.tone).toBe('warn');
    expect(outcome.title).toContain('zapisana');
    expect(outcome.title).toContain('NIE');
  });

  it('ODRADZA powtórzenie korekty - to jest tu najważniejsze zdanie', () => {
    expect(outcome.note).toContain('NIE powtarzaj');
    expect(outcome.note).toContain('drugie zdarzenie');
  });

  it('wskazuje właściwą drogę naprawy: ponowienie eksportu, nie korekty', () => {
    expect(outcome.note).toContain('Eksporty');
  });
});

describe('korekta zapisana, eksporter ODMÓWIŁ z powodem', () => {
  const outcome = correctionOutcome(
    result({ reexport: { exported: false, reason: 'overlap_flag' } }),
  );

  it('tłumaczy powód po ludzku, zamiast pokazać kod z bazy', () => {
    expect(outcome.tone).toBe('warn');
    // Po rozdzieleniu `session_overlap` (2026-08-07) „flaga nakładki" przestała być
    // jednoznaczna: bramką arkusza jest WYŁĄCZNIE `aircraft_overlap`, a `pilot_overlap`
    // dokumentu klubu nie dotyka. Napis musi więc mówić, KTÓRA to nakładka - i że
    // trzyma poza kartą DOBY jedną sesję, a nie całą kartę (§4.7).
    expect(outcome.steps[2]).toContain('aircraft_overlap');
    expect(outcome.steps[2]).toContain('poza kartą doby');
  });

  it('nazywa odmowę stanem świata, a nie awarią', () => {
    expect(outcome.note).toContain('nie błąd');
  });
});

describe('odmowy zapisu', () => {
  it('422 pokazuje KONKRETNE naruszenia domeny, nie „popraw formularz"', () => {
    const failure = correctionFailure(422, {
      error: 'rule_violation',
      violations: [
        {
          code: 'CORRECTION_TARGET_NOT_ALLOWED',
          severity: 'error',
          message: 'To zdarzenie nie podlega korekcie.',
        },
      ],
    });

    expect(failure.violations).toEqual([
      'CORRECTION_TARGET_NOT_ALLOWED - To zdarzenie nie podlega korekcie.',
    ]);
    expect(failure.detail).toContain('Nic nie zostało zapisane');
    expect(failure.final).toBe(false);
  });

  it('`day_open` NIE JEST już osobną odmową - bramka znikła po obu stronach', () => {
    // ODWRÓCENIE testu z 2026-08-01, który brzmiał „400 `day_open` odróżnia się od
    // zwykłego 400". Serwer takiej odmowy nie wysyła od 2026-08-07: administrator może
    // edytować ZAWSZE, a kolizja z pilotem jedzie jako ostrzeżenie nad formularzem
    // (`correctionWarnings.ts`). Gdyby stary kod jednak nadszedł ze starego wdrożenia,
    // panel ma go potraktować jak każde inne odrzucenie formularza - a nie tłumaczyć
    // regułę, której już nie ma.
    const dayOpen = correctionFailure(400, { error: 'day_open' });
    expect(dayOpen.title).toContain('formularz');
    expect(dayOpen.final).toBe(false);

    const badRequest = correctionFailure(400, { error: 'bad_request' });
    expect(badRequest.title).toContain('formularz');
    expect(badRequest.final).toBe(false);
  });

  it('403 podaje POWÓD roli, a nie sam kod', () => {
    const failure = correctionFailure(403, { error: 'forbidden', required: 'events.correct' });
    expect(failure.detail).toMatch(/administrator/i);
    expect(failure.final).toBe(true);
  });

  it('404 kieruje na listę dni, bo najczęstszą przyczyną jest ucięty uuid', () => {
    expect(correctionFailure(404, { error: 'not_found' }).detail).toContain('listę dni');
  });

  it('brak sieci OSTRZEGA przed ślepym ponowieniem - żądanie mogło dojść', () => {
    const failure = correctionFailure(null, null);
    expect(failure.detail).toContain('ODŚWIEŻ');
    expect(failure.detail).toContain('drugie zdarzenie');
  });

  it('nieznany kod nie udaje, że wie - podaje status i radzi sprawdzić oś', () => {
    const failure = correctionFailure(503, { error: 'unavailable' });
    expect(failure.detail).toContain('503');
    expect(failure.violations).toEqual([]);
  });
});

describe('naruszenia z podglądu', () => {
  it('składają się w te same napisy, co przy 422 - te same reguły, inna chwila', () => {
    expect(
      violationMessages([{ code: 'CORRECTION_TIME_IN_FUTURE', message: 'Nie z przyszłości.' }]),
    ).toEqual(['CORRECTION_TIME_IN_FUTURE - Nie z przyszłości.']);
  });

  it('pusta lista to pusta lista, a nie „wszystko w porządku" napisane słowami', () => {
    expect(violationMessages([])).toEqual([]);
  });
});
