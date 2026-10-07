/**
 * Ninerdeck - 23 KARTA REZERWACJI: termin, co rezerwujesz, plan i dwie drogi wyjścia.
 *
 * ══ BOHATEREM JEST TERMIN ══
 * Godziny stoją wielkim składem na górze, bo to ich dotyczy cała rezerwacja - maszyna
 * i zadanie tylko je opisują. Odliczanie („ZA 1 H 15 MIN") odpowiada na pytanie, które
 * pilot zadaje sobie patrząc na tę kartę, a nie na samą godzinę. Karta terminu, wiersze
 * i baner stanu to te same komponenty, co na karcie zlecenia (28, 32) - jedna rzecz ma
 * w aplikacji jeden kształt (decyzja właściciela 2026-10-06).
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
 *
 * ══ REZERWACJA ZE ZLECENIA (23F) ══
 * Termin prowadzi zlecenie, więc poprawki nie ma. Przydzielony pilot REZYGNUJE (arkusz
 * kształtu 28D) i wraca do kalendarza - lot przestaje być jego; zlecający w swoim fotelu
 * odwołuje całe zlecenie (arkusz 32C) i zostaje na karcie, która pokazuje nowy stan.
 * Wiersz „Ze zlecenia" prowadzi przydzielonego do rozmowy, a zlecającego do karty zlecenia.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Card,
  DetailRow,
  FootNote,
  GroupLabel,
  Icon,
  InlineNote,
  PathSteps,
  ReasonField,
  Screen,
  ScreenHeader,
  Sheet,
  Skeleton,
  StateBanner,
  TermHero,
  TextField,
  type IconName,
} from '../components';
import { goHome } from '../navigation/goHome';
import { useAircraft } from '../hooks/useAircraft';
import { useBooking } from '../hooks/useBooking';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { useSheetInputFocus } from '../hooks/useSheetInputFocus';
import { useSkeleton } from '../hooks/useSkeleton';
import { useSessionStore } from '../store';
import { useCurrentPilot } from '../store/currentPilot';
import { useTheme, type Theme } from '../theme';
import { airfieldByIcao } from '../../domain';

import { approvalView, type ApprovalState } from './logic/bookingApproval';
import { cancellationBanner } from './logic/bookingCancellation';
import { bookingDetails, termTone, type BookingDetailRow } from './logic/bookingDetails';
import { orderRefusalText } from './logic/orderRefusals';
import { setBugBooking } from '../components/bug/bugReporter';

/** Ikona banera stanu (23B–23E): zegar czeka, ogniwo dokłada krok, blokada odmawia, trójkąt wygasa. */
const BANNER_ICON: Partial<Record<ApprovalState, IconName>> = {
  waiting: 'clock',
  stepAdded: 'link',
  rejected: 'blocker',
  expired: 'warning',
};

/** Powód zlecenia jest zdaniem do ludzi (wiadomość), nie przypisem do liczby - stąd 500, jak na 28D i 32C. */
const REASON_MAX = 500;

/** Zapis, który NIE DOJECHAŁ: slot i fotel zwalnia serwer, więc dopóki nie odpowiedział, nic się nie stało. */
const CANCEL_OFFLINE = 'Odwołanie wymaga połączenia - slot zwalnia serwer.';
const RESIGN_OFFLINE = 'Rezygnację zapisuje serwer - potrzebne połączenie.';

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
  /** Odwołanie, które się nie udało - stoi W ARKUSZU, bo pod arkuszem nikt by go nie zobaczył. */
  const [failed, setFailed] = useState<string | null>(null);
  const sync = useSessionStore((st) => st.sync);
  const { inputRef, onShow } = useSheetInputFocus();

  const vm = useMemo(() => {
    if (data == null) return null;
    const person = (id: string) => pilots.find((p) => p.id === id) ?? null;

    return bookingDetails({
      booking: data.booking,
      day: data.day,
      now,
      pilotId,
      hasPath: (data.approval?.steps.length ?? 0) > 0,
      aircraft: aircraft == null ? null : { reg: aircraft.reg, type: aircraft.type ?? null },
      nameOf: (id) => person(id)?.name ?? null,
      codeOf: (id) => person(id)?.code ?? null,
      airfieldName: (icao) => airfieldByIcao(icao)?.name ?? null,
    });
  }, [data, now, pilotId, aircraft, pilots]);

  /**
   * Stan rezerwacji wobec ŚCIEŻKI AKCEPTACJI (3.1.0, makiety 23B–23E): baner na górze,
   * ton karty terminu, kroki ścieżki. Klub bez ścieżki dostaje `state: 'none'` i karta
   * wygląda dokładnie jak w 3.0.0. Rezerwacja ze zlecenia ścieżki nie przechodzi (decyzja 5).
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
   * Odwołanie cudzą ręką (23G, §12.9) - klub odwołał rezerwację pilota albo dowódca
   * odwołał własną, a patrzy drugi pilot. Baner ścieżki ma pierwszeństwo, ale przy
   * odwołanej rezerwacji go nie ma: ścieżka jest wtedy już tylko zapisem.
   */
  const cancelled = useMemo(
    () =>
      data == null
        ? null
        : cancellationBanner({
            status: data.booking.status,
            closedBy: data.booking.closedBy,
            closeReason: data.booking.closeReason,
            viewerId: pilotId,
            nameOf: (id) => pilots.find((p) => p.id === id)?.name ?? null,
          }),
    [data, pilotId, pilots],
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

  const order = vm?.order ?? null;
  const resigns = order?.role === 'assigned';

  const openCancel = () => {
    setFailed(null);
    setCancelOpen(true);
  };

  const cancel = useCallback(async () => {
    if (sync == null || bookingId == null || cancelling) return;

    setCancelling(true);
    setFailed(null);
    try {
      const trimmed = reason.trim();
      // Rezerwacja ze zlecenia odwołuje się TĄ SAMĄ trasą - serwer sam rozpoznaje, czy
      // to rezygnacja przydzielonego, czy odwołanie zlecenia (`OrderBookingCommands`).
      const result = await sync.cancelBooking(bookingId, trimmed === '' ? null : trimmed);

      // `null` = odwołanie NIE DOJECHAŁO. Slot zwalnia serwer, więc dopóki nie
      // odpowiedział, termin dalej stoi zajęty - i tak ma się to czytać.
      if (result == null) {
        setFailed(resigns ? RESIGN_OFFLINE : CANCEL_OFFLINE);
        return;
      }
      if (!result.ok) {
        setFailed(order != null ? orderRefusalText(result.refusal) : 'Nie udało się odwołać tej rezerwacji.');
        // Rezerwacja mogła się zmienić pod palcem - karta ma pokazać jej NOWY stan.
        reload();
        return;
      }

      setCancelOpen(false);
      setReason('');
      if (resigns) {
        // Po rezygnacji lot przestaje być Twój, a karta cudzej rezerwacji nie ma tu
        // nic do powiedzenia - wracasz tam, skąd planuje się dalej (23F).
        goHome(navigation, 'Calendar');
        return;
      }
      // Karta ZOSTAJE i pokazuje nowy stan („Odwołana"): zniknięcie ekranu wyglądałoby
      // tak samo przy udanym odwołaniu i przy awarii, a pilot ma zobaczyć skutek.
      reload();
    } finally {
      setCancelling(false);
    }
  }, [sync, bookingId, cancelling, reason, reload, resigns, order, navigation]);

  const openOrderRow = () => {
    if (order == null) return;
    if (order.role === 'assigned') navigation.navigate('OrderThread', { orderId: order.orderId, recipientId: pilotId });
    else navigation.navigate('Order', { orderId: order.orderId, as: 'leader' });
  };

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
            {/* Baner stanu (23B–23E, 23G) - przyrząd, nie pouczenie: mówi, co ze sprawą, i co dalej. */}
            {av.banner != null ? (
              <StateBanner
                icon={BANNER_ICON[av.state] ?? 'info'}
                tone={av.banner.tone}
                title={av.banner.title}
                text={av.banner.text}
              />
            ) : cancelled != null ? (
              <StateBanner icon="blocker" tone={cancelled.tone} title={cancelled.title} text={cancelled.text} />
            ) : null}

            {/* Ton karty terminu idzie za stanem: zieleń obiecuje pewny lot, bursztyn
                mówi „czeka", karta wygaszona - „to już tylko zapis" (`.hero.wait` / `.hero.off`).
                Cudza potwierdzona nie jest zielona - zieleń znaczy tu „moje" (`termTone`). */}
            <TermHero
              date={vm.date}
              badge={{ text: vm.badge, tone: av.badgeTone }}
              hours={vm.hours}
              length={vm.length}
              countdown={vm.countdown}
              tone={termTone(av.heroTone, vm.seated)}
            />

            <Card flush>
              <Rows rows={vm.what} last={order == null} />
              {/* „Ze zlecenia" - jedyny wiersz z szewronem (23F): nie uczy oka pomijać prawej krawędzi. */}
              {order != null && (
                <DetailRow
                  label={order.row.label}
                  value={order.row.value}
                  sub={order.row.sub}
                  onPress={openOrderRow}
                  // Nazwisko po separatorze, nie w narzędniku („z Martą Ziębą") - odmiany nie
                  // da się wyprowadzić regułą (słownik zleceń §3).
                  pressLabel={order.role === 'assigned' ? `Rozmowa o zleceniu · ${order.row.value}` : 'Karta zlecenia'}
                />
              )}
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
                <GroupLabel text="Plan" />
                <Card flush>
                  <Rows rows={vm.plan} last />
                </Card>
              </>
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
                label={resigns ? 'REZYGNUJĘ' : order != null ? 'ODWOŁAJ ZLECENIE' : 'ODWOŁAJ REZERWACJĘ'}
                icon={resigns ? 'resign' : 'trash'}
                tone="red"
                variant="secondary"
                size="md"
                onPress={openCancel}
              />
            )}
            {/* Jedno zdanie o SKUTKU rezygnacji, pod przyciskiem i raz (23F). */}
            {vm.canCancel && order?.note != null && <FootNote icon="message" parts={order.note} />}
          </>
        )}
      </ScrollView>

      {/* Potwierdzenie nazywa KONKRETNY wpis (wzorzec 10L). Powód OPCJONALNY: wymagany
          byłby tarciem przy własnej rezerwacji, a bez niego kolega patrzący na zwolniony
          slot nie ma jak się dowiedzieć, czemu zniknął. Ze zlecenia - arkusz 28D
          (rezygnacja) albo 32C (odwołanie zlecenia), bo to te same czynności. */}
      <Sheet
        visible={cancelOpen}
        title={resigns ? 'REZYGNUJĘ' : order != null ? 'ODWOŁANIE ZLECENIA' : 'ODWOŁAĆ REZERWACJĘ?'}
        rows={
          vm == null
            ? []
            : order != null
              ? [{ label: 'Zlecenie', value: order.reference }]
              : [
                  { label: 'Samolot', value: vm.what[0]?.value ?? '-' },
                  { label: 'Termin', value: `${vm.date} · ${vm.hours}` },
                ]
        }
        warning={vm?.cancelWarning ?? undefined}
        warningTone="amber"
        confirmLabel={resigns ? 'REZYGNUJĘ' : 'ODWOŁAJ'}
        confirmTone="red"
        confirmDisabled={cancelling}
        onConfirm={() => void cancel()}
        cancelLabel={order != null ? 'ANULUJ' : 'ZOSTAW'}
        onCancel={() => setCancelOpen(false)}
        onShow={resigns ? onShow : undefined}
      >
        {order != null ? (
          <TextField
            inputRef={resigns ? inputRef : undefined}
            label="Powód"
            tag={{ label: 'opcjonalne' }}
            value={reason}
            onChangeText={setReason}
            placeholder={resigns ? 'Np. w sobotę mam dyżur…' : 'Np. maszyna idzie w sobotę na przegląd.'}
            multiline
            maxLength={REASON_MAX}
          />
        ) : (
          <ReasonField value={reason} onChangeText={setReason} placeholder="np. zmiana planów - nie polecę" />
        )}
        {failed != null && <InlineNote icon="warning" tone="amber" text={failed} />}
      </Sheet>
    </Screen>
  );
}

/** Wiersze karty z linią pod każdym; `last` = karta kończy się na ostatnim z nich. */
function Rows({ rows, last }: { rows: readonly BookingDetailRow[]; last: boolean }) {
  return (
    <>
      {rows.map((row, i) => (
        <DetailRow
          key={row.label}
          label={row.label}
          value={row.value}
          sub={row.sub}
          mono={row.mono}
          divider={!last || i < rows.length - 1}
        />
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
    content: { padding: 14, gap: 12, paddingBottom: 28 },

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
