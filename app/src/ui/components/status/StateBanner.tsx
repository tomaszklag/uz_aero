/**
 * Ninerdeck - StateBanner (`.state-banner` z makiet 23B–23E, 28B): „co się stało".
 *
 * Stoi NAD kartą terminu, bo odpowiada na pierwsze pytanie wchodzącego („czy to mnie
 * jeszcze dotyczy"), a nie na drugie („o której"). Tytuł pogrubiony, pod nim zdanie,
 * cytat i chwila - każde z nich opcjonalne, bo nie każdy los ma powód i godzinę.
 *
 * Czym różni się od `Banner`: tamten jest komunikatem o stanie EKRANU w taksonomii
 * status / ostrzeżenie / pouczenie, z tytułem w kolorze tonu. Ten opisuje LOS RZECZY,
 * którą pilot ogląda, i ton idzie za przyczyną:
 *  - `neutral` - fotel obsadzony, zlecenie cofnięte albo wygasłe: nic tu nie jest błędem,
 *                a pilot nie ma czego naprawiać;
 *  - `amber`   - czeka na cudzą decyzję;
 *  - `red`     - odwołanie: czerwień niesie w tej aplikacji rzecz niszczącą, i tylko ją.
 *
 * Powód stoi w cudzysłowie - to zdanie człowieka, nie aplikacji. Kursywy z makiety nie ma
 * (krój bez wariantu italic na Androidzie podmienia się na systemowy).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors } from '../tone';

export interface StateBannerProps {
  icon: IconName;
  /** „Fotel obsadzony" / „Odwołanie · Marta Zięba". */
  title: string;
  text?: string | null;
  /** Powód - zdanie człowieka, w cudzysłowie. */
  quote?: string | null;
  /** „dziś 16:20". */
  meta?: string | null;
  tone?: 'neutral' | 'amber' | 'red';
}

export function StateBanner({ icon, title, text = null, quote = null, meta = null, tone = 'neutral' }: StateBannerProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const c = tone === 'neutral' ? null : toneColors(theme, tone);

  return (
    <View
      style={[
        s.banner,
        c == null
          ? { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }
          : { borderColor: c.border, backgroundColor: c.muted },
      ]}
    >
      <Icon name={icon} size={16} color={c?.accent ?? theme.colors.textSecondary} style={s.icon} />
      <View style={s.body}>
        <AppText variant="body" style={s.title}>
          {title}
        </AppText>
        {text != null && (
          <AppText variant="body" style={s.text}>
            {text}
          </AppText>
        )}
        {quote != null && quote.trim() !== '' && (
          <AppText variant="body" style={s.quote}>
            „{quote.trim()}"
          </AppText>
        )}
        {meta != null && (
          <AppText variant="mono" style={s.meta}>
            {meta}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 13,
      borderRadius: t.radius.btn,
      borderWidth: t.borderWidth,
    },
    icon: { marginTop: 1 },
    body: { flex: 1, minWidth: 0 },
    title: { marginBottom: 2, fontFamily: t.fontFamily.bodySemiBold, fontSize: 12.5, lineHeight: 18, color: t.colors.textPrimary },
    text: { fontSize: 12, lineHeight: 18.5, color: t.colors.textSecondary },
    quote: { fontSize: 12, lineHeight: 18.5, color: t.colors.textPrimary },
    meta: { marginTop: 4, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.colors.textMuted },
  });
