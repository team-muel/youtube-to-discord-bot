import { useReducedMotion } from 'motion/react';
import { SECTION_MOTION_TOKENS } from '../config/experienceTokens';

type MotionKind = 'component' | 'feature';

export const useMuelMotion = () => {
  const reduced = useReducedMotion();
  const tokens = SECTION_MOTION_TOKENS.muel;

  const viewport = {
    once: tokens.revealOnce,
    amount: tokens.viewportAmount,
    margin: tokens.viewportMargin,
  } as const;

  const getRevealProps = (delayMultiplier = 0, kind: MotionKind = 'component') => {
    const duration = kind === 'feature' ? tokens.featureDuration : tokens.componentDuration;
    const delayStep = kind === 'feature' ? tokens.featureDelayStep : tokens.componentDelayStep;
    const revealViewport = viewport;

    if (reduced) {
      return {
        initial: { opacity: 1, y: 0, x: 0, scale: 1, filter: 'blur(0px)' },
        whileInView: { opacity: 1, y: 0, x: 0, scale: 1, filter: 'blur(0px)' },
        viewport: revealViewport,
        transition: { duration: 0 },
      };
    }

    return {
      initial: {
        opacity: tokens.componentOpacity,
        y: kind === 'feature' ? tokens.featureY : tokens.componentY,
        x: 0,
        scale: kind === 'feature' ? tokens.featureScale : tokens.componentScale,
        filter: `blur(${tokens.componentBlurPx}px)`,
      },
      whileInView: { opacity: 1, y: 0, x: 0, scale: 1, filter: 'blur(0px)' },
      viewport: revealViewport,
      transition: {
        duration,
        delay: delayMultiplier * delayStep,
        ease: SECTION_MOTION_TOKENS.timing.ease,
      },
    };
  };

  return {
    reduced,
    viewport,
    tokens,
    getRevealProps,
  };
};
