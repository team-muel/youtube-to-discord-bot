# UI/UX Reboot Checklist

## A. Product Intent

- [ ] 한 문장 가치 제안 정리: "거시경제 인사이트를 빠르게 탐색하는 놀이터"
- [ ] 핵심 사용자 질문 3개 정의
- [ ] 첫 화면에서 답해야 할 질문 1개 고정

## B. Information Architecture

- [ ] 개요(Overview)
- [ ] 비교(Compare)
- [ ] 원인분해(Explain)
- [ ] 시나리오(What-if)

## C. Visualization

- [ ] 시계열 차트(hover + tooltip + crosshair)
- [ ] 산업 비교 차트(정렬/필터)
- [ ] 테이블(값 검증용)
- [ ] 이벤트 마커(정책/충격)

## D. UX Interactions

- [ ] 기간 프리셋(1M/3M/1Y/3Y)
- [ ] 시리즈 토글(on/off)
- [ ] 포커스 하이라이트
- [ ] 빈 상태/오류 상태/로딩 상태

## E. Trust Signals

- [ ] 데이터 출처
- [ ] 최신 갱신 시각
- [ ] 단위/정의 설명
- [ ] 해석 주의 문구

## F. Engineering

- [ ] 컴포넌트 분리 (`src/components/finance/*`)
- [ ] 스타일 분리 (거대 `finance-*` 규칙 해소)
- [ ] 숫자 포맷터/단위 포맷 유틸 통합
- [ ] 텔레메트리 이벤트 반영

## G. Release Gate

- [ ] `npm run lint` 통과
- [ ] 데스크탑/모바일 수동 검증
- [ ] FRED live/fallback 둘 다 확인
- [ ] 기존 라우트 회귀 없음
