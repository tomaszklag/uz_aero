/**
 * Ninerdeck - POLE HASŁA z przełącznikiem „pokaż" (2.1.0, makiety `00f`, `00h`, `13b`;
 * `docs/logowanie-haslem.md` D4).
 *
 * `TextField` z oprawą `Field` nie wystarcza, bo hasło ma w polu DRUGĄ kontrolkę -
 * oko po prawej. Komponent, a nie trzy kopie w ekranach: to samo pole stoi na 00F,
 * w arkuszu zmiany hasła 13B (trzy egzemplarze naraz) i przy rejestracji.
 *
 * ══ WKLEJANIE JEST DOZWOLONE (NIST SP 800-63B, D4) ══
 * Menedżer haseł na wspólnym tablecie jest sojusznikiem, nie zagrożeniem: hasło ma
 * co najmniej 12 znaków i nikt go nie zapamięta z kartki. Nie blokujemy więc ani
 * wklejania, ani autouzupełnienia - `autoComplete` podaje wołający, bo tylko on wie,
 * czy to logowanie (`current-password`) czy ustawianie nowego (`new-password`).
 *
 * ══ IKONA POKAZUJE SKUTEK, NIE STAN ══
 * Przy zakrytym haśle stoi oko („pokaż"), przy odkrytym - oko przekreślone („ukryj").
 * Ta sama reguła, przez którą przełącznik jasności w kokpicie rysuje słońce w motywie
 * ciemnym (issue #82): pilot nie ma zgadywać, co zrobi kontrolka, a stan i tak widać,
 * bo są nim same kropki w polu.
 *
 * ══ ODSŁONIĘCIE JEST DECYZJĄ PILOTA ══
 * Po odmowie serwera hasła NIE odsłaniamy z własnej inicjatywy (makieta 00F) - i nie
 * czyścimy pola: pilot poprawia literówkę, a nie pisze od nowa.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../../theme';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';
import { Field, type FieldProps } from './Field';

export interface PasswordFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  hint?: string;
  hintTone?: FieldProps['hintTone'];
  error?: FieldProps['error'];
  /**
   * Uchwyt do samego `TextInput` - arkusz 13B podnosi klawiaturę drabinką prób
   * (`useSheetInputFocus`), a ta musi mieć się na czym zawiesić; trzy podejścia bez
   * uchwytu już zawiodły (historia w `hooks/keyboardFocus.ts`).
   *
   * PROP, nie `forwardRef`: ten drugi wymusiłby `export const`, a `.tsx` w tej aplikacji
   * eksportuje wyłącznie `export function` z wielkiej litery - granica Fast Refresh
   * pilnowana przez `__tests__/architecture.test.ts`. Reguła jest warta więcej niż
   * kosmetyka wywołania, a od Reacta 19 `ref` i tak jest zwykłym propsem.
   */
  inputRef?: React.Ref<TextInput>;
  style?: FieldProps['style'];
}

/** Szerokość celu dotykowego oka. Pole ma 46 dp wysokości, więc ikona mieści się w nim. */
const EYE = 40;

export function PasswordField({
  label,
  hint,
  hintTone,
  error,
  inputRef,
  style,
  ...input
}: PasswordFieldProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const red = toneColors(theme, 'red');
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  return (
    <Field label={label} hint={hint} hintTone={hintTone} error={error} style={style}>
      <View style={styles.wrap}>
        <TextInput
          ref={inputRef}
          secureTextEntry={!shown}
          placeholderTextColor={theme.colors.textPlaceholder}
          selectionColor={green.accent}
          autoCapitalize="none"
          autoCorrect={false}
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
            minHeight: 46, // cel dotykowy dla rękawic, jak w `TextField`
            paddingLeft: 13,
            // Miejsce na oko - inaczej kropki wchodziłyby pod ikonę.
            paddingRight: EYE + 8,
            paddingVertical: 11,
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth,
            // Czerwień wygrywa z fokusem: wartość jest odrzucona także wtedy, gdy pilot
            // wrócił do pola - dopóki jej nie zmieni, obramówka ma o tym mówić.
            borderColor: error != null ? red.border : focused ? green.border : theme.colors.border,
            backgroundColor: theme.colors.surfaceRaised,
            color: theme.colors.textPrimary,
            fontFamily: theme.fontFamily.body,
            fontSize: 15,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Ukryj hasło' : 'Pokaż hasło'}
          onPress={() => setShown((s) => !s)}
          style={({ pressed }) => [styles.eye, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon
            name={shown ? 'password-hide' : 'password-show'}
            size={18}
            color={theme.colors.textMuted}
          />
        </Pressable>
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  eye: {
    position: 'absolute',
    right: 3,
    width: EYE,
    height: EYE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
