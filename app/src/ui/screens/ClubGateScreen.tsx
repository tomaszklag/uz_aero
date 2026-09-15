/**
 * Ninerdeck - 00C CZEKA NA ZATWIERDZENIE, 00D ZGŁOSZENIE ODRZUCONE i 00E BEZ KLUBU.
 *
 * Jeden ekran w trzech stanach (mockupy `design/00c-oczekiwanie.html`, `00d-odrzucone.html`
 * i `00e-bez-klubu.html`): wariant to STAN wobec klubów, nie osobny ekran - ten sam
 * układ, inny ton karty, inny zestaw wyjść. Treść liczy `logic/clubGateView.ts`
 * (z testami), tu jest wyłącznie układ.
 *
 * ══ TEN EKRAN MA PRAWO TŁUMACZYĆ ══
 * To wąska kategoria z issue #72 - BLOKADA Z POWODEM: pilot nie może dalej i musi
 * wiedzieć, na co czeka albo skąd wziąć kod klubu. Nie ma tu ani słowa o tym, JAK to
 * jest zbudowane (członkostwa, tokeny, kolejka zgłoszeń).
 *
 * ══ KOD KLUBU JEST JEDYNĄ DROGĄ DO KLUBU (2026-09-09, §3.8) ══
 * Pola na link nie ma, bo linku nie ma. Kod NIE JEST sekretem - daje wyłącznie
 * zgłoszenie, a o przyjęciu decyduje administrator klubu (00E → 00C → decyzja).
 * DOŁĄCZENIE WYMAGA INTERNETU (§6, decyzja właściciela 2026-09-08): bez sieci przycisk
 * jest zablokowany z powodem W ŚRODKU (issue #55), a pole zostaje czynne - wpis nie ginie.
 *
 * ══ SPRAWDZANIE STANU ══
 * Przy wejściu, po powrocie z tła i co minutę - te same okazje, co pętla synca, bo
 * to jest ten sam pomysł: sieć jako okazja. Zatwierdzenie w międzyczasie wpuszcza do
 * aplikacji BEZ przechodzenia przez Google od nowa (serwer oddaje tokeny). 00D i 00E
 * NIE pytają w pętli: tam stan zmienia dopiero czynność pilota (inny kod, inne konto).
 *
 * Wyjście „Zaloguj innym kontem" MUSI być na każdym wariancie: ktoś, kto zalogował się
 * prywatnym kontem zamiast klubowego, nie może zostać uwięziony bez drogi dalej.
 */

import React, { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, AppText, Avatar, Brand, Screen, TextField } from '../components';
import { toneColors } from '../components/tone';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../theme';
import { clubGateView } from './logic/clubGateView';
import { clubCodeComplete, maskClubCodeInput } from './logic/clubCode';

/** Puls jak w pętli synca - rzadki, bo prawdziwe okazje przychodzą z powrotu z tła. */
const HEARTBEAT_MS = 60_000;

export function ClubGateScreen() {
  const { theme } = useTheme();
  const clubs = useAuthStore((s) => s.clubs);
  const busy = useAuthStore((s) => s.busy);
  const note = useAuthStore((s) => s.clubsNote);
  const checkClubs = useAuthStore((s) => s.checkClubs);
  const joinClub = useAuthStore((s) => s.joinClub);
  const abandonPerson = useAuthStore((s) => s.abandonPerson);

  const view = clubs == null ? null : clubGateView(clubs, Date.now());
  const state = view?.state ?? 'none';

  // Kod klubu i odpowiedź serwera przy polu - stan LOKALNY ekranu: nie przeżywa
  // wyjścia i nie ma po co. Pola po odmowie NIE czyścimy (mockup 00E): pilot poprawia
  // to, co wpisał, a nie pisze od nowa.
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const waiting = state === 'pending';
  useEffect(() => {
    if (!waiting) return;
    void checkClubs();
    const timer = setInterval(() => void checkClubs(), HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void checkClubs();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [waiting, checkClubs]);

  if (clubs == null || view == null) return <Screen />;

  const tone = toneColors(theme, state === 'rejected' ? 'red' : state === 'none' ? 'blue' : 'amber');

  const submitCode = async (): Promise<void> => {
    setCodeError(null);
    setBlocked(null);
    const result = await joinClub(code);
    if (result.kind === 'error') setCodeError(result.message);
    else if (result.kind === 'blocked') setBlocked(result.reason);
    else setCode('');
  };

  return (
    <Screen>
      <View style={styles.wrap}>
        <Brand tagline={false} style={styles.brand} />

        {/* ── karta stanu (`.status-card`) - typ „Status": nigdy zamykalna ──────── */}
        <View
          style={[
            styles.status,
            // Odmowa jest WYCISZONA: czerwień w ramce i tytule, nie zalewa karty -
            // to decyzja administratora, a nie awaria aplikacji (00D).
            state === 'rejected'
              ? { backgroundColor: theme.colors.surface, borderColor: tone.border }
              : { backgroundColor: tone.muted, borderColor: tone.border },
          ]}
        >
          <AppText variant="display" style={[styles.statusTitle, { color: tone.accent }]}>
            {view.title}
          </AppText>
          <AppText variant="body" style={styles.statusBody}>
            {view.body}
          </AppText>
          {view.meta != null && (
            <AppText variant="micro" tone="muted" style={styles.meta}>
              {view.meta}
            </AppText>
          )}
        </View>

        {/* ── powód od administratora (`.reason`) - CYTAT, tylko przy odrzuceniu ── */}
        {view.reason != null && (
          <View
            style={[
              styles.reason,
              { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderLeftColor: tone.border },
            ]}
          >
            <AppText variant="micro" tone="muted" style={styles.reasonLabel}>
              Powód od administratora
            </AppText>
            <AppText variant="body" style={styles.reasonText}>
              {view.reason}
            </AppText>
          </View>
        )}

        {/* ── konto Google (`.acct-card`) ───────────────────────────────────── */}
        <View
          style={[
            styles.account,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Avatar name={view.name} />
          <View style={styles.accountText}>
            <AppText variant="body" style={styles.accountName}>
              {view.name}
            </AppText>
            <AppText variant="mono" tone="secondary" numberOfLines={1} style={styles.accountMail}>
              {view.email}
            </AppText>
          </View>
        </View>

        {/* ── wyjścia ──────────────────────────────────────────────────────── */}
        {state === 'none' && (
          <>
            <TextField
              label="Kod klubu"
              mono
              value={code}
              onChangeText={(raw) => {
                setCode(maskClubCodeInput(raw));
                setCodeError(null);
              }}
              error={codeError}
              placeholder="np. AZG-7K4M"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              style={styles.codeField}
            />
            <ActionButton
              label="DOŁĄCZ"
              tone="green"
              variant="solid"
              busy={busy}
              // Pusty wpis blokuje BEZ zdania - widać go z kontrolki nad przyciskiem
              // (wąski wyjątek issue #55). Zdanie zostaje dla braku sieci i limitu prób.
              disabled={!clubCodeComplete(code)}
              disabledReason={blocked ?? undefined}
              onPress={() => void submitCode()}
            />
          </>
        )}

        {state === 'pending' && (
          <ActionButton
            label="SPRAWDŹ PONOWNIE"
            tone="green"
            variant="solid"
            busy={busy}
            // Zdanie o ostatnim sprawdzeniu (brak sieci) stoi W PRZYCISKU, w slocie
            // podpisu - nie pod nim (issue #55: nic nie skacze układem).
            hint={note ?? undefined}
            onPress={() => void checkClubs()}
          />
        )}

        {state === 'rejected' && (
          // DWA wyjścia, bo odmowa dotyczy KLUBU, nie osoby: ten sam człowiek może
          // dołączyć do innego klubu innym kodem. „Spróbuj ponownie" nie istnieje -
          // ten sam kod w tym samym klubie trafi na tę samą decyzję.
          <ActionButton
            label="DOŁĄCZ INNYM KODEM"
            tone="green"
            variant="solid"
            onPress={() => useAuthStore.setState({ clubs: emptyClubs(clubs) })}
          />
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => void abandonPerson()}
          hitSlop={12}
          style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AppText variant="body" tone="muted" style={styles.linkText}>
            Zaloguj innym kontem Google
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

/**
 * „DOŁĄCZ INNYM KODEM" - ten sam ekran w stanie 00E, bez ruszania serwera.
 *
 * Kasujemy WIDOK członkostw, nie magazyn: odrzucone członkostwo istnieje dalej i wróci
 * przy najbliższym `GET /auth/memberships`, a pilot ma tu tylko dostać pole na kod.
 * Plakietka konta zostaje - to wciąż to samo konto Google.
 */
const emptyClubs = (clubs: NonNullable<ReturnType<typeof useAuthStore.getState>['clubs']>) => ({
  ...clubs,
  status: 'none' as const,
  memberships: [],
});

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
  brand: { marginBottom: 26 },
  status: { borderWidth: 1, borderRadius: 18, padding: 18, paddingBottom: 16, gap: 9, marginBottom: 14 },
  statusTitle: { fontSize: 21, letterSpacing: 2.4, lineHeight: 24 },
  statusBody: { fontSize: 13, lineHeight: 20 },
  meta: { letterSpacing: 1.4 },
  reason: {
    borderWidth: 1,
    borderLeftWidth: 2,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 5,
    marginBottom: 18,
  },
  reasonLabel: { letterSpacing: 2 },
  reasonText: { fontSize: 13, lineHeight: 20 },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  accountText: { flex: 1, gap: 3 },
  accountName: { fontSize: 14.5, fontFamily: 'Archivo_600SemiBold' },
  accountMail: { fontSize: 11 },
  codeField: { marginBottom: 14 },
  link: { alignSelf: 'center', marginTop: 16 },
  linkText: { fontSize: 12.5 },
});
