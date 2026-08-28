import {BizError, fail, ok} from "@/lib/api-response";
import {detectFrequentMates} from "@/lib/squad/detect-mates";
import {isPubgPlatform} from "@/lib/pubg/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";
    const scanRaw = Number(searchParams.get("scan") ?? "12");

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空"));
    }

    const data = await detectFrequentMates({
      platform,
      playerName: name,
      scan: Number.isFinite(scanRaw) ? scanRaw : 12,
    });

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
