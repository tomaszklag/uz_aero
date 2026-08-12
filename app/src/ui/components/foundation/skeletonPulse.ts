/**
 * UZ Aero — WSPÓLNY RYTM SKELETONÓW (issue #33, wzorzec `design/LOADERY.html` reguła 7).
 *
 * Jedna `Animated.Value` na całą aplikację, nie jedna na plamkę. Powód jest wizualny:
 * plamek na ekranie ładowania są dziesiątki (trzy wiersze logu to już czternaście),
 * a każda animacja startuje w chwili zamontowania komponentu. Osobne pętle rozjeżdżają
 * się o kilkadziesiąt milisekund i ekran zaczyna MIGOTAĆ, zamiast oddychać jak jedna
 * rzecz, która się ładuje. Wspólna wartość gwarantuje tę samą fazę wszystkim.
 *
 * Puls przezroczystością, nie przesuwany gradient jak `.skel` w panelu webowym
 * (`design/admin/SZABLON.html`): gradienty w React Native wymagają modułu natywnego,
 * którego projekt konsekwentnie unika (ta sama decyzja co przy mapie śladu — własny
 * renderer zamiast MapLibre). `opacity` jedzie przez `useNativeDriver` na wątku UI,
 * więc animacja nie zwalnia nawet wtedy, gdy JS jest zajęty odczytem z SQLite —
 * czyli DOKŁADNIE wtedy, kiedy skeleton jest na ekranie.
 *
 * Pętla chodzi tylko wtedy, gdy jest co animować: licznik subskrybentów zatrzymuje ją,
 * gdy z ekranu znika ostatnia plamka. Bez tego animacja kręciłaby się przez cały lot
 * pod kokpitem, w którym nie ma ani jednego skeletonu.
 */

import { useEffect } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** Pełny cykl (jasno → ciemno → jasno). Ten sam, co `@keyframes skel` w mockupie. */
export const SKELETON_CYCLE_MS = 1400;

/** Dolna granica pulsu — plamka nigdy nie gaśnie do zera, bo ma trzymać miejsce. */
export const SKELETON_OPACITY_MIN = 0.45;

/**
 * Wartość dla systemów z wyłączonymi animacjami. Stała w połowie skali: plamka nadal
 * różni się od tła i od treści, tylko przestaje się ruszać.
 */
const SKELETON_OPACITY_STILL = 0.7;

const pulse = new Animated.Value(1);

let subscribers = 0;
let loop: Animated.CompositeAnimation | null = null;
/** `null` = jeszcze nie zapytaliśmy systemu (odpowiedź jest asynchroniczna). */
let reduceMotion: boolean | null = null;

function startLoop(): void {
  if (loop != null || reduceMotion === true) return;
  pulse.setValue(1);
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: SKELETON_OPACITY_MIN,
        duration: SKELETON_CYCLE_MS / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 1,
        duration: SKELETON_CYCLE_MS / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]),
  );
  loop.start();
}

function stopLoop(): void {
  loop?.stop();
  loop = null;
}

/**
 * Podłącza komponent do wspólnego pulsu na czas jego życia i oddaje wartość
 * do wpięcia w `opacity`.
 */
export function useSkeletonPulse(): Animated.Value {
  useEffect(() => {
    subscribers += 1;

    if (reduceMotion == null) {
      // Pytamy RAZ, przy pierwszej plamce w życiu procesu. Odpowiedź przychodzi
      // asynchronicznie, więc pętla rusza od razu i zostaje zatrzymana, jeśli system
      // powie, że animacji sobie nie życzy — odwrotna kolejność kosztowałaby opóźnienie
      // startu na każdym urządzeniu, żeby obsłużyć mniejszość.
      reduceMotion = false;
      void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
        reduceMotion = enabled;
        if (enabled) {
          stopLoop();
          pulse.setValue(SKELETON_OPACITY_STILL);
        }
      });
    }

    if (subscribers === 1) startLoop();

    return () => {
      subscribers -= 1;
      if (subscribers === 0) stopLoop();
    };
  }, []);

  return pulse;
}
