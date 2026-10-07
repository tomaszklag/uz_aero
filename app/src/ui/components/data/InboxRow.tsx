/**
 * Ninerdeck - InboxRow (`.n` z makiety 25, 3.1.0, epik R-I).
 *
 * Wiersz skrzynki: ikona w tonie rodzaju, treść (tytuł, termin, powód, plakietka sprawy)
 * i wiek po prawej. Dwa znaki stanu i oba celowo różne:
 *  - NOWE od ostatniego wejścia to KRAWĘDŹ przy brzegu (zielona linia + mocniejszy
 *    obrys), nie wyróżnione tło - wiersz ma zostać wierszem, a tło niosłoby stan
 *    mocniej niż samą treść;
 *  - DO DECYZJI to plakietka przy treści - jedyna zielona rzecz w tej liście i dlatego
 *    widoczna; świeci wyłącznie tam, gdzie coś od pilota ZALEŻY (reguła SyncChipa).
 * Przeczytane BLEDNIE, ale nie znika: skrzynka jest też miejscem, w którym sprawdza
 * się, co ktoś odpowiedział trzy dni temu.
 *
 * Wiersz zlecenia (4.0.0, makieta 25D) mówi zdaniem w KAWAŁKACH (`parts`): nazwisko
 * pogrubione, wartość sprzed zmiany przekreślona, nowa pogrubiona, „może lecieć" zielenią -
 * i ma własny znak w ikonie (kartka zlecenia, dymek rozmowy, klepsydra…). Plakietka sprawy
 * mówi tam „Do odpowiedzi", a rozmowa dokłada błękitny licznik nowych wiadomości.
 *
 * Treść wiersza (`InboxRowContent`: ikona, zdania, wiek) jest wspólna z banerem w aplikacji
 * (kanał klubu 4.0.0, makieta 25E) - baner mówi zdaniem wiersza słowo w słowo, więc ma też
 * jego kształt. Różnice należą do banera: nazwa klubu nad tytułem i o pół stopnia większy
 * tytuł i zdanie (`prominent`), bo baner czyta się w przelocie, nad cudzym ekranem.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import type { InboxGlyph, InboxPart, InboxRowVm, InboxTone } from '../../screens/logic/inbox';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { Tag } from '../status/Tag';
import { toneColors, type Tone } from '../tone';

export interface InboxRowProps {
  row: InboxRowVm;
  onPress?: () => void;
}

const ICON: Record<InboxTone, IconName> = {
  ask: 'clock',
  ok: 'check',
  no: 'clear',
  warn: 'warning',
  info: 'info',
  news: 'info',
};

/** Własny znak wiersza zlecenia - glify z makiety 25D. */
const GLYPH: Record<InboxGlyph, IconName> = {
  order: 'order',
  message: 'message',
  edit: 'edit',
  clock: 'clock',
  expired: 'order-expired',
  removed: 'order-removed',
  stale: 'order-stale',
  'person-ok': 'crew',
  'person-off': 'person-off',
  resign: 'resign',
  unassign: 'unassign',
};

const TONE: Record<InboxTone, Tone> = {
  ask: 'blue',
  ok: 'green',
  no: 'red',
  warn: 'amber',
  info: 'neutral',
  // Rzecz, która się DZIEJE z obserwowaną maszyną (25C): błękit, jak prośba.
  news: 'blue',
};

export function InboxRow({ row, onPress }: InboxRowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Pressable
      accessibilityRole={onPress == null ? undefined : 'button'}
      accessibilityLabel={`${row.title}${row.sub == null ? '' : `, ${row.sub}`}, ${row.when}`}
      disabled={onPress == null}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        row.isNew && s.rowNew,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {row.isNew && <View style={s.edge} />}
      <InboxRowContent row={row} />
    </Pressable>
  );
}

export interface InboxRowContentProps {
  row: InboxRowVm;
  /** Nazwa klubu nad tytułem - baner wiadomości z innego klubu; lista skrzynki jej nie ma. */
  club?: string | null;
  /** Baner w aplikacji: tytuł i zdanie o pół stopnia większe (makieta 25E). */
  prominent?: boolean;
}

/** Ikona w tonie rodzaju, zdania wiersza i wiek - bez ramy wiersza listy. */
export function InboxRowContent({ row, club = null, prominent = false }: InboxRowContentProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const c = toneColors(theme, TONE[row.tone]);

  return (
    <>
      <View style={[s.icon, { borderColor: c.border, backgroundColor: c.muted }]}>
        <Icon name={row.glyph == null ? ICON[row.tone] : GLYPH[row.glyph]} size={15} color={c.accent} />
      </View>

      <View style={s.body}>
        {club != null && (
          <View style={s.club}>
            <AppText variant="mono" style={s.clubText} numberOfLines={1}>
              {club}
            </AppText>
          </View>
        )}
        <AppText variant="body" style={[s.title, !row.isNew && s.titleRead, prominent && s.titleProminent]}>
          {row.title}
        </AppText>
        {row.sub != null && (
          <AppText variant="mono" style={s.sub}>
            {row.sub}
          </AppText>
        )}
        {row.parts != null ? (
          <AppText variant="body" style={[s.reason, prominent && s.reasonProminent]}>
            {row.parts.map((part, i) => (
              <AppText key={i} variant="body" style={[s.reason, prominent && s.reasonProminent, partStyle(part, s)]}>
                {part.text}
              </AppText>
            ))}
          </AppText>
        ) : (row.reason != null || row.lead != null) && (
          <AppText variant="body" style={[s.reason, prominent && s.reasonProminent]}>
            {/* Wyróżniony początek („Poza planem", „Paliwo 128 L") - ton z makiety 25C:
                bursztyn mówi „uwaga", zieleń „w normie"; reszta zdania tonem podpisu. */}
            {row.lead != null && (
              <AppText
                variant="body"
                style={[s.reason, s.lead, { color: row.lead.tone === 'amber' ? theme.colors.amber : theme.colors.green }]}
              >
                {row.lead.text}
              </AppText>
            )}
            {row.reason}
          </AppText>
        )}
        {row.late != null && (
          <AppText variant="mono" style={s.late}>
            {row.late}
          </AppText>
        )}
        {row.todo && <Tag label={row.todoLabel ?? 'Do decyzji'} tone="green" size="sm" />}
        {row.count != null && <Tag label={row.count} tone="blue" size="sm" />}
      </View>

      <AppText variant="mono" style={s.when}>
        {row.when}
      </AppText>
    </>
  );
}

/** Skład kawałka zdania: `.n-reason b`, `.n-reason s` i `.n-reason .ok` z makiety 25D. */
function partStyle(part: InboxPart, s: ReturnType<typeof styles>) {
  if (part.tone === 'ok') return s.partOk;
  if (part.strike === true) return s.partStrike;
  if (part.strong === true) return s.partStrong;
  return null;
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingTop: 11,
      paddingBottom: 11,
      paddingLeft: 11,
      paddingRight: 12,
      borderRadius: 12,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      overflow: 'hidden',
    },
    rowNew: { borderColor: t.colors.borderStrong },
    edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: t.colors.green },
    icon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      flexShrink: 0,
    },
    body: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
    title: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: t.colors.textPrimary },
    titleRead: { fontWeight: '500', color: t.colors.textSecondary },
    titleProminent: { fontSize: 13, lineHeight: 17.5 },
    // `.inapp-club` z makiety 25E - ta sama plakietka klubu, co na kafelku operacji pilota
    // dwóch klubów (01E); przy klubie aktywnym byłaby szumem, więc jej tam nie ma.
    club: {
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
      borderRadius: 5,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 2,
      maxWidth: 220,
    },
    clubText: { fontSize: 7.5, lineHeight: 10, letterSpacing: 1, textTransform: 'uppercase', color: t.colors.textSecondary },
    // Odstęp mniejszy niż w innych podpisach mono: termin to znak, data i para godzin,
    // czyli najdłuższy napis w tej liście - przy 1 px łamał się na dwie linie.
    sub: { fontSize: 9.5, lineHeight: 13, letterSpacing: 0.5, textTransform: 'uppercase', color: t.colors.textMuted },
    reason: { fontSize: 11, lineHeight: 16.5, color: t.colors.textSecondary },
    reasonProminent: { fontSize: 11.5, lineHeight: 16.5 },
    lead: { fontWeight: '600' },
    // Grubość idzie osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na
    // czcionkach wczytanych z pakietu (typografia w `@ninerdeck/tokens`).
    partStrong: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.textPrimary },
    partStrike: { textDecorationLine: 'line-through', color: t.colors.textMuted },
    partOk: { fontFamily: t.fontFamily.bodySemiBold, color: t.colors.green },
    // `.n-late`: zwłoka zapisu w tonie podpisu - fakt o rejestrze, nie o locie.
    late: { fontSize: 8.5, lineHeight: 12, letterSpacing: 0.8, color: t.colors.textMuted },
    when: { fontSize: 9, lineHeight: 12, letterSpacing: 1, color: t.colors.textMuted, paddingTop: 2, flexShrink: 0 },
  });
