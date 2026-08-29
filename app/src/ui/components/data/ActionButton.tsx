/**
 * UZ Aero - ActionButton
 *
 * Jeden przycisk na wszystkie akcje z mockupów, z trzema rzeczami, które w kokpicie
 * nie są ozdobnikiem:
 *
 *  1. **Przytrzymanie zamiast tapnięcia** (`holdMs`) - START/STOP ENGINE wymagają 2 s
 *     (§3.2). W wibracjach i rękawicach przypadkowe dotknięcie jest realne, a te dwie
 *     akcje wyznaczają czasy blokowe. Pasek postępu pokazuje, ile jeszcze trzymać.
 *  2. **Blokada z podanym powodem** (`disabledReason`) - zasada „nigdy cichy błąd"
 *     (§6 pkt 3). Powód renderujemy jako WIDOCZNY tekst, nie tooltip: `title` w RN
 *     nie istnieje, a pilot i tak nie ma czym najechać. Powód stoi WEWNĄTRZ przycisku,
 *     w slocie podpisu (issue #55): tekst POD przyciskiem pojawiał się i znikał razem
 *     ze stanem blokady, skacząc layoutem wszystkiego poniżej.
 *  3. **Cel dotykowy ≥ 44 px** - próg dla rękawic; wymuszony `minHeight`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { Tag } from '../status/Tag';
import { toneColors, type Tone } from '../tone';

/**
 * `solid`   - `.btn-primary` z mockupów: pełne wypełnienie akcentem, ciemny napis.
 *             Główne „dalej" formularza; jeden taki przycisk na ekran.
 * `primary` - `.start-engine`: przygaszone tło akcentu i akcentowany napis. Akcje kokpitu,
 *             gdzie pełna zieleń świeciłaby w nocy prosto w oczy.
 * `secondary` - sam kontur (Anuluj, Wstecz).
 */
export type ActionVariant = 'solid' | 'primary' | 'secondary';

/**
 * Rozmiar etykiety i celu dotykowego - z mockupów:
 *  `hero` = `.start-engine` z kokpitu: układ pionowy, okrągła ikona 56 px, napis 28 px / ls 4.
 *           Jedyna akcja na ekranie, którą trzeba trafić nie patrząc - stąd ta skala;
 *  `lg`   = `.btn-primary` (22 px / ls 3, wysokość ≥ 56) - główna akcja formularza;
 *  `md`   = `.modal-btn-*` (16 px / ls 2, wysokość ≥ 48) - para akcji w arkuszu, gdzie
 *           dwa przyciski dzielą szerokość i pełny rozmiar rozpychałby arkusz;
 *  `splash` = `.start-btn` ze splasha (01): 20 px / ls 3, gap 10 i padding 16/24 wprost
 *           z mockupu; NACIŚNIĘCIE wypełnia przycisk akcentem (`:hover` mockupu),
 *           zamiast przygaszać opacity - jedyny rozmiar z tym zachowaniem.
 *
 * Rozmiar to klasa przycisku z mockupu (kształt + zachowanie naciśnięcia), nie sama
 * liczba pikseli - dlatego pressed-fill splasha jest częścią rozmiaru, a nie osobnym
 * booleanem czy czwartym wariantem: mockup przybija go dla `.start-btn` i tylko dla
 * niego, osobny przełącznik pozwalałby na kombinacje (np. `solid` + fill) bez pokrycia
 * w designie, a wariant opisuje schemat kolorów w spoczynku - splash w spoczynku
 * JEST wariantem `primary`.
 */
export type ActionSize = 'hero' | 'lg' | 'md' | 'splash';

export interface ActionButtonProps {
  label: string;
  onPress: () => void;
  tone?: Tone;
  variant?: ActionVariant;
  size?: ActionSize;
  /** Podpis pod etykietą (np. „przytrzymaj 2 s", „zapisze odczyt MH"). */
  hint?: string;
  /**
   * Ikona przed etykietą - podawana NAZWĄ, nie gotowym elementem.
   *
   * Kolor i rozmiar ustala przycisk, bo tylko on wie, czy jest zablokowany i jakiego
   * jest wariantu. Gdy ikony przekazywały ekrany, każdy wpisywał `theme.colors.bg`
   * na sztywno - i po zablokowaniu zostawała czarna ikona na ciemnym tle, niewidoczna.
   */
  icon?: IconName;
  /** Ikona za etykietą (np. strzałka „dalej"). */
  trailingIcon?: IconName;
  /**
   * Plakietka za etykietą - krótki napis o tym, co czeka PO drugiej stronie
   * przycisku („05 SIE - można poprawić" na wejściu w historię, 01).
   *
   * Istnieje, bo bez niej ekran robił z takiego wejścia własny „przycisk-link"
   * o innym kroju i innej wysokości (issue #42). Plakietka jest INFORMACJĄ, nie
   * stanem przycisku: `null` znaczy „nie ma o czym mówić" i wtedy nie ma jej wcale.
   */
  badge?: string | null;
  /** Ton plakietki - domyślnie niebieski, czyli „informacja", nie ostrzeżenie. */
  badgeTone?: Tone;
  /** Czas przytrzymania (ms). 0 = zwykłe tapnięcie. */
  holdMs?: number;
  /**
   * Blokada - wymaga podania powodu; powód jest pokazywany WEWNĄTRZ przycisku,
   * bursztynem, w miejscu podpisu `hint` (i zamiast niego, dopóki blokada trwa).
   * Nigdy pod przyciskiem (issue #55): napis doklejany od dołu skakał layoutem
   * ekranu przy każdej zmianie stanu.
   */
  disabledReason?: string | null;
  /**
   * Blokada BEZ powodu - dla stanów, które widać (uwaga z urządzenia, 2026-08-14).
   *
   * Reguła „nigdy blokada bez powodu" (§6 pkt 3) powstała przeciw wyszarzonym
   * przyciskom, po których nie wiadomo, czego brakuje. Nie każdy taki stan jest jednak
   * zagadką: w arkuszu korekty otwartym na wartości pierwotnej „ZAPISZ" jest nieaktywny,
   * bo NIC SIĘ JESZCZE NIE ZMIENIŁO - a to widać w kontrolce nad nim. Zdanie „zmień czas
   * albo użyj akcji poniżej" opisywało tam oczywistość.
   *
   * Nowego użycia nie dokładaj bez tego rachunku: jeśli powodu blokady nie widać
   * z ekranu, właściwym polem jest `disabledReason`.
   */
  disabled?: boolean;
  /** Zajętość (trwa zapis) - blokuje bez komunikatu o błędzie. */
  busy?: boolean;
  style?: ViewStyle;
}

export function ActionButton({
  label,
  onPress,
  tone = 'green',
  variant = 'primary',
  size = 'lg',
  hint,
  icon,
  trailingIcon,
  badge = null,
  badgeTone = 'blue',
  holdMs = 0,
  disabledReason = null,
  disabled: disabledProp = false,
  busy = false,
  style,
}: ActionButtonProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const disabled = disabledReason != null || disabledProp || busy;

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
      onPress();
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
      onPress();
    }, holdMs);
  }, [cancelHold, disabled, holdMs, onPress, progress]);

  const solid = variant === 'solid';
  const hero = size === 'hero';
  const splash = size === 'splash';
  // Pressed-fill `.start-btn:hover` (01) - opt-in przez rozmiar `splash` i tylko przy
  // tapnięciu: z przytrzymaniem (holdMs > 0) feedbackiem jest pasek postępu, którego
  // pełne wypełnienie by nie pokazało. Pozostałe rozmiary: pressed = opacity 0.7.
  const fillsOnPress = splash && holdMs === 0;
  const background = disabled
    ? theme.colors.surfaceHover
    : solid
      ? c.accent
      : variant === 'primary'
        ? c.muted
        : 'transparent';
  const labelColor = disabled
    ? theme.colors.textMuted
    : solid
      ? theme.colors.bg // ciemny napis na pełnym akcencie - kontrast w każdym motywie
      : c.accent;

  return (
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityHint={holdMs > 0 ? `Przytrzymaj ${Math.round(holdMs / 1000)} sekundy` : undefined}
        disabled={disabled}
        onPressIn={holdMs > 0 ? startHold : undefined}
        onPressOut={holdMs > 0 ? cancelHold : undefined}
        onPress={holdMs > 0 ? undefined : startHold}
        style={({ pressed }) => {
          const filled = fillsOnPress && pressed && !disabled;
          return [
            styles.button,
            {
              // Każdy wariant zostaje powyżej progu 44 px dla rękawic.
              minHeight: hero ? 132 : size === 'md' ? 48 : 56,
              gap: hero ? theme.spacing.sm : theme.spacing.xs,
              // `.start-btn` przybija padding 16/24 - szerszy niż standardowe 16.
              paddingHorizontal: splash ? theme.spacing.xxl : theme.spacing.lg,
              paddingVertical: hero
                ? 22
                : splash
                  ? theme.spacing.lg
                  : size === 'lg'
                    ? theme.spacing.md
                    : theme.spacing.sm,
              borderRadius: hero ? 20 : size === 'md' ? theme.radius.md : theme.radius.lg,
              borderWidth: theme.borderWidth,
              borderColor: disabled ? theme.colors.border : solid || filled ? c.accent : c.border,
              backgroundColor: filled ? c.accent : background,
              // Przycisk z powodem blokady NIE dostaje przygaszenia: powód ma być
              // czytelny, a bursztyn pod opacity 0.45 przestaje być ostrzeżeniem.
              // Wyszarzenie niosą już kolory (surfaceHover + textMuted).
              opacity:
                disabled && disabledReason == null
                  ? 0.45
                  : pressed && !disabled && holdMs === 0 && !fillsOnPress
                    ? 0.7
                    : 1,
            },
          ];
        }}
      >
        {({ pressed }) => {
          const filled = fillsOnPress && pressed && !disabled;
          // Na pełnym wypełnieniu akcentem treść musi pociemnieć - jak w `solid`.
          const contentColor = filled ? theme.colors.bg : labelColor;
          return (
            <>
              {/* Pasek postępu przytrzymania - wypełnia przycisk od lewej. */}
              {holding && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: c.muted,
                      width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    },
                  ]}
                />
              )}

              {/* `hero`: okrągła plakietka z ikoną nad napisem - cel, w który trzeba trafić,
                  nie patrząc na ekran. */}
              {hero && icon != null && (
                <View
                  style={[
                    styles.heroIcon,
                    { backgroundColor: disabled ? theme.colors.surfaceHover : c.accent },
                  ]}
                >
                  <Icon
                    name={icon}
                    size={24}
                    // Na wypełnionej plakietce napis musi być ciemny, na przygaszonej - muted.
                    color={disabled ? theme.colors.textMuted : theme.colors.bg}
                  />
                </View>
              )}

              <View style={[styles.row, splash && styles.splashRow]}>
                {!hero && icon != null && (
                  <Icon name={icon} size={size === 'md' ? 16 : 18} color={contentColor} />
                )}
                <AppText
                  variant={size === 'md' ? 'buttonSmall' : 'button'}
                  style={[hero ? styles.heroLabel : splash ? styles.splashLabel : null, { color: contentColor }]}
                >
                  {label}
                </AppText>
                {trailingIcon != null && (
                  <Icon name={trailingIcon} size={size === 'md' ? 16 : 18} color={contentColor} />
                )}
                {/* Plakietka na końcu rzędu - przycisk zostaje przyciskiem, a napis
                    o tym, co go czeka, nie wymaga własnego kształtu obok. */}
                {badge != null && <Tag label={badge} tone={badgeTone} />}
              </View>

              {/* Powód blokady zajmuje slot podpisu i WYGRYWA z nim: dopóki blokada
                  trwa, odpowiedzią na „czemu nie działa" jest powód, nie opis skutku
                  (§6 pkt 3 + issue #55 - nigdy tekst pod przyciskiem). */}
              {disabledReason != null ? (
                <AppText variant="mono" style={[styles.hint, { color: theme.colors.amber }]}>
                  {disabledReason}
                </AppText>
              ) : hint != null ? (
                <AppText
                  variant="mono"
                  style={[
                    styles.hint,
                    { color: solid && !disabled ? theme.colors.bg : theme.colors.textMuted },
                  ]}
                >
                  {hint}
                </AppText>
              ) : null}
            </>
          );
        }}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { fontSize: 28, lineHeight: 30, letterSpacing: 4 },
  // `.start-btn` (01): mockup przybija gap 10 między ikoną a napisem.
  splashRow: { gap: 10 },
  // `.start-btn` (01): Bebas 20 px (ls 3 zostaje z tokenu `button`). lineHeight 36 -
  // mockup interlinii nie przybija; dotychczasowy splash dziedziczył ją z tokenu
  // `display` i wymóg 1:1 z obecnym renderem każe ją zachować (wysokość ~68 px).
  splashLabel: { fontSize: 20, lineHeight: 36 },
  hint: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center' },
});
