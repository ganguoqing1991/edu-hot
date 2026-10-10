// 只做一件事：确认「方舟 key + 某个模型名」能不能当站点 LLM 用。
// 站点需要的能力：OpenAI 兼容 /chat/completions + JSON 模式。
// 不打印任何密钥；只打印可用/不可用与报错摘要。
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function keyFromArkCli() {
  try {
    const txt = readFileSync(join(homedir(), ".arkcli", ".env"), "utf8");
    const m = /^VOLCENGINE_ARK_API_KEY=(.+)$/m.exec(txt);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const KEY = process.env.ARK_API_KEY_PROBE || keyFromArkCli();
if (!KEY) {
  console.log("✗ 没读到 VOLCENGINE_ARK_API_KEY");
  process.exit(1);
}
console.log(`key 已读到：长度 ${KEY.length}，前 4 位 ${KEY.slice(0, 4)}…（值不打印）`);

const BASE = process.env.ARK_BASE || "https://ark.cn-beijing.volces.com/api/v3";
const CANDIDATES = (process.env.ARK_MODELS || [
  "doubao-seed-evolving-latest-version",
  "doubao-seed-1-6-250615",
  "doubao-pro-32k",
  "doubao-1-5-pro-32k-250115",
].join(",")).split(",");

async function probe(model) {
  const extra = process.env.ARK_EXTRA ? JSON.parse(process.env.ARK_EXTRA) : {};
  const body = {
    model,
    messages: [
      { role: "system", content: '只输出 JSON：{"ok":true,"category":"teaching"}' },
      { role: "user", content: "测试" },
    ],
    max_tokens: 64,
    temperature: 0,
    response_format: { type: "json_object" },
    ...extra,
  };
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await r.text();
    const ms = Date.now() - t0;
    if (!r.ok) {
      let msg = text.slice(0, 220);
      try {
        msg = JSON.parse(text).error?.message ?? msg;
      } catch {}
      return { model, ok: false, ms, detail: `HTTP ${r.status} · ${msg}` };
    }
    const j = JSON.parse(text);
    const out = j.choices?.[0]?.message?.content ?? "";
    const usage = j.usage ? `${j.usage.prompt_tokens}+${j.usage.completion_tokens}` : "?";
    return { model, ok: true, ms, detail: `JSON 模式可用 · tokens ${usage} · 回包 ${out.slice(0, 60)}` };
  } catch (e) {
    return { model, ok: false, ms: Date.now() - t0, detail: `请求失败：${e.message}` };
  }
}

console.log(`\n端点：${BASE}\n`);
for (const m of CANDIDATES) {
  const r = await probe(m.trim());
  console.log(`${r.ok ? "✓" : "✗"} ${r.model.padEnd(38)} ${String(r.ms).padStart(6)}ms  ${r.detail}`);
}
