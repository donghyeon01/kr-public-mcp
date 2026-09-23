// 인증·레이트리밋
// Pro: Authorization: Bearer <license key> → KV 조회.
// 무료: 키 없음 → IP 기준 일일 한도 (D1 usage 테이블).

import type { AuthCtx, Env, License } from "../env";

export async function resolveAuth(request: Request, env: Env): Promise<AuthCtx> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const auth = request.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) return { pro: false, ip };

  const key = m[1];
  const raw = await env.LICENSES.get(`lic:${key}`);
  if (!raw) return { pro: false, ip, licenseKey: key };

  try {
    const lic = JSON.parse(raw) as License;
    const today = new Date().toISOString().slice(0, 10);
    if (lic.exp && lic.exp < today) return { pro: false, ip, licenseKey: key };
    return { pro: true, ip, licenseKey: key, license: lic };
  } catch {
    return { pro: false, ip, licenseKey: key };
  }
}

/**
 * 무료 호출 계량. 한도 초과 시 에러 문자열 반환, 아니면 null.
 * Pro는 한도 해제(계획서)지만 사용량은 집계한다.
 */
export async function meter(env: Env, ctx: AuthCtx, tool: string): Promise<string | null> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const bucket = ctx.pro ? `pro:${ctx.licenseKey}:${day}` : `free:${ctx.ip}:${day}`;

  await env.DB.prepare(
    `INSERT INTO usage (bucket, cnt) VALUES (?, 1)
     ON CONFLICT (bucket) DO UPDATE SET cnt = cnt + 1`,
  ).bind(bucket).run();

  if (ctx.pro) return null;

  const row = await env.DB.prepare(`SELECT cnt FROM usage WHERE bucket = ?`)
    .bind(bucket).first<{ cnt: number }>();
  const limit = Number(env.FREE_DAILY_LIMIT ?? "30");
  if ((row?.cnt ?? 0) > limit) {
    return `무료 일일 한도(${limit}회)를 초과했습니다. Pro 이용권을 사용하면 한도 없이 쓸 수 있습니다. (도구: ${tool})`;
  }
  return null;
}

/** Pro 전용 도구 게이트. */
export function requirePro(ctx: AuthCtx): string | null {
  if (ctx.pro) return null;
  return "이 도구는 Pro 이용권이 필요합니다. Authorization: Bearer <라이선스 키> 헤더로 키를 전달하세요.";
}
