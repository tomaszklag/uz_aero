/**
 * UZ Aero - panel: RAMA (`AppShell`) renderuje DOKŁADNIE te klasy, które ma szablon.
 *
 * Arkusz makiet i panelu jest jeden (`panelCss.generated.test.ts`), więc rozjazd może
 * powstać już tylko w ZNACZNIKACH: klasa użyta w JSX, której szablon nie zna, dostaje
 * zero reguł i wygląda jak brak stylu - a nikt tego nie zobaczy bez zalogowania
 * do panelu z działającym serwerem. Ten test renderuje ramę do HTML w Node
 * i sprawdza każdą jej klasę wobec `design/panel/SZABLON.html`.
 *
 * `.tsx`, bo renderuje JSX; jedyny taki test w panelu - komponenty ekranów zostają
 * bez testów renderu (§8 architektury frontendu), rama jest wyjątkiem, bo stoi
 * na KAŻDYM ekranie.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppShell } from '../src/ui/shell/AppShell';
import { HOME, NAV_ITEMS } from '../src/ui/shell/nav';

const TEMPLATE = readFileSync(
  join(__dirname, '..', '..', 'design', 'panel', 'SZABLON.html'),
  'utf8',
);

const render = (path: string, org?: { name: string; switchTo: string }): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AppShell who="Tomasz Małkiewicz" org={org} onLogout={() => undefined} logoutPending={false}>
        <p>treść</p>
      </AppShell>
    </MemoryRouter>,
  );

/** Wszystkie nazwy klas z atrybutów `class="…"` w HTML. */
const classesOf = (html: string): Set<string> =>
  new Set(
    [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)).filter(Boolean),
  );

describe('AppShell - rama stylu lekkiego', () => {
  it('składa pasek górny, kolumnę boczną i treść w tej kolejności, co szablon', () => {
    const html = render(HOME);
    const order = ['class="topbar"', 'class="workspace"', 'class="sidebar"', 'class="content"', 'class="page"'];
    const positions = order.map((needle) => html.indexOf(needle));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain('<p>treść</p>');
  });

  it('każda klasa ramy istnieje w SZABLON.html - znacznik bez reguły nie ma prawa powstać', () => {
    const inTemplate = classesOf(TEMPLATE);
    const rendered = classesOf(render(HOME, { name: 'Aeroklub Zielonogórski', switchTo: '/klub' }));
    const unknown = [...rendered].filter((cls) => !inTemplate.has(cls));
    expect(unknown).toEqual([]);
  });

  it('zaznacza pozycję bieżącego modułu i tylko ją', () => {
    for (const item of NAV_ITEMS) {
      const html = render(item.to);
      expect(html.match(/class="nav-item active"/g)).toHaveLength(1);
      expect(html).toContain(`class="nav-item active" href="${item.to}"`);
    }
  });

  it('pisze inicjały zalogowanego w kółku i nazwisko obok', () => {
    const html = render(HOME);
    expect(html).toContain('class="avatar" aria-hidden="true">TM<');
    expect(html).toContain('class="who-name">Tomasz Małkiewicz<');
  });

  it('kafel klubu stoi WYŁĄCZNIE, gdy sesja zna klub', () => {
    expect(render(HOME)).not.toContain('sidebar-context');
    const withOrg = render(HOME, { name: 'Aeroklub Krakowski', switchTo: '/klub' });
    // Atrybuty linku nie mają gwarantowanej kolejności - sprawdzamy je osobno.
    expect(withOrg).toMatch(/<a class="sidebar-context"[^>]*href="\/klub"/);
    expect(withOrg).toContain('class="context-mark" aria-hidden="true">AK<');
    expect(withOrg).toContain('class="context-name">Aeroklub Krakowski<');
  });

  it('marka jest linkiem na ekran startowy', () => {
    expect(render('/piloci')).toContain(`class="brand" href="${HOME}"`);
  });
});
