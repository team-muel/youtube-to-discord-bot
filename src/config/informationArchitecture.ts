import { Compass, Headset, Newspaper, TabletSmartphone, type LucideIcon } from 'lucide-react';
import { ROUTES, type AppRoute } from './routes';

export const BOT_INVITE_URL = 'https://discord.com/api/oauth2/authorize?client_id=1476491781221646480&permissions=8&scope=bot%20applications.commands';

export type IaGroup = 'primary' | 'operations' | 'external';
export type IaAccessPolicy = 'public' | 'authenticated';
export type IaViewMode = 'home' | 'in-app' | 'operations' | 'studio' | 'support';

export type IaNode = {
  id: string;
  label: string;
  shortLabel: string;
  to: string;
  icon: LucideIcon;
  external?: boolean;
  group: IaGroup;
  mode: IaViewMode;
  access: IaAccessPolicy;
  purpose: string;
  hubId?: 'home' | 'in-app' | 'studio' | 'support';
  order: number;
  showInNav?: boolean;
};

export const IA_NODES: IaNode[] = [
  {
    id: 'home',
    label: 'Muel',
    shortLabel: '메 인',
    to: ROUTES.home,
    icon: Compass,
    group: 'primary',
    mode: 'home',
    access: 'public',
    purpose: '메인 화면',
    hubId: 'home',
    order: 1,
  },
  {
    id: 'in-app',
    label: '리서치',
    shortLabel: '리 서 치',
    to: ROUTES.inApp,
    icon: TabletSmartphone,
    group: 'primary',
    mode: 'in-app',
    access: 'public',
    purpose: '인앱 데이터 기반 리서치 뷰',
    hubId: 'in-app',
    order: 2,
  },
  {
    id: 'studio',
    label: '후원',
    shortLabel: '후 원',
    to: ROUTES.studio,
    icon: Newspaper,
    group: 'operations',
    mode: 'studio',
    access: 'public',
    purpose: '후원 및 멤버십 안내 허브',
    hubId: 'studio',
    order: 3,
  },
  {
    id: 'support',
    label: '고객센터',
    shortLabel: '문 의',
    to: ROUTES.support,
    icon: Headset,
    group: 'operations',
    mode: 'support',
    access: 'public',
    purpose: '고객지원 및 FAQ 허브',
    hubId: 'support',
    order: 4,
  },
];

export const getIaNodes = ({ includeExternal = true }: { includeExternal?: boolean } = {}) =>
  IA_NODES
    .filter((node) => includeExternal || !node.external)
    .sort((a, b) => a.order - b.order);

export const PRIMARY_FLOW_ROUTES: AppRoute[] = [ROUTES.home, ROUTES.inApp, ROUTES.dashboard];

export const getPrimaryFlowPosition = (route: AppRoute) => {
  const currentIndex = PRIMARY_FLOW_ROUTES.findIndex((item) => item === route);
  if (currentIndex < 0) {
    return null;
  }

  return {
    current: currentIndex + 1,
    total: PRIMARY_FLOW_ROUTES.length,
    prevTo: currentIndex > 0 ? PRIMARY_FLOW_ROUTES[currentIndex - 1] : undefined,
    nextTo: currentIndex < PRIMARY_FLOW_ROUTES.length - 1 ? PRIMARY_FLOW_ROUTES[currentIndex + 1] : undefined,
  };
};

export const getIaNodeByRoute = (route: string) => IA_NODES.find((node) => !node.external && node.to === route);

export const isRouteProtected = (route: string) => getIaNodeByRoute(route)?.access === 'authenticated';
