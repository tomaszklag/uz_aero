/**
 * Ninerdeck - testy DOLNEGO PASKA (3.0.0, epik R-E).
 *
 * Pod obserwacją jest niezmiennik, którego złamanie nie wywoła żadnego błędu, tylko po
 * cichu zmieni produkt: **kokpit jest stanem modalnym** (CLAUDE.md, issue #82). Dopóki
 * pilot trzyma samolot, z 04/05 nie prowadzi żadna droga bokiem - a dopisanie zakładki
 * „Kokpit" albo „Ustawienia" do `TABS` to jedna linijka, która wygląda niewinnie.
 *
 * Drugi sprawdzian dotyczy ekranu startowego: pierwsza pozycja paska jest tym, co pilot
 * widzi po odblokowaniu aplikacji, więc przestawienie kolejności jest decyzją produktową,
 * a nie porządkami.
 */

import { FLOW_ROUTES, TABS } from '../ui/navigation/tabs';
import { resumeTarget } from '../ui/navigation/resumeTarget';
import { emptySessionState } from '../domain';

describe('dolny pasek zakładek', () => {
  it('ma DOKŁADNIE trzy pozycje, w kolejności Pulpit · Kalendarz · Historia', () => {
    // Trzy i ani jednej więcej: każda odpowiada na inne pytanie w czasie - co mam dziś,
    // co jest zaplanowane, co już poleciałem. Czwarta znaczyłaby, że któreś z tych pytań
    // przestało wystarczać, a to jest decyzja, nie dopisek.
    expect(TABS.map((t) => t.label)).toEqual(['Pulpit', 'Kalendarz', 'Historia']);
  });

  it('PIERWSZA pozycja jest ekranem startowym i jest nią Pulpit', () => {
    expect(TABS[0]!.name).toBe('Dashboard');
    // Wznowienie bez trzymanej maszyny prowadzi do zakładek, czyli do tej pierwszej.
    expect(resumeTarget(null)).toBe('Tabs');
    expect(resumeTarget(emptySessionState())).toBe('Tabs');
  });

  it('KOKPIT NIE MA ZAKŁADKI - i żaden inny ekran flow lotu też nie', () => {
    const naPasku = new Set<string>(TABS.map((t) => t.name));
    for (const route of FLOW_ROUTES) {
      expect(naPasku.has(route)).toBe(false);
    }
  });

  it('pilot trzymający samolot wraca do KOKPITU, z pominięciem zakładek', () => {
    const trzyma = {
      ...emptySessionState(),
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
    };
    // Restart w środku dnia lotnego nie może kosztować ani jednego tapnięcia w drodze
    // do STOP ENGINE - a pasek zakładek byłby dokładnie takim tapnięciem.
    expect(resumeTarget(trzyma)).toBe('Cockpit');
  });

  it('każda pozycja ma ikonę podaną NAZWĄ ZNACZENIOWĄ, nie glifem', () => {
    // Rejestr ikon mapuje znaczenie na glif (`components/foundation/Icon`), więc pasek
    // podaje `home`, a nie `feather:home` - podmiana biblioteki jest wtedy zmianą
    // w jednym pliku.
    for (const tab of TABS) {
      expect(tab.icon).toMatch(/^[a-z][a-z-]*$/);
    }
  });
});
