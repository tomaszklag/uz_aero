/**
 * UZ Aero — panel: formularz korekty administratora (moduł czysty).
 *
 * Najważniejszy przypadek w tym pliku dotyczy STREFY CZASOWEJ. Wartość z tego pola
 * jedzie do rejestru klubu, a `new Date('2026-07-30 13:01:33')` w przeglądarce znaczy
 * czas LOKALNY — w Warszawie latem przesunięty o dwie godziny, bez błędu i bez
 * ostrzeżenia. Korekta czasu, która sama przesuwa czas, wygląda poprawnie i zapisuje
 * kłamstwo, więc test pilnuje, że parsowanie idzie przez `parseDateTimeUtc`.
 */

import { describe, expect, it } from 'vitest';

import type { TimelineEntryDto } from '../../api/dto';
import {
  ACTION_OPTIONS,
  REASON_MAX_LENGTH,
  correctionDraft,
  initialTimeText,
  reasonState,
  referenceTime,
  timeFieldState,
} from './korektaDraft';

const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number, s = 0): number => DAY + ((h * 60 + m) * 60 + s) * 1000;

/**
 * Wpis osi w kształcie, którego wymaga formularz. Pola podajemy PŁASKO (a nie jako
 * `Partial<Event>`), bo `Event` jest unią dyskryminowaną po `type` — częściowy obiekt
 * nie należy do żadnego jej wariantu i kompilator ma rację, odmawiając.
 */
interface EntryOverride {
  gpsTime?: number | null;
  deviceTime?: number;
  voided?: boolean;
  correctedTime?: number | null;
}

const entry = (over: EntryOverride = {}): TimelineEntryDto =>
  ({
    event: {
      uuid: 'b8d41f27-4c18',
      type: 'engine_stop',
      deviceTime: over.deviceTime ?? at(13, 13, 33),
      gpsTime: over.gpsTime ?? null,
      payload: {},
    },
    voided: over.voided ?? false,
    correctedTime: over.correctedTime ?? null,
  }) as unknown as TimelineEntryDto;

describe('czas odniesienia i wartość początkowa pola', () => {
  it('bierze czas, którym projekcja liczy dzień DZIŚ — GPS przed zegarem telefonu', () => {
    expect(referenceTime(entry())).toBe(at(13, 13, 33));
    expect(referenceTime(entry({ gpsTime: at(13, 1, 33) }))).toBe(at(13, 1, 33));
  });

  it('adnotacja serwera (`correctedTime`) wygrywa z czasem zapisanym', () => {
    // Zdarzenie z wcześniejszą korektą: punktem odniesienia jest to, co projekcja
    // liczy TERAZ, a nie to, co telefon zapisał pół roku temu.
    const value = referenceTime(entry({ correctedTime: at(12, 55, 0) }));
    expect(value).toBe(at(12, 55, 0));
  });

  it('pole startuje od korygowanego odczytu, nie od „teraz" i nie od pustki', () => {
    // Pusty formularz kazałby przepisać całą datę z osi — czyli dołożyłby okazję
    // do literówki tam, gdzie chodzi o minuty.
    expect(initialTimeText(entry())).toBe('2026-07-30 13:13:33');
  });
});

describe('pole nowego czasu', () => {
  it('parsuje JAWNIE w UTC i podaje skalę zmiany', () => {
    const state = timeFieldState('2026-07-30 13:01:33', at(13, 13, 33));

    expect(state.ok).toBe(true);
    expect(state.value).toBe(at(13, 1, 33));
    expect(state.message).toContain('00:12:00');
    expect(state.message).toContain('wcześniej');
  });

  it('rozpoznaje przesunięcie W PRZÓD i nazywa je po imieniu', () => {
    const state = timeFieldState('2026-07-30 13:20:33', at(13, 13, 33));
    expect(state.message).toContain('później');
    expect(state.message).toContain('00:07:00');
  });

  it('mówi wprost, gdy czas jest ten sam — korekta bez zmiany to nie korekta', () => {
    const state = timeFieldState('2026-07-30 13:13:33', at(13, 13, 33));
    expect(state.ok).toBe(true);
    expect(state.message).toContain('Ten sam czas');
  });

  it('pusty wpis NIE jest błędem pola — to stan początkowy, nie pomyłka', () => {
    const state = timeFieldState('   ', at(13, 13, 33));
    expect(state.ok).toBe(false);
    expect(state.invalid).toBe(false);
    expect(state.value).toBeNull();
  });

  it('wpis nieczytelny BLOKUJE i podświetla pole', () => {
    for (const bad of ['13:01', '30-07-2026 13:01', '2026-02-30 10:00', 'wczoraj']) {
      const state = timeFieldState(bad, at(13, 13, 33));
      expect(state.ok).toBe(false);
      expect(state.invalid).toBe(true);
      expect(state.value).toBeNull();
    }
  });
});

describe('powód korekty', () => {
  it('pusty i sam biały znak są ODRZUCANE, zanim poleci żądanie', () => {
    // Serwer sprawdza to samo (`.trim().min(1)`), więc to nie jest zabezpieczenie —
    // to różnica między „przycisk mówi, czego brakuje" a „400 bez wyjaśnienia".
    for (const bad of ['', '   ', '\n\t ']) {
      const state = reasonState(bad);
      expect(state.ok).toBe(false);
      expect(state.reason).not.toBeNull();
    }
  });

  it('odrzuca powód dłuższy niż limit serwera, z podaniem limitu', () => {
    const state = reasonState('x'.repeat(REASON_MAX_LENGTH + 1));
    expect(state.ok).toBe(false);
    expect(state.reason).toContain(String(REASON_MAX_LENGTH));
  });

  it('sensowne uzasadnienie przechodzi bez uwag', () => {
    expect(reasonState('Zegar telefonu spieszył 12 min.')).toEqual({ ok: true, reason: null });
  });
});

describe('szkic korekty', () => {
  const time = timeFieldState('2026-07-30 13:01:33', at(13, 13, 33));

  it('`retime` niesie nowy czas, `void` nie niesie nic ponad cel', () => {
    expect(correctionDraft('retime', 'cel-1', time)).toEqual({
      targetUuid: 'cel-1',
      action: 'retime',
      newTime: at(13, 1, 33),
    });
    expect(correctionDraft('void', 'cel-1', time)).toEqual({ targetUuid: 'cel-1', action: 'void' });
  });

  it('`retime` bez czytelnego czasu NIE POWSTAJE — brak podglądu zamiast złego podglądu', () => {
    const broken = timeFieldState('wczoraj', at(13, 13, 33));
    expect(correctionDraft('retime', 'cel-1', broken)).toBeNull();
  });

  it('`void` działa nawet z zepsutym polem czasu — nie używa go w ogóle', () => {
    const broken = timeFieldState('wczoraj', at(13, 13, 33));
    expect(correctionDraft('void', 'cel-1', broken)).toEqual({
      targetUuid: 'cel-1',
      action: 'void',
    });
  });

  it('bez celu nie ma czego korygować', () => {
    expect(correctionDraft('void', '', time)).toBeNull();
  });

  it('szkic NIE NIESIE powodu — ten należy wyłącznie do zapisu i do audytu', () => {
    // Ten sam obiekt jedzie do podglądu i do zapisu; gdyby niósł `reason`, podgląd
    // wymagałby uzasadnienia, żeby pokazać liczby — czyli odwracałby kolejność
    // myślenia: najpierw rozumiesz skutek, potem tłumaczysz decyzję.
    expect(Object.keys(correctionDraft('retime', 'cel-1', time)!).sort()).toEqual([
      'action',
      'newTime',
      'targetUuid',
    ]);
  });
});

describe('lista akcji', () => {
  it('ma DOKŁADNIE dwie pozycje — tyle, ile zna domena', () => {
    expect(ACTION_OPTIONS.map((option) => option.id)).toEqual(['retime', 'void']);
  });
});
