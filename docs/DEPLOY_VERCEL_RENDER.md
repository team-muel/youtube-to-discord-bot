# Vercel + Render 배포 Runbook

## 목표 아키텍처

- Frontend: Vercel (`muel-front-uiux`)
- Backend: Render (`discord-news-bot`)
- DB/Auth: Supabase

## 1) Frontend (Vercel)

### 프로젝트 연결

1. Vercel에서 `team-muel/muel-front-uiux` Import
2. Framework: Vite
3. Build Command: `npm run build`
4. Output: `dist`

### 필수 환경변수

- `VITE_API_BASE=https://<render-backend-domain>`
- `VITE_SUPABASE_URL=<supabase-url>`
- `VITE_SUPABASE_ANON_KEY=<supabase-anon-key>`

### 라우팅

- `vercel.json`의 rewrite가 SPA 라우팅을 처리합니다.

## 2) Backend (Render)

### 프로젝트 연결

1. Render에서 `team-muel/discord-news-bot` Web Service 생성
2. Branch: `moved/backend` (또는 운영 기준 브랜치)
3. Build Command: `npm ci`
4. Start Command: `npm run start:server`
5. Health Check: `/health`

### 필수 환경변수

- `NODE_ENV=production`
- `START_BOT=true` (API-only 운영 시 `false`)
- `APP_BASE_URL=https://<vercel-domain>`
- `OAUTH_REDIRECT_ALLOWLIST=https://<render-backend-domain>,https://<vercel-domain>`
- `CORS_ALLOWLIST=https://<vercel-domain>` (선택)
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_TOKEN`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`OAUTH_REDIRECT_ALLOWLIST` 설명:

- 웹 OAuth 콜백은 기본적으로 `https://<render-backend-domain>/auth/callback`으로 돌아옵니다.
- 따라서 allowlist에는 Render 백엔드 origin이 반드시 포함되어야 합니다.
- 운영 중 프론트 origin 검증을 위해 Vercel origin도 함께 넣는 것을 권장합니다.

Discord Developer Portal 설정:

- OAuth2 Redirects에 `https://<render-backend-domain>/auth/callback`를 정확히 등록해야 합니다.
- 이 값이 다르면 로그인 팝업이 열려도 인증 완료 단계에서 실패합니다.

## 3) CORS / Auth 체크포인트

- 프론트 `VITE_API_BASE`가 Render 백엔드 도메인을 정확히 가리켜야 함
- 프론트 도메인이 변경되면 Render의 `APP_BASE_URL`, `CORS_ALLOWLIST`, `OAUTH_REDIRECT_ALLOWLIST`를 함께 갱신
- 백엔드 도메인이 변경되면 `VITE_API_BASE`, `OAUTH_REDIRECT_ALLOWLIST`, Discord OAuth2 Redirects를 함께 갱신

## 4) 배포 검증

### Backend

- `GET https://<render-domain>/health` → 200 또는 degraded 응답 확인

### Frontend

- 페이지 진입/라우팅 정상 동작
- 로그인 흐름(`/api/auth/*`) 정상
- 주요 API 호출(`/api/status`, `/api/benchmark/summary`) 정상

## 5) 장애 대응 우선순위

1. Frontend 4xx/5xx 발생 시 `VITE_API_BASE` 확인
2. OAuth 실패 시 `OAUTH_REDIRECT_ALLOWLIST`, Discord OAuth2 Redirects, `APP_BASE_URL` 확인
3. API 401/403 반복 시 쿠키 도메인/HTTPS 및 CSRF 헤더 확인
4. Bot 비정상 시 Render 로그 + `/api/bot/status` 확인
