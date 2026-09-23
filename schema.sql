-- kr-public-mcp D1 스키마
-- 수집 데이터는 공공데이터(조달청)로 개인정보가 아니다.
-- 사용자 데이터는 watches 테이블의 이메일·조건뿐이다 (처리방침 명시 대상).

-- 입찰공고
CREATE TABLE IF NOT EXISTS bids (
  bid_ntce_no TEXT NOT NULL,
  bid_ntce_ord TEXT NOT NULL DEFAULT '000',
  kind TEXT NOT NULL,                    -- cnstwk|servc|thng|frgcpt
  bid_ntce_nm TEXT,
  ntce_instt_nm TEXT,                    -- 공고기관
  dminstt_nm TEXT,                       -- 수요기관
  bid_ntce_dt TEXT,                      -- 공고일시 (원문 형식 유지)
  bid_clse_dt TEXT,                      -- 입찰마감일시
  openg_dt TEXT,                         -- 개찰일시
  presmpt_prce INTEGER,                  -- 추정가격
  bssamt INTEGER,                        -- 기초금액 (상세 조회로 보강)
  bid_methd_nm TEXT,
  cntrct_cncls_mthd_nm TEXT,             -- 계약체결방법
  bid_prtcpt_lmt_yn TEXT,
  prtcpt_lmt_rgn_nm TEXT,                -- 참가제한지역
  bid_ntce_dtl_url TEXT,                 -- 나라장터 원문 링크
  detail_json TEXT,                      -- get_bid_detail lazy 캐시 (면허제한·참가지역·변경이력·첨부)
  detail_fetched_at TEXT,
  raw_json TEXT,                         -- 원천 응답 박제 (필드 매핑 변경 대비)
  collected_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bid_ntce_no, bid_ntce_ord)
);
CREATE INDEX IF NOT EXISTS idx_bids_clse ON bids(bid_clse_dt);
CREATE INDEX IF NOT EXISTS idx_bids_kind ON bids(kind);
CREATE INDEX IF NOT EXISTS idx_bids_ntce_dt ON bids(bid_ntce_dt);

-- 사전규격
CREATE TABLE IF NOT EXISTS pre_specs (
  spec_regist_no TEXT PRIMARY KEY,       -- bfSpecRgstNo
  kind TEXT,
  product_name TEXT,                     -- 품명/사업명
  order_instt_nm TEXT,                   -- 발주기관
  rl_dminstt_nm TEXT,                    -- 실수요기관
  asign_bdgt_amt INTEGER,                -- 배정예산액
  rgst_dt TEXT,                          -- 등록일시
  chg_dt TEXT,                           -- 변경일시
  opnin_rgst_clse_dt TEXT,               -- 의견등록마감일시
  ref_no TEXT,
  sw_biz_obj_yn TEXT,
  bid_ntce_no TEXT,                      -- 연결된 본공고 (있으면)
  raw_json TEXT,
  collected_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prespec_rgst ON pre_specs(rgst_dt);
CREATE INDEX IF NOT EXISTS idx_prespec_kind ON pre_specs(kind);

-- 낙찰 이력 (3단계 analyze_history용, 수집은 2단계부터)
CREATE TABLE IF NOT EXISTS awards (
  bid_ntce_no TEXT NOT NULL,
  bid_ntce_ord TEXT NOT NULL DEFAULT '000',
  kind TEXT,
  bid_ntce_nm TEXT,
  ntce_instt_nm TEXT,
  dminstt_nm TEXT,
  bidwinnr_nm TEXT,                      -- 낙찰업체명
  sucsfbid_amt INTEGER,                  -- 낙찰금액
  sucsfbid_rate REAL,                    -- 낙찰률
  prtcpt_cnum INTEGER,                   -- 참가업체수
  bssamt INTEGER,
  openg_dt TEXT,
  fnl_sucsf_date TEXT,
  raw_json TEXT,
  collected_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bid_ntce_no, bid_ntce_ord)
);
CREATE INDEX IF NOT EXISTS idx_awards_instt ON awards(ntce_instt_nm);
CREATE INDEX IF NOT EXISTS idx_awards_openg ON awards(openg_dt);

-- 알림 조건 (사용자 데이터 — 이메일은 개인정보, 처리방침 대상)
CREATE TABLE IF NOT EXISTS watches (
  watch_id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL,
  email TEXT NOT NULL,
  label TEXT,                            -- 사용자 지정 조건 이름
  conditions_json TEXT NOT NULL,         -- search_bids와 같은 필터
  created_at TEXT DEFAULT (datetime('now')),
  last_notified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_watches_key ON watches(license_key);

-- 무료 사용자 레이트리밋 (IP 일일 카운터) + Pro 사용량 집계
CREATE TABLE IF NOT EXISTS usage (
  bucket TEXT NOT NULL,                  -- 'free:<ip>:<yyyymmdd>' | 'pro:<key>:<yyyymmdd>'
  cnt INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket)
);
