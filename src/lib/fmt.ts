// 출력 포맷 헬퍼 — KST 날짜, D-day, 금액, 출처 꼬리

const KST = "Asia/Seoul";

/** data.go.kr 원문일시(다양한 형식) → Date 시도. 실패 시 null. */
export function parseDt(raw?: string | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // "2026-09-23 14:00:00" / "2026-09-23T14:00:00" 계열
  const iso = Date.parse(s.replace(" ", "T") + (s.length <= 16 ? ":00" : "") + "+09:00");
  if (!Number.isNaN(iso)) return new Date(iso);
  // "20260923140000" / "202609231400" / "20260923"
  const m = s.replace(/\D/g, "");
  if (m.length >= 8) {
    const pad = (m + "000000").slice(0, 14);
    const d = new Date(
      `${pad.slice(0, 4)}-${pad.slice(4, 6)}-${pad.slice(6, 8)}T${pad.slice(8, 10)}:${pad.slice(10, 12)}:${pad.slice(12, 14)}+09:00`,
    );
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function fmtDtKST(raw?: string | null): string {
  const d = parseDt(raw);
  if (!d) return raw ?? "-";
  return d.toLocaleString("ko-KR", { timeZone: KST, hour12: false });
}

/** 마감까지 남은 일수. 이미 지났으면 "마감". */
export function dday(clseRaw?: string | null, now = new Date()): string {
  const d = parseDt(clseRaw);
  if (!d) return "-";
  const days = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "마감";
  if (days === 0) return "D-day";
  return `D-${days}`;
}

export function fmtWon(v?: number | string | null): string {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n.toLocaleString("ko-KR")}원`;
}

// D1 bind는 undefined를 받지 못한다 — 없는 값은 null로 통일.
export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function num(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s.replace(/[,원]/g, ""));
  return Number.isNaN(n) ? null : n;
}

/** 도구 응답 꼬리 — 계획서: 모든 응답에 출처 표기. */
export function sourceFooter(label: string): string {
  return `\n\n---\n출처: ${label} | 공공데이터포털 오픈API\n본 정보는 참고용이며 입찰 참가 전 반드시 나라장터 원문 공고를 확인하세요.`;
}
