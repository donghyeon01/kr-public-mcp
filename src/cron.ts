// 수집·매칭 크론
// - 매시: 입찰공고 + 사전규격 최근 구간 수집
// - 매일 00:30 UTC: 낙찰 이력 수집
// - 매일 08:00 KST: watch 조건 매칭 → Resend 이메일 (+마감 D-3 알림)

import type { Env } from "./env";
import {
  ALL_KINDS, AWARD_OPS, BID_OPS, INQRY_DIV, PRESPEC_OPS, g2bCall, toG2bDt,
} from "./lib/g2b";
import { upsertAward, upsertBid, upsertPrespec, buildBidWhere } from "./lib/db";
import { sendEmail } from "./lib/email";
import { dday, fmtDtKST, fmtWon } from "./lib/fmt";

/** 최근 hours 시간 구간의 입찰공고·사전규격 수집. 수동 수집 엔드포인트에서도 재사용. */
export async function collectRecent(env: Env, hours: number): Promise<string> {
  const end = new Date();
  const bgn = new Date(end.getTime() - hours * 3_600_000);
  const p = { inqryBgnDt: toG2bDt(bgn), inqryEndDt: toG2bDt(end), numOfRows: 100 };
  const log: string[] = [];

  for (const kind of ALL_KINDS) {
    // 입찰공고
    try {
      const res = await g2bCall(env, "bid", BID_OPS.list(kind), {
        ...p, inqryDiv: INQRY_DIV.bidByNoticeDate, pageNo: 1,
      });
      for (const it of res.items) await upsertBid(env, kind, it);
      log.push(`bid/${kind}: ${res.items.length}`);
    } catch (e) {
      log.push(`bid/${kind} FAIL: ${String(e).slice(0, 120)}`);
    }
    // 사전규격
    try {
      const res = await g2bCall(env, "prespec", PRESPEC_OPS.list(kind), {
        ...p, inqryDiv: INQRY_DIV.prespecByRegist, pageNo: 1,
      });
      for (const it of res.items) await upsertPrespec(env, kind, it);
      log.push(`prespec/${kind}: ${res.items.length}`);
    } catch (e) {
      log.push(`prespec/${kind} FAIL: ${String(e).slice(0, 120)}`);
    }
  }
  return log.join("; ");
}

/** 최근 days 일치 낙찰 이력 수집. */
export async function collectAwards(env: Env, days: number): Promise<string> {
  const end = new Date();
  const bgn = new Date(end.getTime() - days * 86_400_000);
  const log: string[] = [];
  for (const kind of ALL_KINDS) {
    try {
      const res = await g2bCall(env, "award", AWARD_OPS.list(kind), {
        inqryDiv: INQRY_DIV.awardByOpen,
        inqryBgnDt: toG2bDt(bgn),
        inqryEndDt: toG2bDt(end),
        numOfRows: 100,
        pageNo: 1,
      });
      for (const it of res.items) await upsertAward(env, kind, it);
      log.push(`award/${kind}: ${res.items.length}`);
    } catch (e) {
      log.push(`award/${kind} FAIL: ${String(e).slice(0, 120)}`);
    }
  }
  return log.join("; ");
}

interface WatchRow {
  watch_id: string;
  email: string;
  label: string | null;
  conditions_json: string;
}

/** 08:00 KST — 저장 조건과 신규 공고(최근 26h) 매칭 + 마감 D-3 알림. */
export async function runNotifications(env: Env): Promise<string> {
  const watches = await env.DB.prepare(
    `SELECT watch_id, email, label, conditions_json FROM watches`,
  ).all<WatchRow>();
  if (!watches.results?.length) return "no watches";

  const since = new Date(Date.now() - 26 * 3_600_000).toISOString();
  let sent = 0;

  for (const w of watches.results) {
    const cond = JSON.parse(w.conditions_json) as Record<string, unknown>;
    const { where, args } = buildBidWhere({
      keyword: cond.keyword as string | undefined,
      category: cond.category as never,
      region: cond.region as string | undefined,
      min_price: cond.min_price as number | undefined,
      max_price: cond.max_price as number | undefined,
    });
    const extra = where ? `${where} AND collected_at >= ?` : `WHERE collected_at >= ?`;
    const rows = await env.DB.prepare(
      `SELECT bid_ntce_no, bid_ntce_nm, dminstt_nm, ntce_instt_nm, presmpt_prce,
              bid_clse_dt, bid_ntce_dtl_url
       FROM bids ${extra} ORDER BY bid_clse_dt ASC LIMIT 30`,
    ).bind(...args, since).all();

    // 마감 D-3 이내 공고도 같은 조건으로 표시
    const d3 = await env.DB.prepare(
      `SELECT bid_ntce_no, bid_ntce_nm, bid_clse_dt, bid_ntce_dtl_url
       FROM bids ${where ? where + " AND" : "WHERE"}
         bid_clse_dt >= datetime('now') AND bid_clse_dt <= datetime('now', '+3 days')
       ORDER BY bid_clse_dt ASC LIMIT 30`,
    ).bind(...args).all();

    const newItems = (rows.results ?? []) as Record<string, unknown>[];
    const d3Items = (d3.results ?? []) as Record<string, unknown>[];
    if (!newItems.length && !d3Items.length) continue;

    const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const li = (r: Record<string, unknown>, showDday = true) =>
      `<li><b>${esc(r.bid_ntce_nm)}</b><br>` +
      `${esc(r.dminstt_nm ?? r.ntce_instt_nm)} | 추정가 ${fmtWon(r.presmpt_prce as number)}` +
      ` | 마감 ${fmtDtKST(String(r.bid_clse_dt ?? ""))} ${showDday ? `(${dday(String(r.bid_clse_dt))})` : ""}` +
      `<br><a href="${esc(r.bid_ntce_dtl_url)}">나라장터 원문</a></li>`;

    const html = [
      `<h2>입찰 알림 — ${esc(w.label ?? w.watch_id)}</h2>`,
      newItems.length ? `<h3>신규 공고 ${newItems.length}건</h3><ul>${newItems.map((r) => li(r)).join("")}</ul>` : "",
      d3Items.length ? `<h3>마감 임박 (D-3 이내)</h3><ul>${d3Items.map((r) => li(r)).join("")}</ul>` : "",
      `<p style="color:#888">출처: ${esc(env.SOURCE_LABEL)} · 나라장터 입찰 MCP</p>`,
    ].join("");

    const ok = await sendEmail(
      env, w.email,
      `[입찰알림] ${w.label ?? w.watch_id} — 신규 ${newItems.length}건 / 마감임박 ${d3Items.length}건`,
      html,
    );
    if (ok) {
      sent++;
      await env.DB.prepare(`UPDATE watches SET last_notified_at = datetime('now') WHERE watch_id = ?`)
        .bind(w.watch_id).run();
    }
  }
  return `watches=${watches.results.length} sent=${sent}`;
}

/** 수집 실패 시 운영자 알림 (계획서 리스크 대응). */
export async function alertFailures(env: Env, log: string) {
  if (!log.includes("FAIL") || !env.ADMIN_EMAIL) return;
  await sendEmail(env, env.ADMIN_EMAIL, "[kr-public-mcp] 수집 실패 발생", `<pre>${log}</pre>`);
}
