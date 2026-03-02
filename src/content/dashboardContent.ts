export type HubMetric = {
  id: string;
  value: number;
  suffix: string;
  label: string;
  description: string;
};

export type HubPageContent = {
  header: {
    title: string;
    inviteBot: string;
    browseFeatures: string;
  };
  hero: {
    badge: string;
    title: string;
    description: string;
    panelKicker: string;
    secondaryLinks: {
      features: string;
      snapshots: string;
    };
  };
  quickHighlights: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  socialProof: {
    title: string;
    description: string;
  };
  chapter: {
    overline: string;
    title: string;
    description: string;
  };
  sections: {
    metrics: {
      overline: string;
      title: string;
      description: string;
      ariaLabel: string;
    };
    snapshots: {
      overline: string;
      title: string;
      description: string;
      prefix: string;
      ariaLabel: string;
    };
  };
  metrics: HubMetric[];
  features: Array<{
    id: string;
    title: string;
    subtitle: string;
    description: string;
    token: string;
  }>;
  snapshots: Array<{
    id: string;
    title: string;
    description: string;
  }>;
};

export const dashboardContent: HubPageContent = {
  header: {
    title: 'muel',
    inviteBot: 'Discord에 추가',
    browseFeatures: '기능 보기',
  },
  hero: {
    badge: '',
    title: '경제 리서치 팀을 위한 / Discord 운영 허브',
    description: '시장 브리프, 커뮤니티 운영, 자동 알림 워크플로우를 하나의 기준으로 관리하는 메인 허브입니다.',
    panelKicker: '오늘의 운영 스냅샷',
    secondaryLinks: {
      features: '핵심 기능',
      snapshots: '화면 요약',
    },
  },
  sections: {
    metrics: {
      overline: '운영 지표',
      title: '한눈에 보는 현재 상태',
      description: '중요 수치를 빠르게 확인하고 다음 액션을 선택할 수 있습니다.',
      ariaLabel: 'operations metrics',
    },
    snapshots: {
      overline: 'SCROLL SNAP PREVIEW',
      title: '운영 화면 요약',
      description: '운영 화면을 빠르게 훑고 필요한 화면으로 바로 이동할 수 있습니다.',
      prefix: 'SNAP',
      ariaLabel: 'dashboard snapshots',
    },
  },
  quickHighlights: [
    {
      id: 'quick-brief',
      title: '리서치 브리프',
      description: '핵심 거시 이슈를 운영 팀 기준으로 빠르게 요약합니다.',
    },
    {
      id: 'quick-ops',
      title: '운영 점검',
      description: '온보딩·역할·알림 흐름 상태를 즉시 확인합니다.',
    },
  ],
  socialProof: {
    title: '운영 팀을 위한 리서치 중심 모듈',
    description: '리서치 자동화와 커뮤니티 운영 기능을 동일한 규칙으로 연결합니다.',
  },
  chapter: {
    overline: '운영 흐름',
    title: '메인 운영 플로우',
    description: '핵심 운영 모듈을 빠르게 확인하고 바로 액션할 수 있게 구성했습니다.',
  },
  metrics: [
    {
      id: 'metric-servers',
      value: 84,
      suffix: '+',
      label: 'ACTIVE SERVERS',
      description: '현재 운영 중인 서버 수',
    },
    {
      id: 'metric-briefs',
      value: 540,
      suffix: '+',
      label: 'WEEKLY BRIEFS',
      description: '최근 7일 브리프 생성 건수',
    },
    {
      id: 'metric-latency',
      value: 3,
      suffix: 's',
      label: 'ALERT LATENCY',
      description: '이벤트 감지 후 알림 전송 평균 지연',
    },
  ],
  features: [
    {
      id: 'welcome-messages',
      title: '신규 멤버 온보딩',
      subtitle: '자동 안내 메시지',
      description: '신규 멤버 유입 시점에 맞춰 안내 메시지를 자동으로 보냅니다.',
      token: '온보딩',
    },
    {
      id: 'embed-messages',
      title: '리서치 브리프',
      subtitle: '경제 이슈 자동 요약',
      description: '시장 이슈를 요약해 Discord 채널로 자동 전달합니다.',
      token: '리서치',
    },
    {
      id: 'roles',
      title: '역할 자동화',
      subtitle: '셀프 할당 지원',
      description: '리액션과 버튼 기반으로 역할 부여를 자동화합니다.',
      token: '역할',
    },
    {
      id: 'leveling-system',
      title: '알림 & 활동 점수',
      subtitle: '참여도 관리',
      description: '알림 반응과 활동도를 점수화해 참여도를 관리합니다.',
      token: '참여도',
    },
  ],
  snapshots: [
    {
      id: 'snapshot-research',
      title: '리서치 브리프 흐름',
      description: '매크로 이슈가 발생하면 자동 요약·배포·고정까지 이어지는 파이프라인.',
    },
    {
      id: 'snapshot-community',
      title: '커뮤니티 운영 흐름',
      description: '온보딩, 역할 배정, 알림 정책을 한 화면에서 점검하는 운영 뷰.',
    },
    {
      id: 'snapshot-risk',
      title: '리스크 대응 흐름',
      description: '이상 이벤트를 감지하면 채널별 기준으로 경보 우선순위를 재정렬.',
    },
  ],
} as const;
