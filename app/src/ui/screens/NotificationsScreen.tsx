/**
 * Ninerdeck - 25 POWIADOMIENIA: skrzynka decyzji i próśb (3.1.0, epik R-I;
 * makiety `25`, `25A` pusto, `25B` bez zasięgu; `docs/rezerwacje.md` §9.4, §12).
 *
 * ══ WEJŚCIE JEST DZWONKIEM, NIE ZAKŁADKĄ ══
 * Trzy zakładki odpowiadają na trzy pytania W CZASIE; skrzynka odpowiada na „co ktoś
 * do mnie ma" i czwartej pozycji nie dostała (§9.4). Wchodzi się z dzwonka na Pulpicie,
 * wychodzi tam, skąd się przyszło.
 *
 * ══ LISTA CZYTA SIĘ RAZ ══
 * Chronologia bez przypinania spraw: wiersz „Do decyzji" prowadzi na ekran decyzji (26),
 * każdy inny w kartę rezerwacji (23), a to, co od pilota zależy, mówi plakietka - nie
 * kolejność. Rozstrzygnięcie wraca na tę listę samo: `useInbox` pyta serwer przy każdym
 * fokusie ekranu.
 *
 * ══ BEZ SIECI NIE MA CZEGO POKAZAĆ ══
 * Skrzynkę trzyma serwer (§12.1), a stan „nie wiem" rysuje się jako 25B - pusta lista
 * wyglądałaby jak „nic nie przyszło". Lot i tak rozpoczyna się bez tego ekranu.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Icon, InboxRow, Screen, ScreenHeader, Skeleton, type IconName } from '../components';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useInbox } from '../hooks/useInbox';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useTheme, type Theme } from '../theme';

import { inboxRows, type InboxRowVm } from './logic/inbox';

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
};

export function NotificationsScreen({ navigation }: { navigation: Nav }) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();

  const { data } = useInbox();
  const skeleton = useSkeleton(data === undefined);
  const regOf = useAircraftRegistrations();
  const pilots = usePilots();

  const rows = useMemo(() => {
    if (data == null) return [];
    return inboxRows({
      items: data.items,
      todoIds: data.todoIds,
      now,
      regOf,
      nameOf: (id) => pilots.find((p) => p.id === id)?.name ?? null,
    });
  }, [data, now, regOf, pilots]);

  const open = (row: InboxRowVm) => {
    if (row.bookingId == null || row.opens == null) return;
    navigation.navigate(row.opens === 'decision' ? 'Decision' : 'BookingDetails', {
      bookingId: row.bookingId,
    });
  };

  const header = (
    <ScreenHeader
      title="POWIADOMIENIA"
      subtitle="CZASY KLUBU"
      size="md"
      backLabel="Pulpit"
      onBack={() => navigation.goBack()}
    />
  );

  return (
    <Screen padded={false} header={header}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {data === undefined ? (
          skeleton ? (
            <>
              <Skeleton height={68} radius={12} />
              <Skeleton height={68} radius={12} />
              <Skeleton height={68} radius={12} />
            </>
          ) : null
        ) : data === null ? (
          <EmptyState
            theme={theme}
            tone="amber"
            icon="offline"
            title="BRAK POŁĄCZENIA"
            lines={[
              [{ text: 'Powiadomienia ' }, { text: 'trzyma serwer', bold: true }, { text: ' - telefon nie ma ich u siebie.' }],
              [{ text: 'Wróć tu z zasięgiem. Lot rozpoczniesz bez tego ekranu - wystarczy „ROZPOCZNIJ LOT" na Pulpicie.' }],
            ]}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            theme={theme}
            tone="neutral"
            icon="bell"
            title="NIC NIE PRZYSZŁO"
            lines={[
              [
                { text: 'Tu trafiają ' },
                { text: 'decyzje o Twoich rezerwacjach', bold: true },
                { text: ' i prośby o Twoją zgodę, jeśli rozstrzygasz cudze.' },
              ],
            ]}
          />
        ) : (
          rows.map((row) => (
            <InboxRow key={row.id} row={row} onPress={row.opens == null ? undefined : () => open(row)} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

type Line = { text: string; bold?: boolean }[];

/**
 * Stan pusty i stan bez zasięgu (`.empty-wrap`) - ten sam układ, inny ton. Pusty mówi,
 * CO tu trafia, a nie „brak danych"; bez zasięgu mówi, KTO trzyma skrzynkę i że lot
 * się bez niej zaczyna.
 */
function EmptyState({
  theme,
  tone,
  icon,
  title,
  lines,
}: {
  theme: Theme;
  tone: 'amber' | 'neutral';
  icon: IconName;
  title: string;
  lines: Line[];
}) {
  const s = styles(theme);
  const amber = tone === 'amber';
  const accent = amber ? theme.colors.amber : theme.colors.textMuted;

  return (
    <View style={s.empty}>
      <View style={[s.emptyIcon, amber && s.emptyIconAmber]}>
        <Icon name={icon} size={26} color={accent} />
      </View>
      <AppText variant="display" style={[s.emptyTitle, amber && { color: theme.colors.amber }]}>
        {title}
      </AppText>
      {lines.map((line, i) => (
        <AppText key={i} variant="body" style={s.emptyText}>
          {line.map((part, k) => (
            <AppText key={k} variant="body" style={[s.emptyText, part.bold && s.emptyBold]}>
              {part.text}
            </AppText>
          ))}
        </AppText>
      ))}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { flexGrow: 1, padding: 14, gap: 8, paddingBottom: 28 },

    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      paddingHorizontal: 26,
      paddingBottom: 60,
    },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surface,
    },
    emptyIconAmber: { borderColor: t.colors.amberBorder, backgroundColor: t.colors.amberMuted },
    emptyTitle: { fontSize: 30, lineHeight: 32, letterSpacing: 3, textAlign: 'center' },
    emptyText: { fontSize: 13, lineHeight: 19, color: t.colors.textSecondary, textAlign: 'center' },
    emptyBold: { color: t.colors.textPrimary, fontWeight: '600' },
  });
