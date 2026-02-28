<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2ac797fc-25e2-4c9c-9338-34844a854cbe

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. (Optional) For more reliable YouTube scraping you can also provide `YOUTUBE_API_KEY`.
   - HTML 파싱 대신 공식 API나 RSS를 사용할 때 유용합니다.
   - 환경 변수에 키가 설정되면 서버는 `src/scraper.ts`에서 API 기반 로직을
     우선적으로 시도하고, 실패하면 기존 HTML 스크래핑으로 폴백합니다.
4. Run the app:
   `npm run dev`

### Frontend API Configuration

Since the frontend communicates with the backend via `/api` routes, you can
point it at a remote server by setting the Vite environment variable
`VITE_API_BASE`. For example:

```bash
# .env.local or Vercel/Render environment
VITE_API_BASE=https://your-backend.example.com
```

If `VITE_API_BASE` is not provided the client will use relative paths, which
works for local development when the server and frontend are on the same
origin.

## 크롤러 견고성

YouTube 사이트 구조는 자주 바뀌므로 HTML에서 데이터를 추출하는 방식은 매우
취약합니다. 현재 구현은 `ytInitialData`를 정규식으로 찾는 데 의존하고 있어,
YouTube가 내부 스크립트 형식을 수정하는 즉시 크롤러가 깨질 수 있습니다.

### 개선 권장 사항

1. **공식 API 사용** – `YOUTUBE_API_KEY`를 설정한 뒤 `src/scraper.ts`의 API
   호출 로직을 실제 요구사항에 맞게 수정하세요. 커뮤니티 게시물은 API 접근이
   제한적일 수 있으니 `activities` 엔드포인트나 RSS 피드를 확인합니다.
2. **RSS 피드** – 채널 업로드/게시물 피드를 통해 변경사항을 감시할 수
   있습니다. 예: `https://www.youtube.com/feeds/videos.xml?channel_id=...`.
3. **예외 처리 강화** – HTML 파싱이 실패할 경우 알림을 보내거나 관리자에게
   로그를 남겨 즉시 문제를 파악할 수 있게 합니다.

필요하다면 외부 크롤러 서비스나 Cloud Pub/Sub 같은 구조를 이용해 더
견고한 아키텍처를 구축하세요.

## 배포 및 환경 변수 가이드

아래 가이드는 이 저장소(`package.json`의 스크립트 기준)를 Vercel(프론트), Render(서버/봇), Supabase(DB/Auth/Storage)로 배포할 때 권장되는 설정을 요약합니다.

### 1) 핵심 아키텍처

- Frontend: Vercel — Vite로 정적 빌드 배포
- Backend (API): Render Web Service — `server.ts`를 호스팅
- Bot: Render Background Worker — `bot.ts`를 항상 실행
- DB/Auth/Storage: Supabase

### 2) 환경 변수(권장 이름)

- 클라이언트(Vercel, 반드시 `VITE_` 접두사 사용):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- 서버/봇(Render, 비공개):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (절대 클라이언트에 노출 금지)
  - `SUPABASE_ANON_KEY` (선택)
  - `DISCORD_TOKEN`
  - `DATABASE_URL` (직접 DB 연결 시)
  - `NODE_ENV`, `PORT`

보안 원칙: 서비스 역할 키(`SUPABASE_SERVICE_ROLE_KEY`)는 Render와 CI(마이그레이션 실행 전용)에서만 사용하고, Vercel에는 넣지 마세요.

### 3) `package.json` 스크립트(이미 추가됨)

- 개발: `npm run dev` (프론트), `npm run dev:server`, `npm run dev:bot`
- 빌드: `npm run build` (TypeScript 컴파일 + Vite 빌드)
- 시작(프로덕션): `npm run start:server`, `npm run start:bot`

### 4) Vercel 설정 (프론트)

- GitHub 연동 → Build Command: `npm run build` → Output Directory: `dist`(Vite 설정 확인)
- 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### 5) Render 설정 (서버 + bot)

- Web Service: Build `npm ci && npm run build`, Start `npm run start:server`, Health check 경로 예: `/health`
- Background Worker: Build 동일, Start `npm run start:bot`
- 환경변수: `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_TOKEN`, `DATABASE_URL` 등

Render 생성 팁:

- Web Service
  - Environment: `Node 18`
  - Build Command: `npm ci && npm run build`
  - Start Command: `npm run start:server`
  - Health Check Path: `/health` (HTTP 200이면 정상)
- Background Worker
  - Build Command: `npm ci && npm run build`
  - Start Command: `npm run start:bot`
  - Set auto-restart on crash

포트: Render는 `PORT` 환경변수로 포트를 주입하므로 `server.ts`는 `process.env.PORT`를 사용합니다.

### 6) Supabase 설정

1. 프로젝트 생성
2. 마이그레이션은 `supabase` CLI 또는 `node-pg-migrate`로 관리
3. RLS(행 수준 보안) 활성화 후 필요한 정책만 추가
4. 마이그레이션 실행은 CI에서만 `SUPABASE_SERVICE_ROLE_KEY`로 수행

RLS 및 스토리지 규칙 설정(권장):

- RLS: 기본적으로 모든 테이블에서 RLS를 활성화하고 필요한 정책만 허용하세요. 예: `users`는 인증된 사용자만 자신의 행을 읽고 쓰도록 설정.
- Storage: 업로드 버킷은 공개/비공개 용도에 따라 분리하고, 업로드/읽기 권한을 버킷 정책으로 제어하세요.
- 키 회전: `SUPABASE_SERVICE_ROLE_KEY`는 주기적으로 재발행하고 CI/Render 시크릿을 함께 갱신하세요.

### 7) CI/CD 권장 흐름 (요약)

- PR 병합 시: 마이그레이션(옵션) → Render/Vercel 자동 배포
- GitHub Actions 예시 단계: Checkout → Install deps → Run migrations (시크릿 사용) → Push/Trigger 배포

### 8) 로컬 실행 예시

```bash
# 의존성 설치
npm install

# 로컬 개발: 프론트
npm run dev

# 로컬 개발: 서버
npm run dev:server

# 로컬 개발: 봇
npm run dev:bot

# 빌드(프로덕션 테스트)


# 프로덕션 빌드 후 서버/봇 실행(로컬 검증용)
node dist/server.js
node dist/bot.js
```

### 9) 체크리스트(배포 전)

- `SUPABASE_SERVICE_ROLE_KEY`는 서버/CI에만 존재
- Vercel에는 `VITE_` 접두사의 환경변수만 노출
- Render의 Web/Worker에 올바른 Start 명령과 Health check 설정
- CI에서 마이그레이션이 안전하게 실행되도록 구성

운영 모니터링 및 로깅 권장 설정:

- Render: 서비스 로그 수집을 활성화하고, Crash/Restart 알림을 설정하세요.
- Sentry/Datadog: 서버 예외 및 성능 모니터링 연동을 권장합니다.
- Supabase: 스냅샷 및 백업 정책을 확인하세요.

문서나 워크플로 샘플을 더 원하시면 GitHub Actions 템플릿 또는 Render/Vercel 스냅샷을 생성해 드리겠습니다.

## GitHub Secrets (권장 목록)

아래 시크릿을 GitHub 레포지토리의 `Settings → Secrets`에 추가하세요.

- `DATABASE_URL` : Postgres 연결 URL (psql 폴백용, 선택)
- `SUPABASE_SERVICE_ROLE_KEY` : Supabase 서비스 역할 키 (마이그레이션/CI 전용)
- `SUPABASE_PROJECT_REF` : Supabase 프로젝트 ref (예: `abcd1234`) — supabase CLI 사용 시
- `RENDER_API_KEY` : Render API 키 (Render 배포 트리거용)
- `RENDER_SERVICE_ID` : Render 서비스 ID (배포 트리거 대상)
- `VERCEL_TOKEN` : Vercel API 토큰 (선택)
- `VERCEL_PROJECT_ID` : Vercel 프로젝트 이름 또는 ID (선택)
- `DISCORD_TOKEN` : Discord 봇 토큰 (Render 환경에는 배포 전 등록)

설정 팁:

- 민감 키(`SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_TOKEN` 등)는 절대 클라이언트에 노출하지 마세요.
- CI에서 마이그레이션을 실행할 때는 최소 권한 원칙을 준수하세요.
