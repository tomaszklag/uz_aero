/**
 * Ninerdeck - ZLECENIE: karta jednego zlecenia lotu (4.0.0, epik Z-C #247; makiety 28–28E,
 * 32–32D; `docs/zlecenia.md` §14).
 *
 * Jedna trasa, dwie karty: adresat widzi pytanie o fotel (28), prowadzący - fotele
 * z adresatami (32). Którą pokazać, rozstrzyga kształt odpowiedzi serwera i połowa listy,
 * z której pilot przyszedł (`logic/orderCardMode.ts`). Ekran leży NAD zakładkami, jak
 * karta rezerwacji i decyzja: wchodzi się z listy (30), ze skrzynki albo z pusha, a strzałka
 * wraca tam, skąd się przyszło.
 *
 * ══ BEZ POŁĄCZENIA - KARTA NA CAŁY EKRAN (28E) ══
 * Kopii zlecenia na telefonie nie ma (§2.2), a pusta karta wyglądałaby na zlecenie, które
 * się rozsypało. Przycisku ponowienia też nie ma: ekran wraca sam z powitaniem łącza
 * kanału klubu. Pilla łączności w nagłówku nie ma - o braku sieci mówi cała karta.
 */

import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { EmptyState, Screen, ScreenHeader, Skeleton } from '../components';
import { useOrderCard } from '../hooks/useOrderCard';
import { useSkeleton } from '../hooks/useSkeleton';
import { useTheme, type Theme } from '../theme';

import { orderCardMode, type OrderCardIntent } from './logic/orderCardMode';
import { OrderRecipientView } from './OrderRecipientView';

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
  replace: (screen: string, params?: object) => void;
};

export function OrderScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { orderId?: string; as?: OrderCardIntent } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);

  const orderId = route?.params?.orderId ?? null;
  const card = useOrderCard(orderId);
  const skeleton = useSkeleton(card.data === undefined);
  const mode = card.data == null ? null : orderCardMode(card.data.viewer, route?.params?.as);

  const header = <ScreenHeader title="ZLECENIE" size="md" backLabel="Wróć" onBack={() => navigation.goBack()} />;

  return (
    <Screen padded={false} header={header}>
      {card.data === undefined ? (
        skeleton ? (
          // Część wspólna obu kart: termin na górze i karta pod nim (`design/LOADERY.html`).
          <ScrollView style={s.scroll} contentContainerStyle={s.content} scrollEnabled={false}>
            <Skeleton height={112} radius={16} />
            <Skeleton height={190} radius={12} />
          </ScrollView>
        ) : null
      ) : card.data === null ? (
        <ScrollView style={s.scroll} contentContainerStyle={s.content}>
          <EmptyState
            tone="amber"
            icon="offline"
            title="BRAK POŁĄCZENIA"
            lines={[
              [
                { text: 'Zlecenie i rozmowa ' },
                { text: 'wymagają połączenia', bold: true },
                { text: ' - termin, załoga i odpowiedzi zmieniają się na bieżąco.' },
              ],
              [{ text: 'Wróć tu z zasięgiem. Lot z przyjętego zlecenia rozpoczniesz bez sieci - „ROZPOCZNIJ LOT" na Pulpicie.' }],
            ]}
          />
        </ScrollView>
      ) : mode === 'recipient' ? (
        <OrderRecipientView card={card.data} navigation={navigation} onCard={card.accept} reload={card.reload} />
      ) : null}
    </Screen>
  );
}

const styles = (_t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { flexGrow: 1, padding: 14, gap: 12, paddingBottom: 28 },
  });
