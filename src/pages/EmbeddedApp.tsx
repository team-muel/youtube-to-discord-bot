import { type CSSProperties } from 'react';
import { TopSectionSwitcher } from '../components/TopSectionSwitcher';
import { BackToTopButton } from '../components/BackToTopButton';
import { AppHeader } from '../components/ui/AppHeader';
import { useMuelMotion } from '../hooks/useMuelMotion';
import { researchContent } from '../content/researchContent';
import { PremiumResearchCard, RadarResearchCard, TrendResearchCard } from '../components/ResearchVisuals';
import { SurfaceCard } from '../components/ui/SurfaceCard';
import { MuelReveal } from '../components/ui/MuelReveal';

export const EmbeddedApp = () => {
  const { tokens } = useMuelMotion();
  const researchSteps = Object.values(researchContent.sections);
  const motionCssVars = {
    '--muel-ease': `${tokens.uiEase}`,
    '--muel-reveal-duration': `${tokens.revealDurationMs}ms`,
    '--muel-reveal-offset': `${tokens.revealOffsetPx}px`,
    '--muel-hover-lift': `${tokens.hoverLiftPx}px`,
    '--muel-hover-scale': `${tokens.hoverScale}`,
    '--muel-active-scale': `${tokens.activeScale}`,
    '--muel-hover-duration': `${tokens.hoverDurationMs}ms`,
    '--muel-card-duration': `${tokens.cardTransitionMs}ms`,
    '--muel-link-duration': `${tokens.linkTransitionMs}ms`,
    '--muel-menu-duration': `${tokens.menuTransitionMs}ms`,
    '--muel-underline-duration': `${tokens.underlineTransitionMs}ms`,
    '--muel-micro-underline-duration': `${tokens.microUnderlineTransitionMs}ms`,
    '--muel-media-zoom-duration': `${tokens.mediaZoomDurationMs}ms`,
    '--muel-skip-duration': `${tokens.skipLinkTransitionMs}ms`,
    '--muel-glitch-a-duration': `${tokens.glitchDurationAMs}ms`,
    '--muel-glitch-b-duration': `${tokens.glitchDurationBMs}ms`,
    '--muel-dock-duration': `${tokens.dockEnterDurationMs}ms`,
    '--muel-visual-card-shadow-y-rest': `${tokens.visualCardShadowYRestPx}px`,
    '--muel-visual-card-shadow-blur-rest': `${tokens.visualCardShadowBlurRestPx}px`,
    '--muel-visual-card-shadow-y-hover': `${tokens.visualCardShadowYHoverPx}px`,
    '--muel-visual-card-shadow-blur-hover': `${tokens.visualCardShadowBlurHoverPx}px`,
    '--muel-visual-card-shadow-tint-rest': `${tokens.visualCardShadowTintRestPct}%`,
    '--muel-visual-card-shadow-tint-hover': `${tokens.visualCardShadowTintHoverPct}%`,
    '--muel-visual-card-overlay-accent': `${tokens.visualCardOverlayAccentPct}%`,
    '--muel-visual-card-overlay-opacity-rest': `${tokens.visualCardOverlayOpacityRest}`,
    '--muel-visual-card-overlay-opacity-hover': `${tokens.visualCardOverlayOpacityHover}`,
    '--muel-visual-chart-inset-accent': `${tokens.visualChartInsetAccentPct}%`,
    '--muel-visual-radar-pulse-duration': `${tokens.visualRadarCorePulseDurationMs}ms`,
    '--muel-visual-radar-pulse-min-opacity': `${tokens.visualRadarCorePulseMinOpacity}`,
    '--muel-visual-radar-pulse-max-opacity': `${tokens.visualRadarCorePulseMaxOpacity}`,
    '--muel-visual-radar-pulse-scale': `${tokens.visualRadarCorePulseScale}`,
  } as CSSProperties;

  return (
    <div className="surface-page surface-bridge hud-grid research-page-shell" style={motionCssVars}>
      <AppHeader fixed animated={false} actions={<TopSectionSwitcher />} />

      <main className="section-wrap section-v-80 section-cluster dashboard-kpay-flow">
        <section className="io-reveal research-hero-shell research-hero-divider">
          <nav className="research-step-line" aria-label="Research flow steps">
            {researchSteps.map((section, index) => (
              <span key={section.overline} className="research-step-item mono-data" aria-label={section.title}>
                <span className="research-step-number">{index + 1}</span>
                {index < researchSteps.length - 1 ? (
                  <span className="research-step-separator" aria-hidden="true">
                    -
                  </span>
                ) : null}
              </span>
            ))}
          </nav>
          <p className="chapter-overline">{researchContent.hero.overline}</p>
          <h1 className="type-h1 research-hero-title">{researchContent.hero.title}</h1>
          <p className="type-body research-hero-desc">{researchContent.hero.description}</p>
        </section>

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head">
            <p className="chapter-overline">{researchContent.sections.connectors.overline}</p>
            <h2 className="chapter-title">{researchContent.sections.connectors.title}</h2>
            <p className="chapter-desc">{researchContent.sections.connectors.description}</p>
          </header>

          <div className="feature-reboot-grid research-triple-grid">
            {researchContent.connectors.map((connector) => (
              <SurfaceCard key={connector.id} hoverable className="feature-reboot-card research-feature-card muel-interact">
                <p className="feature-reboot-kicker">{connector.status}</p>
                <h3 className="feature-reboot-title">{connector.title}</h3>
                <p className="feature-reboot-desc">{connector.description}</p>
              </SurfaceCard>
            ))}
          </div>
        </MuelReveal>

        <div className="kpay-divider" aria-hidden="true" />

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head">
            <p className="chapter-overline">{researchContent.sections.workbench.overline}</p>
            <h2 className="chapter-title">{researchContent.sections.workbench.title}</h2>
            <p className="chapter-desc">{researchContent.sections.workbench.description}</p>
          </header>

          <div className="feature-reboot-grid research-triple-grid">
            <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact">
              <p className="feature-reboot-kicker">DATA FEEDS</p>
              <ul className="research-bullet-list">
                {researchContent.workbench.feeds.map((feed) => (
                  <li key={feed}>{feed}</li>
                ))}
              </ul>
            </SurfaceCard>

            <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact">
              <p className="feature-reboot-kicker">VISUAL MODES</p>
              <ul className="research-bullet-list">
                {researchContent.workbench.views.map((view) => (
                  <li key={view}>{view}</li>
                ))}
              </ul>
            </SurfaceCard>

            <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact">
              <p className="feature-reboot-kicker">NAVER PREMIUM VIEW</p>
              <ul className="research-bullet-list">
                {researchContent.workbench.library.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </SurfaceCard>
          </div>
        </MuelReveal>

        <div className="kpay-divider" aria-hidden="true" />

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head">
            <p className="chapter-overline">{researchContent.sections.charts.overline}</p>
            <h2 className="chapter-title">{researchContent.sections.charts.title}</h2>
            <p className="chapter-desc">{researchContent.sections.charts.description}</p>
          </header>

          <div className="research-charts-grid">
            <RadarResearchCard
              title={researchContent.radar.title}
              subtitle={researchContent.radar.subtitle}
              metrics={researchContent.radar.metrics}
            />
            <TrendResearchCard
              title={researchContent.trend.title}
              subtitle={researchContent.trend.subtitle}
              labels={researchContent.trend.labels}
              values={researchContent.trend.values}
            />
          </div>

          <div className="research-premium-wrap">
            <PremiumResearchCard
              title={researchContent.premium.title}
              subtitle={researchContent.premium.subtitle}
              lockLabel={researchContent.premium.lockLabel}
              rows={researchContent.premium.rows}
            />
          </div>
        </MuelReveal>
      </main>

      <BackToTopButton />
    </div>
  );
};



