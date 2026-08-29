/**
 * UZ Aero - CardPicker (`.aircraft-option` / `.crew-option` z mockupu 02)
 *
 * Wybór z listy **kart**, nigdy natywnego selecta - twarda reguła projektu (`CLAUDE.md`):
 * na telefonie karty pokazują wszystkie opcje naraz wraz z kontekstem (typ samolotu,
 * blokada PIC, kod pilota), a select ukrywa je za jednym tapnięciem.
 *
 * Układ jest **jednowierszowy**, dokładnie jak w designie:
 *
 *   [awatar]  ETYKIETA ────────────  detal   [tagi]  (✓)
 *
 * Etykieta rozpycha wiersz, detal i tagi trzymają się prawej. Dwie linie tekstu na pozycję
 * rozciągnęłyby listę czterech samolotów na pół ekranu - a to pierwsza rzecz, którą pilot
 * widzi rano.
 *
 * Pozycja niedostępna ma **podany powód** (`disabledReason`) - nigdy wyszarzenie bez
 * wyjaśnienia (§6 pkt 3). Gdy powód mieści się w tagu (mockup: czerwone „Wyłączony"),
 * renderujemy tag; dłuższy powód idzie osobną linią. Cel dotykowy ≥ 56 px - rękawice.
 *
 * POZYCJA `peek` - nie do wyboru, do obejrzenia (`onSecondary`, ikona oka w miejscu kółka).
 * Tak wygląda samolot prowadzony przez innego pilota: wcześniej dostawał kółko wyboru,
 * mikro-plakietkę „PIC: KRZ · od 07:10" wciśniętą między typ a ikonę oka i dwie różne
 * akcje w jednym wierszu (tapnięcie = przejmij, oko = podejrzyj). Właściciel produktu
 * zgłosił to jako brzydki, stłoczony wiersz (issue #12) i miał rację także mechanicznie:
 * przejęcie odbiera poprzednikowi prawo zapisu (§4.4), więc nie może dzielić powierzchni
 * dotykowej z niewinnym podglądem. Teraz cały wiersz prowadzi do podglądu (04b), a
 * przejęcie jest osobną decyzją TAM - po zobaczeniu, co się z samolotem dzieje. Kto
 * prowadzi i od kiedy, mówi `note`: pełnowymiarowa linia pod etykietą, nie plakietka.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Avatar } from '../foundation/Avatar';
import { CheckIcon } from '../foundation/CheckIcon';
import { Icon, type IconName } from '../foundation/Icon';
import { Tag } from '../status/Tag';
import { toneColors, type Tone } from '../tone';

export interface PickerTag {
  label: string;
  tone?: Tone;
}

export interface PickerOption<T extends string> {
  value: T;
  /** Główna etykieta (np. „SP-AXA", „Anna Kowalska"). */
  label: string;
  /** Wartość po prawej: typ samolotu. Mono, przygaszona. */
  detail?: string;
  /** Kafelek przed etykietą - kod pilota na liście załogi (`Avatar` z `code`). */
  avatarCode?: string;
  /** Małe etykiety: „wyłączony", „wymagany". */
  tags?: PickerTag[];
  /** Blokada wyboru z powodem; powód jest widoczny na karcie. */
  disabledReason?: string;
  /**
   * Druga linia pod etykietą - kontekst, który nie mieści się w tagu
   * („Prowadzi PIC: KRZ · od 07:10"). Amber, bo tyle dziś potrzebuje ta lista.
   */
  note?: string;
  /**
   * Pozycja do PODGLĄDU, nie do wyboru: cały wiersz woła `onSecondary`, a w miejscu
   * kółka wyboru stoi ikona oka. Patrz nota na górze pliku.
   */
  peek?: boolean;
  /** Gdy powód mieści się w tagu (np. „Wyłączony") - nie dublujemy go osobną linią. */
  disabledTagged?: boolean;
}

export interface CardPickerProps<T extends string> {
  options: PickerOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Cel pozycji `peek` - podgląd read-only zajętego samolotu (04b). */
  onSecondary?: (value: T) => void;
  secondaryIcon?: IconName;
  secondaryLabel?: string;
  style?: ViewStyle;
}

export function CardPicker<T extends string>({
  options,
  value,
  onChange,
  onSecondary,
  secondaryIcon = 'peek',
  secondaryLabel = 'Podgląd',
  style,
}: CardPickerProps<T>) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  return (
    <View style={[{ gap: 6 }, style]}>
      {options.map((opt) => {
        const peek = opt.peek === true && onSecondary != null;
        // Pozycja `peek` nigdy nie jest „wybrana" - nie ma czego zaznaczać, skoro
        // tapnięcie prowadzi na inny ekran.
        const selected = !peek && opt.value === value;
        const disabled = opt.disabledReason != null;
        const showReasonLine = disabled && opt.disabledTagged !== true;

        return (
          <Pressable
            key={opt.value}
            accessibilityRole={peek ? 'button' : 'radio'}
            accessibilityState={peek ? { disabled } : { selected, disabled }}
            accessibilityHint={peek ? secondaryLabel : opt.disabledReason}
            disabled={disabled}
            onPress={() => (peek ? onSecondary(opt.value) : onChange(opt.value))}
            style={({ pressed }) => [
              styles.card,
              {
                minHeight: 56,
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: theme.radius.md,
                borderWidth: theme.borderWidth,
                borderColor: selected ? green.border : theme.colors.border,
                backgroundColor: selected ? green.muted : theme.colors.surfaceRaised,
                opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={styles.row}>
              {opt.avatarCode != null && (
                <Avatar
                  name={opt.label}
                  code={opt.avatarCode}
                  size="sm"
                  tone={selected ? 'green' : 'neutral'}
                />
              )}

              <AppText
                variant="mono"
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: selected ? green.accent : theme.colors.textSecondary },
                ]}
              >
                {opt.label}
              </AppText>

              {opt.detail != null && (
                <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.detail}>
                  {opt.detail}
                </AppText>
              )}

              {opt.tags?.map((t) => (
                <Tag key={t.label} label={t.label} tone={t.tone ?? 'neutral'} />
              ))}

              {/* Oko STOI W MIEJSCU kółka wyboru, a nie obok niego: wiersz ma jedną
                  akcję, więc ma też jeden znacznik po prawej. Pozycja zablokowana nie
                  dostaje go wcale - tak samo jak nie dostaje pustego kółka. */}
              {peek && !disabled && (
                <View
                  style={[
                    styles.secondary,
                    { borderColor: theme.colors.border, borderWidth: theme.borderWidth },
                  ]}
                >
                  <Icon name={secondaryIcon} size={14} color={theme.colors.textMuted} />
                </View>
              )}

              {/* Znacznik wyboru - kółko z ptaszkiem (.aircraft-check). Sam zielony krążek
                  byłby sygnałem wyłącznie kolorystycznym; kształt działa też w słońcu,
                  w motywach jasnych i przy daltonizmie. Pozycja zablokowana go nie ma -
                  nie da się jej wybrać, więc puste kółko tylko myliłoby. */}
              {!disabled && !peek && (
                <View
                  style={[
                    styles.check,
                    {
                      borderColor: selected ? green.accent : theme.colors.border,
                      backgroundColor: selected ? green.accent : 'transparent',
                    },
                  ]}
                >
                  {selected && <CheckIcon size={12} color={theme.colors.bg} />}
                </View>
              )}
            </View>

            {opt.note != null && (
              <AppText variant="mono" tone="amber" style={styles.note}>
                {opt.note}
              </AppText>
            )}

            {showReasonLine && (
              <AppText variant="mono" tone="amber" style={styles.reason}>
                {opt.disabledReason}
              </AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { justifyContent: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { flex: 1, fontSize: 15, letterSpacing: 2 },
  detail: { flexShrink: 1, fontSize: 10, letterSpacing: 0.5 },
  secondary: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reason: { fontSize: 9, letterSpacing: 0.5 },
  // Linia kontekstu jest czytelnym tekstem, a nie mikrodrukiem plakietki (8 px): to ona
  // niesie decyzję „wchodzić w podgląd czy nie".
  note: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
});
