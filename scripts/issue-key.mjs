#!/usr/bin/env node
// 라이선스 키 수동 발급 — 크몽 주문 확인 후 실행.
// 사용법:
//   node scripts/issue-key.mjs --tier basic --days 30 --label kmong-12345
//   node scripts/issue-key.mjs --revoke njp_xxx        (키 폐기)
// 출력된 키를 구매자에게 발송한다. KV에는 등급·만료일만 저장되고 이메일은 남지 않는다.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const KV = "LICENSES";

if (args[0] === "--revoke") {
  const key = args[1];
  if (!key) fail("폐기할 키를 지정하세요: --revoke njp_xxx");
  execFileSync("npx", ["wrangler", "kv", "key", "delete", `lic:${key}`, "--binding", KV, "--remote"], { stdio: "inherit" });
  console.log(`폐기 완료: ${key}`);
  process.exit(0);
}

const tier = opt("tier");
const days = Number(opt("days") ?? "30");
const label = opt("label") ?? "";

const TIERS = { basic: 30, standard: 90, premium: 30 }; // 패키지 기본 기간(일) — premium은 1개월/키3개
if (!tier || !(tier in TIERS)) fail(`--tier는 ${Object.keys(TIERS).join("|")} 중 하나`);

const key = `njp_${tier}_${randomBytes(12).toString("base64url")}`;
const exp = new Date(Date.now() + (days || TIERS[tier]) * 86_400_000).toISOString().slice(0, 10);
const record = JSON.stringify({ tier, exp, label });

execFileSync(
  "npx",
  ["wrangler", "kv", "key", "put", `lic:${key}`, record, "--binding", KV, "--remote"],
  { stdio: "inherit" },
);

console.log("\n발급 완료 — 구매자에게 아래를 발송:");
console.log(`  라이선스 키: ${key}`);
console.log(`  등급: ${tier} / 만료: ${exp}`);
console.log(`  사용법: MCP 연결 시 Authorization: Bearer ${key}`);

function fail(msg) {
  console.error(`오류: ${msg}`);
  process.exit(1);
}
