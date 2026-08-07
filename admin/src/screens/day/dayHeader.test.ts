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
import { correctionAccess, correctionPath, dayBanner, dayHeader } from './dayHeader';

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
    claimedAt: at(5, 45),
    updatedAt: new Date(NOW - 24 * 60_000).toISOString(),
    ...over,
  }) as unknown as SessionListItemDto;

describe('dayHeader', () => {
  it('nazywa sesję datą PRZEJĘCIA i rejestracją', () => {
    expect(dayHeader(session(), state()).title).toBe('30 JUL 2026 · SP-KLM');
  });

  it('sesja bez claimu NIE dostaje zmyślonej daty', () => {
    // Podstawienie daty pierwszego zdarzenia albo „dzisiaj" byłoby zgadywaniem
    // w narzędziu, którego jedynym zadaniem jest nie zgadywać.
    expect(dayHeader(session({ claimedAt: null }), state()).title).toBe('SESJA BEZ CLAIMU · SP-KLM');
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
  it('samolot nieoddany mówi, że to MIGAWKA, i podaje wiek ostatniej paczki', () => {
    const banner = dayBanner(session(), state({ closed: false, closedAt: null }), NOW);

    expect(banner.tone).toBe('status');
    // „Dzień otwarty" był pomyłką kategorii: otwarta jest SESJA jednej maszyny,
    // a pilot potrafi w tej samej służbie zdać ją i wziąć następną (§3.6a).
    expect(banner.title).toContain('Samolot nieoddany');
    expect(banner.body).toContain('24 min temu');
    expect(banner.body).toContain('stanem na ostatni sync');
    // Cała treść tego stanu: panel pokazuje „—" i nie ekstrapoluje.
    expect(banner.body).toContain('zamiast zgadywać');
  });

  it('samolot zdany podaje stempel i wiek zdania', () => {
    const banner = dayBanner(session(), state(), NOW);

    expect(banner.tone).toBe('warn');
    expect(banner.title).toContain('Samolot zdany');
    expect(banner.title).toContain('30 JUL 2026 13:22:00 UTC');
    expect(banner.title).toContain('1 dzień 1 h temu');
  });

  it('mówi, że okno korekty kotwiczy się we WZLOCIE, a nie w zdaniu samolotu', () => {
    // Sprostowanie z etapu B3. Do etapu D baner obiecywał „przez dobę OD ZAMKNIĘCIA
    // poprawia sam pilot" — czyli od `day_close`. Po §3.6a każdy wzlot ma własną dobę
    // liczoną od `leg_close` (awaryjnie od `engine_stop`), więc zdanie samolotu nie
    // uruchamia ani nie kończy żadnego okna.
    const banner = dayBanner(session(), state(), NOW);
    expect(banner.body).toContain('`leg_close`');
    expect(banner.body).toContain('Administrator dopisuje zmianę zawsze');
    // Panel dalej nie trzyma kopii progu domeny.
    expect(banner.body).toContain('nie odlicza tych okien za Ciebie');
  });

  it('nieczytelny stempel paczki mówi to wprost', () => {
    const banner = dayBanner(session({ updatedAt: 'nie-data' }), state({ closed: false, closedAt: null }), NOW);
    expect(banner.body).toContain('czas ostatniej paczki nieznany');
  });
});

describe('correctionAccess', () => {
  it('administrator ma korektę DOSTĘPNĄ — bez adresu, bo cel wybiera oś dnia', () => {
    // Adresu tu nie ma i to jest treść zmiany: korekta dotyczy KONKRETNEGO zdarzenia,
    // a wyboru dokonuje się na osi. Link bez celu prowadziłby w ekran, który nie wie,
    // co poprawia.
    expect(correctionAccess(ADMIN)).toEqual({
      label: 'Korekta administratora',
      allowed: true,
      reason: null,
    });
  });

  it('szef wyszkolenia dostaje POWÓD, nigdy ciche ukrycie akcji', () => {
    // `events.correct` ma TYLKO administrator: korekta dopisuje zdarzenie do cudzego
    // rejestru. Ukrycie nigdy nie było ochroną i tym się nie staje — egzekwuje serwer,
    // przy każdym żądaniu.
    const access = correctionAccess(TRAINING_LEAD);

    expect(access.allowed).toBe(false);
    expect(access.reason).toBe('Wymaga roli: administrator');
    // Etykieta zostaje TA SAMA — człowiek ma widzieć tę samą akcję, tylko zablokowaną.
    expect(access.label).toBe('Korekta administratora');
  });

  it('brak sesji (jeszcze nie wiadomo, kto to) też blokuje z powodem', () => {
    const access = correctionAccess(undefined);
    expect(access.allowed).toBe(false);
    expect(access.reason).not.toBeNull();
  });

  it('OTWARTA SESJA NIE blokuje już korekty — bramka `day_open` znikła', () => {
    // ODWRÓCENIE testu z 2026-08-01 („DZIEŃ OTWARTY blokuje korektę"). Reguła lustrzyła
    // bramkę serwera, a ta opierała się na równości „brak `day_close` = dzień trwa",
    // którą §3.6a unieważnił: zdanie samolotu jest OPCJONALNE, więc warunek odmawiałby
    // korekty przede wszystkim tam, gdzie jest potrzebna. Administrator nie jest NIGDY
    // blokowany; kolizję nazywa baner nad formularzem (`correctionWarnings.ts`).
    //
    // Widać to także w SYGNATURZE: funkcja nie pyta już o `SessionState`, bo stan sesji
    // przestał mieć wpływ na dostęp. Gdyby pytała, warunek dałoby się dopisać z powrotem
    // bez zmiany wywołań — a tak nie da się tego zrobić po cichu.
    expect(correctionAccess(ADMIN).allowed).toBe(true);
  });
});

describe('correctionPath', () => {
  it('celuje w KONKRETNE zdarzenie, zgodnie z paskiem adresu w mockupie A02b', () => {
    expect(correctionPath('7c1e5a9b-83b4', 'b8d41f27-4c18')).toBe(
      '/dni/7c1e5a9b-83b4/korekta/b8d41f27-4c18',
    );
  });

  it('koduje uuid-y — trasa jest częścią adresu, nie napisem do sklejenia', () => {
    expect(correctionPath('a/b', 'c d')).toBe('/dni/a%2Fb/korekta/c%20d');
  });
});
