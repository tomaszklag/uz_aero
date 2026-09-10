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

import type { Capability } from '../src/api/dto';
import { AppShell } from '../src/ui/shell/AppShell';
import { homeFor, HOME, NAV_ITEMS } from '../src/ui/shell/nav';
import type { ShellScope } from '../src/ui/shell/scope';

/**
 * Zdolności DWÓCH rodzajów sesji, jakie panel obsługuje od wielofirmowości: klub
 * i platforma (issue #99 C6). Kolumna boczna nie jest stałą listą, więc każdy render
 * musi powiedzieć, KTO patrzy - inaczej test opisywałby ramę, której nikt nie widzi.
 */
const CLUB: readonly Capability[] = ['panel.access', 'fleet.manage', 'accounts.manage'];
const PLATFORM: readonly Capability[] = ['platform.manage', 'bugs.triage'];

const TEMPLATE = readFileSync(
  join(__dirname, '..', '..', 'design', 'panel', 'SZABLON.html'),
  'utf8',
);

/** Kafel klubu z przełącznikiem - najbogatszy wariant, więc domyślny w renderach. */
const clubScope = (name: string, switchTo: string | null = '/klub'): ShellScope => ({
  kind: 'org',
  label: 'Klub',
  name,
  switchTo,
});

const render = (
  path: string,
  scope?: ShellScope,
  capabilities: readonly Capability[] = CLUB,
): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        who="Tomasz Małkiewicz"
        scope={scope}
        capabilities={capabilities}
        onLogout={() => undefined}
        logoutPending={false}
      >
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
    const rendered = classesOf(render(HOME, clubScope('Aeroklub Zielonogórski')));
    const unknown = [...rendered].filter((cls) => !inTemplate.has(cls));
    expect(unknown).toEqual([]);
  });

  it('rama SUPERADMINISTRATORA też stoi na klasach z szablonu (`.sidebar-context.scope`)', () => {
    const inTemplate = classesOf(TEMPLATE);
    const scope: ShellScope = {
      kind: 'platform',
      label: 'Superadministrator',
      name: 'Wszystkie kluby',
      switchTo: null,
    };
    const rendered = classesOf(render('/organizacje', scope, PLATFORM));
    expect([...rendered].filter((cls) => !inTemplate.has(cls))).toEqual([]);
  });

  it('zaznacza pozycję bieżącego modułu i tylko ją', () => {
    for (const item of NAV_ITEMS) {
      // Render z DOKŁADNIE tą zdolnością, której wymaga pozycja: inaczej moduł
      // platformowy nie miałby jak się w kolumnie pojawić.
      const html = render(item.to, undefined, [item.capability]);
      expect(html.match(/class="nav-item active"/g)).toHaveLength(1);
      expect(html).toContain(`class="nav-item active" href="${item.to}"`);
    }
  });

  /**
   * SESJA KLUBU NIE WIDZI MODUŁU PLATFORMY - ani jako pozycji, ani jako kłódki
   * (issue #99 C6). Panel 1.0 zostawiał niedostępną pozycję wyszarzoną; tutaj byłaby
   * obietnicą prawa, którego model ról nie zna, więc pozycji nie ma wcale.
   */
  it('kolumna niesie WYŁĄCZNIE moduły, na które sesja ma zdolność', () => {
    const club = render(HOME, undefined, CLUB);
    expect(club).toContain('href="/dziennik"');
    expect(club).not.toContain('href="/zgloszenia"');
    expect(club).not.toContain('locked');

    const platform = render('/zgloszenia', undefined, PLATFORM);
    expect(platform).toContain('class="nav-item active" href="/zgloszenia"');
    expect(platform).toContain('href="/organizacje"');
    for (const to of ['/dziennik', '/piloci', '/samoloty']) {
      expect(platform).not.toContain(`href="${to}"`);
    }
  });

  it('sesja bez ANI JEDNEJ zdolności dostaje pustą kolumnę, nie ramę bez adresu', () => {
    // Rola bez zdolności dziś nie istnieje, ale model jej nie zabrania: rama ma się
    // wtedy złożyć (marka musi mieć `href`), a odmowę powie serwer na trasie.
    const html = render(HOME, undefined, []);
    expect(html).toContain('class="sidebar-nav"');
    expect(html).not.toContain('class="nav-item');
    expect(html).toContain(`class="brand" href="${HOME}"`);
  });

  it('pisze inicjały zalogowanego w kółku i nazwisko obok', () => {
    const html = render(HOME);
    expect(html).toContain('class="avatar" aria-hidden="true">TM<');
    expect(html).toContain('class="who-name">Tomasz Małkiewicz<');
  });

  it('kafel klubu stoi WYŁĄCZNIE, gdy sesja zna klub', () => {
    expect(render(HOME)).not.toContain('sidebar-context');
    const withOrg = render(HOME, clubScope('Aeroklub Krakowski'));
    // Atrybuty linku nie mają gwarantowanej kolejności - sprawdzamy je osobno.
    expect(withOrg).toMatch(/<a class="sidebar-context"[^>]*href="\/klub"/);
    expect(withOrg).toContain('class="context-mark" aria-hidden="true">AK<');
    expect(withOrg).toContain('class="context-name">Aeroklub Krakowski<');
  });

  /**
   * BEZ CZEGO PRZEŁĄCZAĆ - KAFEL NIE JEST LINKIEM (issue #101, E2). `<a>` prowadzące
   * na ekran wyboru z jedną kartą wygląda jak akcja i nią nie jest, a przy okazji łapie
   * kliknięcie, które miało trafić w nazwę klubu.
   */
  it('kafel bez przełącznika jest `div`, nie linkiem - i nie ma szewronu', () => {
    const single = render(HOME, clubScope('Aeroklub Krakowski', null));
    expect(single).toContain('<div class="sidebar-context">');
    expect(single).not.toMatch(/<a class="sidebar-context"/);
    expect(single).toContain('class="context-name">Aeroklub Krakowski<');
  });

  it('marka prowadzi na PIERWSZY DOSTĘPNY ekran, nie na stały dziennik', () => {
    expect(render('/piloci')).toContain(`class="brand" href="${HOME}"`);
    // Superadministrator: `#/dziennik` odpowiedziałby jego sesji 401, więc marka
    // prowadzi tam, gdzie naprawdę może wejść - a to jest Organizacje, bo stoją
    // w `NAV_ITEMS` przed Zgłoszeniami.
    expect(render('/zgloszenia', undefined, PLATFORM)).toContain(
      `class="brand" href="${homeFor(PLATFORM)}"`,
    );
    expect(homeFor(PLATFORM)).toBe('/organizacje');
  });
});
