import { motion, useInView } from 'motion/react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { TopSectionSwitcher } from '../components/TopSectionSwitcher';
import { BackToTopButton } from '../components/BackToTopButton';
import { ScrollProgressBar } from '../components/ScrollProgressBar';
import { SectionFlowRail } from '../components/SectionFlowRail';
import { ControlRoomRoadmap } from '../components/sections/ControlRoomRoadmap';
import { dashboardContent, type HubPageContent } from '../content/dashboardContent';
import { BOT_INVITE_URL } from '../config/sectionNavigation';
import { ROUTES } from '../config/routes';
import { AppHeader } from '../components/ui/AppHeader';
import { MuelReveal } from '../components/ui/MuelReveal';
import { UiButton } from '../components/ui/UiButton';
import { useMuelMotion } from '../hooks/useMuelMotion';
import { useActiveSection } from '../hooks/useActiveSection';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { getMuelMotionCssVars } from '../lib/getMuelMotionCssVars';

interface DashboardProps {
  user?: { id: string; username: string; avatar?: string | null; isPresetAdmin?: boolean } | null;
  onLogin?: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
  content?: HubPageContent;
}

interface MetricCounterProps {
  value: number;
  suffix: string;
  label: string;
  description: string;
}

const SECTION_FLOW_ITEMS = [
  { id: 'dashboard-hero', label: 'Hero' },
  { id: 'muel-metrics', label: 'Metrics' },
  { id: 'muel-snapshots', label: 'Snapshots' },
  { id: 'muel-roadmap', label: 'Roadmap' },
];

const MetricCounter = ({ value, suffix, label, description }: MetricCounterProps) => {
  const [displayValue, setDisplayValue] = useState(0);
  const metricRef = useRef<HTMLElement | null>(null);
  const { tokens, getRevealProps } = useMuelMotion();
  const inView = useInView(metricRef, {
    amount: tokens.viewportAmount,
    once: tokens.revealOnce,
    margin: tokens.viewportMargin,
  });

  useEffect(() => {
    if (!inView) {
      setDisplayValue(0);
      return;
    }

    const duration = tokens.metricCountDurationMs;
    const easePower = tokens.metricCountEasePower;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = Math.pow(progress, easePower);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, tokens.metricCountDurationMs, tokens.metricCountEasePower]);

  return (
    <motion.article
      ref={metricRef}
      className="metric-chip muel-interact"
      {...getRevealProps(0, 'component')}
    >
      <p className="metric-chip-value">
        {displayValue}
        {suffix}
      </p>
      <p className="metric-chip-label">{label}</p>
      <p className="metric-chip-desc">{description}</p>
    </motion.article>
  );
};

export const Dashboard = ({ user, onLogin, onLogout, content = dashboardContent }: DashboardProps) => {
  const { tokens } = useMuelMotion();
  const heroInviteRef = useRef<HTMLDivElement | null>(null);
  const [heroTitleTop, heroTitleBottom] = content.hero.title.split(' / ');
  const isHeroInviteInView = useInView(heroInviteRef, {
    amount: 0.2,
    margin: '-64px 0px 0px 0px',
  });

  const motionCssVars = getMuelMotionCssVars(tokens) as CSSProperties;
  const scrollProgress = useScrollProgress();
  const activeSection = useActiveSection(SECTION_FLOW_ITEMS.map((item) => item.id));

  const inviteButton = (
    <UiButton
      href={BOT_INVITE_URL}
      variant="solid"
      size="lg"
      ariaLabel={content.header.inviteBot}
      className="kpay-primary-cta muel-interact"
    >
      {content.header.inviteBot} <ArrowUpRight className="icon-16" />
    </UiButton>
  );

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
      <ScrollProgressBar progress={scrollProgress} />

      <main id="dashboard-main" className="section-wrap section-v-80 section-cluster dashboard-kpay-flow dashboard-main-shell">
        <SectionFlowRail items={SECTION_FLOW_ITEMS} activeSection={activeSection} />

        <section id="dashboard-hero" className="io-reveal dashboard-hero-shell">
          <div className="hero-reboot-shell">
            <div className="hero-reboot-grid">
              <div>
                <MuelReveal as="h1" className="type-h1 dashboard-hero-title" delayMultiplier={1}>
                  <span className="dashboard-hero-title-line">{heroTitleTop ?? content.hero.title}</span>
                  <span className="dashboard-hero-title-line">{heroTitleBottom ?? ''}</span>
                </MuelReveal>

                <MuelReveal as="p" className="type-body dashboard-hero-desc" delayMultiplier={2}>
                  {content.hero.description}
                </MuelReveal>

                <MuelReveal as="div" className="hero-cta-stack dashboard-hero-cta" delayMultiplier={3}>
                  <div ref={heroInviteRef}>{inviteButton}</div>

                  <div className="hero-secondary-links" aria-label="secondary quick links">
                    <a href="#muel-roadmap" className="hero-secondary-link muel-interact">
                      {content.hero.secondaryLinks.features}
                    </a>
                    <Link to={ROUTES.playground} className="hero-secondary-link muel-interact">
                      Playground
                    </Link>
                    <Link to={ROUTES.inApp} className="hero-secondary-link muel-interact">
                      {content.header.browseFeatures}
                    </Link>
                    <Link to={ROUTES.support} className="hero-secondary-link muel-interact">
                      문의
                    </Link>
                  </div>
                </MuelReveal>
              </div>

              <MuelReveal as="aside" className="hero-reboot-panel muel-interact" delayMultiplier={4}>
                <p className="hero-reboot-panel-kicker">{content.hero.panelKicker}</p>
                <div className="hero-reboot-metrics">
                  {content.metrics.map((metric) => (
                    <article key={`hero-${metric.id}`} className="hero-reboot-metric">
                      <p className="hero-reboot-metric-value">
                        {metric.value}
                        {metric.suffix}
                      </p>
                      <p className="hero-reboot-metric-label">{metric.label}</p>
                    </article>
                  ))}
                </div>
              </MuelReveal>
            </div>

            <div className="kpay-quick-grid dashboard-quick-grid">
              {content.quickHighlights.map((item, index) => (
                <MuelReveal key={item.id} as="article" className="kpay-quick-card muel-interact" delayMultiplier={5 + index}>
                  <p className="kpay-quick-title">{item.title}</p>
                  <p className="kpay-quick-desc">{item.description}</p>
                </MuelReveal>
              ))}
            </div>
          </div>
        </section>

        <MuelReveal as="section" id="muel-metrics" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head">
            <p className="chapter-overline">{content.sections.metrics.overline}</p>
            <h2 className="chapter-title">{content.sections.metrics.title}</h2>
            <p className="chapter-desc">{content.sections.metrics.description}</p>
          </header>

          <div className="metrics-grid" aria-label={content.sections.metrics.ariaLabel}>
            {content.metrics.map((metric) => (
              <div key={metric.id}>
                <MetricCounter
                  value={metric.value}
                  suffix={metric.suffix}
                  label={metric.label}
                  description={metric.description}
                />
              </div>
            ))}
          </div>
        </MuelReveal>

        <div className="kpay-divider" aria-hidden="true" />

        <MuelReveal as="section" id="muel-snapshots" className="io-reveal snap-strip section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head snap-strip-head">
            <p className="chapter-overline">{content.sections.snapshots.overline}</p>
            <h2 className="chapter-title">{content.sections.snapshots.title}</h2>
            <p className="chapter-desc">{content.sections.snapshots.description}</p>
          </header>
          <div className="snap-rail" aria-label={content.sections.snapshots.ariaLabel}>
            {content.snapshots.map((snapshot, index) => (
              <MuelReveal as="article" key={snapshot.id} delayMultiplier={index} className="snap-card muel-interact">
                <p className="snap-card-kicker">{content.sections.snapshots.prefix} {String(index + 1).padStart(2, '0')}</p>
                <h3 className="snap-card-title">{snapshot.title}</h3>
                <p className="snap-card-desc">{snapshot.description}</p>
              </MuelReveal>
            ))}
          </div>
        </MuelReveal>

        <div className="kpay-divider" aria-hidden="true" />

        <MuelReveal as="section" id="muel-roadmap" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <ControlRoomRoadmap compact />
        </MuelReveal>
      </main>

      {!isHeroInviteInView ? (
        <div className="kpay-invite-dock">
          <UiButton
            href={BOT_INVITE_URL}
            variant="solid"
            size="md"
            ariaLabel={content.header.inviteBot}
            className="kpay-primary-cta"
          >
            {content.header.inviteBot} <ArrowUpRight className="icon-16" />
          </UiButton>
        </div>
      ) : null}

      <BackToTopButton />
    </div>
  );
};
