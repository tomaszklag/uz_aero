/**
 * UZ Aero — panel: STATYSTYKI RENDEROWANE NAPRAWDĘ (`A10`).
 *
 * Ten sam wzorzec i ten sam powód, co `dashboardRender.test.ts`: pułapka „policzone,
 * przetestowane, NIEWIDOCZNE" złapała projekt czterokrotnie. Ekran renderujemy CAŁY —
 * prawdziwy `StatsScreen`, prawdziwy `useStats`, cache TanStacka wypełniony
 * odpowiedzią serwera — więc test upada także wtedy, gdy ktoś przestanie wołać moduł
 * czysty z ekranu albo klasa przestanie istnieć w arkuszu.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { StatsReportDto } from '../src/api/dto';
import { keys } from '../src/queries/keys';
import { StatsScreen } from '../src/screens/stats/StatsScreen';
import { statsFixture } from './fixtures/stats';

/**
 * Render z odpowiedzią WSTRZYKNIĘTĄ do cache'u pod kluczem, który zbuduje ekran
 * z adresu — droga `URL → filtr → klucz → cache → moduły czyste → DOM` w całości.
 */
function render(data: StatsReportDto | null, url = '/statystyki'): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  if (data != null) {
    const params = new URLSearchParams(url.split('?')[1] ?? '');
    const from = params.get('od');
    const to = params.get('do');
    client.setQueryData(
      keys.stats.report({
        ...(from == null ? {} : { from }),
        ...(to == null ? {} : { to }),
      }),
      data,
    );
  }

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: [url] }, createElement(StatsScreen)),
    ),
  );
}

const statsCss = (): string =>
  readFileSync(join(__dirname, '..', 'src', 'styles', 'components', 'stats.css'), 'utf8');

const SZABLON = (): string =>
  readFileSync(join(__dirname, '..', '..', 'design', 'admin', 'SZABLON.html'), 'utf8');

describe('statystyki: render — kontrola samego testu', () => {
  it('renderer faktycznie produkuje ekran, a nie pusty napis', () => {
    const html = render(statsFixture());
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('STATYSTYKI FLOTY I PILOTÓW');
    expect(html).toContain('class="tiles"');
  });
});

describe('statystyki: liczby serwera docierają do DOM-u', () => {
  const html = render(statsFixture());

  it('kafle niosą sumy mockupu w jego formatach', () => {
    expect(html).toContain('186:39');
    expect(html).toContain('133:45');
    expect(html).toContain('21 436');
    expect(html).toContain('71,7 % nalotu blokowego');
    expect(html).toContain('rozjazd 0.35 h');
    expect(html).toContain('3 samoloty · 5 pilotów · 30 dni kalendarzowych.');
  });

  it('podtytuł mówi o SESJACH otwartych POZA zakresem', () => {
    // Jednostką jest sesja (przejęcie → zdanie), nie „dzień lotny" — po §3.6a jedna
    // maszyna bierze w dobie dwie zmiany, a jeden pilot potrafi objąć dwie maszyny.
    expect(html).toContain('2 sesje są celowo poza zakresem');
  });

  it('wykres: polyline, kropki dni zerowych i podpisy osi', () => {
    expect(html).toContain('class="trend"');
    expect(html).toContain('class="trend-axis"');
    expect(html).toContain('<polyline');
    expect(html).toContain('max 10.2 h · 27 JUL');
    expect(html).toContain('suma 186:39');
    expect(html).toContain('4 dni bez nalotu (05 JUL, 11 JUL, 18 JUL, 26 JUL)');
  });

  it('para pasków i miernik wykorzystania — z klasami z szablonu', () => {
    expect(html).toContain('class="duo"');
    expect(html).toContain('class="duo-bar green"');
    expect(html).toContain('class="duo-bar blue"');
    expect(html).toContain('class="meter-fill"');
    // 46.7 % wykorzystania SP-XYZ — poniżej połowy zakresu, więc bursztyn.
    expect(html).toContain('class="meter-fill amber"');
    expect(html).toContain('21 · 70 %');
  });

  it('tabela per samolot: odczyty w formacie licznika i wiersz RAZEM z tonami', () => {
    expect(html).toContain('3795.4 → 3907.8');
    expect(html).toContain('617:24 → 645:06');
    expect(html).toContain('licznik hh:mm');
    expect(html).toContain('class="row-total"');
    expect(html).toContain('cell-green');
    expect(html).toContain('186.3 h');
    // Średnia ze średnich nie jest średnią — hint stoi pod tabelą.
    expect(html).toContain('nie sumuje się do wiersza RAZEM');
  });

  it('strona przychodowa: kafle, wstęga typów i tabela klientów', () => {
    expect(html).toContain('Strona przychodowa · zrzuty');
    expect(html).toContain('operacja SKOKI');
    expect(html).toContain('class="ribbon"');
    expect(html).toContain('class="ribbon-seg blue"');
    expect(html).toContain('TANDEM 421');
    expect(html).toContain('SKY CAMP');
    expect(html).toContain('12 840');
    expect(html).toContain('7 bez wysokości nie wchodzi do średniej');
  });
});

describe('statystyki: ujęcia przełącza URL, nie stan komponentu', () => {
  it('domyślnie per samolot — kolumny mockupu', () => {
    const html = render(statsFixture());
    expect(html).toContain('MH start → koniec');
    expect(html).not.toContain('Blok jako PIC');
  });

  it('?ujecie=pilot pokazuje tabelę pilotów i wyjaśnia brak kolumny Duala', () => {
    const html = render(statsFixture(), '/statystyki?ujecie=pilot');
    expect(html).toContain('Blok jako PIC');
    expect(html).toContain('Anna Wrzosek');
    expect(html).toContain('Blok jako Dual');
    expect(html).toContain('ostatniego duala dnia');
    expect(html).not.toContain('MH start → koniec');
  });

  it('?ujecie=operacja pokazuje udział w nalocie z paskiem', () => {
    const html = render(statsFixture(), '/statystyki?ujecie=operacja');
    expect(html).toContain('Udział w nalocie');
    expect(html).toContain('class="share-fill blue"');
    expect(html).toContain('60.3 %');
    expect(html).toContain('SKOKI');
  });
});

describe('statystyki: `null` to „nie wiemy", nigdy zero — aż do DOM-u', () => {
  it('bez odpowiedzi wszystkie kafle mówią „—"', () => {
    const html = render(null);
    expect(html).toContain('Nie wiadomo — raport się nie pobrał.');
    expect(html).not.toContain('class="tile-val green">0');
    expect(html.split('—').length - 1).toBeGreaterThanOrEqual(6);
  });

  it('wiersze sprzed kolumn statystyk: baner, kreski w kaflach i pusta sekcja zrzutów', () => {
    const data = statsFixture();
    data.totals.staleRows = 3;
    data.totals.takeoffs = null;
    data.totals.landings = null;
    data.totals.fuelConsumedL = null;
    data.totals.mhDeltaH = null;
    data.totals.mhVsBlockH = null;
    data.drops.staleRows = 2;
    data.drops.lifts = null;
    data.drops.jumpers = null;
    data.drops.avgAltitudeFt = null;
    data.drops.clients = [];

    const html = render(data);
    expect(html).toContain('sprzed kolumn statystyk');
    expect(html).toContain('Konserwacja');
    expect(html).toContain('twierdziłyby, że nikt nie skakał');
    // Sekcja zrzutów bez wstęgi i bez tabeli klientów — częściowa wyglądałaby na pełną.
    expect(html).not.toContain('class="ribbon"');
    expect(html).not.toContain('SKY CAMP');
    // Stare kolumny projekcji dalej są liczbami.
    expect(html).toContain('186:39');
  });
});

describe('statystyki: każda wypisana klasa MA regułę w arkuszu i w SZABLONIE', () => {
  const CLASSES = [
    '.trend',
    '.trend-axis',
    '.duo',
    '.duo-name',
    '.duo-bars',
    '.duo-line',
    '.duo-bar.green',
    '.duo-bar.blue',
    '.duo-val.green',
    '.meter',
    '.meter-track',
    '.meter-fill.amber',
    '.meter-val',
    '.share',
    '.share-track',
    '.share-fill.blue',
    '.share-val',
    '.ribbon',
    '.ribbon-seg.blue',
    '.ribbon-seg.green',
    '.ribbon-seg.amber',
    '.row-total td',
    '.cell-green',
    '.cell-blue',
    '.cell-amber',
    '.filters-sep',
    '.filters-end',
    '.table-hint',
  ];

  it('arkusz panelu definiuje komplet klas statystyk', () => {
    const css = statsCss();
    // Kontrola: gdyby ścieżka przestała wskazywać arkusz, reszta przeszłaby na pustce.
    expect(css).toContain('.trend {');
    for (const selector of CLASSES) expect(css).toContain(selector);
  });

  it('nazwy są DOSŁOWNIE te z `SZABLON.html` — mockup wygrywa', () => {
    const szablon = SZABLON();
    for (const selector of CLASSES) expect(szablon).toContain(selector);
  });
});
