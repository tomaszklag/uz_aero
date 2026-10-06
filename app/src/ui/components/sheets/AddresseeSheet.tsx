/**
 * Ninerdeck - ARKUSZ ADRESATÓW (`design/31c-zlecenie-adresaci.html`; zlecenia 4.0.0).
 *
 * Wybór osób, do których pójdzie zlecenie. Ten plik niesie dziś kształt „z samą listą
 * osób, bez grup i z wyborem pojedynczym" (31B) - ten sam, który otwiera „ZAMIEŃ OSOBĘ"
 * na karcie prowadzącego (32D). Grupy nad osobami i wybór wielu osób dołoży formularz
 * zlecenia w tym samym komponencie: to jeden arkusz, nie dwa.
 *
 * ══ KLAWIATURA NIE WCHODZI SAMA ══
 * Świadome odejście od reguły „arkusz z polem wpisu otwiera się z klawiaturą" (issue #58):
 * tamta dotyczy arkuszy, w których wpis jest JEDYNĄ drogą. Tu drogą główną jest lista,
 * a wyszukiwarka filtruje ją dopiero w dużym klubie - klawiatura wchodząca sama
 * zasłoniłaby osoby, czyli dokładnie to, po co arkusz się otwiera (komentarz makiety 31C).
 *
 * Kandydatów i ich podpisy liczy `logic/orderAddressees.ts` (kogo nie ma na liście,
 * kolejność po nazwisku, „po zaznaczeniu termin do potwierdzenia").
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { filterAddressees, type AddresseeOption } from '../../screens/logic/orderAddressees';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Sheet } from './Sheet';

export interface AddresseeSheetProps {
  visible: boolean;
  /** „DOWÓDCA · ADRESAT". */
  title: string;
  options: readonly AddresseeOption[];
  selected: string | null;
  onSelect: (pilotId: string) => void;
  /** „ZAMIEŃ" przy zamianie osoby, „GOTOWE" w formularzu. */
  confirmLabel: string;
  /** Zapis w toku - przycisk czeka na odpowiedź. */
  busy?: boolean;
  /** Odmowa zapisu, który się nie udał - pod listą, bo nad nią stoi wybór. */
  warning?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AddresseeSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  confirmLabel,
  busy = false,
  warning = null,
  onConfirm,
  onCancel,
}: AddresseeSheetProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [query, setQuery] = useState('');

  // Każde otwarcie zaczyna od pełnej listy - wpis z poprzedniego razu ukrywałby osoby.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const shown = useMemo(() => filterAddressees(options, query), [options, query]);

  return (
    <Sheet
      visible={visible}
      title={title}
      warning={warning ?? undefined}
      confirmLabel={confirmLabel}
      // Pusty wybór blokuje BEZ zdania: widać go z listy nad przyciskiem, w której żaden
      // wiersz nie jest zaznaczony (wąski wyjątek reguły issue #55).
      confirmDisabled={selected == null || busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <View style={s.search}>
        <Icon name="search" size={16} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Szukaj osoby"
          placeholderTextColor={theme.colors.textPlaceholder}
          selectionColor={theme.colors.selection}
          cursorColor={theme.colors.textPrimary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Szukaj osoby"
          style={s.searchInput}
        />
      </View>

      <AppText variant="micro" tone="muted" style={s.label}>
        Osoby
      </AppText>
      {shown.length === 0 ? (
        <AppText variant="body" style={s.empty}>
          {options.length === 0
            ? 'Wszyscy członkowie klubu są już w tym zleceniu.'
            : 'Nikogo o takim imieniu, nazwisku ani kodzie.'}
        </AppText>
      ) : (
        <View style={s.list}>
          {shown.map((option) => {
            const on = option.pilotId === selected;
            return (
              <Pressable
                key={option.pilotId}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={option.sub == null ? option.name : `${option.name}, ${option.sub}`}
                onPress={() => onSelect(option.pilotId)}
                style={[s.row, on && s.rowOn]}
              >
                <View style={[s.avatar, on && s.avatarOn]}>
                  <AppText variant="mono" style={[s.avatarText, on && s.avatarTextOn]}>
                    {option.code ?? ''}
                  </AppText>
                </View>
                <View style={s.body}>
                  <AppText variant="body" style={[s.name, on && s.nameOn]}>
                    {option.name}
                  </AppText>
                  {option.sub != null && (
                    <AppText variant="mono" style={s.sub}>
                      {option.sub}
                    </AppText>
                  )}
                </View>
                <View style={[s.check, on && s.checkOn]}>
                  {on && <Icon name="check" size={13} color={theme.colors.bg} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: t.radius.btn,
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surface,
    },
    searchInput: { flex: 1, paddingVertical: 10, fontFamily: t.fontFamily.body, fontSize: 15, color: t.colors.textPrimary },
    label: { paddingHorizontal: 2, paddingTop: 2 },
    empty: { fontSize: 12, lineHeight: 17, color: t.colors.textMuted, paddingHorizontal: 2 },
    list: { gap: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
      paddingVertical: 6,
      paddingLeft: 8,
      paddingRight: 12,
      borderRadius: t.radius.md,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    rowOn: { borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenMuted },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceRaised,
    },
    avatarOn: { borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenMuted },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    avatarText: { fontFamily: t.fontFamily.monoBold, fontSize: 10, letterSpacing: 0.5, color: t.colors.textSecondary },
    avatarTextOn: { color: t.colors.green },
    body: { flex: 1, minWidth: 0, gap: 1 },
    name: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 13, lineHeight: 17, color: t.colors.textSecondary },
    nameOn: { color: t.colors.textPrimary },
    sub: { fontSize: 8.5, lineHeight: 12, letterSpacing: 0.3, color: t.colors.textMuted },
    check: {
      width: 20,
      height: 20,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: t.colors.borderStrong,
    },
    checkOn: { borderColor: t.colors.green, backgroundColor: t.colors.green },
  });
