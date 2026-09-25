/**
 * Ninerdeck - ekran 26B: PODGLĄD SAMOLOTU przy decyzji (3.1.0, issue #206;
 * `design/26b-podglad-samolotu.html`).
 *
 * Ten sam kształt, co 26A, drugie pytanie: pilot pyta „kto", samolot - „czym". Czy
 * maszyna jest w stanie polecieć, co pokazują liczniki i czy termin nie wpada pod
 * przegląd - „Najbliższe terminy" mieszają rezerwacje z wyłączeniami z użytku
 * świadomie, bo przegląd wchodzi do kalendarza właśnie jako wyłączenie.
 *
 * Liczniki NIOSĄ ŹRÓDŁO - kto i kiedy - bo liczba bez metryczki wygląda na stan
 * bieżący, a bywa sprzed tygodnia; to ta sama zasada, którą 02A stosuje do przekazania.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { GhostAction, Screen, ScreenHeader, Skeleton } from '../components';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { useAircraftPreview } from '../hooks/usePreview';
import { useSkeleton } from '../hooks/useSkeleton';
import { useTheme, type Theme } from '../theme';

import { PreviewBody, PreviewMissing } from '../components/data/PreviewBody';
import { aircraftPreviewVm } from './logic/previewRows';

type Nav = { goBack: () => void; navigate: (screen: string, params?: object) => void };

export function AircraftPreviewScreen({
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
  const { data } = useAircraftPreview(bookingId);
  const skeleton = useSkeleton(data === undefined);

  const pilots = usePilots();
  const regOf = useAircraftRegistrations();

  const vm = useMemo(() => {
    if (data == null) return null;
    return aircraftPreviewVm(data, {
      now,
      regOf,
      personOf: (id) => {
        const p = pilots.find((x) => x.id === id);
        return p == null ? null : { name: p.name, code: p.code };
      },
    });
  }, [data, now, regOf, pilots]);

  const header = (
    <ScreenHeader
      title={vm?.title ?? 'SAMOLOT'}
      size="md"
      backLabel="Wróć"
      onBack={() => navigation.goBack()}
    />
  );

  return (
    <Screen padded={false} header={header}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {data === undefined ? (
          skeleton ? (
            <>
              <Skeleton width={220} height={12} />
              <Skeleton height={120} radius={14} />
              <Skeleton height={96} radius={14} />
            </>
          ) : null
        ) : vm == null ? (
          <PreviewMissing what="tej maszyny" />
        ) : (
          <>
            <PreviewBody vm={vm} />
            {/* Stopka (obserwowanie 3.2.0): karta maszyny (27) - WYŁĄCZNIE dla osoby ze
                zdolnością „Obserwowanie samolotów"; bit jedzie w odpowiedzi podglądu, bo
                telefon zdolności nie zna. Bez niego stopki nie ma wcale - nie ma
                wyszarzonego wejścia w ekran, który odpowie 403. */}
            {data?.viewer?.watch === true && (
              <GhostAction
                label="Pokaż kartę samolotu"
                icon="more"
                onPress={() => navigation.navigate('Aircraft', { aircraftId: data.aircraft.id })}
              />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = (_t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 28 },
  });
