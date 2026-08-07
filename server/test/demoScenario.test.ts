/**
 * UZ Aero (serwer) — SCENARIUSZ DEMO MUSI PRODUKOWAĆ TO, CO OBIECUJE.
 *
 * `scripts/demo/scenario.ts` otwiera się tabelą „flaga → gdzie → po co". Bez tego pliku
 * ta tabela byłaby PROZĄ: dane demo powstają z reguł §4.5, a te bywają subtelne —
 * `aircraft_overlap` nie powstanie, jeśli dzień pojedzie jedną paczką razem z `day_close`,
 * a `fuel_mismatch` przepadnie przy zmianie pojemności zbiorników w seedzie floty.
 * Cicho zdegradowany seed jest gorszy niż jego brak: pokazuje panel, w którym „nic nie
 * ma", i uczy, że to normalne.
 *
 * ══ TEST JEDZIE PRZEZ PRAWDZIWE GNIAZDO, A NIE PRZEZ `app.inject` ══
 * Serwer testowy nasłuchuje na losowym porcie, a scenariusz przepuszczamy DOKŁADNIE tym
 * kodem, którego użyje `npm run seed:demo`: `runScenario` + `DemoClient` na `fetch`.
 * Powód jest konkretny — `DemoClient` musi zachować się jak przeglądarka: przechwycić
 * `Set-Cookie` sesji panelu, odesłać ciasteczko i dołożyć nagłówek CSRF do KAŻDEJ mutacji.
 * Przy `app.inject` cała ta warstwa (parsowanie `Set-Cookie`, nagłówki, kody statusu)
 * byłaby ominięta, a to właśnie ona jest jedyną częścią seeda bez innego pokrycia.
 * Bazą zostaje PGlite, więc test nie potrzebuje ani Dockera, ani sieci poza pętlą zwrotną.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AdminFlagPage } from '../src/application/admin/contracts/flags.ts';
import { DemoClient } from '../scripts/demo/demoClient.ts';
import { runScenario, type RunSummary } from '../scripts/demo/runScenario.ts';
import { buildScenario, type DemoScenario } from '../scripts/demo/scenario.ts';
import { TEST_PASSWORD, testHarness } from './helpers.ts';

/**
 * „Teraz" scenariusza = czas `TestClock` z `helpers.ts` (2026-06-22 08:00 UTC).
 * Zrównanie obu zegarów jest tu istotne, nie kosmetyczne: korekta administracyjna
 * stempluje się zegarem SERWERA, a scenariusz układa dni względem swojego „dziś" —
 * rozjazd dałby poprawkę wpisaną przed dniem, którego dotyczy.
 */
const NOW = Date.UTC(2026, 5, 22, 8, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

/** `demo-axa-20260609-ako` — identyfikator sesji tak, jak składa go scenariusz. */
function sessionUuid(aircraftSuffix: string, offsetDays: number, pilot: string): string {
  const day = new Date(Math.floor(NOW / DAY_MS) * DAY_MS - offsetDays * DAY_MS);
  return `demo-${aircraftSuffix}-${day.toISOString().slice(0, 10).replaceAll('-', '')}-${pilot}`;
}

type Harness = Awaited<ReturnType<typeof testHarness>>;

describe('scenariusz danych demo', () => {
  let harness: Harness;
  let scenario: DemoScenario;
  let summary: RunSummary;
  let client: DemoClient;

  beforeAll(async () => {
    harness = await testHarness();
    // Port 0 = przydzielony przez system; pętla zwrotna, żeby test nie wystawiał
    // niczego na zewnątrz maszyny.
    await harness.app.listen({ port: 0, host: '127.0.0.1' });
    const address = harness.app.server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('serwer testowy nie podał portu');
    }

    scenario = buildScenario(NOW);
    client = new DemoClient(`http://127.0.0.1:${address.port}`, TEST_PASSWORD);
    summary = await runScenario(client, scenario);
    // Limit z zapasem: bieg trwa ~12 s solo, ale ten plik przepuszcza przez PGlite
    // cały scenariusz (ok. 40 paczek, 500 zdarzeń, eksporty kart), a pod pełnym
    // zestawem równoległym maszyna zwalnia kilkukrotnie.
  }, 300_000);

  afterAll(async () => {
    await harness.app.close();
  });

  it('cały scenariusz wchodzi bez odrzuceń i bez pominiętych akcji panelu', () => {
    expect(summary.skipped).toEqual([]);
    expect(summary.duplicates).toBe(0);
    expect(summary.accepted).toBe(scenario.batches.reduce((n, b) => n + b.events.length, 0));
    expect(summary.adminActions).toBe(scenario.adminActions.length);
  });

  it('produkuje po jednym egzemplarzu KAŻDEGO typu flagi z §4.5', async () => {
    const page = await client.adminGet<AdminFlagPage>('/flags?limit=100');
    const byType = new Map<string, number>();
    for (const flag of page.items) byType.set(flag.type, (byType.get(flag.type) ?? 0) + 1);

    // Nakładki MASZYNY są DWIE (jedna rozwiązana, jedna wciąż blokująca) — na tym stoi
    // zarówno skrzynka `A03`, jak i wiersz „brak karty" w monitorze eksportu `A05`.
    //
    // ⚠ `pilot_overlap: 5` NIE JEST liczbą zaprojektowaną. Tyle nakładek grafiku ma dziś
    // scenariusz demo, bo powstawał przed rozdzieleniem flagi (§4.7, 2026-08-07) i zostawia
    // pilotom sesje otwarte na kilku maszynach naraz — układ, którego stary detektor nie
    // widział. Detektor ma rację, dane demo nie. Przebudowa generatora pod nowy model jest
    // OSOBNYM, już zapisanym zadaniem (`_main.md.txt` §3.6b — warunek wstępny kalibracji
    // progów analityki) i wtedy ta liczba ma spaść do 1. Do tego czasu asercja pilnuje
    // przynajmniej tego, że nic więcej się nie zmieniło.
    expect(Object.fromEntries(byType)).toEqual({
      mh_gap: 1,
      mh_regression: 1,
      fuel_mismatch: 1,
      clock_drift: 1,
      aircraft_overlap: 2,
      pilot_overlap: 5,
    });
  });

  it('flagi trafiają na te samoloty, które obiecuje tabela scenariusza', async () => {
    const page = await client.adminGet<AdminFlagPage>('/flags?limit=100');
    const where = (type: string): string[] =>
      page.items.filter((f) => f.type === type).map((f) => f.aircraftId);

    expect(where('mh_gap')).toEqual(['SP-AXA']);
    expect(where('mh_regression')).toEqual(['SP-ANK']);
    expect(where('fuel_mismatch')).toEqual(['SP-KWA']);
    expect(where('clock_drift')).toEqual(['SP-FGK']);
    expect(where('aircraft_overlap').sort()).toEqual(['SP-ANK', 'SP-KWA']);
  });

  it('zostaje dokładnie jedna nakładka OTWARTA i to ona blokuje eksport', async () => {
    const open = await client.adminGet<AdminFlagPage>('/flags?status=open&type=aircraft_overlap');
    expect(open.items).toHaveLength(1);
    expect(open.items[0]!.aircraftId).toBe('SP-KWA');
    expect(open.items[0]!.blocksExport).toBe(true);

    const resolved = await client.adminGet<AdminFlagPage>(
      '/flags?status=resolved&type=aircraft_overlap',
    );
    expect(resolved.items).toHaveLength(1);
    expect(resolved.items[0]!.aircraftId).toBe('SP-ANK');
    // Komentarz jest wymagany przy rozwiązaniu — bez niego historia skrzynki milczy.
    expect(resolved.items[0]!.resolutionNote).toContain('Nakładka pozorna');
    expect(resolved.items[0]!.resolvedBy).toBe('TMK');
  });

  it('rozwiązanie nakładki wypuściło do arkusza karty OBU sesji An-2', async () => {
    const blocked = sessionUuid('ank', 8, 'jse');
    const late = sessionUuid('ank', 9, 'pwi');
    for (const uuid of [blocked, late]) {
      const { rows } = await harness.db.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM export_log WHERE session_uuid = $1',
        [uuid],
      );
      expect(rows[0]!.n, `karta sesji ${uuid}`).toBe('1');
    }
  });

  it('dzień zablokowany otwartą nakładką NIE MA karty — to wiersz alarmowy A05', async () => {
    const { rows } = await harness.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM export_log WHERE session_uuid = $1',
      [sessionUuid('kwa', 4, 'pwi')],
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('dwie zmiany jednego dnia = JEDNA karta z obiema w środku (§4.7)', async () => {
    const day = new Date(Math.floor(NOW / DAY_MS) * DAY_MS - 3 * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const { rows } = await harness.db.query<{ session_uuid: string; revision: number }>(
      `SELECT session_uuid, revision FROM export_log
        WHERE day = $1 AND aircraft_id = 'SP-AXA' ORDER BY revision, session_uuid`,
      [day],
    );

    // Trzy wiersze, nie dwa: rewizja 1 to zmiana poranna sama, rewizja 2 to obie —
    // wiersz dziennika powstaje na KAŻDĄ sesję wchodzącą do rewizji, bo po nim
    // `sync-status` obu pilotów znajduje kartę.
    expect(rows.map((r) => r.revision)).toEqual([1, 2, 2]);
    expect(new Set(rows.map((r) => r.session_uuid)).size).toBe(2);

    // Do 2026-08-07 dwie zmiany budowały dwa dokumenty o jednej nazwie i druga
    // nadpisywała pierwszą (migracja 5 — otwarta wtedy sprawa produktowa). Dziś karta
    // jest dobą samolotu: dalej jeden wiersz w `exported_sheets`, ale obie zmiany
    // W ŚRODKU, a nie jedna zamiast drugiej.
    const sheets = await harness.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM exported_sheets WHERE tab = $1',
      [`${day}_SP-AXA`],
    );
    expect(sheets.rows[0]!.n).toBe('1');

    const sheet = await harness.db.query<{ rows: string[][] }>(
      'SELECT rows FROM exported_sheets WHERE tab = $1',
      [`${day}_SP-AXA`],
    );
    expect(sheet.rows[0]!.rows).toContainEqual(['Sesje', '2']);
  });

  it('ponowienie eksportu dopisuje REWIZJĘ, nie nadpisuje dziennika', async () => {
    const { rows } = await harness.db.query<{ revision: number }>(
      'SELECT revision FROM export_log WHERE session_uuid = $1 ORDER BY revision',
      [sessionUuid('fgk', 15, 'tmk')],
    );
    expect(rows.map((r) => r.revision)).toEqual([1, 2]);
  });

  it('korekta administratora dopisuje zdarzenie, a oryginał zostaje w rejestrze', async () => {
    const day = sessionUuid('axa', 6, 'krz');
    const { rows } = await harness.db.query<{ type: string; payload: { action?: string } }>(
      "SELECT type, payload FROM events WHERE session_uuid = $1 AND type IN ('drop', 'event_correction') ORDER BY device_time",
      [day],
    );
    const corrections = rows.filter((r) => r.type === 'event_correction');
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.payload.action).toBe('void');
    // Cztery zrzuty nadal SĄ w rejestrze — korekta ich nie usuwa, tylko wyłącza
    // z projekcji (`A04` pokazuje je przekreślone).
    expect(rows.filter((r) => r.type === 'drop')).toHaveLength(4);
  });

  it('zostawia jeden dzień W TOKU na SP-FGK — telefon ma co przejmować', async () => {
    const { rows } = await harness.db.query<{ session_uuid: string; pic_id: string }>(
      "SELECT session_uuid, pic_id FROM sessions WHERE aircraft_id = 'SP-FGK' AND status = 'active'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pic_id).toBe('KRZ');
  });

  it('każda akcja panelu zostawia ślad w dzienniku audytu', async () => {
    const { rows } = await harness.db.query<{ action: string; actor_pilot_id: string }>(
      'SELECT action, actor_pilot_id FROM admin_audit ORDER BY id',
    );
    expect(rows.map((r) => r.action)).toEqual([
      'flag.resolve',
      'flag.resolve',
      'export.retry',
      'event.correct',
      'pilot.deactivate',
    ]);
    // Druga flaga jedzie na koncie szefa wyszkolenia — panel ma pokazywać DWÓCH
    // działających, inaczej filtr „Kto" na `A09` nie ma czego filtrować.
    expect(rows[1]!.actor_pilot_id).toBe('AKO');
  });

  it('konto JSE jest wyłączone, a jego historia lotów zostaje', async () => {
    const account = await harness.db.query<{ active: boolean }>(
      "SELECT active FROM pilots WHERE id = 'JSE'",
    );
    expect(account.rows[0]!.active).toBe(false);

    const flown = await harness.db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM sessions WHERE pic_id = 'JSE'",
    );
    expect(Number(flown.rows[0]!.n)).toBeGreaterThan(0);
  });

  /**
   * Powtórny bieg seeda ma wracać samymi duplikatami — na tym stoi obietnica
   * „skrypt niczego nie kasuje i wolno go puścić drugi raz".
   *
   * Wysyłamy PRÓBKĘ paczek, nie wszystkie, i to jest świadome ograniczenie: mechanizm
   * idempotencji to `uuid` nadany przez scenariusz (`INSERT … ON CONFLICT DO NOTHING`),
   * a schemat identyfikatorów jest jeden dla całego strumienia — powtórzenie wszystkich
   * czterdziestu paczek podwajało czas pliku i pod pełnym zestawem równoległym potrafiło
   * przekroczyć limit. Próbka obejmuje wszystkie CZTERY tryby dostarczenia, bo tylko one
   * różnią się kształtem paczki.
   */
  it('powtórny bieg jest IDEMPOTENTNY — same duplikaty, zero nowych zdarzeń', async () => {
    const before = await harness.db.query<{ n: string }>('SELECT count(*)::text AS n FROM events');

    const sample = [
      scenario.batches[0]!, // pełny dzień
      scenario.batches.find((b) => b.note.includes('nakładka'))!, // otwarcie dnia
      scenario.batches.find((b) => b.note.includes('spóźnione domknięcie'))!, // sama paczka `day_close`
      scenario.batches[scenario.batches.length - 1]!, // dzień otwarty DZIŚ
    ];

    let accepted = 0;
    let duplicates = 0;
    for (const batch of sample) {
      const reply = await client.sendEvents(batch.picId, batch.events, batch.sourceDevice);
      accepted += reply.accepted;
      duplicates += reply.duplicates;
    }

    const after = await harness.db.query<{ n: string }>('SELECT count(*)::text AS n FROM events');
    expect(accepted).toBe(0);
    expect(duplicates).toBe(sample.reduce((n, b) => n + b.events.length, 0));
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  }, 120_000);
});
