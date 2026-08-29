/**
 * UZ Aero - Field i TextField (`.field` / `.field-input` z mockupów)
 *
 * Wzorzec formularza z `CLAUDE.md`: tło `surface-raised`, promień 12, fokus na zielonej
 * obramówce. `Field` to sama oprawa (etykieta mono UPPERCASE, znacznik „opcjonalne",
 * podpowiedź pod spodem) - w środku może siedzieć cokolwiek: input, `Stepper`, odczyt.
 * `TextField` dokłada zwykły `TextInput` w tej oprawie.
 *
 * Wariant `mono` obsługuje pola kodowe (ICAO, kody pilotów) - większa czcionka mono
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

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { Tag } from '../status/Tag';
import { toneColors, type Tone } from '../tone';

export interface FieldProps {
  label: string;
  /** Znacznik po prawej stronie etykiety („opcjonalne", „wymagane"). */
  tag?: { label: string; tone?: Tone };
  /**
   * Adnotacja po prawej stronie etykiety - goła linijka mono, bez ramki plakietki
   * (uwaga z urządzenia, 2026-08-29: czas lokalny przy kontrolce godziny).
   *
   * Różni się od `tag` ROLĄ, nie wyglądem: plakietka mówi o WŁAŚCIWOŚCI pola
   * („opcjonalne", „wymagany · załoga 2-os."), a adnotacja o jego BIEŻĄCEJ WARTOŚCI
   * widzianej inaczej - ta sama chwila w strefie pilota. Stąd brak obramowania: to
   * nie jest etykieta stanu, tylko druga twarz liczby stojącej pod spodem.
   *
   * Linia etykiety jest dla niej właściwym miejscem, bo nic nie kosztuje w pionie
   * i przylega do kontrolki: pod spodem stała za podpisem przesunięcia i czytała się
   * jak pierwszy z wierszy odniesienia niżej, a nie jak przypis do godziny.
   */
  labelNote?: string;
  /** Podpowiedź pod polem - do czego ta wartość służy. */
  hint?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Field({ label, tag, labelNote, hint, children, style }: FieldProps) {
  return (
    <View style={[{ gap: 5 }, style]}>
      <View style={styles.labelRow}>
        <AppText variant="mono" tone="muted" style={styles.label}>
          {label}
        </AppText>
        {labelNote != null && (
          <AppText variant="mono" tone="muted" style={styles.labelNote}>
            {labelNote}
          </AppText>
        )}
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
  /** Pola kodowe (ICAO, kod pilota) - mono, rozstrzelone, wersaliki. */
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
        placeholderTextColor={theme.colors.textPlaceholder}
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
  /** Wartość główna - duża, mono (np. „08:00", „150"). */
  value: string;
  /** Jednostka tuż za wartością, mniejsza i przygaszona („UTC", „L", „MH"). */
  unit?: string;
  /** Wartość drugorzędna po prawej („10:00 LT", „różnica +8 L"). */
  meta?: string;
  /**
   * Plakietka przy WARTOŚCI, nie przy etykiecie (issue #62 pkt 1).
   *
   * Etykieta ma własny znacznik w `Field` i mówi o POLU („opcjonalne"). Ten mówi
   * o tym, co w polu stoi - dziś: że kod lotniska jest spoza katalogu. Stoi w prawej
   * grupie zamiast `meta`, bo obie odpowiadają na to samo pytanie „co to za wartość".
   */
  tag?: { label: string; tone?: Tone };
  /** Ikona po prawej - obecność ołówka mówi, że wartość da się zmienić. */
  actionIcon?: IconName;
  /** Bez `onPress` pole jest czystym odczytem. */
  onPress?: () => void;
  /** Ton wartości - `amber` dla paliwa, `neutral` dla reszty. */
  tone?: Tone;
  /**
   * `value` - liczba albo kod (czas, litry, ICAO): mono, pogrubione.
   * `text` - zdanie pilota (oznaczenie klienta, notatka): krój tekstowy, ZAWIJA SIĘ
   * W CAŁOŚCI (issue #58 pkt 10 - ucięta notatka wyglądała, jakby się nie zapisała).
   * Ten sam kształt pudełka i ten sam ołówek, bo to nadal jest „pole w trybie odczytu,
   * które otwiera edycję" (issue #14) - inny jest tylko materiał w środku, a zdanie
   * złożone czcionką licznika czyta się źle.
   */
  variant?: 'value' | 'text';
  /** Napis zastępczy, gdy `value` jest puste - przygaszony, jak placeholder w polu. */
  placeholder?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/**
 * `.field-input` w trybie ODCZYTU: duża wartość po lewej, kontekst i akcja po prawej.
 *
 * Świadomie bez wbudowanej etykiety (inaczej niż `TextField`) - w mockupach pod tym
 * pudełkiem stoją jeszcze rodzeństwa w tym samym `.field`: badge z datą, edytor, adnotacja
 * o wieku danych. Trzymanie ich w jednym `Field` daje ciasny odstęp z designu (5 px),
 * czego nie da się osiągnąć, gdy każdy element ma własną etykietę.
 */
export function ValueBox({
  value,
  unit,
  meta,
  tag,
  actionIcon,
  onPress,
  tone = 'neutral',
  variant = 'value',
  placeholder,
  accessibilityLabel,
  style,
}: ValueBoxProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const empty = value.length === 0;
  const shown = empty ? (placeholder ?? '-') : value;

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
      <View
        style={[
          styles.boxSide,
          // Wartość główna NIE kurczy się nigdy: kod ICAO i godzina mają być całe.
          // To wartość drugorzędna po prawej ustępuje miejsca (patrz `boxSideEnd`).
          variant === 'text' ? styles.boxSideGrow : styles.boxSideFixed,
        ]}
      >
        {/*
         * METRYKA WARTOŚCI JAK W ARKUSZU EDYCJI (issue #58 pkt 5 i 9): mono 16 /
         * odstęp 1.5 - dokładnie pole wpisu z arkusza lotniska. Kontrolka formularza
         * jest tym samym polem oglądanym w spoczynku, więc 22 px robiło z każdej
         * wartości bohatera ekranu.
         *
         * PLACEHOLDER JEST ZAWSZE SKŁADEM TEKSTOWYM (issue #58, trzecia tura):
         * body 15 w `textPlaceholder` - dokładnie jak placeholder w arkuszu notatki.
         * To instrukcja („wybierz lotnisko"), nie wartość, więc nie dziedziczy kroju
         * liczb: mono robiło z zachęty wpisany kod. Wysokość kontrolki trzyma
         * `minHeight: 46`, więc - inaczej niż w polach `TextInput`, gdzie placeholder
         * MUSI dziedziczyć metrykę pola - osobny skład niczym tu nie skacze.
         * Wariant tekstowy bez `numberOfLines` - zdanie zawija się w całości (pkt 10).
         */}
        <AppText
          variant={variant === 'text' || empty ? 'body' : 'mono'}
          {...(variant === 'text' ? {} : { numberOfLines: 1 })}
          style={
            variant === 'text' || empty
              ? {
                  flexShrink: 1,
                  fontSize: 15,
                  lineHeight: 20,
                  color: empty ? theme.colors.textPlaceholder : theme.colors.textPrimary,
                }
              : {
                  fontFamily: theme.fontFamily.monoBold,
                  fontSize: 16,
                  lineHeight: 22,
                  letterSpacing: 1.5,
                  color: tone === 'neutral' ? theme.colors.textPrimary : c.accent,
                }
          }
        >
          {shown}
        </AppText>
        {unit != null && !empty && (
          <AppText variant="mono" tone="muted" style={styles.unit}>
            {unit}
          </AppText>
        )}
      </View>

      <View style={[styles.boxSide, styles.boxSideEnd]}>
        {meta != null && (
          <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.meta}>
            {meta}
          </AppText>
        )}
        {tag != null && <Tag label={tag.label} tone={tag.tone ?? 'neutral'} />}
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
 * `.result-row` - wiersz wyniku zamykający sekcję formularza: opis po lewej, wyliczona
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
  // Ten sam stopień co etykieta, ale BEZ wersalików i szerokiego światła: adnotacja
  // niesie wartość („12:26 LT"), a nie nazwę - rozstrzelone wersaliki robiłyby
  // z godziny drugą etykietę.
  labelNote: { fontSize: 9, letterSpacing: 0.5 },
  hint: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
  box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  boxSide: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Wariant tekstowy zabiera resztę wiersza: zdanie ma się łamać, a nie wypychać ołówek.
  boxSideGrow: { flex: 1, minWidth: 0 },
  boxSideFixed: { flexShrink: 0 },
  /**
   * Prawa strona USTĘPUJE: „Kraków John Paul II International Airport" jest dłuższe niż
   * pół ekranu, więc bez `flexShrink` + `minWidth: 0` napis rozpychał wiersz i wychodził
   * poza kontrolkę (zgłoszenie z urządzenia). Skrócenie z wielokropkiem działa dopiero,
   * gdy tekst MA gdzie się skurczyć - sam `numberOfLines` nie wystarcza.
   */
  boxSideEnd: { flexShrink: 1, minWidth: 0, justifyContent: 'flex-end' },
  unit: { fontSize: 12, letterSpacing: 1 },
  meta: { fontSize: 11, letterSpacing: 1, flexShrink: 1 },
});
