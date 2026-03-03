import { type CSSProperties } from 'react';
import { SECTION_MOTION_TOKENS } from '../config/experienceTokens';

type MuelMotionTokens = typeof SECTION_MOTION_TOKENS.muel;

export const getMuelMotionCssVars = (tokens: MuelMotionTokens): CSSProperties => ({
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
} as CSSProperties);