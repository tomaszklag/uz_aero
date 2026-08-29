/**
 * UZ Aero - task lokalizacji usługi pierwszoplanowej (`expo-task-manager`).
 *
 * `defineTask` MUSI wykonać się na poziomie modułu: w starcie headless (Android
 * wskrzesza proces po jego śmierci, bo usługa ma `killServiceOnDestroy: false`)
 * ładuje się bundle i kod modułów, ale React ani bootstrap aplikacji już NIE.
 * Dlatego moduł jest importowany z `app/index.ts` przed `registerRootComponent`
 * (pilnuje tego test architektury).
 *
 * JEDYNY importer `expo-task-manager` (exact-list w teście architektury liczy też
 * `require`). Celowo bez importu `expo-location` - kształt odczytu opisuje
 * strukturalny `RawLocation`.
 */

import { AppState } from 'react-native';

import type { GpsFix } from '../../domain';
import { routeBackgroundFixes } from './backgroundFixRouting';
import { appendHeadlessFixes, closeHeadlessStorage } from './headlessTraceWriter';
import { locationToFix, type RawLocation } from './locationToFix';

/**
 * Nazwa jest trwałym kontraktem z SYSTEMEM - Android trzyma zarejestrowany task
 * pod tą nazwą także po aktualizacji aplikacji. Zmiana nazwy osierociłaby usługę.
 */
export const BACKGROUND_LOCATION_TASK = 'uzaero-location';

export type BackgroundFixSink = (fixes: readonly GpsFix[]) => void;

/** Żywy odbiorca - adapter GPS działającej aplikacji. Null = jesteśmy headless. */
let sink: BackgroundFixSink | null = null;

export function setBackgroundFixSink(next: BackgroundFixSink): void {
  sink = next;
  // Aplikacja ożyła - writer headless oddaje plik bazy (dwa żywe połączenia do
  // tego samego pliku potrafią unieważnić główne; patrz `closeHeadlessStorage`).
  void closeHeadlessStorage();
}

try {
  // MIĘKKI require zamiast importu na górze (wzorzec `useSystemBackground` w App.tsx):
  // `expo-task-manager` robi twardy `requireNativeModule` w chwili ładowania, więc
  // zwykły import wywracałby CAŁĄ aplikację na starym dev clencie i w środowiskach
  // bez modułu (Expo Go na Androidzie nie wspiera lokalizacji w tle). Brak taska
  // nie może odbierać pilotowi zwykłego nasłuchu - degradację dopina fallback
  // w `expoLocationAdapter.armService`.
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');

  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    // Task nie ma prawa rzucić - wyjątek w callbacku to crash procesu usługi.
    // Błąd platformy zostawiamy bez śladu (konwencja śladu: materiał badawczy,
    // nie rejestr; fire-and-forget jak w `TraceRecorder`).
    if (error != null || data == null) return;
    const locations = (data as { locations?: RawLocation[] }).locations ?? [];
    if (locations.length === 0) return;

    const fixes = locations.map(locationToFix);
    const live = sink;
    const route = routeBackgroundFixes(live != null, null);
    if (route.kind === 'sink' && live != null) {
      // Aplikacja żyje: adapter rozprowadzi fixy fanoutem (detekcja, kokpit, 13, ślad).
      live(fixes);
      return;
    }
    if (AppState.currentState === 'active') {
      // Brak sinka, ale aplikacja jest NA EKRANIE - to okno startu/reloadu (bundle już
      // się wykonuje, React i adapter jeszcze nie wstały), nie prawdziwy headless.
      // Otwarcie tu drugiego połączenia SQLite unieważniało główne połączenie
      // bootstrapu (NPE w `prepareAsync` przy każdym zapisie zdarzeń). Paczka idzie
      // do kosza - za chwilę sink wstanie i przejmie strumień bez dziury.
      return;
    }
    // Proces wskrzeszony headless: prosto do `gps_trace` (sesję ustali writer z meta).
    await appendHeadlessFixes(fixes);
  });
} catch {
  // Stary dev client / brak modułu natywnego: trybu tła nie ma, aplikacja startuje
  // normalnie, GPS działa zwykłym nasłuchem przy włączonym ekranie.
}
