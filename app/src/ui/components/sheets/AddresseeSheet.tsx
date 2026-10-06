/**
 * Ninerdeck - ARKUSZ ADRESATÓW (`design/31c-zlecenie-adresaci.html`; zlecenia 4.0.0).
 *
 * Wybór osób, do których pójdzie zlecenie. Jeden arkusz w dwóch kształtach:
 *  - `single` - sama lista osób, wybór POJEDYNCZY: fotel „Osoba · imiennie" w formularzu
 *    (31B) i „ZAMIEŃ OSOBĘ" na karcie prowadzącego (32D). Pole wyboru OKRĄGŁE, jak lista
 *    Duali (02) - kształt mówi „jedna", zanim palec cokolwiek dotknie;
 *  - `multi` - grupy klubu NAD osobami, wybór wielokrotny: fotel „Grupa · lub kilka osób"
 *    i wspólna lista. Pole wyboru KWADRATOWE - „można zaznaczyć kilka". Członek zaznaczonej
 *    grupy stoi zaznaczony, ale przygaszony i nie do odznaczenia: grupa rozwija się w osoby
 *    dopiero przy wysłaniu (§6.2), a wiersz odpowiada na pytanie „do kogo to NAPRAWDĘ
 *    pójdzie" - licznik w „GOTOWE · N" liczy dokładnie te osoby.
 *
 * ══ KLAWIATURA NIE WCHODZI SAMA ══
 * Świadome odejście od reguły „arkusz z polem wpisu otwiera się z klawiaturą" (issue #58):
 * tamta dotyczy arkuszy, w których wpis jest JEDYNĄ drogą. Tu drogą główną jest lista,
 * a wyszukiwarka filtruje ją dopiero w dużym klubie - klawiatura wchodząca sama
 * zasłoniłaby osoby, czyli dokładnie to, po co arkusz się otwiera (komentarz makiety 31C).
 *
 * Kandydatów i podpisy liczą `logic/orderAddressees.ts` (zamiana osoby) i
 * `logic/orderFormAddressees.ts` (formularz).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { filterAddressees, type AddresseeOption } from '../../screens/logic/orderAddressees';
import { filterSheet, type MultiSheetVm } from '../../screens/logic/orderFormAddressees';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { CheckIcon } from '../foundation/CheckIcon';
import { Icon } from '../foundation/Icon';
import { Sheet } from './Sheet';

interface Common {
  visible: boolean;
  /** „DOWÓDCA · ADRESAT", „DRUGI PILOT · ADRESACI", „WSPÓLNA LISTA · ADRESACI". */
  title: string;
  /** „ZAMIEŃ" przy zamianie osoby, „GOTOWE · 5" w formularzu. */
  confirmLabel: string;
  /** Zapis w toku - przycisk czeka na odpowiedź. */
  busy?: boolean;
  /** Odmowa zapisu, który się nie udał - pod listą, bo nad nią stoi wybór. */
  warning?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export type AddresseeSheetProps = Common &
  (
    | {
        kind?: 'single';
        options: readonly AddresseeOption[];
        selected: string | null;
        onSelect: (pilotId: string) => void;
      }
    | {
        kind: 'multi';
        sheet: MultiSheetVm;
        onToggle: (entry: { kind: 'person' | 'group'; id: string }) => void;
      }
  );

export function AddresseeSheet(props: AddresseeSheetProps) {
  const { visible, title, confirmLabel, busy = false, warning = null, onConfirm, onCancel } = props;
  const { theme } = useTheme();
  const s = styles(theme);
  const [query, setQuery] = useState('');
  const multi = props.kind === 'multi';

  // Każde otwarcie zaczyna od pełnej listy - wpis z poprzedniego razu ukrywałby osoby.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const single = props.kind === 'multi' ? null : props;
  const options = single?.options ?? null;
  const multiVm = props.kind === 'multi' ? props.sheet : null;
  const shown = useMemo(() => (options == null ? [] : filterAddressees(options, query)), [options, query]);
  const sheet = useMemo(() => (multiVm == null ? null : filterSheet(multiVm, query)), [multiVm, query]);

  const search = multi ? 'Szukaj osoby albo grupy' : 'Szukaj osoby';

  return (
    <Sheet
      visible={visible}
      title={title}
      warning={warning ?? undefined}
      confirmLabel={confirmLabel}
      // Pusty wybór pojedynczy blokuje BEZ zdania: widać go z listy nad przyciskiem
      // (wąski wyjątek reguły issue #55). Wielokrotny wolno zatwierdzić pusty - tak się
      // odznacza wszystkich naraz.
      confirmDisabled={busy || (single != null && single.selected == null)}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <View style={s.search}>
        <Icon name="search" size={16} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={search}
          placeholderTextColor={theme.colors.textPlaceholder}
          selectionColor={theme.colors.selection}
          cursorColor={theme.colors.textPrimary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={search}
          style={s.searchInput}
        />
      </View>

      {single != null && (
        <>
          <AppText variant="micro" tone="muted" style={s.label}>
            Osoby
          </AppText>
          {shown.length === 0 ? (
            <AppText variant="body" style={s.empty}>
              {single.options.length === 0
                ? 'Wszyscy członkowie klubu są już w tym zleceniu.'
                : 'Nikogo o takim imieniu, nazwisku ani kodzie.'}
            </AppText>
          ) : (
            <View style={s.list}>
              {shown.map((option) => (
                <OptionRow
                  key={option.pilotId}
                  shape="round"
                  state={option.pilotId === single.selected ? 'on' : 'off'}
                  code={option.code}
                  name={option.name}
                  sub={option.sub}
                  onPress={() => single.onSelect(option.pilotId)}
                />
              ))}
            </View>
          )}
        </>
      )}

      {props.kind === 'multi' && sheet != null && (
        <>
          {sheet.groups.length === 0 && sheet.persons.length === 0 ? (
            <AppText variant="body" style={s.empty}>
              Ani osoby, ani grupy o takiej nazwie.
            </AppText>
          ) : null}
          {sheet.groups.length > 0 && (
            <>
              <AppText variant="micro" tone="muted" style={s.label}>
                Grupy
              </AppText>
              <View style={s.list}>
                {sheet.groups.map((group) => (
                  <OptionRow
                    key={group.id}
                    shape="square"
                    state={group.on ? 'on' : 'off'}
                    group
                    name={group.name}
                    sub={group.sub}
                    onPress={() => props.onToggle({ kind: 'group', id: group.id })}
                  />
                ))}
              </View>
            </>
          )}
          {sheet.persons.length > 0 && (
            <>
              {/* Osoby alfabetycznie po nazwisku, kod pilota w kwadracie - ta sama lista
                  członków klubu, co Duale na 02. */}
              <AppText variant="micro" tone="muted" style={[s.label, sheet.groups.length > 0 && s.next]}>
                Osoby
              </AppText>
              <View style={s.list}>
                {sheet.persons.map((person) => (
                  <OptionRow
                    key={person.pilotId}
                    shape="square"
                    state={person.state}
                    code={person.code}
                    name={person.name}
                    sub={person.sub}
                    onPress={() => props.onToggle({ kind: 'person', id: person.pilotId })}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

interface OptionRowProps {
  shape: 'round' | 'square';
  /** `inherit` = zaznaczona przez grupę - przygaszona i nie do odznaczenia. */
  state: 'on' | 'off' | 'inherit';
  group?: boolean;
  code?: string | null;
  name: string;
  sub: string | null;
  onPress: () => void;
}

function OptionRow({ shape, state, group = false, code, name, sub, onPress }: OptionRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const on = state === 'on';
  const inherit = state === 'inherit';

  return (
    <Pressable
      accessibilityRole={shape === 'round' ? 'radio' : 'checkbox'}
      accessibilityState={shape === 'round' ? { selected: on } : { checked: on || inherit, disabled: inherit }}
      accessibilityLabel={sub == null ? name : `${name}, ${sub}`}
      disabled={inherit}
      onPress={onPress}
      style={[s.row, on && s.rowOn]}
    >
      <View style={[s.avatar, on && s.avatarOn]}>
        {group ? (
          <Icon name="group" size={15} color={on ? theme.colors.green : theme.colors.textSecondary} />
        ) : (
          <AppText variant="mono" style={[s.avatarText, on && s.avatarTextOn]}>
            {code ?? ''}
          </AppText>
        )}
      </View>
      <View style={s.body}>
        <AppText variant="body" style={[s.name, (on || inherit) && s.nameOn]}>
          {name}
        </AppText>
        {sub != null && (
          <AppText variant="mono" style={s.sub}>
            {sub}
          </AppText>
        )}
      </View>
      <View style={[shape === 'round' ? s.radio : s.check, on && s.checkOn, inherit && s.checkInherit]}>
        {(on || inherit) && <CheckIcon size={12} color={inherit ? theme.colors.green : theme.colors.bg} />}
      </View>
    </Pressable>
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
    next: { marginTop: 8 },
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
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: t.colors.borderStrong,
    },
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
    checkInherit: { borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenMuted },
  });
