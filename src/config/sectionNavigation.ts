import { type LucideIcon } from 'lucide-react';
import { BOT_INVITE_URL, getIaNodes } from './informationArchitecture';

export type SectionNavItem = {
  label: string;
  shortLabel?: string;
  to: string;
  icon: LucideIcon;
  external?: boolean;
};

export { BOT_INVITE_URL };

export const sectionNavigationItems: SectionNavItem[] = getIaNodes({ includeExternal: true })
  .filter((item) => item.showInNav !== false)
  .map((item) => ({
    label: item.label,
    shortLabel: item.shortLabel,
    to: item.to,
    icon: item.icon,
    external: item.external,
  }));
