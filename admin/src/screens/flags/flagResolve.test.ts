/**
 * UZ Aero — panel: rozstrzygnięcie flagi (moduł czysty).
 *
 * Cztery zachowania, których nie widać w typach i których nie sprawdzi serwer:
 * blokada pustego komentarza PRZED żądaniem, treść przegranego wyścigu (409),
 * uczciwy opis skutku dla karty dnia i wyszarzenie korekty przy braku zdolności.
 */

import { describe, expect, it } from 'vitest';

import type { FlagListItemDto, ResolveFlagResultDto } from '../../api/dto';
import {
  correctionAction,
  noteState,
  resolveFailure,
  resolveOutcome,
  NOTE_MAX_LENGTH,
} from './flagResolve';

const flag: FlagListItemDto = {
  id: 1046,
  type: 'session_overlap',
  status: 'open',
  aircraftId: 'SP-KLM',
  reg: 'SP-KLM',
  aircraftType: 'Cessna 208 Caravan',
  sessionUuids: ['e881-04dc', '2ab7-9910'],
  details: { openSessions: 2 },
  createdAt: '2026-07-30T05:58:07.000Z',
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
  blocksExport: true,
};

describe('komentarz jest wymagany', () => {
  it('pusty i sam biały znak są ODRZUCANE, zanim poleci żądanie', () => {
    // Serwer sprawdza to samo (`.trim().min(1)`), więc to nie jest zabezpieczenie —
    // to różnica między „przycisk mówi, czego brakuje" a „400 bez wyjaśnienia".
    for (const bad of ['', '   ', '\n\t ']) {
      const state = noteState(bad);
      expect(state.ok).toBe(false);
      expect(state.reason).not.toBeNull();
    }
  });

  it('przepuszcza treść i nie zostawia powodu odmowy', () => {
    expect(noteState('Nakładka pozorna — day_close dotarł 31 JUL.')).toEqual({
      ok: true,
      reason: null,
    });
  });

  it('odrzuca komentarz dłuższy niż limit serwera', () => {
    expect(noteState('x'.repeat(NOTE_MAX_LENGTH)).ok).toBe(true);
    expect(noteState('x'.repeat(NOTE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe('przegrany wyścig (409)', () => {
  it('mówi, KTO zamknął sprawę pierwszy i czym ją uzasadnił', () => {
    const failure = resolveFailure(409, {
      error: 'already_resolved',
      flag: {
        id: 1046,
        type: 'session_overlap',
        aircraftId: 'SP-KLM',
        sessionUuids: ['e881-04dc'],
        details: {},
        status: 'resolved',
        resolvedAt: '2026-07-31T08:15:00.000Z',
        resolvedBy: 'TMK',
        resolutionNote: 'Telefon dosłał day_close — nakładka pozorna.',
      },
    });

    expect(failure.winner).toEqual({
      by: 'TMK',
      at: '31 JUL 2026 08:15 UTC',
      note: 'Telefon dosłał day_close — nakładka pozorna.',
    });
    // Nie „coś poszło nie tak": drugi klikający ma wiedzieć, że decyzja zapadła,
    // i nie dopisywać własnego uzasadnienia do cudzego rozstrzygnięcia.
    expect(failure.title).not.toMatch(/błąd|nie powiodło/i);
    expect(failure.detail).toMatch(/nie został zapisany/i);
    // Ponawianie nie ma sensu — świat się zmienił, a nie żądanie się zgubiło.
    expect(failure.final).toBe(true);
  });

  it('409 bez ciała nadal jest zrozumiały — po prostu bez nazwiska', () => {
    const failure = resolveFailure(409, { error: 'already_resolved' });
    expect(failure.winner).toBeNull();
    expect(failure.final).toBe(true);
    expect(failure.title.length).toBeGreaterThan(0);
  });

  it('403 i awaria sieci to TRZY różne wiadomości, nie jedna', () => {
    const forbidden = resolveFailure(403, { error: 'forbidden', required: 'flags.resolve' });
    const offline = resolveFailure(null, null);
    const conflict = resolveFailure(409, { error: 'already_resolved' });

    expect(new Set([forbidden.title, offline.title, conflict.title]).size).toBe(3);
    expect(offline.final).toBe(false); // sieć wraca; rola i cudza decyzja — nie
    expect(forbidden.final).toBe(true);
  });

  it('każdy wariant ma niepusty tytuł i treść (kontrola kompletności)', () => {
    const cases: Array<[number | null, { error: string } | null]> = [
      [409, { error: 'already_resolved' }],
      [404, { error: 'not_found' }],
      [403, { error: 'forbidden' }],
      [400, { error: 'bad_request' }],
      [null, null],
      [503, { error: 'unavailable' }],
    ];
    for (const [status, body] of cases) {
      const failure = resolveFailure(status, body);
      expect(failure.title.trim().length).toBeGreaterThan(0);
      expect(failure.detail.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('skutek rozstrzygnięcia', () => {
  const result = (exports: ResolveFlagResultDto['exports']): ResolveFlagResultDto => ({
    flagId: 1046,
    type: 'session_overlap',
    resolvedAt: '2026-07-31T14:22:00.000Z',
    exports,
  });

  it('pusta lista eksportów to POPRAWNA odpowiedź, nie brak informacji', () => {
    // Serwer ponawia karty wyłącznie dla `session_overlap`. Obietnica rewizji po
    // rozwiązaniu `mh_gap` uczyłaby nieufności do narzędzia.
    const outcome = resolveOutcome(result([]));
    expect(outcome.tone).toBe('ok');
    expect(outcome.lines).toEqual([]);
    expect(outcome.note).toMatch(/nie blokowała eksportu/i);
  });

  it('podaje NUMER REWIZJI, a nie samo „zapisano"', () => {
    const outcome = resolveOutcome(
      result([
        {
          sessionUuid: 'sess-2',
          outcome: { exported: true, tab: '2026-07-30_SP-KLM', revision: 1, url: 'http://x/y' },
        },
      ]),
    );
    expect(outcome.tone).toBe('ok');
    expect(outcome.lines[0]).toContain('2026-07-30_SP-KLM');
    expect(outcome.lines[0]).toContain('rewizja 1');
  });

  it('odmowa eksportu ma POWÓD po polsku, nie surowy kod z bazy', () => {
    const outcome = resolveOutcome(
      result([{ sessionUuid: 'sess-1', outcome: { exported: false, reason: 'session_open' } }]),
    );
    expect(outcome.lines[0]).not.toContain('session_open');
    expect(outcome.lines[0]).toMatch(/nie zamknięty/i);
  });

  it('awaria samego eksportu NIE udaje, że flaga się nie zamknęła', () => {
    // Flaga JEST rozwiązana — transakcja się zatwierdziła, a eksport idzie po niej.
    // Komunikat błędu w tym miejscu sugerowałby, że decyzja przepadła.
    const outcome = resolveOutcome(result([{ sessionUuid: 'sess-2', outcome: null }]));
    expect(outcome.tone).toBe('warn');
    expect(outcome.title).toMatch(/zamknięta/i);
    expect(outcome.note).toMatch(/Ponów eksport/i);
  });
});

describe('korekta zdarzenia — zdolności są rozłączne', () => {
  it('administrator idzie na KARTĘ DNIA — to oś zdarzeń wybiera cel korekty', () => {
    // Flaga wskazuje sesję, nie zdarzenie (`session_overlap` opisuje dwie nakładki,
    // a nie pojedynczy odczyt). Korekta celuje w konkretny uuid, więc wybór musi
    // zapaść tam, gdzie uuid-y są widoczne.
    const action = correctionAction(flag, ['panel.access', 'flags.resolve', 'events.correct']);
    expect(action.disabled).toBe(false);
    expect(action.to).toBe('/dni/e881-04dc');
    expect(action.label).toContain('SP-KLM');
  });

  it('szef wyszkolenia MOŻE zamknąć flagę, ale NIE MOŻE korygować', () => {
    // To jest sedno podziału: skrzynka jest jego głównym narzędziem, a korekta
    // dopisuje zdarzenie do rejestru i zostaje przy administratorze.
    const action = correctionAction(flag, ['panel.access', 'flags.resolve']);
    expect(action.disabled).toBe(true);
    expect(action.reason).toMatch(/administrator/i);
  });

  it('brak zdolności WYSZARZA z powodem — nigdy nie ukrywa', () => {
    // Ukrycie zmusza człowieka do zgadywania, czy funkcji nie ma w produkcie,
    // czy nie ma jej ON — a to dwie różne rozmowy z administratorem.
    const action = correctionAction(flag, undefined);
    expect(action.disabled).toBe(true);
    expect(action.label).toBe('Korekta zdarzenia');
    expect(action.reason).not.toBeNull();
  });

  it('flaga bez sesji blokuje akcję z INNYM powodem niż brak roli', () => {
    const action = correctionAction({ ...flag, sessionUuids: [] }, ['events.correct']);
    expect(action.disabled).toBe(true);
    expect(action.reason).toMatch(/sesji/i);
  });
});
