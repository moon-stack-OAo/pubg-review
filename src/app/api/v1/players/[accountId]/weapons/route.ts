import {BizError, fail, ok} from "@/lib/api-response";
import {getWeaponsTabData} from "@/lib/history/service";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { accountId } = await context.params;
    if (!accountId) {
      return fail(new BizError("accountId 不能为空"));
    }
    const { searchParams } = new URL(request.url);
    const gameMode = searchParams.get("gameMode")?.trim() || undefined;
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const data = await getWeaponsTabData(accountId, {
      gameMode,
      limit:
        limit != null && Number.isFinite(limit)
          ? Math.min(Math.max(1, limit), 50)
          : undefined,
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
