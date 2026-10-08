/**
 * Ninerdeck - 29 ROZMOWA W ZLECENIU (4.0.0, epik Z-C #247; makiety 29, 29A, 29B;
 * `docs/zlecenia.md` §7, pkt 3, 19, 20, 21, 43).
 *
 * Prywatny wątek autora zlecenia z jednym adresatem - do negocjacji, zanim padnie
 * odpowiedź. Termin zmienia edycja zlecenia, którą widzą wszyscy adresaci, nie rozmowa
 * (§7.2). Każdy z „Cudzymi rezerwacjami" czyta ją bez pola wiadomości (29B).
 *
 * ══ NA ŻYWO, BEZ BANERA ══
 * Wiadomości przychodzą kanałem klubu w całości i stają od razu, a w otwartej rozmowie
 * baner w aplikacji nie staje (pkt 43). Ekran nie ma wskaźnika połączenia: zerwane łącze
 * nie jest awarią, a po jego powrocie rozmowa dociąga to, co ją ominęło.
 *
 * ══ BEZ POŁĄCZENIA (29A) ══
 * Wczytane wiadomości zostają; pole wiadomości staje z powodem w środku, a szkic wpisany
 * wcześniej zostaje przygaszony. Przycisku ponowienia nie ma - pole wraca samo. Ponowna
 * wysyłka tego samego szkicu idzie z TYM SAMYM identyfikatorem, więc nie dubluje wiadomości.
 *
 * Pasek zlecenia nad wiadomościami prowadzi do karty zlecenia - wraca do niej, jeśli
 * stoi pod spodem stosu, zamiast kłaść drugą kopię.
 */

import React, { useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { uuidv4 } from '../../infrastructure/id';
import {
  DaySeparator,
  EmptyState,
  MessageBubble,
  OrderStrip,
  ReadOnlyNote,
  Screen,
  ScreenHeader,
  Skeleton,
  ThreadComposer,
} from '../components';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { useOrderCard } from '../hooks/useOrderCard';
import { useOrderThread } from '../hooks/useOrderThread';
import { usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useCurrentPilot } from '../store';
import { useTheme, type Theme } from '../theme';

import { MESSAGE_OFFLINE, threadRefusalText } from './logic/orderRefusals';
import { threadVm, type ThreadItemVm } from './logic/orderThread';

type Nav = {
  navigate: (screen: string, params?: object, options?: { pop?: boolean }) => void;
  goBack: () => void;
};

/** Limit wiadomości - ten sam, co na serwerze. */
const MESSAGE_MAX = 2000;

export function OrderThreadScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { orderId?: string; recipientId?: string } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();
  const viewerId = useCurrentPilot((p) => p.id);
  const pilots = usePilots();
  const regOf = useAircraftRegistrations();

  const orderId = route?.params?.orderId ?? null;
  const recipientId = route?.params?.recipientId ?? null;
  // Pasek zlecenia potrzebuje karty, ale otwarcie rozmowy nie jest otwarciem karty -
  // „Odczytane" zlecenia się tu nie zapisuje.
  const card = useOrderCard(orderId, { seen: false });
  const thread = useOrderThread(orderId, recipientId);
  const skeleton = useSkeleton(card.data === undefined || thread.data === undefined);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** Szkic w drodze - ponowienie tej samej treści idzie z tym samym identyfikatorem. */
  const pending = useRef<{ id: string; body: string } | null>(null);

  const vm = useMemo(() => {
    if (card.data == null || thread.data == null || recipientId == null) return null;
    return threadVm({
      page: thread.data,
      card: card.data,
      recipientId,
      viewerId,
      now,
      nameOf: (id) => pilots.find((p) => p.id === id)?.name ?? null,
      codeOf: (id) => pilots.find((p) => p.id === id)?.code ?? null,
      regOf,
    });
  }, [card.data, thread.data, recipientId, viewerId, now, pilots, regOf]);

  // Odwrócona lista stawia najnowsze na dole, a początek rozmowy dociąga przy przewinięciu.
  const items = useMemo(() => (vm == null ? [] : [...vm.items].reverse()), [vm]);

  const send = async () => {
    const body = draft.trim();
    if (body === '' || sending) return;
    const id = pending.current?.body === body ? pending.current.id : uuidv4();
    pending.current = { id, body };
    setSending(true);
    setRefusal(null);
    try {
      const outcome = await thread.send(id, body);
      if (outcome.kind === 'sent') {
        pending.current = null;
        setDraft('');
      } else if (outcome.kind === 'refused') {
        setRefusal(threadRefusalText(outcome.refusal));
      }
      // `offline` mówi samo pole - powód staje w nim, a szkic zostaje.
    } finally {
      setSending(false);
    }
  };

  const openOrder = () => {
    if (orderId == null || vm == null) return;
    navigation.navigate('Order', { orderId, as: vm.role === 'recipient' ? 'recipient' : 'leader' }, { pop: true });
  };

  const header = (
    <ScreenHeader
      title={vm == null ? 'ROZMOWA' : vm.header.title.toUpperCase()}
      subtitle={vm?.header.sub ?? undefined}
      size="md"
      backLabel="Wróć"
      onBack={() => navigation.goBack()}
    />
  );

  if (card.data === undefined || thread.data === undefined) {
    return (
      <Screen padded={false} header={header}>
        {skeleton && (
          <View style={s.loading} accessible accessibilityLabel="Ładowanie">
            <Skeleton height={52} radius={12} />
            <Skeleton width="62%" height={44} radius={14} />
            <Skeleton width="54%" height={44} radius={14} style={s.right} />
          </View>
        )}
      </Screen>
    );
  }

  if (vm == null) {
    // Kopii rozmowy na telefonie nie ma (§2.2) - bez połączenia ekran mówi to wprost.
    return (
      <Screen padded={false} header={header}>
        <ScrollView contentContainerStyle={s.offline}>
          <EmptyState
            tone="amber"
            icon="offline"
            title="BRAK POŁĄCZENIA"
            lines={[
              [
                { text: 'Zlecenie i rozmowa ' },
                { text: 'wymagają połączenia z internetem', bold: true },
                { text: ' - termin, załoga i odpowiedzi zmieniają się na bieżąco.' },
              ],
              [{ text: 'Wróć tu z zasięgiem. Lot z przyjętego zlecenia rozpoczniesz także bez zasięgu - „ROZPOCZNIJ LOT" na Pulpicie.' }],
            ]}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen padded={false} header={header}>
      <OrderStrip top={vm.strip.top} sub={vm.strip.sub} onPress={openOrder} />

      <FlatList
        inverted
        style={s.list}
        contentContainerStyle={s.listContent}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => <ThreadItem item={item} />}
        ItemSeparatorComponent={Gap}
        onEndReached={thread.loadOlder}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {vm.footer.kind === 'composer' ? (
        <ThreadComposer
          visibility={vm.footer.visibility}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            setRefusal(null);
          }}
          onSend={() => void send()}
          sending={sending}
          offlineReason={thread.offline ? MESSAGE_OFFLINE : null}
          refusal={refusal}
          maxLength={MESSAGE_MAX}
        />
      ) : (
        <ReadOnlyNote parts={vm.footer.parts} />
      )}
    </Screen>
  );
}

function ThreadItem({ item }: { item: ThreadItemVm }) {
  if (item.kind === 'day') return <DaySeparator label={item.label} />;
  return <MessageBubble side={item.side} own={item.own} author={item.author} body={item.body} time={item.time} read={item.read} />;
}

function Gap() {
  return <View style={GAP} />;
}

const GAP = { height: 6 };

const styles = (t: Theme) =>
  StyleSheet.create({
    loading: { gap: 12, padding: 14 },
    right: { alignSelf: 'flex-end' },
    offline: { flexGrow: 1, padding: 14 },
    list: { flex: 1 },
    listContent: { paddingTop: 10, paddingBottom: 12, paddingHorizontal: 14, backgroundColor: t.colors.bg },
  });
