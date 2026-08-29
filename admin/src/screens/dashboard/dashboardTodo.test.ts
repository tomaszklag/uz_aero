/**
 * UZ Aero - panel: testy kolejki „Wymaga uwagi" (`A01`).
 *
 * Kolejka jest jedynym miejscem panelu, które STAWIA ZADANIA - więc jej porządek jest
 * treścią, nie kosmetyką: sprawa trzymająca dokument klubu poza arkuszem jest pilniejsza
 * od sprawy, która „tylko" czeka.
 */

import { describe, expect, it } from 'vitest';

import type { DashboardAttentionDto } from '../../api/dto';
import { dashboardFixture } from '../../../test/fixtures/dashboard';
import { TODO_EMPTY, todoTasks } from './dashboardTodo';

const NOW = Date.UTC(2026, 6, 31, 14, 22, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const attention = (): DashboardAttentionDto => dashboardFixture().attention;

describe('porządek: blokujące arkusz przodem, dalej najstarsze', () => {
  it('flaga blokująca wyprzedza STARSZY dzień bez zamknięcia', () => {
    // Flaga ma 2 dni, dzień otwarty 3 - a mimo to flaga jest pierwsza, bo bez jej
    // rozstrzygnięcia karta dnia nie powstanie.
    const tasks = todoTasks(attention(), NOW, DAY);
    expect(tasks.map((t) => t.kind)).toEqual(['flag', 'open_day']);
    expect(tasks[0]?.blocking).toBe(true);
  });

  it('wśród spraw nieblokujących wygrywa NAJSTARSZA', () => {
    const data = attention();
    data.flags[0]!.blocksExport = false;
    // Flaga: 2 dni. Dzień otwarty: 3 dni → dzień idzie pierwszy.
    const tasks = todoTasks(data, NOW, DAY);
    expect(tasks.map((t) => t.kind)).toEqual(['open_day', 'flag']);
  });

  it('nieudany eksport traktujemy tak samo pilnie jak flagę blokującą', () => {
    // Karta, której nie ma, to dokument klubu, którego nie ma - i nic o tym nie mówi
    // poza tym wierszem, bo nieudany eksport nie zostawia śladu w żadnej tabeli.
    const data = attention();
    data.failedExports = [
      {
        sessionUuid: 'sess-x',
        tab: '2026-07-30_SP-KLM',
        day: '2026-07-30',
        claimedAt: NOW - 2 * DAY,
        aircraftId: 'ac-x',
        reg: 'SP-KLM',
        aircraftType: 'Cessna 208 Caravan',
        picId: 'AWR',
        picCode: 'AWR',
        picName: 'Anna Wrzosek',
        sessionStatus: 'closed',
        state: 'missing',
        revision: null,
        exportedAt: null,
        sheetUrl: null,
        blockingFlagIds: [],
        updatedAt: new Date(NOW - 18 * HOUR).toISOString(),
        overwrittenBy: null,
      },
    ];

    const tasks = todoTasks(data, NOW, DAY);
    const exportTask = tasks.find((t) => t.kind === 'export');
    expect(exportTask?.blocking).toBe(true);
    expect(exportTask?.tone).toBe('red');
    expect(exportTask?.to).toBe('/eksporty/sess-x?stan=missing');
    expect(exportTask?.age).toBe('18 h');
  });
});

describe('wiek sprawy jest własną kolumną', () => {
  it('sprawa starsza niż okno korekty dostaje bursztyn', () => {
    // Flaga leżąca trzeci dzień to inny problem niż ta sprzed godziny - i wiersz ma
    // to pokazać, a nie zostawić do policzenia w głowie.
    const tasks = todoTasks(attention(), NOW, DAY);
    expect(tasks.find((t) => t.kind === 'flag')?.age).toBe('2 dni');
    expect(tasks.find((t) => t.kind === 'flag')?.old).toBe(true);
  });

  it('próg jest PARAMETREM z serwera, nie stałą w panelu', () => {
    // `correctionWindowMs` przychodzi z `@uzaero/domain` przez odpowiedź pulpitu -
    // panel nie ma prawa trzymać drugiej kopii tej reguły.
    const young = todoTasks(attention(), NOW, 10 * DAY);
    expect(young.every((t) => !t.old)).toBe(true);
  });

  it('nieoddany samolot liczy wiek od CHWILI PRZEJĘCIA, nie od ostatniej paczki', () => {
    // Pytanie brzmi „jak długo ta maszyna jest zajęta", a nie „kiedy ostatnio coś do
    // niej dotarło" - te dwie liczby różnią się o cały czas ciszy telefonu.
    const task = todoTasks(attention(), NOW, DAY).find((t) => t.kind === 'open_day');
    expect(task?.age).toBe('3 dni');
    expect(task?.to).toBe('/dni/sess-stale');
  });
});

describe('treść wiersza', () => {
  it('flaga blokująca mówi o SKUTKU, nie tylko o typie', () => {
    const task = todoTasks(attention(), NOW, DAY).find((t) => t.kind === 'flag');
    expect(task?.name).toBe('aircraft_overlap · SP-KLM');
    expect(task?.meta).toContain('karta dnia nie powstanie');
    expect(task?.to).toBe('/flagi/1046');
  });

  it('samolot bez rejestracji nie znika - wiersz pokazuje identyfikator', () => {
    // Rejestracja jest etykietą, nie kluczem; jednostka wykreślona z rejestru zostawia
    // flagę, która nadal wymaga rozstrzygnięcia.
    const data = attention();
    data.flags[0]!.reg = null;
    expect(todoTasks(data, NOW, DAY)[0]?.name).toBe('aircraft_overlap · ac-stale');
  });

  it('nieoddany samolot NIE obiecuje odliczania okna korekty', () => {
    // Sprostowanie mockupu, po etapie B3 podwójne: okno korekty kotwiczy się
    // w ZDANIU SAMOLOTU (`day_close`) - dzień bez zdania nie ma kotwicy okna,
    // a samo zdanie jest opcjonalne i niczego nie odlicza.
    const task = todoTasks(attention(), NOW, DAY).find((t) => t.kind === 'open_day');
    expect(task?.name).toContain('Samolot nieoddany');
    expect(task?.meta).toContain('stoi zajęta dłużej niż dobę');
    expect(task?.meta).not.toContain('mija za');
    expect(task?.meta).not.toContain('okno');
  });
});

describe('pusta kolejka jest POTWIERDZENIEM, nie pustką po błędzie', () => {
  it('brak spraw daje pustą listę, a stan pusty tłumaczy, co się tu pojawia', () => {
    expect(todoTasks({ flags: [], failedExports: [], staleOpenDays: [] }, NOW, DAY)).toEqual([]);
    expect(TODO_EMPTY.note).toContain('trzy rzeczy');
    expect(TODO_EMPTY.note).toContain('tworzy serwer, nie człowiek');
  });
});
