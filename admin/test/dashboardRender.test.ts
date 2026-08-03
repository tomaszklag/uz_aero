/**
 * UZ Aero — panel: PULPIT RENDEROWANY NAPRAWDĘ (`A01`, `A01a`).
 *
 * ══ PO CO TEN PLIK ISTNIEJE OBOK TESTÓW MODUŁÓW CZYSTYCH ══
 * Trzy razy w tym projekcie zdarzyła się ta sama wada: moduł czysty liczył poprawnie,
 * miał zielony test — a EKRAN i tak pokazywał co innego, bo albo go nie wołał, albo
 * wołał i sklejał wynik z czymś innym. Najdroższy przykład: `A07` liczył trzy stany
 * świeżości, testy przechodziły, a w DOM-ie lądowała klasa `fresh-stale`, której nie
 * definiuje żaden arkusz. Stany były policzone, przetestowane i NIEWIDOCZNE.
 *
 * Ten plik zamyka tę lukę bez jsdom i bez Testing Library: `renderToStaticMarkup`
 * z `react-dom/server` działa w czystym Node i daje DOKŁADNIE ten napis HTML, który
 * przeglądarka dostałaby przy pierwszym renderze. Asercje dotyczą więc tego, co widać,
 * a nie tego, co policzone.
 *
 * Ekran renderujemy CAŁY — z prawdziwym `DashboardScreen`, prawdziwym `useDashboard`
 * i cache'em TanStacka wypełnionym odpowiedzią serwera. Dzięki temu test upadnie także
 * wtedy, gdy ktoś przestanie wołać moduł czysty z ekranu.
 *
 * Mieszka w `admin/test/`, a nie obok ekranu, z powodu reguły architektury: moduły
 * `.ts` w `src/screens/**` NIE MOGĄ importować Reacta (`admin/test/architecture.test.ts`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { DashboardDto } from '../src/api/dto';
import { keys } from '../src/queries/keys';
import { DashboardScreen } from '../src/screens/dashboard/DashboardScreen';
import { dashboardFixture } from './fixtures/dashboard';

/**
 * Render ekranu z odpowiedzią serwera WSTRZYKNIĘTĄ DO CACHE'U, a nie z zamockowanym
 * `fetch`. Różnica jest istotna: mock `fetch` sprawdzałby mock, a tu sprawdzamy drogę
 * `cache → hook → ekran → moduły czyste → DOM`, czyli wszystko poza siecią.
 *
 * `retry: false`, bo brak sieci w teście nie ma prawa zamienić się w trzy ponowienia.
 */
function render(data: DashboardDto | null): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  if (data != null) client.setQueryData(keys.dashboard, data);

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: ['/pulpit'] }, createElement(DashboardScreen)),
    ),
  );
}

const cssOf = (...parts: string[]): string =>
  readFileSync(join(__dirname, '..', 'src', 'styles', ...parts), 'utf8');

const SZABLON = (): string =>
  readFileSync(join(__dirname, '..', '..', 'design', 'admin', 'SZABLON.html'), 'utf8');

describe('pulpit: render — kontrola samego testu', () => {
  it('renderer faktycznie produkuje ekran, a nie pusty napis', () => {
    // Bez tego wszystkie asercje `toContain` niżej przechodziłyby na pustce.
    const html = render(dashboardFixture());
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('PULPIT');
    expect(html).toContain('class="tiles"');
    expect(html).toContain('class="fleet"');
  });
});

describe('pulpit: trzy stany świeżości docierają AŻ DO KLASY CSS', () => {
  const html = render(dashboardFixture());

  it('wiersz floty niesie modyfikator stanu z modułu czystego', () => {
    // Samolot w powietrzu z świeżym syncem, samolot z milczącym telefonem i samolot
    // wolny — trzy różne wiersze, trzy różne klasy. Gdyby ekran przestał brać
    // `row.rowClass`, zostałaby jedna.
    expect(html).toContain('class="fleet-row flying"');
    expect(html).toContain('class="fleet-row stale"');
    expect(html).toContain('class="fleet-row free"');
  });

  it('wartość świeżości niesie ton, a nie samą liczbę', () => {
    expect(html).toContain('class="fresh-val"');
    expect(html).toContain('class="fresh-val amber"');
    expect(html).toContain('class="fresh-val dim"');
  });

  it('każda wypisana klasa MA regułę w arkuszu panelu', () => {
    const css = cssOf('components', 'dashboard.css');
    // Kontrola: gdyby ścieżka przestała wskazywać arkusz pulpitu, reszta przeszłaby
    // na pustym napisie.
    expect(css).toContain('.fleet-row {');

    for (const selector of ['.fleet-row.flying', '.fleet-row.stale', '.fleet-row.free']) {
      expect(css).toContain(`${selector} {`);
    }
    for (const selector of ['.fresh-val', '.fresh-val.amber', '.fresh-val.dim']) {
      expect(css).toContain(`${selector} {`);
    }
    // Bursztyn jest CAŁĄ treścią stanu „telefon milczy" — bez niego wiersz świeży
    // i wiersz sprzed godziny wyglądają identycznie.
    expect(css).toMatch(/\.fresh-val\.amber\s*\{\s*color:\s*var\(--amber\)/);
  });

  it('nazwy modyfikatorów są DOSŁOWNIE te z `SZABLON.html` — mockup wygrywa', () => {
    const szablon = SZABLON();
    for (const selector of ['.fleet-row.flying', '.fleet-row.stale', '.fleet-row.free']) {
      expect(szablon).toContain(selector);
    }
    for (const selector of ['.fresh-val.amber', '.fresh-val.dim']) {
      expect(szablon).toContain(selector);
    }
  });
});

describe('pulpit: „W locie" jest prawdziwe, a brak danych to kreska', () => {
  const html = render(dashboardFixture());

  it('plakietka fazy lotu pochodzi z projekcji serwera, nie z claimu', () => {
    // `A02` i `A07` mówią w tym miejscu „Zajęty", bo nie mają czym powiedzieć więcej.
    // Pulpit ma — i to jest cała różnica tego przekroju.
    expect(html).toContain('W locie');
    expect(html).toContain('Na ziemi');
    expect(html).toContain('Dane w drodze');
    // Puls TYLKO przy stanie trwającym.
    expect(html).toContain('class="dot live"');
  });

  it('samolot bez odczytu pokazuje „—", nigdy zera', () => {
    const noReading = dashboardFixture();
    for (const row of noReading.fleet) row.aircraft.reading = null;
    const bare = render(noReading);

    expect(bare).toContain('brak danych z telefonu');
    // Zero w kolumnie paliwa byłoby twierdzeniem o pustym zbiorniku.
    expect(bare).not.toContain('>0 L<');
  });
});

describe('pulpit: brak odpowiedzi daje „—", a nie zero', () => {
  it('bez danych wszystkie cztery kafle mówią „nie wiemy"', () => {
    // Najdroższa możliwa pomyłka narzędzia nadzoru: „0 otwartych flag" przy awarii
    // pobrania wygląda jak dobra wiadomość.
    const html = render(null);
    expect(html).toContain('Nie wiadomo — pulpit się nie pobrał.');
    expect(html).not.toContain('class="tile-val green">0');
    expect(html).not.toContain('class="tile-val amber">0');
    // Kreska jest w kaflach cztery razy — po jednej na kafel.
    expect(html.split('—').length - 1).toBeGreaterThanOrEqual(4);
  });
});

describe('pulpit: kolejka „wymaga uwagi" stawia zadania', () => {
  const html = render(dashboardFixture());

  it('wiersze mają ton, wiek i przejście w głąb', () => {
    expect(html).toContain('class="todo"');
    expect(html).toContain('class="todo-mark red"');
    expect(html).toContain('class="todo-mark blue"');
    expect(html).toContain('class="todo-age old"');
    // Przejścia: flaga do skrzynki, dzień do karty dnia.
    expect(html).toContain('href="/flagi/1046"');
    expect(html).toContain('href="/dni/sess-stale"');
  });

  it('sprawa blokująca arkusz stoi PRZED starszą, ale nieblokującą', () => {
    const blocking = html.indexOf('todo-mark red');
    const other = html.indexOf('todo-mark blue');
    expect(blocking).toBeGreaterThan(-1);
    expect(other).toBeGreaterThan(blocking);
  });
});

describe('pulpit: wariant CISZA wygląda jak potwierdzenie, nie jak awaria', () => {
  /** Klub, w którym nic nie lata, a poprzedni dzień urwał się czysto. */
  function quiet(): DashboardDto {
    const data = dashboardFixture();
    data.counts.aircraftClaimed = 0;
    data.counts.openDays = 0;
    data.counts.openFlags = 0;
    data.counts.exports = {
      total: 3,
      current: 3,
      blocked: 0,
      missing: 0,
      waiting: 0,
      impossible: 0,
      revised: 0,
      overwritten: 0,
    };
    data.attention = { flags: [], failedExports: [], staleOpenDays: [] };
    for (const row of data.fleet) {
      row.engine = null;
      row.aircraft.claim = null;
    }
    return data;
  }

  it('baner jest ZIELONY i nazywa ciszę spodziewaną', () => {
    const html = render(quiet());
    expect(html).toContain('class="banner ok"');
    expect(html).toContain('Cisza spodziewana');
    // Ani śladu czerwieni: pustka nie jest błędem.
    expect(html).not.toContain('class="banner danger"');
  });

  it('kolejka uwagi ma STAN PUSTY z wyjaśnieniem, a nie pustą listę', () => {
    const html = render(quiet());
    expect(html).toContain('KOLEJKA UWAGI JEST PUSTA');
    expect(html).toContain('Wchodzą tu trzy rzeczy');
    expect(html).toContain('class="empty"');
  });

  it('kafel flag przy zerze jest ZIELONY, nie bursztynowy', () => {
    // Zero flag nie jest awarią, więc nie ma prawa świecić ostrzegawczo (`A03b`).
    const html = render(quiet());
    expect(html).toContain('class="tile-val green">0');
  });

  it('karta rozstrzyga pytanie, które zostaje na pustym pulpicie', () => {
    const html = render(quiet());
    expect(html).toContain('Cisza spodziewana czy podejrzana');
    expect(html).toContain('Próg podejrzenia');
    // Zamiast dzisiejszych zer — podsumowanie OSTATNIEGO dnia lotnego.
    expect(html).toContain('Ostatni dzień lotny');
  });

  it('urwany claim zmienia werdykt na bursztyn i NAZYWA powód', () => {
    // Ta sama pustka, inna przyczyna: ktoś zajął samolot i nic od niego nie dotarło.
    const data = quiet();
    const first = data.fleet[0]!;
    first.engine = {
      sessionUuid: 'sess-stranded',
      engineRunning: false,
      inFlight: false,
      flightsCount: 0,
      openTakeoffAt: null,
      engineStoppedAt: null,
      lastEventAt: null,
      dutyStart: null,
      departureIcao: null,
      dualId: null,
      dualName: null,
      eventCount: 0,
    };

    const html = render(data);
    expect(html).toContain('class="banner warn"');
    expect(html).toContain('Cisza podejrzana');
    expect(html).toContain('Otwarty claim bez ani jednego zdarzenia');
    expect(html).toContain('class="reason-list"');
  });
});

describe('pulpit: przejścia — zero martwych linków', () => {
  const html = render(dashboardFixture());

  it('każdy kafel prowadzi do listy zawężonej tak, jak policzona jest jego liczba', () => {
    expect(html).toContain('href="/flota?zakres=claimed"');
    expect(html).toContain('href="/dni?stan=open"');
    expect(html).toContain('href="/flagi"');
    expect(html).toContain('href="/eksporty?stan=missing"');
  });

  it('przejście do rejestru zdarzeń (`A04`) jest ŻYWYM linkiem, nie blokadą z powodem', () => {
    // Do 2026-08-02 stał tu przycisk zablokowany z powodem „rejestr zdarzeń (A04)
    // jeszcze nie powstał", bo `#/zdarzenia` renderowało stronę „w budowie". Ekran
    // powstał, więc przycisk prowadzi do rejestru — i to w stanie DOMYŚLNYM, czyli
    // w tym samym porządku (`received_at` malejąco), który pokazuje karta obok.
    expect(html).toContain('href="/zdarzenia"');
    expect(html).not.toContain('jeszcze nie powstał');
  });

  it('wiersz „ostatnio przyjęte" prowadzi na kartę DNIA, do którego zdarzenie należy', () => {
    expect(html).toContain('href="/dni/sess-air"');
  });

  it('wiersz floty prowadzi na kartę otwartego dnia albo do szuflady jednostki', () => {
    expect(html).toContain('href="/dni/sess-air"');
    expect(html).toContain('href="/flota/ac-free"');
  });
});

describe('pulpit: wykres napływu', () => {
  it('dwanaście słupków, pusty ma WŁASNĄ klasę, bieżący jest wyróżniony', () => {
    const html = render(dashboardFixture());
    expect(html).toContain('class="spark"');
    expect(html).toContain('class="zero"');
    expect(html).toContain('class="now"');
    // Cisza w rejestrze ma być WIDOCZNA, a nie niewidoczna: pusty słupek ma wysokość.
    expect(html).toContain('height:4%');
  });

  it('zerowy napływ mówi, czego wykres NIE wie', () => {
    const data = dashboardFixture();
    data.inflow.buckets = new Array(12).fill(0);
    const html = render(data);
    expect(html).toContain('0 zdarzeń w 12 h');
    expect(html).toContain('nigdy dlaczego');
  });
});

describe('pulpit: „Dziś w liczbach" przyznaje się do braku', () => {
  it('komórka zrzutów pokazuje kreskę i mówi dlaczego', () => {
    // Projekcja `sessions` nie niesie `DropSummary`. Zero byłoby twierdzeniem,
    // że nikt dziś nie skakał.
    const html = render(dashboardFixture());
    expect(html).toContain('Zrzuty · skoczkowie');
    expect(html).toContain('projekcja `sessions` nie niesie takich kolumn');
  });
});
