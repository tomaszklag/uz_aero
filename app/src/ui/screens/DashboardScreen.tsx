/**
 * Ninerdeck - 20 PULPIT: ekran startowy aplikacji (rezerwacje 3.0.0, epik R-E).
 *
 * Zastępuje „Mój dzień" (01) jako ekran domowy. Odpowiada na DWA pytania - „jak mi dziś
 * poszło" i „co mam przed sobą" - i nic ponadto; reguły i uzasadnienia stoją w modelu
 * (`logic/dashboard.ts`) oraz w `docs/rezerwacje.md` §9.1.
 *
 * Kolejność jest decyzją właściciela (2026-09-19): „MÓJ DZIEŃ" NAD rezerwacją. Pilot
 * otwiera aplikację w kontekście tego, co dziś lata, a plan jest odpowiedzią na pytanie
 * zadawane raz - rano albo przy układaniu tygodnia.
 *
 * Zębatka stoi TYLKO tutaj (issue #82) - zakładki tej reguły nie zmieniają, bo
 * „Kalendarz" i „Historia" to ten sam ekran domowy widziany inaczej. Przycisk zgłoszenia
 * błędu przyjeżdża w ramie `ScreenHeader` (issue #87), więc ekran nie ma o nim linijki.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { referenceCheckedAt } from '../../application';
import {
  ActionButton,
  AppText,
  Banner,
  Card,
  Screen,
  ScreenHeader,
  Skeleton,
  StatGrid,
  SyncChip,
  Tag,
  type StatCell,
} from '../components';
import { useAdminNotices } from '../hooks/useAdminNotices';
import { adminNoticeText } from './logic/adminNotices';
import { useTheme, type Theme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { usePilotDay } from '../hooks/usePilotDay';
import { useSkeleton } from '../hooks/useSkeleton';
import { utcDayStart } from '../../domain';
import { dateUtcLong } from '../format';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useOperationSignatures } from '../hooks/useOperationSignatures';
import { useOperationClub } from '../hooks/useOperationClub';
import { buildMyDay, myDayActions, totalLabel, type MyDayVm } from './logic/myDay';
import {
  bookingLead,
  bookingLength,
  daySubtitle,
  startHint,
  type NextBooking,
} from './logic/dashboard';

type Nav = { navigate: (screen: string, params?: object) => void };

/** Tick raz na minutę - doba UTC w nagłówku i odliczanie rezerwacji muszą się przekręcać. */
function useMinuteTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function DashboardScreen({ navigation }: { navigation: Nav }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const repo = useSessionStore((st) => st.repo);
  const lastSyncAt = useSessionStore((st) => st.lastSyncAt);
  const streamHydrated = useSessionStore((st) => st.streamHydrated);

  const pilotCode = useAuthStore((st) => st.pilot?.code);
  const pilotId = useCurrentPilot((st) => st.id);

  const now = useMinuteTicker();
  const pilotDay = usePilotDay(pilotId, utcDayStart(now));

  const regOf = useAircraftRegistrations();
  const signatureOf = useOperationSignatures();
  const clubOf = useOperationClub();
  const vm = pilotDay != null ? buildMyDay(pilotDay, regOf, signatureOf, clubOf) : null;

  const adminNotices = useAdminNotices();
  const actions = myDayActions();

  /**
   * Najbliższa rezerwacja przychodzi z cache'u kalendarza, który powstaje w epiku R-F
   * (#162 F1/F2). Do tego czasu jest jej po prostu BRAK - i ekran wygląda wtedy dokładnie
   * jak wariant `20a`, bo bez rezerwacji karty nie ma wcale. Zaślepki „wkrótce" tu nie
   * ma i być nie może: pusta karta byłaby zdaniem o niczym.
   */
  const booking: NextBooking | null = null;

  const [refCheckedAt, setRefCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (repo == null) return;
    let alive = true;
    void referenceCheckedAt(repo).then((value) => {
      if (alive) setRefCheckedAt(value);
    });
    return () => {
      alive = false;
    };
  }, [repo, lastSyncAt]);

  // Dobie PUSTEJ wierzymy dopiero po pierwszym uzgodnieniu rejestru z serwerem (§4.9):
  // telefon zaraz po czyszczeniu pamięci ma pusty rejestr, który za chwilę przestanie
  // być pusty, a „dziś bez lotów" u pilota z trzema operacjami wygląda jak utrata danych.
  const ready = vm != null && (!vm.empty || streamHydrated);
  const skeleton = useSkeleton(!ready);

  const totals: StatCell[] =
    vm == null
      ? []
      : [
          { label: 'Loty', value: totalLabel(vm.totals.flights) },
          { label: 'Blok', value: totalLabel(vm.totals.block) },
          { label: 'Lot', value: totalLabel(vm.totals.flight) },
        ];

  const hint = startHint(booking);

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="PULPIT"
          size="md"
          subtitle={`${pilotCode ?? pilotId} · ${dateUtcLong(now)}`}
          onSettings={() => navigation.navigate('Settings')}
          right={<SyncChip refCheckedAt={refCheckedAt} />}
        />
      }
    >
      <View style={s.content}>
        {/* Decyzje administratora o MOICH operacjach (issue #81) - pilot ma się dowiedzieć,
            DLACZEGO stoi na tym ekranie, zanim spojrzy na sumy. */}
        {adminNotices.notices.map((notice) => {
          const text = adminNoticeText(notice, regOf, signatureOf);
          return (
            <Banner
              key={notice.sessionUuid}
              kind="status"
              tone="amber"
              icon="warning"
              title={text.title}
              text={text.text}
              action={{
                label: 'ROZUMIEM',
                onPress: () => adminNotices.acknowledge(notice.sessionUuid),
              }}
            />
          );
        })}

        {ready && vm != null && <TodayCard vm={vm} totals={totals} navigation={navigation} />}
        {!ready && skeleton && <TodaySkeleton />}

        {booking != null && <BookingCard booking={booking} now={now} navigation={navigation} />}

        {/* Pas akcji nie zależy od doby (2026-08-16), więc rysuje się w pierwszej klatce.
            Kolejność tablicy JEST kolejnością na ekranie. „POPRZEDNIE DNI" tu nie ma -
            historia jest zakładką, a przycisk prowadzący do zakładki widocznej centymetr
            niżej byłby drugą drogą do tego samego miejsca. */}
        {actions.map((action) => (
          <ActionButton
            key={action.id}
            label={action.label}
            tone={action.primary ? 'green' : 'neutral'}
            variant={action.primary ? 'solid' : 'secondary'}
            size={action.primary ? undefined : 'md'}
            icon={action.primary ? 'start' : 'edit'}
            {...(action.primary && hint != null ? { hint } : {})}
            onPress={() =>
              navigation.navigate(action.id === 'start' ? 'PreflightAircraft' : 'ManualFlight')
            }
          />
        ))}
      </View>
    </Screen>
  );
}

/**
 * Karta „MÓJ DZIEŃ" - sumy doby i WEJŚCIE do Historii.
 *
 * Cała karta jest celem dotknięcia (makieta: `.today-card` jest linkiem), a „OPERACJE
 * DNIA" pod sumami jest jego widocznym znakiem, nie drugim przyciskiem - stąd
 * `ActionButton` schowany przed dotykiem i przed czytnikiem ekranu. Rysujemy go
 * komponentem, a nie własnym pudełkiem, żeby wejście wyglądało dokładnie tak, jak pas
 * akcji kafelka operacji: to ta sama czynność (otwórz i popraw), o jeden poziom wyżej.
 */
function TodayCard({
  vm,
  totals,
  navigation,
}: {
  vm: MyDayVm;
  totals: StatCell[];
  navigation: Nav;
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const sub = daySubtitle(vm);
  const open = () => navigation.navigate('History');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Mój dzień - otwórz operacje dnia"
      onPress={open}
    >
      <Card contentStyle={s.today}>
        <View style={s.todayHead}>
          <AppText variant="display" style={s.todayTitle}>
            MÓJ DZIEŃ
          </AppText>
          {sub != null && (
            <AppText variant="micro" tone="muted">
              {sub}
            </AppText>
          )}
        </View>

        {/* PRZED PIERWSZYM LOTEM karta kurczy się do JEDNEJ LINIJKI (wariant 20a) zamiast
            pokazywać trzy zera: zera znaczyłyby zmierzony wynik, a nie brak pomiaru
            (reguła z 01A). Przy okazji to one spychałyby rezerwację poza pierwszy ekran
            dokładnie rano, kiedy jest najbardziej potrzebna. */}
        {vm.empty ? (
          <AppText variant="body" tone="muted">
            Dziś bez lotów
          </AppText>
        ) : (
          <>
            <StatGrid cells={totals} columns={3} />
            <View importantForAccessibility="no-hide-descendants" pointerEvents="none">
              <ActionButton
                label="OPERACJE DNIA"
                tone="neutral"
                variant="secondary"
                size="md"
                icon="edit"
                onPress={open}
              />
            </View>
          </>
        )}
      </Card>
    </Pressable>
  );
}

/**
 * Karta najbliższej rezerwacji - odliczanie, godziny w STREFIE KLUBU i szczegóły planu.
 *
 * Własnego przycisku startu NIE MA (issue #42): „ROZPOCZNIJ LOT" ma w tej aplikacji jedno
 * miejsce i jeden wygląd przez cały dzień, a rezerwacja zmienia wyłącznie to, czym
 * wypełni się krok 1 przejęcia. Karta prowadzi w SZCZEGÓŁY rezerwacji (23), gdzie się ją
 * przesuwa i odwołuje - ten ekran powstaje w epiku R-F.
 *
 * Przy godzinach nie ma „UTC", bo są czasem klubu (§6) - a że rejestr nad nimi mówi UTC,
 * obie osie są oznaczone: karta wyżej dobą UTC, ta podpisem „czas klubu".
 */
function BookingCard({
  booking,
  now,
  navigation,
}: {
  booking: NextBooking;
  now: number;
  navigation: Nav;
}) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Twoja rezerwacja ${booking.clock}, ${booking.aircraft}`}
      onPress={() => navigation.navigate('BookingDetails', { id: booking.id })}
    >
      <Card
        title="Twoja rezerwacja"
        headerRight={<Tag label={bookingLead(booking.startsAt, now)} tone="green" />}
      >
        <View style={s.bookingClock}>
          <AppText variant="display" style={s.bookingTime}>
            {booking.clock}
          </AppText>
          <AppText variant="micro" tone="muted">
            czas klubu · {bookingLength(booking)}
          </AppText>
        </View>
        <View style={s.bookingRows}>
          <AppText variant="body">{booking.aircraft}</AppText>
          {booking.operation != null && (
            <AppText variant="body" tone="secondary">
              {booking.operation}
            </AppText>
          )}
          {booking.route != null && (
            <AppText variant="mono" tone="secondary">
              {booking.route}
            </AppText>
          )}
          {booking.dualCode != null && (
            <AppText variant="mono" tone="muted">
              Dual: {booking.dualCode}
            </AppText>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * Stan ŁADOWANIA karty sum (issue #33, `design/LOADERY.html`).
 *
 * JEDNA plamka o wysokości karty, bez zgadywania wariantu: doba pusta kurczy kartę do
 * jednej linijki, doba z lotami rozwija ją o sumy i wejście - skeleton obiecuje ich
 * CZĘŚĆ WSPÓLNĄ (reguła 2 wzorca), czyli samą kartę z tytułem. Pas akcji plamki nie
 * potrzebuje: nie zależy od doby, więc stoi już na ekranie, a nie w drodze.
 */
function TodaySkeleton() {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Card contentStyle={s.today} accessible accessibilityLabel="Ładowanie">
      <Skeleton width={128} height={19} />
      <Skeleton width="100%" height={64} radius={theme.radius.btn} />
    </Card>
  );
}

const styles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 14, gap: 12 },

    today: { gap: 10 },
    todayHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      flexWrap: 'wrap',
    },
    todayTitle: { fontSize: 19, lineHeight: 19, letterSpacing: 2 },

    bookingClock: { gap: 3 },
    bookingTime: {
      fontSize: 26,
      lineHeight: 28,
      letterSpacing: 1,
      color: theme.colors.textPrimary,
    },
    bookingRows: { gap: 3 },
  });
