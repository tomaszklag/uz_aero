/**
 * UZ Aero — awaryjny zapis fixów do `gps_trace` w starcie headless.
 *
 * Działa wyłącznie, gdy proces wskrzesił się bez Reacta (usługa GPS przeżyła śmierć
 * aplikacji): bootstrap nie wstał, więc nie ma ani `TraceRecorder` z composition
 * rootu, ani store'ów. Otwieramy własne połączenie SQLite i piszemy przez TEN SAM
 * `TraceRecorder` + `ExpoSqliteAdapter.appendTrace` co ścieżka żywa — identyczny
 * kształt wiersza, więc `TraceSync` i `server/scripts/replay.ts` nie widzą różnicy
 * między trybami.
 *
 * Ślad jest materiałem badawczym, nie rejestrem: KAŻDY błąd kończy się cichym
 * odrzuceniem paczki (kontrakt `TraceRecorder`), nigdy crashem usługi.
 */

import type { GpsFix } from '../../domain';
import { SESSION_META_KEYS } from '../../application/ports';
import { TraceRecorder } from '../../application/traceRecorder';
import { defaultClock } from '../clock';
import { ExpoSqliteAdapter } from '../storage/expoSqliteAdapter';
import { routeBackgroundFixes } from './backgroundFixRouting';

interface HeadlessContext {
  storage: ExpoSqliteAdapter;
  recorder: TraceRecorder;
}

/** Leniwe, współdzielone otwarcie — jedna baza na czas życia procesu headless. */
let opening: Promise<HeadlessContext | null> | null = null;

function open(): Promise<HeadlessContext | null> {
  opening ??= (async () => {
    try {
      // Po śmierci procesu baza jest już zmigrowna (`active_session_uuid` istnieje
      // tylko w zmigrowanym schemacie) — `init()` to w praktyce WAL + busy_timeout.
      const storage = new ExpoSqliteAdapter();
      await storage.init();
      return { storage, recorder: new TraceRecorder(storage, defaultClock) };
    } catch {
      // Nieudane otwarcie nie jest ostateczne (np. chwilowa blokada pliku) —
      // następna paczka spróbuje od nowa.
      opening = null;
      return null;
    }
  })();
  return opening;
}

/** Dopisuje paczkę fixów do śladu sesji OTWARTEGO dnia; bez sesji — kosz. */
export async function appendHeadlessFixes(fixes: readonly GpsFix[]): Promise<void> {
  try {
    const ctx = await open();
    if (ctx == null) return;
    const session = await ctx.storage.getMeta(SESSION_META_KEYS.activeSessionUuid);
    const route = routeBackgroundFixes(false, session);
    if (route.kind !== 'store') return;
    for (const fix of fixes) ctx.recorder.fix(fix, route.sessionUuid);
  } catch {
    // Świadomie cicho — patrz nagłówek modułu.
  }
}

/**
 * Oddaje plik bazy aplikacji: zamyka awaryjne połączenie i czyści cache otwarcia.
 * Wołane, gdy aplikacja OŻYŁA (adapter zarejestrował sink) — od tej chwili ślad
 * pisze ścieżka żywa, a drugie połączenie do tego samego pliku groziłoby
 * unieważnieniem głównego (NPE w `prepareAsync` przy każdym zapisie zdarzeń).
 */
export async function closeHeadlessStorage(): Promise<void> {
  const pending = opening;
  opening = null;
  if (pending == null) return;
  try {
    const ctx = await pending;
    await ctx?.storage.close();
  } catch {
    // Zamknięcie jest best-effort — brak połączenia to stan docelowy.
  }
}
