# Secrets & Environment Variables — 설정 가이드

이 문서는 GitHub, Vercel, Render, Supabase에 필요한 시크릿과 설정 방법을 안내합니다.

---

## 1) 필요한 시크릿 목록 (권장 이름)

- `DATABASE_URL` : Postgres 연결 URL (psql 폴백용, 선택)
- `SUPABASE_SERVICE_ROLE_KEY` : Supabase 서비스 역할 키 (마이그레이션/CI 전용)
- `SUPABASE_PROJECT_REF` : Supabase 프로젝트 ref (예: `abcd1234`) — supabase CLI 사용 시
- `SUPABASE_ANON_KEY` : Supabase anon/public key (클라이언트용)
- `SUPABASE_URL` : Supabase 프로젝트 URL
- `RENDER_API_KEY` : Render API 키 (Render 배포 트리거용)
- `RENDER_SERVICE_ID` : Render 서비스 ID (배포 트리거 대상)
- `VERCEL_TOKEN` : Vercel API 토큰 (선택)
- `VERCEL_PROJECT_ID` : Vercel 프로젝트 이름 또는 ID (선택)
- `DISCORD_TOKEN` : Discord 봇 토큰 (서버/워커용)
- `DISCORD_RECONNECT_DELAY_MS` : Discord 세션 무효화/샤드 단절 시 자동 재접속 지연(ms, 선택)
- `DISCORD_MANUAL_RECONNECT_COOLDOWN_MS` : `/bot-reconnect` 수동 재연결 명령 최소 간격(ms, 기본 30000, 선택)
- `DISCORD_BOT_ALERT_WEBHOOK_URL` : 봇 오프라인/복구 경보를 수신할 Discord Webhook URL(선택)
- `DISCORD_BOT_ALERT_COOLDOWN_MS` : 오프라인 경보 중복 방지 최소 간격(ms, 기본 300000, 선택)
- `DISCORD_INTERACTION_TTL_MS` : Slash 응답 버튼 인터랙션 유효시간(ms, 기본 300000, 선택)
- `GEMINI_API_KEY` : Gemini(또는 다른 AI) API 키 (선택)
- `SESSION_SECRET` : JWT/세션 서명용 랜덤 문자열
- `RESEARCH_PRESET_ADMIN_USER_IDS` : 리서치 프리셋 업서트 API 접근 허용 Discord 사용자 ID 목록(콤마 구분)
- `DISCORD_COMMAND_GUILD_ID` : 슬래시 명령을 특정 Discord 길드에 즉시 등록할 때 사용하는 길드 ID(선택)
- `RESEARCH_STUDIO_URL` : Discord 프리셋 명령 성공 응답에 Studio 이력 패널 링크를 첨부할 때 사용하는 프론트 기준 URL(선택)
- `RESEARCH_PRESET_MUTATION_COOLDOWN_MS` : Discord restore/upsert 계열 명령 중복 실행 방지 쿨다운(ms, 기본 8000, 선택)

링크 동작 참고:

- Discord 응답의 Studio 링크는 `/studio?preset=<presetKey>&historyId=<historyId>#preset-history` 형태로 생성되며, Studio 화면에서 해당 이력 항목으로 자동 포커스됩니다.
- `/preset-history`의 `Restore` 버튼은 명령 실행자 + 관리자 allowlist 조건을 동시에 만족해야 동작합니다.

---

## 2) GitHub Secrets에 추가하기 (UI)

1. GitHub 레포 → `Settings` → `Secrets and variables` → `Actions` → `New repository secret` 클릭
2. Name에 시크릿 이름(`SUPABASE_SERVICE_ROLE_KEY` 등) 입력, Value에 실제 값 붙여넣기 → `Add secret` 클릭

## 3) GitHub CLI로 추가하기 (예시)

```bash
# 예: gh 설치 및 인증 필요
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$SUPABASE_SERVICE_ROLE_KEY"
gh secret set DATABASE_URL --body "$DATABASE_URL"
```

또는 저장소 루트의 스크립트를 사용하면 환경 변수에서 한꺼번에 등록할 수 있습니다:

```bash
# Bash / WSL / macOS
export DISCORD_TOKEN="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
# (기타 환경 변수 설정)
./scripts/gh-set-secrets.sh
```

PowerShell을 쓰는 Windows 환경에서는 `gh-set-secrets.ps1`를 실행하세요:

```powershell
# PowerShell 실행 환경
$env:DISCORD_TOKEN = "..."
$env:SUPABASE_SERVICE_ROLE_KEY = "..."
# (기타 설정)
.\scripts\gh-set-secrets.ps1
```

> 주의: CI에서 마이그레이션을 실행할 때 `SUPABASE_SERVICE_ROLE_KEY`를 사용하세요. 이 키는 절대 클라이언트(프론트)에 노출하면 안 됩니다.

---

## 4) Vercel 환경 변수 설정

- Vercel 대시보드 → 프로젝트 선택 → `Settings` → `Environment Variables`
- Add Variable로 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE` 등을 추가
- 프리뷰/프로덕션 등 환경별로 값을 다르게 설정 가능

Vercel CLI 예시:

```bash
# Install vercel CLI and login
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

---

## 5) Render 환경 변수 설정

- Render 대시보드 → 서비스 선택 → `Environment` 탭 → `Add Environment Variable`
- Render는 `PORT`를 자동으로 주입하므로 `server.ts`에서 `process.env.PORT`를 사용해야 합니다.
- 반드시 `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_TOKEN` 등 민감 키는 Render에만 보관하고 클라이언트에 노출하지 마세요.

Render API를 사용해 배포 트리거를 하려면 `RENDER_API_KEY`를 생성해 GitHub Secrets에 등록하세요.

---

## 6) Supabase에서 키 얻는 방법

1. Supabase 콘솔 접속 → 프로젝트 선택
2. 왼쪽 메뉴에서 `Settings` → `API`
3. `URL`이 `SUPABASE_URL`이고, `anon`과 `service_role` 키를 복사하세요.
   - `service_role` 키는 관리자 권한이 있으므로 CI 또는 서버/백엔드에서만 사용하세요.

---

## 7) 키 관리/회전 권장사항

- 민감 키는 최소 권한 원칙을 적용하세요.
- `service_role` 같은 키는 정기적으로 재발행(rotate)하고, 재발행 시 CI 및 배포 환경에 시크릿을 업데이트하세요.
- 키가 유출되었다고 의심되면 즉시 재발행 후 모든 영향을 받는 환경을 업데이트하세요.

---

## 8) 로컬에서 마이그레이션/검증 방법

- `supabase` CLI 사용(권장):

```bash
# supabase CLI 설치 및 로그인
npm install -g supabase
supabase login
supabase db push # 또는 supabase migration deploy
```

- psql 폴백(간단한 SQL 파일 적용):

```bash
# DATABASE_URL 예: postgres://user:pass@host:5432/dbname
psql "$DATABASE_URL" -f supabase/migrations/001_create_users.sql
```

리서치 프리셋 운영 기능을 쓰려면 아래 마이그레이션도 적용해야 합니다.

- `supabase/migrations/002_create_research_presets.sql`
- `supabase/migrations/003_create_research_preset_audit.sql`
- `supabase/migrations/004_add_research_preset_audit_metadata.sql`

---

## 9) 워크플로 수동 트리거

- GitHub Actions → 해당 워크플로우 → `Run workflow`로 수동 실행 가능
- 또는 커밋/PR을 통해 자동 트리거
- API로도 호출할 수 있습니다:
  ```bash
  # GITHUB_TOKEN(또는 PAT) 필요
  curl -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    https://api.github.com/repos/<owner>/<repo>/actions/workflows/ci-deploy.yml/dispatches \
    -d '{"ref":"main"}'
  ```

## 10) 배포 검증

- Render에서 웹 서비스와 워커가 정상적으로 기동되었는지 로그 확인
- `/health` 엔드포인트 호출:
  ```bash
  curl https://<your-render-domain>/health
  curl https://<your-vercel-domain>/health  # if you proxy through Vercel
  ```
- GitHub Actions 실행 후 나오는 빌드/마이그레이션 로그에서 오류가 없는지 확인

---

---

## 10) 검사 항목(배포 전)

- [ ] `SUPABASE_SERVICE_ROLE_KEY`가 GitHub Secrets에 설정되어 있는가?
- [ ] Vercel에는 `VITE_` 접두사만 노출되어 있는가?
- [ ] Render 서비스에 `DISCORD_TOKEN`, `SUPABASE_URL` 등이 설정되어 있는가?
- [ ] CI에서 마이그레이션(또는 psql)이 정상 동작하는가? (샘플 마이그레이션 확인)

---

필요하시면 제가 GitHub Secrets 추가용 `gh` 명령 목록을 생성하거나, Render `render.yaml`을 실제 값으로 채워 배포용 템플릿 준비를 도와드리겠습니다.
