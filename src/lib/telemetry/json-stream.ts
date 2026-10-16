import {createReadStream} from "node:fs";

export const TELEMETRY_MAX_BYTES = 80 * 1024 * 1024;

/** 只切分顶层数组元素；每条事件仍由原生 JSON.parse 校验字符串与嵌套语法。 */
export async function* readTelemetryArray(file: string): AsyncGenerator<unknown> {
  const input = createReadStream(file, {highWaterMark: 64 * 1024});
  const decoder = new TextDecoder("utf-8");
  let total = 0;
  const state: {phase: "start" | "value" | "element" | "separator" | "end"} = {phase: "start"};
  let allowEnd = true;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let parts: string[] = [];

  function* consume(text: string): Generator<unknown> {
    let from = state.phase === "element" ? 0 : -1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (state.phase === "element") {
        if (!quoted && depth === 0 && (c === "," || c === "]" || /[\x20\t\r\n]/.test(c))) {
          parts.push(text.slice(from, i));
          const element = JSON.parse(parts.join("")) as unknown;
          parts = [];
          from = -1;
          state.phase = "separator";
          yield element;
          // 当前分隔符还需由下方状态机处理。
        } else {
          if (quoted) {
            if (escaped) escaped = false;
            else if (c === "\\") escaped = true;
            else if (c === '"') quoted = false;
          } else if (c === '"') quoted = true;
          else if (c === "{" || c === "[") depth++;
          else if (c === "}" || c === "]") depth--;
          if (depth < 0) throw new SyntaxError("遥测 JSON 嵌套格式异常");
          continue;
        }
      }
      if (/[\x20\t\r\n]/.test(c)) continue;
      if (state.phase === "start" && c === "[") {
        state.phase = "value";
      } else if (state.phase === "value") {
        if (c === "]" && allowEnd) state.phase = "end";
        else {
          if (c === "]" || c === ",") throw new SyntaxError("遥测 JSON 数组元素缺失");
          state.phase = "element";
          from = i;
          depth = c === "{" || c === "[" ? 1 : 0;
          quoted = c === '"';
          escaped = false;
        }
      } else if (state.phase === "separator" && c === ",") {
        state.phase = "value";
        allowEnd = false;
      } else if (state.phase === "separator" && c === "]") {
        state.phase = "end";
      } else {
        if (state.phase === "start") throw new Error("遥测格式异常：期望事件数组（JSON array）");
        throw new SyntaxError("遥测 JSON 数组分隔符异常");
      }
    }
    if (from >= 0) parts.push(text.slice(from));
  }

  for await (const chunk of input) {
    total += chunk.length;
    if (total > TELEMETRY_MAX_BYTES) throw new Error("遥测文件过大");
    yield* consume(decoder.decode(chunk, {stream: true}));
  }
  yield* consume(decoder.decode());
  if (state.phase !== "end") throw new SyntaxError("遥测 JSON 数组未完整结束");
}
