import { SECTION_MOTION_TOKENS } from './experienceTokens';

type StaggerPresetOptions = {
  staggerChildren?: number;
  delayChildren?: number;
  itemDuration?: number;
  itemOffsetY?: number;
};

export const createStaggerPreset = ({
  staggerChildren = 0.1,
  delayChildren = 0.04,
  itemDuration = SECTION_MOTION_TOKENS.timing.contentDuration,
  itemOffsetY = 20,
}: StaggerPresetOptions = {}) => ({
  container: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren,
        delayChildren,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: itemOffsetY },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: itemDuration, ease: SECTION_MOTION_TOKENS.timing.ease },
    },
  },
});
