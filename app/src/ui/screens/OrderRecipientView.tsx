/**
 * Ninerdeck - 28 KARTA ZLECENIA OCZAMI ADRESATA (4.0.0, epik Z-C #247; makiety 28, 28A,
 * 28B, 28C, 28D; `docs/zlecenia.md` §4, §5, §6.3).
 *
 * ══ KARTA MÓWI O FOTELACH, NIE O INNYCH ADRESATACH (pkt 18) ══
 * Który fotel proponuje się Tobie, kto już siedzi w drugim i co klub chce zrobić - tyle.
 * Do kogo jeszcze poszło zlecenie i ile osób się zgłosiło, należy do prowadzących.
 * Zdania i stany liczy `logic/orderRecipientCard.ts` - tu jest wyłącznie kształt.
 *
 * ══ ODPOWIEDŹ ROZSTRZYGA SERWER ══
 * Zapis nie idzie przez outbox (§2.3): to umowa między ludźmi i zapada RAZ. Wynik jest
 * zawsze TREŚCIĄ, nigdy awarią (§20 Z3):
 *  - „PRZYJMUJĘ" na fotel wskazany imiennie obsadza go od razu - lot staje się Twoją
 *    rezerwacją i ekran przechodzi na nią (23F), bo karty zlecenia dla lotu, który już
 *    jest Twój, nie ma (§14.3);
 *  - „MOGĘ LECIEĆ" jest zgłoszeniem - karta zostaje i mówi, w jakim jest stanie (28A,
 *    ramka 2): zniknięcie pytania bez słowa wyglądałoby tak samo przy zapisie i awarii;
 *  - „NIE MOGĘ" wraca tam, skąd pilot przyszedł (28D, wzorzec decyzji 26);
 *  - „tak" na fotel, który zdążył zająć ktoś inny, i zlecenie zamknięte w międzyczasie
 *    pokazują nowy stan karty (28B) - zapisane, tylko już nieaktualne (pkt 54).
 * `null` z klienta znaczy „nie dojechało" i zdanie mówi, czyją decyzją jest odpowiedź.
 *
 * ══ ARKUSZ „NIE MOGĘ" (28D) ══
 * Powód jest OPCJONALNY (pkt 16): przycisk działa od pierwszej chwili, a zdanie, jeśli
 * jest, prowadzący przeczytają przy odpowiedzi. Arkusz wchodzi z klawiaturą
 * (`useSheetInputFocus`), a „NIE MOGĘ" jest wyciszone, nie czerwone - odmowa nikomu
 * niczego nie zabiera. Ten sam arkusz wycofuje zgłoszenie po „MOGĘ LECIEĆ".
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { RemoteOrderCard } from '../../application';
import { airfieldByIcao } from '../../domain';
import {
  ActionButton,
  AnswerBlock,
  AppText,
  Card,
  CrewSeatRow,
  DetailRow,
  EditedLine,
  FootNote,
  GroupLabel,
  InlineNote,
  Sheet,
  StateBanner,
  TermHero,
  TextField,
  ThreadRow,
  type IconName,
} from '../components';
import { useOrders } from '../bootstrap/servicesContext';
import { useAircraft } from '../hooks/useAircraft';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { useSheetInputFocus } from '../hooks/useSheetInputFocus';
import { useCurrentPilot } from '../store';
import { useTheme, type Theme } from '../theme';

import { ANSWER_OFFLINE, orderRefusalText } from './logic/orderRefusals';
import { recipientCardVm, type OrderBannerVm } from './logic/orderRecipientCard';

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
  replace: (screen: string, params?: object) => void;
};

/** Glif banera 28B - ten sam, co w makiecie i w skrzynce (25D). */
const BANNER_ICON: Readonly<Record<OrderBannerVm['kind'], IconName>> = {
  filled: 'order-filled',
  cancelled: 'order-cancelled',
  expired: 'order-expired',
  removed: 'order-removed',
};

/** Limit powodu - ten sam, co na serwerze (`orderBodies.ts`). */
const REASON_MAX = 500;

export interface OrderRecipientViewProps {
  card: RemoteOrderCard;
  navigation: Nav;
  /** Karta z odpowiedzi zapisu - bez drugiego pytania serwera. */
  onCard: (card: RemoteOrderCard) => void;
  reload: () => void;
}

export function OrderRecipientView({ card, navigation, onCard, reload }: OrderRecipientViewProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();
  const orders = useOrders();
  const pilotId = useCurrentPilot((p) => p.id);
  const pilots = usePilots();
  const regOf = useAircraftRegistrations();
  const aircraft = useAircraft(card.booking.aircraftId);
  const { inputRef, onShow } = useSheetInputFocus();

  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  /** Zdanie przy pasie odpowiedzi - zapis „tak", który się nie udał. */
  const [failed, setFailed] = useState<string | null>(null);
  /** To samo w arkuszu „Nie mogę" - pod arkuszem nikt by go nie zobaczył. */
  const [sheetFailed, setSheetFailed] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const vm = useMemo(
    () =>
      recipientCardVm({
        card,
        now,
        pilotId,
        nameOf: (id) => pilots.find((p) => p.id === id)?.name ?? null,
        codeOf: (id) => pilots.find((p) => p.id === id)?.code ?? null,
        aircraft: aircraft == null ? null : { reg: aircraft.reg, type: aircraft.type ?? null },
        airfieldName: (icao) => airfieldByIcao(icao)?.name ?? null,
        regOf,
      }),
    [card, now, pilotId, pilots, aircraft, regOf],
  );

  // Lot, który już jest Twój, nie ma karty zlecenia - jest rezerwacją (23F, §14.3).
  const bookingId = card.booking.id;
  const mine = vm?.kind === 'booking';
  useEffect(() => {
    if (mine) navigation.replace('BookingDetails', { bookingId });
  }, [mine, bookingId, navigation]);

  const respond = async (answer: 'yes' | 'no') => {
    if (orders == null || busy != null) return;
    const say = answer === 'no' ? setSheetFailed : setFailed;

    setBusy(answer);
    say(null);
    try {
      const trimmed = reason.trim();
      const result = await orders.answer(card.order.id, {
        answer,
        reason: answer === 'no' && trimmed !== '' ? trimmed : null,
      });
      if (!alive.current) return;

      if (result == null) {
        say(ANSWER_OFFLINE);
        return;
      }
      if (!result.ok) {
        say(orderRefusalText(result.refusal));
        // Zlecenie mogło się zmienić pod palcem - karta ma pokazać jego NOWY stan.
        reload();
        return;
      }

      setDeclineOpen(false);
      setReason('');
      switch (result.outcome.kind) {
        case 'assigned':
          navigation.replace('BookingDetails', { bookingId });
          return;
        case 'declined':
          navigation.goBack();
          return;
        default:
          if (result.card != null) onCard(result.card);
          else reload();
      }
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  if (vm == null || mine) return null;

  const answered = vm.primary == null;
  const clash =
    vm.clash == null ? null : (
      <InlineNote icon="warning" tone="amber" text={`W tym czasie masz rezerwację · ${vm.clash}`} />
    );

  return (
    <>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Los zlecenia NAD terminem - odpowiada na pierwsze pytanie wchodzącego. */}
        {vm.banner != null && (
          <StateBanner
            icon={BANNER_ICON[vm.banner.kind]}
            title={vm.banner.title}
            text={vm.banner.text}
            quote={vm.banner.quote}
            meta={vm.banner.meta}
            tone={vm.banner.tone}
          />
        )}

        <TermHero
          date={vm.hero.date}
          badge={vm.hero.badge}
          hours={vm.hero.hours}
          was={vm.hero.was}
          length={vm.hero.length}
          countdown={vm.hero.countdown}
          tone={vm.kind === 'stale' ? 'off' : 'blue'}
        />

        {vm.crew != null && (
          <>
            <GroupLabel text="Załoga" />
            <Card flush>
              {vm.crew.map((row, i) => (
                <CrewSeatRow
                  key={`${row.seat ?? 'ty'}-${i}`}
                  seat={row.seat}
                  value={row.value}
                  you={row.you}
                  sought={row.sought}
                  tag={row.tag}
                  divider={i < vm.crew!.length - 1}
                />
              ))}
            </Card>
          </>
        )}

        {/* Odpowiedź tuż pod załogą - dotyczy fotela z wiersza wyżej (28A, 28C). */}
        {vm.answer != null && (
          <>
            <GroupLabel text="Twoja odpowiedź" />
            <Card flush>
              <AnswerBlock value={vm.answer.value} tone={vm.answer.tone} sub={vm.answer.sub} quote={vm.answer.quote} />
            </Card>
          </>
        )}

        {/* Po zgłoszeniu kolizja stoi przy odpowiedzi, której dotyczy (28A, ramka 2);
            przed odpowiedzią - nad pasem, w chwili decyzji. */}
        {answered && clash}

        <GroupLabel text="Zlecenie" />
        <Card flush>
          {vm.details.map((row, i) => (
            <DetailRow
              key={row.label}
              label={row.label}
              value={row.value}
              sub={row.sub}
              mono={row.mono}
              divider={i < vm.details.length - 1 || vm.edited != null}
            />
          ))}
          {vm.edited != null && <EditedLine parts={vm.edited} />}
        </Card>

        {/* Rozmowa prywatna z osobą zlecającą (pkt 3); do odczytu, gdy zlecenie przestało
            Cię dotyczyć, a bez wiadomości w nieaktualnym - wcale (pusta, bez pola). */}
        {vm.thread != null && (
          <Card flush>
            <ThreadRow
              title={vm.thread.title}
              sub={vm.thread.sub}
              unread={vm.thread.unread}
              onPress={() => navigation.navigate('OrderThread', { orderId: card.order.id, recipientId: pilotId })}
            />
          </Card>
        )}

        {!answered && clash}

        {failed != null && (
          <AppText variant="body" style={s.failed}>
            {failed}
          </AppText>
        )}

        {/* Pasa w zleceniu nieaktualnym NIE MA: wyszarzone przyciski obiecywałyby
            odpowiedź, której zlecenie już nie przyjmie (zasada z 10B). */}
        {vm.primary != null && (
          <ActionButton
            label={vm.primary === 'accept' ? 'PRZYJMUJĘ' : 'MOGĘ LECIEĆ'}
            tone="green"
            variant="solid"
            busy={busy === 'yes'}
            disabled={busy === 'no'}
            onPress={() => void respond('yes')}
          />
        )}
        {vm.decline && (
          <ActionButton
            label="NIE MOGĘ"
            tone="neutral"
            variant="secondary"
            size="md"
            disabled={busy != null}
            onPress={() => {
              setSheetFailed(null);
              setDeclineOpen(true);
            }}
          />
        )}
        {vm.note != null && <FootNote icon="message" parts={vm.note} />}
      </ScrollView>

      <Sheet
        visible={declineOpen}
        title="NIE MOGĘ"
        rows={[{ label: 'Zlecenie', value: vm.reference }]}
        warning={sheetFailed ?? undefined}
        confirmLabel="NIE MOGĘ"
        confirmTone="neutral"
        confirmVariant="quiet"
        confirmDisabled={busy != null}
        onConfirm={() => void respond('no')}
        cancelLabel="ANULUJ"
        onCancel={() => setDeclineOpen(false)}
        onShow={onShow}
      >
        <TextField
          inputRef={inputRef}
          label="Powód"
          tag={{ label: 'opcjonalne' }}
          value={reason}
          onChangeText={setReason}
          placeholder="Np. w sobotę mam dyżur…"
          multiline
          maxLength={REASON_MAX}
        />
      </Sheet>
    </>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 14, gap: 12, paddingBottom: 28 },
    failed: { fontSize: 12, lineHeight: 17, color: t.colors.amber },
  });
