/**
 * UZ Aero — panel: nagłówek karty dnia, baner stanu i brama korekty (moduł czysty).
 *
 * Najważniejszy przypadek tego pliku: **przycisk korekty NIGDY nie znika — jest
 * wyszarzony Z PODANYM POWODEM.** Ukrycie zmusiłoby szefa wyszkolenia do zgadywania,
 * czy funkcji nie ma w produkcie, czy nie ma jej on; a to dwie różne rozmowy
 * z administratorem.
 */

import type { SessionState } from '@uzaero/domain';
import { describe, expect, it } from 'vitest';

import type { Capability, SessionListItemDto } from '../../api/dto';
import { correctionAccess, dayBanner, dayHeader } from './dzienHeader';

const DAY = Date.UTC(2026, 6, 30);
const NOW = Date.UTC(2026, 6, 31, 14, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

const ADMIN: Capability[] = ['panel.access', 'flags.resolve', 'events.correct', 'audit.read'];
const TRAINING_LEAD: Capability[] = ['panel.access', 'flags.resolve'];

const state = (over: Partial<SessionState> = {}): SessionState =>
  ({
    departureIcao: 'EPRA',
    arrivalIcao: 'EPRA',
    closed: true,
    closedAt: at(13, 22),
    ...over,
  }) as unknown as SessionState;

const session = (over: Partial<SessionListItemDto> = {}): SessionListItemDto =>
  ({
    sessionUuid: 'sess-1',
    aircraftId: 'SP-KLM',
    reg: 'SP-KLM',
    aircraftType: 'Cessna 208 Caravan',
    picId: 'AWR',
    picCode: 'AWR',
    picName: 'Anna Wrzosek',
    dualId: null,
    dualCode: null,
    dualName: null,
    operation: 'skoki',
    client: 'SKY CAMP',
    dutyStart: at(5, 45),
    updatedAt: new Date(NOW - 24 * 60_000).toISOString(),
    ...over,
  }) as unknown as SessionListItemDto;

describe('dayHeader', () => {
  it('nazywa dzień datą MELDUNKU i rejestracją', () => {
    expect(dayHeader(session(), state()).title).toBe('30 JUL 2026 · SP-KLM');
  });

  it('sesja bez preflightu NIE dostaje zmyślonej daty', () => {
    // Podstawienie daty pierwszego zdarzenia albo „dzisiaj" byłoby zgadywaniem
    // w narzędziu, którego jedynym zadaniem jest nie zgadywać.
    expect(dayHeader(session({ dutyStart: null }), state()).title).toBe('DZIEŃ BEZ MELDUNKU · SP-KLM');
  });

  it('podtytuł niesie samolot, załogę, operację, klienta i trasę', () => {
    const lines = dayHeader(
      session({ dualId: 'KNO', dualCode: 'KNO', dualName: 'Karolina Nowak' }),
      state(),
    ).lines.join(' | ');

    expect(lines).toContain('Cessna 208 Caravan');
    expect(lines).toContain('PIC Anna Wrzosek (AWR)');
    expect(lines).toContain('dual Karolina Nowak (KNO)');
    expect(lines).toContain('operacja skoki');
    expect(lines).toContain('klient SKY CAMP');
    expect(lines).toContain('EPRA → EPRA');
  });

  it('pomija człony, których nie ma — zamiast wypisywać puste etykiety', () => {
    const lines = dayHeader(
      session({ aircraftType: null, operation: null, client: null }),
      state({ departureIcao: null, arrivalIcao: null }),
    ).lines.join(' | ');

    expect(lines).not.toContain('operacja');
    expect(lines).not.toContain('klient');
    expect(lines).toContain('PIC Anna Wrzosek');
  });
});

describe('dayBanner', () => {
  it('dzień otwarty mówi, że to MIGAWKA, i podaje wiek ostatniej paczki', () => {
    const banner = dayBanner(session(), state({ closed: false, closedAt: null }), NOW);

    expect(banner.tone).toBe('status');
    expect(banner.title).toContain('Dzień otwarty');
    expect(banner.body).toContain('24 min temu');
    expect(banner.body).toContain('stanem na ostatni sync');
    // Cała treść tego stanu: panel pokazuje „—" i nie ekstrapoluje.
    expect(banner.body).toContain('zamiast zgadywać');
  });

  it('dzień zamknięty podaje stempel i wiek zamknięcia', () => {
    const banner = dayBanner(session(), state(), NOW);

    expect(banner.tone).toBe('warn');
    expect(banner.title).toContain('30 JUL 2026 13:22:00 UTC');
    expect(banner.title).toContain('1 dzień 1 h temu');
  });

  it('NIE odlicza okna korekty — próg doby jest wartością domeny, nie panelu', () => {
    // Kopia progu w panelu rozjechałaby się po cichu z regułą, którą serwer naprawdę
    // egzekwuje przy zapisie. Baner mówi, kto poprawia i kiedy, a rozstrzyga serwer.
    const banner = dayBanner(session(), state(), NOW);
    expect(banner.body).toContain('rozstrzyga serwer w chwili zapisu');
  });

  it('nieczytelny stempel paczki mówi to wprost', () => {
    const banner = dayBanner(session({ updatedAt: 'nie-data' }), state({ closed: false, closedAt: null }), NOW);
    expect(banner.body).toContain('czas ostatniej paczki nieznany');
  });
});

describe('correctionAccess', () => {
  it('administrator dostaje link do ekranu korekty', () => {
    expect(correctionAccess('sess-1', state(), ADMIN)).toEqual({
      to: '/dni/sess-1/korekta',
      label: 'Korekta administratora',
      disabled: false,
      reason: null,
    });
  });

  it('szef wyszkolenia widzi przycisk WYSZARZONY z powodem, nigdy ukryty', () => {
    // `events.correct` ma TYLKO administrator: korekta dopisuje zdarzenie do cudzego
    // rejestru. Ukrycie przycisku nigdy nie było ochroną i tym się nie staje —
    // egzekwuje serwer, przy każdym żądaniu.
    const access = correctionAccess('sess-1', state(), TRAINING_LEAD);

    expect(access.disabled).toBe(true);
    expect(access.to).toBe('');
    expect(access.reason).toBe('Wymaga roli: administrator');
    // Etykieta zostaje TA SAMA — człowiek ma widzieć tę samą akcję, tylko zablokowaną.
    expect(access.label).toBe('Korekta administratora');
  });

  it('brak sesji (jeszcze nie wiadomo, kto to) też blokuje z powodem', () => {
    expect(correctionAccess('sess-1', state(), undefined).disabled).toBe(true);
  });

  it('DZIEŃ OTWARTY blokuje korektę — i to jest ta sama odmowa, co po stronie serwera', () => {
    // Przy otwartym dniu pilot ma pełne prawo zapisu i poprawia sam, a korekta
    // administratora nie wraca na telefon (sync jest jednokierunkowy). Serwer odmawia
    // tego wprost (`day_open`), więc panel nie zaprasza do żądania, które odbije.
    const access = correctionAccess('sess-1', state({ closed: false, closedAt: null }), ADMIN);

    expect(access.disabled).toBe(true);
    expect(access.reason).toContain('Dzień jeszcze trwa');
  });
});
