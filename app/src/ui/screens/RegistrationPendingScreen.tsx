/**
 * UZ Aero - 00C ZGŁOSZENIE CZEKA NA ZATWIERDZENIE i 00D ZGŁOSZENIE ODRZUCONE.
 *
 * Jeden ekran w dwóch stanach (mockupy `design/00c-oczekiwanie.html`
 * i `00d-odrzucone.html`): wariant to STAN zgłoszenia, nie osobny ekran - ten sam
 * układ, inny ton karty stanu i inny zestaw wyjść. Treść liczy
 * `logic/registrationView.ts` (z testami), tu jest wyłącznie układ.
 *
 * ══ TEN EKRAN MA PRAWO TŁUMACZYĆ ══
 * To wąska kategoria z issue #72 - BLOKADA Z POWODEM: pilot nie może dalej i musi
 * wiedzieć, na co czeka i co może zrobić. Nie ma tu ani słowa o tym, JAK to jest
 * zbudowane (tabela, token, role).
 *
 * ══ SPRAWDZANIE STANU ══
 * Przy wejściu, po powrocie z tła i co minutę - te same okazje, co pętla synca, bo
 * to jest ten sam pomysł: sieć jako okazja. Zatwierdzenie w międzyczasie wpuszcza do
 * aplikacji BEZ przechodzenia przez Google od nowa (serwer oddaje tokeny). Odrzucone
 * NIE pyta: stan jest znany, a ponowne zgłoszenie tym samym kontem trafiłoby na ten
 * sam odrzucony wiersz - dlatego 00D nie ma „spróbuj ponownie" (zasada z 10B: brak
 * przycisku jest odpowiedzią, wyszarzony byłby obietnicą).
 *
 * Wyjście „Zaloguj innym kontem" MUSI być na obu wariantach: ktoś, kto zalogował się
 * prywatnym kontem zamiast klubowego, nie może zostać uwięziony bez drogi dalej.
 */

import React, { useEffect } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, AppText, Avatar, Brand, Screen } from '../components';
import { toneColors } from '../components/tone';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../theme';
import { registrationView } from './logic/registrationView';

/** Puls jak w pętli synca - rzadki, bo prawdziwe okazje przychodzą z powrotu z tła. */
const HEARTBEAT_MS = 60_000;

export function RegistrationPendingScreen() {
  const { theme } = useTheme();
  const registration = useAuthStore((s) => s.registration);
  const busy = useAuthStore((s) => s.busy);
  const note = useAuthStore((s) => s.registrationNote);
  const checkRegistration = useAuthStore((s) => s.checkRegistration);
  const abandonRegistration = useAuthStore((s) => s.abandonRegistration);

  const view = registration == null ? null : registrationView(registration, Date.now());
  const rejected = view?.rejected ?? true;

  useEffect(() => {
    if (rejected) return;
    void checkRegistration();
    const timer = setInterval(() => void checkRegistration(), HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkRegistration();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [rejected, checkRegistration]);

  if (view == null) return <Screen />;

  const tone = toneColors(theme, rejected ? 'red' : 'amber');

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
            rejected
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
          <AppText variant="micro" tone="muted" style={styles.meta}>
            {view.meta}
          </AppText>
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
        {rejected ? (
          <ActionButton
            label="ZALOGUJ INNYM KONTEM"
            tone="neutral"
            variant="secondary"
            onPress={() => void abandonRegistration()}
          />
        ) : (
          <>
            <ActionButton
              label="SPRAWDŹ PONOWNIE"
              tone="green"
              variant="solid"
              busy={busy}
              // Zdanie o ostatnim sprawdzeniu (brak sieci) stoi W PRZYCISKU, w slocie
              // podpisu - nie pod nim (issue #55: nic nie skacze układem).
              hint={note ?? undefined}
              onPress={() => void checkRegistration()}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void abandonRegistration()}
              hitSlop={12}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
            >
              <AppText variant="body" tone="muted" style={styles.linkText}>
                Zaloguj innym kontem Google
              </AppText>
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

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
  link: { alignSelf: 'center', marginTop: 16 },
  linkText: { fontSize: 12.5 },
});
