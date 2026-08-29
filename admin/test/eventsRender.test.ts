/**
 * UZ Aero - panel: REJESTR ZDARZEŃ RENDEROWANY NAPRAWDĘ (`A04`).
 *
 * ══ PO CO TEN PLIK ISTNIEJE OBOK TESTÓW MODUŁÓW CZYSTYCH ══
 * Trzy razy w tym projekcie zdarzyła się ta sama wada: moduł czysty liczył poprawnie,
 * miał zielony test - a EKRAN i tak pokazywał co innego, bo albo go nie wołał, albo
 * wołał i sklejał wynik z czymś innym. Najdroższy przykład: `A07` liczył trzy stany
 * świeżości, testy przechodziły, a w DOM-ie lądowała klasa `fresh-stale`, której nie
 * definiuje żaden arkusz. Stany były policzone, przetestowane i NIEWIDOCZNE.
 *
 * `renderToStaticMarkup` z `react-dom/server` działa w czystym Node i daje DOKŁADNIE
 * ten napis HTML, który przeglądarka dostałaby przy pierwszym renderze - więc asercje
 * dotyczą tego, co widać, a nie tego, co policzone. Ekran renderujemy CAŁY, z prawdziwym
 * `EventsScreen`, prawdziwym `useEvents` i cache'em TanStacka wypełnionym odpowiedzią
 * serwera; test upadnie także wtedy, gdy ktoś przestanie wołać moduł czysty z ekranu.
 *
 * Na tym ekranie zamykamy tę pułapkę OD RAZU, bo rejestr jest narzędziem śledczym:
 * wiersz, który nie dojechał do DOM-u, jest gorszy niż brak ekranu - wygląda jak
 * dowód, że zdarzenia nie było.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Capability, EventsPageDto, PanelSessionDto } from '../src/api/dto';
import { SessionContext } from '../src/auth/sessionContext';
import { keys } from '../src/queries/keys';
import { eventsListQuery, filterFromParams } from '../src/screens/events/eventsFilters';
import { EventsScreen } from '../src/screens/events/EventsScreen';
import { eventsFixture } from './fixtures/events';

const ADMIN: Capability[] = [
  'panel.access',
  'flags.resolve',
  'events.correct',
  'accounts.manage',
  'fleet.manage',
  'thresholds.manage',
  'audit.read',
];
const TRAINING_LEAD: Capability[] = ['panel.access', 'flags.resolve'];

function session(capabilities: Capability[]): PanelSessionDto {
  return {
    pilot: { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz', role: 'admin' },
    capabilities,
  } as PanelSessionDto;
}

/**
 * Render ekranu z odpowiedzią serwera WSTRZYKNIĘTĄ DO CACHE'U, a nie z zamockowanym
 * `fetch`. Różnica jest istotna: mock `fetch` sprawdzałby mock, a tu sprawdzamy drogę
 * `cache → hook → ekran → moduły czyste → DOM`, czyli wszystko poza siecią.
 *
 * `path` niesie adres wraz z zawężeniem, bo filtry tego ekranu mieszkają w URL-u -
 * render z domyślnej ścieżki nie pokazałby ani jednego stanu zawężonego.
 */
function render(
  data: EventsPageDto | null,
  options: { path?: string; capabilities?: Capability[] } = {},
): string {
  const path = options.path ?? '/zdarzenia';
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

  if (data != null) {
    const query = eventsListQuery(filterFromParams(new URLSearchParams(path.split('?')[1] ?? '')));
    client.setQueryData(keys.events.list(query), { pages: [data], pageParams: [null] });
  }
  // Słowniki chipów: bez nich `useFleet`/`usePilots` byłyby w stanie „w drodze",
  // a pasek filtrów miałby wyłącznie chipy „wszystkie" - czyli test nie widziałby
  // tego, co widzi człowiek.
  client.setQueryData(keys.fleet.list({}), {
    items: [
      { id: 'ac-klm', reg: 'SP-KLM', type: 'Cessna 208', serviceStatus: 'active' },
      { id: 'ac-abc', reg: 'SP-ABC', type: 'Cessna 182', serviceStatus: 'active' },
    ],
    counts: {},
    scopes: {},
  });
  client.setQueryData(keys.pilots.list({ limit: 200 }), {
    items: [
      { id: 'AWR', code: 'AWR', name: 'Anna Wrzosek', active: true },
      { id: 'TML', code: 'TML', name: 'Tomasz Małkiewicz', active: true },
    ],
    total: 2,
  });

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        SessionContext.Provider,
        {
          value: {
            session: session(options.capabilities ?? ADMIN),
            loading: false,
            error: null,
          },
        },
        createElement(
          MemoryRouter,
          { initialEntries: [path] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/zdarzenia/:uuid?',
              element: createElement(EventsScreen),
            }),
          ),
        ),
      ),
    ),
  );
}

const cssOf = (...parts: string[]): string =>
  readFileSync(join(__dirname, '..', 'src', 'styles', ...parts), 'utf8');

const SZABLON = (): string =>
  readFileSync(join(__dirname, '..', '..', 'design', 'admin', 'SZABLON.html'), 'utf8');

describe('rejestr: render - kontrola samego testu', () => {
  it('renderer faktycznie produkuje ekran, a nie pusty napis', () => {
    // Bez tego wszystkie asercje `toContain` niżej przechodziłyby na pustce.
    const html = render(eventsFixture());
    expect(html.length).toBeGreaterThan(4000);
    expect(html).toContain('REJESTR ZDARZEŃ');
    expect(html).toContain('class="tiles"');
    expect(html).toContain('class="table-wrap"');
  });
});

describe('rejestr: dwa zegary docierają AŻ DO KLASY CSS', () => {
  const html = render(eventsFixture());

  it('brak fixa daje „brak fixa" i CZERWONY ton - nigdy zera', () => {
    // Zero powiedziałoby, że zegary się zgadzały, czyli wpisałoby telefonowi
    // dokładność, której nie miał. To jest ta wielkość, przez którą w ogóle powstaje
    // korekta administratora.
    expect(html).toContain('brak fixa');
    expect(html).toContain('class="clock-val red"');
    // Kontrola z drugiej strony: wiersz bez fixa NIE wypisuje „0 s".
    expect(html).not.toContain('>0 s<');
  });

  it('rozjazd ponad próg jest BURSZTYNOWY, zgodny idzie neutralnie', () => {
    expect(html).toContain('class="clock-val amber"');
    expect(html).toContain('class="clock-val dim"');
    expect(html).toContain('720 s');
    expect(html).toContain('1 s');
  });

  it('próg CLOCK_DRIFT jest WYPISANY z odpowiedzi serwera', () => {
    // Panel go nie zna; druga kopia progu rozjechałaby się przy strojeniu tolerancji.
    expect(html).toContain('próg CLOCK_DRIFT: 120 s');
  });

  it('każda wypisana klasa MA regułę w arkuszu panelu I w szablonie', () => {
    const css = cssOf('components', 'table.css');
    const szablon = SZABLON();
    // Kontrola: gdyby ścieżka przestała wskazywać arkusz tabeli, reszta przeszłaby
    // na pustym napisie.
    expect(css).toContain('.table-wrap {');

    for (const selector of ['.clock-val.amber', '.clock-val.red', '.clock-val.dim']) {
      expect(css, selector).toContain(`${selector} {`);
      expect(szablon, selector).toContain(selector);
    }
  });
});

describe('rejestr: nic z bazy nie wywraca widoku', () => {
  const html = render(eventsFixture());

  it('NIEZNANY typ zdarzenia dojeżdża do DOM-u dosłownie', () => {
    expect(html).toContain('jakis_nowy_typ');
    expect(html).toContain('typ spoza katalogu domeny');
  });

  it('payload NIEBĘDĄCY obiektem renderuje się bez wywrotki', () => {
    // Wiersz z tablicą w payloadzie jest rozwinięty adresem, więc wypis MUSI być
    // w DOM-ie - a nie tylko poprawnie policzony.
    const open = render(eventsFixture(), {
      path: '/zdarzenia/00000000-obcy-0000-0000-000000000000',
    });
    expect(open).toContain('class="payload"');
    expect(open).toContain('tablica, nie obiekt');
    expect(open).toContain('&quot;dwa&quot;');
  });

  it('samolot i konto, których już nie ma, ZOSTAJĄ z identyfikatorem', () => {
    expect(html).toContain('ac-znikniety');
    expect(html).toContain('nie ma już w rejestrze floty');
    expect(html).toContain('konta nie ma już w rejestrze');
  });

  it('payload z kluczem `constructor` nie zamienia się w biały ekran', () => {
    const data = eventsFixture();
    data.items[0]!.payload = JSON.parse('{"constructor":"tekst","toString":null}');
    const open = render(data, { path: '/zdarzenia/9f2c4e18-b073-4a56-8ce1-d2740f6e41ab' });
    expect(open).toContain('&quot;constructor&quot;');
    expect(open).toContain('&quot;tekst&quot;');
  });
});

describe('rejestr: korekta przekreśla, nie usuwa', () => {
  const html = render(eventsFixture());

  it('wiersz unieważniony NIESIE modyfikator `voided` i zostaje na liście', () => {
    expect(html).toContain('class="clickable voided"');
    // Wiersz nadal ma swój uuid w tabeli - rejestr jest append-only.
    expect(html).toContain('5e2b…00ab');
  });

  it('modyfikator ma regułę w arkuszu i w szablonie', () => {
    const css = cssOf('components', 'table.css');
    expect(css).toContain('tbody tr.voided td.num');
    expect(SZABLON()).toContain('tbody tr.voided td.num');
  });

  it('rozwinięcie unieważnionego mówi, KTO zapisał korektę', () => {
    const open = render(eventsFixture(), {
      path: '/zdarzenia/5e2b91c7-0000-0000-0000-0000000000ab',
    });
    expect(open).toContain('unieważnione korektą');
    expect(open).toContain('Korektę zapisał panel.');
  });

  it('zdarzenie z `retime` jest ODRÓŻNIALNE W TABELI, nie tylko w rozwinięciu', () => {
    // Najdroższa pomyłka tego ekranu miałaby dokładnie ten kształt: stan policzony,
    // przetestowany w module czystym i NIEWIDOCZNY. Wiersz z korektą `retime` wyglądał
    // jak nietknięty - bez przekreślenia, z wartościami surowymi w kolumnach, a jedyna
    // wzmianka mieszkała w rozwinięciu otwieranym osobno dla każdego wiersza.
    expect(html).toContain('class="clock-val struck"');
    expect(html).toContain('korekta → 12:44:00');
    // Wartość SUROWA zostaje widoczna obok - rejestr pamięta, co przysłał telefon.
    expect(html).toContain('12:41:05');
  });

  it('modyfikator przekreślenia MA regułę w arkuszu panelu I w szablonie', () => {
    const css = cssOf('components', 'table.css');
    expect(css).toContain('.clock-val.struck {');
    expect(SZABLON()).toContain('.clock-val.struck');
  });

  it('kolumna `source_device` mówi o POCHODZENIU wiersza, nie o jego korekcie', () => {
    // Zdarzenie z telefonu, którego korektę zapisał panel, dostawało pod nazwą telefonu
    // podpis „korekta z panelu"; sam wiersz korekty zapisany przez panel - żadnego.
    // Dwa różne fakty, dwa różne pola.
    expect(html).toContain('admin:TMK');
    expect(html).toContain('zapis z panelu');
    expect(html).not.toContain('>korekta z panelu<');
  });
});

describe('rejestr: kafle i braki, o których mówimy wprost', () => {
  it('trzy kafle niosą liczby serwera, czwarty przyznaje się do braku', () => {
    const html = render(eventsFixture());
    expect(html).toContain('>247<');
    expect(html).toContain('>23<');
    expect(html).toContain('>9<');
    expect(html).toContain('Przyjęte / duplikaty');
    expect(html).toContain('ON CONFLICT DO NOTHING');
  });

  it('bez odpowiedzi kafle mówią „-", nigdy zera', () => {
    // Najdroższa możliwa pomyłka narzędzia nadzoru: „0 zdarzeń bez fixa" przy awarii
    // pobrania wygląda jak dobra wiadomość.
    const html = render(null);
    expect(html).toContain('Nie wiadomo - rejestr się nie pobrał.');
    expect(html).not.toContain('class="tile-val amber">0');
    expect(html).not.toContain('class="tile-val green">0');
  });

  it('eksport CSV jest ZABLOKOWANY Z POWODEM, a nie ukryty', () => {
    const html = render(eventsFixture());
    expect(html).toContain('serwer nie wystawia trasy eksportu rejestru');
  });
});

describe('rejestr: rozwinięcie wiersza', () => {
  it('bez adresu wiersza NIE MA rozwinięcia; z adresem - jest', () => {
    expect(render(eventsFixture())).not.toContain('class="row-expand"');

    const open = render(eventsFixture(), {
      path: '/zdarzenia/9f2c4e18-b073-4a56-8ce1-d2740f6e41ab',
    });
    expect(open).toContain('class="row-expand"');
    expect(open).toContain('Nagłówek zdarzenia');
    expect(open).toContain('Zwiń ▲');
  });

  it('wypis JSON-a odtwarza zagnieżdżenie z mockupu', () => {
    const open = render(eventsFixture(), {
      path: '/zdarzenia/9f2c4e18-b073-4a56-8ce1-d2740f6e41ab',
    });
    expect(open).toContain('class="payload-key"');
    expect(open).toContain('&quot;dropNumber&quot;');
    expect(open).toContain('&quot;SKY CAMP&quot;');
    expect(open).toContain('class="payload-val blue"');
    expect(open).toContain('class="payload-val green"');
  });

  it('rozwinięcie bez fixa niesie ostrzeżenie o zegarze telefonu', () => {
    const open = render(eventsFixture(), {
      path: '/zdarzenia/b8d41f27-6c0a-4e93-a15b-2f7d9e604c18',
    });
    expect(open).toContain('Brak fixa GPS w chwili zapisu.');
    expect(open).toContain('z zegara telefonu');
    // `null` jest jawną wartością payloadu, nie brakiem pola.
    expect(open).toContain('class="payload-val red"');
  });

  it('adres wskazujący zdarzenie SPOZA pobranych stron mówi to wprost', () => {
    // Wklejony link do zdarzenia odfiltrowanego. Pusta karta kazałaby zgadywać.
    const open = render(eventsFixture(), { path: '/zdarzenia/ev-nie-ma-go-tu' });
    expect(open).toContain('nie ma na pobranych stronach');
  });
});

describe('rejestr: uprawnienia widoczne, nie ukryte', () => {
  it('szef wyszkolenia CZYTA rejestr, ale „Popraw" jest zablokowane z powodem', () => {
    // Reguła z mockupu jest twarda: przycisk niedostępny dla roli zostaje WIDOCZNY
    // i wyjaśniony, nigdy ukryty - inaczej człowiek zgaduje, czy funkcji nie ma
    // w produkcie, czy nie ma jej jego konto.
    const html = render(eventsFixture(), { capabilities: TRAINING_LEAD });
    expect(html).toContain('REJESTR ZDARZEŃ');
    expect(html).toContain('class="table-wrap"');
    expect(html).toContain('wymaga roli: administrator');
  });

  it('administrator dostaje „Popraw" jako LINK - i tylko przy typie korygowalnym', () => {
    const html = render(eventsFixture());
    // `landing` podlega korekcie…
    expect(html).toContain('/dni/sess-klm/korekta/5e2b91c7-0000-0000-0000-0000000000ab');
    // …a `day_close` nie - domena go nie pozwala ruszać.
    expect(html).toContain('domena nie pozwala korygować');
  });

  it('konto bez `panel.access` widzi ekran odmowy, nie pustą tabelę', () => {
    const html = render(eventsFixture(), { capabilities: [] });
    expect(html).toContain('class="no-access"');
    expect(html).not.toContain('class="table-wrap"');
  });
});

describe('rejestr: przejścia i paginacja - zero martwych linków', () => {
  const html = render(eventsFixture());

  it('wiersz prowadzi na kartę DNIA i do zawężenia po uuid-zie', () => {
    expect(html).toContain('href="/dni/sess-klm"');
    expect(html).toContain('href="/zdarzenia?uuid=9f2c4e18-b073-4a56-8ce1-d2740f6e41ab"');
  });

  it('kursor daje przycisk „pokaż starsze", a podpis mówi, ile widać', () => {
    // Lista przycięta po cichu wygląda na komplet - najgorszy tryb awarii narzędzia
    // śledczego.
    expect(html).toContain('Pokaż starsze zdarzenia');
    expect(html).toContain('Pokazano 8 z 247.');
    expect(html).toContain('kursor keyset');
  });

  it('ekran NAZYWA oś czasu zakresu dat, zamiast zostawiać ją do odgadnięcia', () => {
    expect(html).toContain('Zakres dat idzie po czasie PRZYJĘCIA');
  });
});

describe('rejestr: stany puste odpowiadają na zadane pytanie', () => {
  const emptyPage = (): EventsPageDto => ({
    items: [],
    nextCursor: null,
    counts: { total: 0, withoutGpsFix: 0, clockDrift: 0, driftThresholdMs: 120_000 },
  });

  it('szukanie po uuid bez wyniku mówi „nie dotarło" i proponuje szukanie po sesji', () => {
    const html = render(emptyPage(), { path: '/zdarzenia?uuid=ev-9' });
    expect(html).toContain('TO ZDARZENIE NIE DOTARŁO');
    expect(html).toContain('outbox');
    expect(html).toContain('href="/zdarzenia?sesja=ev-9"');
  });

  it('pusty rejestr bez zawężenia mówi o podejrzeniu awarii synchronizacji', () => {
    const html = render(emptyPage());
    expect(html).toContain('REJESTR JEST PUSTY');
    expect(html).not.toContain('TO ZDARZENIE NIE DOTARŁO');
  });
});
