# kr-public-mcp — 나라장터 입찰 MCP 서버

## 목적

나라장터 입찰공고·사전규격·낙찰 이력을 원격 MCP(Streamable HTTP)로 제공.
무료 도구로 레지스트리 유입, Pro(라이선스 키)는 크몽 이용권으로 판매.

계획서: `아이디어/03-계획/kr-public-mcp.md` (기획 확정 2026-09-23)

## 기술 스택

- Cloudflare Workers 무료 티어 + D1 + KV + Cron Triggers + Static Assets
- stateless MCP: `createMcpHandler`(`agents/mcp/server`) + `@modelcontextprotocol/server` v2
  - `McpAgent`(Durable Objects)는 deprecated — 사용 금지
- 서버비 ≈ 0: 수집(Cron→D1)과 조회(MCP→D1) 분리. 조달청 API 직접 호출은 수집·상세보강·단건조회뿐
- 서버 측 LLM 호출 금지 (요약은 클라이언트 LLM)

## 구조

```
src/index.ts    — Worker 엔트리: /mcp, /collect(관리자), /health, assets, scheduled
src/server.ts   — MCP 서버 팩토리 (요청별 env·인증 클로저)
src/cron.ts     — 수집(공고/사전규격/낙찰) + 알림 매칭(08:00 KST)
src/tools/bids.ts — 무료: search_bids, get_bid_detail
src/tools/pro.ts  — Pro: search_pre_specs, analyze_history, watch_bids
src/lib/g2b.ts  — 조달청 API 클라이언트. 오퍼레이션명·필드 매핑 전부 이 파일 (스키마 변경 시 여기만 수정)
src/lib/db.ts   — D1 적재(upsert)·조회·집계
src/lib/auth.ts — KV 라이선스 검증 + 무료 IP 레이트리밋(D1 usage)
src/lib/email.ts— Resend 발송
src/lib/fmt.ts  — KST 날짜·D-day·금액·출처 꼬리
schema.sql      — D1 스키마 (bids/pre_specs/awards/watches/usage)
scripts/issue-key.mjs — 라이선스 키 발급/폐기 (wrangler kv key put)
public/         — 랜딩 + 개인정보처리방침 (legal-doc-generator 정식판으로 교체 예정)
```

## 셋업 (최초 1회)

```bash
cd /home/ubuntu/workspaces/수익화/kr-public-mcp
npm install
npm run db:create          # 출력 database_id를 wrangler.jsonc에 반영
npm run kv:create          # 출력 id를 wrangler.jsonc에 반영
npm run db:migrate         # 원격 D1에 schema.sql 적용
wrangler secret put DATA_GO_KR_KEY   # data.go.kr Decoding 키
wrangler secret put RESEND_API_KEY
wrangler secret put ADMIN_TOKEN      # /collect 보호용 임의 문자열
```

vars(비밀 아님)는 wrangler.jsonc: `FREE_DAILY_LIMIT=30`, `RESEND_FROM`, `ADMIN_EMAIL`.

## 개발·검증

```bash
npm run dev                              # 로컬 wrangler dev
npm run typecheck                        # tsc --noEmit
npm run db:migrate:local                 # 로컬 D1 스키마 적용

# 수동 수집 (API 키 필요)
curl "http://localhost:8787/collect?target=recent&hours=3&token=$ADMIN_TOKEN"
curl "http://localhost:8787/collect?target=awards&days=2&token=$ADMIN_TOKEN"

# MCP 동작 확인 (tools/list → tools/call)
curl -X POST http://localhost:8787/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## 라이선스 키 발급 (크몽 주문 시)

```bash
node scripts/issue-key.mjs --tier basic --days 30 --label <크몽주문번호>
node scripts/issue-key.mjs --revoke njp_xxx
```

## 도구 명세 (계획서 §도구 명세와 1:1)

| tool | 등급 | 비고 |
|------|------|------|
| search_bids | 무료 | D1 검색 (키워드·기간·업무·지역·가격) |
| get_bid_detail | 무료 | D1 없으면 API 단건조회, 상세는 lazy fetch 후 D1 캐시 |
| search_pre_specs | Pro | 사전규격 |
| analyze_history | Pro | 낙찰 집계 (낙찰률·다빈도 업체·참가수) |
| watch_bids | Pro | 알림 조건 CRUD + 08:00 KST 이메일 매칭 |

모든 도구 응답 끝에 출처 표기 (`fmt.sourceFooter`).

## 규칙

- 공무원 성명·연락처 저장 금지 (원문 링크로 대체)
- 사용자 데이터는 이메일·알림조건·라이선스키만. 처리방침: `public/privacy.html`
- 조달청 API 키는 Workers secret만 사용. 하드코딩·커밋 금지
- 나라장터 웹 스크래핑 금지 — 공개 API만
- 판매 문구는 "호스팅·매칭·알림 서비스 이용료" — 공공데이터 자체 재판매 표현 금지
- 수집 Cron 실패 시 ADMIN_EMAIL로 알림 (cron.ts alertFailures)

## 상태

- 2026-09-23: **배포 + 실데이터 검증 완료** — https://kr-public-mcp.songdonghyeon01.workers.dev
  - D1·KV 생성·스키마 적용·크론 3개·시크릿(DATA_GO_KR_KEY, ADMIN_TOKEN) 등록 완료
  - 실데이터 수집 확인: 72h 구간 공고 315건 + 사전규격 126건 (441건)
  - search_bids / get_bid_detail(면허제한·첨부 링크 lazy 보강) 실데이터 응답 확인
  - 공무원 개인정보(Ofcl/Tel/Email/exctv)는 적재 전 stripPersonal로 제거됨을 확인
  - 미등록 시크릿: `RESEND_API_KEY`(Pro 알림 단계 전). ADMIN_TOKEN 값은 `.dev.vars` 참조
- 다음: MCP 레지스트리(Smithery/공식/Glama/PlayMCP) 등록 → 크몽 이용권 → RESEND_API_KEY
- 참고: data.go.kr 응답 `items`는 `{item:[]}` 중첩이 아니라 배열 직접 반환 (g2b.ts 양쪽 처리)
