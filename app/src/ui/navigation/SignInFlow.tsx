/**
 * Ninerdeck - NAWIGACJA MIĘDZY EKRANAMI LOGOWANIA (2.1.0, issue #135 E6).
 *
 * Pięć ekranów przed bramką tożsamości: 00A (Google), 00F (hasło), 00G (link do hasła),
 * 00H (załóż konto), 00I (wybór klubu urządzenia). Nie idą przez `RootNavigator`, bo ten
 * mieszka ZA bramką i opisuje aplikację pilota - a tu nikt jeszcze nie jest pilotem.
 * Stąd zwykły stan: krok to STAN tej samej czynności, nie osobne miejsce w stosie.
 *
 * ══ URZĄDZENIE ZNAJĄCE KLUB STARTUJE OD HASŁA ══
 * Wspólny tablet przechodzi tę drogę kilka razy dziennie i zawsze tą samą (`signedOutStart`).
 * Stawianie mu 00A po drodze kosztowałoby tapnięcie przy każdej zmianie pilota. Decyzja
 * zapada RAZ, przy wejściu w stan „wylogowany" - nie przy każdym renderze: inaczej wybór
 * klubu na 00I przestawiałby ekran pod palcem.
 *
 * ══ ADRES WĘDRUJE MIĘDZY EKRANAMI, HASŁO NIGDY ══
 * Wpis z pola loginu 00F jedzie na 00G i 00H, żeby nie przepisywać go drugi raz - ale
 * tylko wtedy, gdy JEST adresem (`emailPrefill`). Hasła nie przenosimy nigdzie i nigdzie
 * go nie zapamiętujemy.
 */

import React, { useEffect, useState } from 'react';

import { DeviceClubScreen } from '../screens/DeviceClubScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PasswordLoginScreen } from '../screens/PasswordLoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { emailPrefill } from '../screens/logic/forgotPassword';
import { signedOutStart } from '../screens/logic/deviceClubs';
import { useAuthStore } from '../store/authStore';

type Step = 'google' | 'password' | 'forgot' | 'signup' | 'club';

export function SignInFlow() {
  const loadMethods = useAuthStore((s) => s.loadMethods);
  const loadDeviceClubs = useAuthStore((s) => s.loadDeviceClubs);

  // `null` = jeszcze nie wiemy, od czego zacząć: kluby urządzenia czyta się z magazynu,
  // a decyzja ma zapaść RAZ. Do tego czasu nie rysujemy nic - to ułamek sekundy,
  // a mignięcie 00A przed 00F wyglądałoby jak usterka na wspólnym tablecie.
  const [step, setStep] = useState<Step | null>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    void loadMethods();
  }, [loadMethods]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await loadDeviceClubs();
      if (alive) setStep(signedOutStart(useAuthStore.getState().device));
    })();
    return () => {
      alive = false;
    };
  }, [loadDeviceClubs]);

  if (step == null) return null;

  switch (step) {
    case 'google':
      return <LoginScreen onPasswordLogin={() => setStep('password')} />;

    case 'password':
      return (
        <PasswordLoginScreen
          onForgotPassword={(login) => {
            setEmail(emailPrefill(login));
            setStep('forgot');
          }}
          onSignUp={() => setStep('signup')}
          onChangeClub={() => setStep('club')}
          onGoogle={() => setStep('google')}
        />
      );

    case 'forgot':
      return <ForgotPasswordScreen initialEmail={email} onBack={() => setStep('password')} />;

    case 'signup':
      return (
        <SignUpScreen
          initialEmail={email}
          onBack={() => setStep('password')}
          onGoogle={() => setStep('google')}
        />
      );

    case 'club':
      // Wybór i „Wróć do logowania" prowadzą w to samo miejsce - klub zapisał już store.
      return <DeviceClubScreen onDone={() => setStep('password')} />;
  }
}
