/**
 * UZ Aero - panel: wiersz monitora eksportu.
 *
 * Najważniejsze asercje dotyczą tego, czego wiersz NIE robi: nie skleja nazwy karty,
 * nie wnioskuje daty z niczego poza chwilą przejęcia i nie proponuje ponowienia tam,
 * gdzie serwer i tak odmówi.
 */

import { describe, expect, it } from 'vitest';

import type { ExportListItemDto } from '../../api/dto';
import { exportRows, narrowToScope } from './exportsRows';

const DAY = Date.UTC(2026, 6, 30, 8, 0);
const NOW = Date.UTC(2026, 6, 31, 14, 22);

const item = (patch: Partial<ExportListItemDto> = {}): ExportListItemDto => ({
  sessionUuid: 'd7e5aaaa-bbbb-cccc-dddd-000000003081',
  tab: '2026-07-30_SP-ABC',
  day: '2026-07-30',
  claimedAt: DAY,
  aircraftId: 'SP-ABC',
  reg: 'SP-ABC',
  aircraftType: 'Cessna 182',
  picId: 'AWR',
  picCode: 'AWR',
  picName: 'Adam Wrzosek',
  sessionStatus: 'closed',
  state: 'current',
  revision: 1,
  exportedAt: '2026-07-30T18:52:14.000Z',
  sheetUrl: 'http://uzaero.test/sheets/2026-07-30_SP-ABC',
  blockingFlagIds: [],
  updatedAt: '2026-07-30T18:50:00.000Z',
  overwrittenBy: null,
  ...patch,
});

const rowsOf = (items: ExportListItemDto[]) => exportRows(items, NOW, (uuid) => `/eksporty/${uuid}`);

describe('wiersz monitora eksportu', () => {
  it('przepisuje nazwę karty z serwera - panel jej NIE skleja', () => {
    const [row] = rowsOf([item()]);

    expect(row!.tab.text).toBe('2026-07-30_SP-ABC');
    expect(row!.tab.known).toBe(true);
    expect(row!.day.text).toBe('30 JUL 2026');
    expect(row!.exportedAt.text).toContain('30 JUL 2026');
  });

  it('sesja bez claimu nie ma ani daty, ani nazwy - i mówi o tym wprost', () => {
    const [row] = rowsOf([item({ claimedAt: null, tab: null, day: null, state: 'impossible' })]);

    expect(row!.day.text).toBe('-');
    expect(row!.tab).toMatchObject({ text: '-', known: false });
    // „Brakuje karty" sugerowałoby, że da się ją dorobić; tu nie ma jak.
    expect(row!.canRetry).toBe(false);
    expect(row!.retryReason).toContain('bez session_claim');
  });

  it('kolumna „Dzień" niesie GODZINĘ przejęcia, bo dwie zmiany dzielą datę I nazwę karty', () => {
    // Karta jest DOBĄ SAMOLOTU (§4.7), więc poranna i popołudniowa zmiana SP-ABC mają
    // ten sam `tab` - i to jest poprawne, bo są wierszami jednego dokumentu. Wiersz
    // monitora musi wtedy powiedzieć, KTÓREJ sesji dotyczy, a jedyną taką liczbą jest
    // godzina przejęcia. Do etapu D stało tu samo „UTC".
    const morning = item({ sessionUuid: 'am', claimedAt: Date.UTC(2026, 6, 30, 6, 12) });
    const afternoon = item({ sessionUuid: 'pm', claimedAt: Date.UTC(2026, 6, 30, 13, 40) });

    const rows = rowsOf([morning, afternoon]);
    expect(rows[0]!.tab.text).toBe(rows[1]!.tab.text);
    expect(rows[0]!.day.sub).toBe('przejęcie 06:12 UTC');
    expect(rows[1]!.day.sub).toBe('przejęcie 13:40 UTC');
  });

  it('brak karty pokazuje WIEK DANYCH zamiast pustej komórki', () => {
    // Odczyt sprzed dwóch minut przy braku karty znaczy co innego niż odczyt sprzed doby:
    // pierwszy to dzień właśnie zamknięty, drugi to awaria, o której nikt nie wie.
    const [row] = rowsOf([
      item({ state: 'missing', revision: null, exportedAt: null, sheetUrl: null }),
    ]);

    expect(row!.exportedAt.text).toBe('-');
    expect(row!.exportedAt.sub).toContain('sync');
    expect(row!.revision).toMatchObject({ text: '-', revised: false });
    // Ponowienie MA sens: dzień jest zamknięty, nic go nie blokuje.
    expect(row!.canRetry).toBe(true);
    expect(row!.retryReason).toBeNull();
  });

  it('dzień otwarty i dzień zablokowany flagą mają zablokowane „Ponów" - z RÓŻNYM powodem', () => {
    const [open] = rowsOf([item({ sessionStatus: 'active', state: 'waiting', revision: null })]);
    expect(open!.canRetry).toBe(false);
    expect(open!.retryReason).toContain('day_close');
    expect(open!.flagHref).toBeNull();

    const [blocked] = rowsOf([item({ state: 'blocked', revision: null, blockingFlagIds: [1046] })]);
    expect(blocked!.canRetry).toBe(false);
    // Numer flagi bez kratki w asercji: test architektury szuka hexów w kodzie panelu,
    // a `#1046` jest poprawnym zapisem koloru - literał w teście wywalałby regułę,
    // której ten test broni.
    expect(blocked!.retryReason).toContain('1046');
    // Wiersz prowadzi DO flagi - tam jest praca do wykonania.
    expect(blocked!.flagHref).toBe('/flagi/1046');
    expect(blocked!.flagged).toBe(true);
    expect(blocked!.state.sub).toContain('flaga ');
    expect(blocked!.state.sub).toContain('1046');
  });

  it('plakietka niesie stan i podpis z sesją oraz PIC-em', () => {
    const [row] = rowsOf([item()]);

    expect(row!.state).toMatchObject({ tone: 'green', text: 'W arkuszu', dot: false });
    expect(row!.state.sub).toContain('sesja d7e5…3081');
    expect(row!.state.sub).toContain('A. Wrzosek');
  });

  it('rewizja > 1 jest oznaczona jako regeneracja', () => {
    const [row] = rowsOf([item({ revision: 3 })]);
    expect(row!.revision).toMatchObject({ text: '3', revised: true });
  });

  it('zawężenie „Rewizje" odsiewa pierwszy eksport, reszta zawężeń nie rusza listy', () => {
    const rows = rowsOf([item({ revision: 1 }), item({ sessionUuid: 'b', revision: 3 })]);

    expect(narrowToScope(rows, 'revised').map((r) => r.revision.text)).toEqual(['3']);
    expect(narrowToScope(rows, 'all')).toHaveLength(2);
    // Pozostałe zawężenia realizuje SERWER - panel nie filtruje po stanie u siebie,
    // bo dwie definicje stanu to dokładnie ten rozjazd, który panel ma wykrywać.
    expect(narrowToScope(rows, 'blocked')).toHaveLength(2);
  });

  it('karta nadpisana przez inną sesję dostaje znacznik z ODESŁANIEM do tamtej sesji', () => {
    // Wada, którą ten przypadek zamyka: dwie zamknięte zmiany na jednym samolocie tego
    // samego dnia budują kartę o tej samej nazwie, a `exported_sheets` trzyma jedną
    // treść na nazwę. Wiersz porannej zmiany raportował „W arkuszu" bez słowa o tym,
    // że pod tą nazwą leży dzień pracy kogoś innego.
    const [row] = rowsOf([
      item({
        overwrittenBy: {
          sessionUuid: 'aaaabbbb-cccc-dddd-eeee-000000009999',
          exportedAt: '2026-07-30T21:14:02.000Z',
        },
      }),
    ]);

    // Stan zostaje `current` - dziennik TEGO dnia ma własne rewizje i to jest prawda.
    expect(row!.state.text).toBe('W arkuszu');
    expect(row!.overwritten).not.toBeNull();
    expect(row!.overwritten!.label).toContain('nadpisana');
    expect(row!.overwritten!.note).toContain('aaaa…9999');
    expect(row!.overwritten!.note).toContain('30 JUL 2026');
    // Bez linku administrator ma nazwę karty, dwie sesje i żadnej drogi między nimi.
    expect(row!.overwritten!.href).toBe('/eksporty/aaaabbbb-cccc-dddd-eeee-000000009999');
  });

  it('ostatni autor karty nie jest niczyją ofiarą', () => {
    expect(rowsOf([item()])[0]!.overwritten).toBeNull();
  });

  it('nie sortuje - oddaje wiersze w kolejności serwera', () => {
    const rows = rowsOf([item({ sessionUuid: 'a' }), item({ sessionUuid: 'b' })]);
    expect(rows.map((r) => r.sessionUuid)).toEqual(['a', 'b']);
  });
});
