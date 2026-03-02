import React, { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { SECTION_MOTION_TOKENS } from '../../config/experienceTokens';
import { APP_BRAND } from '../../config/brand';

interface AppHeaderProps {
  actions?: ReactNode;
  fixed?: boolean;
  animated?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  actions,
  fixed = false,
  animated = true,
}) => {
  const headerClass = fixed ? 'app-header-shell app-header-fixed' : 'app-header-shell';

  return (
    <motion.header
      initial={animated ? { opacity: 0, y: SECTION_MOTION_TOKENS.timing.headerOffset } : undefined}
      animate={animated ? { opacity: 1, y: 0 } : undefined}
      transition={animated ? { duration: SECTION_MOTION_TOKENS.timing.headerDuration, ease: SECTION_MOTION_TOKENS.timing.ease } : undefined}
      className={headerClass}
    >
      <div className="section-wrap app-header-inner">
        <div className="kpay-brand app-header-brand">{APP_BRAND}</div>
        {actions}
      </div>
    </motion.header>
  );
};
