/**
 * Ninerdeck - 32 KARTA ZLECENIA OCZAMI PROWADZĄCEGO (4.0.0, epik Z-C #247; makiety 32, 32A,
 * 32B, 32C, 32D; `docs/zlecenia.md` §4.3, §5, §13.1).
 *
 * Prowadzi autor i każdy z „Cudzymi rezerwacjami" naraz (pkt 20). Karta odpowiada na trzy
 * pytania w tej kolejności: kto już leci (karta „Załoga"), kogo zapytano i co odpowiedział
 * (blok na każdy szukany fotel albo wspólna lista) i co się działo (historia zmian
 * z nazwiskami). Zdania, kolejność i to, co komu wolno, liczy `logic/orderLeaderCard.ts`.
 *
 * ══ ZAPIS ROZSTRZYGA SERWER ══
 * Przydział, cofnięcie, odebranie, zamiana, ponowne wysłanie i odwołanie idą wprost (§2.3)
 * i wracają z kartą w kształcie widza - ekran nie pyta drugi raz. Odmowa reguły ma
 * zdanie (`orderRefusalText`) i karta czyta się od nowa, bo zlecenie mogło się zmienić pod
 * palcem; `null` znaczy „nie dojechało" i zdanie mówi, czyją decyzją jest zlecenie.
 *
 * ══ ZAMKNIĘTE ZLECENIE JEST ZAPISEM ══
 * Odwołane albo wygasłe: bez „WYBIERZ", bez menu ⋯ i bez pasa akcji; zostaje „Powiel"
 * w nagłówku (rysuje go `OrderScreen`) i rozmowy do odczytu.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { OrderWriteResult, RemoteOrderCard, RemoteSeat } from '../../application';
import { airfieldByIcao } from '../../domain';
import {
  ActionButton,
  AddresseeSheet,
  AppText,
  Card,
  DetailRow,
  ExpandToggle,
  FootNote,
  GroupLabel,
  InlineNote,
  OrderCrewRow,
  OrderHistoryRow,
  RecipientRow,
  Sheet,
  TermHero,
  TextField,
  ThreadRow,
} from '../components';
import { useOrders } from '../bootstrap/servicesContext';
import { useAircraft } from '../hooks/useAircraft';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { useCurrentPilot } from '../store';
import { useTheme, type Theme } from '../theme';

import { swapCandidates } from './logic/orderAddressees';
import { orderReference, instant, orderDay, seatLabel } from './logic/orderFormat';
import { leaderCardVm, type SeatBlockVm } from './logic/orderLeaderCard';
import { recipientMenuVm, type MenuSource } from './logic/orderRecipientMenu';
import { ORDER_OFFLINE, orderRefusalText } from './logic/orderRefusals';

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
};

/** Limit powodu - ten sam, co na serwerze (`orderBodies.ts`). */
const REASON_MAX = 500;

export interface OrderLeaderViewProps {
  card: RemoteOrderCard;
  navigation: Nav;
  /** Prawo zlecania - „Powiel" w nagłówku tworzy nowe zlecenie (`canCreate`). */
  canCreate: boolean;
  /** Karta z odpowiedzi zapisu - bez drugiego pytania serwera. */
  onCard: (card: RemoteOrderCard) => void;
  reload: () => void;
}

export function OrderLeaderView({ card, navigation, canCreate, onCard, reload }: OrderLeaderViewProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();
  const orders = useOrders();
  const viewerId = useCurrentPilot((p) => p.id);
  const pilots = usePilots();
  const regOf = useAircraftRegistrations();
  const aircraft = useAircraft(card.booking.aircraftId);
  const orderId = card.order.id;

  const [othersOpen, setOthersOpen] = useState(false);
  /** Zapis w toku - jeden naraz; klucz mówi, który przycisk czeka. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Przydział albo ponowne wysłanie, które się nie udało - pod terminem. */
  const [failed, setFailed] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFailed, setCancelFailed] = useState<string | null>(null);

  const [menu, setMenu] = useState<MenuSource | null>(null);
  const [menuReason, setMenuReason] = useState('');
  const [menuFailed, setMenuFailed] = useState<string | null>(null);

  const [swap, setSwap] = useState<{ seat: RemoteSeat; outgoing: string } | null>(null);
  const [swapPick, setSwapPick] = useState<string | null>(null);
  const [swapFailed, setSwapFailed] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const nameOf = (id: string) => pilots.find((p) => p.id === id)?.name ?? null;
  const codeOf = (id: string) => pilots.find((p) => p.id === id)?.code ?? null;

  const vm = useMemo(
    () =>
      leaderCardVm({
        card,
        now,
        pilotId: viewerId,
        canCreate,
        nameOf: (id) => pilots.find((p) => p.id === id)?.name ?? null,
        codeOf: (id) => pilots.find((p) => p.id === id)?.code ?? null,
        aircraft: aircraft == null ? null : { reg: aircraft.reg, type: aircraft.type ?? null },
        airfieldName: (icao) => airfieldByIcao(icao)?.name ?? null,
        regOf,
      }),
    [card, now, viewerId, canCreate, pilots, aircraft, regOf],
  );

  const menuVm = menu == null ? null : recipientMenuVm({ card, source: menu, viewerId, nameOf, codeOf });

  const reference = useMemo(() => {
    const day = orderDay(card.day);
    const startsAt = instant(card.booking.startsAt);
    const endsAt = instant(card.booking.endsAt);
    if (day == null || startsAt == null || endsAt == null) return null;
    return orderReference(aircraft?.reg ?? regOf(card.booking.aircraftId) ?? '—', day, startsAt, endsAt);
  }, [card, aircraft, regOf]);

  /** Jeden zapis zlecenia: odmowa i brak sieci mają zdania, sukces - świeżą kartę. */
  const run = async (
    key: string,
    call: () => Promise<OrderWriteResult | null>,
    say: (text: string | null) => void,
    done: (next: RemoteOrderCard) => void,
  ) => {
    if (orders == null || busy != null) return;
    setBusy(key);
    say(null);
    try {
      const result = await call();
      if (!alive.current) return;
      if (result == null) {
        say(ORDER_OFFLINE);
        return;
      }
      if (!result.ok) {
        say(orderRefusalText(result.refusal));
        // Zlecenie mogło się zmienić pod palcem - karta ma pokazać jego NOWY stan.
        reload();
        return;
      }
      done(result.card);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const openThread = (recipientId: string) => navigation.navigate('OrderThread', { orderId, recipientId });

  const openMenu = (source: MenuSource) => {
    setMenuReason('');
    setMenuFailed(null);
    setMenu(source);
  };

  const pick = (pilotId: string, seat: RemoteSeat) =>
    void run(`pick:${pilotId}`, () => orders!.assign(orderId, { pilotId, seat }), setFailed, onCard);

  const resend = () => void run('resend', () => orders!.patch(orderId, { resend: true }), setFailed, onCard);

  const cancel = () =>
    void run(
      'cancel',
      () => orders!.cancel(orderId, cancelReason.trim() === '' ? null : cancelReason.trim()),
      setCancelFailed,
      () => {
        setCancelOpen(false);
        // Odwołane schodzi z pozycji w toku - powrót tam, skąd się przyszło (32C).
        navigation.goBack();
      },
    );

  const menuReasonOrNull = () => (menuReason.trim() === '' ? null : menuReason.trim());

  const remove = (pilotId: string) =>
    void run('remove', () => orders!.patch(orderId, { removeRecipients: [pilotId], reason: menuReasonOrNull() }), setMenuFailed, (next) => {
      setMenu(null);
      onCard(next);
    });

  const unassign = (seat: RemoteSeat) =>
    void run('unassign', () => orders!.unassign(orderId, { seat, reason: menuReasonOrNull() }), setMenuFailed, (next) => {
      setMenu(null);
      onCard(next);
    });

  const startSwap = (seat: RemoteSeat, outgoing: string) => {
    // Powód zostaje - jest wspólny dla zamiany i odebrania (32D).
    setMenu(null);
    setSwapPick(null);
    setSwapFailed(null);
    setSwap({ seat, outgoing });
  };

  const confirmSwap = () => {
    if (swap == null || swapPick == null) return;
    const { seat, outgoing } = swap;
    void run(
      'swap',
      () =>
        orders!.patch(orderId, {
          removeRecipients: [outgoing],
          addRecipients: [{ seat, list: { pilotIds: [swapPick], groupIds: [] } }],
          reason: menuReasonOrNull(),
        }),
      setSwapFailed,
      (next) => {
        setSwap(null);
        setMenuReason('');
        onCard(next);
      },
    );
  };

  const candidates = useMemo(
    () => (swap == null ? [] : swapCandidates({ card, seat: swap.seat, outgoing: swap.outgoing, members: pilots })),
    [swap, card, pilots],
  );

  if (vm == null) return null;

  const crew = vm.crew;
  const { edit, resend: canResend, cancel: canCancel } = vm.actions;

  return (
    <>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TermHero
          date={vm.hero.date}
          badge={vm.hero.badge}
          hours={vm.hero.hours}
          length={vm.hero.length}
          aircraft={vm.hero.aircraft}
          countdown={vm.hero.countdown}
          tone={vm.hero.tone}
        />

        {failed != null && <InlineNote icon="warning" tone="amber" text={failed} />}

        {/* „Co już mam" - osoba przydzielona przechodzi tu z listy (32A, 32B). */}
        {crew != null && (
          <>
            <GroupLabel text="Załoga" />
            <Card flush>
              {crew.map((seat, i) => (
                <OrderCrewRow
                  key={seat.seat}
                  seat={seat}
                  divider={i < crew.length - 1}
                  onThread={seat.pilotId == null ? undefined : () => openThread(seat.pilotId!)}
                  onMenu={() => openMenu({ kind: 'crew', crew: seat })}
                />
              ))}
            </Card>
          </>
        )}

        {/* „Z czego jeszcze wybieram" - blok na każdy szukany fotel albo wspólna lista. */}
        {vm.blocks.map((block) => (
          <View key={block.key} style={s.block}>
            <SeatHead block={block} theme={theme} />
            <Card flush>
              {block.rows.map((row, i) => (
                <RecipientRow
                  key={row.pilotId}
                  row={row}
                  divider={i < block.rows.length - 1}
                  busy={busy != null}
                  onThread={() => openThread(row.pilotId)}
                  onMenu={() => openMenu({ kind: 'row', row, block: block.key })}
                  onPick={(seat) => pick(row.pilotId, seat)}
                />
              ))}
            </Card>
          </View>
        ))}

        {/* Adresaci fotela już obsadzonego - lista rezerwowych, nie znika (32B, pkt 14). */}
        {vm.others != null && (
          <View style={s.block}>
            <ExpandToggle
              open={othersOpen}
              onToggle={() => setOthersOpen((open) => !open)}
              parts={[{ text: 'Pozostali adresaci · ' }, { text: String(vm.others.count), strong: true }, { text: ' · zlecenie nieaktualne' }]}
            />
            {othersOpen && (
              <Card flush>
                {vm.others.rows.map((row, i) => (
                  <RecipientRow
                    key={row.pilotId}
                    row={row}
                    muted
                    divider={i < vm.others!.rows.length - 1}
                    onThread={() => openThread(row.pilotId)}
                  />
                ))}
              </Card>
            )}
          </View>
        )}

        <GroupLabel text="Zlecenie" />
        <Card flush>
          {vm.details.map((row, i) => (
            <DetailRow key={row.label} label={row.label} value={row.value} sub={row.sub} mono={row.mono} divider={i < vm.details.length - 1} />
          ))}
        </Card>

        {vm.history.length > 0 && (
          <>
            <GroupLabel text="Historia zmian" />
            <Card flush>
              {vm.history.map((row, i) => (
                <OrderHistoryRow key={row.id} row={row} divider={i < vm.history.length - 1} />
              ))}
            </Card>
          </>
        )}

        {/* Pas akcji tylko w zleceniu żywym. Edycja jest drogą główną prowadzącego;
            „WYŚLIJ PONOWNIE" znika razem z szukaniem; odwołanie na końcu, obramowane. */}
        {(edit || canResend) && (
          <View style={s.pair}>
            {edit && (
              <ActionButton
                label="EDYTUJ"
                tone="neutral"
                variant="secondary"
                size="md"
                disabled={busy != null}
                onPress={() => navigation.navigate('NewOrder', { orderId })}
                style={s.half}
              />
            )}
            {canResend && (
              <ActionButton
                label="WYŚLIJ PONOWNIE"
                tone="neutral"
                variant="secondary"
                size="md"
                busy={busy === 'resend'}
                disabled={busy != null && busy !== 'resend'}
                onPress={resend}
                style={s.half}
              />
            )}
          </View>
        )}
        {canCancel && (
          <ActionButton
            label="ODWOŁAJ ZLECENIE"
            icon="trash"
            tone="red"
            variant="secondary"
            size="md"
            disabled={busy != null}
            onPress={() => {
              setCancelFailed(null);
              setCancelOpen(true);
            }}
          />
        )}
      </ScrollView>

      {/* 32C - termin wraca do puli; powód opcjonalny i trafia do wiadomości adresatów. */}
      <Sheet
        visible={cancelOpen}
        title="ODWOŁANIE ZLECENIA"
        rows={reference == null ? [] : [{ label: 'Zlecenie', value: reference }]}
        warning="Termin się zwolni, a adresaci, którzy nie odmówili, dostaną wiadomość - z powodem, jeśli go podasz."
        confirmLabel="ODWOŁAJ"
        confirmTone="red"
        confirmDisabled={busy != null}
        onConfirm={cancel}
        cancelLabel="ANULUJ"
        onCancel={() => setCancelOpen(false)}
      >
        <TextField
          label="Powód"
          tag={{ label: 'opcjonalne' }}
          value={cancelReason}
          onChangeText={setCancelReason}
          placeholder="Np. maszyna idzie w sobotę na przegląd."
          multiline
          maxLength={REASON_MAX}
        />
        {cancelFailed != null && <InlineNote icon="warning" tone="amber" text={cancelFailed} />}
      </Sheet>

      {/* 32D - jedna osoba, trzy drogi: rozmowa, zamiana, odebranie (albo cofnięcie przydziału). */}
      <Sheet
        visible={menuVm != null}
        title={(menuVm?.title ?? '').toUpperCase()}
        cancelLabel="ZAMKNIJ"
        onCancel={() => setMenu(null)}
      >
        {menuVm != null && (
          <>
            <View style={s.person}>
              <AppText variant="micro" tone="muted">
                {menuVm.role}
              </AppText>
              <AppText variant="mono" style={s.state}>
                {menuVm.state}
              </AppText>
            </View>

            {menuVm.thread != null && (
              <Card flush>
                <ThreadRow
                  title={menuVm.thread.title}
                  sub={menuVm.thread.sub}
                  onPress={() => {
                    setMenu(null);
                    openThread(menuVm.pilotId);
                  }}
                />
              </Card>
            )}

            <TextField
              label="Powód"
              tag={{ label: 'opcjonalne' }}
              value={menuReason}
              onChangeText={setMenuReason}
              placeholder="Np. w sobotę potrzebny jest pilot z uprawnieniem instruktora."
              multiline
              maxLength={REASON_MAX}
            />

            {menuFailed != null && <InlineNote icon="warning" tone="amber" text={menuFailed} />}

            {menuVm.action.kind === 'remove' && menuVm.action.swapSeat != null && (
              <ActionButton
                label="ZAMIEŃ OSOBĘ"
                icon="swap"
                tone="neutral"
                variant="secondary"
                size="md"
                disabled={busy != null}
                onPress={() => startSwap((menuVm.action as { swapSeat: RemoteSeat }).swapSeat, menuVm.pilotId)}
              />
            )}
            {menuVm.action.kind === 'remove' ? (
              <ActionButton
                label="USUŃ Z ADRESATÓW"
                icon="clear"
                tone="red"
                variant="secondary"
                size="md"
                busy={busy === 'remove'}
                disabled={busy != null && busy !== 'remove'}
                onPress={() => remove(menuVm.pilotId)}
              />
            ) : (
              <ActionButton
                label="COFNIJ PRZYDZIAŁ"
                icon="unassign"
                tone="red"
                variant="secondary"
                size="md"
                busy={busy === 'unassign'}
                disabled={busy != null && busy !== 'unassign'}
                onPress={() => unassign((menuVm.action as { seat: RemoteSeat }).seat)}
              />
            )}

            <FootNote icon="message" parts={menuVm.note} />
          </>
        )}
      </Sheet>

      {/* 31C w kształcie „jedna osoba, bez grup" - nowa osoba dostaje fotel imiennie. */}
      <AddresseeSheet
        visible={swap != null}
        title={swap == null ? '' : `${seatLabel(swap.seat).toUpperCase()} · ADRESAT`}
        options={candidates}
        selected={swapPick}
        onSelect={setSwapPick}
        confirmLabel="ZAMIEŃ"
        busy={busy === 'swap'}
        warning={swapFailed}
        onConfirm={confirmSwap}
        onCancel={() => setSwap(null)}
      />
    </>
  );
}

/** `.seat-head` - fotel jako nagłówek swoich adresatów; licznik tych, którzy MOGĄ. */
function SeatHead({ block, theme }: { block: SeatBlockVm; theme: Theme }) {
  const s = styles(theme);
  return (
    <View style={s.seatHead}>
      <AppText variant="micro" tone="muted" style={s.seatTitle}>
        {block.title}
        {block.sub != null && (
          <AppText variant="micro" style={s.seatSub}>
            {` · ${block.sub}`}
          </AppText>
        )}
      </AppText>
      {block.count != null && (
        <AppText variant="mono" style={s.seatCount}>
          {block.count}
        </AppText>
      )}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 14, gap: 12, paddingBottom: 28 },
    block: { gap: 8 },
    seatHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, paddingTop: 2 },
    seatTitle: { flexShrink: 1 },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    seatSub: { fontFamily: t.fontFamily.monoMedium, color: t.colors.textSecondary },
    seatCount: { fontSize: 9, lineHeight: 13, letterSpacing: 1, color: t.colors.green },
    pair: { flexDirection: 'row', gap: 8 },
    half: { flex: 1 },
    person: { gap: 3, marginTop: -8 },
    state: { fontSize: 10, lineHeight: 14, letterSpacing: 0.3, color: t.colors.textSecondary },
  });
