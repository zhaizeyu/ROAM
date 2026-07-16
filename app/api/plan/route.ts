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
  if (Math.round((last.getTime() - first.getTime()) / 86_400_000) > 9) return [];
  const dates: Date[] = [];
  for (const date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) dates.push(new Date(date));
  return dates;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function demoPlan(input: PlannerInput) {
  const dates = datesBetween(input.startDate, input.endDate);
  const base = input.base || `${input.destination}市中心`;
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const days = (dates.length ? dates : [new Date()]).map((date, index) => {
    const workday = input.tripMode === "work" && date.getDay() > 0 && date.getDay() < 6;
    const dateText = isoDate(date);
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
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
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

const daySchema = schema.properties.days.items;
const replanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["day"],
  properties: { day: daySchema },
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

function humanizeLabel(label: unknown) {
  let value = typeof label === "string" ? label.trim() : "打开链接";
  for (let attempt = 0; attempt < 2 && /%[0-9a-f]{2}/i.test(value); attempt += 1) {
    try { value = decodeURIComponent(value); } catch { break; }
  }
  return value.replace(/\+/g, " ").replace(/\s+/g, " ").slice(0, 80) || "打开链接";
}

function sanitizePlan(plan: unknown) {
  if (!plan || typeof plan !== "object") return plan;
  const candidate = structuredClone(plan) as { days?: Array<{ stops?: Array<{ links?: Array<{ label?: unknown; url?: unknown; kind?: unknown }> }> }> };
  for (const day of candidate.days ?? []) for (const stop of day.stops ?? []) {
    stop.links = (stop.links ?? []).filter((link) => {
      try { return typeof link.url === "string" && new URL(link.url).protocol === "https:"; } catch { return false; }
    }).map((link) => ({ ...link, label: humanizeLabel(link.label) }));
  }
  return candidate;
}

function timeMinutes(value: unknown) {
  const match = typeof value === "string" ? value.match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)/) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function validatePlan(plan: unknown, input: PlannerInput) {
  if (!plan || typeof plan !== "object") throw new Error("智能体返回的行程格式无效。");
  const candidate = plan as { destination?: unknown; dateLabel?: unknown; days?: Array<{ id?: unknown; date?: unknown; title?: unknown; summary?: unknown; stops?: Array<{ title?: unknown; text?: unknown; links?: Array<{ label?: unknown; url?: unknown }> }> }> };
  if (typeof candidate.destination !== "string" || !Array.isArray(candidate.days) || candidate.days.length < 1 || candidate.days.length > 10) {
    throw new Error("智能体返回的行程缺少必要字段。");
  }
  const expectedDates = datesBetween(input.startDate, input.endDate).map(isoDate);
  const actualDates = candidate.days.map((day) => day.date);
  if (candidate.days.length !== expectedDates.length || actualDates.some((date, index) => date !== expectedDates[index])) {
    throw new Error(`智能体返回的日期与需求不一致（应为 ${expectedDates.join("、")}），请重新生成。`);
  }
  if (candidate.days.some((day) => !Array.isArray(day.stops) || day.stops.length < 2 || day.stops.length > 9)) {
    throw new Error("智能体返回的每日行程格式无效。");
  }
  if (new Set(candidate.days.map((day) => day.id)).size !== candidate.days.length) throw new Error("智能体返回了重复的日期标识，请重新生成。");
  if (candidate.days.some((day) => day.stops?.some((stop) => stop.links?.some((link) => typeof link.label !== "string" || /%[0-9a-f]{2}/i.test(link.label) || typeof link.url !== "string")))) {
    throw new Error("智能体返回的路线链接格式无效，请重新生成。");
  }
  for (const day of candidate.days) {
    const times = (day.stops ?? []).map((stop) => timeMinutes((stop as { time?: unknown }).time)).filter((time): time is number => time !== null);
    if (times.some((time, index) => index > 0 && time < times[index - 1])) throw new Error(`${String(day.date)} 的时间顺序前后颠倒，请重新规划。`);
    const hasMap = (day.stops ?? []).some((stop) => stop.links?.some((link) => typeof link.url === "string" && /google\.[^/]+\/maps/.test(link.url)));
    if (!hasMap) throw new Error(`${String(day.date)} 缺少可执行的 Google Maps 路线。`);
  }
  if (input.tripMode === "leisure") {
    const prose = candidate.days.flatMap((day) => [day.title, day.summary, ...(day.stops ?? []).flatMap((stop) => [stop.title, stop.text])]).filter((item): item is string => typeof item === "string").join(" ");
    if (/(下班|白天.*工作|完成工作|出差)/.test(prose)) throw new Error("休闲旅行中出现了工作日安排，请重新生成。");
  }
  const explicitlyPartial = /(仅|只).{0,5}(上午|下午|晚上)|(上午|下午|晚上).{0,5}(结束|离开|有空)|半天/.test(input.weekendWindow);
  const minimumStops = input.pace === "轻松" ? 4 : input.pace === "充实" ? 6 : 5;
  for (const day of candidate.days) {
    const date = typeof day.date === "string" ? new Date(`${day.date}T12:00:00`) : null;
    const workday = input.tripMode === "work" && date && date.getDay() > 0 && date.getDay() < 6;
    if (explicitlyPartial || workday) continue;
    const times = (day.stops ?? []).map((stop) => timeMinutes((stop as { time?: unknown }).time)).filter((time): time is number => time !== null);
    const hasMorning = times.some((time) => time <= 11 * 60 + 30);
    const hasAfternoon = times.some((time) => time >= 14 * 60);
    const hasEvening = times.some((time) => time >= 17 * 60);
    if ((day.stops?.length ?? 0) < minimumStops || !hasMorning || !hasAfternoon || !hasEvening) {
      throw new Error(`${String(day.date)} 的全天计划没有覆盖上午、下午和傍晚，请补全后重新生成。`);
    }
  }
  return plan;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: string;
      input?: Partial<PlannerInput>;
      trip?: { destination?: unknown; subtitle?: unknown; base?: unknown; dateLabel?: unknown; notice?: unknown; days?: Array<{ id?: unknown; date?: unknown }> };
      dayId?: string;
      instruction?: string;
    } & Partial<PlannerInput>;
    const isReplan = body.action === "replan-day";
    const input = normalizeInput(isReplan ? body.input : body);
    if (!input.destination?.trim() || !input.startDate || !input.endDate) return NextResponse.json({ error: "请填写目的地和出行日期。" }, { status: 400 });
    const requestedDates = datesBetween(input.startDate, input.endDate);
    if (requestedDates.length === 0) return NextResponse.json({ error: "结束日期不能早于开始日期，单次最多规划10天。" }, { status: 400 });
    const ai = getAIConfig();
    if (!ai.apiKey) {
      if (isReplan) return NextResponse.json({ error: "AI 局部重规划需要先配置模型密钥。" }, { status: 503 });
      return NextResponse.json({ plan: demoPlan(input), demo: true });
    }

    const baseUrl = ai.baseUrl;
    const isOfficialOpenAI = baseUrl === "https://api.openai.com/v1";
    const configuredApiMode = process.env.OPENAI_API_MODE;
    const apiMode = ai.backend === "hermes" ? "chat_completions" : configuredApiMode === "responses" || configuredApiMode === "chat_completions"
      ? configuredApiMode
      : isOfficialOpenAI ? "responses" : "chat_completions";
    const configuredWebSearch = process.env.OPENAI_ENABLE_WEB_SEARCH;
    const webSearchEnabled = apiMode === "responses" && (configuredWebSearch ? configuredWebSearch === "true" : isOfficialOpenAI);
    const configuredOutputMode = process.env.OPENAI_STRUCTURED_OUTPUT;
    const structuredOutput = configuredOutputMode === "json_schema" || configuredOutputMode === "json_object"
      ? configuredOutputMode
      : apiMode === "chat_completions" && !isOfficialOpenAI ? "json_object" : "json_schema";
    const verificationRule = ai.backend === "hermes"
      ? "必须主动调用 web_search 核对动态信息，优先使用官方来源。只允许调用 web_search，绝对不要调用 web_extract。如果无法核实，必须明确提示复核。"
      : webSearchEnabled
      ? "使用网络搜索核对景点营业时间、交通施工和官方购票网站。"
      : "当前没有网络搜索工具，不得声称已经实时核验；开放时间和票务信息都要提示临行前复核。";
    const expectedDates = requestedDates.map(isoDate);
    const minimumStops = input.pace === "轻松" ? 4 : input.pace === "充实" ? 6 : 5;
    const modeRule = input.tripMode === "leisure"
      ? `这是纯休闲旅行：每天均可完整安排，完全忽略 weekdayWindow，不得出现工作或出差表述。除非用户明确只玩半天，否则每一天必须从上午延续到傍晚或晚餐，至少包含${minimumStops}站，并分别出现上午（11:30前）、下午（14:00后）和傍晚（17:00后）的明确 HH:MM 时间。不能在午餐后就结束，也不能只给上午。`
      : `这是出差加游玩：工作日只能在“${input.weekdayWindow || "用户指定的晚间"}”安排活动；周末/休息日遵守“${input.weekendWindow || "全天可用"}”，若用户没有明确限制为半天，则周末也必须从上午覆盖到傍晚或晚餐，至少${minimumStops}站，不能只给上午。`;
    const commonRules = `1. ${modeRule} 2. ${verificationRule} 3. 路线按真实地理顺序安排，不走回头路；时间必须包含交通、排队、用餐和休息，前后连续且现实可行。4. 每段 Google Maps 链接使用 https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=...，地点使用完整可搜索名称；link.label 必须准确描述该链接的实际起点和终点，且不得出现 URL 编码。5. 只有确认是官方来源时才给 ticket 或 info 链接，所有链接必须使用 HTTPS。6. 严格执行 mustDo 和 constraints，并在 summary、distance 或 meta 中量化步行和体力安排。7. 输出简体中文和合法 JSON，不要附加 Markdown 或解释。`;
    const selectedSchema = isReplan ? replanSchema : schema;
    const schemaName = isReplan ? "replanned_day" : "travel_plan";

    async function callModel(prompt: string) {
      const jsonInstruction = structuredOutput === "json_object" ? `\nJSON 必须严格符合此结构：${JSON.stringify(selectedSchema)}` : "";
      const finalPrompt = `${prompt}\n${jsonInstruction}`;
      const responseBody = apiMode === "chat_completions"
        ? {
            model: ai.model,
            messages: [
              { role: "system", content: "You are the ROAM travel-planning agent. Use web_search for current facts. Never call web_extract, execute shell commands, or modify files. Ensure full-day chronological coverage when requested. Return valid JSON only." },
              { role: "user", content: finalPrompt },
            ],
            ...(ai.backend === "hermes" ? {} : {
              response_format: structuredOutput === "json_object"
                ? { type: "json_object" }
                : { type: "json_schema", json_schema: { name: schemaName, strict: true, schema: selectedSchema } },
            }),
          }
        : {
            model: ai.model,
            ...(webSearchEnabled ? { tools: [{ type: "web_search", search_context_size: "low" }] } : {}),
            input: finalPrompt,
            text: { format: { type: "json_schema", name: schemaName, strict: true, schema: selectedSchema } },
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
      return { parsed: parseModelJson(text), text };
    }

    if (isReplan) {
      const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 1200) : "";
      const dayId = typeof body.dayId === "string" ? body.dayId : "";
      const trip = body.trip;
      const currentDay = trip?.days?.find((day) => day.id === dayId);
      if (!instruction || !trip || !Array.isArray(trip.days) || !currentDay) return NextResponse.json({ error: "缺少需要调整的日期或修改要求。" }, { status: 400 });
      const prompt = `你正在局部修改一份已经生成的旅行计划，只能重写指定的一天，其他日期绝不能改变。\n用户资料：${JSON.stringify(input)}\n指定日期：${String(currentDay.date)}，day.id 必须保持为 ${dayId}\n当前当天计划：${JSON.stringify(currentDay)}\n用户的局部修改：${instruction}\n${commonRules}\n输出对象只能包含 day 字段。重排该日时间与路线，使新增地点自然插入且全天仍完整可执行；保留没有冲突的原有重点。`;
      let result = await callModel(prompt);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const wrapped = sanitizePlan({ days: [(result.parsed as { day?: unknown }).day] }) as { days?: unknown[] };
          const day = wrapped.days?.[0] as { id?: unknown; date?: unknown } | undefined;
          if (!day || day.id !== dayId || day.date !== currentDay.date) throw new Error("局部重规划改变了日期标识。");
          const candidate = { ...trip, days: trip.days.map((item) => item.id === dayId ? day : item) };
          validatePlan(candidate, input);
          return NextResponse.json({ plan: candidate, day, demo: false, backend: ai.backend });
        } catch (error) {
          if (attempt === 1) throw error;
          result = await callModel(`${prompt}\n上一版未通过校验：${error instanceof Error ? error.message : "格式错误"}。请修正，尤其确保全天时间覆盖、day.id/date 不变，并重新输出完整 day。`);
        }
      }
    }

    const prompt = `你是一位谨慎、懂路线优化的中文旅行规划师。根据用户资料生成可直接执行的逐日计划。\n用户资料：${JSON.stringify(input)}\n日期必须严格且仅覆盖 ${expectedDates.join("、")}，每天恰好一个 day；day.date 使用对应 YYYY-MM-DD，day.short 使用两位日期。\n${commonRules}\nnotice 用一句话说明已核验范围和临行前仍需复核的事项。最终回复只能是指定结构的 JSON。`;
    let result = await callModel(prompt);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const plan = sanitizePlan(result.parsed);
        return NextResponse.json({ plan: validatePlan(plan, input), demo: false, backend: ai.backend });
      } catch (error) {
        if (attempt === 1) throw error;
        result = await callModel(`${prompt}\n上一版未通过校验：${error instanceof Error ? error.message : "格式错误"}。请修正后重新输出完整计划；特别检查每个纯休闲日是否从上午覆盖到傍晚或晚餐。`);
      }
    }
    throw new Error("模型未能生成有效行程。");
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "智能体检索超时，请缩短日期范围或稍后重试。"
      : error instanceof Error ? error.message : "生成失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
