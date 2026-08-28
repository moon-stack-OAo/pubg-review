import {BizError, fail, ok} from "@/lib/api-response";
import {smokeTest} from "@/lib/pubg/client";
import {isPubgPlatform} from "@/lib/pubg/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform")?.trim() ?? "steam";
    const name = searchParams.get("name")?.trim() ?? "";

    if (!isPubgPlatform(platform)) {
      return fail(new BizError("platform 必须是 steam/kakao/xbox/psn"));
    }
    if (!name) {
      return fail(new BizError("name 不能为空"));
    }

    const result = await smokeTest(platform, name);
    return ok(result, {
      note: "冒烟测试：搜索玩家 → 当前赛季统计 → 最近一局详情（若有）",
      rateLimitHint: "默认约 10 RPM；本接口一次最多消耗 3 次限流配额（matches 不计入）",
    });
  } catch (error) {
    return fail(error);
  }
}
