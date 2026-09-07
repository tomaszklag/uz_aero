/**
 * UZ Aero - CockpitActions (`.action-row` z mockupów 05, 05a–05d)
 *
 * Pasek trzech akcji przyklejony do dołu ekranu w locie: zapis ręczny (szeroki),
 * zrzut (wąski, niebieski) i STOP ENGINE (wąski, czerwony).
 *
 * Proporcje nie są przypadkowe. Zapis ręczny jest najszerszy, bo to **ratunek na fałszywą
 * detekcję** - GPS klasy konsumenckiej gubi starty i lądowania (§8), a poprawka nie może
 * być trudniejsza niż błąd. STOP jest najwęższy i przez większość lotu zablokowany:
 * `engine_stop` w powietrzu byłby fałszywym wpisem, więc pokazujemy powód zamiast
 * chować przycisk (§6 pkt 3).
 *
 * Pasek stoi w stałym miejscu niezależnie od tego, jak długi jest log - w locie pilot
 * sięga po te przyciski, nie patrząc.
 *
 * **Zapis ręczny i STOP wymagają przytrzymania 1 s** (issue #67: „na klik mogą
 * zdarzyć się pomyłki") - tap w Taxi zapisywał zdarzenie do rejestru OD RAZU,
 * a STOP kończył jedyny bieg operacji. Gest jest własnością PRZYCISKU, nie stanu
 * sekwencji: „Take off" i „Landing" tylko otwierają arkusz 05f, ale ten sam przycisk
 * raz na klik, raz na przytrzymanie byłby nie do nauczenia. Oba niosą mikropodpis
 * „przytrzymaj 1 s" - gest niestandardowy bez podpisu wygląda po tapnięciu jak
 * zawieszona aplikacja (§6 pkt 3); przy zablokowanym STOP podpis gestu USTĘPUJE
 * powodowi blokady, dokładnie jak `disabledReason` wygrywa z `hint` w `ActionButton`.
 * Zrzut i załadunek zostają na klik: niczego nie zapisują - otwierają arkusz,
 * który sam jest potwierdzeniem.
 */

import React from 'react';
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useHold } from '../../hooks/useHold';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors } from '../tone';
import { HOLD_MS, holdConfirmHint, holdShortLabel } from './holdGesture';

export interface CockpitActionsProps {
  /**
   * Akcja szeroka po lewej - następne zdarzenie sekwencji (Taxi / Take off / Landing).
   *
   * Bez tonu (decyzja 2026-08-12): do 2026-08-12 przy utracie GPS przycisk awansował
   * na AMBER, żeby powiedzieć „teraz zapisujesz sam". Kolor niczego nie rozróżniał -
   * pilot sięga po ten przycisk zawsze z tego samego powodu (logger nie rozpoznał
   * stanu), a czy zawinił brak fixa, czy zła detekcja przy zdrowym odbiorniku, nie
   * zmienia ani czynności, ani zapisu. O czujniku mówi baner 05g i siatka parametrów.
   */
  primaryLabel: string;
  primaryIcon?: IconName;
  onPrimary: () => void;
  /**
   * Zrzut - istnieje tylko w powietrzu dnia skokowego, AKTYWNY tylko w Cruise
   * (reguły i wyjątek bez GPS: `logic/cockpitActions.ts`, decyzja 2026-08-11).
   *
   * `undefined` = przycisku NIE MA. To nie jest blokada z powodem, tylko brak akcji:
   * w dniu przelotu czy egzaminu nie ma czego wynosić, więc `drop` nie może się wydarzyć
   * (issue #19 - pilot zgłosił zrzut dostępny przy operacji „Przelot"). Wyszarzony
   * przycisk mówiłby „teraz nie, ale kiedyś tak", a to nieprawda o tym dniu.
   * W locie natomiast przycisk STOI przygaszony zamiast znikać: pasek trzyma stałą
   * geometrię, bo pilot sięga po niego nie patrząc.
   */
  onDrop?: () => void;
  dropDisabledReason?: string | null;
  /**
   * Załadunek skoczków (issue #21 pkt 7) - naziemna połowa pary zrzut/załadunek:
   * na ziemi dnia skokowego zajmuje slot, w którym w powietrzu stoi zrzut, więc pasek
   * trzyma stałą geometrię w obu stanach. `undefined` = przycisku NIE MA (ta sama
   * zasada „brak akcji, nie blokada" co przy zrzucie).
   */
  onBoarding?: () => void;
  /** STOP ENGINE. */
  onStop: () => void;
  stopDisabledReason?: string | null;
  style?: ViewStyle;
}

export function CockpitActions({
  primaryLabel,
  primaryIcon = 'landing',
  onPrimary,
  onDrop,
  dropDisabledReason = null,
  onBoarding,
  onStop,
  stopDisabledReason = null,
  style,
}: CockpitActionsProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');
  const red = toneColors(theme, 'red');
  const primaryHold = useHold({ holdMs: HOLD_MS, onTrigger: onPrimary });

  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.colors.bg },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityHint={holdConfirmHint(HOLD_MS)}
        {...primaryHold.pressProps}
        style={({ pressed }) => [
          styles.primary,
          {
            borderRadius: theme.radius.btn,
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceRaised,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        {/* Pasek postępu przytrzymania - przycisk jest bez tonu, więc pasek też:
            rozjaśnienie tła zamiast koloru akcentu. */}
        {primaryHold.holding && (
          <HoldProgress progress={primaryHold.progress} color={theme.colors.surfaceHover} />
        )}
        <View style={styles.primaryMain}>
          <Icon name={primaryIcon} size={20} color={theme.colors.textPrimary} />
          <AppText variant="button" style={styles.primaryLabel}>
            {primaryLabel}
          </AppText>
        </View>
        <AppText variant="mono" style={[styles.sublabel, { color: theme.colors.textPrimary }]}>
          {holdShortLabel(HOLD_MS)}
        </AppText>
      </Pressable>

      {/* Zrzut bez podpisu „w locie" (issue #19): przy operacji skokowej to jedyny stan,
          w jakim ten przycisk bywa zablokowany, a wyniesienie w powietrzu jest dla pilota
          oczywistością - podpis tłumaczył mu jego własną robotę. Powód zostaje
          w `accessibilityHint`, więc czytnik ekranu nadal go poda. */}
      {onDrop != null && (
        <SideButton
          icon="drop"
          label="Zrzut"
          colors={blue}
          disabledReason={dropDisabledReason}
          onPress={onDrop}
        />
      )}

      {/* Naziemna połowa pary zrzut/załadunek - ten sam slot, ten sam ton: wsiadanie
          i wynoszenie to jedna historia opowiedziana w dwóch stanach samolotu. */}
      {onBoarding != null && (
        <SideButton
          icon="boarding"
          label="Załadunek"
          colors={blue}
          disabledReason={null}
          onPress={onBoarding}
        />
      )}

      <SideButton
        icon="stop"
        label="STOP"
        // Powód blokady wygrywa z podpisem gestu (issue #67) - dopóki STOP nie działa,
        // odpowiedzią na tapnięcie jest „po LDG", nie instrukcja przytrzymania.
        sublabel={stopDisabledReason != null ? 'po LDG' : holdShortLabel(HOLD_MS)}
        colors={red}
        display
        disabledReason={stopDisabledReason}
        holdMs={HOLD_MS}
        onPress={onStop}
      />
    </View>
  );
}

function SideButton({
  icon,
  label,
  sublabel,
  colors,
  display = false,
  disabledReason,
  holdMs = 0,
  onPress,
}: {
  icon: IconName;
  label: string;
  sublabel?: string;
  colors: { accent: string; muted: string; border: string };
  display?: boolean;
  disabledReason: string | null;
  /** 0 = zwykłe tapnięcie (zrzut, załadunek - otwierają arkusz potwierdzenia). */
  holdMs?: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const disabled = disabledReason != null;
  const hold = useHold({ holdMs, disabled, onTrigger: onPress });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityHint={disabledReason ?? (holdMs > 0 ? holdConfirmHint(holdMs) : undefined)}
      disabled={disabled}
      {...hold.pressProps}
      style={({ pressed }) => [
        styles.side,
        {
          borderRadius: theme.radius.btn,
          borderWidth: theme.borderWidth,
          borderColor: colors.border,
          backgroundColor: colors.muted,
          // Mockup przygasza zablokowany STOP zamiast go chować - powód jest w podpisie.
          opacity: disabled ? 0.35 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {/* Druga warstwa `muted` na tle `muted` - ciemniejszy pas, ten sam trik,
          którym pasek postępu `ActionButton` rysuje się na wariancie `primary`. */}
      {hold.holding && <HoldProgress progress={hold.progress} color={colors.muted} />}
      <Icon name={icon} size={18} color={colors.accent} />
      <AppText
        variant={display ? 'buttonSmall' : 'mono'}
        style={display ? { color: colors.accent } : [styles.sideLabel, { color: colors.accent }]}
      >
        {label}
      </AppText>
      {sublabel != null && (
        <AppText variant="mono" style={[styles.sublabel, { color: colors.accent }]}>
          {sublabel}
        </AppText>
      )}
    </Pressable>
  );
}

/** Pasek postępu przytrzymania - wypełnia przycisk od lewej (por. `ActionButton`). */
function HoldProgress({ progress, color }: { progress: Animated.Value; color: string }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: color,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  primary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  primaryMain: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  primaryLabel: { fontSize: 20, lineHeight: 22, letterSpacing: 2 },
  side: {
    minWidth: 76,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  sideLabel: { fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
  sublabel: { fontSize: 7, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 },
});
