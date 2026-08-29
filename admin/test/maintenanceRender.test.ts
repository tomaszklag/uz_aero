/**
 * UZ Aero - panel: KONSERWACJA RENDEROWANA NAPRAWDĘ (`A11`).
 *
 * ══ PO CO TEN PLIK ISTNIEJE OBOK TESTÓW MODUŁÓW CZYSTYCH ══
 * Czterokrotnie w tym projekcie zdarzyła się ta sama wada: moduł czysty liczył poprawnie,
 * miał zielony test - a EKRAN i tak pokazywał co innego, bo albo go nie wołał, albo wołał
 * i sklejał wynik z czymś innym. Najdroższy przykład: `A07` liczył trzy stany świeżości,
 * testy przechodziły, a w DOM-ie lądowała klasa, której nie definiuje żaden arkusz.
 *
 * `renderToStaticMarkup` działa w czystym Node i daje DOKŁADNIE ten napis HTML, który
 * przeglądarka dostałaby przy pierwszym renderze - asercje dotyczą więc tego, co widać.
 * Ekran renderujemy CAŁY, z prawdziwymi hookami i cache'em wypełnionym odpowiedzią
 * serwera, więc test upadnie także wtedy, gdy ktoś przestanie wołać moduł czysty.
 *
 * Ten ekran ma jeszcze jeden powód, żeby być sprawdzanym W DOM-ie: bramki przycisków.
 * „Nadpisz" odblokowane bez powodu i „Usuń" odblokowane bez wpisanego słowa to nie są
 * usterki wyglądu - to są usterki, które kasują dane.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type {
  Capability,
  PanelSessionDto,
  RebuildReportDto,
  RefreshTokenScanDto,
  SchemaStateDto,
} from '../src/api/dto';
import { SessionContext } from '../src/auth/sessionContext';
import { keys } from '../src/queries/keys';
import { MaintenanceScreen } from '../src/screens/maintenance/MaintenanceScreen';
import {
  blockedExport,
  failedExport,
  partialWriteFixture,
  queuePage,
  rebuildFixture,
  schemaFixture,
  tokensFixture,
  writtenFixture,
} from './fixtures/maintenance';

const ADMIN: Capability[] = [
  'panel.access',
  'flags.resolve',
  'events.correct',
  'accounts.manage',
  'fleet.manage',
  'thresholds.manage',
  'audit.read',
  'maintenance.run',
];
const TRAINING_LEAD: Capability[] = ['panel.access', 'flags.resolve'];
const PILOT: Capability[] = [];

function session(capabilities: Capability[]): PanelSessionDto {
  return {
    pilot: { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz', role: 'admin' },
    capabilities,
  } as PanelSessionDto;
}

const QUEUE_LIMIT = 50;

interface RenderOptions {
  capabilities?: Capability[];
  /** `undefined` = porównania jeszcze nie było (stan po wejściu na ekran). */
  compare?: RebuildReportDto;
  tokens?: RefreshTokenScanDto;
  schema?: SchemaStateDto;
  failed?: boolean;
  blocked?: boolean;
  /** Ile dni bez karty PASUJE do zawężenia na serwerze - rozjazd z `items` = obcięcie. */
  failedMatched?: number;
}

/**
 * Render z odpowiedziami serwera WSTRZYKNIĘTYMI DO CACHE'U, a nie z zamockowanym
 * `fetch`: mock sieci sprawdzałby mock, a tu sprawdzamy drogę
 * `cache → hook → ekran → moduły czyste → DOM`.
 *
 * ══ CACHE WYPEŁNIAMY WYŁĄCZNIE TAM, GDZIE KONTO MA PRAWO PYTAĆ ══
 * `useQuery({ enabled: false })` oddaje to, co leży w cache'u - więc zaseedowanie
 * odpowiedzi dla konta, które nie ma zdolności ją pobrać, dawało test przechodzący
 * na danych, których produkt NIGDY by nie miał. Dokładnie tak przechodził trywialnie
 * przypadek „brak odczytu daje KRESKI": szef wyszkolenia dostawał w HTML-u pełne
 * `37`, `15` i całą tabelę migracji, a asercja `not.toContain('kv-v red">0')` nie
 * miała czego złapać. Warunki niżej odtwarzają produkcyjną prawdę: zapytanie
 * wyłączone nie wypełnia cache'u.
 */
function render(options: RenderOptions = {}): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const capabilities = options.capabilities ?? ADMIN;
  const may = (capability: Capability): boolean => capabilities.includes(capability);

  if (options.compare != null && may('maintenance.run')) {
    client.setQueryData(keys.maintenance.projections, options.compare);
  }
  if (may('accounts.manage')) {
    client.setQueryData(keys.maintenance.refreshTokens, options.tokens ?? tokensFixture());
  }
  if (may('maintenance.run')) {
    client.setQueryData(keys.maintenance.schema, options.schema ?? schemaFixture());
  }
  const failedItems = options.failed === false ? [] : [failedExport()];
  client.setQueryData(
    keys.exports.list({ state: 'missing', limit: QUEUE_LIMIT }),
    queuePage(failedItems, options.failedMatched ?? failedItems.length),
  );
  client.setQueryData(
    keys.exports.list({ state: 'blocked', limit: QUEUE_LIMIT }),
    queuePage(options.blocked === false ? [] : [blockedExport()]),
  );

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        SessionContext.Provider,
        {
          value: {
            session: session(capabilities),
            loading: false,
            error: null,
          },
        },
        createElement(
          MemoryRouter,
          { initialEntries: ['/konserwacja'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/konserwacja',
              element: createElement(MaintenanceScreen),
            }),
          ),
        ),
      ),
    ),
  );
}

const SZABLON = (): string =>
  readFileSync(join(__dirname, '..', '..', 'design', 'admin', 'SZABLON.html'), 'utf8');

describe('konserwacja: render - kontrola samego testu', () => {
  it('renderer faktycznie produkuje ekran, a nie pusty napis', () => {
    // Bez tego wszystkie asercje `toContain` niżej przechodziłyby na pustce.
    const html = render({ compare: rebuildFixture() });
    expect(html.length).toBeGreaterThan(6000);
    expect(html).toContain('KONSERWACJA');
    expect(html).toContain('class="table-wrap"');
    expect(html).toContain('class="card"');
  });

  it('wszystkie cztery sekcje mockupu są na ekranie', () => {
    const html = render({ compare: rebuildFixture() });
    for (const title of [
      '1 · Przebudowa projekcji',
      '2 · Kolejka ponowień eksportu',
      '3 · Wygasłe refresh tokeny',
      '4 · Stan schematu i migracji',
    ]) {
      expect(html, title).toContain(title);
    }
  });
});

describe('konserwacja: rejestr `events` jest nietykalny i ekran to MÓWI', () => {
  it('baner o append-only stoi u góry, na czerwono', () => {
    const html = render();
    expect(html).toContain('class="banner danger"');
    expect(html).toContain('append-only');
    expect(html).toContain('nadpisuje wyłącznie projekcje');
  });
});

describe('konserwacja: przebudowa - dwa kroki widoczne w DOM-ie', () => {
  it('bez porównania przycisk „Nadpisz" jest ZABLOKOWANY z powodem', () => {
    // Reguła z mockupu („Nadpisanie odblokowuje się dopiero po świeżym porównaniu")
    // policzona w module czystym i NIEWIDOCZNA byłaby usterką kasującą dane.
    const html = render();
    expect(html).toContain('najpierw przelicz i porównaj');
    expect(html).toContain('disabled=""');
    // …a tabeli różnic nie ma, bo nie ma czego pokazać.
    expect(html).not.toContain('Z przeliczenia');
  });

  it('raport z różnicami daje TABELĘ pole po polu i werdykt „incydent"', () => {
    const html = render({ compare: rebuildFixture() });

    expect(html).toContain('class="banner warn"');
    expect(html).toContain('incydent');
    // Wartości sformatowane, nie surowe milisekundy - to samo, co widzi pilot i arkusz.
    expect(html).toContain('05:41');
    expect(html).toContain('05:58');
    expect(html).toContain('flightsCount');
    // Przejście „Do dnia" prowadzi na kartę dnia, a nie donikąd.
    expect(html).toContain('href="/dni/9f21aaaa-bbbb-cccc-dddd-eeeeeeeec04e"');
  });

  it('zero różnic świeci ZIELONO - bo to jest wynik oczekiwany', () => {
    const html = render({
      compare: { ...rebuildFixture(), rowsDiffering: 0, fieldsDiffering: 0, diffs: [] },
    });
    expect(html).toContain('class="banner ok"');
    expect(html).toContain('zgadza się ze strumieniem');
    expect(html).toContain('nie ma czego nadpisywać');
  });

  it('ekran mówi wprost, że PORÓWNANIE nie zostawia wpisu w audycie', () => {
    // To jest sprostowanie wobec mockupu (który obiecuje wpis także dla dry-runu)
    // i musi być widoczne, a nie tylko prawdziwe w kodzie serwera.
    const html = render();
    expect(html).toContain('NIE zostawia wpisu');
    expect(html).toContain('maintenance.rebuild_projections');
  });

  it('pokazuje STEMPEL raportu - inaczej „przelicz i porównaj" czyta się jak „tak jest teraz"', () => {
    const html = render({ compare: rebuildFixture() });
    expect(html).toContain('Raport z porównania');
    // Data, godzina UTC i wiek - przy `staleTime: Infinity` raport wisi bez terminu
    // ważności, więc sama godzina nie mówi, czy to było przed chwilą, czy rano.
    expect(html).toMatch(/\d{1,2} [A-Z]{3} \d{4} \d{2}:\d{2}<small> UTC/);
    expect(html).toContain('temu');
  });
});

describe('konserwacja: PO ZAPISIE ekran opisuje skutek, a nie bazę, której już nie ma', () => {
  /**
   * Raport z zapisu wstrzykujemy w cache PORÓWNANIA i to jest świadomy zastępnik:
   * `renderToStaticMarkup` nie wykona mutacji, a droga, którą sprawdzamy, zaczyna się
   * dopiero PRZY raporcie (`report → currentReport → werdykt/bramka/tabela → DOM`).
   * Ograniczenie nazywamy zamiast udawać pokrycie: ten przypadek NIE dowodzi, że
   * `rebuild.submittedAt` trafia do `currentReport` - to przybija `rebuildRun.test.ts`.
   */
  const afterWrite = (): string => render({ compare: writtenFixture() });

  it('baner mówi „nadpisano", a nie „to incydent, ustal przyczynę"', () => {
    // Wada: po UDANYM nadpisaniu baner dalej wołał o ustalenie przyczyny - nad
    // wierszami, które właśnie przestały się różnić, i po operacji, która zatarła
    // jedyny ślad po tej przyczynie.
    const html = afterWrite();
    expect(html).toContain('class="banner ok"');
    expect(html).toContain('Nadpisano 2 wiersze');
    expect(html).not.toContain('to incydent');
    expect(html).not.toContain('dopiero potem nadpisuj');
  });

  it('przycisk „Nadpisz" jest ZABLOKOWANY i traci liczbę z etykiety', () => {
    // Wada: przycisk wracał CZYNNY z etykietą „Nadpisz 2 wiersze", a drugie kliknięcie
    // nadpisywało zero wierszy i dopisywało DRUGI wpis do dziennika audytu.
    const html = afterWrite();
    expect(html).toContain('ten raport pochodzi z zapisu');
    expect(html).not.toContain('Nadpisz 2 wiersze');
    expect(html).toContain('Nadpisz projekcję');
  });

  it('tabela opisuje SKUTEK - nagłówki mówią „przed zapisem" i „zapisano"', () => {
    const html = afterWrite();
    expect(html).toContain('nadpisane w tym przebiegu');
    expect(html).toContain('Przed zapisem');
    expect(html).toContain('Zapisano');
    expect(html).not.toContain('Z przeliczenia');
  });

  it('zapis CZĘŚCIOWY mówi, ile zostało - limit przebiegu nie jest sekretem', () => {
    const html = render({ compare: partialWriteFixture() });
    expect(html).toContain('class="banner warn"');
    expect(html).toContain('1091');
    expect(html).toContain('Zostało do nadpisania');
  });
});

describe('konserwacja: linki do audytu FAKTYCZNIE zawężają', () => {
  it('oba prowadzą pod `?akcje=konserwacja`, a nie na pełną listę wszystkiego', () => {
    // Wada: ekran składał adres u siebie i wychodziło mu `?akcja=konserwacja`
    // (liczba pojedyncza). Filtr czyta `akcje`, więc parametr był po cichu pomijany
    // i oba linki „Ślad akcji w audycie" prowadziły na dziennik BEZ zawężenia -
    // czyli tam, skąd miały odesłać. To jedyne odesłanie, którym ten ekran nadrabia
    // świadomie pominięty czas przebiegu i datę ostatniej przebudowy.
    const html = render({ compare: rebuildFixture() });

    expect(html).not.toContain('akcja=konserwacja');
    // Dwa wejścia: przycisk w nagłówku i skrót na karcie „Ślad w audycie".
    expect(html.match(/href="\/audyt\?akcje=konserwacja"/g)).toHaveLength(2);
  });
});

describe('konserwacja: tokeny - jedyna operacja, która kasuje', () => {
  it('bez wpisanego słowa przycisk jest ZABLOKOWANY i podaje słowo', () => {
    const html = render();
    expect(html).toContain('Wpisz USUŃ, żeby odblokować');
    expect(html).toContain('brak potwierdzenia');
    // Etykieta niesie LICZBĘ: przycisk kasujący dane mówi, ile skasuje.
    expect(html).toContain('Usuń 37 wygasłych tokenów');
  });

  it('pokazuje OBIE liczby - martwe i żywe - bo druga jest obietnicą', () => {
    const html = render();
    expect(html).toContain('class="kv-v red">37');
    expect(html).toContain('class="kv-v green">15');
    expect(html).toContain('Żaden pilot nie zostanie przez to wylogowany');
  });

  it('mówi, że do audytu idą liczby i daty - nigdy tokeny', () => {
    const html = render();
    expect(html).toContain('nigdy same tokeny');
    expect(html).toContain('maintenance.prune_tokens');
  });

  it('brak odczytu daje KRESKI, nigdy zer', () => {
    // „0 wygasłych" przy awarii pobrania wygląda jak czysta tabela.
    //
    // ══ TEN PRZYPADEK DO 2026-08-02 NIE MÓGŁ UPAŚĆ ══
    // Helper renderu seedował odpowiedź tokenów NIEZALEŻNIE od zdolności konta,
    // a `useQuery({ enabled: false })` oddaje dane z cache'u - więc HTML zawierał
    // pełne `37`, `15` i całą tabelę migracji, a asercja „nie ma zer" przechodziła
    // trywialnie, bo zer faktycznie nie było: były prawdziwe liczby. Produkt
    // zachowywał się poprawnie; wadliwy był test - w pliku, którego docblock obiecuje
    // bronić przed „modułem czystym z zielonym testem i ekranem pokazującym co innego".
    const html = render({ capabilities: TRAINING_LEAD });

    expect(html).not.toContain('class="kv-v red">0');
    expect(html).toContain('accounts.manage');
    // Asercje POZYTYWNE: kreski są na ekranie, a liczb z fixture'u tam nie ma.
    expect(html).toContain('class="kv-v">-');
    expect(html).not.toContain('>37<');
    expect(html).not.toContain('Usuń 37');
    // …i to samo po stronie schematu: tabela migracji jest pusta Z POWODU.
    expect(html).not.toContain('Fundament: pilots, aircraft, refresh_tokens, events');
  });
});

describe('konserwacja: kolejka ponowień korzysta z maszynerii `A05`', () => {
  const html = render();

  it('dzień bez karty ma CZYNNY przycisk, dzień z flagą - wyszarzony z powodem', () => {
    expect(html).toContain('2026-07-29_SP-KLM');
    expect(html).toContain('2026-07-30_SP-KLM');
    // Powód blokady jest WIDOCZNYM tekstem, nie tylko tooltipem.
    expect(html).toContain('najpierw rozstrzygnij flagę #1046');
    expect(html).toContain('href="/flagi/1046"');
  });

  it('wiersz z flagą prowadzi do flagi, a wiersz bez karty - do karty na `A05`', () => {
    expect(html).toContain('href="/eksporty/sess-bez-karty"');
  });

  it('mówi wprost, czego kolejka NIE POKAZUJE i dlaczego', () => {
    expect(html).toContain('nie da się wypełnić');
    expect(html).toContain('export_log');
  });

  it('pusta kolejka to POTWIERDZENIE, nie awaria', () => {
    const empty = render({ failed: false, blocked: false });
    expect(empty).toContain('class="empty"');
    // Jednostką jest ZDANA MASZYNA, nie „zamknięty dzień": karta powstaje po
    // `day_close` sesji, a jedna doba maszyny bierze dwie zmiany (§3.6a, §4.7).
    expect(empty).toContain('KAŻDA ZDANA MASZYNA MA KARTĘ');
    expect(empty).toContain('kolejka pusta');
  });

  it('PLAKIETKA liczy z serwera, a obcięcie listy jest widoczne', () => {
    // Wada: plakietki liczyły z sumy dwóch stron JUŻ OBCIĘTYCH `QUEUE_LIMIT`-em.
    // Przy 137 dniach bez karty plakietka mówiła „50", tabela pokazywała 50, o 87
    // schowanych nie było ani słowa - a `A05` na to samo pytanie odpowiadał „137".
    const html = render({ failedMatched: 137 });

    expect(html).toContain('137 bez kart');
    expect(html).toContain('Kolejka jest dłuższa niż ta tabela');
    expect(html).toContain('z 138 dni');
    // Zdanie ma powiedzieć, gdzie iść po resztę.
    expect(html).toContain('href="/eksporty?stan=missing"');
  });
});

describe('konserwacja: stan schematu', () => {
  it('wypisuje migracje z opisem SERWERA i stanem', () => {
    const html = render();
    expect(html).toContain('Fundament: pilots, aircraft, refresh_tokens, events');
    expect(html).toContain('zastosowana');
    expect(html).toContain('12 MAY 2026');
    expect(html).toContain('nie uruchamia migracji');
  });

  it('baza starsza niż kod dostaje OSTRZEŻENIE, nie ciszę', () => {
    const stale = schemaFixture();
    stale.applied = 2;
    stale.pending = 1;
    stale.migrations[2]!.applied = false;
    stale.migrations[2]!.appliedAt = null;

    const html = render({ schema: stale });
    expect(html).toContain('Baza jest starsza niż kod');
    expect(html).toContain('RESTART');
    expect(html).toContain('class="pill amber"');
  });
});

describe('konserwacja: zdolności - wyszarzone Z POWODEM, nigdy ukryte', () => {
  it('szef wyszkolenia widzi ekran, ale każda akcja jest zablokowana z powodem', () => {
    const html = render({ capabilities: TRAINING_LEAD });

    expect(html).toContain('KONSERWACJA');
    // Trzy różne powody, bo trzy różne zdolności - a nie jeden ogólny komunikat.
    expect(html).toContain('porównanie czyta cały rejestr zdarzeń');
    expect(html).toContain('to jedyna operacja panelu, która kasuje dane');
    expect(html).toContain('maintenance.run');
    // Stan schematu jest pusty Z POWODEM, a nie „bo baza pusta".
    expect(html).toContain('Tabela jest pusta dlatego');
  });

  it('konto bez wejścia do panelu dostaje `NoAccess`, a nie pusty ekran', () => {
    const html = render({ capabilities: PILOT });
    expect(html).toContain('class="no-access"');
    expect(html).toContain('Wymaga roli');
    expect(html).not.toContain('Usuń 37');
  });
});

describe('konserwacja: klasy CSS są DOSŁOWNIE te z `SZABLON.html`', () => {
  it('każda klasa wypisana przez ekran ma regułę w szablonie', () => {
    // Para do `classInventory.test.ts`, który sprawdza arkusze panelu wobec szablonu.
    // Ten przypadek patrzy z drugiej strony: na to, co ekran FAKTYCZNIE wypisał.
    const html = render({ compare: rebuildFixture() });
    const szablon = SZABLON();

    const used = new Set(
      [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
    );
    // Kontrola samego skanera: gdyby regex przestał łapać, zbiór byłby pusty.
    expect(used.size).toBeGreaterThan(10);
    expect(used.has('table-wrap')).toBe(true);

    // Jedyny wyjątek: `visually-hidden` to klasa DOSTĘPNOŚCI z `base.css`, a nie
    // komponent back-office'u - szablon jej nie definiuje i definiować nie ma po co.
    // `cols-stack` i `list-spacer` z tej listy WYPADŁY 2026-08-02: obie mają reguły
    // w `SZABLON.html` (linie `.cols-stack` i `.list-spacer`), więc wyjątek na nie był
    // wyjątkiem bez powodu - a taki osłabia test na przyszłość, bo przepuszcza również
    // klasę, która regułę straci.
    const missing = [...used]
      .filter((c) => c !== 'visually-hidden')
      .filter((c) => !szablon.includes(`.${c}`))
      .sort();
    expect(missing).toEqual([]);
  });
});
