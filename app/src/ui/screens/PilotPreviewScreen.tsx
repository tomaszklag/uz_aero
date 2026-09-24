/**
 * Ninerdeck - ekran 26A: PODGLĄD PILOTA przy decyzji (3.1.0, issue #206;
 * `design/26a-podglad-pilota.html`).
 *
 * ══ PODGLĄD JEST EKRANEM, NIE ARKUSZEM ══
 * W panelu ten sam zestaw faktów wysuwa się szufladą NAD kolejką. Na telefonie nie ma
 * takiego miejsca: cztery karty i tabela to treść na cały ekran, a arkusz z sufitem
 * 56 px byłby ekranem udającym wstawkę. Powrót jest jeden - strzałka w nagłówku,
 * wprost do decyzji. Podgląd nie ma ANI JEDNEJ akcji na sprawie: zgoda i odmowa
 * zostają tam, gdzie stoi komplet danych.
 *
 * Fakty liczy serwer, JEDNYM zapytaniem dla obu powierzchni; `logic/previewRows.ts`
 * składa z nich napisy. Ekran wymaga sieci (§12.1) - bez niej mówi to wprost.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Screen, ScreenHeader, Skeleton } from '../components';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { usePilotPreview } from '../hooks/usePreview';
import { useSkeleton } from '../hooks/useSkeleton';
import { useTheme, type Theme } from '../theme';

import { PreviewBody, PreviewMissing } from '../components/data/PreviewBody';
import { pilotPreviewVm } from './logic/previewRows';

type Nav = { goBack: () => void };

export function PilotPreviewScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route?: { params?: { bookingId?: string; pilotId?: string } };
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const now = useMinuteTicker();

  const bookingId = route?.params?.bookingId ?? null;
  const pilotId = route?.params?.pilotId ?? null;
  const { data } = usePilotPreview(bookingId, pilotId);
  const skeleton = useSkeleton(data === undefined);

  const pilots = usePilots();
  const regOf = useAircraftRegistrations();

  const vm = useMemo(() => {
    if (data == null) return null;
    return pilotPreviewVm(data, {
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
      title={vm?.title ?? 'PILOT'}
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
              <Skeleton height={96} radius={14} />
              <Skeleton height={140} radius={14} />
            </>
          ) : null
        ) : vm == null ? (
          <PreviewMissing what="tego pilota" />
        ) : (
          <PreviewBody vm={vm} />
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
