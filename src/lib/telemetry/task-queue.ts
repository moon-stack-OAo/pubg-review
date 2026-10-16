import {BizError} from "@/lib/errors";

export const TELEMETRY_QUEUE_CAPACITY = 8;

/** 单实例共享：等待项只持有闭包，在获得执行权前不读取大文件。 */
export function createTelemetryTaskQueue(capacity = TELEMETRY_QUEUE_CAPACITY) {
  const inflight = new Map<string, Promise<unknown>>();
  const waiting: Array<() => void> = [];
  let active = false;

  return function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    if (active && waiting.length >= capacity) {
      return Promise.reject(new BizError("遥测处理队列已满，请稍后重试", 429, 42902));
    }
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const result = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    inflight.set(key, result);
    const start = () => {
      active = true;
      void (async () => {
        try {
          const value = await task();
          resolve(value);
        } catch (error) {
          reject(error);
        } finally {
          inflight.delete(key);
          const next = waiting.shift();
          if (next) next();
          else active = false;
        }
      })();
    };
    if (active) waiting.push(start);
    else start();
    return result;
  };
}

const processState = globalThis as typeof globalThis & {
  __pubgTelemetryTaskQueue?: ReturnType<typeof createTelemetryTaskQueue>;
};
export const runTelemetryTask = processState.__pubgTelemetryTaskQueue ??=
  createTelemetryTaskQueue();
