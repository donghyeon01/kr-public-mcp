// 조달청 data.go.kr API 클라이언트.
// 계획서 리스크 대응: API 주소·오퍼레이션명·응답 필드 매핑을 이 파일 한 곳에 모은다.
// 스키마가 바뀌면 여기만 고친다.

import type { Env } from "../env";

// ── 서비스 베이스 URL ──────────────────────────────────────────────
export const SERVICES = {
  bid: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService",
  prespec: "https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService",
  award: "https://apis.data.go.kr/1230000/as/ScsbidInfoService",
} as const;

export type BidKind = "cnstwk" | "servc" | "thng" | "frgcpt";
export const ALL_KINDS: readonly BidKind[] = ["cnstwk", "servc", "thng", "frgcpt"];
export const KIND_LABEL: Record<BidKind, string> = {
  cnstwk: "공사",
  servc: "용역",
  thng: "물품",
  frgcpt: "외자",
};

const SUFFIX: Record<BidKind, string> = {
  cnstwk: "Cnstwk",
  servc: "Servc",
  thng: "Thng",
  frgcpt: "Frgcpt",
};

// ── 오퍼레이션명 ──────────────────────────────────────────────────
// 입찰공고정보서비스
export const BID_OPS = {
  list: (k: BidKind) => `getBidPblancListInfo${SUFFIX[k]}`,
  search: (k: BidKind) => `getBidPblancListInfo${SUFFIX[k]}PPSSrch`,
  // 상세 보강 (업무구분 무관/일부만 지원)
  basisAmount: {
    thng: "getBidPblancListInfoThngBsisAmount",
    cnstwk: "getBidPblancListInfoCnstwkBsisAmount",
    servc: "getBidPblancListInfoServcBsisAmount",
  } as Partial<Record<BidKind, string>>,
  licenseLimit: "getBidPblancListInfoLicenseLimit",   // 면허제한
  regionLimit: "getBidPblancListInfoPrtcptPsblRgn",   // 참가가능지역
  changeHistory: {
    thng: "getBidPblancListInfoChgHstryThng",
    cnstwk: "getBidPblancListInfoChgHstryCnstwk",
    servc: "getBidPblancListInfoChgHstryServc",
  } as Partial<Record<BidKind, string>>,
};

// 사전규격정보서비스 (접두 Thng은 '물품'이 아니라 접두어의 일부)
export const PRESPEC_OPS = {
  list: (k: BidKind) => `getPublicPrcureThngInfo${SUFFIX[k]}`,
  search: (k: BidKind) => `getPublicPrcureThngInfo${SUFFIX[k]}PPSSrch`,
  opinions: (k: BidKind) => `getPublicPrcureThngOpinionInfo${SUFFIX[k]}`,
};

// 낙찰정보서비스
export const AWARD_OPS = {
  list: (k: BidKind) => `getScsbidListSttus${SUFFIX[k]}`,
  search: (k: BidKind) => `getScsbidListSttus${SUFFIX[k]}PPSSrch`,
};

// ── 응답 정규화 ───────────────────────────────────────────────────
export interface G2bResult {
  items: Record<string, unknown>[];
  totalCount: number;
  resultCode: string;
  resultMsg: string;
}

/** data.go.kr 공통 호출. type=json 고정. */
export async function g2bCall(
  env: Env,
  service: keyof typeof SERVICES,
  operation: string,
  params: Record<string, string | number | undefined>,
): Promise<G2bResult> {
  const url = new URL(`${SERVICES[service]}/${operation}`);
  url.searchParams.set("serviceKey", env.DATA_GO_KR_KEY);
  url.searchParams.set("type", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "kr-public-mcp/0.1" },
  });
  if (!res.ok) throw new Error(`G2B HTTP ${res.status} (${operation})`);

  const text = await res.text();
  let json: G2bResponse;
  try {
    json = JSON.parse(text) as G2bResponse;
  } catch {
    // XML로 떨어지는 장애 케이스 방어
    throw new Error(`G2B JSON 파싱 실패 (${operation}): ${text.slice(0, 200)}`);
  }

  const header = json.response?.header ?? { resultCode: "99", resultMsg: "no header" };
  const body = json.response?.body;
  // items는 서비스마다 [item...] 직접 배열 또는 {item: [...]} 중첩 두 형태로 온다.
  const raw = body?.items;
  const rawItems = Array.isArray(raw) ? raw : raw?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  // 공무원 성명·연락처·이메일은 저장 금지 (계획서 ToS 검토). 적재 전에 제거.
  return {
    items: (items as Record<string, unknown>[]).map(stripPersonal),
    totalCount: Number(body?.totalCount ?? items.length),
    resultCode: String(header.resultCode),
    resultMsg: String(header.resultMsg ?? ""),
  };
}

// 담당자 개인정보 필드 제거: *Ofcl*(공무원), *exctv*(담당자), mkr*(작성자), *Tel*, *Email*
const PERSONAL_KEY = /ofcl|exctv|mkr|telno|tel_|_tel|email/i;
export function stripPersonal(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (!PERSONAL_KEY.test(k)) out[k] = v;
  }
  return out;
}

interface G2bResponse {
  response?: {
    header?: { resultCode?: string | number; resultMsg?: string };
    body?: {
      items?:
        | Record<string, unknown>[]
        | { item?: Record<string, unknown> | Record<string, unknown>[] };
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
  };
}

/** 조회 기간 파라미터. data.go.kr는 YYYYMMDDHHMM 형식. */
export function toG2bDt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    String(d.getUTCFullYear()) +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes())
  );
}

/** inqryDiv는 서비스·조회 종류마다 의미가 다르다. 수집은 모두 '등록/게시일시' 기준. */
export const INQRY_DIV = {
  bidByNoticeDate: "1",    // 입찰공고: 공고게시일시
  bidByNoticeNo: "2",      // 입찰공고: 공고번호 단건
  prespecByRegist: "1",    // 사전규격: 등록일시
  prespecByChange: "3",    // 사전규격: 변경일시
  prespecByNo: "2",        // 사전규격: 등록번호
  awardByOpen: "3",        // 낙찰 기본판: 개찰일시
  awardByNoticeDate: "2",  // 낙찰 기본판: 공고게시일시
} as const;
