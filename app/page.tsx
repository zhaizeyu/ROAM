"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LinkItem = { label: string; url: string; kind?: "map" | "ticket" | "info" };
type PlaceImage = {
  url: string;
  alt: string;
  credit: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  provider: "Wikimedia Commons";
};
type Stop = {
  time: string;
  title: string;
  text: string;
  meta?: string;
  links?: LinkItem[];
  accent?: "red" | "gold" | "blue";
  imageQuery?: string;
  image?: PlaceImage;
};
type DayPlan = {
  id: string;
  short: string;
  date: string;
  weekday: string;
  title: string;
  summary: string;
  distance: string;
  stops: Stop[];
};
type TripResult = { destination: string; subtitle: string; base: string; dateLabel: string; notice: string; days: DayPlan[] };
type TripPersistence = { tripId: string; accessToken: string; version?: number };
type HistoryItem = TripPersistence & { destination: string; startDate: string; endDate: string; subtitle: string; version: number; updatedAt: string };
type AuthUser = { id: string; username: string; displayName: string; isTest: boolean };
type PlannerInput = {
  destination: string; base: string; startDate: string; endDate: string; tripMode: "work" | "leisure";
  weekdayWindow: string; weekendWindow: string; pace: string; interests: string[]; mustDo: string; constraints: string;
};
type EditorState = { kind: "edit"; index: number } | { kind: "insert"; index: number } | { kind: "replan" } | null;

const hotel = "Exe Convention Plaza Madrid";
const mapLink = (destination: string, mode = "transit", origin = hotel, waypoints = "") =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;

const samplePlans: DayPlan[] = [
  {
    id: "wed",
    short: "15",
    date: "2026-07-15",
    weekday: "周三",
    title: "抵达节奏",
    summary: "恢复体力，在酒店附近轻松吃饭，看第二场半决赛。",
    distance: "轻松 · 酒店周边",
    stops: [
      { time: "19:00", title: "回到酒店", text: "放下电脑和行李，先补水、冲澡，不再进市中心。", accent: "blue" },
      { time: "19:30", title: "Las Tablas 晚餐", text: "在酒店附近吃一顿简单晚餐，顺便购买水和周末所需用品。", links: [{ label: "查看附近餐厅", url: `https://www.google.com/maps/search/restaurants+near+${encodeURIComponent(hotel)}`, kind: "map" }] },
      { time: "21:00", title: "世界杯半决赛", text: "在酒店酒吧或房间观看英格兰—阿根廷，看看谁会成为西班牙决赛对手。", meta: "建议23:15前休息" },
    ],
  },
  {
    id: "thu",
    short: "16",
    date: "2026-07-16",
    weekday: "周四",
    title: "伯纳乌夜游",
    summary: "离酒店最近的一次城市夜游：球场外观、卡斯蒂利亚大道和晚餐。",
    distance: "约3 km步行",
    stops: [
      { time: "19:25", title: "酒店出发", text: "步行到 Las Tablas，乘L10至 Plaza de Castilla。因L10施工，在这里出站换免费S10接驳公交。", links: [{ label: "酒店 → 伯纳乌", url: mapLink("Santiago Bernabeu Stadium"), kind: "map" }], accent: "blue" },
      { time: "20:25", title: "伯纳乌球场", text: "从 Plaza de Lima 一侧开始绕球场拍照，看看新外立面和主入口。无需购买球场参观票。", meta: "停留约40分钟" },
      { time: "21:05", title: "卡斯蒂利亚大道", text: "沿 Paseo de la Castellana 向南走到 Nuevos Ministerios，感受马德里商务区夜景。", links: [{ label: "打开步行路线", url: mapLink("Nuevos Ministerios", "walking", "Santiago Bernabeu Stadium"), kind: "map" }] },
      { time: "21:30", title: "晚餐与返程", text: "在 Nuevos Ministerios 附近晚餐；22:20乘S10回 Plaza de Castilla，再换L10回 Las Tablas。", meta: "预计23:10回酒店" },
    ],
  },
  {
    id: "fri",
    short: "17",
    date: "2026-07-17",
    weekday: "周五",
    title: "老城与 Tapas",
    summary: "把太阳门、马约尔广场和 La Latina 串成一条不走回头路的晚间路线。",
    distance: "约3.5 km步行",
    stops: [
      { time: "19:25", title: "前往太阳门", text: "Las Tablas乘L10至 Plaza de Castilla，换L1直接到 Sol。", links: [{ label: "酒店 → 太阳门", url: mapLink("Puerta del Sol Madrid"), kind: "map" }], accent: "blue" },
      { time: "20:25", title: "太阳门", text: "看熊与草莓树、零公里标志；随后沿 Calle Mayor 前往马约尔广场。" },
      { time: "21:00", title: "老城经典路线", text: "Plaza Mayor → Mercado de San Miguel → Plaza de la Villa。圣米格尔市场适合参观，不必在里面正式吃饭。", links: [{ label: "完整步行路线", url: mapLink("La Latina Madrid", "walking", "Puerta del Sol", "Plaza Mayor Madrid|Mercado de San Miguel|Plaza de la Villa"), kind: "map" }] },
      { time: "22:00", title: "Cava Baja 吃 Tapas", text: "在 La Latina 选择一家看起来本地客人较多的小店，点2–3份共享小食即可。", meta: "23:00左右结束" },
      { time: "23:10", title: "返回酒店", text: "La Latina乘L5到 Gran Vía，换L1到 Plaza de Castilla，再换L10至 Las Tablas。", meta: "预计00:00前后回酒店" },
    ],
  },
  {
    id: "sat",
    short: "18",
    date: "2026-07-18",
    weekday: "周六",
    title: "王宫与日落",
    summary: "上午看王宫，下午回酒店避暑，晚上去德波神庙看马德里日落。",
    distance: "分两段 · 约6 km步行",
    stops: [
      { time: "09:00", title: "出发去王宫", text: "Las Tablas L10 → Plaza de Castilla；换L1到 Sol，再换L2到 Ópera。10:05前抵达王宫。", links: [{ label: "酒店 → 王宫", url: mapLink("Royal Palace of Madrid"), kind: "map" }], accent: "blue" },
      { time: "10:30", title: "马德里王宫", text: "选择自助参观，提前15分钟到 Calle de Bailén 的 Santiago拱门入口，不携带大包。", meta: "成人€18 · 约75分钟", links: [{ label: "购买官方门票", url: "https://tickets.patrimonionacional.es/en/tickets/palacio-real-de-madrid?city=MAD", kind: "ticket" }] },
      { time: "11:50", title: "教堂与观景台", text: "依次参观阿穆德纳主教座堂、免费的 Mirador de la Cornisa，再步行去 Plaza Mayor 午餐。", links: [{ label: "打开步行路线", url: mapLink("Plaza Mayor Madrid", "walking", "Royal Palace of Madrid", "Almudena Cathedral|Mirador de la Cornisa"), kind: "map" }] },
      { time: "14:00", title: "回酒店午休", text: "按 Sol → L1 Plaza de Castilla → L10 Las Tablas 返回，避开最热的下午。", meta: "15:00–18:30休息" },
      { time: "18:45", title: "前往西班牙广场", text: "L10到 Plaza de Castilla，换L1到 Tribunal，再换南段L10至 Plaza de España。", links: [{ label: "酒店 → 西班牙广场", url: mapLink("Plaza de Espana Madrid"), kind: "map" }], accent: "gold" },
      { time: "20:10", title: "德波神庙日落", text: "从西班牙广场步行至德波神庙，在西部公园散步，21:30左右找好位置等待日落。", links: [{ label: "日落步行路线", url: mapLink("Temple of Debod", "walking", "Plaza de Espana Madrid"), kind: "map" }], meta: "日落约21:40" },
      { time: "21:50", title: "晚餐与返程", text: "在 Plaza de España附近吃饭，23:00左右开始回酒店。" },
    ],
  },
  {
    id: "sun",
    short: "19",
    date: "2026-07-19",
    weekday: "周日",
    title: "普拉多与决赛",
    summary: "白天看普拉多；赛前到官方大屏拍照，比赛在有座位和食物的体育酒吧观看。",
    distance: "重点日 · 分段休息",
    stops: [
      { time: "08:50", title: "前往普拉多", text: "Las Tablas乘L10至 Plaza de Castilla，换L1直接到 Estación del Arte，步行约7分钟。", links: [{ label: "酒店 → 普拉多", url: mapLink("Museo Nacional del Prado"), kind: "map" }], accent: "blue" },
      { time: "10:30", title: "普拉多精选两小时", text: "重点看《人间乐园》、鲁本斯、委拉斯开兹《宫娥》和戈雅；不追求全部看完。", meta: "成人€15", links: [{ label: "购买官方门票", url: "https://entradas.museodelprado.es/", kind: "ticket" }] },
      { time: "12:30", title: "文学区午餐", text: "经过 CaixaForum 垂直花园，进入 Barrio de las Letras 午餐；14:15左右从 Sol返程。", links: [{ label: "普拉多 → 文学区", url: mapLink("Plaza de Santa Ana Madrid", "walking", "Museo Nacional del Prado", "CaixaForum Madrid"), kind: "map" }] },
      { time: "15:15", title: "回酒店休息", text: "休息、洗澡、给手机和充电宝充电。17:00提前吃一点东西，不要空腹去市区。", meta: "休息约2小时" },
      { time: "17:15", title: "前往官方户外大屏", text: "L10 → Plaza de Castilla；L1 → Tribunal；换南段L10到 Príncipe Pío，再步行至 Puente del Rey。", links: [{ label: "酒店 → 官方大屏", url: mapLink("Puente del Rey Madrid"), kind: "map" }], accent: "red" },
      { time: "18:15", title: "拍照与感受集结气氛", text: "在 Madrid Río 和入口外围拍大屏、国旗与球迷。不要正式入场，18:50按计划离开，避免连续站立4–5小时。", meta: "官方活动19:00开门" },
      { time: "18:50", title: "去 La Latina 体育酒吧", text: "步行回 Príncipe Pío，乘R支线一站到 Ópera，再步行至 Calle del Almendro 9。", links: [{ label: "大屏 → Sports Pub", url: mapLink("Calle del Almendro 9 Madrid", "transit", "Puente del Rey Madrid"), kind: "map" }], accent: "red" },
      { time: "19:30", title: "Sports Pub Madrid 入座", text: "提前吃晚餐，确认桌位可保留到整场比赛结束，包括可能的加时和点球。", meta: "6块屏幕 · 有厨房 · 必须预约", links: [{ label: "预约桌位", url: "https://bookvelt.app/locations/lalatina", kind: "ticket" }] },
      { time: "21:00", title: "世界杯决赛", text: "坐着吃东西看西班牙决赛，保留体力，也不用担心买水、厕所和暴晒。", meta: "可能延长至午夜", accent: "red" },
      { time: "赛后", title: "老城庆祝路线", text: "若西班牙夺冠，从酒吧步行经 Plaza Mayor 到 Puerta del Sol，跟随市中心人群庆祝；不再赶回即将关门的官方大屏。", links: [{ label: "打开庆祝路线", url: mapLink("Puerta del Sol Madrid", "walking", "Calle del Almendro 9 Madrid", "Plaza Mayor Madrid"), kind: "map" }], accent: "gold" },
    ],
  },
];

function RouteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 19 10l-4.5 4.5M5 19c0-5 2-9 7-9h7" /></svg>;
}
function TicketIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4V7.5Z"/><path d="M12 8.5v7" /></svg>;
}

function visualQuery(stop: Stop, destination: string) {
  if (stop.imageQuery?.trim()) return stop.imageQuery.trim();
  for (const link of stop.links ?? []) {
    try {
      const url = new URL(link.url);
      const mapped = url.hostname.includes("google.") && url.pathname.includes("/maps") && (url.searchParams.get("destination") ?? url.searchParams.get("query"));
      if (mapped) return `${mapped} ${destination}`;
    } catch { /* Ignore malformed links in older plans. */ }
  }
  const category = /餐|吃|美食|酒吧|咖啡|午餐|晚餐|早餐/i.test(`${stop.title} ${stop.text}`) ? "local food restaurant" : "landmark";
  return `${stop.title} ${category} ${destination}`;
}

function usablePlaceImage(image: PlaceImage | undefined): image is PlaceImage {
  return Boolean(image?.url && image.sourceUrl && !/\.(pdf|djvu|tiff?|svg|gif)(?:$|[?#])/i.test(image.sourceUrl));
}

function StopVisual({ stop, destination }: { stop: Stop; destination: string }) {
  const initialImage = usablePlaceImage(stop.image) ? stop.image : null;
  const [image, setImage] = useState<PlaceImage | null>(initialImage);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(initialImage ? "ready" : "loading");
  const query = useMemo(() => visualQuery(stop, destination), [destination, stop]);

  useEffect(() => {
    const savedImage = usablePlaceImage(stop.image) ? stop.image : null;
    setImage(savedImage);
    if (savedImage) { setStatus("ready"); return; }
    const controller = new AbortController();
    setStatus("loading");
    void fetch(`/api/place-image?q=${encodeURIComponent(query)}&v=2`, { signal: controller.signal, cache: "no-store" })
      .then(readJsonResponse)
      .then((data) => {
        const next = data.image as PlaceImage | null;
        setImage(next);
        setStatus(next ? "ready" : "empty");
      })
      .catch((error) => { if (error instanceof DOMException && error.name === "AbortError") return; setStatus("empty"); });
    return () => controller.abort();
  }, [query, stop.image]);

  return <figure className={`stop-visual ${status}`}>
    {image && status === "ready"
      ? <img src={image.url} alt={image.alt || `${stop.title}参考图`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setStatus("empty")}/>
      : <div className="stop-visual-fallback" aria-label={status === "loading" ? "正在加载参考图片" : "暂无可用参考图片"}>
          <span>{status === "loading" ? "正在寻找参考图" : destination.slice(0, 1) || "R"}</span><strong>{stop.title}</strong>
        </div>}
    <figcaption>
      <span>{status === "loading" ? "图片匹配中" : image && status === "ready" ? "地点参考图 · 以现场为准" : "暂无可授权图片 · 显示地点卡片"}</span>
      {image && status === "ready" && <span className="image-credit"><a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.provider}</a> · {image.credit} · {image.licenseUrl ? <a href={image.licenseUrl} target="_blank" rel="noreferrer">{image.license}</a> : image.license}</span>}
    </figcaption>
  </figure>;
}

const emptyInput: PlannerInput = {
  destination: "", base: "", startDate: "", endDate: "", tripMode: "work",
  weekdayWindow: "工作日19:00后", weekendWindow: "周末全天，下午可安排休息", pace: "适中",
  interests: [], mustDo: "", constraints: "",
};

const sampleInput: PlannerInput = {
  destination: "马德里", base: "Exe Convention Plaza Madrid", startDate: "2026-07-15", endDate: "2026-07-19",
  tripMode: "work", weekdayWindow: "工作日19:00后", weekendWindow: "周末全天，下午可回酒店休息", pace: "适中",
  interests: ["城市地标", "本地美食", "足球氛围"], mustDo: "周日晚上看世界杯决赛，想先拍官方户外大屏，再去有座位和食物的酒吧看球。",
  constraints: "不想连续站立超过1小时；尽量少走回头路。",
};

const interestOptions = ["城市地标", "博物馆", "本地美食", "历史建筑", "足球氛围", "街区漫步", "自然公园", "购物", "夜生活"];
const loadingStages = ["核对目的地与日期", "搜索官方开放和票务信息", "优化每天的地理顺序", "整理地图路线与最终计划"];
const blankStop = (): Stop => ({ time: "15:00", title: "", text: "", meta: "", links: [], accent: "blue" });

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch {
    const proxyError = text.trimStart().startsWith("<") || response.headers.get("content-type")?.includes("text/html");
    throw new Error(proxyError ? "网络代理暂时中断了规划请求，请稍后重试。" : "规划服务返回了无法解析的结果，请重新生成。");
  }
}

function getClientId() {
  const key = "roam-client-id";
  let value = window.localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); window.localStorage.setItem(key, value); }
  return value;
}

async function requestPlan(payload: unknown, signal?: AbortSignal) {
  const requestPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload, clientId: getClientId() } : payload;
  const started = await fetch("/api/plan/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestPayload), signal });
  const startData = await readJsonResponse(started);
  if (!started.ok) throw new Error(startData.error || "无法启动规划任务，请稍后重试。");
  const jobId = startData.jobId;
  if (typeof jobId !== "string") throw new Error("规划服务没有返回任务编号，请重新生成。");
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const response = await fetch(`/api/plan/jobs?id=${encodeURIComponent(jobId)}`, { cache: "no-store", signal });
    const data = await readJsonResponse(response);
    if (response.status === 202) continue;
    if (!response.ok) throw new Error(data.error || "生成失败，请稍后重试。");
    return data;
  }
  throw new Error("本次规划耗时过长，请缩短日期范围后重试。");
}

function PlannerHome({ form, onFormChange, onGenerated, onSample, onHistory, user, onLogout }: {
  form: PlannerInput;
  onFormChange: (next: PlannerInput) => void;
  onGenerated: (plan: TripResult, input: PlannerInput, persistence: TripPersistence) => void;
  onSample: () => void;
  onHistory: () => void;
  user: AuthUser;
  onLogout: () => void;
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const set = <K extends keyof PlannerInput>(key: K, value: PlannerInput[K]) => onFormChange({ ...form, [key]: value });
  const toggleInterest = (item: string) => set("interests", form.interests.includes(item) ? form.interests.filter((x) => x !== item) : [...form.interests, item]);

  useEffect(() => {
    if (!loading) { setLoadingStage(0); return; }
    const timers = [window.setTimeout(() => setLoadingStage(1), 7000), window.setTimeout(() => setLoadingStage(2), 19000), window.setTimeout(() => setLoadingStage(3), 38000)];
    return () => timers.forEach(window.clearTimeout);
  }, [loading]);

  async function generate() {
    setLoading(true); setError("");
    const controller = new AbortController();
    controllerRef.current = controller;
    const payload = { ...form, weekdayWindow: form.tripMode === "leisure" ? "" : form.weekdayWindow };
    try {
      const data = await requestPlan(payload, controller.signal);
      onGenerated(data.plan, form, { tripId: data.tripId, accessToken: data.accessToken, version: data.version });
    } catch (reason) {
      setError(reason instanceof DOMException && reason.name === "AbortError" ? "已取消本次生成，你可以修改需求后重新开始。" : reason instanceof Error ? reason.message : "生成失败，请稍后重试。");
    } finally { controllerRef.current = null; setLoading(false); }
  }

  function cancelGeneration() { controllerRef.current?.abort(); }

  return <main className="planner-page">
    <nav className="product-nav">
      <div className="product-brand"><span>R</span><strong>ROAM</strong><small>AI TRIP PLANNER</small></div>
      <div className="planner-nav-actions"><span className="user-pill">{user.displayName}</span><button onClick={onHistory}>历史行程</button><button onClick={onSample}>马德里示例 <span>↗</span></button><button onClick={onLogout}>退出</button></div>
    </nav>
    <section className="planner-hero">
      <div className="planner-intro">
        <div className="planner-kicker"><i/> 不是攻略清单，是你真正走得完的路线</div>
        <h1>说说你想去哪，<br/><em>剩下的交给我们。</em></h1>
        <p>结合你的时间、体力与兴趣，生成逐小时行程、Google Maps 路线和官方购票入口。</p>
        <div className="trust-row"><span>✓ 工作日时间感知</span><span>✓ 路线顺序优化</span><span>✓ 可随时缩短</span></div>
      </div>

      <div className="planner-card">
        <div className="step-head"><div><small>创建新旅程</small><strong>第 {step} 步，共 3 步</strong></div><span>{step === 1 ? "基本信息" : step === 2 ? "时间与节奏" : "兴趣与愿望"}</span></div>
        <div className="step-track"><i style={{ width: `${step * 33.333}%` }}/></div>

        {step === 1 && <div className="form-step">
          <label className="field full"><span>你想去哪里？</span><input value={form.destination} onChange={(e) => set("destination", e.target.value)} placeholder="城市或地区，例如：马德里"/></label>
          <label className="field full"><span>住在哪里？ <small>可稍后决定</small></span><input value={form.base} onChange={(e) => set("base", e.target.value)} placeholder="酒店、街区或地址"/></label>
          <div className="field-pair"><label className="field"><span>开始日期</span><input type="date" value={form.startDate} onInput={(e) => set("startDate", e.currentTarget.value)} onChange={(e) => set("startDate", e.target.value)}/></label><label className="field"><span>结束日期</span><input type="date" value={form.endDate} min={form.startDate} onInput={(e) => set("endDate", e.currentTarget.value)} onChange={(e) => set("endDate", e.target.value)}/></label></div>
        </div>}
        {step === 2 && <div className="form-step">
          <div className="field full"><span className="field-label">这次是什么旅行？</span><div className="choice-grid"><button className={form.tripMode === "work" ? "selected" : ""} onClick={() => set("tripMode", "work")}><b>💼 出差 + 游玩</b><small>工作日只安排下班后</small></button><button className={form.tripMode === "leisure" ? "selected" : ""} onClick={() => set("tripMode", "leisure")}><b>🌤 纯休闲旅行</b><small>每天都可以完整安排</small></button></div></div>
          {form.tripMode === "work" && <label className="field full"><span>工作日可用时间</span><input value={form.weekdayWindow} onChange={(e) => set("weekdayWindow", e.target.value)} placeholder="例如：每天 19:00 以后"/></label>}
          <label className="field full"><span>{form.tripMode === "work" ? "周末 / 休息日" : "每天可用时间 / 休息偏好"}</span><input value={form.weekendWindow} onChange={(e) => set("weekendWindow", e.target.value)} placeholder={form.tripMode === "work" ? "例如：全天，但下午想午休" : "例如：每天全天，下午安排一次休息"}/></label>
          <div className="field full"><span className="field-label">旅行节奏</span><div className="pace-options">{["轻松", "适中", "充实"].map((item) => <button key={item} className={form.pace === item ? "selected" : ""} onClick={() => set("pace", item)}>{item}</button>)}</div></div>
        </div>}
        {step === 3 && <div className="form-step">
          <div className="field full"><span className="field-label">你喜欢什么？ <small>可多选</small></span><div className="chips">{interestOptions.map((item) => <button key={item} className={form.interests.includes(item) ? "selected" : ""} onClick={() => toggleInterest(item)}>{form.interests.includes(item) ? "✓ " : "+ "}{item}</button>)}</div></div>
          <label className="field full"><span>一定想做的事 / 特别活动</span><textarea value={form.mustDo} onChange={(e) => set("mustDo", e.target.value)} placeholder="例如：周日晚上看比赛，想去有氛围的酒吧"/></label>
          <label className="field full"><span>体力、饮食或其他限制</span><input value={form.constraints} onChange={(e) => set("constraints", e.target.value)} placeholder="例如：不想站太久、少走路、不吃辣"/></label>
        </div>}

        {loading && <div className="generation-status" aria-live="polite">
          <div className="generation-status-head"><div><i className="spinner dark"/><strong>{loadingStages[loadingStage]}</strong></div><span>通常需要 45–90 秒</span></div>
          <div className="generation-steps">{loadingStages.map((item, index) => <span key={item} className={index < loadingStage ? "done" : index === loadingStage ? "active" : ""}>{index < loadingStage ? "✓" : index + 1}<small>{item}</small></span>)}</div>
          <p>正在优先核验官方来源并规划不走回头路的路线，请保持页面开启。</p>
        </div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions">
          {loading ? <button className="cancel" onClick={cancelGeneration}>取消生成</button> : <>
            {step > 1 && <button className="back" onClick={() => setStep(step - 1)}>← 上一步</button>}
            {step < 3 ? <button className="next" disabled={step === 1 && (!form.destination || !form.startDate || !form.endDate)} onClick={() => setStep(step + 1)}>继续 <span>→</span></button> : <button className="generate" onClick={generate}>生成我的完整行程 <span>✦</span></button>}
          </>}
        </div>
        <div className="privacy-note">🔒 你的 LLM 密钥只保存在服务器端，不会发送到浏览器。</div>
      </div>
    </section>
    <section className="product-proof">
      <div><b>01</b><strong>先问清楚</strong><p>目的地、日期、工作时间、节奏与限制，一次收集完整。</p></div>
      <div><b>02</b><strong>实时规划</strong><p>AI 检索最新开放信息，按地理顺序生成不过度的路线。</p></div>
      <div><b>03</b><strong>直接出发</strong><p>每段路线一键打开 Google Maps，门票只链接官方入口。</p></div>
    </section>
  </main>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(path: string, payload: Record<string, unknown>) {
    setLoading(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "操作失败，请稍后重试。");
      onAuthenticated(data.user as AuthUser);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请稍后重试。"); }
    finally { setLoading(false); }
  }

  return <main className="auth-page">
    <section className="auth-story">
      <div className="product-brand auth-brand"><span>R</span><strong>ROAM</strong><small>AI TRIP PLANNER</small></div>
      <div><span className="auth-kicker">YOUR JOURNEY, REMEMBERED</span><h1>一份行程，<br/><em>在每台设备继续。</em></h1><p>登录后，生成的路线、每次编辑和 AI 局部重规划都会安全归属于你的账号。</p></div>
      <div className="auth-benefits"><span>✓ 跨浏览器查看历史</span><span>✓ 修改自动保存版本</span><span>✓ 完整链接仍可分享</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>登录</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>注册</button></div>
        <div className="auth-heading"><small>{mode === "login" ? "欢迎回来" : "创建你的 ROAM 账号"}</small><h2>{mode === "login" ? "继续规划下一段旅程" : "让每次出发都有记录"}</h2></div>
        {mode === "login" && <div className="test-login-box"><div><span>测试账号已预置</span><strong>ROAM 测试用户</strong><small>无需输入用户名或密码</small></div><button disabled={loading} onClick={() => void submit("/api/auth/login", { mode: "test" })}>{loading ? "正在登录…" : "确定并进入 →"}</button></div>}
        {mode === "login" && <div className="auth-divider"><span>或使用自己的账号</span></div>}
        <div className="auth-fields">
          {mode === "register" && <label><span>显示名称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：小宇" autoComplete="name"/></label>}
          <label><span>用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3–32位中文、字母或数字" autoComplete="username"/></label>
          <label><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "至少8位" : "输入你的密码"} autoComplete={mode === "register" ? "new-password" : "current-password"}/></label>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={loading || !username.trim() || !password} onClick={() => void submit(mode === "login" ? "/api/auth/login" : "/api/auth/register", mode === "login" ? { username, password } : { username, displayName, password })}>{loading ? "请稍候…" : mode === "login" ? "登录账号" : "注册并登录"}</button>
        <p className="auth-note">测试模式下可使用共享测试账号；正式用户的行程按账号隔离。</p>
      </div>
    </section>
  </main>;
}

function HistoryModal({ open, loading, error, trips, onClose, onOpen }: {
  open: boolean;
  loading: boolean;
  error: string;
  trips: HistoryItem[];
  onClose: () => void;
  onOpen: (trip: HistoryItem) => void;
}) {
  if (!open) return null;
  return <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="trip-editor history-panel" role="dialog" aria-modal="true" aria-label="历史行程">
      <div className="editor-head"><div><small>ROAM 行程档案</small><h2>历史行程</h2></div><button onClick={onClose} aria-label="关闭历史行程">×</button></div>
      <p className="history-intro">生成和编辑后的最新版本都保存在数据库中。此列表只显示当前登录账号的行程。</p>
      {loading && <div className="history-state"><i className="spinner"/> 正在读取行程...</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!loading && !error && trips.length === 0 && <div className="history-empty"><b>还没有保存的行程</b><span>完成第一次 AI 规划后，它会出现在这里。</span></div>}
      <div className="history-list">{trips.map((item) => <button key={item.tripId} onClick={() => onOpen(item)}>
        <span className="history-place">{item.destination.slice(0, 1)}</span>
        <div><strong>{item.destination}</strong><small>{item.startDate} — {item.endDate}</small><p>{item.subtitle}</p></div>
        <span className="history-version">V{item.version}<small>{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</small></span>
      </button>)}</div>
    </section>
  </div>;
}

export default function Home() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<"planner" | "result">("planner");
  const [form, setForm] = useState<PlannerInput>(emptyInput);
  const [lastInput, setLastInput] = useState<PlannerInput>(emptyInput);
  const [trip, setTrip] = useState<TripResult>({ destination: "马德里", subtitle: "5天 · 2个重点景点 · 1场世界杯决赛", base: hotel, dateLabel: "15—19 JUL · 2026", notice: "L10施工提醒：Plaza de Castilla—Nuevos Ministerios停运。市中心方向在 Plaza de Castilla 换L1。", days: samplePlans });
  const [active, setActive] = useState("wed");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<EditorState>(null);
  const [draftStop, setDraftStop] = useState<Stop>(blankStop);
  const [aiInstruction, setAiInstruction] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [tripId, setTripId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyTrips, setHistoryTrips] = useState<HistoryItem[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const restoredLinkRef = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("madrid-trip-done");
    if (saved) setDone(JSON.parse(saved));
    const key = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
    const date = new Date().getDate();
    if (date >= 15 && date <= 19 && samplePlans.some((p) => p.id === key)) setActive(key);

    void fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      const data = await readJsonResponse(response);
      setAuthUser(response.ok ? data.user as AuthUser : null);
    }).catch(() => setAuthUser(null)).finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!authUser || authLoading || restoredLinkRef.current) return;
    restoredLinkRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const savedTripId = params.get("trip");
    const keyToken = params.get("key");
    if (savedTripId) void loadTrip(savedTripId, keyToken ?? "");
  }, [authLoading, authUser]);

  const plans = trip.days;
  const current = useMemo(() => plans.find((p) => p.id === active) ?? plans[0], [active, plans]);
  const completed = Object.values(done).filter(Boolean).length;
  const total = plans.reduce((sum, day) => sum + day.stops.length, 0);

  function toggle(key: string) {
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    window.localStorage.setItem(`roam-trip-done:${trip.destination}:${trip.dateLabel}`, JSON.stringify(next));
  }

  function setPermanentLink(id: string, token: string) {
    const url = new URL(window.location.href);
    if (id && token) { url.searchParams.set("trip", id); url.searchParams.set("key", token); }
    else { url.searchParams.delete("trip"); url.searchParams.delete("key"); }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function showPlan(plan: TripResult, input: PlannerInput, persistence?: TripPersistence) {
    setTrip(plan); setLastInput(input); setActive(plan.days[0].id); setDone({}); setView("result"); setSaveState(persistence ? "saved" : "idle");
    setTripId(persistence?.tripId ?? ""); setAccessToken(persistence?.accessToken ?? "");
    if (persistence) setPermanentLink(persistence.tripId, persistence.accessToken); else setPermanentLink("", "");
    window.scrollTo({ top: 0 });
  }
  function showSample() {
    setForm(sampleInput);
    showPlan({ destination: "马德里", subtitle: "5天 · 2个重点景点 · 1场世界杯决赛", base: hotel, dateLabel: "15—19 JUL · 2026", notice: "L10施工提醒：Plaza de Castilla—Nuevos Ministerios停运。市中心方向在 Plaza de Castilla 换L1。", days: samplePlans }, sampleInput);
  }
  function startNewPlan() { setForm(emptyInput); setLastInput(emptyInput); setTripId(""); setAccessToken(""); setPermanentLink("", ""); setView("planner"); window.scrollTo({ top: 0 }); }
  function editPlan() { setForm(lastInput); setView("planner"); window.scrollTo({ top: 0 }); }
  function persistManual(nextTrip: TripResult, instruction: string) {
    if (!tripId || !accessToken) return;
    setSaveState("saving");
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, clientId: getClientId(), plan: nextTrip, instruction }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "保存修改失败。");
      setSaveState("saved");
    }).catch((error) => { console.error(error); setSaveState("error"); });
  }
  function updateCurrentDay(nextDay: DayPlan, instruction = "网页手工编辑当天行程") {
    const nextTrip = { ...trip, days: trip.days.map((day) => day.id === nextDay.id ? nextDay : day) };
    setTrip(nextTrip);
    persistManual(nextTrip, instruction);
    setDone({});
  }
  async function loadTrip(id: string, token: string) {
    try {
      setHistoryLoading(true); setHistoryError("");
      const query = new URLSearchParams({ clientId: getClientId() });
      if (token) query.set("key", token);
      const response = await fetch(`/api/trips/${encodeURIComponent(id)}?${query}`, { cache: "no-store" });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "无法打开这份行程。");
      const input = data.input as PlannerInput;
      showPlan(data.plan as TripResult, input, { tripId: data.tripId, accessToken: data.accessToken, version: data.version });
      setHistoryOpen(false);
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "无法打开这份行程。"); if (!historyOpen) setHistoryOpen(true); }
    finally { setHistoryLoading(false); }
  }
  async function openHistory() {
    setHistoryOpen(true); setHistoryLoading(true); setHistoryError("");
    try {
      const response = await fetch("/api/trips", { cache: "no-store" });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "无法读取历史行程。");
      setHistoryTrips((data.trips as Array<Record<string, unknown>>).map((item) => ({
        tripId: String(item.id), accessToken: String(item.accessToken), destination: String(item.destination),
        startDate: String(item.startDate).slice(0, 10), endDate: String(item.endDate).slice(0, 10), subtitle: String(item.subtitle),
        version: Number(item.version), updatedAt: String(item.updatedAt),
      })));
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "无法读取历史行程。"); }
    finally { setHistoryLoading(false); }
  }
  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
    setAuthUser(null); setHistoryOpen(false); setView("planner"); setTripId(""); setAccessToken("");
    restoredLinkRef.current = false;
  }
  function openEdit(index: number) { setDraftStop(structuredClone(current.stops[index])); setEditorError(""); setEditor({ kind: "edit", index }); }
  function openInsert(index: number) {
    const previousTime = current.stops[index - 1]?.time;
    setDraftStop({ ...blankStop(), time: /^\d{2}:\d{2}$/.test(previousTime ?? "") ? previousTime! : "15:00" });
    setAiInstruction(""); setEditorError(""); setEditor({ kind: "insert", index });
  }
  function openReplan() { setAiInstruction(""); setEditorError(""); setEditor({ kind: "replan" }); }
  function closeEditor() { if (!editorLoading) { setEditor(null); setEditorError(""); } }
  function saveStop() {
    if (!editor || editor.kind === "replan" || !draftStop.time.trim() || !draftStop.title.trim() || !draftStop.text.trim()) {
      setEditorError("请填写时间、地点名称和具体说明。"); return;
    }
    const stops = [...current.stops];
    const normalized = { ...draftStop, time: draftStop.time.trim(), title: draftStop.title.trim(), text: draftStop.text.trim(), meta: draftStop.meta?.trim() };
    if (editor.kind === "edit") stops[editor.index] = normalized;
    else stops.splice(editor.index, 0, { ...normalized, links: [{ label: `在地图中查看${normalized.title}`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${normalized.title} ${trip.destination}`)}`, kind: "map" }] });
    updateCurrentDay({ ...current, stops }, editor.kind === "edit" ? `编辑站点：${normalized.title}` : `插入站点：${normalized.title}`); closeEditor();
  }
  function removeStop(index: number) {
    if (current.stops.length <= 2 || !window.confirm(`确定删除“${current.stops[index].title}”吗？`)) return;
    updateCurrentDay({ ...current, stops: current.stops.filter((_, itemIndex) => itemIndex !== index) }, `删除站点：${current.stops[index].title}`);
  }
  function moveStop(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= current.stops.length) return;
    const stops = [...current.stops];
    [stops[index], stops[target]] = [stops[target], stops[index]];
    updateCurrentDay({ ...current, stops }, `调整站点顺序：${current.stops[index].title}`);
  }
  async function replanDay() {
    if (!editor || !aiInstruction.trim() && !(editor.kind === "insert" && draftStop.title.trim())) { setEditorError("请告诉 AI 想怎样调整当天路线。"); return; }
    setEditorLoading(true); setEditorError("");
    const instruction = editor.kind === "insert"
      ? `在第 ${editor.index} 个位置插入“${draftStop.title.trim()}”。期望时间：${draftStop.time.trim() || "由你安排"}。补充说明：${draftStop.text.trim() || "无"}。${aiInstruction.trim()}`
      : aiInstruction.trim();
    try {
      if (!tripId || !accessToken) throw new Error("示例行程不能保存 AI 调整，请先生成一份自己的行程。");
      const data = await requestPlan({ action: "replan-day", input: lastInput, trip, dayId: current.id, instruction, tripId, accessToken });
      setTrip(data.plan); setTripId(data.tripId); setAccessToken(data.accessToken); setPermanentLink(data.tripId, data.accessToken); setSaveState("saved"); setDone({}); setEditor(null);
    } catch (reason) { setEditorError(reason instanceof Error ? reason.message : "局部重规划失败，请稍后重试。"); }
    finally { setEditorLoading(false); }
  }

  const historyModal = <HistoryModal open={historyOpen} loading={historyLoading} error={historyError} trips={historyTrips} onClose={() => setHistoryOpen(false)} onOpen={(item) => void loadTrip(item.tripId, item.accessToken)}/>;

  if (authLoading) return <main className="auth-loading"><div className="product-brand"><span>R</span><strong>ROAM</strong></div><i className="spinner dark"/><p>正在连接你的行程档案...</p></main>;
  if (!authUser) return <AuthScreen onAuthenticated={(user) => { restoredLinkRef.current = false; setAuthUser(user); }}/>;
  if (view === "planner") return <><PlannerHome form={form} onFormChange={setForm} onGenerated={showPlan} onSample={showSample} onHistory={() => void openHistory()} user={authUser} onLogout={() => void logout()}/>{historyModal}</>;

  return (
    <main>
      <header className="hero">
        <div className="hero-art" aria-hidden="true"><span className="sun"/><span className="route-line one"/><span className="route-line two"/><span className="pin">{trip.destination.slice(0, 1)}</span></div>
        <nav className="topbar">
          <div className="brand"><span>R</span> ROAM · {trip.destination.toUpperCase()}</div>
          <div className="result-nav"><span className="result-user">{authUser.displayName}</span><button onClick={() => void openHistory()}>历史行程</button><button onClick={startNewPlan}>＋ 新建行程</button><button onClick={() => void logout()}>退出</button><div className="trip-dates">{trip.dateLabel}</div></div>
        </nav>
        <div className="hero-copy">
          <div className="eyebrow">{lastInput.tripMode === "work" ? "出差中的城市漫游" : "属于你的城市假期"}</div>
          <h1>把时间留给风景，<br/><em>路线交给 ROAM。</em></h1>
          <p>{trip.subtitle}</p>
        </div>
        <div className="hotel-card">
          <span className="hotel-dot"/>
          <div><small>你的基地</small><strong>{trip.base}</strong><span>{trip.destination} · 行程起点</span></div>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.base)}`} target="_blank" rel="noreferrer" aria-label="在地图中打开住处"><RouteIcon/></a>
        </div>
      </header>

      <section className="service-alert" aria-label="重要交通提醒">
        <div className="alert-mark">!</div>
        <div><strong>出发前提醒</strong><p>{trip.notice}</p></div>
        <div className="save-status" data-state={saveState}>{saveState === "saving" ? "正在保存…" : saveState === "error" ? "保存失败" : tripId ? "✓ 已保存到云端" : "示例行程"}</div><button className="edit-plan" onClick={editPlan}>编辑需求</button>
      </section>

      <div className="app-shell">
        <aside className="day-rail">
          <div className="rail-label">每日计划</div>
          {plans.map((day) => (
            <button key={day.id} className={active === day.id ? "active" : ""} onClick={() => setActive(day.id)}>
              <span>{day.short}</span><div><strong>{day.weekday}</strong><small>{day.title}</small></div>
            </button>
          ))}
          <div className="progress-card">
            <div><span>行程进度</span><strong>{completed}/{total}</strong></div>
            <div className="progress-track"><i style={{ width: `${total ? (completed / total) * 100 : 0}%` }}/></div>
            <small>点击每一站左侧圆点可标记完成</small>
          </div>
        </aside>

        <section className="day-content" key={current.id}>
          <div className="mobile-days">
            {plans.map((day) => <button key={day.id} onClick={() => setActive(day.id)} className={active === day.id ? "active" : ""}><b>{day.short}</b><span>{day.weekday}</span></button>)}
          </div>
          <div className="day-heading">
            <div><span>{current.date} · {current.weekday}</span><h2>{current.title}</h2><p>{current.summary}</p></div>
            <div className="day-tools"><div className="pace"><small>当天强度</small><strong>{current.distance}</strong></div><button onClick={openReplan}>✦ AI 调整当天</button></div>
          </div>

          <div className="timeline">
            {current.stops.map((stop, index) => {
              const key = `${current.id}-${index}`;
              return (
                <article className={`stop ${done[key] ? "done" : ""}`} key={key}>
                  <button className="check" onClick={() => toggle(key)} aria-label={done[key] ? "取消完成" : "标记完成"}>{done[key] ? "✓" : ""}</button>
                  <div className={`time ${stop.accent ?? ""}`}>{stop.time}</div>
                  <div className="stop-card">
                    <StopVisual stop={stop} destination={trip.destination}/>
                    <div className="stop-top"><h3>{stop.title}</h3>{stop.meta && <span>{stop.meta}</span>}</div>
                    <p>{stop.text}</p>
                    {stop.links && <div className="actions">{stop.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className={link.kind ?? "map"}>{link.kind === "ticket" ? <TicketIcon/> : <RouteIcon/>}{link.label}<span>↗</span></a>)}</div>}
                    <div className="stop-edit-tools"><button onClick={() => openEdit(index)}>编辑</button><button onClick={() => moveStop(index, -1)} disabled={index === 0}>↑ 上移</button><button onClick={() => moveStop(index, 1)} disabled={index === current.stops.length - 1}>↓ 下移</button><button onClick={() => openInsert(index + 1)}>＋ 接着插入</button><button className="danger" onClick={() => removeStop(index)}>删除</button></div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {editor && <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
        <section className="trip-editor" role="dialog" aria-modal="true" aria-label={editor.kind === "edit" ? "编辑行程站点" : editor.kind === "insert" ? "插入行程站点" : "AI 调整当天"}>
          <div className="editor-head"><div><small>ROAM 行程编辑器</small><h2>{editor.kind === "edit" ? "编辑这一站" : editor.kind === "insert" ? "插入一个地点" : `调整 ${current.date} 的路线`}</h2></div><button onClick={closeEditor} aria-label="关闭编辑器">×</button></div>
          {editor.kind !== "replan" && <div className="editor-fields">
            <label><span>时间</span><input value={draftStop.time} onChange={(event) => setDraftStop({ ...draftStop, time: event.target.value })} placeholder="例如 15:30"/></label>
            <label><span>地点 / 活动名称</span><input value={draftStop.title} onChange={(event) => setDraftStop({ ...draftStop, title: event.target.value })} placeholder="例如 塞切尼温泉"/></label>
            <label className="wide"><span>具体说明</span><textarea value={draftStop.text} onChange={(event) => setDraftStop({ ...draftStop, text: event.target.value })} placeholder="停留多久、想做什么、交通或用餐要求"/></label>
            <label className="wide"><span>时间 / 体力备注</span><input value={draftStop.meta ?? ""} onChange={(event) => setDraftStop({ ...draftStop, meta: event.target.value })} placeholder="例如 停留约90分钟 · 可坐下休息"/></label>
          </div>}
          {editor.kind !== "edit" && <label className="editor-ai"><span>{editor.kind === "insert" ? "交给 AI 的补充要求（可选）" : "你想怎样修改当天？"}</span><textarea value={aiInstruction} onChange={(event) => setAiInstruction(event.target.value)} placeholder={editor.kind === "insert" ? "例如：插入后仍要保留晚餐，避免跨城折返" : "例如：下午加入塞切尼温泉，减少步行，晚餐安排在20:00前"}/></label>}
          <div className="editor-note">修改会自动保存到数据库并生成新版本；AI 局部重规划只会替换这一天。</div>
          {editorError && <div className="form-error" role="alert">{editorError}</div>}
          <div className="editor-actions"><button className="secondary" onClick={closeEditor}>取消</button>{editor.kind !== "replan" && <button className="secondary" onClick={saveStop}>直接保存</button>}{editor.kind !== "edit" && <button className="primary" disabled={editorLoading} onClick={replanDay}>{editorLoading ? <><i className="spinner"/> AI 正在重排当天...</> : <>✦ AI {editor.kind === "insert" ? "插入并优化" : "局部重规划"}</>}</button>}</div>
        </section>
      </div>}

      <section className="quick-guide">
        <div className="guide-intro"><span>随身指南</span><h2>出门之前，<br/>记住这四件事。</h2></div>
        <div className="guide-grid">
          <div><b>01</b><strong>实时路线</strong><p>出发前再打开 Google Maps，按当时的交通和步行时间选择路线。</p></div>
          <div><b>02</b><strong>体力余量</strong><p>每两小时安排一次坐下休息；行程变慢时，优先保留当天重点项目。</p></div>
          <div><b>03</b><strong>官方门票</strong><p>购票前确认域名、日期与退改规则，把二维码同时保存到手机本地。</p></div>
          <div><b>04</b><strong>随时调整</strong><p>天气、闭馆和活动可能变化；临出发前复核，不必勉强完成所有站点。</p></div>
        </div>
      </section>

      {historyModal}

      <footer><div className="brand"><span>R</span> ROAM</div><p>旅途可以有重点，也可以有余地。</p><a href="#top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>回到顶部 ↑</a></footer>
    </main>
  );
}
