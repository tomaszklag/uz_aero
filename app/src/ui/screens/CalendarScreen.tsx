/**
 * Ninerdeck - 21 KALENDARZ: zajętość floty (rezerwacje 3.0.0, epik R-F, #162 F3).
 *
 * Jedna doba, wszystkie maszyny, siatka w oknie doby lotnej i w CZASIE KLUBU. Osią
 * porównania są MASZYNY, bo pytanie brzmi „który samolot jest wolny i kiedy" - tydzień
 * jednej maszyny odpowiadałby na inne pytanie i kazałby przełączać się między nimi,
 * żeby dowiedzieć się czegokolwiek o flocie.
 *
 * ══ WYŁĄCZNIE ONLINE, I TO WIDAĆ ══
 * Cały moduł wymaga sieci (decyzja właściciela 2026-09-20, `docs/rezerwacje.md` §2.2).
 * Bez odpowiedzi serwera ekran mówi to wprost (21B) zamiast rysować pustą siatkę -
 * ta wyglądałaby dokładnie jak flota wolna na wylot, a „nie wiem" i „wszystko wolne"
 * to dwie różne odpowiedzi. Przycisku „ZAREZERWUJ" wtedy NIE MA: wyszarzony obiecywałby
 * akcję, której reguły nie dopuszczą (zasada z 10B i 02G).
 *
 * ZĘBATKI TU NIE MA (issue #82) - ustawienia mają jedno wejście, na Pulpicie.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Card,
  DayChips,
  FilterChip,
  FleetAxis,
  FleetFilterSheet,
  Icon,
  IconAction,
  ReservationCard,
  Screen,
  ScreenHeader,
  Skeleton,
} from '../components';
import { useFleet } from '../hooks/useFleet';
import { useCalendar } from '../hooks/useCalendar';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilotCode, usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useCurrentPilot } from '../store/currentPilot';
import { useFleetFilter } from '../store/fleetFilter';
import { useTheme, type Theme } from '../theme';

import {
  filterLabel,
  isNarrowed,
  visibleAircraft,
} from './logic/aircraftFilter';
import { bookingsOnDay } from './logic/calendarData';
import { buildDayChips, defaultDay } from './logic/calendarDays';
import { buildFleetGrid } from './logic/calendarGrid';
import { buildMyBookings } from './logic/calendarMine';
import { dayHeading } from './logic/calendarHeading';

type Nav = { navigate: (screen: string, params?: object) => void };

export function CalendarScreen({ navigation }: { navigation: Nav }) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();

  const pilotId = useCurrentPilot((p) => p.id);
  const codeOf = usePilotCode();
  const pilots = usePilots();
  const { aircraft: fleet } = useFleet();
  const filter = useFleetFilter();
  const { data } = useCalendar();

  const [picked, setPicked] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const skeleton = useSkeleton(data === undefined);

  // Doba wybrana ręcznie wygrywa z domyślną, ale tylko dopóki jest w oknie - po zmianie
  // okna (powrót na zakładkę nazajutrz) wracamy do dzisiejszej zamiast pokazywać pustkę.
  const selected = useMemo(() => {
    const fallback = data == null ? null : defaultDay(data.days, now);
    if (data == null) return null;
    return picked != null && data.days.some((d) => d.date === picked) ? picked : fallback;
  }, [data, picked, now]);

  const day = data?.days.find((d) => d.date === selected) ?? null;

  const nameOf = useMemo(
    () => (id: string | null) => (id == null ? null : (pilots.find((p) => p.id === id)?.name ?? null)),
    [pilots],
  );

  const shown = visibleAircraft(fleet, filter.hidden);

  const grid = useMemo(
    () =>
      data == null || day == null
        ? null
        : buildFleetGrid({
            day,
            aircraft: shown,
            bookings: data.bookings,
            homeIcao: data.homeIcao,
            pilotId,
            codeOf,
            nameOf,
            now,
          }),
    [data, day, shown, pilotId, codeOf, nameOf, now],
  );

  const mine = useMemo(
    () =>
      data == null || day == null
        ? []
        : buildMyBookings({ day, bookings: data.bookings, aircraft: fleet, pilotId, codeOf }),
    [data, day, fleet, pilotId, codeOf],
  );

  const header = (
    <ScreenHeader
      title="KALENDARZ"
      size="md"
      subtitle="FLOTA · CZAS KLUBU"
      right={
        <IconAction
          name="add"
          accessibilityLabel="Nowa rezerwacja"
          onPress={() => navigation.navigate('NewBooking')}
        />
      }
    />
  );

  if (data === null) {
    return (
      <Screen padded={false} header={header}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Offline theme={theme} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen padded={false} header={header}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {data === undefined ? (
          skeleton ? (
            <CalendarSkeleton theme={theme} />
          ) : null
        ) : (
          <>
            <DayChips
              days={buildDayChips({
                days: data.days,
                bookings: data.bookings,
                pilotId,
                selected: selected ?? '',
                now,
              })}
              onSelect={setPicked}
            />

            {grid != null && day != null && (
              <FleetAxis
                grid={grid}
                header={
                  <View style={s.gridHead}>
                    <AppText variant="mono" style={s.gridTitle}>
                      {dayHeading(day)}
                    </AppText>
                    <FilterChip
                      label={filterLabel(shown.length, fleet.length)}
                      active={isNarrowed(shown.length, fleet.length)}
                      accessibilityLabel="Które samoloty na osi"
                      onPress={() => setFilterOpen(true)}
                    />
                  </View>
                }
                onOpen={(bookingId) => navigation.navigate('BookingDetails', { bookingId })}
                onPick={(aircraftId, at) =>
                  navigation.navigate('NewBooking', { aircraftId, startsAt: at })
                }
                // Karta maszyny (27) - wyłącznie dla osoby ze zdolnością „Obserwowanie
                // samolotów"; bez niej nagłówek wiersza jest samą etykietą (makieta 21).
                onOpenAircraft={
                  data.canWatch ? (aircraftId) => navigation.navigate('Aircraft', { aircraftId }) : undefined
                }
              />
            )}

            {/* Stan pusty mówi, CO SIĘ STANIE po tapnięciu, a nie „brak danych": doba
                bez zajętości jest w klubie normalna, a nie awaryjna. */}
            {grid != null && grid.legend.length === 0 && (
              <View style={s.emptyNote}>
                <Icon name="calendar" size={15} color={theme.colors.textMuted} />
                <AppText variant="body" style={s.emptyText}>
                  Cała flota wolna. Tapnij w pasmo godzin, żeby zarezerwować maszynę.
                </AppText>
              </View>
            )}

            {mine.length > 0 && (
              <>
                <AppText variant="mono" style={s.groupLabel}>
                  Twoje rezerwacje
                </AppText>
                {mine.map((booking) => (
                  <ReservationCard
                    key={booking.bookingId}
                    booking={booking}
                    onPress={() =>
                      navigation.navigate('BookingDetails', { bookingId: booking.bookingId })
                    }
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Pas akcji jest PRZYPIĘTY: kalendarz przewija się (flota bywa dłuższa niż ekran),
          więc główna akcja nie może mieszkać na dnie treści - przy dwunastu maszynach
          pilot musiałby jej szukać przewijaniem. */}
      <View style={s.actionBar}>
        <ActionButton
          label="ZAREZERWUJ"
          icon="add"
          tone="green"
          onPress={() => navigation.navigate('NewBooking')}
        />
      </View>

      <FleetFilterSheet
        visible={filterOpen}
        aircraft={fleet}
        bookings={day == null ? [] : bookingsOnDay(data?.bookings ?? [], day)}
        hidden={filter.hidden}
        onConfirm={(next) => {
          filter.save(next);
          setFilterOpen(false);
        }}
        onCancel={() => setFilterOpen(false)}
      />
    </Screen>
  );
}

/**
 * 21B - kalendarz wymaga sieci.
 *
 * Bez pasa akcji: rezerwacji i tak nie da się zapisać, a wyszarzony przycisk
 * obiecywałby akcję, której reguły nie dopuszczą (zasada z 10B i 02G).
 *
 * PRZYCISKU PONOWIENIA TEŻ NIE MA - drogą wyjścia jest zdanie „Wróć tu z zasięgiem",
 * a pytanie ponawia samo wejście na zakładkę (`useFocusEffect` w `useCalendar`).
 * Tak rysuje to makieta i tak zostaje: ekran bez sieci ma powiedzieć, co się dzieje,
 * a nie dokładać kontrolki do klikania w oczekiwaniu na zasięg.
 */
function Offline({ theme }: { theme: Theme }) {
  const s = styles(theme);

  return (
    <Card flush>
      <View style={s.warning}>
        <Icon name="offline" size={30} color={theme.colors.amber} />
        <AppText variant="display" style={s.warningTitle}>
          BRAK POŁĄCZENIA
        </AppText>
        <AppText variant="body" style={s.warningText}>
          Kalendarz floty pokazuje, co jest zajęte w tej chwili - a tego telefon nie wie
          bez połączenia z serwerem.
        </AppText>
        <AppText variant="body" style={s.warningText}>
          Wróć tu z zasięgiem. Lot możesz rozpocząć bez rezerwacji - wystarczy
          „ROZPOCZNIJ LOT" na Pulpicie.
        </AppText>
      </View>
    </Card>
  );
}

/**
 * Plamki w geometrii docelowej (issue #33): pasek dni i karta osi. Liczby maszyn nie
 * znamy przed odpowiedzią, więc karta ma wysokość CZĘŚCI WSPÓLNEJ - trzy wiersze,
 * tyle, ile ma najmniejsza sensowna flota.
 */
function CalendarSkeleton({ theme }: { theme: Theme }) {
  const s = styles(theme);

  return (
    <>
      <View style={s.skeletonDays}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} width={46} height={46} radius={11} />
        ))}
      </View>
      <Skeleton height={168} radius={14} />
    </>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 14, gap: 12 },
    gridHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    gridTitle: {
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: t.colors.textMuted,
    },
    groupLabel: {
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: t.colors.textMuted,
      paddingHorizontal: 2,
      paddingTop: 2,
    },
    emptyNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    emptyText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: t.colors.textSecondary },
    actionBar: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    warning: { alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 20 },
    warningTitle: { fontSize: 19, lineHeight: 22, letterSpacing: 1.5, color: t.colors.amber },
    warningText: { fontSize: 12, lineHeight: 18, textAlign: 'center', color: t.colors.textSecondary },
    skeletonDays: { flexDirection: 'row', gap: 7 },
  });
