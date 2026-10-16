import {BizError, fail, ok} from "@/lib/api-response";
import {getCachedClan} from "@/lib/pubg/service";
import {isPubgPlatform} from "@/lib/pubg/types";

type RouteContext = {
  params: Promise<{ clanId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { clanId } = await context.params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    const id = clanId?.trim() ?? "";
    if (!id) {
      return fail(new BizError("clanId 不能为空"));
    }

    const { value, cached } = await getCachedClan(platform, id);
    if (!value) {
      return fail(new BizError("战队不存在", 404, 40401));
    }
    return ok(value, { cached });
  } catch (error) {
    return fail(error);
  }
}
