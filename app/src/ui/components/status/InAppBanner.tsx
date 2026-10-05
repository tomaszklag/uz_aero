/**
 * Ninerdeck - BANER W APLIKACJI (`.inapp` z makiety 25E; kanał klubu 4.0.0, K5;
 * epik KK-C #246).
 *
 * Wstawka NAD ekranem: u góry, pod paskiem systemowym, karta podniesiona cieniem nad
 * treść (bez niego zlewałaby się z ciemnym nagłówkiem pod spodem), a w środku TREŚĆ
 * WIERSZA SKRZYNKI (`InboxRowContent`) - baner tylko zapowiada wiersz, który stoi
 * w skrzynce. Co robi sam:
 *  - wjeżdża z góry i znika sam po `BANNER_MS` - bez dźwięku i bez „×";
 *  - przesunięcie w górę zamyka go od razu; palec na banerze wstrzymuje odliczanie,
 *    a baner puszczony bez zamknięcia wraca na miejsce i liczy od nowa;
 *  - tapnięcie otwiera rzecz (dokąd - liczy wołający) i chowa baner;
 *  - czytnik ekranu ogłasza go jako region na żywo.
 * Co pokazać i czy w ogóle - rozstrzyga `logic/inAppBanner.ts`: komponent dostaje
 * gotowy model. Nowy baner zastępuje poprzedni przez `key` u wołającego - widać ostatni,
 * a licznik przy dzwonku mówi resztę.
 */

import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BANNER_MS, type BannerVm } from '../../screens/logic/inAppBanner';
import { useTheme, type Theme } from '../../theme';
import { InboxRowContent } from '../data/InboxRow';

export interface InAppBannerProps {
  banner: BannerVm;
  /** Tapnięcie - wołający otwiera rzecz. */
  onOpen: () => void;
  /** Baner zniknął (czas, przesunięcie, tapnięcie) - wołający zdejmuje go ze stanu. */
  onDone: () => void;
}

/** Wjazd z makiety (`inapp-in`, 380 ms), wyjazd krótszy - baner schodzi z drogi. */
const ENTER_MS = 380;
const EXIT_MS = 200;
/** Skąd wjeżdża - wyżej niż jego wysokość, żeby nie mignął skrawkiem pod paskiem. */
const OFFSCREEN = -160;
/** Przesunięcie w górę, od którego puszczony baner znika zamiast wracać. */
const SWIPE_CLOSE_PX = 24;

export function InAppBanner({ banner, onOpen, onDone }: InAppBannerProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const insets = useSafeAreaInsets();

  const offset = useRef(new Animated.Value(OFFSCREEN)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef(false);
  // Gest żyje w `PanResponder` stworzonym raz, więc woła NAJŚWIEŻSZE funkcje przez ref.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const stopTimer = (): void => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
  };

  const hide = (): void => {
    if (closing.current) return;
    closing.current = true;
    stopTimer();
    Animated.parallel([
      Animated.timing(offset, { toValue: OFFSCREEN, duration: EXIT_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }),
    ]).start(({ finished }) => {
      // Przerwany wyjazd (baner zastąpiony nowym) nie zgłasza końca - zdjąłby następcę.
      if (finished) done.current();
    });
  };

  const startTimer = (): void => {
    stopTimer();
    timer.current = setTimeout(hide, BANNER_MS);
  };

  const settle = (): void => {
    Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
    startTimer();
  };

  // Wjazd i odliczanie. Zgoda systemu na ruch jest pytaniem asynchronicznym, więc baner
  // rusza po odpowiedzi - przy ograniczonym ruchu staje od razu na miejscu (makieta:
  // `prefers-reduced-motion`).
  useEffect(() => {
    let alive = true;
    const enter = (reduce: boolean): void => {
      if (!alive) return;
      const duration = reduce ? 0 : ENTER_MS;
      Animated.parallel([
        Animated.timing(offset, { toValue: 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: reduce ? 0 : EXIT_MS, useNativeDriver: true }),
      ]).start();
      startTimer();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(enter, () => enter(false));
    return () => {
      alive = false;
      stopTimer();
      offset.stopAnimation();
      opacity.stopAnimation();
    };
    // Raz na baner - nowy baner to nowy komponent (`key` u wołającego).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pan = useRef(
    PanResponder.create({
      // Pionowy ruch palca przejmuje gest od tapnięcia; poziomy zostaje ekranowi.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: stopTimer,
      onPanResponderMove: (_e, g) => offset.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -SWIPE_CLOSE_PX || g.vy < -0.5) hide();
        else settle();
      },
      onPanResponderTerminate: settle,
    }),
  ).current;

  const { row, club } = banner;
  const label = [club, row.title, row.sub, row.reason, row.when].filter((part) => part != null).join(', ');

  return (
    <Animated.View
      {...pan.panHandlers}
      accessibilityLiveRegion="polite"
      style={[s.wrap, { top: insets.top + 6, opacity, transform: [{ translateY: offset }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          onOpen();
          hide();
        }}
        style={({ pressed }) => [s.card, pressed && s.cardPressed]}
      >
        <InboxRowContent row={row} club={club} prominent />
      </Pressable>
    </Animated.View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 10, right: 10, zIndex: 95, elevation: 12 },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingTop: 11,
      paddingBottom: 11,
      paddingLeft: 11,
      paddingRight: 12,
      borderRadius: 16,
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surfaceRaised,
      // Cień w kolorze przyciemnienia arkuszy - jedna czerń dla wszystkiego, co leży
      // NAD ekranem; na Androidzie rysuje go `elevation` warstwy wyżej.
      shadowColor: t.colors.overlay,
      shadowOpacity: 1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
    },
    cardPressed: { borderColor: t.colors.textMuted },
  });
