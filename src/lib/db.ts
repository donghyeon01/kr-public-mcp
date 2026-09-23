// D1 적재·조회. g2b.ts의 원천 필드명 ↔ DB 컬럼 변환도 여기서만 한다.

import type { Env } from "../env";
import type { BidKind } from "./g2b";
import { num, str } from "./fmt";

// ── 적재 ─────────────────────────────────────────────────────────

export async function upsertBid(env: Env, kind: BidKind, it: Record<string, unknown>) {
  await env.DB.prepare(
    `INSERT INTO bids (
      bid_ntce_no, bid_ntce_ord, kind, bid_ntce_nm, ntce_instt_nm, dminstt_nm,
      bid_ntce_dt, bid_clse_dt, openg_dt, presmpt_prce, bid_methd_nm,
      cntrct_cncls_mthd_nm, bid_prtcpt_lmt_yn, prtcpt_lmt_rgn_nm, bid_ntce_dtl_url,
      raw_json, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT (bid_ntce_no, bid_ntce_ord) DO UPDATE SET
      kind=excluded.kind, bid_ntce_nm=excluded.bid_ntce_nm,
      ntce_instt_nm=excluded.ntce_instt_nm, dminstt_nm=excluded.dminstt_nm,
      bid_ntce_dt=excluded.bid_ntce_dt, bid_clse_dt=excluded.bid_clse_dt,
      openg_dt=excluded.openg_dt, presmpt_prce=excluded.presmpt_prce,
      bid_methd_nm=excluded.bid_methd_nm,
      cntrct_cncls_mthd_nm=excluded.cntrct_cncls_mthd_nm,
      bid_prtcpt_lmt_yn=excluded.bid_prtcpt_lmt_yn,
      prtcpt_lmt_rgn_nm=excluded.prtcpt_lmt_rgn_nm,
      bid_ntce_dtl_url=excluded.bid_ntce_dtl_url,
      raw_json=excluded.raw_json, updated_at=datetime('now')`,
  ).bind(
    str(it.bidNtceNo) ?? "",
    str(it.bidNtceOrd) ?? "000",
    kind,
    str(it.bidNtceNm),
    str(it.ntceInsttNm),
    str(it.dminsttNm),
    str(it.bidNtceDt),
    str(it.bidClseDt),
    str(it.opengDt),
    num(it.presmptPrce) ?? null,
    str(it.bidMethdNm),
    str(it.cntrctCnclsMthdNm),
    str(it.bidPrtcptLmtYn),
    str(it.prtcptLmtRgnNm),
    str(it.bidNtceDtlUrl),
    JSON.stringify(it),
  ).run();
}

export async function upsertPrespec(env: Env, kind: BidKind, it: Record<string, unknown>) {
  await env.DB.prepare(
    `INSERT INTO pre_specs (
      spec_regist_no, kind, product_name, order_instt_nm, rl_dminstt_nm,
      asign_bdgt_amt, rgst_dt, chg_dt, opnin_rgst_clse_dt, ref_no,
      sw_biz_obj_yn, bid_ntce_no, raw_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (spec_regist_no) DO UPDATE SET
      kind=excluded.kind, product_name=excluded.product_name,
      order_instt_nm=excluded.order_instt_nm, rl_dminstt_nm=excluded.rl_dminstt_nm,
      asign_bdgt_amt=excluded.asign_bdgt_amt, rgst_dt=excluded.rgst_dt,
      chg_dt=excluded.chg_dt, opnin_rgst_clse_dt=excluded.opnin_rgst_clse_dt,
      ref_no=excluded.ref_no, sw_biz_obj_yn=excluded.sw_biz_obj_yn,
      bid_ntce_no=excluded.bid_ntce_no, raw_json=excluded.raw_json`,
  ).bind(
    str(it.bfSpecRgstNo) ?? "",
    kind,
    str(it.prdctClsfcNoNm),
    str(it.orderInsttNm),
    str(it.rlDminsttNm),
    num(it.asignBdgtAmt) ?? null,
    str(it.rgstDt),
    str(it.chgDt),
    str(it.opninRgstClseDt),
    str(it.refNo),
    str(it.swBizObjYn),
    str(it.bidNtceNoList)?.split(",")[0]?.trim() ?? null,
    JSON.stringify(it),
  ).run();
}

export async function upsertAward(env: Env, kind: BidKind, it: Record<string, unknown>) {
  await env.DB.prepare(
    `INSERT INTO awards (
      bid_ntce_no, bid_ntce_ord, kind, bid_ntce_nm, ntce_instt_nm, dminstt_nm,
      bidwinnr_nm, sucsfbid_amt, sucsfbid_rate, prtcpt_cnum, bssamt,
      openg_dt, fnl_sucsf_date, raw_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (bid_ntce_no, bid_ntce_ord) DO UPDATE SET
      kind=excluded.kind, bid_ntce_nm=excluded.bid_ntce_nm,
      ntce_instt_nm=excluded.ntce_instt_nm, dminstt_nm=excluded.dminstt_nm,
      bidwinnr_nm=excluded.bidwinnr_nm, sucsfbid_amt=excluded.sucsfbid_amt,
      sucsfbid_rate=excluded.sucsfbid_rate, prtcpt_cnum=excluded.prtcpt_cnum,
      bssamt=excluded.bssamt, openg_dt=excluded.openg_dt,
      fnl_sucsf_date=excluded.fnl_sucsf_date, raw_json=excluded.raw_json`,
  ).bind(
    str(it.bidNtceNo) ?? "",
    str(it.bidNtceOrd) ?? "000",
    kind,
    str(it.bidNtceNm),
    str(it.ntceInsttNm),
    str(it.dminsttNm),
    str(it.bidwinnrNm),
    num(it.sucsfbidAmt) ?? null,
    num(it.sucsfbidRate) ?? null,
    num(it.prtcptCnum) ?? null,
    num(it.bssamt) ?? null,
    str(it.rlOpengDt) ?? str(it.opengDt),
    str(it.fnlSucsfDate),
    JSON.stringify(it),
  ).run();
}

// ── 조회 ─────────────────────────────────────────────────────────

export interface BidFilter {
  keyword?: string;
  from_date?: string;   // YYYY-MM-DD (공고일 기준)
  to_date?: string;
  category?: BidKind;
  region?: string;
  min_price?: number;
  max_price?: number;
  limit?: number;
}

export function buildBidWhere(f: BidFilter): { where: string; args: unknown[] } {
  const cond: string[] = [];
  const args: unknown[] = [];
  if (f.keyword) {
    cond.push("(bid_ntce_nm LIKE ? OR ntce_instt_nm LIKE ? OR dminstt_nm LIKE ?)");
    const kw = `%${f.keyword}%`;
    args.push(kw, kw, kw);
  }
  if (f.from_date) { cond.push("bid_ntce_dt >= ?"); args.push(f.from_date); }
  if (f.to_date) { cond.push("bid_ntce_dt <= ?"); args.push(`${f.to_date}T23:59`); }
  if (f.category) { cond.push("kind = ?"); args.push(f.category); }
  if (f.region) { cond.push("prtcpt_lmt_rgn_nm LIKE ?"); args.push(`%${f.region}%`); }
  if (f.min_price !== undefined) { cond.push("presmpt_prce >= ?"); args.push(f.min_price); }
  if (f.max_price !== undefined) { cond.push("presmpt_prce <= ?"); args.push(f.max_price); }
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

export async function searchBids(env: Env, f: BidFilter) {
  const { where, args } = buildBidWhere(f);
  const limit = Math.min(Math.max(f.limit ?? 20, 1), 100);
  const rows = await env.DB.prepare(
    `SELECT bid_ntce_no, bid_ntce_ord, kind, bid_ntce_nm, ntce_instt_nm, dminstt_nm,
            bid_ntce_dt, bid_clse_dt, openg_dt, presmpt_prce, bid_ntce_dtl_url
     FROM bids ${where}
     ORDER BY bid_clse_dt ASC LIMIT ?`,
  ).bind(...args, limit).all();
  return rows.results ?? [];
}

export async function getBid(env: Env, no: string, ord = "000") {
  return env.DB.prepare(`SELECT * FROM bids WHERE bid_ntce_no = ? AND bid_ntce_ord = ?`)
    .bind(no, ord).first();
}

export async function saveBidDetail(env: Env, no: string, ord: string, detail: unknown, bssamt?: number | null) {
  await env.DB.prepare(
    `UPDATE bids SET detail_json = ?, detail_fetched_at = datetime('now'),
      bssamt = COALESCE(?, bssamt) WHERE bid_ntce_no = ? AND bid_ntce_ord = ?`,
  ).bind(JSON.stringify(detail), bssamt ?? null, no, ord).run();
}

export interface PrespecFilter {
  keyword?: string;
  from_date?: string;
  to_date?: string;
  category?: BidKind;
  agency?: string;
}

export async function searchPrespecs(env: Env, f: PrespecFilter) {
  const cond: string[] = [];
  const args: unknown[] = [];
  if (f.keyword) { cond.push("product_name LIKE ?"); args.push(`%${f.keyword}%`); }
  if (f.from_date) { cond.push("rgst_dt >= ?"); args.push(f.from_date); }
  if (f.to_date) { cond.push("rgst_dt <= ?"); args.push(`${f.to_date}T23:59`); }
  if (f.category) { cond.push("kind = ?"); args.push(f.category); }
  if (f.agency) {
    cond.push("(order_instt_nm LIKE ? OR rl_dminstt_nm LIKE ?)");
    args.push(`%${f.agency}%`, `%${f.agency}%`);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const rows = await env.DB.prepare(
    `SELECT * FROM pre_specs ${where} ORDER BY rgst_dt DESC LIMIT 50`,
  ).bind(...args).all();
  return rows.results ?? [];
}

export interface AwardFilter {
  agency?: string;
  keyword?: string;
  category?: BidKind;
  months?: number;
}

export async function analyzeAwards(env: Env, f: AwardFilter) {
  const cond: string[] = [];
  const args: unknown[] = [];
  if (f.agency) {
    cond.push("(ntce_instt_nm LIKE ? OR dminstt_nm LIKE ?)");
    args.push(`%${f.agency}%`, `%${f.agency}%`);
  }
  if (f.keyword) { cond.push("bid_ntce_nm LIKE ?"); args.push(`%${f.keyword}%`); }
  if (f.category) { cond.push("kind = ?"); args.push(f.category); }
  if (f.months) { cond.push("openg_dt >= date('now', ?)"); args.push(`-${f.months} months`); }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS n,
            MIN(sucsfbid_rate) AS min_rate,
            MAX(sucsfbid_rate) AS max_rate,
            AVG(sucsfbid_rate) AS avg_rate,
            AVG(prtcpt_cnum) AS avg_prtcpt
     FROM awards ${where}`,
  ).bind(...args).first();

  const topWinners = await env.DB.prepare(
    `SELECT bidwinnr_nm, COUNT(*) AS wins FROM awards ${where}
     GROUP BY bidwinnr_nm ORDER BY wins DESC LIMIT 10`,
  ).bind(...args).all();

  const recent = await env.DB.prepare(
    `SELECT bid_ntce_no, bid_ntce_nm, bidwinnr_nm, sucsfbid_amt, sucsfbid_rate,
            prtcpt_cnum, openg_dt
     FROM awards ${where} ORDER BY openg_dt DESC LIMIT 30`,
  ).bind(...args).all();

  return { stats, topWinners: topWinners.results ?? [], recent: recent.results ?? [] };
}
