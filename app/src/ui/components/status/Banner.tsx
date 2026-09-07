/**
 * UZ Aero - Banner (trzy typy, jeden zamykalny)
 *
 * Taksonomia z `docs/design-notes.md` - od typu zależy, czy wolno go zamknąć:
 *
 *  • `status`  - żywy stan (offline, tylko-odczyt, odliczanie okna korekty).
 *                To PRZYRZĄD, nie onboarding. **Nigdy zamykalny** - ukrycie go
 *                znaczy ukrycie stanu, którego pilot potrzebuje co spojrzenie.
 *  • `warning` - ostrzeżenie warunkowe (rozbieżność paliwa/MH, brak drugiego pilota).
 *                Pojawia się i znika **z warunkiem**; nie zamyka się ręcznie.
 *  • `edu`     - pouczający, jednorazowy. Pomocny za pierwszym razem, szum potem.
 *                **Zamykalny**: `×` chowa go, w jego miejscu zostaje mini-chip.
 *
 * Stan schowania banera `edu` aplikacja zapamiętuje NA STAŁE per pilot - inaczej pilot
 * zamykałby go w kółko i wzorzec byłby gorszy niż jego brak. Tu przyjmujemy to przez
 * `dismissed` + `onDismiss`, żeby komponent pozostał bezstanowy.
 *
 * IKONA POUCZAJĄCEGO TO ZAWSZE PYTAJNIK (uwaga z urządzenia, 2026-08-27) - komponent
 * WYMUSZA ją dla `edu`, ignorując `icon` od wołającego: baner, który wyjaśnia, PYTA,
 * a wykrzyknik (`info` = alert-circle) czytał się jak ostrzeżenie. TA SAMA ikona stoi
 * w banerze i w zwiniętym chipie - chip rysował dotąd tekstowe „?", więc dwa stany
 * jednej rzeczy wyglądały jak dwie rzeczy. Egzekwowane tutaj, nie konwencją w ekranach,
 * bo konwencja już raz się rozjechała (trzy ekrany podawały `info`, jeden `sync`).
 *
 * OSTRZEŻENIE MA TRÓJKĄT DOMYŚLNIE (uwaga z urządzenia, 2026-09-02): każdy `.warn-box`
 * mockupów niesie ikonę, a `icon` zdany na wołającego raz już zawiódł - ostrzeżenie
 * arkusza renderowało się bez ikony i z szarym tekstem, „odbiegało od designu".
 * Dla `warning` ikona jest więc DOMYŚLNA (`icon` może ją nadal podmienić); `status`
 * zostaje bez domyślnej, bo jego ikona nazywa KONKRETNY stan (sync, zegar, check).
 *
 * `action` - opcjonalny przycisk POD treścią (np. „Wyczyść formularz" w banerze
 * o podstawionych danych na 02E): baner tłumaczący, skąd wzięły się wartości, jest
 * naturalnym miejscem decyzji „nie chcę ich". Slot jest częścią komponentu, żeby
 * przycisk w banerze wyglądał wszędzie tak samo.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors, type Tone } from '../tone';

export type BannerKind = 'status' | 'warning' | 'edu';

export interface BannerProps {
  kind: BannerKind;
  title?: string;
  text: string;
  /** Ikona po lewej (mockupy mają ją przy ostrzeżeniach - `.warning-box`). */
  icon?: IconName;
  /** Ton akcentu; domyślnie dobierany po rodzaju. */
  tone?: Tone;
  /** Dotyczy wyłącznie `edu`: czy baner jest schowany do mini-chipu. */
  dismissed?: boolean;
  /** Dotyczy wyłącznie `edu`: przełącza stan schowania (zapamiętaj go trwale!). */
  onDismiss?: (next: boolean) => void;
  /** Etykieta mini-chipu po zwinięciu (np. „Jak to działa?"). */
  collapsedLabel?: string;
  /** Przycisk pod treścią (np. „Wyczyść formularz") - patrz docblock modułu. */
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
}

const DEFAULT_TONE: Record<BannerKind, Tone> = {
  status: 'blue',
  warning: 'amber',
  edu: 'blue',
};

export function Banner({
  kind,
  title,
  text,
  icon,
  tone,
  dismissed = false,
  onDismiss,
  collapsedLabel = 'Wyjaśnienie',
  action,
  style,
}: BannerProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone ?? DEFAULT_TONE[kind]);
  const dismissible = kind === 'edu' && onDismiss != null;
  // Pouczający PYTA (pytajnik wymuszony), ostrzeżenie OSTRZEGA (trójkąt domyślny) -
  // oba na poziomie DS, patrz docblock modułu.
  const effectiveIcon: IconName | undefined =
    kind === 'edu' ? 'help' : kind === 'warning' ? (icon ?? 'warning') : icon;

  // Zwinięty baner pouczający - mini-chip w miejscu, w którym stał; TA SAMA ikona,
  // co w banerze rozwiniętym, żeby dwa stany jednej rzeczy wyglądały jak jedna rzecz.
  if (dismissible && dismissed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Pokaż wyjaśnienie: ${collapsedLabel}`}
        onPress={() => onDismiss?.(false)}
        // Mini-chip 34 px jest z mockupu (05f) - hitSlop dociąga cel do progu rękawic.
        hitSlop={6}
        style={[
          styles.mini,
          {
            minHeight: 34,
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.pill,
            borderWidth: theme.borderWidth,
            borderColor: c.border,
            backgroundColor: c.muted,
          },
          style,
        ]}
      >
        <Icon name="help" size={13} color={c.accent} />
        <AppText variant="label" style={{ color: c.accent }}>
          {collapsedLabel}
        </AppText>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.banner,
        {
          gap: theme.spacing.xs,
          padding: theme.spacing.md,
          paddingRight: dismissible ? 44 : theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {effectiveIcon != null && (
          <Icon name={effectiveIcon} size={20} color={c.accent} style={styles.icon} />
        )}
        <View style={styles.content}>
          {title != null && (
            <AppText variant="label" style={{ color: c.accent }}>
              {title}
            </AppText>
          )}
          <AppText variant="body" tone="secondary">
            {text}
          </AppText>

          {action != null && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.action,
                {
                  minHeight: 40,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.sm,
                  borderWidth: theme.borderWidth,
                  borderColor: c.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AppText variant="mono" style={[styles.actionLabel, { color: c.accent }]}>
                {action.label}
              </AppText>
            </Pressable>
          )}
        </View>
      </View>

      {dismissible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rozumiem, schowaj wyjaśnienie"
          onPress={() => onDismiss?.(true)}
          hitSlop={8}
          style={styles.close}
        >
          <AppText variant="body" tone="muted">
            ✕
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'relative' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  content: { flex: 1, gap: 4 },
  icon: { marginTop: 1 },
  close: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mini: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  action: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  actionLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
});
