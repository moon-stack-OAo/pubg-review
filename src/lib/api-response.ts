import {NextResponse} from "next/server";
import {BizError, friendlyErrorMessage} from "@/lib/errors";
import {PubgApiError} from "@/lib/pubg/client";

export type ApiBody<T> = {
  code: number;
  message: string;
  data: T | null;
  meta?: Record<string, unknown>;
};

export { BizError };

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  const body: ApiBody<T> = {
    code: 0,
    message: "ok",
    data,
    meta,
  };
  return NextResponse.json(body);
}

export function fail(error: unknown) {
  if (error instanceof PubgApiError) {
    const code =
      error.status === 404
        ? error.message.includes("对局")
          ? 40402
          : 40401
        : error.status === 429
          ? 42901
          : error.status >= 500
            ? 50001
            : 40001;

    const body: ApiBody<null> = {
      code,
      message: friendlyErrorMessage(error),
      data: null,
      meta: error.retryAfterSec != null ? { retryAfterSec: error.retryAfterSec } : undefined,
    };
    return NextResponse.json(body, {
      status: error.status === 404 ? 404 : error.status >= 500 ? 502 : error.status,
    });
  }

  if (error instanceof BizError) {
    const body: ApiBody<null> = {
      code: error.code,
      message: friendlyErrorMessage(error),
      data: null,
      meta: error.meta,
    };
    return NextResponse.json(body, { status: error.status });
  }

  const body: ApiBody<null> = {
    code: 40001,
    message: friendlyErrorMessage(error),
    data: null,
  };
  return NextResponse.json(body, { status: 400 });
}
