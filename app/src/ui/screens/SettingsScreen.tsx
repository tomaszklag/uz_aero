/**
 * UZ Aero — 13 USTAWIENIA (mockup `design/13-ustawienia.html`).
 *
 * Pięć sekcji: motyw → bezpieczeństwo (PIN) → konto → diagnostyka GPS → o aplikacji.
 * Wszystko, co tu można zrobić, DZIAŁA OFFLINE — jedyny wyjątek (ponowne logowanie po
 * wylogowaniu) jest opisany przy przycisku, a sam przycisk przy niepustym outboxie
 * stoi zablokowany Z POWODEM i amber-boxem (§3.0, wzorzec `.outbox-guard` z 00).
 *
 * Diagnostyka GPS to CZUJNIK, nie sieć — mockup celowo pokazuje zdrowy fix przy
 * chipie `Offline · 3`: dwie niezależne osie. Utratę fixa w locie pokazuje kokpit
 * (wariant 05g); tu jest warsztat do sprawdzenia „czy GPS w ogóle żyje" na ziemi.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Constants from 'expo-constants';

import { GPS_STALE_SEC, type GpsFix } from '../../domain';
import { REFERENCE_META_CHECKED_AT } from '../../application';
import {
  AppText,
  Banner,
  Card,
  GhostAction,
  Icon,
  PinChangeSheet,
  ProfileChip,
  Screen,
  ScreenHeader,
  SyncChip,
  ThemePicker,
  type IconName,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useGps } from '../bootstrap/ServicesProvider';
import { formatLatLon, timeUtc } from '../format';
import { fixAge } from './gpsLoss';
import { eventsCount } from './syncStatus';

export function SettingsScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const gps = useGps();

  const pilot = useAuthStore((s) => s.pilot);
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const changePin = useAuthStore((s) => s.changePin);
  const logout = useAuthStore((s) => s.logout);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const synced = useSessionStore((s) => s.synced);
  const projection = useSessionStore((s) => s.projection);
  const queries = useSessionStore((s) => s.queries);
  const repo = useSessionStore((s) => s.repo);
  const sessionReset = useSessionStore((s) => s.reset);

  const [pinSheet, setPinSheet] = useState(false);
  const [pinChanged, setPinChanged] = useState(false);

  // ── diagnostyka GPS: żywa subskrypcja na czas otwarcia ekranu ─────────────
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stopRef = useRef<(() => void) | null>(null);

  const subscribe = useCallback(async () => {
    stopRef.current?.();
    stopRef.current = null;
    if (gps == null) {
      setPermission('denied');
      return;
    }
    const granted = await gps.requestPermission();
    if (granted !== 'granted') {
      setPermission('denied');
      return;
    }
    setPermission('granted');
    stopRef.current = await gps.start((incoming) => {
      setFix(incoming);
      setReceivedAt(Date.now());
    });
  }, [gps]);

  useEffect(() => {
    void subscribe();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopRef.current?.();
      clearInterval(tick);
    };
  }, [subscribe]);

  // ── stempel cache referencyjnego + typ samolotu sesji ─────────────────────
  const [refCheckedAt, setRefCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (repo == null) return;
    let alive = true;
    void repo.getMeta(REFERENCE_META_CHECKED_AT).then((v) => {
      if (alive) setRefCheckedAt(v != null ? Number(v) : null);
    });
    return () => {
      alive = false;
    };
  }, [repo]);

  const [aircraftType, setAircraftType] = useState<string | null>(null);
  useEffect(() => {
    if (queries == null || projection.aircraftId == null) return;
    let alive = true;
    void queries.aircraftById(projection.aircraftId).then((a) => {
      if (alive) setAircraftType(a?.type ?? null);
    });
    return () => {
      alive = false;
    };
  }, [queries, projection.aircraftId]);

  const [logoutError, setLogoutError] = useState<string | null>(null);
  const doLogout = useCallback(async () => {
    const block = await logout(outboxCount);
    if (block != null) {
      setLogoutError('Wylogowanie zablokowane — kolejka wysyłki nie jest pusta.');
      return;
    }
    // Wylogowanie czyści też stan sesji w pamięci (dane w SQLite zostają — to rejestr
    // samolotu, nie pilota); bramka w App.tsx sama przełączy na 00a-login.
    sessionReset();
  }, [logout, outboxCount, sessionReset]);

  const gpsFresh = receivedAt != null && now - receivedAt <= GPS_STALE_SEC * 1000;
  const logoutBlocked = outboxCount > 0;
  const version = Constants.expoConfig?.version;

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="USTAWIENIA"
          size="md"
          onBack={navigation.goBack}
          backLabel="Kokpit"
          right={<SyncChip status={synced ? 'synced' : 'offline'} outboxCount={outboxCount} />}
        />
      }
    >
      <View style={styles.content}>
        {/* ── motyw ─────────────────────────────────────────────────────────── */}
        <Card title="Motyw wyświetlacza" header="inline">
          <ThemePicker detailed />
          <GhostAction label="Podgląd motywów w kokpicie" onPress={() => navigation.navigate('StyleGuide')} />
          <SectionNote text="Zapisywany na telefonie, per pilot — działa offline." />
        </Card>

        {/* ── bezpieczeństwo ────────────────────────────────────────────────── */}
        <Card title="Bezpieczeństwo" header="inline">
          <SettingsAction
            icon="settings"
            name="Zmień PIN"
            sub="najpierw obecny PIN, potem nowy"
            onPress={() => {
              setPinChanged(false);
              setPinSheet(true);
            }}
          />
          {pinChanged && (
            <Banner kind="status" tone="green" icon="check" title="PIN zmieniony" text="Nowy PIN obowiązuje od teraz — stary przestał działać." />
          )}
          <SectionNote text="PIN sprawdzany lokalnie na telefonie — zmiana działa w 100% offline." />
        </Card>

        {/* ── konto (§3.0: ochrona wylogowania) ─────────────────────────────── */}
        <Card title="Konto" header="inline">
          {pilot != null && <ProfileChip name={pilot.name} code={pilot.code} style={styles.profile} />}
          <SettingsAction
            icon="offline"
            name="Wyloguj i zmień konto"
            sub={
              logoutBlocked
                ? `niedostępne — ${eventsCount(outboxCount)} czeka na wysyłkę`
                : 'ponowne logowanie wymaga internetu'
            }
            disabled={logoutBlocked}
            onPress={() => void doLogout()}
          />
          {logoutBlocked && (
            <View
              style={[
                styles.guard,
                {
                  backgroundColor: theme.colors.amberMuted,
                  borderColor: theme.colors.amberBorder,
                  borderWidth: theme.borderWidth,
                },
              ]}
            >
              <Icon name="warning" size={13} color={theme.colors.amber} />
              <AppText variant="body" tone="secondary" style={styles.guardText}>
                <AppText variant="body" style={[styles.guardText, { color: theme.colors.amber, fontWeight: '600' }]}>
                  {`${eventsCount(outboxCount)} z dzisiejszej sesji`}
                </AppText>
                {' nie dotarły jeszcze na serwer — wylogowanie by je osierociło. Wróć do zasięgu: wyślą się same i przycisk się odblokuje.'}
              </AppText>
            </View>
          )}
          {logoutError != null && (
            <Banner kind="warning" tone="red" icon="warning" title="Nie wylogowano" text={logoutError} />
          )}
          <SectionNote text="Ponowne logowanie wymaga internetu — konta zakłada administrator." />
        </Card>

        {/* ── diagnostyka GPS (czujnik — oś niezależna od sieci) ────────────── */}
        <Card title="Diagnostyka GPS" header="inline">
          <DiagRow
            label="Status"
            value={permission === 'denied' ? 'BRAK UPRAWNIEŃ' : gpsFresh ? 'FIX' : 'BRAK FIXA'}
            tone={permission !== 'denied' && gpsFresh ? 'green' : 'red'}
          />
          <DiagRow
            label="Ostatni fix"
            value={fix != null ? `${timeUtc(fix.time)} UTC · ${fixAge(fix.time, now)}` : '—'}
          />
          <DiagRow
            label="Dokładność"
            value={fix?.accuracyM != null ? `± ${Math.round(fix.accuracyM)} m` : '—'}
          />
          <DiagRow
            label="Pozycja"
            value={fix?.lat != null && fix.lon != null ? formatLatLon(fix.lat, fix.lon) : '—'}
          />
          <GhostAction label="Odśwież" onPress={() => void subscribe()} />
          <SectionNote text="Czujnik lokalny — odczyt działa bez zasięgu. Brak fixa w locie zobaczysz w kokpicie jako czerwony baner." />
        </Card>

        {/* ── o aplikacji ───────────────────────────────────────────────────── */}
        <Card title="O aplikacji" header="inline">
          <DiagRow label="Aplikacja" value={`UZ Aero${version != null ? ` · v${version}` : ''}`} />
          <DiagRow
            label="Samolot sesji"
            value={
              projection.aircraftId != null
                ? `${projection.aircraftId}${aircraftType != null ? ` · ${aircraftType}` : ''}`
                : '—'
            }
          />
          <View style={styles.refRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: refCheckedAt != null ? theme.colors.green : theme.colors.amber },
              ]}
            />
            <AppText variant="mono" tone="secondary" style={styles.refText}>
              {refCheckedAt != null
                ? `Dane referencyjne · sync ${timeUtc(refCheckedAt)} UTC`
                : 'Dane referencyjne · jeszcze bez synca'}
            </AppText>
          </View>
          <SectionNote text="Dane referencyjne odświeżają się same przy każdym kontakcie z siecią." />
        </Card>
      </View>

      {/* ── arkusz zmiany PIN (obecny → nowy → powtórz, w pełni offline) ────── */}
      <PinChangeSheet
        visible={pinSheet}
        verifyCurrent={verifyPin}
        save={async (current, next) => {
          await changePin(current, next);
        }}
        onDone={() => {
          setPinSheet(false);
          setPinChanged(true);
        }}
        onCancel={() => setPinSheet(false)}
      />
    </Screen>
  );
}

/** `.action-item` — wiersz akcji sekcji: ikona, nazwa, podpis, strzałka. */
function SettingsAction({
  icon,
  name,
  sub,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  name: string;
  sub: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfaceHover : theme.colors.surfaceRaised,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <Icon name={icon} size={16} color={disabled ? theme.colors.textMuted : theme.colors.textSecondary} />
      <View style={styles.actionBody}>
        <AppText variant="body" style={styles.actionName}>
          {name}
        </AppText>
        <AppText variant="mono" tone={disabled ? 'amber' : 'muted'} style={styles.actionSub}>
          {sub}
        </AppText>
      </View>
      <Icon name="more" size={14} color={theme.colors.textMuted} />
    </Pressable>
  );
}

/** `.diag-row` — klucz/wartość diagnostyki. */
function DiagRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'green' | 'red';
}) {
  const { theme } = useTheme();
  const color =
    tone === 'green' ? theme.colors.green : tone === 'red' ? theme.colors.red : theme.colors.textSecondary;
  return (
    <View style={[styles.diagRow, { borderBottomColor: theme.colors.border, borderBottomWidth: theme.borderWidth }]}>
      <AppText variant="mono" tone="muted" style={styles.diagKey}>
        {label}
      </AppText>
      <AppText variant="mono" style={[styles.diagVal, { color }]}>
        {value}
      </AppText>
    </View>
  );
}

/** `.section-note` — przypis sekcji (mono, muted). */
function SectionNote({ text }: { text: string }) {
  return (
    <AppText variant="mono" tone="muted" style={styles.note}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 12 },
  profile: { minWidth: 0, alignSelf: 'stretch' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionBody: { flex: 1, gap: 2 },
  actionName: { fontSize: 13, fontWeight: '600' },
  actionSub: { fontSize: 9, letterSpacing: 0.5 },
  guard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  guardText: { flex: 1, fontSize: 10.5, lineHeight: 16 },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 7,
  },
  diagKey: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  diagVal: { fontSize: 11, textAlign: 'right', flexShrink: 1 },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  refText: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  note: { fontSize: 9, lineHeight: 14, letterSpacing: 0.5 },
});
