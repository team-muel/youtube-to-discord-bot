export const researchContent = {
  hero: {
    overline: 'RESEARCH IN-APP LINKED SURFACE',
    title: '리서치 인앱 연동 워크스페이스',
    description:
      'Discord 인앱에서 웹으로 연동 시 열리는 전용 분석 공간입니다. 경제·퀀트 API를 연결해 필요한 데이터를 시각화하고, 운영자가 발행한 네이버 프리미엄 콘텐츠를 앱 유저가 열람합니다.',
  },
  sections: {
    connectors: {
      overline: '01 API CONNECTORS',
      title: '연결 상태',
      description: '필요한 데이터 소스를 연결하고 갱신 상태를 점검합니다.',
    },
    workbench: {
      overline: '02 RESEARCH WORKBENCH',
      title: '열람 워크벤치',
      description: '수집 → 가공 → 시각화 → 발행 콘텐츠 열람 흐름을 한 화면에서 확인합니다.',
    },
    charts: {
      overline: '03 VISUAL ANALYSIS',
      title: '시각화 레이어',
      description: '거시 리스크와 퀀트 시그널을 동시에 비교해 해석합니다.',
    },
  },
  connectors: [
    {
      id: 'macro-api',
      title: '거시 경제 API',
      status: 'CONNECTED',
      description: '금리, 물가, 환율, 유동성 지표를 수집해 기준 시계열로 정렬합니다.',
    },
    {
      id: 'quant-api',
      title: '퀀트 신호 API',
      status: 'READY',
      description: '팩터 신호와 변동성 이벤트를 수신해 실시간 신호 레이어를 만듭니다.',
    },
    {
      id: 'publish-api',
      title: '네이버 프리미엄 연동',
      status: 'REFERENCE',
      description: '운영자가 발행한 네이버 프리미엄 콘텐츠 메타데이터를 열람하는 기준 섹션입니다.',
    },
  ],
  workbench: {
    feeds: ['FRED / 한국은행 ECOS', 'Yahoo / Polygon / 자체 팩터', 'Discord 인앱 컨텍스트'],
    views: ['멀티 자산 비교 차트', '리스크 레이더', '이벤트 타임라인'],
    library: ['운영자 발행 콘텐츠 피드', '카테고리/태그 메타데이터 보기', '최신 발행본 열람 체크리스트'],
  },
  radar: {
    title: 'Macro Risk Radar',
    subtitle: '거시 리스크 레이어',
    metrics: [
      { label: 'Liquidity', value: 72 },
      { label: 'Volatility', value: 44 },
      { label: 'Momentum', value: 67 },
      { label: 'Risk Spread', value: 53 },
      { label: 'Sentiment', value: 61 },
      { label: 'Stability', value: 70 },
    ],
  },
  trend: {
    title: 'Quant Signal Timeline',
    subtitle: '신호 편차 추세',
    labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'],
    values: [61, 64, 66, 59, 71, 74, 69, 77],
  },
  premium: {
    title: 'Naver Premium Published Content Deck',
    subtitle: '발행 콘텐츠 열람 레이어',
    lockLabel: 'VIEW ONLY · PUBLISHED BY OPERATOR',
    rows: [
      { label: 'Core CPI Forecast', value: '3.42% → 2.88%' },
      { label: 'Policy Rate Path', value: 'Q3 Pivot Probability 74%' },
      { label: 'FX Regime Shift', value: 'KRW Strength Window 5W' },
      { label: 'Risk-On Trigger', value: 'Liquidity Delta +18.6' },
    ],
  },
} as const;
