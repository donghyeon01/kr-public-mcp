// Workers 바인딩·시크릿 타입 정의

export interface Env {
  DB: D1Database;
  LICENSES: KVNamespace;
  ASSETS: Fetcher;
  // wrangler secret put 으로 등록
  DATA_GO_KR_KEY: string;
  RESEND_API_KEY: string;
  ADMIN_TOKEN: string; // /collect 수동 수집 엔드포인트 보호
  // vars
  FREE_DAILY_LIMIT: string;
  SOURCE_LABEL: string;
  RESEND_FROM: string;    // 예: "나라장터 알림 <noreply@도메인>"
  ADMIN_EMAIL: string;    // 수집 실패 알림 수신 주소
}

export type Tier = "free" | "basic" | "standard" | "premium";

export interface License {
  tier: Exclude<Tier, "free">;
  exp: string;      // 만료일 ISO (YYYY-MM-DD)
  label?: string;   // 발급 메모 (크몽 주문번호 등)
}

export interface AuthCtx {
  pro: boolean;
  licenseKey?: string;
  license?: License;
  ip: string;
}
