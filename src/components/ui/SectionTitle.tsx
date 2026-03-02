import React from 'react';
import { motion } from 'motion/react';
import { SECTION_MOTION_TOKENS } from '../../config/experienceTokens';

interface SectionTitleProps {
  title: string;
  label: string;
  accentLineClass?: string;
  wrapperClassName?: string;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({
  title,
  label,
  accentLineClass = 'section-title-accent-line',
  wrapperClassName = 'section-title-wrap',
}) => {
  return (
    <>
      <div className={wrapperClassName}>
        <h2 className="type-h2">{title}</h2>
        <span className="mono-data section-title-label">{label}</span>
      </div>
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: SECTION_MOTION_TOKENS.timing.lineDuration, ease: SECTION_MOTION_TOKENS.timing.ease }}
        className={`section-title-line ${accentLineClass}`}
      />
    </>
  );
};
