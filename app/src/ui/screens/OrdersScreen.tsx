/**
 * Ninerdeck - 30 ZLECENIA: lista „Do mnie" i „Zlecone" (4.0.0, epik Z-C #247; makiety 30,
 * 30A; `docs/zlecenia.md` §14).
 *
 * ══ EKRAN NAD ZAKŁADKAMI, NIE CZWARTA ZAKŁADKA (decyzja 7) ══
 * Wejście kartą „Zlecenia" na Pulpicie (20F), skrzynką i pushem; wyjście tam, skąd się
 * przyszło. Trzy zakładki odpowiadają na trzy pytania w czasie, a zlecenia na „co klub
 * chce ode mnie" - jak skrzynka.
 *
 * ══ DWIE POŁOWY, DWA PYTANIA ══
 * „Do mnie" - zlecenia, które trafiły do Ciebie; „Zlecone" - te, które prowadzisz. Drugą
 * połowę widzi wyłącznie osoba, która zleca albo prowadzi cudze (bity z serwera, §9) -
 * jedna połowa przełącznika nie jest przełącznikiem, więc reszta dostaje samą listę.
 * Lista otwiera się tam, gdzie coś czeka na Twoją odpowiedź (pkt 36).
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI (§2.2) ══
 * Bez zasięgu ekran mówi „BRAK POŁĄCZENIA" i wraca sam z powitaniem łącza kanału klubu -
 * bez przycisku ponowienia i bez odpytywania (K1).
 *
 * Wiersze i plakietki liczy `logic/orderList.ts`, liczby i połowę - `logic/orderSummary.ts`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { RemoteOrderBox } from '../../application';
import { ActionButton, AppText, EmptyState, OrderRow, Screen, ScreenHeader, SegmentedControl, SkeletonRows } from '../components';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { useOrderList } from '../hooks/useOrderList';
import { useOrderSummary } from '../hooks/useOrderSummary';
import { usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useCurrentPilot } from '../store';
import { useTheme, type Theme } from '../theme';

import { orderListVm, type OrderRowVm } from './logic/orderList';
import { defaultBox, segmentsVm } from './logic/orderSummary';

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
};

/** Wysokość zwartego wiersza zlecenia - plamka ładowania trzyma dokładnie tyle. */
const ROW_HEIGHT = 84;

export function OrdersScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { box?: RemoteOrderBox } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();
  const pilotId = useCurrentPilot((p) => p.id);

  const summary = useOrderSummary();
  const [chosen, setChosen] = useState<RemoteOrderBox | null>(route?.params?.box ?? null);

  // Połowa na start rozstrzyga się RAZ - z pierwszych liczb. Późniejsza zmiana liczb
  // (sygnał kanału) nie przestawia listy pod palcem.
  useEffect(() => {
    if (chosen == null && summary.data !== undefined) setChosen(defaultBox(summary.data));
  }, [chosen, summary.data]);

  const box = chosen;
  const list = useOrderList(box);
  const regOf = useAircraftRegistrations();
  const pilots = usePilots();

  const vm = useMemo(() => {
    if (list.data == null || box == null) return null;
    return orderListVm({
      list: list.data,
      box,
      now,
      pilotId,
      nameOf: (id) => pilots.find((p) => p.id === id)?.name ?? null,
      regOf,
    });
  }, [list.data, box, now, pilotId, pilots, regOf]);

  const segments = box == null ? null : segmentsVm(summary.data ?? null, box);
  const offline = summary.data === null || list.data === null;
  const loading = !offline && (summary.data === undefined || box == null || list.data === undefined);
  const skeleton = useSkeleton(loading);

  const open = (row: OrderRowVm) => {
    if (row.target.screen === 'booking') {
      navigation.navigate('BookingDetails', { bookingId: row.target.bookingId });
      return;
    }
    navigation.navigate('Order', { orderId: row.target.orderId, as: box === 'managed' ? 'leader' : 'recipient' });
  };

  const header = (
    <ScreenHeader title="ZLECENIA" subtitle="CZASY KLUBU" size="md" backLabel="Pulpit" onBack={() => navigation.goBack()} />
  );

  return (
    <Screen padded={false} header={header}>
      {segments?.shown === true && box != null && (
        <View style={s.segWrap}>
          <SegmentedControl
            value={box}
            onChange={setChosen}
            options={[
              { key: 'inbox', label: 'Do mnie', count: segments.inboxCount, countTone: 'blue' },
              { key: 'managed', label: 'Zlecone', count: segments.managedCount, countTone: 'neutral' },
            ]}
          />
        </View>
      )}

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {offline ? (
          <EmptyState
            tone="amber"
            icon="offline"
            title="BRAK POŁĄCZENIA"
            lines={[
              [
                { text: 'Zlecenia ' },
                { text: 'wymagają połączenia', bold: true },
                { text: ' - odpowiedzi i fotele zmieniają się na bieżąco.' },
              ],
              [{ text: 'Wróć tu z zasięgiem. Lot z przyjętego zlecenia rozpoczniesz bez sieci - „ROZPOCZNIJ LOT" na Pulpicie.' }],
            ]}
          />
        ) : loading || vm == null ? (
          skeleton ? (
            <View accessible accessibilityLabel="Ładowanie" style={s.skeleton}>
              <SkeletonRows rows={3} height={ROW_HEIGHT} radius={12} gap={6} />
            </View>
          ) : null
        ) : vm.days.length === 0 && vm.done.length === 0 ? (
          box === 'managed' ? (
            <EmptyState
              tone="neutral"
              icon="inbox"
              title="NIC NIE ZLECONO"
              lines={[
                [
                  { text: 'Tu zobaczysz ' },
                  { text: 'zlecenia lotów, które prowadzisz', bold: true },
                  { text: ' - z odczytami i odpowiedziami adresatów.' },
                ],
              ]}
            />
          ) : (
            <EmptyState
              tone="neutral"
              icon="inbox"
              title="NIC NIE PRZYSZŁO"
              lines={[
                [
                  { text: 'Tu trafią ' },
                  { text: 'zlecenia lotów od klubu', bold: true },
                  { text: ' - odpowiesz na nie jednym tapnięciem.' },
                ],
              ]}
            />
          )
        ) : (
          <>
            {vm.days.map((day) => (
              <View key={day.key} style={s.group}>
                <AppText variant="mono" style={s.dayLabel}>
                  {day.label.toUpperCase()}
                </AppText>
                {day.rows.map((row) => (
                  <OrderRow key={row.key} row={row} onPress={() => open(row)} />
                ))}
              </View>
            ))}
            {vm.done.length > 0 && (
              <View style={s.group}>
                {/* Granica „Zakończonych" z linią, jak archiwum w Historii (24A) - widać,
                    gdzie kończy się to, na co można jeszcze odpowiedzieć. */}
                <View style={s.olderHead}>
                  <AppText variant="mono" style={s.olderLabel}>
                    ZAKOŃCZONE
                  </AppText>
                  <View style={s.olderLine} />
                </View>
                {vm.done.map((row) => (
                  <OrderRow key={row.key} row={row} onPress={() => open(row)} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* „NOWE ZLECENIE" stoi wyłącznie w „Zlecone" i wyłącznie przy „Zlecaniu lotów" -
          samo prowadzenie cudzych zleceń nie daje prawa wysyłania nowych (§9). */}
      {box === 'managed' && summary.data?.canCreate === true && (
        <View style={s.actionBar}>
          <ActionButton label="NOWE ZLECENIE" icon="add" tone="green" onPress={() => navigation.navigate('NewOrder')} />
        </View>
      )}
    </Screen>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    segWrap: { paddingTop: 10, paddingHorizontal: 14, paddingBottom: 2 },
    scroll: { flex: 1 },
    content: { flexGrow: 1, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 28, gap: 14 },
    skeleton: { gap: 6 },
    group: { gap: 6 },
    dayLabel: { fontSize: 9, letterSpacing: 2, color: t.colors.textMuted, paddingHorizontal: 13, paddingBottom: 2 },
    // W makiecie nagłówek stoi 14 px nad pierwszym wierszem (odstęp listy), a wiersze
    // grupy - 6 px od siebie; dopełnienie do 14 niesie sam nagłówek.
    olderHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginBottom: 8 },
    olderLabel: { fontSize: 8.5, letterSpacing: 1.5, color: t.colors.textMuted },
    olderLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border },
    actionBar: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
  });
