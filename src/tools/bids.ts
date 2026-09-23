// 무료 도구: search_bids, get_bid_detail

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { AuthCtx, Env } from "../env";
import { meter } from "../lib/auth";
import { searchBids, getBid, saveBidDetail } from "../lib/db";
import { g2bCall, BID_OPS, KIND_LABEL, type BidKind } from "../lib/g2b";
import { fmtDtKST, fmtWon, dday, sourceFooter, str, num } from "../lib/fmt";

const KIND_ENUM = z.enum(["cnstwk", "servc", "thng", "frgcpt"]);

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const err = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

export function registerBidTools(server: McpServer, env: Env, ctx: AuthCtx) {
  server.registerTool(
    "search_bids",
    {
      description:
        "나라장터 입찰공고를 검색한다. 공고명·기관 키워드, 기간, 업무구분(공사/용역/물품/외자), 지역, 추정가격 범위로 필터링. " +
        "수집된 공고만 검색된다(수집은 매시간). 반환: 공고번호, 공고명, 수요기관, 추정가격, 입찰마감일시, D-day, 원문 링크.",
      inputSchema: {
        keyword: z.string().optional().describe("공고명·공고기관·수요기관 키워드"),
        from_date: z.string().optional().describe("공고일 시작 (YYYY-MM-DD)"),
        to_date: z.string().optional().describe("공고일 끝 (YYYY-MM-DD)"),
        category: KIND_ENUM.optional().describe("cnstwk=공사, servc=용역, thng=물품, frgcpt=외자"),
        region: z.string().optional().describe("참가제한지역 키워드 (예: 서울, 경기)"),
        min_price: z.number().optional().describe("추정가격 하한 (원)"),
        max_price: z.number().optional().describe("추정가격 상한 (원)"),
        limit: z.number().optional().describe("최대 건수 (기본 20, 최대 100)"),
      },
    },
    async (args) => {
      const limited = await meter(env, ctx, "search_bids");
      if (limited) return err(limited);

      const rows = await searchBids(env, {
        keyword: args.keyword,
        from_date: args.from_date,
        to_date: args.to_date,
        category: args.category as BidKind | undefined,
        region: args.region,
        min_price: args.min_price,
        max_price: args.max_price,
        limit: args.limit,
      });

      if (!rows.length) {
        return text("검색 결과가 없습니다." + sourceFooter(env.SOURCE_LABEL));
      }

      const lines = rows.map((r: Record<string, unknown>) => {
        const agency = str(r.dminstt_nm) ?? str(r.ntce_instt_nm) ?? "-";
        return [
          `■ ${r.bid_ntce_nm ?? "-"}`,
          `  공고번호 ${r.bid_ntce_no}-${r.bid_ntce_ord} | ${KIND_LABEL[r.kind as BidKind] ?? r.kind} | ${agency}`,
          `  추정가격 ${fmtWon(r.presmpt_prce as number)} | 마감 ${fmtDtKST(str(r.bid_clse_dt))} (${dday(str(r.bid_clse_dt))})`,
          `  원문: ${r.bid_ntce_dtl_url ?? "-"}`,
        ].join("\n");
      });

      return text(
        `입찰공고 ${rows.length}건\n\n${lines.join("\n\n")}` + sourceFooter(env.SOURCE_LABEL),
      );
    },
  );

  server.registerTool(
    "get_bid_detail",
    {
      description:
        "입찰공고 상세 조회. 자격요건(면허·참가가능지역), 일정(공고·개찰·마감), 기초금액·추정가격, 계약방법, 첨부파일 링크, 변경 이력을 반환한다. " +
        "search_bids 결과의 공고번호를 넣으면 된다.",
      inputSchema: {
        bid_no: z.string().describe("입찰공고번호 (예: 20260912345)"),
        bid_seq: z.string().optional().describe("공고차수 (기본 000)"),
      },
    },
    async (args) => {
      const limited = await meter(env, ctx, "get_bid_detail");
      if (limited) return err(limited);

      const ord = args.bid_seq ?? "000";
      let row = await getBid(env, args.bid_no, ord);

      // D1에 없으면 API 단건 조회 시도
      if (!row) {
        for (const kind of ["cnstwk", "servc", "thng", "frgcpt"] as BidKind[]) {
          const res = await g2bCall(env, "bid", BID_OPS.list(kind), {
            inqryDiv: "2",
            bidNtceNo: args.bid_no,
            numOfRows: 10,
            pageNo: 1,
          }).catch(() => null);
          if (res?.items.length) {
            const { upsertBid } = await import("../lib/db");
            await upsertBid(env, kind, res.items[0]);
            row = await getBid(env, args.bid_no, str(res.items[0].bidNtceOrd) ?? ord);
            break;
          }
        }
      }
      if (!row) return err(`공고번호 ${args.bid_no}를 찾을 수 없습니다.`);

      // 상세 보강: 캐시 없으면 API로 가져와 D1에 저장
      let detail: Record<string, unknown> = {};
      if (row.detail_json) {
        detail = JSON.parse(String(row.detail_json));
      } else {
        const kind = row.kind as BidKind;
        const [license, region, basis, changes] = await Promise.all([
          g2bCall(env, "bid", BID_OPS.licenseLimit, {
            inqryDiv: "2", bidNtceNo: args.bid_no, bidNtceOrd: ord, numOfRows: 50, pageNo: 1,
          }).catch(() => null),
          g2bCall(env, "bid", BID_OPS.regionLimit, {
            inqryDiv: "2", bidNtceNo: args.bid_no, bidNtceOrd: ord, numOfRows: 50, pageNo: 1,
          }).catch(() => null),
          BID_OPS.basisAmount[kind]
            ? g2bCall(env, "bid", BID_OPS.basisAmount[kind]!, {
                inqryDiv: "2", bidNtceNo: args.bid_no, bidNtceOrd: ord, numOfRows: 10, pageNo: 1,
              }).catch(() => null)
            : null,
          BID_OPS.changeHistory[kind]
            ? g2bCall(env, "bid", BID_OPS.changeHistory[kind]!, {
                inqryDiv: "2", bidNtceNo: args.bid_no, bidNtceOrd: ord, numOfRows: 50, pageNo: 1,
              }).catch(() => null)
            : null,
        ]);

        detail = {
          licenseLimits: license?.items ?? [],
          regions: region?.items ?? [],
          basis: basis?.items?.[0] ?? null,
          changes: changes?.items ?? [],
          // 공고 규격첨부는 목록 응답의 ntceSpec* 필드에서 추출
          attachments: extractAttachments(row),
        };
        await saveBidDetail(
          env, args.bid_no, String(row.bid_ntce_ord ?? ord), detail,
          num(detail.basis ? (detail.basis as Record<string, unknown>).bssamt : undefined),
        );
      }

      const lic = (detail.licenseLimits as Record<string, unknown>[] | undefined) ?? [];
      const rgn = (detail.regions as Record<string, unknown>[] | undefined) ?? [];
      const chg = (detail.changes as Record<string, unknown>[] | undefined) ?? [];
      const att = (detail.attachments as { fileNm: string; fileUrl: string }[] | undefined) ?? [];
      const basis = detail.basis as Record<string, unknown> | null;

      const sections = [
        `■ ${row.bid_ntce_nm}`,
        `공고번호 ${row.bid_ntce_no}-${row.bid_ntce_ord} | ${KIND_LABEL[row.kind as BidKind] ?? row.kind}`,
        "",
        `[기관] 공고 ${row.ntce_instt_nm ?? "-"} / 수요 ${row.dminstt_nm ?? "-"}`,
        `[금액] 추정가격 ${fmtWon(row.presmpt_prce as number)}` +
          (basis?.bssamt || row.bssamt ? ` | 기초금액 ${fmtWon(num(basis?.bssamt) ?? (row.bssamt as number))}` : ""),
        `[일정] 공고 ${fmtDtKST(str(row.bid_ntce_dt))} → 마감 ${fmtDtKST(str(row.bid_clse_dt))} (${dday(str(row.bid_clse_dt))})` +
          (row.openg_dt ? ` → 개찰 ${fmtDtKST(str(row.openg_dt))}` : ""),
        `[방식] 입찰 ${row.bid_methd_nm ?? "-"} | 계약 ${row.cntrct_cncls_mthd_nm ?? "-"}`,
        "",
        `[자격요건]`,
        lic.length
          ? lic.map((l) => `  - ${l.lcnsLmtNm ?? JSON.stringify(l)}`).join("\n")
          : `  - ${row.bid_prtcpt_lmt_yn === "Y" ? "투찰제한 있음" : "제한 없음 또는 미수집"}`,
        rgn.length
          ? `  참가가능지역: ${rgn.map((x) => x.prtcptPsblRgnNm).filter(Boolean).join(", ")}`
          : row.prtcpt_lmt_rgn_nm
            ? `  참가제한지역: ${row.prtcpt_lmt_rgn_nm}`
            : "",
        "",
        chg.length ? `[변경이력]\n${chg.map((c) => `  - ${c.chgDt ?? ""} ${c.chgItemNm ?? ""}: ${c.bfchgVal ?? ""} → ${c.afchgVal ?? ""}`).join("\n")}` : "[변경이력] 없음",
        "",
        att.length ? `[첨부]\n${att.map((a) => `  - ${a.fileNm}: ${a.fileUrl}`).join("\n")}` : "[첨부] 목록 응답에 없음",
        "",
        `원문: ${row.bid_ntce_dtl_url ?? "-"}`,
      ];

      return text(sections.filter(Boolean).join("\n") + sourceFooter(env.SOURCE_LABEL));
    },
  );
}

/** 목록 응답 raw_json의 ntceSpecFileNm/DocUrl 1~10 쌍 → 첨부 목록. */
function extractAttachments(row: Record<string, unknown>) {
  const raw = row.raw_json ? (JSON.parse(String(row.raw_json)) as Record<string, unknown>) : row;
  const out: { fileNm: string; fileUrl: string; docDivNm: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const url = raw[`ntceSpecDocUrl${i}`];
    const name = raw[`ntceSpecFileNm${i}`];
    if (url) out.push({ fileNm: String(name ?? `규격서${i}`), fileUrl: String(url), docDivNm: "공고규격서" });
  }
  return out;
}
