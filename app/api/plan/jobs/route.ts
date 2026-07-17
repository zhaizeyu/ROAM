import { NextResponse } from "next/server";
import {
  activeJobCount,
  claimJob,
  createJob,
  createTrip,
  finishJob,
  getJob,
  logEvent,
  resetStaleJob,
  updateTrip,
} from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/auth";
import { POST as runPlan } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const activeRuns = new Set<string>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "后台规划失败，请稍后重试。";
}

async function runJob(jobId: string, requestUrl: string) {
  if (activeRuns.has(jobId)) return;
  const job = await claimJob(jobId);
  if (!job) return;
  if (!job.user_id) {
    await finishJob(jobId, 401, { error: "登录状态已失效，请重新登录。" });
    return;
  }
  activeRuns.add(jobId);
  const startedAt = Date.now();
  await logEvent({ event: "plan_job_started", message: "规划任务开始执行", jobId, userId: job.user_id, metadata: { jobType: job.job_type, attempt: job.attempts } });

  try {
    const innerRequest = new Request(new URL("/api/plan", requestUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job.request_json),
    });
    const response = await runPlan(innerRequest);
    const responseText = await response.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      payload = { error: "规划服务返回了无法解析的结果，请重新生成。" };
    }

    let tripId: string | null = null;
    if (response.ok && payload.plan && typeof payload.plan === "object") {
      const clientId = typeof job.request_json.clientId === "string" && uuidPattern.test(job.request_json.clientId)
        ? job.request_json.clientId
        : null;
      if (!clientId) throw new Error("浏览器标识无效，请刷新页面后重试。");

      if (job.job_type === "generate") {
        tripId = crypto.randomUUID();
        const accessToken = crypto.randomUUID();
        await createTrip({
          id: tripId,
          accessToken,
          clientId,
          userId: job.user_id,
          request: job.request_json,
          plan: payload.plan as Record<string, unknown>,
          backend: typeof payload.backend === "string" ? payload.backend : payload.demo ? "demo" : "unknown",
        });
        payload = { ...payload, tripId, accessToken, version: 1 };
      } else {
        const requestedTripId = typeof job.request_json.tripId === "string" ? job.request_json.tripId : "";
        const accessToken = typeof job.request_json.accessToken === "string" ? job.request_json.accessToken : undefined;
        const updated = uuidPattern.test(requestedTripId)
          ? await updateTrip({
              tripId: requestedTripId,
              accessToken,
              clientId,
              userId: job.user_id,
              plan: payload.plan as Record<string, unknown>,
              changeType: "replan",
              instruction: typeof job.request_json.instruction === "string" ? job.request_json.instruction : undefined,
            })
          : null;
        if (!updated) throw new Error("原行程不存在或访问凭据无效，请重新打开历史行程。");
        tripId = updated.id;
        payload = { ...payload, tripId, accessToken: updated.access_token, version: updated.current_version };
      }
    }

    await finishJob(jobId, response.status, payload, tripId);
    await logEvent({
      level: response.ok ? "info" : "warn",
      event: response.ok ? "plan_job_finished" : "plan_job_rejected",
      message: response.ok ? "规划任务执行成功" : "规划服务返回错误",
      jobId,
      tripId,
      userId: job.user_id,
      metadata: { responseStatus: response.status, durationMs: Date.now() - startedAt, backend: payload.backend ?? null },
    });
  } catch (error) {
    const message = errorMessage(error);
    const payload = { error: message };
    await finishJob(jobId, 500, payload).catch(() => undefined);
    await logEvent({ level: "error", event: "plan_job_failed", message, jobId, userId: job.user_id, metadata: { durationMs: Date.now() - startedAt } }).catch(() => undefined);
    console.error("[plan_job_failed]", jobId, message);
  } finally {
    activeRuns.delete(jobId);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "请先登录后再生成行程。" }, { status: 401, headers: noStore });
    if (await activeJobCount() >= 50) {
      return NextResponse.json({ error: "当前规划任务较多，请稍后再试。" }, { status: 429, headers: noStore });
    }
    const body = await request.json() as Record<string, unknown>;
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error("invalid body");
    if (typeof body.clientId !== "string" || !uuidPattern.test(body.clientId)) {
      return NextResponse.json({ error: "浏览器标识无效，请刷新页面后重试。" }, { status: 400, headers: noStore });
    }

    const jobId = crypto.randomUUID();
    body.userId = user.id;
    const jobType = await createJob(jobId, body, user.id);
    await logEvent({ event: "plan_job_created", message: "已创建规划任务", jobId, userId: user.id, metadata: { jobType } });
    void runJob(jobId, request.url);
    return NextResponse.json({ jobId, status: "working" }, { status: 202, headers: noStore });
  } catch (error) {
    console.error("[plan_job_create_failed]", errorMessage(error));
    return NextResponse.json({ error: "数据库暂时不可用，无法创建规划任务。" }, { status: 503, headers: noStore });
  }
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录。" }, { status: 401, headers: noStore });
    const jobId = new URL(request.url).searchParams.get("id") ?? "";
    if (!uuidPattern.test(jobId)) return NextResponse.json({ error: "规划任务编号无效。" }, { status: 400, headers: noStore });
    let job = await getJob(jobId);
    if (!job) return NextResponse.json({ error: "规划任务不存在，请重新生成。" }, { status: 404, headers: noStore });
    if (job.user_id !== user.id) return NextResponse.json({ error: "你没有权限读取这个规划任务。" }, { status: 403, headers: noStore });

    if (job.status === "running" && await resetStaleJob(jobId)) {
      await logEvent({ level: "warn", event: "plan_job_recovered", message: "检测到中断任务，准备重新执行", jobId, userId: user.id, metadata: { attempts: job.attempts } });
      job = await getJob(jobId);
    }
    if (job?.status === "pending") void runJob(jobId, request.url);
    if (job?.status === "pending" || job?.status === "running") {
      return NextResponse.json({ jobId, status: "working" }, { status: 202, headers: noStore });
    }
    return NextResponse.json(job?.result_json ?? { error: job?.error_message ?? "规划失败，请重试。" }, {
      status: job?.response_status ?? 500,
      headers: noStore,
    });
  } catch (error) {
    console.error("[plan_job_read_failed]", errorMessage(error));
    return NextResponse.json({ error: "数据库暂时不可用，无法读取规划任务。" }, { status: 503, headers: noStore });
  }
}
