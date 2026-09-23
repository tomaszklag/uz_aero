/**
 * Ninerdeck - 26 DECYZJA o cudzej rezerwacji (3.1.0, epik R-I; makiety `26`, `26C`;
 * `docs/rezerwacje.md` §9.4, §11).
 *
 * ══ EKRAN PYTA CIEBIE ══
 * Kroku nie piszemy: karta niesie plan pilota w komplecie (kto, czym, kiedy, po co),
 * a pod pasem akcji stoi JEDNO zdanie o tym, co się stanie po zgodzie i po odmowie.
 *
 * ══ ODMOWA NIE JEST CZERWONA, ALE MA POWÓD ══
 * Czerwień niesie w tej aplikacji kasowanie; odmowa jest decyzją i stoi obok zgody
 * wyciszona. Powód jest WYMAGANY - pilot czyta go na swoim telefonie - a przycisk
 * w arkuszu blokuje BEZ zdania, bo puste pole widać nad nim (issue #55).
 *
 * ══ DECYZJĘ ZAPISUJE SERWER ══
 * Zapis nie idzie przez outbox (§2.1): to arbitraż o cudzy termin i musi zapaść RAZ.
 * `null` z warstwy synca znaczy „nie dojechało", a odmowa reguły przychodzi z kodem,
 * który ekran nazywa zdaniem (`decisionRefusalText`). Po udanej decyzji ekran wraca
 * do skrzynki - tam plakietka „Do decyzji" gaśnie, a wiadomość zostaje jako zapis.
 *
 * Podglądy pilota i samolotu (26A/26B) nie prowadzą jeszcze w głąb - osobne zgłoszenie
 * po R-H (decyzja właściciela 2026-09-23).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Card,
  GroupLabel,
  Icon,
  KeyValueRow,
  Screen,
  ScreenHeader,
  Sheet,
  Skeleton,
  TextField,
} from '../components';
import { useAircraft } from '../hooks/useAircraft';
import { useBooking } from '../hooks/useBooking';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { usePilots } from '../hooks/usePilots';
import { useSkeleton } from '../hooks/useSkeleton';
import { useSessionStore } from '../store';
import { useTheme, type Theme } from '../theme';

import { decisionRefusalText, decisionView } from './logic/decision';

type Nav = {
  navigate: (screen: string, params?: object) => void;
  goBack: () => void;
};

const REASON_MAX = 500;

export function DecisionScreen({
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

  const pilots = usePilots();
  const aircraft = useAircraft(data?.booking.aircraftId ?? null);
  const sync = useSessionStore((st) => st.sync);

  const [refuseOpen, setRefuseOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const vm = useMemo(() => {
    if (data == null) return null;
    const person = (id: string | null) => {
      const p = id == null ? null : (pilots.find((x) => x.id === id) ?? null);
      return p == null ? null : { name: p.name, code: p.code };
    };
    return decisionView({
      booking: data.booking,
      day: data.day,
      approval: data.approval,
      now,
      aircraft: aircraft == null ? null : { reg: aircraft.reg, type: aircraft.type ?? null },
      pilot: person(data.booking.pilotId),
      dual: person(data.booking.dualId),
    });
  }, [data, now, aircraft, pilots]);

  const decide = useCallback(
    async (decision: 'approved' | 'rejected') => {
      if (sync == null || bookingId == null || busy) return;

      setBusy(true);
      setFailed(null);
      try {
        const trimmed = reason.trim();
        const result = await sync.decideBooking(bookingId, {
          decision,
          reason: decision === 'rejected' ? trimmed : null,
        });

        // `null` = decyzja NIE DOJECHAŁA. Rozstrzyga serwer, więc dopóki nie odpowiedział,
        // sprawa dalej czeka - i tak ma się to czytać.
        if (result == null) {
          setFailed('Decyzję zapisuje serwer - potrzebne połączenie.');
          return;
        }
        if (!result.ok) {
          setFailed(decisionRefusalText(result.refusal));
          // Sprawa mogła zostać rozstrzygnięta przez kogoś innego: karta ma pokazać
          // jej NOWY stan, a nie obiecywać dalej pas akcji.
          reload();
          return;
        }

        setRefuseOpen(false);
        navigation.goBack();
      } finally {
        setBusy(false);
      }
    },
    [sync, bookingId, busy, reason, reload, navigation],
  );

  const header = (
    <ScreenHeader title="DECYZJA" size="md" backLabel="Wróć" onBack={() => navigation.goBack()} />
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
            <>
              <Skeleton width={160} height={12} />
              <Skeleton height={260} radius={14} />
            </>
          ) : null
        ) : vm == null ? (
          <Missing theme={theme} />
        ) : (
          <>
            <GroupLabel text="Rezerwacja do rozpatrzenia" />
            <Card>
              {vm.rows.map((row) => (
                <KeyValueRow key={row.label} label={row.label} value={row.value} sub={row.sub} />
              ))}
            </Card>

            {failed != null && (
              <AppText variant="body" style={s.failed}>
                {failed}
              </AppText>
            )}

            {vm.decidable && (
              <>
                <ActionButton
                  label="ZATWIERDŹ"
                  icon="check"
                  tone="green"
                  disabled={busy}
                  onPress={() => void decide('approved')}
                />
                <ActionButton
                  label="ODMÓW"
                  icon="clear"
                  tone="neutral"
                  variant="secondary"
                  size="md"
                  disabled={busy}
                  onPress={() => setRefuseOpen(true)}
                />
                <View style={s.foot}>
                  <Icon name="info" size={13} color={theme.colors.textMuted} />
                  <AppText variant="body" style={s.footText}>
                    {vm.footnote}
                  </AppText>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* 26C: powód WYMAGANY, blokada bez zdania - puste pole widać nad przyciskiem. */}
      <Sheet
        visible={refuseOpen}
        title="ODMOWA"
        rows={vm == null ? [] : [{ label: 'Rezerwacja', value: vm.reference }]}
        confirmLabel="ODMÓW"
        confirmDisabled={reason.trim() === '' || busy}
        onConfirm={() => void decide('rejected')}
        cancelLabel="ANULUJ"
        onCancel={() => setRefuseOpen(false)}
      >
        <TextField
          label="Powód"
          value={reason}
          onChangeText={setReason}
          placeholder="Napisz, dlaczego nie - pilot przeczyta to na swoim telefonie."
          multiline
          maxLength={REASON_MAX}
        />
      </Sheet>
    </Screen>
  );
}

/**
 * Sprawy nie ma - rozstrzygnięta i zdjęta, odwołana albo telefon jej nie dosięgnął.
 * Powodów NIE ROZRÓŻNIAMY (ta sama zasada, co na karcie rezerwacji): cudza sprawa ma
 * być dla tego telefonu nieistniejąca.
 */
function Missing({ theme }: { theme: Theme }) {
  const s = styles(theme);

  return (
    <Card flush>
      <View style={s.missing}>
        <Icon name="offline" size={30} color={theme.colors.amber} />
        <AppText variant="display" style={s.missingTitle}>
          NIE MA TEJ SPRAWY
        </AppText>
        <AppText variant="body" style={s.missingText}>
          Rezerwacja mogła zostać rozstrzygnięta albo odwołana, albo telefon nie ma jak o nią
          zapytać. Wróć do skrzynki z zasięgiem.
        </AppText>
      </View>
    </Card>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 28 },

    failed: { fontSize: 12, lineHeight: 17, color: t.colors.amber },

    // `.foot-note`: zdanie o skutku decyzji - przypis do pasa akcji, nie baner.
    foot: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: 4 },
    footText: { flex: 1, fontSize: 11, lineHeight: 16, color: t.colors.textSecondary },

    missing: { alignItems: 'center', gap: 10, padding: 22 },
    missingTitle: { fontSize: 22, letterSpacing: 2, color: t.colors.amber, textAlign: 'center' },
    missingText: { fontSize: 13, lineHeight: 19, color: t.colors.textSecondary, textAlign: 'center' },
  });
