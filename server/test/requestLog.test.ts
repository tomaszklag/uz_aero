/**
 * UZ Aero (serwer) - testy DZIENNIKA ŻĄDAŃ (`http/requestLog.ts`).
 *
 * Dziennik jest narzędziem do patrzenia na żywy serwer, więc jego jedyna twarda reguła
 * dotyczy tego, czego w nim NIE MA: query stringu. Dziś nie nosi on sekretów, ale linia
 * loga bywa kopiowana do zgłoszenia i wklejana w czacie - a `?token=…` skopiowany razem
 * z nią jest tokenem oddanym. Reszta testów pilnuje, żeby linia dała się czytać kolumnami.
 */

import { describe, expect, it } from 'vitest';

import { pathOf, requestLine } from '../src/http/requestLog.ts';

const AT = new Date(Date.UTC(2026, 7, 6, 8, 14, 32));

describe('linia dziennika żądań', () => {
  it('niesie komplet: czas UTC, metodę, ścieżkę, status, czas i rozmiar wejścia', () => {
    const line = requestLine({
      at: AT,
      method: 'POST',
      url: '/events',
      status: 200,
      ms: 38.4,
      requestBytes: 1300,
    });

    expect(line).toContain('08:14:32');
    expect(line).toContain('POST');
    expect(line).toContain('/events');
    expect(line).toContain('200');
    expect(line).toContain('38 ms');
    expect(line).toContain('1.3 kB');
  });

  it('NIE pokazuje query stringu - tam pierwszy sekret wyciekłby po cichu', () => {
    const line = requestLine({
      at: AT,
      method: 'GET',
      url: '/sheets/2026-06-22_SP-AXA?token=sekret&debug=1',
      status: 200,
      ms: 3,
      requestBytes: null,
    });

    expect(line).toContain('/sheets/2026-06-22_SP-AXA');
    expect(line).not.toContain('token');
    expect(line).not.toContain('sekret');
    expect(pathOf('/a?b=c')).toBe('/a');
    expect(pathOf('/a')).toBe('/a');
  });

  it('żądanie bez treści nie dokłada pustej kolumny rozmiaru', () => {
    const line = requestLine({
      at: AT,
      method: 'GET',
      url: '/reference',
      status: 304,
      ms: 2,
      requestBytes: null,
    });

    expect(line.endsWith('2 ms')).toBe(true);
  });

  it('czas jest w UTC, a nie w strefie serwera - inaczej nie zestawi się ze zdarzeniami', () => {
    // 23:59 UTC to w Polsce następny dzień; dziennik ma mówić tym samym zegarem,
    // co czasy w rejestrze zdarzeń (`CLAUDE.md`, sekcja „Strefa czasowa").
    const line = requestLine({
      at: new Date(Date.UTC(2026, 7, 6, 23, 59, 5)),
      method: 'GET',
      url: '/me/prefs',
      status: 401,
      ms: 1,
      requestBytes: null,
    });

    expect(line.startsWith('23:59:05')).toBe(true);
  });
});
