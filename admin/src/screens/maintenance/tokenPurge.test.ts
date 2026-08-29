/**
 * UZ Aero - panel: sprzątanie wygasłych tokenów - potwierdzenie i liczby (`A11`).
 *
 * Ten moduł stoi przy JEDYNEJ operacji panelu, która kasuje dane, więc jego przypadki
 * są o jednym: żeby przycisk nie odblokował się przypadkiem i żeby to, co mówi ekran,
 * zgadzało się z tym, co zrobi serwer.
 */

import { describe, expect, it } from 'vitest';

import type { RefreshTokenScanDto, TokenPurgeReportDto } from '../../api/dto';
import { isPurgeConfirmed, purgeGate, purgeMessage, PURGE_WORD, tokenFacts } from './tokenPurge';

const scan = (over: Partial<RefreshTokenScanDto> = {}): RefreshTokenScanDto => ({
  total: 52,
  expired: 37,
  valid: 15,
  oldestExpiredAt: '2026-03-12T03:41:00.000Z',
  newestExpiredAt: '2026-07-28T09:02:00.000Z',
  at: '2026-07-31T14:22:00.000Z',
  ttlDays: 90,
  ...over,
});

describe('słowo potwierdzenia', () => {
  it('wielkość liter i spacje wokół nie mają znaczenia - literówka MA', () => {
    expect(isPurgeConfirmed(PURGE_WORD)).toBe(true);
    expect(isPurgeConfirmed('  usuń ')).toBe(true);
    expect(isPurgeConfirmed('Usuń')).toBe(true);

    expect(isPurgeConfirmed('')).toBe(false);
    expect(isPurgeConfirmed('usun')).toBe(false);
    expect(isPurgeConfirmed('tak')).toBe(false);
    expect(isPurgeConfirmed('USUŃ TOKENY')).toBe(false);
  });
});

describe('liczby karty tokenów', () => {
  it('bez odczytu - same kreski, nigdy zera', () => {
    const facts = tokenFacts(undefined);
    expect(facts.every((f) => f.value === '-')).toBe(true);
  });

  it('pokazuje datę WRAZ Z WIEKIEM, liczoną wobec zegara serwera', () => {
    // Wiek jest tu równie ważny co data: tabela zbierająca śmieci od czterech miesięcy
    // to inna sytuacja niż tabela z wczorajszym tokenem.
    const facts = tokenFacts(scan());
    const oldest = facts.find((f) => f.label === 'Najstarszy wygasł');
    expect(oldest?.value).toContain('12 MAR');
    expect(oldest?.unit).toContain('temu');
  });

  it('wygasłe świecą na czerwono, ważne na zielono - i to są DWIE różne liczby', () => {
    const facts = tokenFacts(scan());
    expect(facts.find((f) => f.label === 'Wygasłych')).toMatchObject({ value: '37', tone: 'red' });
    expect(facts.find((f) => f.label === 'Ważnych - bez zmian')).toMatchObject({
      value: '15',
      tone: 'green',
    });
  });

  it('zero wygasłych nie świeci ostrzegawczo - pusta tabela nie jest usterką', () => {
    const facts = tokenFacts(scan({ expired: 0, oldestExpiredAt: null, newestExpiredAt: null }));
    expect(facts.find((f) => f.label === 'Wygasłych')?.tone).toBeUndefined();
    expect(facts.find((f) => f.label === 'Najstarszy wygasł')?.value).toBe('-');
  });
});

describe('bramka kasowania', () => {
  const base = { scan: scan(), typed: PURGE_WORD, mayPurge: true, pending: false };

  it('brak uprawnienia wygrywa ze wszystkim', () => {
    const gate = purgeGate({ ...base, mayPurge: false, typed: '' });
    expect(gate.disabled).toBe(true);
    expect(gate.reason).toContain('administrator');
  });

  it('bez wpisanego słowa - zablokowane, z podanym słowem w powodzie', () => {
    expect(purgeGate({ ...base, typed: '' })).toMatchObject({ disabled: true });
    expect(purgeGate({ ...base, typed: 'usun' }).reason).toContain('brak potwierdzenia');
  });

  it('zero wygasłych - zablokowane, mimo poprawnego słowa', () => {
    // Kliknięcie kasujące zero wierszy byłoby akcją bez skutku, z wpisem w audycie.
    const gate = purgeGate({ ...base, scan: scan({ expired: 0 }) });
    expect(gate.disabled).toBe(true);
    expect(gate.reason).toContain('ani jednego');
  });

  it('etykieta niesie LICZBĘ - przycisk kasujący dane mówi, ile skasuje', () => {
    expect(purgeGate(base)).toMatchObject({ disabled: false, label: 'Usuń 37 wygasłych tokenów' });
    expect(purgeGate({ ...base, scan: scan({ expired: 1 }) }).label).toBe('Usuń 1 wygasły token');
    // Bez odczytu etykieta TRACI liczbę zamiast pokazywać zero: zero byłoby obietnicą,
    // że nic się nie stanie.
    expect(purgeGate({ ...base, scan: undefined }).label).toBe('Usuń wygasłe tokeny');
  });
});

describe('komunikat po czyszczeniu', () => {
  const report = (over: Partial<TokenPurgeReportDto> = {}): TokenPurgeReportDto => ({
    deleted: 37,
    oldestExpiredAt: '2026-03-12T03:41:00.000Z',
    newestExpiredAt: '2026-07-28T09:02:00.000Z',
    remainingValid: 15,
    at: '2026-07-31T14:22:00.000Z',
    ...over,
  });

  it('bez wyniku nie ma komunikatu', () => {
    expect(purgeMessage(undefined)).toBeNull();
  });

  it('mówi OBIE liczby - ile zniknęło i ile ŻYWYCH zostało', () => {
    // Druga liczba jest odpowiedzią na jedyne pytanie, które się tu zadaje: czy ktoś
    // przez to wypadł z sesji.
    const message = purgeMessage(report());
    expect(message?.tone).toBe('ok');
    expect(message?.title).toContain('37');
    expect(message?.body).toContain('15');
    expect(message?.body).toContain('nikt nie stracił sesji');
    // …i wprost, że do dziennika nie poszły tokeny.
    expect(message?.body).toContain('nigdy same tokeny');
  });

  it('zero skasowanych to informacja, nie sukces', () => {
    const message = purgeMessage(report({ deleted: 0, oldestExpiredAt: null, newestExpiredAt: null }));
    expect(message?.tone).toBe('status');
    expect(message?.title).toContain('Nie było czego kasować');
  });
});
