import React, { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { createStaggerPreset } from '../../config/motionPresets';
import { SectionTitle } from '../ui/SectionTitle';

const gridStagger = createStaggerPreset();
export const staggerContainer = gridStagger.container;
export const staggerItem = gridStagger.item;

export const SectionHeader: React.FC<{ title: string; label: string; accentLineClass?: string }> = ({
  title,
  label,
  accentLineClass = 'section-title-accent-line',
}) => <SectionTitle title={title} label={label} accentLineClass={accentLineClass} />;

type GridSectionProps<T> = {
  id: string;
  title: string;
  label: string;
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  gridClassName: string;
  sectionClassName?: string;
  footer?: ReactNode;
  extraContent?: ReactNode;
  accentLineClass?: string;
};

export const GridSection = <T,>({
  id,
  title,
  label,
  items,
  getKey,
  renderItem,
  gridClassName,
  sectionClassName = 'grid-section-shell',
  footer,
  extraContent,
  accentLineClass,
}: GridSectionProps<T>) => {
  return (
    <section id={id} className={`io-reveal section-wrap section-v-80 grid-section-root ${sectionClassName}`}>
      <SectionHeader title={title} label={label} accentLineClass={accentLineClass} />
      <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className={gridClassName}>
        {items.map((item) => (
          <motion.div key={getKey(item)} variants={staggerItem}>
            {renderItem(item)}
          </motion.div>
        ))}
      </motion.div>
      {extraContent}
      {footer}
    </section>
  );
};
