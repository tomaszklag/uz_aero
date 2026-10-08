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
import { ScrollView, StyleSheet } from 'react-native';

import { Banner, EmptyState, InboxRow, Screen, ScreenHeader, Skeleton } from '../components';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useFleet } from '../hooks/useFleet';
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

export function NotificationsScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { foreignClub?: true } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();

  const { data } = useInbox();
  const skeleton = useSkeleton(data === undefined);
  const regOf = useAircraftRegistrations();
  const pilots = usePilots();
  // Format licznika maszyny - do odczytu w wierszu „Zdana" (3.2.0); flota klubu aktywnego,
  // bo skrzynka jest per klub (§12.1).
  const { aircraft: fleet } = useFleet();

  const rows = useMemo(() => {
    if (data == null) return [];
    return inboxRows({
      items: data.items,
      todoIds: data.todoIds,
      answerIds: data.answerIds,
      now,
      regOf,
      nameOf: (id) => pilots.find((p) => p.id === id)?.name ?? null,
      mhFormatOf: (id) => fleet.find((a) => a.id === id)?.mhFormat ?? null,
    });
  }, [data, now, regOf, pilots, fleet]);

  const open = (row: InboxRowVm) => {
    if (row.opens == null) return;
    if (row.opens === 'aircraft') {
      if (row.aircraftId != null) navigation.navigate('Aircraft', { aircraftId: row.aircraftId });
      return;
    }
    // Zlecenie (4.0.0): karta sama rozstrzyga, kogo pokazuje (28, 32 albo 23F); wiersz
    // rozmowy otwiera od razu rozmowę - tę samą parę zlecenie × adresat, co budzik.
    if (row.opens === 'order' || row.opens === 'thread') {
      if (row.orderId == null) return;
      if (row.opens === 'thread' && row.recipientId != null) {
        navigation.navigate('OrderThread', { orderId: row.orderId, recipientId: row.recipientId });
      } else {
        navigation.navigate('Order', { orderId: row.orderId });
      }
      return;
    }
    if (row.bookingId == null) return;
    navigation.navigate(row.opens === 'decision' ? 'Decision' : 'BookingDetails', {
      bookingId: row.bookingId,
    });
  };

  const header = (
    <ScreenHeader
      title="POWIADOMIENIA"
      subtitle="CZAS KLUBU"
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
        {/* Budzik z klubu, który nie jest teraz aktywny (R6, obserwowanie §8): ekran
            otwarty tokenem klubu aktywnego odpowiedziałby 404, więc zamiast niego stoi
            instrukcja - przełączenie klubu jest decyzją pilota i wymaga sieci (§6). */}
        {route?.params?.foreignClub === true && (
          <Banner
            kind="status"
            tone="amber"
            title="Wiadomość z innego klubu"
            text="To powiadomienie dotyczy klubu, który nie jest teraz aktywny. Przełącz klub w Ustawieniach, żeby je otworzyć."
          />
        )}
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
            tone="amber"
            icon="offline"
            title="BRAK POŁĄCZENIA"
            lines={[
              [{ text: 'Powiadomienia ' }, { text: 'wymagają połączenia z internetem', bold: true }, { text: '.' }],
              [{ text: 'Wróć tu z zasięgiem. Lot rozpoczniesz bez tego ekranu - wystarczy „ROZPOCZNIJ LOT" na Pulpicie.' }],
            ]}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            tone="neutral"
            icon="bell"
            title="BRAK POWIADOMIEŃ"
            lines={[
              [
                { text: 'Tu trafiają ' },
                { text: 'wiadomości z klubu', bold: true },
                { text: ': o Twoich rezerwacjach, zleceniach lotów i obserwowanych samolotach.' },
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

const styles = (_t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { flexGrow: 1, padding: 14, gap: 8, paddingBottom: 28 },
  });
