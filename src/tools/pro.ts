// Pro 도구: search_pre_specs, analyze_history, watch_bids

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { AuthCtx, Env } from "../env";
import { meter, requirePro } from "../lib/auth";
import { searchPrespecs, analyzeAwards } from "../lib/db";
import { KIND_LABEL, type BidKind } from "../lib/g2b";
import { fmtDtKST, fmtWon, dday, sourceFooter, str } from "../lib/fmt";

const KIND_ENUM = z.enum(["cnstwk", "servc", "thng", "frgcpt"]);

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const err = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

export function registerProTools(server: McpServer, env: Env, ctx: AuthCtx) {
  server.registerTool(
    "search_pre_specs",
    {
      description:
        "나라장터 사전규격(발주 전 규격 공개)을 검색한다. 본공고 전 단계라 조기 발굴에 유용하다. " +
        "반환: 사전규격등록번호, 품명, 수요기관, 배정예산, 의견 마감일, 연결된 본공고 번호. Pro 전용.",
      inputSchema: {
        keyword: z.string().optional().describe("품명·사업명 키워드"),
        from_date: z.string().optional().describe("등록일 시작 (YYYY-MM-DD)"),
        to_date: z.string().optional().describe("등록일 끝 (YYYY-MM-DD)"),
        category: KIND_ENUM.optional(),
        agency: z.string().optional().describe("발주기관·수요기관 키워드"),
      },
    },
    async (args) => {
      const gate = requirePro(ctx);
      if (gate) return err(gate);
      const limited = await meter(env, ctx, "search_pre_specs");
      if (limited) return err(limited);

      const rows = await searchPrespecs(env, {
        keyword: args.keyword,
        from_date: args.from_date,
        to_date: args.to_date,
        category: args.category as BidKind | undefined,
        agency: args.agency,
      });

      if (!rows.length) return text("검색 결과가 없습니다." + sourceFooter(env.SOURCE_LABEL));

      const lines = rows.map((r: Record<string, unknown>) =>
        [
          `■ ${r.product_name ?? "-"}`,
          `  등록번호 ${r.spec_regist_no} | ${KIND_LABEL[r.kind as BidKind] ?? r.kind} | ${r.rl_dminstt_nm ?? r.order_instt_nm ?? "-"}`,
          `  배정예산 ${fmtWon(r.asign_bdgt_amt as number)} | 의견마감 ${fmtDtKST(str(r.opnin_rgst_clse_dt))} (${dday(str(r.opnin_rgst_clse_dt))})`,
          r.bid_ntce_no ? `  본공고: ${r.bid_ntce_no}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );

      return text(`사전규격 ${rows.length}건\n\n${lines.join("\n\n")}` + sourceFooter(env.SOURCE_LABEL));
    },
  );

  server.registerTool(
    "analyze_history",
    {
      description:
        "과거 낙찰 결과를 기관·키워드·업무구분으로 집계한다. " +
        "낙찰률 분포(최소·평균·최대), 다빈도 낙찰업체, 평균 참가업체 수, 최근 낙찰 목록을 반환한다. Pro 전용.",
      inputSchema: {
        agency: z.string().optional().describe("공고기관·수요기관 키워드"),
        keyword: z.string().optional().describe("공고명 키워드"),
        category: KIND_ENUM.optional(),
        months: z.number().optional().describe("분석 기간 (개월, 기본 12)"),
      },
    },
    async (args) => {
      const gate = requirePro(ctx);
      if (gate) return err(gate);
      const limited = await meter(env, ctx, "analyze_history");
      if (limited) return err(limited);

      const { stats, topWinners, recent } = await analyzeAwards(env, {
        agency: args.agency,
        keyword: args.keyword,
        category: args.category as BidKind | undefined,
        months: args.months ?? 12,
      });

      const s = stats as Record<string, unknown> | null;
      if (!s?.n) return text("분석할 낙찰 데이터가 없습니다. (낙찰 이력은 매일 수집 중)" + sourceFooter(env.SOURCE_LABEL));

      const winners = (topWinners as Record<string, unknown>[])
        .map((w, i) => `  ${i + 1}. ${w.bidwinnr_nm} (${w.wins}건)`)
        .join("\n");
      const rec = (recent as Record<string, unknown>[])
        .map(
          (r) =>
            `  - ${r.bid_ntce_nm} | ${r.bidwinnr_nm} ${fmtWon(r.sucsf_bid_amt as number)}` +
            ` (낙찰률 ${r.sucsfbid_rate ?? "-"}%, 참가 ${r.prtcpt_cnum ?? "-"}개사) ${fmtDtKST(str(r.openg_dt))}`,
        )
        .join("\n");

      return text(
        [
          `낙찰 분석 (${args.months ?? 12}개월, ${s.n}건)`,
          "",
          `낙찰률: 최소 ${Number(s.min_rate ?? 0).toFixed(2)}% / 평균 ${Number(s.avg_rate ?? 0).toFixed(2)}% / 최대 ${Number(s.max_rate ?? 0).toFixed(2)}%`,
          `평균 참가업체 수: ${Number(s.avg_prtcpt ?? 0).toFixed(1)}개사`,
          "",
          `다빈도 낙찰업체:\n${winners || "  없음"}`,
          "",
          `최근 낙찰:\n${rec || "  없음"}`,
        ].join("\n") + sourceFooter(env.SOURCE_LABEL),
      );
    },
  );

  server.registerTool(
    "watch_bids",
    {
      description:
        "입찰 알림 조건을 관리한다. add로 조건+이메일 저장, list로 조건 확인, remove로 삭제, matches로 최근 매칭 공고 조회. " +
        "저장된 조건은 매일 08:00 KST에 신규 공고와 매칭해 이메일로 보낸다. Pro 전용.",
      inputSchema: {
        action: z.enum(["add", "list", "remove", "matches"]).describe("수행할 작업"),
        watch_id: z.string().optional().describe("remove 시 대상 watch_id"),
        label: z.string().optional().describe("조건 별칭"),
        email: z.string().optional().describe("add 시 알림 받을 이메일"),
        keyword: z.string().optional(),
        category: KIND_ENUM.optional(),
        region: z.string().optional(),
        min_price: z.number().optional(),
        max_price: z.number().optional(),
      },
    },
    async (args) => {
      const gate = requirePro(ctx);
      if (gate) return err(gate);
      const limited = await meter(env, ctx, "watch_bids");
      if (limited) return err(limited);

      const key = ctx.licenseKey!;

      if (args.action === "add") {
        if (!args.email) return err("add에는 email이 필요합니다.");
        const watchId = `w_${crypto.randomUUID().slice(0, 8)}`;
        const conditions = {
          keyword: args.keyword,
          category: args.category,
          region: args.region,
          min_price: args.min_price,
          max_price: args.max_price,
        };
        await env.DB.prepare(
          `INSERT INTO watches (watch_id, license_key, email, label, conditions_json) VALUES (?,?,?,?,?)`,
        ).bind(watchId, key, args.email, args.label ?? null, JSON.stringify(conditions)).run();
        return text(
          `알림 조건을 등록했습니다. watch_id: ${watchId}\n` +
            `매일 08:00 KST에 매칭 결과가 ${args.email}로 발송됩니다.` +
            sourceFooter(env.SOURCE_LABEL),
        );
      }

      if (args.action === "list") {
        const rows = await env.DB.prepare(
          `SELECT watch_id, label, email, conditions_json, created_at FROM watches WHERE license_key = ?`,
        ).bind(key).all();
        if (!rows.results?.length) return text("등록된 알림 조건이 없습니다." + sourceFooter(env.SOURCE_LABEL));
        const lines = rows.results.map((r: Record<string, unknown>) =>
          `- ${r.watch_id} | ${r.label ?? "(이름 없음)"} | ${r.email} | ${r.conditions_json}`,
        );
        return text(`알림 조건 ${rows.results.length}개\n${lines.join("\n")}` + sourceFooter(env.SOURCE_LABEL));
      }

      if (args.action === "remove") {
        if (!args.watch_id) return err("remove에는 watch_id가 필요합니다.");
        await env.DB.prepare(`DELETE FROM watches WHERE watch_id = ? AND license_key = ?`)
          .bind(args.watch_id, key).run();
        return text(`알림 조건 ${args.watch_id}를 삭제했습니다.` + sourceFooter(env.SOURCE_LABEL));
      }

      // matches: 이 라이선스의 조건으로 최근 7일 공고 매칭
      const watches = await env.DB.prepare(
        `SELECT watch_id, label, conditions_json FROM watches WHERE license_key = ?`,
      ).bind(key).all();
      if (!watches.results?.length) return text("등록된 알림 조건이 없습니다." + sourceFooter(env.SOURCE_LABEL));

      const { searchBids } = await import("../lib/db");
      const out: string[] = [];
      for (const w of watches.results as Record<string, unknown>[]) {
        const cond = JSON.parse(String(w.conditions_json));
        const rows = await searchBids(env, { ...cond, from_date: daysAgo(7), limit: 10 });
        out.push(`■ ${w.watch_id} ${w.label ?? ""} → ${rows.length}건 매칭`);
        for (const r of rows as Record<string, unknown>[]) {
          out.push(`  - ${r.bid_ntce_nm} | 마감 ${fmtDtKST(str(r.bid_clse_dt))} (${dday(str(r.bid_clse_dt))})`);
        }
      }
      return text(out.join("\n") + sourceFooter(env.SOURCE_LABEL));
    },
  );
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
