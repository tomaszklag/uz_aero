/**
 * UZ Aero — panel: nazwanie stanów karty i wyniku ponowienia.
 *
 * Najważniejsza własność: **odmowa i awaria to DWIE różne wiadomości**. „Flaga trzyma
 * kartę" jest stanem świata, „eksport rzucił" jest usterką — sklejenie ich w jedno
 * „nie udało się" kazałoby administratorowi zgadywać, czy ponawiać, czy iść do flag.
 */

import { describe, expect, it } from 'vitest';

import type { ExportFailureDto, ExportStateDto } from '../../api/dto';
import { EXPORT_STATE_META, retryLabel, retryMessage } from './eksportyStates';

describe('stany karty', () => {
  it('każdy stan serwera ma nazwę, plakietkę i wyjaśnienie', () => {
    const states: ExportStateDto[] = ['waiting', 'blocked', 'impossible', 'missing', 'current'];
    for (const state of states) {
      const meta = EXPORT_STATE_META[state];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.note.length).toBeGreaterThan(0);
    }
  });

  it('kropka „to trwa" tylko tam, gdzie coś faktycznie trwa', () => {
    // Dzień w toku i flaga czekająca na człowieka — tak. Karta w arkuszu i sesja bez
    // preflightu to stany zastane, nie procesy.
    expect(EXPORT_STATE_META.waiting.dot).toBe(true);
    expect(EXPORT_STATE_META.blocked.dot).toBe(true);
    expect(EXPORT_STATE_META.current.dot).toBe(false);
    expect(EXPORT_STATE_META.impossible.dot).toBe(false);
  });
});

describe('wynik ponowienia jako zdanie', () => {
  it('sukces podaje NUMER rewizji, nie samo „zapisano"', () => {
    const message = retryMessage(
      { exported: true, tab: '2026-07-30_SP-ABC', revision: 3, url: 'http://x' },
      2,
      null,
    );

    expect(message.tone).toBe('ok');
    expect(message.title).toContain('2 → 3');
    expect(message.body).toContain('append-only');
  });

  it('pierwszy eksport mówi „po raz pierwszy", nie „z null na 1"', () => {
    const message = retryMessage(
      { exported: true, tab: '2026-07-30_SP-ABC', revision: 1, url: 'http://x' },
      null,
      null,
    );

    expect(message.title).toContain('po raz pierwszy');
    expect(message.title).not.toContain('null');
  });

  it('odmowa jest OSTRZEŻENIEM z powodem — i mówi, że bramki się nie omija', () => {
    const message = retryMessage({ exported: false, reason: 'overlap_flag' }, 2, null);

    expect(message.tone).toBe('warn');
    expect(message.body).toContain('session_overlap');
    expect(message.body).toContain('nie omija');
  });

  it('każdy powód odmowy ma polskie zdanie — także ten najrzadszy', () => {
    for (const reason of ['no_events', 'session_open', 'no_preflight', 'overlap_flag'] as const) {
      expect(retryMessage({ exported: false, reason }, null, null).body.length).toBeGreaterThan(20);
    }
  });

  it('awaria ARKUSZY jest błędem, który minie — i mówi, żeby spróbować za chwilę', () => {
    const message = retryMessage(null, 2, 'sheets_adapter');

    expect(message.tone).toBe('danger');
    // To jest znany tryb awarii: dane w rejestrze są całe, padł zapis do arkusza.
    expect(message.title).toContain('Adapter arkuszy');
    expect(message.body).toContain('za chwilę');
    expect(message.body).toContain('nie zostawia śladu');
  });

  it('błąd PO NASZEJ STRONIE nie udaje awarii arkuszy i nie każe czekać', () => {
    // Wada, którą ten przypadek zamyka: do 2026-08-01 komenda łapała KAŻDY wyjątek
    // i zwracała `outcome: null`, więc `TypeError` w budowie karty dostawał zdanie
    // „Adapter arkuszy zgłosił awarię — spróbuj ponownie za chwilę". Administrator
    // czekał na usterkę, która sama nie mija.
    const message = retryMessage(null, 2, 'unexpected');

    expect(message.tone).toBe('danger');
    expect(message.title).not.toContain('Adapter arkuszy');
    expect(message.body).toContain('NIE jest awaria arkuszy');
    expect(message.body).toContain('Zgłoś');
    // …i musi się RÓŻNIĆ od tamtego zdania, a nie tylko brzmieć podobnie.
    expect(message.body).not.toBe(retryMessage(null, 2, 'sheets_adapter').body);
  });

  it('każdy rodzaj awarii ma własne zdanie; brak rodzaju NIE wskazuje na arkusze', () => {
    const failures: ExportFailureDto[] = ['sheets_adapter', 'unexpected'];
    for (const failure of failures) {
      expect(retryMessage(null, null, failure).body.length).toBeGreaterThan(20);
    }
    // Serwer zawsze przysyła `failure` przy `outcome: null`; gdyby przestał, wolimy
    // zdanie o nieznanej awarii niż fałszywe wskazanie na arkusze.
    expect(retryMessage(null, null, null).title).not.toContain('Adapter arkuszy');
  });
});

describe('napis na przycisku ponowienia', () => {
  it('mówi „Ponawiam…" WYŁĄCZNIE o wierszu, którego ponowienie trwa', () => {
    expect(retryLabel(true)).toBe('Ponawiam…');
    expect(retryLabel(false)).toBe('Ponów');
  });
});
