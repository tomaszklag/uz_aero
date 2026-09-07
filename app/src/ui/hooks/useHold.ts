/**
 * UZ Aero - mechanika gestu przytrzymania (issue #67).
 *
 * Do issue #67 przytrzymanie żyło w całości wewnątrz `ActionButton` i miało jednego
 * konsumenta (START ENGINE). Odkąd wymagają go także przyciski paska akcji kokpitu
 * (`CockpitActions`: zapis ręczny i STOP), mechanika mieszka w hooku - druga kopia
 * timera i animacji rozjechałaby się przy pierwszej poprawce jednej z nich
 * (ta sama zasada, przez którą pięć kopii kontrolki czasu zamieniło się
 * w `TimeStepper`, issue #43).
 *
 * Semantyka (przeniesiona 1:1 z `ActionButton`):
 *  • `holdMs > 0`: naciśnięcie startuje pasek postępu i timer; puszczenie przed
 *    czasem cofa pasek i NIC nie zapisuje; po upływie czasu odpala się `onTrigger`.
 *  • `holdMs <= 0`: zwykłe tapnięcie (onPress) - hook oddaje właściwy zestaw
 *    handlerów, więc konsument nie składa warunków sam.
 *  • odmontowanie w trakcie przytrzymania czyści timer - bez tego `onTrigger`
 *    odpaliłby się na nieistniejącym ekranie.
 *
 * Feedbackiem gestu jest pasek postępu rysowany przez konsumenta z `progress`
 * (interpolacja 0→1 na szerokość) - hook nie renderuje nic, bo geometria paska
 * należy do przycisku.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

export interface HoldPressProps {
  onPressIn?: () => void;
  onPressOut?: () => void;
  onPress?: () => void;
}

export interface HoldGesture {
  /** Trwa przytrzymanie - konsument pokazuje wtedy pasek postępu. */
  holding: boolean;
  /** 0→1 przez `holdMs`; po puszczeniu wraca do 0 (120 ms). */
  progress: Animated.Value;
  /** Handlery do rozsmarowania na `Pressable` - zestaw zależny od `holdMs`. */
  pressProps: HoldPressProps;
}

export function useHold(input: {
  holdMs: number;
  disabled?: boolean;
  onTrigger: () => void;
}): HoldGesture {
  const { holdMs, disabled = false, onTrigger } = input;

  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 120, useNativeDriver: false }).start();
  }, [progress]);

  useEffect(() => () => cancelHold(), [cancelHold]);

  const startHold = useCallback(() => {
    if (disabled) return;
    if (holdMs <= 0) {
      onTrigger();
      return;
    }
    setHolding(true);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      useNativeDriver: false,
    }).start();
    timer.current = setTimeout(() => {
      cancelHold();
      onTrigger();
    }, holdMs);
  }, [cancelHold, disabled, holdMs, onTrigger, progress]);

  return {
    holding,
    progress,
    pressProps:
      holdMs > 0
        ? { onPressIn: startHold, onPressOut: cancelHold }
        : { onPress: startHold },
  };
}
