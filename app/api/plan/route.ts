import { NextResponse } from "next/server";

type PlannerInput = {
  destination: string;
  base: string;
  startDate: string;
  endDate: string;
  tripMode: string;
  weekdayWindow: string;
  weekendWindow: string;
  pace: string;
  interests: string[];
  mustDo: string;
  constraints: string;
};

type AIBackend = "openai" | "hermes";

function getAIConfig() {
  const backend: AIBackend = process.env.AI_BACKEND === "hermes"
    ? "hermes"
    : process.env.AI_BACKEND === "openai" ? "openai" : process.env.HERMES_BASE_URL ? "hermes" : "openai";
  const baseUrl = (backend === "hermes"
    ? process.env.HERMES_BASE_URL || "http://hermes:8642/v1"
    : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    backend,
    baseUrl,
    apiKey: backend === "hermes" ? process.env.HERMES_API_KEY : process.env.OPENAI_API_KEY,
    model: backend === "hermes" ? process.env.HERMES_MODEL || "roam-agent" : process.env.OPENAI_MODEL || "gpt-5.4-mini",
  };
}

function normalizeInput(input: Partial<PlannerInput> | null | undefined): PlannerInput {
  const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
  return {
    destination: text(input?.destination, 100),
    base: text(input?.base, 200),
    startDate: text(input?.startDate, 10),
    endDate: text(input?.endDate, 10),
    tripMode: input?.tripMode === "leisure" ? "leisure" : "work",
    weekdayWindow: text(input?.weekdayWindow, 200),
    weekendWindow: text(input?.weekendWindow, 200),
    pace: text(input?.pace, 20),
    interests: Array.isArray(input?.interests) ? input.interests.slice(0, 12).map((item) => text(item, 40)).filter(Boolean) : [],
    mustDo: text(input?.mustDo, 1000),
    constraints: text(input?.constraints, 1000),
  };
}

const googleRoute = (origin: string, destination: string, mode = "transit", waypoints = "") =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;

function datesBetween(start: string, end: string) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return [];
  const dates: Date[] = [];
  for (const date = new Date(first); date <= last && dates.length < 10; date.setDate(date.getDate() + 1)) dates.push(new Date(date));
  return dates;
}

function demoPlan(input: PlannerInput) {
  const dates = datesBetween(input.startDate, input.endDate);
  const base = input.base || `${input.destination}市中心`;
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const days = (dates.length ? dates : [new Date()]).map((date, index) => {
    const workday = input.tripMode === "work" && date.getDay() > 0 && date.getDay() < 6;
    const dateText = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
    const center = `${input.destination} city center`;
    const oldTown = `${input.destination} old town`;
    const localFood = `${input.destination} local restaurant`;
    const stops = workday
      ? [
          { time: "19:00", title: "回到住处，短暂休息", text: "补水、换轻便鞋，把晚间路线控制在一个片区内。", meta: "轻松开始", links: [], accent: "blue" },
          { time: "19:35", title: "前往城市核心区", text: `按 Google Maps 的实时公共交通建议前往${input.destination}中心，优先选择少换乘路线。`, meta: "约30–50分钟", links: [{ label: "打开实时路线", url: googleRoute(base, center), kind: "map" }], accent: "blue" },
          { time: "20:30", title: "地标与街区散步", text: "选择一处代表性地标，再沿附近步行街慢慢逛，不把景点排得过满。", meta: "约60分钟", links: [{ label: "打开步行路线", url: googleRoute(center, oldTown, "walking"), kind: "map" }], accent: "gold" },
          { time: "21:35", title: "本地晚餐", text: "在返程方向选择评价稳定、仍在营业的本地餐厅，用餐后直接回住处。", meta: "请复核营业时间", links: [{ label: "搜索附近餐厅", url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localFood)}`, kind: "map" }], accent: "red" },
        ]
      : [
          { time: "09:30", title: "从住处出发", text: "吃完早餐后出发，先完成当天最重要、最需要预约的项目。", meta: "从容节奏", links: [{ label: "前往城市中心", url: googleRoute(base, center), kind: "map" }], accent: "blue" },
          { time: "10:30", title: "城市代表性景点", text: `安排一处与你的兴趣“${input.interests.slice(0, 2).join("、") || "城市地标"}”匹配的重点景点，预留排队时间。`, meta: "约2小时", links: [{ label: "查看周边景点", url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${input.destination} attractions`)}`, kind: "map" }], accent: "red" },
          { time: "13:00", title: "午餐与休息", text: "就近吃饭，避开最热或最拥挤的时段，不连续步行超过两小时。", meta: "约90分钟", links: [{ label: "搜索本地餐厅", url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localFood)}`, kind: "map" }], accent: "gold" },
          { time: "15:00", title: "老城慢游", text: "用一条不走回头路的步行线串联广场、街巷与咖啡店，中途随时可缩短。", meta: "约2小时", links: [{ label: "打开步行路线", url: googleRoute(center, oldTown, "walking"), kind: "map" }], accent: "blue" },
          { time: "18:00", title: "弹性晚间", text: input.mustDo || "按体力选择日落、夜景或早点回住处休息。", meta: "可自由调整", links: [{ label: "返回住处", url: googleRoute(oldTown, base), kind: "map" }], accent: "gold" },
        ];
    return {
      id: `day-${index + 1}`,
      short: String(date.getDate()).padStart(2, "0"),
      date: dateText,
      weekday: weekday[date.getDay()],
      title: workday ? "下班后的城市散步" : index === 0 ? "初识城市" : "经典街区与本地味道",
      summary: workday ? `按照${input.weekdayWindow || "晚间"}可用时间安排，路线集中、不过度消耗体力。` : `按照${input.pace}节奏安排，保留午餐和休息时间。`,
      distance: workday ? "轻松 · 单一片区" : "适中 · 可随时缩短",
      stops,
    };
  });
  return {
    destination: input.destination,
    subtitle: `${days.length}天智能行程 · Google Maps 路线已生成`,
    base,
    dateLabel: `${input.startDate} — ${input.endDate}`,
    notice: "当前为无密钥演示计划；接入 OpenAI 后会实时检索景点、营业时间与官方购票入口。",
    days,
  };
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["destination", "subtitle", "base", "dateLabel", "notice", "days"],
  properties: {
    destination: { type: "string" },
    subtitle: { type: "string" },
    base: { type: "string" },
    dateLabel: { type: "string" },
    notice: { type: "string" },
    days: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "short", "date", "weekday", "title", "summary", "distance", "stops"],
        properties: {
          id: { type: "string" },
          short: { type: "string" },
          date: { type: "string" },
          weekday: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          distance: { type: "string" },
          stops: {
            type: "array",
            minItems: 2,
            maxItems: 9,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["time", "title", "text", "meta", "accent", "links"],
              properties: {
                time: { type: "string" },
                title: { type: "string" },
                text: { type: "string" },
                meta: { type: "string" },
                accent: { type: "string", enum: ["red", "gold", "blue"] },
                links: {
                  type: "array",
                  maxItems: 3,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["label", "url", "kind"],
                    properties: {
                      label: { type: "string" },
                      url: { type: "string" },
                      kind: { type: "string", enum: ["map", "ticket", "info"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

function extractText(response: { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }) {
  for (const item of response.output ?? []) for (const part of item.content ?? []) if (part.type === "output_text" && part.text) return part.text;
  return "";
}

function extractChatText(response: { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> }) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  return content?.map((part) => part.text ?? "").join("") ?? "";
}

function parseModelJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("智能体没有返回合法的行程 JSON。");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function validatePlan(plan: unknown) {
  if (!plan || typeof plan !== "object") throw new Error("智能体返回的行程格式无效。");
  const candidate = plan as { destination?: unknown; days?: Array<{ stops?: unknown[] }> };
  if (typeof candidate.destination !== "string" || !Array.isArray(candidate.days) || candidate.days.length < 1 || candidate.days.length > 10) {
    throw new Error("智能体返回的行程缺少必要字段。");
  }
  if (candidate.days.some((day) => !Array.isArray(day.stops) || day.stops.length < 2 || day.stops.length > 9)) {
    throw new Error("智能体返回的每日行程格式无效。");
  }
  return plan;
}

export async function POST(request: Request) {
  try {
    const input = normalizeInput((await request.json()) as PlannerInput);
    if (!input.destination?.trim() || !input.startDate || !input.endDate) return NextResponse.json({ error: "请填写目的地和出行日期。" }, { status: 400 });
    if (datesBetween(input.startDate, input.endDate).length === 0) return NextResponse.json({ error: "结束日期不能早于开始日期，单次最多规划10天。" }, { status: 400 });
    const ai = getAIConfig();
    if (!ai.apiKey) return NextResponse.json({ plan: demoPlan(input), demo: true });

    const baseUrl = ai.baseUrl;
    const isOfficialOpenAI = baseUrl === "https://api.openai.com/v1";
    const configuredApiMode = process.env.OPENAI_API_MODE;
    const apiMode = ai.backend === "hermes" ? "chat_completions" : configuredApiMode === "responses" || configuredApiMode === "chat_completions"
      ? configuredApiMode
      : isOfficialOpenAI ? "responses" : "chat_completions";
    const configuredWebSearch = process.env.OPENAI_ENABLE_WEB_SEARCH;
    const webSearchEnabled = apiMode === "responses"
      && (configuredWebSearch ? configuredWebSearch === "true" : isOfficialOpenAI);
    const configuredOutputMode = process.env.OPENAI_STRUCTURED_OUTPUT;
    const structuredOutput = configuredOutputMode === "json_schema" || configuredOutputMode === "json_object"
      ? configuredOutputMode
      : apiMode === "chat_completions" && !isOfficialOpenAI ? "json_object" : "json_schema";
    const verificationRule = ai.backend === "hermes"
      ? "必须主动调用 web_search 核对动态信息，优先使用景点、交通机构、赛事组织方和票务方的官方来源；如果工具不可用或无法核实，必须明确写入 notice，不得假装已经核验。"
      : webSearchEnabled
      ? "使用网络搜索核对景点营业时间、交通施工和官方购票网站。"
      : "当前没有网络搜索工具，不得声称已经实时核验；所有开放时间和票务信息都要提示用户临行前复核。";
    const jsonInstruction = structuredOutput === "json_object"
      ? `\n7. 只输出合法 JSON，不要输出 Markdown 或解释。JSON 必须严格符合这个结构：${JSON.stringify(schema)}`
      : "";
    const prompt = `你是一位谨慎、懂路线优化的中文旅行规划师。根据用户资料生成可直接执行的逐日计划。\n用户资料：${JSON.stringify(input)}\n要求：1. 工作日严格尊重可用时段，适度安排并保留休息。2. ${verificationRule} 3. 路线不走回头路；每段 Google Maps 链接使用 https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=...，地点用完整可搜索名称。4. 只有确认是官方来源时才给 ticket 或 info 链接，所有链接必须使用 HTTPS；否则给 Google Maps 搜索链接并在文字中提示复核。5. 不承诺实时交通，notice 用一句话说明已核验的范围以及仍需临行复核的事项。6. 输出简体中文，日期覆盖用户范围，最多10天。7. 最终回复只能是符合指定结构的 JSON，不要附加 Markdown、引用列表或解释。${jsonInstruction}`;
    const responseBody = apiMode === "chat_completions"
      ? {
          model: ai.model,
          messages: [
            { role: "system", content: "You are the ROAM travel-planning agent. Use your enabled read-only research tools when current facts matter. Never execute shell commands or modify files. Return valid JSON only." },
            { role: "user", content: prompt },
          ],
          ...(ai.backend === "hermes" ? {} : {
            response_format: structuredOutput === "json_object"
              ? { type: "json_object" }
              : { type: "json_schema", json_schema: { name: "travel_plan", strict: true, schema } },
          }),
        }
      : {
          model: ai.model,
          ...(webSearchEnabled ? { tools: [{ type: "web_search", search_context_size: "low" }] } : {}),
          input: prompt,
          text: { format: { type: "json_schema", name: "travel_plan", strict: true, schema } },
        };
    const sessionId = `roam-${crypto.randomUUID()}`;
    const requestedTimeout = Number(process.env.AI_REQUEST_TIMEOUT_MS) || (ai.backend === "hermes" ? 180_000 : 90_000);
    const timeout = Math.min(Math.max(requestedTimeout, 10_000), 600_000);
    const apiResponse = await fetch(`${baseUrl}/${apiMode === "chat_completions" ? "chat/completions" : "responses"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ai.apiKey}`,
        ...(ai.backend === "hermes" ? { "X-Hermes-Session-Id": sessionId, "Idempotency-Key": sessionId } : {}),
      },
      body: JSON.stringify(responseBody),
      signal: AbortSignal.timeout(timeout),
    });
    if (!apiResponse.ok) throw new Error(`LLM API ${apiResponse.status}: ${(await apiResponse.text()).slice(0, 300)}`);
    const raw = await apiResponse.json();
    const text = apiMode === "chat_completions" ? extractChatText(raw) : extractText(raw);
    if (!text) throw new Error("模型没有返回可用的行程。请稍后重试。");
    return NextResponse.json({ plan: validatePlan(parseModelJson(text)), demo: false, backend: ai.backend });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "智能体检索超时，请缩短日期范围或稍后重试。"
      : error instanceof Error ? error.message : "生成失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
