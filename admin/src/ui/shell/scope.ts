/**
 * UZ Aero - panel: kontekst sesji w kolumnie bocznej i to, czy da się go zmienić
 * (mockupy `SZABLON` - `.sidebar-context`, `organizacje-lista` - `.sidebar-context.scope`;
 * issue #101, E2).
 *
 * Moduł CZYSTY (bez Reacta), bo to jest decyzja o TREŚCI kafla, a nie o jego układzie -
 * i dlatego ma test obok. `AppShell` rysuje z tego kafel i nie rozstrzyga niczego sam.
 *
 * ══ KAFEL STOI ZAWSZE, PRZEŁĄCZNIK - NIE ══
 * Nazwa klubu odpowiada na pytanie „czyj to dziennik" przy każdym wklejonym linku, więc
 * kafel jest także przy jednym członkostwie. Strzałka przełącznika pojawia się dopiero
 * wtedy, gdy jest DOKĄD przełączyć: link prowadzący na ekran wyboru z jedną kartą
 * obiecuje wybór, którego nie ma (ta sama reguła, przez którą nie rysujemy wyszarzonych
 * przycisków - `docs/panel-2.0.md`).
 *
 * ══ PLATFORMA JEST ZAKRESEM, NIE KLUBEM ══
 * Superadministrator z członkostwem `admin` gdzieś w klubie ma DWA zakresy i przełącza
 * się między nimi tak samo. Dlatego liczymy zakresy, a nie kluby.
 */

import type { PanelSessionDto } from '../../api/dto';

export interface ShellScope {
  /** `platform` = rama superadministratora (kafel `.sidebar-context.scope`). */
  kind: 'org' | 'platform';
  /** Napis nad nazwą - „Klub" albo „Superadministrator". */
  label: string;
  /** Nazwa klubu albo zakresu. */
  name: string;
  /** Dokąd prowadzi kafel; `null` = nie ma dokąd, więc kafel nie jest linkiem. */
  switchTo: string | null;
}

/** Adres ekranu wyboru zakresu - drugi krok logowania, nie osobne miejsce. */
export const SCOPE_PICK = '/klub';

/** Ile zakresów ma ta sesja: kluby z rolą panelu + ewentualna platforma. */
export function scopeCount(session: PanelSessionDto | null): number {
  if (session == null) return 0;
  return session.scopes.clubs.length + (session.scopes.platform ? 1 : 0);
}

export function shellScope(session: PanelSessionDto | null): ShellScope | null {
  if (session == null) return null;
  const switchTo = scopeCount(session) > 1 ? SCOPE_PICK : null;

  if (session.org == null) {
    // Sesja platformowa nie ma klubu i nie ma go z czego wziąć - nazwa jest nazwą
    // ZAKRESU. „Wszystkie kluby" jest zdaniem prawdziwym: moduł Organizacje widzi
    // każdy klub na serwerze, choć wyłącznie w liczbach (`docs/wielofirmowosc.md` §3.3).
    return { kind: 'platform', label: 'Superadministrator', name: 'Wszystkie kluby', switchTo };
  }

  return { kind: 'org', label: 'Klub', name: session.org.name, switchTo };
}
