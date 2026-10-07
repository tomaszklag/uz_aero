/**
 * Ninerdeck - MessageBubble (`.msg` z makiet 29, 29A, 29B): wiadomość w rozmowie zlecenia.
 *
 * Dymki różni STRONA i odcień, nie kolor akcentu: zieleń znaczy w tej aplikacji „w normie"
 * albo akcję główną, więc własne wiadomości w zieleni świeciłyby jak przyciski. Własne -
 * jaśniejsza powierzchnia po prawej; drugiej strony - karta po lewej. U czytelnika (29B)
 * żaden dymek nie jest „własny": oba mają ton karty, a stronę niesie położenie i odbite
 * zaokrąglenie, nazwisko zaś stoi nad pierwszym dymkiem serii.
 *
 * „Odczytane" (błękit) stoi pod jedną wiadomością - kiedy, rozstrzyga `logic/orderThread.ts`.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface MessageBubbleProps {
  side: 'left' | 'right';
  own: boolean;
  author: { name: string; code: string | null } | null;
  body: string;
  time: string;
  read: string | null;
}

export function MessageBubble({ side, own, author, body, time, read }: MessageBubbleProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const right = side === 'right';

  return (
    <View style={[s.msg, right ? s.right : s.left]}>
      {author != null && (
        <AppText variant="body" style={s.author}>
          {author.name}
          {author.code != null && (
            <AppText variant="mono" style={s.code}>
              {`  ${author.code}`}
            </AppText>
          )}
        </AppText>
      )}
      <View style={[s.bubble, right ? s.bubbleRight : s.bubbleLeft, own && s.own]}>
        <AppText variant="body" style={s.body}>
          {body}
        </AppText>
      </View>
      <AppText variant="mono" style={s.time}>
        {time}
      </AppText>
      {read != null && (
        <AppText variant="mono" style={s.read}>
          {read}
        </AppText>
      )}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    msg: { maxWidth: '80%', gap: 3 },
    left: { alignSelf: 'flex-start' },
    right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    author: { marginTop: 4, paddingHorizontal: 4, paddingBottom: 1, fontFamily: t.fontFamily.bodySemiBold, fontSize: 10.5, lineHeight: 14, color: t.colors.textSecondary },
    code: { fontSize: 8.5, letterSpacing: 0.5, color: t.colors.textMuted },
    bubble: {
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    bubbleLeft: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomRightRadius: 14, borderBottomLeftRadius: 4 },
    bubbleRight: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 4 },
    own: { borderColor: t.colors.borderStrong, backgroundColor: t.colors.surfaceHover },
    body: { fontSize: 13, lineHeight: 19, color: t.colors.textPrimary },
    time: { paddingHorizontal: 4, fontSize: 8.5, lineHeight: 11, letterSpacing: 0.5, color: t.colors.textMuted },
    read: { paddingHorizontal: 4, fontSize: 8.5, lineHeight: 11, letterSpacing: 0.5, color: t.colors.blue },
  });
