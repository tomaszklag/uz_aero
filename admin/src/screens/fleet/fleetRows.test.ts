/**
 * UZ Aero — panel: DTO floty → wiersze tabeli `A07`.
 *
 * Najważniejsze w tym pliku są TRZY STANY ŚWIEŻOŚCI. Kolumny „Claim teraz",
 * „Ostatnie MH" i „Ostatni FOB" przychodzą z telefonów, więc każda musi umieć
 * powiedzieć „nie wiem" — a zero podstawione za brak jest twierdzeniem o świecie,
 * którego serwer nie wysłał.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto } from '../../api/dto';
import {
  STALE_AFTER_MS,
  disabledOpenDays,
  fleetRows,
  fleetEmpty,
  freshClass,
  toleranceText,
} from './fleetRows';

const NOW = Date.UTC(2026, 6, 31, 14, 22, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const dto = (over: Partial<AircraftListItemDto> = {}): AircraftListItemDto => ({
  id: 'ac-1',
  reg: 'SP-KLM',
  type: 'Cessna 208 Caravan',
  year: 2011,
  capacityL: 1257,
  fuelToleranceL: 62.85,
  mhFormat: 'decimal',
  dualRequired: true,
  serviceStatus: 'active',
  updatedAt: '2026-07-30T18:41:00.000Z',
  claim: null,
  reading: null,
  lastEventAt: null,
  openSessions: 0,
  openFlags: 0,
  ...over,
});

describe('konfiguracja w wierszu', () => {
  it('przepisuje pola i FORMATUJE próg policzony przez serwer', () => {
    const [row] = fleetRows([dto()], NOW);
    expect(row).toMatchObject({
      reg: 'SP-KLM',
      type: 'Cessna 208 Caravan',
      year: '2011',
      capacity: '1257 L',
      tolerance: '±62.9 L',
      mhFormat: { text: 'decimal', tone: 'dim' },
      dual: { text: 'wymagany', tone: 'amber' },
      dim: false,
    });
  });

  it('rok bez wartości daje kreskę, a nie zero', () => {
    const [row] = fleetRows([dto({ year: null })], NOW);
    expect(row!.year).toBe('—');
  });

  it('format `hhmm` ma własną plakietkę — to inny licznik w kabinie, nie ozdoba', () => {
    const [row] = fleetRows([dto({ mhFormat: 'hhmm' })], NOW);
    expect(row!.mhFormat).toEqual({ text: 'hh:mm', tone: 'blue' });
  });

  it('Dual nieobowiązkowy to BRAK plakietki, nie plakietka „nie"', () => {
    const [row] = fleetRows([dto({ dualRequired: false })], NOW);
    expect(row!.dual).toBeNull();
  });

  it('jednostka wyłączona jest przygaszona i mówi, czego jej brakuje', () => {
    const [row] = fleetRows([dto({ serviceStatus: 'disabled' })], NOW);
    expect(row!.dim).toBe(true);
    expect(row!.service).toMatchObject({ text: 'Wyłączony', tone: 'red' });
    expect(row!.service.sub).toBe('nie pojawia się na liście wyboru');
  });

  it('próg zawsze z jednym miejscem po przecinku — 62.85 to nie 63', () => {
    // `litres()` zaokrągliłoby do pełnych litrów, a tu chodzi właśnie o dokładny próg.
    expect(toleranceText(62.85)).toBe('±62.9 L');
    expect(toleranceText(10)).toBe('±10.0 L');
  });
});

describe('trzy stany świeżości kolumn z telefonów', () => {
  it('BRAK danych: żadnego zdarzenia w rejestrze — kreska i powód, nigdy zero', () => {
    const [row] = fleetRows([dto()], NOW);
    expect(row!.mh).toEqual({ text: '—', sub: 'brak danych z telefonu', freshness: 'none' });
    expect(row!.fuel).toEqual({ text: '—', sub: 'brak danych z telefonu', freshness: 'none' });
    expect(row!.claim.badge).toEqual({ text: 'wolny', tone: 'dim' });
    expect(row!.claim.freshness).toBe('none');
  });

  it('LIVE: sync sprzed kilku minut — wartości bez zastrzeżeń', () => {
    const [row] = fleetRows(
      [
        dto({
          lastEventAt: new Date(NOW - 3 * MINUTE).toISOString(),
          reading: {
            mh: 3907.8,
            fuelL: 210,
            at: NOW - 20 * MINUTE,
            byPilotId: 'TMK',
            byPilotName: 'Tomasz Małkiewicz',
            source: 'open_session',
          },
        }),
      ],
      NOW,
    );

    expect(row!.mh).toMatchObject({ text: '3907.8', sub: 'sync 3 min temu', freshness: 'fresh' });
    expect(row!.fuel).toMatchObject({ text: '210 L', sub: 'sesja otwarta', freshness: 'fresh' });
  });

  it('CACHE: sync starszy niż doba dostaje amber — to informacja, nie awaria', () => {
    const [row] = fleetRows(
      [
        dto({
          lastEventAt: new Date(NOW - STALE_AFTER_MS - HOUR).toISOString(),
          reading: {
            mh: 3907.8,
            fuelL: 210,
            at: NOW - 2 * 24 * HOUR,
            byPilotId: 'TMK',
            byPilotName: 'Tomasz Małkiewicz',
            source: 'handover',
          },
        }),
      ],
      NOW,
    );

    expect(row!.mh.freshness).toBe('stale');
    expect(row!.fuel.freshness).toBe('stale');
    // Przekazanie niesie WIEK odczytu, nie tylko wiek synchronizacji — to dwie różne
    // rzeczy i mockup podpisuje kolumnę FOB tą pierwszą.
    expect(row!.fuel.sub).toBe('przekazanie · 2 dni');
  });

  it('granica doby jest OSTRA: 24 h to jeszcze `fresh`, 24 h + 1 min to już `stale`', () => {
    const reading = {
      mh: 100,
      fuelL: 50,
      at: NOW - 2 * HOUR,
      byPilotId: 'TMK',
      byPilotName: null,
      source: 'handover' as const,
    };
    const at = (age: number) => new Date(NOW - age).toISOString();
    const rows = fleetRows(
      [
        dto({ id: 'a', reading, lastEventAt: at(STALE_AFTER_MS) }),
        dto({ id: 'b', reading, lastEventAt: at(STALE_AFTER_MS + MINUTE) }),
      ],
      NOW,
    );
    expect(rows[0]!.mh.freshness).toBe('fresh');
    expect(rows[1]!.mh.freshness).toBe('stale');
  });

  it('znacznik nieczytelny traktujemy jak BRAK, a nie jak „Invalid Date"', () => {
    const [row] = fleetRows([dto({ lastEventAt: 'nie-data' })], NOW);
    expect(row!.mh.freshness).toBe('none');
  });

  it('MH formatuje się WEDŁUG konfiguracji jednostki, nie domyślnie', () => {
    const reading = {
      mh: 645.1,
      fuelL: 48,
      at: NOW - HOUR,
      byPilotId: 'KRZ',
      byPilotName: null,
      source: 'handover' as const,
    };
    const [decimal] = fleetRows(
      [dto({ mhFormat: 'decimal', reading, lastEventAt: new Date(NOW).toISOString() })],
      NOW,
    );
    const [hhmm] = fleetRows(
      [dto({ mhFormat: 'hhmm', reading, lastEventAt: new Date(NOW).toISOString() })],
      NOW,
    );
    expect(decimal!.mh.text).toBe('645.1');
    expect(hhmm!.mh.text).toBe('645:06');
  });
});

describe('kolumna claimu', () => {
  it('zajęta jednostka mówi „Zajęty", a NIE „W locie" — projekcja nie zna silnika', () => {
    const [row] = fleetRows(
      [
        dto({
          lastEventAt: new Date(NOW - MINUTE).toISOString(),
          claim: {
            sessionUuid: 'sess-1',
            picId: 'TMK',
            picCode: 'TMK',
            picName: 'Tomasz Małkiewicz',
            since: Date.UTC(2026, 6, 31, 7, 58),
          },
        }),
      ],
      NOW,
    );

    expect(row!.claim.badge).toEqual({ text: 'Zajęty', tone: 'green', dot: true });
    expect(row!.claim.text).toBe('Tomasz Małkiewicz');
    expect(row!.claim.sub).toBe('od 07:58 UTC');
    expect(row!.claim.sessionUuid).toBe('sess-1');
  });

  it('claim bez konta w `pilots` pokazuje identyfikator, a nie znika', () => {
    const [row] = fleetRows(
      [
        dto({
          claim: {
            sessionUuid: 's',
            picId: 'usuniete-konto',
            picCode: null,
            picName: null,
            since: null,
          },
        }),
      ],
      NOW,
    );
    expect(row!.claim.text).toBe('usuniete-konto');
    expect(row!.claim.sub).toBe('bez preflightu');
  });

  it('jednostka wyłączona nie jest „wolna" — nikt jej nie weźmie', () => {
    const [row] = fleetRows([dto({ serviceStatus: 'disabled' })], NOW);
    expect(row!.claim.badge).toEqual({ text: 'nie do wyboru', tone: 'dim' });
    expect(row!.claim.sub).toBe('wyłączony ze służby');
  });
});

// ── świeżość musi być WIDOCZNA, nie tylko policzona ─────────────────────────────

describe('klasa podpisu świeżości', () => {
  it('składa `cell-sub` z modyfikatorem O TEJ SAMEJ nazwie, co stan', () => {
    expect(freshClass('fresh')).toBe('cell-sub fresh');
    expect(freshClass('stale')).toBe('cell-sub stale');
    expect(freshClass('none')).toBe('cell-sub none');
  });

  // ══ TU BY WYSZŁA WADA, KTÓREJ NIE ZŁAPAŁY TESTY WYŻEJ ══
  // Testy `freshness: 'stale'` przechodziły na zielono, a ekran malował
  // `class="cell-sub fresh-stale"` — klasę, której nie definiuje ŻADEN arkusz. Trzy
  // stany były policzone, przetestowane i niewidoczne. Asercja musi więc sięgnąć
  // o poziom dalej: aż do reguły CSS, która nadaje kolor, i do mockupu, który jest
  // specyfikacją nazw.
  const cssOf = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');

  it('każda wypisana klasa MA regułę w arkuszu panelu', () => {
    const css = cssOf('styles', 'components', 'table.css');
    // Kontrola samego testu: gdyby ścieżka przestała wskazywać arkusz tabeli, wszystkie
    // asercje niżej przechodziłyby na pustym napisie.
    expect(css).toContain('.cell-sub {');

    for (const freshness of ['fresh', 'stale', 'none'] as const) {
      expect(freshClass(freshness)).toBe(`cell-sub ${freshness}`);
      expect(css).toContain(`.cell-sub.${freshness} {`);
    }
    // Kolor amber jest CAŁĄ treścią stanu „starszy niż doba" — bez niego wpis sprzed
    // trzech minut i sprzed dwóch dni wyglądają identycznie.
    expect(css).toMatch(/\.cell-sub\.stale\s*\{\s*color:\s*var\(--amber\)/);
  });

  it('nazwy modyfikatorów są DOSŁOWNIE te z `SZABLON.html` — mockup wygrywa', () => {
    const szablon = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'design', 'admin', 'SZABLON.html'),
      'utf8',
    );
    expect(szablon).toContain('.cell-sub { display:block;');

    for (const freshness of ['fresh', 'stale', 'none'] as const) {
      expect(szablon).toContain(`.cell-sub.${freshness}`);
    }
    // I na odwrót: klasa, którą panel wypisywał do 2026-08-01, nie istnieje nigdzie.
    expect(szablon).not.toContain('fresh-stale');
  });
});

// ── wyłączony, a dzień otwarty ──────────────────────────────────────────────────

describe('jednostka wyłączona z OTWARTYM dniem', () => {
  const stranded = dto({ reg: 'SP-KWA', serviceStatus: 'disabled', openSessions: 1 });

  it('kolumna stanu służby MÓWI o sprzeczności, zamiast pokazywać dwie prawdy obok siebie', () => {
    // Stan jest osiągalny: `POST /events` nie sprawdza `service_status` i sprawdzać nie
    // może (rejestr przyjmuje fakty z terenu), więc telefon z cache'em referencyjnym
    // sprzed wyłączenia otworzy dzień mimo blokady w panelu.
    const [row] = fleetRows([stranded], NOW);
    expect(row!.service.sub).toBe('wyłączony, a dzień wciąż otwarty');
    // Bez otwartego dnia podpis zostaje ten, co był.
    const [plain] = fleetRows([dto({ serviceStatus: 'disabled' })], NOW);
    expect(plain!.service.sub).toBe('nie pojawia się na liście wyboru');
  });

  it('zgłasza się osobnym ostrzeżeniem — bo inaczej NIC by o tym nie powiedziało', () => {
    const notice = disabledOpenDays([dto(), stranded]);
    expect(notice?.regs).toEqual(['SP-KWA']);
    expect(notice?.text).toContain('SP-KWA');
    expect(notice?.text).toContain('cache');
  });

  it('odmienia liczbę mnogą i milczy, gdy nie ma o czym mówić', () => {
    expect(disabledOpenDays([dto(), dto({ serviceStatus: 'disabled' })])).toBeNull();
    // Jednostka W SŁUŻBIE z otwartym dniem to stan normalny, nie ostrzeżenie.
    expect(disabledOpenDays([dto({ openSessions: 1 })])).toBeNull();

    const many = disabledOpenDays([
      dto({ id: 'a', reg: 'SP-KWA', serviceStatus: 'disabled', openSessions: 1 }),
      dto({ id: 'b', reg: 'SP-MNO', serviceStatus: 'disabled', openSessions: 2 }),
    ]);
    expect(many?.regs).toEqual(['SP-KWA', 'SP-MNO']);
    expect(many?.text).toContain('są wyłączone');
  });
});

// ── przejście do dni ────────────────────────────────────────────────────────────

describe('link z wiersza do dni', () => {
  it('ma go KAŻDY wiersz, także jednostka wolna — to przypadek najczęstszy', () => {
    const [free] = fleetRows([dto({ id: 'ac-1' })], NOW);
    expect(free!.day).toEqual({ to: '/dni?samolot=ac-1', label: 'Dni lotne' });

    const [disabled] = fleetRows([dto({ id: 'ac-2', serviceStatus: 'disabled' })], NOW);
    expect(disabled!.day.to).toBe('/dni?samolot=ac-2');
  });

  it('jednostka zajęta prowadzi wprost na KARTĘ tego dnia — po to serwer podaje `sessionUuid`', () => {
    const [row] = fleetRows(
      [
        dto({
          claim: { sessionUuid: 'sess-1', picId: 'TMK', picCode: 'TMK', picName: null, since: null },
        }),
      ],
      NOW,
    );
    expect(row!.day).toEqual({ to: '/dni/sess-1', label: 'Otwarty dzień' });
  });
});

describe('pusta lista', () => {
  it('mówi CO INNEGO przy zawężeniu niż bez niego', () => {
    expect(fleetEmpty(true).title).not.toBe(fleetEmpty(false).title);
    expect(fleetEmpty(true).note).toContain('zawężenie');
    expect(fleetEmpty(false).note).toContain('preflight');
  });
});
