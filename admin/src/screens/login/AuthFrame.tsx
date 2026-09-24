/**
 * Ninerdeck - panel: RAMA EKRANÓW PRZED PANELEM (logowanie, „Nie pamiętam hasła",
 * „Załóż konto", wybór klubu).
 *
 * Układ jak w GitLabie (przegląd właściciela 2026-09-24, `styles/components/login.css`):
 * znak, tytuł zdaniowy, opcjonalne zdanie pod nim, baner, treść bez karty i jedno
 * zdanie z drogą wyjścia pod spodem - wszystko w jednej kolumnie 400 px. Cztery ekrany
 * składały ten kształt osobno i rozjeżdżały się przy każdej poprawce, więc odtąd ma
 * JEDNĄ definicję.
 */

import type { ReactNode } from 'react';

import { Banner, type BannerTone } from '../../ui/components/Banner';
import { BrandMark } from '../../ui/components/icons';

interface AuthFrameProps {
  /** Tytuł ekranu w pisowni zdaniowej - mówi, CO się tu robi. */
  title: string;
  /** Jedno zdanie pod tytułem: co się stanie po wysłaniu formularza. */
  lead?: ReactNode;
  /** Odmowa albo potwierdzenie OSTATNIEJ próby; `null` = nic do powiedzenia. */
  message?: { tone: BannerTone; text: ReactNode } | null;
  /** Droga dla kogoś, kto trafił nie tam - zdanie pod formularzem. */
  footer?: ReactNode;
  children: ReactNode;
}

export function AuthFrame({ title, lead, message, footer, children }: AuthFrameProps) {
  return (
    <div className="login">
      <div className="login-column">
        <div className="login-head">
          <span className="login-badge">
            <BrandMark size={26} />
          </span>
          <h1 className="login-heading">{title}</h1>
        </div>

        {lead == null ? null : <p className="login-lead">{lead}</p>}

        {message == null ? null : (
          <Banner tone={message.tone} live>
            {message.text}
          </Banner>
        )}

        {children}

        {footer == null ? null : <p className="login-foot">{footer}</p>}
      </div>
    </div>
  );
}
