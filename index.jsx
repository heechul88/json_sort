import React, { useEffect, useState } from "react";
import { jsonrepair } from "jsonrepair";

// JSON 정리 도우미 (입력→자동 결과 / CSP‑Safe / No Backend / Tree View with +/-)
// - FIX: 정규식 리터럴을 한 줄 상수로 유지(NEWLINE_RE)하여 Unterminated RegExp 오류 방지
// - NEW: 결과 트리 뷰에서 배열/객체 접기·펼치기 지원 (+/-)
// - KEEP: 입력/결과만 있는 간단 UI, JSON Lines 자동 인식, CSP 친화성 유지

// ---------- 유틸 ----------
const safeParse = (
  txt: string
): { ok: true; value: any } | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(txt) };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
};

const pretty = (val: any, space = 2) => JSON.stringify(val, null, space);

// ⚠️ 반드시 한 줄에 유지 (줄바꿈으로 깨지면 정규식 리터럴 오류 발생)
const NEWLINE_RE = /\r?\n/;

// JSON / JSONL 자동 감지 파서 (CSP‑safe)
const parseSmart = (text: string, useRepair = true) => {
  let t = text;
  if (useRepair) {
    try {
      t = jsonrepair(t);
    } catch {
      /* ignore */
    }
  }
  const direct = safeParse(t);
  if (direct.ok) return direct;

  // JSON Lines (한 줄당 하나의 JSON) 시도
  const lines = t.split(NEWLINE_RE).filter((l) => l.trim().length > 0);
  const arr: any[] = [];
  for (const line of lines) {
    const p = safeParse(line);
    if (!p.ok) return direct; // 하나라도 실패하면 원래 오류 반환
    arr.push(p.value);
  }
  return { ok: true as const, value: arr };
};

// ---------- 스타일 ----------
const section: React.CSSProperties = {
  padding: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
};
const label: React.CSSProperties = { fontWeight: 600, marginBottom: 8 };
const mono: React.CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  margin: "2px 0",
};
const keyStyle: React.CSSProperties = { ...mono, color: "#0ea5e9" } as React.CSSProperties;
const typeStyle: React.CSSProperties = { ...mono, color: "#334155" } as React.CSSProperties;
const primStyle: React.CSSProperties = { ...mono, color: "#111827" } as React.CSSProperties;
const btnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  lineHeight: "20px",
  textAlign: "center",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  background: "#f8fafc",
  cursor: "pointer",
};

const isPrimitive = (v: any) => v === null || typeof v !== "object";
const fmtPrim = (v: any) => (typeof v === "string" ? `"${v}"` : String(v));

// ---------- 트리 뷰 컴포넌트 ----------
function JsonNode({
  value,
  path,
  initiallyCollapsed = false,
}: {
  value: any;
  path: string[];
  initiallyCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(initiallyCollapsed);

  if (Array.isArray(value)) {
    return (
      <div>
        <div style={row}>
          <button
            style={btnStyle}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "expand" : "collapse"}
          >
            {collapsed ? "+" : "−"}
          </button>
          <span style={typeStyle}>[ ] Array({value.length})</span>
        </div>
        {!collapsed && (
          <div style={{ paddingLeft: 16 }}>
            {value.map((item, idx) => (
              <div key={idx} style={row}>
                <span style={keyStyle}>{idx}</span>
                <span>:</span>
                {isPrimitive(item) ? (
                  <span style={primStyle}>{fmtPrim(item)}</span>
                ) : (
                  <JsonNode
                    value={item}
                    path={[...path, String(idx)]}
                    initiallyCollapsed={Array.isArray(item) ? (item as any[]).length > 5 : false}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return (
      <div>
        <div style={row}>
          <button
            style={btnStyle}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "expand" : "collapse"}
          >
            {collapsed ? "+" : "−"}
          </button>
          <span style={typeStyle}>{"{ "}Object{" }"}</span>
        </div>
        {!collapsed && (
          <div style={{ paddingLeft: 16 }}>
            {keys.map((k) => (
              <div key={k} style={row}>
                <span style={keyStyle}>{k}</span>
                <span>:</span>
                {isPrimitive((value as any)[k]) ? (
                  <span style={primStyle}>{fmtPrim((value as any)[k])}</span>
                ) : (
                  <JsonNode
                    value={(value as any)[k]}
                    path={[...path, k]}
                    initiallyCollapsed={Array.isArray((value as any)[k]) ? ((value as any)[k] as any[]).length > 5 : false}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span style={primStyle}>{fmtPrim(value)}</span>;
}

// ---------- 컴포넌트 ----------
export default function App() {
  const [input, setInput] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [resultValue, setResultValue] = useState<any>(null);
  const [showRaw, setShowRaw] = useState<boolean>(false);

  // 입력 변경 → 150ms 디바운스 후 자동 정리
  useEffect(() => {
    const id = setTimeout(() => {
      if (!input.trim()) {
        setOutput("");
        setResultValue(null);
        setError("");
        return;
      }
      const parsed = parseSmart(input, true);
      if (!parsed.ok) {
        setError(`파싱 오류: ${parsed.error}`);
        setOutput("");
        setResultValue(null);
        return;
      }
      setError("");
      setResultValue((parsed as any).value);
      setOutput(pretty((parsed as any).value, 2));
    }, 150);
    return () => clearTimeout(id);
  }, [input]);

  // ---------- Self Tests (콘솔 출력) ----------
  useEffect(() => {
    type TR = { name: string; ok: boolean; detail?: string };
    const results: TR[] = [];
    const t = (name: string, fn: () => boolean) => {
      try {
        results.push({ name, ok: !!fn() });
      } catch (e: any) {
        results.push({ name, ok: false, detail: e?.message || String(e) });
      }
    };

    // 기본 JSON 파싱
    t("parseSmart: JSON object", () => {
      const p = parseSmart('{"x":1}', false);
      return p.ok && (p as any).value.x === 1;
    });

    // JSON Lines 파싱 (LF)
    t("parseSmart: JSONL -> array LF", () => {
      const p = parseSmart(`{"a":1}\n{"a":2}`.replace(/\\n/g, "\n"), false);
      return p.ok && Array.isArray((p as any).value) && (p as any).value[1].a === 2;
    });

    // JSON Lines 파싱 (CRLF)
    t("parseSmart: JSONL -> array CRLF", () => {
      const p = parseSmart(`{"a":1}\r\n{"a":2}`.replace(/\\r\\n/g, "\r\n"), false);
      return p.ok && Array.isArray((p as any).value) && (p as any).value[0].a === 1;
    });

    // jsonrepair 동작 (트레일링 콤마 복구)
    t("parseSmart: repair trailing comma", () => {
      const p = parseSmart('{"a":1,}', true);
      return p.ok && (p as any).value.a === 1;
    });

    // pretty 포맷 확인 (템플릿 리터럴로 개행 안전 처리)
    t("pretty: spacing=2 stable", () => {
      return pretty({ a: 1, b: [1, 2] }, 2).includes(`\n  \"a\": 1`);
    });

    // 오류 표출 케이스
    t("error: invalid JSON surfaces", () => {
      const p = parseSmart('{a:}', false);
      return !p.ok;
    });

    // JSONL에 잘못된 라인 포함 시 실패해야 함
    t("JSONL: one bad line -> fail", () => {
      const bad = `{"ok":true}\n{bad}`.replace(/\\n/g, "\n");
      const p = parseSmart(bad, false);
      return !p.ok;
    });

    // 빈 줄/공백만 있는 줄은 무시
    t("JSONL: ignore blank lines", () => {
      const s = `\n\n{"a":1}\n   \n{"a":2}\n`.replace(/\\n/g, "\n");
      const p = parseSmart(s, false);
      return p.ok && Array.isArray((p as any).value) && (p as any).value.length === 2;
    });

    // NEWLINE_RE 동작 확인(간접)
    t("NEWLINE_RE: split works", () => {
      const parts = "x\r\ny".split(NEWLINE_RE);
      return parts.length === 2 && parts[0] === "x" && parts[1] === "y";
    });

    // 트리 뷰 프리미티브 포맷
    t("Tree: fmtPrim string wraps in quotes", () => {
      return fmtPrim("hi") === '"hi"';
    });

    const pass = results.every((r) => r.ok);
    // eslint-disable-next-line no-console
    console.log("[SelfTests]", pass ? "PASS" : "FAIL", results);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
        JSON 정리 도우미
        <span style={{ color: "#64748b", fontSize: 14 }}> (입력→자동 결과 / 트리)</span>
      </h1>

      <div
        style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", alignItems: "start" }}
      >
        {/* 입력 */}
        <div style={section}>
          <div style={label}>입력</div>
          <textarea
            style={{ ...mono, width: "100%", minHeight: 520, fontSize: 13 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              "여기에 JSON 또는 JSONL(줄당 JSON 한 개) 붙여넣으면 자동으로 결과가 표시됩니다."
            }
          />
        </div>

        {/* 결과 */}
        <div style={section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={label}>결과</div>
            <label style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={showRaw}
                onChange={(e) => setShowRaw(e.target.checked)}
              />
              &nbsp;텍스트 보기
            </label>
          </div>

          {/* 오류 메시지 */}
          {error ? (
            <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{error}</div>
          ) : null}

          {/* 트리 뷰 */}
          <div style={{ maxHeight: 520, overflow: "auto", paddingRight: 4 }}>
            {resultValue === null ? (
              <div style={{ color: "#64748b", fontSize: 12 }}>결과가 여기 표시됩니다.</div>
            ) : (
              <JsonNode
                value={resultValue}
                path={[]}
                initiallyCollapsed={Array.isArray(resultValue) ? (resultValue as any[]).length > 5 : false}
              />
            )}
          </div>

          {/* Raw 텍스트 보기 옵션 */}
          {showRaw && (
            <textarea
              style={{ ...mono, width: "100%", minHeight: 200, fontSize: 13, marginTop: 12 }}
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              placeholder={"자동으로 포맷된 결과가 표시됩니다."}
            />
          )}
        </div>
      </div>

      <div style={{ marginTop: 12, color: "#64748b", fontSize: 12 }}>
        ⓘ 모든 처리는 브라우저에서만 수행됩니다. (CSP‑friendly, no eval). JSON Lines도 자동 인식합니다. 배열/객체는 버튼으로 접고 펼칠 수 있습니다.
      </div>
    </div>
  );
}
