/**
 * UZ Aero — panel: KAFLE nad dziennikiem audytu (moduł CZYSTY).
 *
 * Kafle z mockupu `A09` odpowiadają na pytania, których lista nie zadaje: ile się dziś
 * wydarzyło i jak często ktoś sięga do rejestru. **Żadnej z tych liczb panel nie liczy
 * sam** — każda jest osobnym zapytaniem do serwera z podmienionym zakresem
 * (`total` przy `limit=1`), dokładnie jak kafle listy dni. Policzenie ich z pobranej
 * strony dałoby liczbę, której serwer nigdy nie wysłał, i fałszywą przy każdym
 * obcięciu kursorem.
 *
 * ══ KAFEL, KTÓREGO TU NIE MA ══
 * Mockup pokazuje „Nieudane logowania · 7 dni". **Tej liczby nie da się policzyć i nie
 * wolno jej udawać**: wiersz `admin_audit` powstaje wyłącznie przez `AuditedWrite`,
 * w tej samej transakcji co SKUTEK, a nieudane logowanie skutku nie ma — nie ma nawet
 * aktora (`actor_pilot_id NOT NULL`). To świadoma granica dziennika, opisana na ekranie
 * banerem, a nie brak do nadrobienia w tym pliku.
 */

import type { AdminAction } from '../../api/dto';
import type { AuditListQuery } from '../../api/audit';
import { auditListQuery, type AudytFilter } from './audytFilters';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ile dni wstecz obejmuje kafel korekt — miesiąc, czyli typowy rytm przeglądu klubu. */
export const CORRECTIONS_WINDOW_DAYS = 30;

/** Epoka → dzień UTC `YYYY-MM-DD`, czyli format, którego oczekuje trasa. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Akcje liczone jako „ruszanie rejestru" — dziś dokładnie jedna, i to celowo. */
const REGISTRY_ACTIONS: AdminAction[] = ['event.correct'];

/**
 * Zapytania kafli. Każde jest tym samym filtrem co lista, z podmienionym JEDNYM
 * wymiarem — żeby kafel mówił o tym samym wycinku, na który patrzy człowiek.
 * `limit: 1`, bo trasa wymaga liczby dodatniej, a liczy się wyłącznie `total`.
 */
export interface AuditTileQueries {
  /** Wpisy z dzisiejszej doby UTC, przy zachowanym pozostałym zawężeniu. */
  today: AuditListQuery;
  /** Korekty rejestru z ostatnich 30 dni — zakres i akcja podmienione. */
  corrections: AuditListQuery;
}

export function tileQueries(filter: AudytFilter, nowMs: number): AuditTileQueries {
  const today = utcDay(nowMs);

  return {
    today: { ...auditListQuery({ ...filter, from: today, to: today }), limit: 1 },
    corrections: {
      ...auditListQuery({
        ...filter,
        scope: null,
        from: utcDay(nowMs - CORRECTIONS_WINDOW_DAYS * DAY_MS),
        to: null,
      }),
      action: REGISTRY_ACTIONS,
      limit: 1,
    },
  };
}

export interface AuditTile {
  label: string;
  value: string | number;
  tone?: 'green' | 'amber' | 'blue';
  note: string;
}

/**
 * Kafle jako gotowe napisy. BRAK LICZBY daje „—”, nigdy zera: zero jest twierdzeniem
 * o świecie, a brak odpowiedzi nim nie jest.
 *
 * Braku są dwa rodzaje i oba znaczą tu to samo: `undefined` — zapytanie w drodze albo
 * zakończone błędem; `null` — serwer świadomie nie policzył (licznik jedzie wyłącznie
 * z pierwszej strony kursora). Dlatego wszystkie trzy liczby przyjmują oba warianty:
 * gdyby przyjmowały tylko `undefined`, wołający musiałby po drodze zamieniać `null`
 * na coś innego — a najbliższą pokusą jest zero.
 */
export function auditTiles(
  total: number | null | undefined,
  today: number | null | undefined,
  corrections: number | null | undefined,
  narrowed: boolean,
): AuditTile[] {
  return [
    {
      label: 'Wpisy w zawężeniu',
      value: total ?? '—',
      note: narrowed
        ? 'Tyle wpisów spełnia filtr z adresu — liczba z serwera, nie z pobranych stron.'
        : 'Wszystkie akcje panelu, od pierwszej. Dziennik nie ma daty ważności.',
    },
    {
      label: 'Wpisy dziś · UTC',
      value: today ?? '—',
      tone: today == null || today === 0 ? undefined : 'blue',
      note: 'Doba UTC, nie lokalna — i przy zachowanym pozostałym zawężeniu z paska filtrów.',
    },
    {
      label: `Korekty rejestru · ${CORRECTIONS_WINDOW_DAYS} dni`,
      value: corrections ?? '—',
      tone: corrections == null || corrections === 0 ? undefined : 'amber',
      note: 'Dopisania `event_correction` po oknie 24 h. Wyłącznie administrator; zakres i akcja liczone niezależnie od chipa akcji.',
    },
    {
      label: 'Retencja',
      value: '∞',
      tone: 'green',
      note: 'Bez limitu i bez czyszczenia. W kodzie nie ma `UPDATE` ani `DELETE` na tej tabeli — pilnuje tego test architektury serwera.',
    },
  ];
}
