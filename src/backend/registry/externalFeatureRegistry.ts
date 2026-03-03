export type BackendFeatureKey = 'sources' | 'youtubeCrawler' | 'crawlerScheduler';

type BackendFeatureSpec = {
  enabled: boolean;
  owner: 'local' | 'external';
  description: string;
};

const toBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() !== 'false';
};

export const backendFeatureRegistry: Record<BackendFeatureKey, BackendFeatureSpec> = {
  sources: {
    enabled: toBool(process.env.FEATURE_SOURCES_ENABLED, true),
    owner: 'local',
    description: '소스 등록/조회/수정/삭제 API',
  },
  youtubeCrawler: {
    enabled: toBool(process.env.FEATURE_YOUTUBE_CRAWLER_ENABLED, true),
    owner: 'local',
    description: '유튜브 URL 크롤링/테스트 트리거',
  },
  crawlerScheduler: {
    enabled: toBool(process.env.FEATURE_CRAWLER_SCHEDULER_ENABLED, true),
    owner: 'local',
    description: '주기적 백그라운드 크롤링 잡',
  },
};

export const isBackendFeatureEnabled = (feature: BackendFeatureKey) => {
  return backendFeatureRegistry[feature].enabled;
};
