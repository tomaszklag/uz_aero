/**
 * Ninerdeck - 23 KARTA REZERWACJI: termin, co rezerwujesz, plan i dwie drogi wyjścia.
 *
 * ══ BOHATEREM JEST TERMIN ══
 * Godziny stoją wielkim składem na górze, bo to ich dotyczy cała rezerwacja - maszyna
 * i zadanie tylko je opisują. Odliczanie („ZA 1 H 15 MIN") odpowiada na pytanie, które
 * pilot zadaje sobie patrząc na tę kartę, a nie na samą godzinę.
 *
 * ══ OŁÓWKÓW PRZY WIERSZACH NIE MA ══
 * Zmiana idzie JEDNĄ drogą - „PRZESUŃ I POPRAW" wraca do formularza z wypełnionym
 * szkicem (issue #40: korekta ma jedne drzwi). Kilkanaście identycznych celów w jednej
 * kolumnie czytałoby się jak szum, a poprawka terminu i tak wymaga kroku 1.
 *
 * ══ ODWOŁANIE JEST OBRAMOWANE, NIE WYPEŁNIONE ══
 * Czerwień mówi „uwaga", nie „zrób to" - intencją wchodzącego na tę kartę jest
 * sprawdzenie terminu, nie kasowanie. Potwierdzenie nazywa KONKRETNY wpis (wzorzec
 * 10L), bo dwie rezerwacje tej samej maszyny w dobie różnią się wyłącznie godzinami.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  GroupLabel,
  Icon,
  KeyValueRow,
  PathSteps,
  ReasonField,
  Screen,
  ScreenHeader,
  Sheet,
  Skeleton,
  toneColors,
  type IconName,
} from '../components';
import { goHome } from '../navigation/goHome';
import { useAircraft } from '../hooks/useAircraft';
import { useBooking } from '../hooks/useBooking';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useSessionStore } from '../store';
import { useCurrentPilot } from '../store/currentPilot';
import { useTheme, type Theme } from '../theme';
import { airfieldByIcao } from '../../domain';

import { approvalView, type ApprovalState } from './logic/bookingApproval';
import { bookingDetails, type BookingDetailRow } from './logic/bookingDetails';
import { setBugBooking } from '../components/bug/bugReporter';

/** Ikona banera stanu (23B–23E): zegar czeka, ogniwo dokłada krok, blokada odmawia, trójkąt wygasa. */
const BANNER_ICON: Partial<Record<ApprovalState, IconName>> = {
  waiting: 'clock',
  stepAdded: 'link',
  rejected: 'blocker',
  expired: 'warning',
};

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
};

export function BookingDetailsScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { bookingId?: string } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();

  const bookingId = route?.params?.bookingId ?? null;
  const { data, reload } = useBooking(bookingId);
  const skeleton = useSkeleton(data === undefined);

  const pilotId = useCurrentPilot((p) => p.id);
  const pilots = usePilots();
  const aircraft = useAircraft(data?.booking.aircraftId ?? null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const sync = useSessionStore((st) => st.sync);

  const vm = useMemo(() => {
    if (data == null) return null;
    const dual = pilots.find((p) => p.id === data.booking.dualId) ?? null;

    return bookingDetails({
      booking: data.booking,
      day: data.day,
      now,
      pilotId,
      hasPath: (data.approval?.steps.length ?? 0) > 0,
      aircraft: aircraft == null ? null : { reg: aircraft.reg, type: aircraft.type ?? null },
      dualName: dual?.name ?? null,
      dualCode: dual?.code ?? null,
      airfieldName: (icao) => airfieldByIcao(icao)?.name ?? null,
    });
  }, [data, now, pilotId, aircraft, pilots]);

  /**
   * Stan rezerwacji wobec ŚCIEŻKI AKCEPTACJI (3.1.0, makiety 23B–23E): baner na górze,
   * ton karty terminu, kroki ścieżki. Klub bez ścieżki dostaje `state: 'none'` i karta
   * wygląda dokładnie jak w 3.0.0.
   */
  const av = useMemo(
    () =>
      data == null
        ? null
        : approvalView({
            approval: data.approval,
            status: data.booking.status,
            now,
            createdAt: data.booking.createdAt ?? null,
            day: data.day,
          }),
    [data, now],
  );

  /**
   * Zgłoszenie błędu z tego ekranu niesie REZERWACJĘ (#162 F10). Zdejmujemy ją przy
   * wyjściu, bo napis „Dołączamy automatycznie" jest obietnicą: zgłoszenie z Pulpitu
   * nie ma prawa wozić terminu oglądanego minutę wcześniej.
   */
  useEffect(() => {
    if (vm == null || bookingId == null) return;
    setBugBooking({ id: bookingId, label: `${vm.what[0]?.value ?? ''} · ${vm.date} · ${vm.hours}` });
    return () => setBugBooking(null);
  }, [vm, bookingId]);

  const cancel = useCallback(async () => {
    if (sync == null || bookingId == null || cancelling) return;

    setCancelling(true);
    setFailed(null);
    try {
      const trimmed = reason.trim();
      const result = await sync.cancelBooking(bookingId, trimmed === '' ? null : trimmed);

      // `null` = odwołanie NIE DOJECHAŁO. Slot zwalnia serwer, więc dopóki nie
      // odpowiedział, termin dalej stoi zajęty - i tak ma się to czytać.
      if (result == null) {
        setFailed('Odwołanie wymaga połączenia - slot zwalnia serwer.');
        return;
      }
      if (!result.ok) {
        setFailed('Nie udało się odwołać tej rezerwacji.');
        return;
      }

      setCancelOpen(false);
      setReason('');
      // Karta ZOSTAJE i pokazuje nowy stan („Odwołana"): zniknięcie ekranu wyglądałoby
      // tak samo przy udanym odwołaniu i przy awarii, a pilot ma zobaczyć skutek.
      reload();
    } finally {
      setCancelling(false);
    }
  }, [sync, bookingId, cancelling, reason, reload]);

  const header = (
    <ScreenHeader title="REZERWACJA" size="md" backLabel="Wróć" onBack={() => navigation.goBack()} />
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
            <Skeleton height={190} radius={14} />
          ) : null
        ) : vm == null || av == null ? (
          <Missing theme={theme} />
        ) : (
          <>
            {/* Baner stanu (23B–23E) - przyrząd, nie pouczenie: mówi, co ze sprawą, i co dalej. */}
            {av.banner != null && (
              <Banner
                kind="status"
                tone={av.banner.tone}
                icon={BANNER_ICON[av.state]}
                title={av.banner.title}
                text={av.banner.text}
              />
            )}

            {/* Ton karty terminu idzie za stanem: zieleń obiecuje pewny lot, bursztyn
                mówi „czeka", karta wygaszona - „to już tylko zapis" (`.hero.wait` / `.hero.off`). */}
            <Card
              flush
              style={
                av.heroTone === 'amber'
                  ? { borderColor: toneColors(theme, 'amber').border }
                  : av.heroTone === 'off'
                    ? { borderColor: theme.colors.borderStrong }
                    : undefined
              }
            >
              <View style={s.hero}>
                <View style={s.heroTop}>
                  <AppText variant="body" style={s.heroDate}>
                    {vm.date}
                  </AppText>
                  <AppText
                    variant="mono"
                    style={[s.heroBadge, { color: toneColors(theme, av.badgeTone === 'dim' ? 'neutral' : av.badgeTone).accent }]}
                  >
                    {vm.badge}
                  </AppText>
                </View>

                <AppText variant="display" style={s.heroHours}>
                  {vm.hours}
                </AppText>

                <View style={s.heroMeta}>
                  <AppText variant="mono" style={s.heroZone}>
                    czas klubu
                  </AppText>
                  <AppText variant="mono" style={s.heroZone}>
                    {vm.length}
                  </AppText>
                  {vm.countdown != null && (
                    <AppText variant="mono" style={s.heroCount}>
                      {vm.countdown}
                    </AppText>
                  )}
                </View>
              </View>
            </Card>

            <Card>
              <Rows rows={vm.what} />
            </Card>

            {/* Ścieżka akceptacji - tylko gdy klub ją prowadzi. Nazwisk nie ma (§9.4). */}
            {av.steps.length > 0 && (
              <>
                <GroupLabel text="Ścieżka akceptacji" />
                <Card flush>
                  <PathSteps steps={av.steps} />
                </Card>
              </>
            )}

            {/* Sekcji planu nie ma, gdy pilot nie podał niczego - „Plan -" byłoby
                wierszem o niczym (ta sama reguła, co przy karcie notatek na 10). */}
            {vm.plan.length > 0 && (
              <>
                <AppText variant="micro" tone="muted" style={s.sectionLabel}>
                  Plan
                </AppText>
                <Card>
                  <Rows rows={vm.plan} />
                </Card>
              </>
            )}

            {failed != null && (
              <AppText variant="body" style={s.failed}>
                {failed}
              </AppText>
            )}

            {/* Rezerwacja ZAMKNIĘTA ma jedno wyjście (23C/23D): nie ma czego przesuwać ani
                odwoływać, a wyszarzone przyciski obiecywałyby akcje, których reguły nie
                dopuszczą. */}
            {vm.closed && (
              <ActionButton
                label="WYBIERZ INNY TERMIN"
                icon="calendar"
                variant="secondary"
                size="md"
                onPress={() => goHome(navigation, 'Calendar')}
              />
            )}

            {vm.canEdit && (
              <ActionButton
                label="PRZESUŃ I POPRAW"
                icon="edit"
                variant="secondary"
                size="md"
                onPress={() => navigation.navigate('NewBooking', { bookingId })}
              />
            )}
            {/* Poprawka CZYŚCI zgody (§11.4) i ekran mówi to PRZED tapnięciem, nie po. */}
            {vm.canEdit && vm.editNote != null && (
              <AppText variant="body" style={s.editNote}>
                {vm.editNote}
              </AppText>
            )}

            {vm.canCancel && (
              <ActionButton
                label="ODWOŁAJ REZERWACJĘ"
                icon="trash"
                tone="red"
                variant="secondary"
                size="md"
                onPress={() => setCancelOpen(true)}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* Potwierdzenie nazywa KONKRETNY wpis (wzorzec 10L). Powód OPCJONALNY: wymagany
          byłby tarciem przy własnej rezerwacji, a bez niego kolega patrzący na zwolniony
          slot nie ma jak się dowiedzieć, czemu zniknął. */}
      <Sheet
        visible={cancelOpen}
        title="ODWOŁAĆ REZERWACJĘ?"
        rows={
          vm == null
            ? []
            : [
                { label: 'Samolot', value: vm.what[0]?.value ?? '-' },
                { label: 'Termin', value: `${vm.date} · ${vm.hours}` },
              ]
        }
        warning="Slot wróci do kalendarza i będzie mógł go zająć ktoś inny."
        warningTone="amber"
        confirmLabel="ODWOŁAJ"
        confirmTone="red"
        confirmDisabled={cancelling}
        onConfirm={() => void cancel()}
        cancelLabel="ZOSTAW"
        onCancel={() => setCancelOpen(false)}
      >
        <ReasonField value={reason} onChangeText={setReason} />
      </Sheet>
    </Screen>
  );
}

function Rows({ rows }: { rows: readonly BookingDetailRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <KeyValueRow key={row.label} label={row.label} value={row.value} sub={row.sub} />
      ))}
    </>
  );
}

/**
 * Rezerwacji nie ma - odwołana, cudza albo telefon jej nie dosięgnął.
 *
 * Trzech powodów NIE ROZRÓŻNIAMY i to jest decyzja: cudza rezerwacja ma być dla tego
 * telefonu nieistniejąca (404 nie potwierdza nawet, że wiersz istnieje), a rozdzielenie
 * „nie ma" od „nie wiem" wymagałoby od serwera powiedzenia dokładnie tego.
 */
function Missing({ theme }: { theme: Theme }) {
  const s = styles(theme);

  return (
    <Card flush>
      <View style={s.warning}>
        <Icon name="offline" size={30} color={theme.colors.amber} />
        <AppText variant="display" style={s.warningTitle}>
          NIE MA TEJ REZERWACJI
        </AppText>
        <AppText variant="body" style={s.warningText}>
          Termin mógł zostać odwołany albo telefon nie ma jak o niego zapytać. Zajrzyj do
          kalendarza z zasięgiem.
        </AppText>
      </View>
    </Card>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 28 },

    hero: { gap: 6, padding: 14 },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    heroDate: { fontSize: 13, color: t.colors.textSecondary },
    heroBadge: {
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: t.colors.green,
    },
    // Godziny są bohaterem ekranu, więc idą krojem display - tym samym, którym kokpit
    // pisze czas blokowy.
    heroHours: { fontSize: 34, letterSpacing: 2, color: t.colors.textPrimary },
    heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    heroZone: { fontSize: 9, letterSpacing: 1, color: t.colors.textMuted },
    heroCount: { fontSize: 9, letterSpacing: 1.5, color: t.colors.amber },

    sectionLabel: { marginTop: 4 },
    failed: { fontSize: 12, lineHeight: 17, color: t.colors.amber },
    // `.foot-note` pod „PRZESUŃ I POPRAW": przypis do akcji, nie baner - bez tła i ikony.
    editNote: { fontSize: 11, lineHeight: 16, color: t.colors.textSecondary, paddingHorizontal: 4, marginTop: -4 },

    warning: { alignItems: 'center', gap: 10, padding: 22 },
    warningTitle: { fontSize: 22, letterSpacing: 2, color: t.colors.amber, textAlign: 'center' },
    warningText: {
      fontSize: 13,
      lineHeight: 19,
      color: t.colors.textSecondary,
      textAlign: 'center',
    },
  });
