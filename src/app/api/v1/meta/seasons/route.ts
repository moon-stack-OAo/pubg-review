import {BizError, fail, ok} from "@/lib/api-response";
import {getCachedSeasons} from "@/lib/pubg/service";
import {isPubgPlatform} from "@/lib/pubg/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }

    const { value: seasons, cached } = await getCachedSeasons(platform);
    return ok({ items: seasons }, { cached });
  } catch (error) {
    return fail(error);
  }
}
