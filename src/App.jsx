import React, { useMemo, useRef, useState } from "react";

/** ----------------------------------------
 *  ガラガラ抽選（色玉） React 単一コンポーネント
 *   - 色の指定と数（在庫）を一括設定できる機能
 *   - まとめて抽選のバッチ表示＆色別個数サマリ（新規）
 * ---------------------------------------- */

const PRESET = [
  { hex: "#e74c3c", label: "赤", weight: 1, stock: null },
  { hex: "#3498db", label: "青", weight: 1, stock: null },
  { hex: "#2ecc71", label: "緑", weight: 1, stock: null },
  { hex: "#f1c40f", label: "黄", weight: 1, stock: null },
  { hex: "#ffffff", label: "白", weight: 1, stock: null },
  { hex: "#9b59b6", label: "紫", weight: 1, stock: null },
];

const uid = () => Math.random().toString(36).slice(2, 9);

function useColorsInitial() {
  const init = React.useMemo(() => PRESET.map((c) => ({ id: uid(), ...c })), []);
  const [colors, setColors] = useState(init);
  return [colors, setColors];
}

function weightedPick(list) {
  const total = list.reduce((s, a) => s + (a.weight || 0), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const item of list) {
    r -= item.weight || 0;
    if (r <= 0) return item;
  }
  return list.at(-1) || null;
}

function poolForDraw(colors, { respectStock }) {
  return colors.filter(
    (c) => (c.weight || 0) > 0 && (!respectStock || c.stock === null || c.stock > 0)
  );
}

function dl(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function dateTag() {
  const d = new Date();
  return (
    d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    "_" +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds())
  );
}

/** ---------- 一括設定ヘルパー ---------- */
const HEX_RE = /#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/;
const INT_RE = /(\d+)/;

function normalizeHex(h) {
  if (!h) return null;
  let m = h.trim();
  if (!m.startsWith("#")) m = "#" + m;
  if (m.length === 4) {
    m = "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
  }
  return m.toLowerCase();
}

function parseLineToColor(line) {
  const s = line.trim();
  if (!s) return null;
  const hexMatch = s.match(HEX_RE);
  const intMatch = s.match(INT_RE);
  const hex = hexMatch ? normalizeHex(hexMatch[0]) : null;
  const count = intMatch ? Math.max(0, Math.floor(Number(intMatch[1]) || 0)) : null;

  let label = s
    .replace(HEX_RE, "")
    .replace(/[xX＊*×]/g, " ")
    .replace(INT_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) label = hex || "色";

  if (!hex) return null;
  return { hex, label, stock: count ?? null, weight: 1 };
}

function parseHexList(hexCsv, commonStock) {
  const list = (hexCsv || "")
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const stock =
    commonStock === "" || commonStock === null || commonStock === undefined
      ? null
      : Math.max(0, Math.floor(Number(commonStock) || 0));
  const out = [];
  for (const item of list) {
    const mm = item.match(HEX_RE);
    if (!mm) continue;
    const hex = normalizeHex(mm[0]);
    out.push({
      hex,
      label: hex.toUpperCase(),
      stock,
      weight: 1,
    });
  }
  return out;
}

function generateEvenHues(n, commonStock) {
  const stock =
    commonStock === "" || commonStock === null || commonStock === undefined
      ? null
      : Math.max(0, Math.floor(Number(commonStock) || 0));
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = Math.round((360 * i) / n);
    const s = 70;
    const l = 55;
    const hex = hslToHex(h, s, l);
    out.push({
      hex,
      label: `Color ${i + 1}`,
      stock,
      weight: 1,
    });
  }
  return out;
}
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export default function App() {
  const [colors, setColors] = useColorsInitial();
  const [results, setResults] = useState([]); // 全履歴 {time,label,hex}
  const [drawCount, setDrawCount] = useState(1);
  const [noRepeat, setNoRepeat] = useState(true);
  const [respectStock, setRespectStock] = useState(true);
  const [spin, setSpin] = useState(false);
  const [ball, setBall] = useState({ show: false, hex: "#ffffff", label: "—" });
  const [warn, setWarn] = useState("");
  const fileRef = useRef(null);

  // ★ 新規：直近の「まとめて抽選」バッチ結果
  // batch.items: [{label, hex, time}]（今回分のみ）
  // batch.counts: { key: {label, hex, count} }（色別カウント）
  const [batch, setBatch] = useState({
    time: null,
    items: [],
    counts: {},
    total: 0,
  });

  // 一括設定 UI
  const [bulkText, setBulkText] = useState("赤 #ff0000 5\n青 #0066ff 3\n#00cc66 x2");
  const [hexCsv, setHexCsv] = useState("#ff0000, #00ff00, #0000ff");
  const [commonCount, setCommonCount] = useState("3");
  const [evenCount, setEvenCount] = useState(6);
  const [evenStock, setEvenStock] = useState("2");

  const weightSum = useMemo(
    () => poolForDraw(colors, { respectStock }).reduce((s, a) => s + (a.weight || 0), 0),
    [colors, respectStock]
  );
  const stockSum = useMemo(() => {
    const s = colors.reduce((sum, c) => sum + (c.stock ?? Infinity), 0);
    return s === Infinity ? "∞" : s;
  }, [colors]);

  function updateColor(id, patch) {
    setColors((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeColor(id) {
    setColors((prev) => prev.filter((c) => c.id !== id));
  }
  function addColor({ hex, label, weight, stock }) {
    setColors((prev) => [
      ...prev,
      {
        id: uid(),
        hex,
        label: label?.trim() || hex.toUpperCase(),
        weight: Math.max(0, Math.floor(Number(weight) || 0)),
        stock:
          stock === "" || stock === null || stock === undefined
            ? null
            : Math.max(0, Math.floor(Number(stock) || 0)),
      },
    ]);
  }
  function resetPreset() {
    if (!confirm("初期セットに戻しますか？")) return;
    setColors(PRESET.map((c) => ({ id: uid(), ...c })));
  }

  function pushResult(item) {
    setResults((prev) => [{ time: new Date(), label: item.label, hex: item.hex }, ...prev]);
  }
  function consumeStock(choice) {
    setColors((prev) =>
      prev.map((c) =>
        c.id === choice.id
          ? {
              ...c,
              stock: c.stock === null ? null : c.stock > 0 ? c.stock - 1 : 0,
            }
          : c
      )
    );
  }

  async function animatePick(choice) {
    setWarn("");
    setBall((b) => ({ ...b, show: false, label: "—" }));
    setSpin(true);
    await new Promise((r) => setTimeout(r, 900));
    setSpin(false);
    setBall({ show: true, hex: choice.hex, label: choice.label || choice.hex.toUpperCase() });
  }

  async function drawOnce() {
    const active = poolForDraw(colors, { respectStock });
    if (active.length === 0) {
      setWarn("抽選対象がありません（重み=0 または在庫切れ）");
      return;
    }
    const pick = weightedPick(active);
    if (!pick) {
      setWarn("抽選に失敗しました");
      return;
    }
    await animatePick(pick);
    pushResult(pick);
    if (respectStock) consumeStock(pick);
  }

  // ★ まとめて抽選：今回バッチを分離表示
  async function drawMulti() {
    const n = Math.max(1, Math.floor(Number(drawCount) || 1));
    const snapshot = JSON.parse(JSON.stringify(colors));
    const picks = [];

    for (let i = 0; i < n; i++) {
      let pool = snapshot.filter(
        (c) => (c.weight || 0) > 0 && (!respectStock || c.stock === null || c.stock > 0)
      );
      if (noRepeat) {
        pool = pool.filter((c) => !picks.some((p) => p.id === c.id));
      }
      if (pool.length === 0) {
        setWarn(`要求回数 ${n} 回のうち ${i} 回で停止：対象が足りません（重複なし／在庫制限により）`);
        break;
      }
      const pick = weightedPick(pool);
      if (!pick) break;
      picks.push(pick);
      if (respectStock && pick.stock !== null && pick.stock > 0) {
        const t = snapshot.find((x) => x.id === pick.id);
        if (t) t.stock -= 1;
      }
    }

    if (picks.length > 0) {
      // 演出は最後の一つを表示
      await animatePick(picks[picks.length - 1]);
      // 履歴（結果）には全件追加
      for (const p of picks) {
        pushResult(p);
        if (respectStock) consumeStock(p);
      }
      // ★ 今回バッチの集計を作成
      const now = new Date();
      const items = picks.map((p) => ({ time: now, label: p.label, hex: p.hex }));
      const counts = {};
      for (const p of picks) {
        const key = `${p.label}|${p.hex.toLowerCase()}`;
        if (!counts[key]) counts[key] = { label: p.label, hex: p.hex, count: 0 };
        counts[key].count += 1;
      }
      setBatch({ time: now, items, counts, total: picks.length });
    }
  }

  // バッチのCSV出力（今回分のみ）
  function exportBatchCSV() {
    if (!batch.items.length) {
      setWarn("今回のまとめて抽選のデータがありません");
      return;
    }
    const header = ["timestamp", "label", "hex"];
    const rows = batch.items.map((r) => [
      new Date(batch.time).toISOString(),
      `"${(r.label || "").replace(/"/g, '""')}"`,
      r.hex.toUpperCase(),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    dl(csv, `garagara_batch_${dateTag()}.csv`, "text/csv");
  }

  // UI helper
  const Block = ({ children, className = "" }) => (
    <section
      className={
        "rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl " + className
      }
      style={{ boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}
    >
      {children}
    </section>
  );

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{
        background: "linear-gradient(180deg,#0e1117,#121521 60%,#0b0e14)",
        fontFamily:
          'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
      }}
    >
      <div className="max-w-[1200px] mx-auto p-4 grid md:grid-cols-[380px_1fr] gap-4">
        {/* 左：設定 */}
        <Block>
          <h1 className="text-lg font-semibold mb-1">色リスト・確率・在庫</h1>
          <p className="text-xs text-slate-400 mb-3">
            「重み」は出やすさ（相対値）／「在庫」は残り個数（空なら無制限）
          </p>

          {/* テーブル */}
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-slate-300">
                <tr>
                  <th className="text-left p-2 border-b border-slate-800">色</th>
                  <th className="text-left p-2 border-b border-slate-800">名前</th>
                  <th className="text-left p-2 border-b border-slate-800">重み</th>
                  <th className="text-left p-2 border-b border-slate-800">在庫</th>
                  <th className="text-left p-2 border-b border-slate-800"></th>
                </tr>
              </thead>
              <tbody>
                {colors.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border border-black/30"
                          style={{ background: c.hex }}
                        />
                        <input
                          type="color"
                          value={c.hex}
                          onChange={(e) => updateColor(c.id, { hex: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="p-2">
                      <input
                        className="px-2 py-1 rounded-lg bg-slate-900/70 border border-slate-800 w-full"
                        value={c.label}
                        onChange={(e) => updateColor(c.id, { label: e.target.value })}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        className="px-2 py-1 rounded-lg bg-slate-900/70 border border-slate-800 w-24"
                        value={c.weight}
                        onChange={(e) =>
                          updateColor(c.id, {
                            weight: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        placeholder="∞"
                        className="px-2 py-1 rounded-lg bg-slate-900/70 border border-slate-800 w-24"
                        value={c.stock ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          updateColor(c.id, {
                            stock: v === "" ? null : Math.max(0, Math.floor(Number(v) || 0)),
                          });
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <button
                        className="px-3 py-1 rounded-lg border border-slate-700 hover:bg-slate-800"
                        onClick={() => removeColor(c.id)}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
                {colors.length === 0 && (
                  <tr>
                    <td className="p-2 text-slate-400" colSpan={5}>
                      色がありません。下の「追加」または一括設定から登録してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 追加（1件ずつ） */}
          <div className="flex flex-wrap gap-2 items-center mt-3">
            <input type="color" defaultValue="#ff4d4f" id="addHex" />
            <input
              id="addLabel"
              placeholder="色名（例：赤）"
              className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800"
            />
            <input
              id="addWeight"
              type="number"
              min={0}
              defaultValue={1}
              className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800 w-28"
            />
            <input
              id="addStock"
              type="number"
              min={0}
              placeholder="∞"
              className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800 w-28"
            />
            <button
              className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
              onClick={() => {
                const hex = document.getElementById("addHex").value || "#ffffff";
                const label = document.getElementById("addLabel").value || "";
                const weight = document.getElementById("addWeight").value || "1";
                const stock = document.getElementById("addStock").value || "";
                addColor({ hex, label, weight, stock });
                document.getElementById("addLabel").value = "";
                document.getElementById("addWeight").value = "1";
                document.getElementById("addStock").value = "";
              }}
            >
              追加
            </button>
            <button
              className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
              onClick={resetPreset}
            >
              初期セットに戻す
            </button>
          </div>

          {/* 一括設定 */}
          <h2 className="text-sm text-slate-300 mt-5">一括設定（色の指定と数の設定）</h2>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-400">
              1行1色：例）<code>赤 #ff0000 5</code> / <code>#00ff00 x3</code> / <code>青 8 #0000ff</code>
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="w-full min-h-[96px] px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800"
              placeholder="赤 #ff0000 5&#10;青 #0066ff 3&#10;#00cc66 x2"
            />
            <div className="flex gap-2">
              <button
                className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                onClick={() => {
                  const lines = (bulkText || "").split(/\r?\n/);
                  const out = [];
                  for (const ln of lines) {
                    const c = parseLineToColor(ln);
                    if (c) out.push(c);
                  }
                  if (out.length === 0) {
                    setWarn("有効な行がありませんでした（例：赤 #ff0000 5 / #00ff00 x3）");
                    return;
                  }
                  setColors(out.map((c) => ({ id: uid(), ...c })));
                  setWarn("");
                }}
              >
                この内容で置き換え
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-400">
              例）<code>#ff0000, #00ff00, #0000ff</code>（共通個数を下に）
            </p>
            <input
              value={hexCsv}
              onChange={(e) => setHexCsv(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800"
              placeholder="#ff0000, #00ff00, #0000ff"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300">共通個数</span>
              <input
                value={commonCount}
                onChange={(e) => setCommonCount(e.target.value)}
                type="number"
                min={0}
                placeholder="∞"
                className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800 w-28"
              />
              <button
                className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                onClick={() => {
                  const out = parseHexList(hexCsv, commonCount);
                  if (out.length === 0) {
                    setWarn("HEX が見つかりませんでした（例：#ff0000, #00ff00, #0000ff）");
                    return;
                  }
                  setColors(out.map((c) => ({ id: uid(), ...c })));
                  setWarn("");
                }}
              >
                置き換え
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-400">指定数の色相を均等に配置したパレットを生成します（HSL）。</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-300">色数</span>
              <input
                type="number"
                min={1}
                value={evenCount}
                onChange={(e) => setEvenCount(Math.max(1, Number(e.target.value) || 1))}
                className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800 w-24"
              />
              <span className="text-sm text-slate-300">共通個数</span>
              <input
                type="number"
                min={0}
                value={evenStock}
                onChange={(e) => setEvenStock(e.target.value)}
                placeholder="∞"
                className="px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800 w-24"
              />
              <button
                className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                onClick={() => {
                  const n = Math.max(1, Math.floor(Number(evenCount) || 1));
                  const out = generateEvenHues(n, evenStock);
                  setColors(out.map((c) => ({ id: uid(), ...c })));
                  setWarn("");
                }}
              >
                生成して置き換え
              </button>
            </div>
          </div>

          {/* 入出力 */}
          <h2 className="text-sm text-slate-400 mt-5">入出力</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-700">
              CSV/JSON 読み込み
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  (async () => {
                    const text = await file.text();
                    try {
                      if (file.name.endsWith(".json")) {
                        const arr = JSON.parse(text);
                        if (!Array.isArray(arr)) throw new Error("JSON 配列ではありません");
                        setColors(
                          arr.map((x) => ({
                            id: uid(),
                            hex: x.hex,
                            label: x.label,
                            weight: Number(x.weight) || 0,
                            stock:
                              x.stock == null || x.stock === ""
                                ? null
                                : Math.max(0, Math.floor(Number(x.stock) || 0)),
                          }))
                        );
                        setWarn("");
                      } else {
                        const lines = text.split(/\r?\n/).filter((l) => l.trim());
                        const out = [];
                        for (let i = 0; i < lines.length; i++) {
                          const cols = lines[i].split(",");
                          if (i === 0 && /hex/i.test(cols[0])) continue;
                          const [hex, label, weight, stock] = cols;
                          out.push({
                            id: uid(),
                            hex: (hex || "#ffffff").trim(),
                            label: (label || "").trim() || hex,
                            weight: Math.max(0, Math.floor(Number(weight) || 0)),
                            stock:
                              stock == null || stock.trim() === ""
                                ? null
                                : Math.max(0, Math.floor(Number(stock) || 0)),
                          });
                        }
                        setColors(out);
                        setWarn("");
                      }
                    } catch (e) {
                      setWarn("読み込みに失敗しました: " + e.message);
                    } finally {
                      fileRef.current && (fileRef.current.value = "");
                    }
                  })();
                }}
              />
            </label>
            <button
              className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
              onClick={() => {
                if (results.length === 0) {
                  setWarn("出力する結果がありません");
                  return;
                }
                const header = ["timestamp", "label", "hex"];
                const rows = results.map((r) => [
                  r.time.toISOString(),
                  `"${(r.label || "").replace(/"/g, '""')}"`,
                  r.hex.toUpperCase(),
                ]);
                const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
                dl(csv, `garagara_results_${dateTag()}.csv`, "text/csv");
              }}
            >
              結果 CSV 保存
            </button>
            <button
              className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
              onClick={() => {
                const data = colors.map(({ hex, label, weight, stock }) => ({
                  hex,
                  label,
                  weight,
                  stock,
                }));
                dl(
                  JSON.stringify(data, null, 2),
                  `garagara_setup_${dateTag()}.json`,
                  "application/json"
                );
              }}
            >
              設定 JSON 保存
            </button>
          </div>
        </Block>

        {/* 右：抽選 */}
        <div className="grid grid-rows-[auto_auto_1fr] gap-4">
          {/* 操作 & ドラム */}
          <Block>
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold">ガラガラ抽選（色玉）</h1>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-700">
                  <input
                    type="number"
                    min={1}
                    value={drawCount}
                    onChange={(e) => setDrawCount(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 bg-transparent outline-none"
                  />
                  抽選回数
                </label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-700">
                  <input
                    type="checkbox"
                    checked={noRepeat}
                    onChange={(e) => setNoRepeat(e.target.checked)}
                  />
                  重複なし
                </label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-700">
                  <input
                    type="checkbox"
                    checked={respectStock}
                    onChange={(e) => setRespectStock(e.target.checked)}
                  />
                  在庫を減らす
                </label>
              </div>
            </div>

            <div className="grid md:grid-cols-[1fr_360px] gap-4 mt-3">
              {/* ドラム */}
              <Block className="relative min-h-[320px] flex items-center justify-center">
                <div
                  aria-label="ガラガラ抽選機"
                  className={`w-[260px] h-[260px] rounded-full border border-slate-800 relative`}
                  style={{
                    background:
                      "radial-gradient(closest-side,#0d1016 68%,transparent 69%), conic-gradient(from 0deg,#2b3242 0 25%,#232a38 0 50%,#2b3242 0 75%,#232a38 0 100%)",
                    boxShadow:
                      "inset 0 0 0 10px #141927, inset 0 0 30px rgba(0,0,0,.6), 0 20px 50px rgba(0,0,0,.35)",
                    animation: spin ? "roll 1.1s linear infinite" : "none",
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      inset: "22% 22%",
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle at 30% 30%, rgba(255,255,255,.15), transparent 40%), linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0))",
                      border: "1px solid #2a3040",
                    }}
                  />
                </div>
                {/* 投出口 */}
                <div
                  className="absolute bottom-2"
                  style={{
                    left: "calc(50% - 28px)",
                    width: 56,
                    height: 22,
                    borderRadius: "0 0 22px 22px",
                    background: "#111522",
                    border: "1px solid #2a3040",
                    boxShadow: "inset 0 -6px 12px rgba(0,0,0,.5)",
                  }}
                />
                {/* 色玉 */}
                <div
                  className={`flex items-center justify-center font-extrabold text-slate-900 rounded-full border border-black/30`}
                  style={{
                    width: 100,
                    height: 100,
                    background: ball.hex,
                    boxShadow:
                      "inset -14px -18px 0 rgba(0,0,0,.12), inset 12px 10px 20px rgba(255,255,255,.35), 0 18px 40px rgba(0,0,0,.35)",
                    transform: ball.show ? "translateY(0) scale(1)" : "translateY(120px) scale(.7)",
                    opacity: ball.show ? 1 : 0,
                    transition: "transform .45s cubic-bezier(.2,.7,.2,1), opacity .2s ease",
                  }}
                >
                  <span
                    className="px-2 py-1 rounded-full"
                    style={{ background: "rgba(255,255,255,.85)", fontSize: 14 }}
                  >
                    {ball.label}
                  </span>
                </div>
              </Block>

              {/* 結果＆操作 */}
              <Block>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="px-3 py-2 rounded-xl border border-transparent bg-blue-600 hover:bg-blue-500"
                    onClick={drawOnce}
                  >
                    抽選する
                  </button>
                  <button
                    className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                    onClick={drawMulti}
                  >
                    まとめて抽選
                  </button>
                  <button
                    className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                    onClick={() => {
                      setResults([]);
                      setWarn("");
                    }}
                  >
                    結果クリア
                  </button>
                </div>

                <p className="text-xs text-slate-400 mt-2">
                  ※「まとめて抽選」は上の「抽選回数」分を一度に実行して一覧へ追加します。
                </p>

                <h2 className="text-sm text-slate-400 mt-4">結果（全履歴）</h2>
                <div className="max-h-80 overflow-auto rounded-xl border border-slate-800">
                  {results.length === 0 ? (
                    <div className="p-3 text-slate-400 text-sm">まだ結果がありません。</div>
                  ) : (
                    results.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 border-b border-slate-800">
                        <div className="w-[18px] h-[18px] rounded-full border border-black/30" style={{ background: r.hex }} />
                        <div className="min-w-[80px]">{r.label}</div>
                        <div className="text-xs text-slate-400">{r.hex.toUpperCase()}</div>
                        <div className="ml-auto text-xs text-slate-500">{new Date(r.time).toLocaleTimeString()}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <div className="px-3 py-2 rounded-full border border-slate-700">残り在庫 合計：{stockSum}</div>
                  <div className="px-3 py-2 rounded-full border border-slate-700">有効重み 合計：{weightSum}</div>
                </div>

                {warn && <p className="text-amber-300 mt-2 text-sm">{warn}</p>}
              </Block>
            </div>
          </Block>

          {/* ★ 今回のまとめ（直近のまとめて抽選） */}
          <Block>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">今回のまとめ（直近のまとめて抽選）</h2>
              <div className="flex gap-2">
                <button
                  className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                  onClick={() => setBatch({ time: null, items: [], counts: {}, total: 0 })}
                >
                  クリア
                </button>
                <button
                  className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                  onClick={exportBatchCSV}
                >
                  このバッチをCSV保存
                </button>
              </div>
            </div>

            {batch.total === 0 ? (
              <p className="text-slate-400 text-sm mt-2">まだ「まとめて抽選」の結果がありません。</p>
            ) : (
              <>
                <p className="text-slate-400 text-sm mt-1">
                  抽選日時：{new Date(batch.time).toLocaleString()}／ 合計 {batch.total} 個
                </p>

                {/* 色別カウント（赤が〇個、青が〇個…） */}
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/50 text-slate-300">
                      <tr>
                        <th className="text-left p-2 border-b border-slate-800">色</th>
                        <th className="text-left p-2 border-b border-slate-800">名前</th>
                        <th className="text-left p-2 border-b border-slate-800">個数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(batch.counts).map((c, i) => (
                        <tr key={i} className="border-b border-slate-800">
                          <td className="p-2">
                            <div className="w-4 h-4 rounded-full border border-black/30" style={{ background: c.hex }} />
                          </td>
                          <td className="p-2">{c.label}</td>
                          <td className="p-2">{c.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* バッチ内の出目一覧（順番つき） */}
                <h3 className="text-sm text-slate-300 mt-4">今回バッチの出目（順）</h3>
                <div className="max-h-48 overflow-auto rounded-xl border border-slate-800">
                  {batch.items.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 border-b border-slate-800">
                      <div className="text-xs w-6 text-right text-slate-400">{idx + 1}.</div>
                      <div className="w-[18px] h-[18px] rounded-full border border-black/30" style={{ background: r.hex }} />
                      <div className="min-w-[80px]">{r.label}</div>
                      <div className="text-xs text-slate-400">{r.hex.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Block>
        </div>
      </div>

      <style>{`@keyframes roll { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
