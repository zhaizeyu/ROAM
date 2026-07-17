import { NextResponse } from "next/server";
import { POST as runPlan } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlanJob = {
  createdAt: number;
  status: "working" | "finished";
  responseStatus?: number;
  payload?: unknown;
};

const store = globalThis as typeof globalThis & { __roamPlanJobs?: Map<string, PlanJob> };
const jobs = store.__roamPlanJobs ?? new Map<string, PlanJob>();
store.__roamPlanJobs = jobs;
const noStore = { "Cache-Control": "no-store" };

function cleanupJobs() {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}

export async function POST(request: Request) {
  cleanupJobs();
  if (jobs.size >= 50) return NextResponse.json({ error: "当前规划任务较多，请稍后再试。" }, { status: 429, headers: noStore });
  let body: string;
  try {
    body = await request.text();
    JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "行程请求格式无效。" }, { status: 400, headers: noStore });
  }

  const jobId = crypto.randomUUID();
  jobs.set(jobId, { createdAt: Date.now(), status: "working" });
  const innerRequest = new Request(new URL("/api/plan", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  void runPlan(innerRequest).then(async (response) => {
    const text = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(text); }
    catch { payload = { error: "规划服务返回了无法解析的结果，请重新生成。" }; }
    jobs.set(jobId, { createdAt: Date.now(), status: "finished", responseStatus: response.status, payload });
  }).catch((error) => {
    jobs.set(jobId, {
      createdAt: Date.now(),
      status: "finished",
      responseStatus: 500,
      payload: { error: error instanceof Error ? error.message : "后台规划失败，请稍后重试。" },
    });
  });

  return NextResponse.json({ jobId, status: "working" }, { status: 202, headers: noStore });
}

export async function GET(request: Request) {
  cleanupJobs();
  const jobId = new URL(request.url).searchParams.get("id") ?? "";
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "规划任务不存在或已经过期，请重新生成。" }, { status: 404, headers: noStore });
  if (job.status === "working") return NextResponse.json({ jobId, status: "working" }, { status: 202, headers: noStore });
  return NextResponse.json(job.payload, { status: job.responseStatus ?? 500, headers: noStore });
}
