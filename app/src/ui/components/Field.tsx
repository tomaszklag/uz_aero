/**
 * UZ Aero — Field i TextField (`.field` / `.field-input` z mockupów)
 *
 * Wzorzec formularza z `CLAUDE.md`: tło `surface-raised`, promień 12, fokus na zielonej
 * obramówce. `Field` to sama oprawa (etykieta mono UPPERCASE, znacznik „opcjonalne",
 * podpowiedź pod spodem) — w środku może siedzieć cokolwiek: input, `Stepper`, odczyt.
 * `TextField` dokłada zwykły `TextInput` w tej oprawie.
 *
 * Wariant `mono` obsługuje pola kodowe (ICAO, kody pilotów) — większa czcionka mono
 * z rozstrzeloną literą, tak jak w designie: te wartości czyta się jak numer rejestracyjny,
 * nie jak zdanie.
 */

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Tag } from './Tag';
import { toneColors, type Tone } from './tone';

export interface FieldProps {
  label: string;
  /** Znacznik po prawej stronie etykiety („opcjonalne", „wymagane"). */
  tag?: { label: string; tone?: Tone };
  /** Podpowiedź pod polem — do czego ta wartość służy. */
  hint?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Field({ label, tag, hint, children, style }: FieldProps) {
  return (
    <View style={[{ gap: 5 }, style]}>
      <View style={styles.labelRow}>
        <AppText variant="mono" tone="muted" style={styles.label}>
          {label}
        </AppText>
        {tag != null && <Tag label={tag.label} tone={tag.tone ?? 'neutral'} />}
      </View>

      {children}

      {hint != null && (
        <AppText variant="mono" tone="muted" style={styles.hint}>
          {hint}
        </AppText>
      )}
    </View>
  );
}

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  tag?: FieldProps['tag'];
  hint?: string;
  /** Pola kodowe (ICAO, kod pilota) — mono, rozstrzelone, wersaliki. */
  mono?: boolean;
  style?: ViewStyle;
}

export function TextField({ label, tag, hint, mono = false, style, ...input }: TextFieldProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const [focused, setFocused] = useState(false);

  return (
    <Field label={label} tag={tag} hint={hint} style={style}>
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={green.accent}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={{
          minHeight: 46, // cel dotykowy dla rękawic
          paddingHorizontal: 13,
          paddingVertical: 11,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: focused ? green.border : theme.colors.border,
          backgroundColor: theme.colors.surfaceRaised,
          color: theme.colors.textPrimary,
          fontFamily: mono ? theme.fontFamily.monoBold : theme.fontFamily.body,
          fontSize: mono ? 18 : 15,
          letterSpacing: mono ? 3 : 0,
        }}
      />
    </Field>
  );
}

export interface ValueBoxProps {
  /** Wartość główna — duża, mono (np. „08:00", „150"). */
  value: string;
  /** Jednostka tuż za wartością, mniejsza i przygaszona („UTC", „L", „MH"). */
  unit?: string;
  /** Wartość drugorzędna po prawej („10:00 LT", „różnica +8 L"). */
  meta?: string;
  /** Ikona po prawej — obecność ołówka mówi, że wartość da się zmienić. */
  actionIcon?: IconName;
  /** Bez `onPress` pole jest czystym odczytem. */
  onPress?: () => void;
  /** Ton wartości — `amber` dla paliwa, `neutral` dla reszty. */
  tone?: Tone;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/**
 * `.field-input` w trybie ODCZYTU: duża wartość po lewej, kontekst i akcja po prawej.
 *
 * Świadomie bez wbudowanej etykiety (inaczej niż `TextField`) — w mockupach pod tym
 * pudełkiem stoją jeszcze rodzeństwa w tym samym `.field`: badge z datą, edytor, adnotacja
 * o wieku danych. Trzymanie ich w jednym `Field` daje ciasny odstęp z designu (5 px),
 * czego nie da się osiągnąć, gdy każdy element ma własną etykietę.
 */
export function ValueBox({
  value,
  unit,
  meta,
  actionIcon,
  onPress,
  tone = 'neutral',
  accessibilityLabel,
  style,
}: ValueBoxProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <Pressable
      accessibilityRole={onPress != null ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
      disabled={onPress == null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.box,
        {
          minHeight: 46, // cel dotykowy dla rękawic
          paddingHorizontal: 13,
          paddingVertical: 11,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.borderStrong, // `.field-input.filled`
          backgroundColor: theme.colors.surfaceRaised,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <View style={styles.boxSide}>
        <AppText
          variant="mono"
          style={{
            fontFamily: theme.fontFamily.monoBold,
            fontSize: 22,
            lineHeight: 26,
            letterSpacing: 2,
            color: tone === 'neutral' ? theme.colors.textPrimary : c.accent,
          }}
        >
          {value}
        </AppText>
        {unit != null && (
          <AppText variant="mono" tone="muted" style={styles.unit}>
            {unit}
          </AppText>
        )}
      </View>

      <View style={styles.boxSide}>
        {meta != null && (
          <AppText variant="mono" tone="muted" style={styles.meta}>
            {meta}
          </AppText>
        )}
        {actionIcon != null && (
          <Icon name={actionIcon} size={13} color={theme.colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

export interface ResultRowProps {
  label: string;
  value: string;
  tone?: Tone;
  style?: ViewStyle;
}

/**
 * `.result-row` — wiersz wyniku zamykający sekcję formularza: opis po lewej, wyliczona
 * wartość po prawej, oddzielony linią od pól nad nim.
 *
 * Sens jest taki, że pilot wpisuje składniki (stan paliwa, dolanie), a tu widzi **to,
 * co faktycznie zostanie zapisane**. Bez tego wiersza musiałby dodawać w głowie i ufać,
 * że aplikacja liczy tak samo jak on.
 */
export function ResultRow({ label, value, tone = 'amber', style }: ResultRowProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        styles.result,
        {
          paddingVertical: 8,
          marginTop: 2,
          borderTopWidth: theme.borderWidth,
          borderTopColor: theme.colors.border,
        },
        style,
      ]}
    >
      <AppText variant="mono" tone="muted" style={styles.resultLabel}>
        {label}
      </AppText>
      <AppText
        variant="display"
        style={{
          fontSize: 18,
          lineHeight: 20,
          letterSpacing: 1,
          color: tone === 'neutral' ? theme.colors.textPrimary : c.accent,
        }}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  result: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resultLabel: { flexShrink: 1, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  label: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  hint: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
  box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  boxSide: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unit: { fontSize: 12, letterSpacing: 1 },
  meta: { fontSize: 11, letterSpacing: 1 },
});
