/**
 * Ninerdeck - OrderRow (`.ord` z makiety 30; zlecenia 4.0.0, epik Z-C #247).
 *
 * Zwarty wiersz zlecenia, wzorem Historii (24): godziny i plakietka stanu → maszyna,
 * zadanie, trasa → postęp (mono, u prowadzącego) → fotel i osoba zlecająca (krój tekstu).
 * Cały wiersz jest celem dotknięcia, a szewron w stałej kolumnie mówi „prowadzi dalej".
 *
 * Kolor stoi tam, gdzie coś ZALEŻY OD PATRZĄCEGO (reguła SyncChipa, issue #12) - błękit
 * przy „Czeka na odpowiedź" i „Szuka …", zieleń przy locie, który już jest Twój, i przy
 * komplecie załogi. Ikona rozmowy z kropką stoi WYŁĄCZNIE przy nowej wiadomości - pusta
 * ikona przy każdym wierszu byłaby szumem. „Zakończone" przygasają kolorami, bez
 * przezroczystości.
 *
 * Zdania liczy `logic/orderList.ts` - tu jest wyłącznie kształt.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import type { ListPart, OrderRowVm } from '../../screens/logic/orderList';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Tag } from '../status/Tag';

export interface OrderRowProps {
  row: OrderRowVm;
  onPress: () => void;
}

export function OrderRow({ row, onPress }: OrderRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  const spoken = [row.hours, row.tag.text, row.aircraft, row.operation, row.route]
    .filter((p): p is string => p != null)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.unread ? `${spoken}, nowa wiadomość` : spoken}
      onPress={onPress}
      style={({ pressed }) => [s.ord, row.done && s.ordDone, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={s.main}>
        <View style={s.top}>
          <AppText variant="mono" style={[s.hours, row.done && s.hoursDone]}>
            {row.hours}
          </AppText>
          <View style={s.flags}>
            {row.unread && <MessageDot theme={theme} />}
            <Tag label={row.tag.text} tone={row.tag.tone} />
          </View>
        </View>

        <View style={s.line}>
          <AppText variant="mono" style={[s.ac, row.done && s.muted]}>
            {row.aircraft}
          </AppText>
          {row.operation != null && (
            <>
              <View style={s.dot} />
              <AppText variant="body" style={[s.op, row.done && s.muted]}>
                {row.operation}
              </AppText>
            </>
          )}
          {row.route != null && (
            <>
              <View style={s.dot} />
              <AppText variant="mono" style={[s.route, row.done && s.muted]}>
                {row.route}
              </AppText>
            </>
          )}
        </View>

        {row.progress != null && (
          <AppText variant="mono" style={s.progress}>
            {row.progress.map((part, i) => (
              <AppText key={i} variant="mono" style={[s.progress, toneStyle(part, theme)]}>
                {part.text}
              </AppText>
            ))}
          </AppText>
        )}

        {row.meta != null && (
          <AppText variant="body" style={s.meta}>
            {row.meta.map((part, i) => (
              <AppText key={i} variant="body" style={[s.meta, part.strong && !row.done && s.metaStrong]}>
                {part.text}
              </AppText>
            ))}
          </AppText>
        )}
      </View>

      <AppText variant="mono" style={s.go}>
        ›
      </AppText>
    </Pressable>
  );
}

const toneStyle = (part: ListPart, theme: Theme) =>
  part.tone === 'ok' ? { color: theme.colors.green } : part.tone === 'dim' ? { color: theme.colors.textPlaceholder } : null;

/** Ikona rozmowy z błękitną kropką - nowa wiadomość (`.msg-ind`). */
function MessageDot({ theme }: { theme: Theme }) {
  const s = styles(theme);
  return (
    <View style={s.msg} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name="message" size={14} color={theme.colors.textMuted} />
      <View style={s.msgDot} />
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    ord: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingLeft: 12,
      paddingRight: 10,
      borderRadius: 12,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    ordDone: { backgroundColor: 'transparent' },
    main: { flex: 1, minWidth: 0, gap: 4 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    hours: { fontSize: 12.5, fontWeight: '700', letterSpacing: 1, color: t.colors.textPrimary },
    hoursDone: { fontWeight: '500', color: t.colors.textSecondary },
    flags: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
    line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
    ac: { fontSize: 10.5, letterSpacing: 1, color: t.colors.textPrimary },
    op: { fontSize: 11.5, color: t.colors.textSecondary },
    route: { fontSize: 10, letterSpacing: 0.5, color: t.colors.textSecondary },
    muted: { color: t.colors.textMuted },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: t.colors.borderStrong },
    progress: { fontSize: 9.5, letterSpacing: 0.3, color: t.colors.textSecondary },
    meta: { fontSize: 10.5, lineHeight: 14.7, color: t.colors.textMuted },
    metaStrong: { color: t.colors.textSecondary, fontWeight: '600' },
    go: { width: 14, fontSize: 15, textAlign: 'center', color: t.colors.textMuted },
    msg: { position: 'relative' },
    // Kropka 7 px z pierścieniem w kolorze karty (`box-shadow: 0 0 0 2px` w makiecie) -
    // w RN pierścień jest obramowaniem, więc całość ma 11 px i stoi o 2 px dalej.
    msgDot: {
      position: 'absolute',
      top: -4,
      right: -5,
      width: 11,
      height: 11,
      borderRadius: 5.5,
      backgroundColor: t.colors.blue,
      borderWidth: 2,
      borderColor: t.colors.surface,
    },
  });
