/**
 * UZ Aero — panel: KOPERTY ODPOWIEDZI `/admin/api/*` jako własne typy.
 *
 * Dlaczego własne, a nie importowane z serwera (`docs/architektura-panelu-frontend.md`
 * §5.2): `server/` to workspace z `type: module`, rozszerzeniami `.ts` w importach,
 * typami Fastify i `pg`. Import stamtąd wciągnąłby typy Node'a do bundla przeglądarki
 * i przywiązałby panel do wewnętrznego podziału warstw serwera. **Nigdy nie importujemy
 * z `server/src`** — a kształty odpowiedzi po stronie serwera przybijają jego własne
 * testy tras (PGlite + `app.inject`).
 *
 * Byty domenowe biorzemy jako TYPY z `@uzaero/domain` (`import type`, nigdy wartości).
 * Tutaj mieszkają wyłącznie koperty HTTP — czyli to, co jest prezentacją przez
 * konkretną trasę i zmienia się razem z nią.
 */

/**
 * Role kont. LUSTRO `server/src/domain/roles.ts` — świadome, opisane i tymczasowe.
 *
 * Rekomendacją `docs/architektura-panelu-frontend.md` §11 pkt 6 jest przeniesienie
 * `roles.ts` do `@uzaero/domain`, żeby panel dostał TYP zamiast kopii. To DECYZJA
 * CZŁOWIEKA, jeszcze niepodjęta, więc panel realizuje wariant minimalny: serwer
 * przysyła listę zdolności, panel porównuje ją z nazwami, a lista mieszka tutaj —
 * w jednym pliku, na granicy HTTP, gdzie każdy jej widzi.
 *
 * Czego ta kopia NIE robi: nie decyduje o niczym. Mapa rola → zdolności jest wyłącznie
 * na serwerze i wyłącznie on ją egzekwuje. Tu są nazwy do porównania, nie uprawnienia.
 */
export type PilotRole = 'pilot' | 'training_lead' | 'admin';

export type Capability =
  | 'panel.access'
  | 'flags.resolve'
  | 'events.correct'
  | 'accounts.manage'
  | 'fleet.manage'
  | 'thresholds.manage'
  | 'audit.read';

/** Konto zalogowane w panelu — stopka sidebara i decyzje o widoczności pozycji. */
export interface PanelPilotDto {
  id: string;
  code: string;
  name: string;
  role: PilotRole;
}

/**
 * Odpowiedź `POST /admin/api/auth/login` i `GET /admin/api/me` — TEN SAM kształt.
 *
 * Token NIE JEST tu wymieniony i nie może być: sesja jedzie ciasteczkiem `HttpOnly`,
 * którego JavaScript panelu nie widzi. To nie jest niedopatrzenie kontraktu, tylko
 * jego treść — panel nigdy nie trzyma poświadczenia.
 */
export interface PanelSessionDto {
  pilot: PanelPilotDto;
  capabilities: Capability[];
}

/** Ciało odmowy z tras panelu — `error` zawsze, reszta zależnie od powodu. */
export interface ApiErrorDto {
  error: string;
  /** 403 z bramy zdolności: KTÓREJ zdolności zabrakło (panel ma podać powód). */
  required?: Capability;
}
