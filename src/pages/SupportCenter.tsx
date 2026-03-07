import React from 'react';
import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { TopSectionSwitcher } from '../components/TopSectionSwitcher';
import { BackToTopButton } from '../components/BackToTopButton';
import { AppHeader } from '../components/ui/AppHeader';
import { MuelReveal } from '../components/ui/MuelReveal';
import { SurfaceCard } from '../components/ui/SurfaceCard';
import { UiButton } from '../components/ui/UiButton';
import { useMuelMotion } from '../hooks/useMuelMotion';
import { getMuelMotionCssVars } from '../lib/getMuelMotionCssVars';
import { ROUTES } from '../config/routes';
import { supportContent } from '../content/supportContent';

interface SupportCenterProps {
  user?: { id: string; username: string; avatar?: string | null; isPresetAdmin?: boolean } | null;
  onLogin?: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

export const SupportCenter: React.FC<SupportCenterProps> = ({ user, onLogin, onLogout }) => {
  const { tokens } = useMuelMotion();
  const motionCssVars = getMuelMotionCssVars(tokens) as CSSProperties;

  return (
    <div className="surface-page surface-bridge hud-grid research-page-shell" style={motionCssVars}>
      <AppHeader
        fixed
        animated={false}
        actions={
          <TopSectionSwitcher
            isAuthenticated={Boolean(user)}
            isPresetAdmin={Boolean(user?.isPresetAdmin)}
            username={user?.username}
            onLogin={onLogin ? () => void onLogin() : undefined}
            onLogout={onLogout ? () => void onLogout() : undefined}
          />
        }
      />

      <main className="section-wrap section-v-80 section-cluster dashboard-kpay-flow dashboard-main-shell">
        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head">
            <p className="chapter-overline">{supportContent.hero.overline}</p>
            <h1 className="chapter-title">{supportContent.hero.title}</h1>
            <p className="chapter-desc">{supportContent.hero.description}</p>
          </header>

          <div className="feature-reboot-grid research-triple-grid">
            {supportContent.channels.map((channel) => (
              <SurfaceCard key={channel.id} hoverable className="feature-reboot-card research-feature-card muel-interact">
                <p className="feature-reboot-kicker">{channel.overline}</p>
                <h2 className="feature-reboot-title">{channel.title}</h2>
                <p className="feature-reboot-desc">{channel.description}</p>
                {'to' in channel ? (
                  <UiButton to={channel.to} variant="outline" size="md">{channel.ctaLabel}</UiButton>
                ) : (
                  <UiButton href={channel.href} variant="outline" size="md">{channel.ctaLabel}</UiButton>
                )}
              </SurfaceCard>
            ))}
          </div>
        </MuelReveal>

        <div className="kpay-divider" aria-hidden="true" />

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head">
            <p className="chapter-overline">{supportContent.responsePolicy.overline}</p>
            <h2 className="chapter-title">{supportContent.responsePolicy.title}</h2>
            <p className="chapter-desc">{supportContent.responsePolicy.description}</p>
          </header>
          <div className="research-contact-notes">
            {supportContent.responsePolicy.notes.map((note) => (
              <p key={note} className="research-binding-note">{note}</p>
            ))}
          </div>
          <div className="hero-cta-stack">
            {supportContent.responsePolicy.ctas.map((cta) => {
              if ('to' in cta) {
                return <UiButton key={cta.id} to={cta.to} variant={cta.variant} size={cta.size}>{cta.label}</UiButton>;
              }

              return <UiButton key={cta.id} href={cta.href} variant={cta.variant} size={cta.size}>{cta.label}</UiButton>;
            })}
          </div>
        </MuelReveal>

        <div className="kpay-divider" aria-hidden="true" />

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head">
            <p className="chapter-overline">{supportContent.faq.overline}</p>
            <h2 className="chapter-title">{supportContent.faq.title}</h2>
          </header>
          <div className="feature-reboot-grid">
            {supportContent.faq.items.map((item) => (
              <article key={item.id} className="feature-reboot-card muel-interact">
                <p className="feature-reboot-kicker">Q</p>
                <h3 className="feature-reboot-title">{item.question}</h3>
                <p className="feature-reboot-desc">{item.answer}</p>
              </article>
            ))}
          </div>
          <p className="research-binding-note">
            {supportContent.faq.footerPrefix}{' '}
            <Link to={ROUTES.inApp} className="hero-secondary-link muel-interact">{supportContent.faq.footerLinkLabel}</Link>
            {' '}{supportContent.faq.footerSuffix}
          </p>
        </MuelReveal>
      </main>

      <BackToTopButton />
    </div>
  );
};
