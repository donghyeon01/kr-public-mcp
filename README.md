# kr-public-mcp — 나라장터 입찰공고 MCP 서버

Claude·ChatGPT·Cursor에서 나라장터(조달청) 입찰공고를 검색하고 상세를 조회하는 원격 MCP 서버.
설치·인증키 없이 URL만 붙이면 동작한다 (Streamable HTTP).

- 엔드포인트: `https://kr-public-mcp.songdonghyeon01.workers.dev/mcp`
- 데이터: 조달청 나라장터 공공데이터포털 오픈API (입찰공고·사전규격·낙찰정보)
- 모든 응답에 출처와 나라장터 원문 링크를 포함한다

## 도구

| 도구 | 등급 | 설명 |
|------|------|------|
| `search_bids` | 무료 | 입찰공고 검색 — 키워드·기간·업무구분(공사/용역/물품/외자)·지역·추정가 범위 |
| `get_bid_detail` | 무료 | 공고 상세 — 자격요건(면허·참가지역), 일정, 기초금액·추정가, 첨부 링크, 변경 이력 |
| `search_pre_specs` | Pro | 사전규격 검색 — 본공고 전 단계 조기 발굴 |
| `analyze_history` | Pro | 낙찰 이력 집계 — 낙찰률 분포·다빈도 업체·평균 참가수 |
| `watch_bids` | Pro | 알림 조건 저장 → 매일 08:00 KST 이메일 매칭 + 마감 임박 알림 |

무료 도구는 IP 기준 일 30회. Pro는 라이선스 키(크몽 이용권)로 한도 해제 + Pro 도구 개방.

## 연결

```bash
# Claude Code
claude mcp add --transport http narajangteo https://kr-public-mcp.songdonghyeon01.workers.dev/mcp
```

```jsonc
// 일반 MCP 클라이언트 설정
{ "mcpServers": { "narajangteo": { "url": "https://kr-public-mcp.songdonghyeon01.workers.dev/mcp" } } }
```

Pro 키 사용 시 헤더: `Authorization: Bearer <라이선스 키>`.

## 아키텍처

Cloudflare Workers (stateless `createMcpHandler`) + D1 + KV + Cron.
수집(Cron → 조달청 API → D1)과 조회(MCP → D1)를 분리해 API 호출 수를 사용자 수와 무관하게 유지.
공무원 성명·연락처는 응답에서 제거하고 저장하지 않는다.

## 개발

```bash
npm install
npm run db:migrate:local && npm run dev
npm run typecheck
```

셋업·배포·운영 규칙: `AGENTS.md` 참조.

## 라이선스

MIT. 데이터 출처: 조달청 나라장터 (공공데이터포털 오픈API).
