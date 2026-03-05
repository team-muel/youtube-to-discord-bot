# Frontend / Backend 완전 분리 개발 가이드

## 저장소 구조

- Frontend Repo: `muel-front-uiux`
- Backend Repo: `moved-bot-repo` (Git Submodule → `team-muel/discord-news-bot`)

## 최초 세팅

```bash
npm run setup:all
```

이 명령은 다음을 수행합니다.

- 서브모듈 초기화/동기화
- 프론트 의존성 설치
- 백엔드 의존성 설치

## 로컬 개발

### 1) 프론트 단독

```bash
npm run dev
```

### 2) 백엔드 단독

```bash
npm run dev:server
```

### 3) 동시 실행

```bash
npm run dev:full
```

## 환경변수

- 프론트 예시: `.env.frontend.example`
- 백엔드 예시: `moved-bot-repo/.env.backend.example`

권장 로컬 구성

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- `VITE_DEV_API_TARGET=http://localhost:3000`

## 브랜치/배포 전략

- 프론트 기능 개발 → 이 저장소에서 브랜치 작업/PR
- 백엔드 기능 개발 → `moved-bot-repo` 저장소에서 브랜치 작업/PR
- 프론트에서 백엔드 버전 고정이 필요하면 submodule 포인터 커밋

## 검증

```bash
npm run lint
npm run lint:backend
```

참고:

- 프론트 `npm run lint`는 루트의 레거시 서버 잔존 파일(`src/app.ts`, `src/routes/**` 등)을 제외하고 UI 코드만 검사합니다.
- 백엔드 타입 검사는 `npm run lint:backend`로 `moved-bot-repo` 기준에서 수행합니다.

## 운영 원칙

- 프론트는 `VITE_*` 공개 변수만 사용
- 백엔드는 비밀키/토큰을 backend repo 또는 배포 플랫폼 시크릿으로만 관리
- 백엔드 API 계약 변경 시, 프론트는 `apiFetch` 경유로만 접근해 영향 범위를 최소화
