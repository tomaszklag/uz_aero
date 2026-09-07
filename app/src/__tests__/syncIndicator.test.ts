/**
 * UZ Aero - testy wskaźnika łączności (`components/status/syncIndicator.ts`).
 *
 * Blok pierwszy jest testem REGRESYJNYM do zgłoszenia z urządzenia (2026-08-30):
 * „w logach api widzę, że udało się połączenie, ale UI nadal mówi, że jest offline".
 * Chip liczył wtedy stan jako `outboxCount === 0 ? 'synced' : 'offline'`, więc KAŻDA
 * niepusta kolejka była „brakiem sieci" - także taka, która stoi dlatego, że serwer
 * odpowiedział i odmówił. Pierwszy przypadek niżej jest dokładnie tą sytuacją i na
 * starym rachunku zwracał `offline`.
 */

import type { SyncOutcome } from '../application/sync/syncEngine';
import {
  attemptStamp,
  syncIndicator,
  syncPillLabel,
  syncPillTone,
  syncReport,
} from '../ui/components/status/syncIndicator';

const SYNCED: SyncOutcome = { kind: 'synced', pushed: 3, flags: [] };
const IDLE: SyncOutcome = { kind: 'idle' };
const OFFLINE: SyncOutcome = { kind: 'offline' };
const REJECTED: SyncOutcome = { kind: 'rejected', code: 'bad_payload' };
const EXPIRED: SyncOutcome = { kind: 'auth_expired' };

describe('syncIndicator - stan wskaźnika', () => {
  it('serwer odmówił przy działającej sieci: blocked, NIE offline', () => {
    // Sedno zgłoszenia: sieć jest, połączenie doszło, kolejka stoi. Nazwanie tego
    // „offline" wysyłało pilota po zasięg, którego mu nie brakowało.
    expect(syncIndicator(2, REJECTED)).toBe('blocked');
    expect(syncIndicator(2, EXPIRED)).toBe('blocked');
  });

  it('ostatnia próba nie znalazła serwera: offline', () => {
    expect(syncIndicator(2, OFFLINE)).toBe('offline');
  });

  it('kolejka niepusta po UDANEJ próbie: cisza (dopisano coś później)', () => {
    // Zdarzenie zapisane po tamtym przebiegu pojedzie przy najbliższej okazji.
    // Pilot nie ma tu nic do zrobienia, więc wskaźnik nie ma o czym mówić (issue #12).
    expect(syncIndicator(2, SYNCED)).toBe('hidden');
    expect(syncIndicator(2, IDLE)).toBe('hidden');
  });

  it('pusta kolejka gasi wskaźnik nawet po nieudanej próbie', () => {
    // „Offline" bez ani jednego zdarzenia do wysłania jest informacją o pogodzie,
    // nie o pracy pilota (§4.1: brak sieci niczego nie blokuje).
    expect(syncIndicator(0, OFFLINE)).toBe('hidden');
    expect(syncIndicator(0, REJECTED)).toBe('hidden');
  });

  it('przed pierwszą próbą nie wiemy nic - i tak to wygląda', () => {
    // Zgadywanie stanu sieci z niepustej kolejki jest błędem, który ten moduł naprawia.
    expect(syncIndicator(5, null)).toBe('hidden');
  });
});

describe('syncIndicator - pill', () => {
  it('kolor odróżnia „poczekaj" od „samo nie przejdzie"', () => {
    expect(syncPillTone('offline')).toBe('amber');
    expect(syncPillTone('blocked')).toBe('red');
  });

  it('napis niesie liczbę zaległych zdarzeń', () => {
    expect(syncPillLabel('offline', 2)).toBe('OFFLINE · 2');
    expect(syncPillLabel('blocked', 2)).toBe('SYNC STOI · 2');
  });
});

describe('syncReport - baner arkusza', () => {
  it('stan zablokowany NIE obiecuje, że wyśle się sam', () => {
    // To jest treść błędu, nie kosmetyka: do 2026-08-30 odmowa serwera wyświetlała się
    // jako „Offline … wyślą się same, gdy wróci sieć", czyli kazała pilotowi czekać
    // na zdarzenie, które już nastąpiło.
    const r = syncReport('blocked', 2, REJECTED);
    expect(r.tone).toBe('red');
    expect(r.text).not.toContain('wróci sieć');
    expect(r.text).toContain('nie wyślą się same');
  });

  it('odmowa niesie KOD - to jedyna rzecz, z którą pilot pójdzie do administratora', () => {
    expect(syncReport('blocked', 2, REJECTED).text).toContain('bad_payload');
  });

  it('wygasła sesja mówi, co zrobić - to inna droga wyjścia niż odmowa serwera', () => {
    const r = syncReport('blocked', 1, EXPIRED);
    expect(r.text).toContain('Zaloguj się ponownie');
    expect(r.text).not.toContain('administrator');
  });

  it('stan zablokowany uspokaja o ZAPISACH - one są całe', () => {
    // Kolejka stoi, ale rejestr na telefonie jest kompletny (§4.1). Bez tego zdania
    // czerwony baner czyta się jak utrata danych.
    expect(syncReport('blocked', 2, REJECTED).text).toContain('bezpieczne w telefonie');
  });

  it('offline zostaje przy dotychczasowej obietnicy', () => {
    const r = syncReport('offline', 2, OFFLINE);
    expect(r.tone).toBe('amber');
    expect(r.text).toContain('Wyślą się same, gdy wróci sieć');
  });

  it('udana wysyłka melduje LICZBĘ i stan kolejki po niej', () => {
    // Arkusz zostaje otwarty po udanym ponowieniu (pill gaśnie, treść nie) - to jest
    // jedyny moment, w którym pilot dostaje dobrą wiadomość, więc musi ją przeczytać.
    expect(syncReport('hidden', 0, SYNCED).text).toBe('Wysłano 3 zdarzenia - kolejka jest pusta.');
    expect(syncReport('hidden', 1, SYNCED).text).toBe(
      'Wysłano 3 zdarzenia. W kolejce zostało 1 zdarzenie.',
    );
  });

  it('odmienia liczebniki: 1 zdarzenie czeka, 2 zdarzenia czekają, 5 zdarzeń czeka', () => {
    expect(syncReport('offline', 1, OFFLINE).text).toContain('1 zdarzenie czeka w kolejce');
    expect(syncReport('offline', 2, OFFLINE).text).toContain('2 zdarzenia czekają w kolejce');
    expect(syncReport('offline', 5, OFFLINE).text).toContain('5 zdarzeń czeka w kolejce');
  });
});

describe('attemptStamp - dowód, że ponowienie się odbyło', () => {
  const AT = Date.UTC(2026, 7, 30, 17, 42);

  it('przed pierwszą próbą wiersza NIE MA', () => {
    // Wiersz o niczym byłby szumem - ta sama reguła, którą issue #43 wyrzuciło
    // „Historia zmian: 0".
    expect(attemptStamp(null, AT)).toBeNull();
    expect(attemptStamp(OFFLINE, null)).toBeNull();
  });

  it('nieudana próba ZOSTAWIA ślad - bez niego przycisk wyglądał na martwy', () => {
    // Przy nieudanym ponowieniu nic innego w arkuszu się nie zmienia: kolejka stoi,
    // stempel udanego syncu stoi, pill stoi. To jest cała odpowiedź na „nie dostaję
    // żadnego feedback".
    expect(attemptStamp(OFFLINE, AT)).toEqual({ value: '17:42 UTC - brak sieci', tone: 'amber' });
  });

  it('każdy wynik ma własne słowo - cisza nie może znaczyć dwóch rzeczy', () => {
    expect(attemptStamp(REJECTED, AT)?.value).toBe('17:42 UTC - odrzucone');
    expect(attemptStamp(EXPIRED, AT)?.value).toBe('17:42 UTC - sesja wygasła');
    expect(attemptStamp(SYNCED, AT)?.value).toBe('17:42 UTC - wysłano 3');
    expect(attemptStamp(IDLE, AT)?.value).toBe('17:42 UTC - nie było czego wysłać');
  });

  it('ton wiersza idzie za wynikiem, a „nie było czego" jest neutralne', () => {
    expect(attemptStamp(REJECTED, AT)?.tone).toBe('red');
    expect(attemptStamp(SYNCED, AT)?.tone).toBe('green');
    expect(attemptStamp(IDLE, AT)?.tone).toBeUndefined();
  });
});
