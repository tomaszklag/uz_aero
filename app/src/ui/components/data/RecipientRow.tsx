/**
 * Ninerdeck - RecipientRow (`.rcp` z makiet 32, 32A, 32B): adresat zlecenia u prowadzącego.
 *
 * Nazwisko z kodem, a pod nim to, co osoba zrobiła - zdaniem BEZ PŁCI („Może lecieć",
 * „Nie może", „Odczytane"). Kolor ma wyłącznie „Może lecieć": to odpowiedź, na którą
 * prowadzący czeka. Bursztyn niesie „zmiana nieodczytana" (odczyt sprzed ostatniej edycji
 * może zmienić decyzję) i kolizję z inną rezerwacją tej osoby; błękit - „także na …",
 * czyli informację o zleceniu, która zmienia wybór (pkt 38).
 *
 * Po prawej stała kolumna: rozmowa (kropka przy nowej wiadomości), menu ⋯ (32D) i przycisk
 * przydziału. „WYBIERZ" stoi WYŁĄCZNIE przy „Może lecieć" - przy innych odpowiedziach nie
 * ma kogo wybierać, a wyszarzony obiecywałby akcję, której reguły nie dopuszczą. Obramowany,
 * nie wypełniony: w karcie stoi kilka takich naraz, a akcja główna ekranu jest jedna.
 *
 * `muted` - zwinięci „Pozostali adresaci" (32B): bez zieleni i bez akcji, bo fotel jest
 * zajęty; kolor wraca razem z przyciskiem, gdy fotel znów zacznie szukać.
 *
 * Zdania liczy `logic/orderLeaderCard.ts` - tu jest wyłącznie kształt.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { RemoteSeat } from '../../../application';
import { useTheme, type Theme } from '../../theme';
import type { LeaderRowVm, StatusPart } from '../../screens/logic/orderLeaderCard';
import { AppText } from '../foundation/AppText';
import { IconAction } from './IconAction';

export interface RecipientRowProps {
  row: LeaderRowVm;
  muted?: boolean;
  /** Linia pod wierszem - każdy poza ostatnim w karcie. */
  divider?: boolean;
  /** Przydział w toku - przyciski przydziału czekają na odpowiedź. */
  busy?: boolean;
  onThread?: () => void;
  onMenu?: () => void;
  onPick?: (seat: RemoteSeat) => void;
}

export function RecipientRow({ row, muted = false, divider = false, busy = false, onThread, onMenu, onPick }: RecipientRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={[s.row, divider && s.divider]}>
      <View style={s.main}>
        <AppText variant="body" style={[s.name, muted && s.nameMuted]}>
          {row.name}
          {row.code != null && (
            <AppText variant="mono" style={s.code}>
              {`  ${row.code}`}
            </AppText>
          )}
        </AppText>
        <AppText variant="mono" style={[s.status, muted && s.mutedText]}>
          {row.status.map((part, i) => (
            <AppText key={i} variant="mono" style={[s.status, muted ? s.mutedText : toneOf(part, theme)]}>
              {part.text}
            </AppText>
          ))}
        </AppText>
        {row.warn != null && (
          <AppText variant="mono" style={[s.status, s.warn]}>
            {row.warn}
          </AppText>
        )}
        {row.conflict != null && (
          <AppText variant="mono" style={[s.status, s.warn]}>
            {row.conflict}
          </AppText>
        )}
        {row.also != null && (
          <AppText variant="mono" style={s.also}>
            {row.also}
          </AppText>
        )}
        {row.reason != null && row.reason.trim() !== '' && (
          <AppText variant="body" style={[s.reason, muted && s.mutedText]}>
            „{row.reason.trim()}"
          </AppText>
        )}
      </View>

      <View style={s.actions}>
        {row.thread != null && onThread != null && (
          <IconAction name="message" accessibilityLabel={`Rozmowa · ${row.name}`} dot={row.unread} onPress={onThread} />
        )}
        {row.menu && onMenu != null && <IconAction name="overflow" accessibilityLabel={`Więcej · ${row.name}`} onPress={onMenu} />}
        {!muted &&
          onPick != null &&
          row.picks.map((pick) => (
            <Pressable
              key={pick.seat}
              accessibilityRole="button"
              accessibilityLabel={`${pick.label} · ${row.name}`}
              disabled={busy}
              onPress={() => onPick(pick.seat)}
              style={({ pressed }) => [s.pick, (pressed || busy) && { opacity: pressed ? 0.7 : 0.45 }]}
            >
              <AppText variant="display" style={s.pickText}>
                {pick.label}
              </AppText>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

const toneOf = (part: StatusPart, theme: Theme) =>
  part.tone === 'ok'
    ? { color: theme.colors.green }
    : part.tone === 'no'
      ? { color: theme.colors.textMuted }
      : part.tone === 'unread'
        ? { color: theme.colors.textPlaceholder }
        : null;

const styles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingLeft: 13,
      paddingRight: 8,
    },
    divider: { borderBottomWidth: t.borderWidth, borderBottomColor: t.colors.border },
    main: { flex: 1, minWidth: 0, gap: 3 },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    name: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 13, lineHeight: 17, color: t.colors.textPrimary },
    nameMuted: { color: t.colors.textSecondary },
    code: { fontSize: 9, letterSpacing: 0.5, color: t.colors.textMuted },
    status: { fontSize: 9.5, lineHeight: 13, letterSpacing: 0.3, color: t.colors.textSecondary },
    mutedText: { color: t.colors.textMuted },
    warn: { color: t.colors.amber },
    also: { fontSize: 9, lineHeight: 12, letterSpacing: 0.3, color: t.colors.blue },
    reason: { fontSize: 11, lineHeight: 15, color: t.colors.textSecondary },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    pick: {
      marginLeft: 4,
      paddingTop: 7,
      paddingBottom: 6,
      paddingHorizontal: 10,
      borderRadius: 9,
      borderWidth: t.borderWidth,
      borderColor: t.colors.greenBorder,
      backgroundColor: t.colors.greenMuted,
    },
    pickText: { fontSize: 13, lineHeight: 15, letterSpacing: 1.2, color: t.colors.green },
  });
