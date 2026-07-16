"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LinkItem = { label: string; url: string; kind?: "map" | "ticket" | "info" };
type Stop = {
  time: string;
  title: string;
  text: string;
  meta?: string;
  links?: LinkItem[];
  accent?: "red" | "gold" | "blue";
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
type PlannerInput = {
  destination: string; base: string; startDate: string; endDate: string; tripMode: "work" | "leisure";
  weekdayWindow: string; weekendWindow: string; pace: string; interests: string[]; mustDo: string; constraints: string;
};

const hotel = "Exe Convention Plaza Madrid";
const mapLink = (destination: string, mode = "transit", origin = hotel, waypoints = "") =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;

const samplePlans: DayPlan[] = [
  {
    id: "wed",
    short: "15",
    date: "7月15日",
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
    date: "7月16日",
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
    date: "7月17日",
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
    date: "7月18日",
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
    date: "7月19日",
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

function PlannerHome({ form, onFormChange, onGenerated, onSample }: {
  form: PlannerInput;
  onFormChange: (next: PlannerInput) => void;
  onGenerated: (plan: TripResult, input: PlannerInput) => void;
  onSample: () => void;
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
      const response = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败，请稍后重试。");
      onGenerated(data.plan, form);
    } catch (reason) {
      setError(reason instanceof DOMException && reason.name === "AbortError" ? "已取消本次生成，你可以修改需求后重新开始。" : reason instanceof Error ? reason.message : "生成失败，请稍后重试。");
    } finally { controllerRef.current = null; setLoading(false); }
  }

  function cancelGeneration() { controllerRef.current?.abort(); }

  return <main className="planner-page">
    <nav className="product-nav">
      <div className="product-brand"><span>R</span><strong>ROAM</strong><small>AI TRIP PLANNER</small></div>
      <button onClick={onSample}>查看马德里示例 <span>↗</span></button>
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

export default function Home() {
  const [view, setView] = useState<"planner" | "result">("planner");
  const [form, setForm] = useState<PlannerInput>(emptyInput);
  const [lastInput, setLastInput] = useState<PlannerInput>(emptyInput);
  const [trip, setTrip] = useState<TripResult>({ destination: "马德里", subtitle: "5天 · 2个重点景点 · 1场世界杯决赛", base: hotel, dateLabel: "15—19 JUL · 2026", notice: "L10施工提醒：Plaza de Castilla—Nuevos Ministerios停运。市中心方向在 Plaza de Castilla 换L1。", days: samplePlans });
  const [active, setActive] = useState("wed");
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = window.localStorage.getItem("madrid-trip-done");
    if (saved) setDone(JSON.parse(saved));
    const key = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
    const date = new Date().getDate();
    if (date >= 15 && date <= 19 && samplePlans.some((p) => p.id === key)) setActive(key);
  }, []);

  const plans = trip.days;
  const current = useMemo(() => plans.find((p) => p.id === active) ?? plans[0], [active, plans]);
  const completed = Object.values(done).filter(Boolean).length;
  const total = plans.reduce((sum, day) => sum + day.stops.length, 0);

  function toggle(key: string) {
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    window.localStorage.setItem(`roam-trip-done:${trip.destination}:${trip.dateLabel}`, JSON.stringify(next));
  }

  function showPlan(plan: TripResult, input: PlannerInput) { setTrip(plan); setLastInput(input); setActive(plan.days[0].id); setDone({}); setView("result"); window.scrollTo({ top: 0 }); }
  function showSample() {
    setForm(sampleInput);
    showPlan({ destination: "马德里", subtitle: "5天 · 2个重点景点 · 1场世界杯决赛", base: hotel, dateLabel: "15—19 JUL · 2026", notice: "L10施工提醒：Plaza de Castilla—Nuevos Ministerios停运。市中心方向在 Plaza de Castilla 换L1。", days: samplePlans }, sampleInput);
  }
  function startNewPlan() { setForm(emptyInput); setLastInput(emptyInput); setView("planner"); window.scrollTo({ top: 0 }); }
  function editPlan() { setForm(lastInput); setView("planner"); window.scrollTo({ top: 0 }); }

  if (view === "planner") return <PlannerHome form={form} onFormChange={setForm} onGenerated={showPlan} onSample={showSample}/>;

  return (
    <main>
      <header className="hero">
        <div className="hero-art" aria-hidden="true"><span className="sun"/><span className="route-line one"/><span className="route-line two"/><span className="pin">{trip.destination.slice(0, 1)}</span></div>
        <nav className="topbar">
          <div className="brand"><span>R</span> ROAM · {trip.destination.toUpperCase()}</div>
          <div className="result-nav"><button onClick={startNewPlan}>＋ 新建行程</button><div className="trip-dates">{trip.dateLabel}</div></div>
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
        <button className="edit-plan" onClick={editPlan}>编辑需求</button>
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
            <div className="pace"><small>当天强度</small><strong>{current.distance}</strong></div>
          </div>

          <div className="timeline">
            {current.stops.map((stop, index) => {
              const key = `${current.id}-${index}`;
              return (
                <article className={`stop ${done[key] ? "done" : ""}`} key={key}>
                  <button className="check" onClick={() => toggle(key)} aria-label={done[key] ? "取消完成" : "标记完成"}>{done[key] ? "✓" : ""}</button>
                  <div className={`time ${stop.accent ?? ""}`}>{stop.time}</div>
                  <div className="stop-card">
                    <div className="stop-top"><h3>{stop.title}</h3>{stop.meta && <span>{stop.meta}</span>}</div>
                    <p>{stop.text}</p>
                    {stop.links && <div className="actions">{stop.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className={link.kind ?? "map"}>{link.kind === "ticket" ? <TicketIcon/> : <RouteIcon/>}{link.label}<span>↗</span></a>)}</div>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <section className="quick-guide">
        <div className="guide-intro"><span>随身指南</span><h2>出门之前，<br/>记住这四件事。</h2></div>
        <div className="guide-grid">
          <div><b>01</b><strong>实时路线</strong><p>出发前再打开 Google Maps，按当时的交通和步行时间选择路线。</p></div>
          <div><b>02</b><strong>体力余量</strong><p>每两小时安排一次坐下休息；行程变慢时，优先保留当天重点项目。</p></div>
          <div><b>03</b><strong>官方门票</strong><p>购票前确认域名、日期与退改规则，把二维码同时保存到手机本地。</p></div>
          <div><b>04</b><strong>随时调整</strong><p>天气、闭馆和活动可能变化；临出发前复核，不必勉强完成所有站点。</p></div>
        </div>
      </section>

      <footer><div className="brand"><span>R</span> ROAM</div><p>旅途可以有重点，也可以有余地。</p><a href="#top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>回到顶部 ↑</a></footer>
    </main>
  );
}
