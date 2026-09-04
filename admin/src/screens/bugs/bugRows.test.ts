/**
 * UZ Aero - panel 2.0: wiersze modułu „Zgłoszenia" (issue #87).
 *
 * Pod obserwacją jedna własność i jej konsekwencje: **kontekst wypisuje się CAŁY**,
 * także w polach, o których panel nie wie. To jest cała treść zgłoszenia („im więcej
 * informacji tym lepiej"), a lista dozwolonych pól zamieniłaby ją w listę tego,
 * co panel już umie nazwać - i pole dołożone w aplikacji znikałoby po cichu.
 */

import { describe, expect, it } from 'vitest';

import type { BugReportDto } from '../../api/dto';
import { bugContextRows, bugRow } from './bugRows';
import { bugStatusBlocker } from './bugStatus';

const bug = (over: Partial<BugReportDto> = {}): BugReportDto => ({
  uuid: 'b1',
  createdAt: '2026-09-04T09:41:07.000Z',
  receivedAt: '2026-09-04T10:02:00.000Z',
  pilotId: 'p-uuid',
  pilotCode: 'TMK',
  pilotName: 'Tomasz Małkiewicz',
  severity: 'annoying',
  description: 'Czas lotu nie przeliczył się po korekcie lądowania.',
  screen: 'OPERACJA (10) · tryb edycji',
  appVersion: '1.4.0',
  sessionUuid: 'S1',
  context: {},
  status: 'new',
  statusNote: null,
  statusBy: null,
  statusAt: null,
  ...over,
});

const valueOf = (rows: { label: string; value: string }[], label: string): string | undefined =>
  rows.find((r) => r.label === label)?.value;

describe('wiersz listy', () => {
  it('niesie chwilę Z TELEFONU, kod pilota i skrót opisu', () => {
    const row = bugRow(bug());
    // Zegar telefonu, nie serwera: pytanie brzmi „kiedy pilot to widział".
    expect(row.when).toBe('4 WRZ 09:41');
    expect(row.pilot).toBe('TMK');
    expect(row.excerpt).toBe('Czas lotu nie przeliczył się po korekcie lądowania.');
    expect(row.muted).toBe(false);
  });

  it('opis pisany akapitami spłaszcza się przed przycięciem', () => {
    // Bez tego kroku wiersz „urywał się" po dwóch słowach, choć limit był daleko.
    const row = bugRow(bug({ description: 'Pierwsza linia\n\n   druga   linia' }));
    expect(row.excerpt).toBe('Pierwsza linia druga linia');
  });

  it('długi opis kończy się wielokropkiem, a pusty - kreską', () => {
    const long = bugRow(bug({ description: 'a'.repeat(200) }));
    expect(long.excerpt).toHaveLength(90);
    expect(long.excerpt.endsWith('…')).toBe(true);
    expect(bugRow(bug({ description: '   ' })).excerpt).toBe('—');
  });

  it('brak wagi nie dostaje plakietki - „—" wyglądałoby jak waga o nazwie kreska', () => {
    expect(bugRow(bug({ severity: null })).severityLabel).toBeNull();
    expect(bugRow(bug({ severity: 'blocking' })).severityLabel).toBe('Blokuje');
    expect(bugRow(bug({ severity: 'blocking' })).severityTone).toBe('red');
  });

  it('pilot bez konta jedzie identyfikatorem - zgłoszenie zostaje po skasowanym koncie', () => {
    const row = bugRow(bug({ pilotCode: null, pilotName: null }));
    expect(row.pilot).toBe('p-uuid');
    expect(row.pilotName).toBeNull();
  });

  it('zamknięte zgłoszenia są przygaszone, otwarte nie', () => {
    expect(bugRow(bug({ status: 'resolved' })).muted).toBe(true);
    expect(bugRow(bug({ status: 'rejected' })).muted).toBe(true);
    expect(bugRow(bug({ status: 'in_progress' })).muted).toBe(false);
  });
});

describe('wiersze kontekstu', () => {
  it('pola znane dostają polską nazwę i stoją w kolejności czytania', () => {
    const rows = bugContextRows({
      pilotCode: 'TMK',
      screenLabel: 'KOKPIT (04/05)',
      appVersion: '1.4.0',
    });
    expect(rows.map((r) => r.label)).toEqual(['Miejsce', 'Pilot', 'Wersja aplikacji']);
    expect(valueOf(rows, 'Miejsce')).toBe('KOKPIT (04/05)');
  });

  it('pole NIEZNANE panelowi też się pokazuje - pod swoim kluczem, na końcu', () => {
    // Dokładnie ten przypadek, dla którego panel nie ma listy dozwolonych pól:
    // aplikacja dołożyła coś nowego i ma to dojechać BEZ wydania panelu.
    const rows = bugContextRows({ theme: 'night', gpsFixes: 4212, czegoNieZnamy: { a: 1 } });
    expect(rows).toEqual([
      { label: 'Motyw', value: 'night' },
      { label: 'gpsFixes', value: '4212' },
      { label: 'czegoNieZnamy', value: '{"a":1}' },
    ]);
  });

  it('stemple czasu czyta człowiek, a nie epoka', () => {
    const rows = bugContextRows({
      lastSyncAt: Date.UTC(2026, 8, 4, 9, 38),
      reportedAt: '2026-09-04T09:41:07.000Z',
    });
    expect(valueOf(rows, 'Ostatnia synchronizacja')).toBe('4 WRZ 09:38 UTC');
    expect(valueOf(rows, 'Czas zgłoszenia')).toBe('4 WRZ 09:41 UTC');
  });

  it('wartości logiczne po polsku, a puste pola w ogóle nie wchodzą', () => {
    const rows = bugContextRows({
      engineRunning: false,
      sessionUuid: null,
      aircraftReg: '',
      flights: 0,
    });
    expect(valueOf(rows, 'Silnik pracował')).toBe('nie');
    // Zero JEST odpowiedzią i zostaje; `null` i pusty napis nie są.
    expect(valueOf(rows, 'Loty')).toBe('0');
    expect(rows.map((r) => r.label)).not.toContain('Operacja (uuid)');
    expect(rows.map((r) => r.label)).not.toContain('Samolot');
  });
});

describe('bramka zmiany statusu', () => {
  it('odrzucenie BEZ komentarza jest zablokowane z powodem', () => {
    expect(bugStatusBlocker('new', 'rejected', '   ', null)).toBe('Odrzucenie wymaga komentarza');
    expect(bugStatusBlocker('new', 'rejected', 'Działa zgodnie z projektem', null)).toBeNull();
  });

  it('zapis bez zmiany jest zablokowany - wpis audytu o niczym nie ma sensu', () => {
    expect(bugStatusBlocker('new', 'new', '', null)).toBe('Nic się nie zmieniło');
    // Sam komentarz JEST zmianą: dopisanie ustaleń bez zmiany statusu ma prawo się zapisać.
    expect(bugStatusBlocker('new', 'new', 'Nie umiem odtworzyć', null)).toBeNull();
    expect(bugStatusBlocker('new', 'new', 'to samo', 'to samo')).toBe('Nic się nie zmieniło');
  });
});
