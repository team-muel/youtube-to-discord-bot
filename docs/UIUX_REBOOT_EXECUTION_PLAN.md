# UI/UX Reboot Execution Plan

작성일: 2026-03-06
대상: `src/pages/Dashboard.tsx` 중심 대시보드 재구축

## 1) Decision Log

- 기존 우메다 야경 스타일 방향은 폐기한다.
- 목표는 "예쁜 화면"이 아니라 "거시경제 인사이트 탐색 속도"다.
- 하드코딩 차트(`svg polyline`)에서 라이브러리 기반 상호작용 차트로 전환한다.
- 기존 데이터 소스(FRED, Supabase)는 유지하고 표시 계층만 재설계한다.

## 2) North Star (성공 기준)

- 사용자가 30초 내에 핵심 인사이트 1개를 설명할 수 있다.
- 주요 차트 hover 시 툴팁/크로스헤어가 끊김 없이 반응한다.
- 같은 지표의 값이 카드/차트/테이블에서 일치한다.
- 모바일에서도 핵심 인사이트 섹션이 첫 1~2스크롤 안에 노출된다.

## 3) Current State Snapshot

- `src/pages/Dashboard.tsx`: 단일 페이지에 섹션/차트/카드/피드가 혼재.
- `src/index.css`: `finance-*` 규칙이 대규모 단일 파일로 누적.
- `src/config/financeTheme.ts`: 색/반경 토큰은 존재하나 컴포넌트 설계와 느슨하게 결합.

## 4) Target Architecture

- Presentation Layer
  - `src/pages/Dashboard.tsx`: 오케스트레이션만 담당.
  - `src/components/finance/*`: 섹션별 분리 컴포넌트.
- Visualization Layer
  - 공통 `ChartCard` 래퍼 + 라이브러리 차트 컴포넌트.
  - hover/tooltip/crosshair 동작 규칙 표준화.
- Data Layer
  - 기존 `useFredIndicators`, Supabase fetch 로직 재사용.
  - 단위(unit), 기준시점(as-of), 출처(source) 메타를 함께 전달.
- Design Token Layer
  - 글로벌 토큰 유지, 금융 대시보드 전용 토큰은 별도 스코프로 분리.

## 5) Library Strategy

권장 기본안:

- 1순위: shadcn/ui + 차트 구성(유연한 컴포넌트 구조)
- 2순위: Nivo 선택 도입(복잡 시각화 전용)

대안:

- 빠른 MVP가 급하면 Tremor 우선 도입 후 단계적 교체.

## 6) PR Split Plan (실행 단위)

PR-1 Foundation

- `src/pages/Dashboard.tsx`를 섹션 조립형으로 분리.
- `src/components/finance/`에 아래 컴포넌트 추가:
  - `InsightStrip.tsx`
  - `MarginTrendPanel.tsx`
  - `IndustryComparePanel.tsx`
  - `EvidencePanel.tsx`
- `src/index.css`에서 `finance-*` 직접 스타일 의존을 최소화하고 컴포넌트 단위 스타일로 이동.

PR-2 Chart Engine

- 차트 라이브러리 설치 및 공통 래퍼 도입.
- 데이터 포맷터(숫자/퍼센트/단위) 유틸 추가.
- 툴팁/범례/빈상태(skeleton) UI 반영.

PR-3 Insight Story

- "최종재 vs 중간재 마진" 핵심 스토리 라인 구현.
- 비교 뷰(기간/산업 필터)와 이벤트 마커 연동.
- 해석 보조 문구(오독 방지) 추가.

PR-4 Quality Gate

- 모바일 반응형, 접근성, 로딩 상태, 성능 측정 반영.
- 클릭/필터/차트 인터랙션 벤치마크 이벤트 계측.

## 7) Build Checklist (Developer)

- [ ] 차트 라이브러리 최종 선택 및 의존성 설치
- [ ] `Dashboard`를 섹션 조립 구조로 리팩터링
- [ ] 핵심 차트 1개(마진 추이) 라이브 구현
- [ ] 산업 비교 차트 1개 라이브 구현
- [ ] 카드/차트/테이블 값 일치성 검증
- [ ] 툴팁 지연/깜빡임 UX 점검
- [ ] 모바일 레이아웃 점검(가로 스크롤, 폰트, 터치 타겟)
- [ ] 데이터 출처/갱신시각/단위 표시
- [ ] 빈 상태/오류 상태/로딩 상태 UI 추가
- [ ] 이벤트 추적(필터 변경, 시리즈 on/off, 차트 hover 핵심 이벤트)

## 8) Quality Gate (Release)

- [ ] Lighthouse 성능/접근성 기준선 충족
- [ ] `npm run lint` 통과
- [ ] 주요 경로 수동 테스트 완료: `/`, `/studio`, `/support`
- [ ] FRED API key 미설정 상태에서도 폴백 정상 동작

## 9) Risks and Mitigations

- 리스크: 스타일 전면 교체 중 시각 일관성 붕괴
  - 대응: 페이지 단위 feature flag 또는 점진 교체
- 리스크: 차트 상호작용 성능 저하
  - 대응: 데이터 샘플링/메모이제이션/렌더 범위 축소
- 리스크: 인사이트 문구의 과해석
  - 대응: 근거 지표와 출처를 같은 패널에 강제 배치

## 10) Immediate Next Action (Today)

1. 차트 라이브러리 확정
2. `Dashboard` 섹션 분리 뼈대 작성
3. "최종재 vs 중간재 마진" 단일 차트 MVP 구현
4. `npm run lint`로 타입/회귀 확인
