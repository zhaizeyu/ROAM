import "server-only";

import { Pool, type PoolClient } from "pg";
import { hashPassword } from "./password";

export type JobStatus = "pending" | "running" | "finished" | "failed";

export type PlanJobRow = {
  id: string;
  job_type: "generate" | "replan";
  status: JobStatus;
  request_json: Record<string, unknown>;
  result_json: unknown;
  response_status: number | null;
  trip_id: string | null;
  user_id: string | null;
  attempts: number;
  error_message: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type TripRow = {
  id: string;
  access_token: string;
  client_id: string;
  user_id: string | null;
  destination: string;
  start_date: string;
  end_date: string;
  input_json: Record<string, unknown>;
  plan_json: Record<string, unknown>;
  backend: string;
  current_version: number;
  created_at: Date;
  updated_at: Date;
};

export type UserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  is_test: boolean;
  created_at: Date;
  updated_at: Date;
};

const globalPool = globalThis as typeof globalThis & {
  __roamPool?: Pool;
  __roamSchemaPromise?: Promise<void>;
};

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("数据库尚未配置，请设置 DATABASE_URL。");
  return value;
}

function getPool() {
  if (!globalPool.__roamPool) {
    globalPool.__roamPool = new Pool({
      connectionString: databaseUrl(),
      max: Math.min(Math.max(Number(process.env.DATABASE_POOL_MAX) || 10, 2), 30),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
      application_name: "roam-trip-planner",
    });
    globalPool.__roamPool.on("error", (error) => console.error("[database_pool_error]", error.message));
  }
  return globalPool.__roamPool;
}

async function initializeSchema() {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('roam-schema-v2'))");
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS roam;

      CREATE TABLE IF NOT EXISTS roam.users (
        id uuid PRIMARY KEY,
        username text NOT NULL,
        display_name text NOT NULL,
        password_hash text NOT NULL,
        is_test boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON roam.users(lower(username));

      CREATE TABLE IF NOT EXISTS roam.auth_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES roam.users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS roam.trip_plans (
        id uuid PRIMARY KEY,
        access_token uuid NOT NULL UNIQUE,
        client_id uuid NOT NULL,
        destination text NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        input_json jsonb NOT NULL,
        plan_json jsonb NOT NULL,
        backend text NOT NULL DEFAULT 'unknown',
        current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS roam.trip_plan_versions (
        id bigserial PRIMARY KEY,
        trip_id uuid NOT NULL REFERENCES roam.trip_plans(id) ON DELETE CASCADE,
        version integer NOT NULL CHECK (version > 0),
        change_type text NOT NULL CHECK (change_type IN ('generated', 'replan', 'manual_edit')),
        instruction text,
        plan_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (trip_id, version)
      );

      CREATE TABLE IF NOT EXISTS roam.plan_jobs (
        id uuid PRIMARY KEY,
        job_type text NOT NULL CHECK (job_type IN ('generate', 'replan')),
        status text NOT NULL CHECK (status IN ('pending', 'running', 'finished', 'failed')),
        request_json jsonb NOT NULL,
        result_json jsonb,
        response_status integer,
        trip_id uuid REFERENCES roam.trip_plans(id) ON DELETE SET NULL,
        attempts integer NOT NULL DEFAULT 0,
        error_message text,
        started_at timestamptz,
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS roam.event_logs (
        id bigserial PRIMARY KEY,
        level text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
        event text NOT NULL,
        message text NOT NULL,
        job_id uuid REFERENCES roam.plan_jobs(id) ON DELETE SET NULL,
        trip_id uuid REFERENCES roam.trip_plans(id) ON DELETE SET NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS trip_plans_client_updated_idx ON roam.trip_plans(client_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS trip_plans_destination_idx ON roam.trip_plans(destination);
      CREATE INDEX IF NOT EXISTS trip_versions_trip_created_idx ON roam.trip_plan_versions(trip_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS plan_jobs_status_created_idx ON roam.plan_jobs(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS plan_jobs_trip_idx ON roam.plan_jobs(trip_id);
      CREATE INDEX IF NOT EXISTS event_logs_job_idx ON roam.event_logs(job_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS event_logs_trip_idx ON roam.event_logs(trip_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS event_logs_created_idx ON roam.event_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON roam.auth_sessions(user_id, expires_at DESC);

      ALTER TABLE roam.trip_plans ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES roam.users(id) ON DELETE SET NULL;
      ALTER TABLE roam.plan_jobs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES roam.users(id) ON DELETE SET NULL;
      ALTER TABLE roam.event_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES roam.users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS trip_plans_user_updated_idx ON roam.trip_plans(user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS plan_jobs_user_created_idx ON roam.plan_jobs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS event_logs_user_created_idx ON roam.event_logs(user_id, created_at DESC);
    `);

    const testUsername = (process.env.TEST_USER_NAME?.trim() || "roam-test").toLowerCase();
    const testDisplayName = process.env.TEST_USER_DISPLAY_NAME?.trim() || "ROAM 测试用户";
    const existing = await client.query<UserRow>("SELECT * FROM roam.users WHERE lower(username) = lower($1)", [testUsername]);
    let testUser = existing.rows[0];
    if (!testUser) {
      const passwordHash = await hashPassword(process.env.TEST_USER_PASSWORD || "roam-test-2026");
      const inserted = await client.query<UserRow>(
        `INSERT INTO roam.users(id, username, display_name, password_hash, is_test)
         VALUES ($1, $2, $3, $4, true) RETURNING *`,
        [crypto.randomUUID(), testUsername, testDisplayName, passwordHash],
      );
      testUser = inserted.rows[0];
    }
    await client.query("UPDATE roam.trip_plans SET user_id = $1 WHERE user_id IS NULL", [testUser.id]);
    await client.query("UPDATE roam.plan_jobs SET user_id = $1 WHERE user_id IS NULL", [testUser.id]);
    await client.query("DELETE FROM roam.auth_sessions WHERE expires_at < now()");
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('roam-schema-v2'))").catch(() => undefined);
    client.release();
  }
}

export async function ensureDatabase() {
  globalPool.__roamSchemaPromise ??= initializeSchema().catch((error) => {
    globalPool.__roamSchemaPromise = undefined;
    throw error;
  });
  await globalPool.__roamSchemaPromise;
  return getPool();
}

export async function checkDatabase() {
  const pool = await ensureDatabase();
  const result = await pool.query<{ now: Date }>("SELECT now()");
  return result.rows[0].now;
}

export async function logEvent(input: {
  level?: "info" | "warn" | "error";
  event: string;
  message: string;
  jobId?: string | null;
  tripId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const pool = await ensureDatabase();
  await pool.query(
    `INSERT INTO roam.event_logs(level, event, message, job_id, trip_id, user_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [input.level ?? "info", input.event.slice(0, 120), input.message.slice(0, 1000), input.jobId ?? null, input.tripId ?? null, input.userId ?? null, JSON.stringify(input.metadata ?? {})],
  );
}

export async function createJob(id: string, request: Record<string, unknown>, userId: string) {
  const pool = await ensureDatabase();
  const jobType = request.action === "replan-day" ? "replan" : "generate";
  await pool.query(
    `INSERT INTO roam.plan_jobs(id, job_type, status, request_json, user_id) VALUES ($1, $2, 'pending', $3::jsonb, $4)`,
    [id, jobType, JSON.stringify(request), userId],
  );
  return jobType;
}

export async function activeJobCount() {
  const pool = await ensureDatabase();
  const result = await pool.query<{ count: string }>("SELECT count(*) FROM roam.plan_jobs WHERE status IN ('pending', 'running')");
  return Number(result.rows[0].count);
}

export async function claimJob(id: string) {
  const pool = await ensureDatabase();
  const result = await pool.query<PlanJobRow>(
    `UPDATE roam.plan_jobs
       SET status = 'running', attempts = attempts + 1, started_at = now(), updated_at = now(), error_message = NULL
     WHERE id = $1 AND status = 'pending' AND attempts < 3
     RETURNING *`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function getJob(id: string) {
  const pool = await ensureDatabase();
  const result = await pool.query<PlanJobRow>("SELECT * FROM roam.plan_jobs WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function resetStaleJob(id: string) {
  const pool = await ensureDatabase();
  const result = await pool.query(
    `UPDATE roam.plan_jobs SET status = 'pending', updated_at = now()
     WHERE id = $1 AND status = 'running' AND started_at < now() - interval '8 minutes' AND attempts < 3
     RETURNING id`,
    [id],
  );
  return result.rowCount === 1;
}

export async function finishJob(id: string, status: number, result: unknown, tripId?: string | null) {
  const pool = await ensureDatabase();
  await pool.query(
    `UPDATE roam.plan_jobs
       SET status = $2, response_status = $3, result_json = $4::jsonb, trip_id = $5,
           error_message = $6, finished_at = now(), updated_at = now()
     WHERE id = $1`,
    [id, status >= 200 && status < 300 ? "finished" : "failed", status, JSON.stringify(result), tripId ?? null,
      status >= 200 && status < 300 ? null : String((result as { error?: unknown })?.error ?? "规划失败").slice(0, 2000)],
  );
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const pool = await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createTrip(input: {
  id: string;
  accessToken: string;
  clientId: string;
  userId: string;
  request: Record<string, unknown>;
  plan: Record<string, unknown>;
  backend: string;
}) {
  const destination = String(input.plan.destination ?? input.request.destination ?? "未命名行程").slice(0, 300);
  const startDate = String(input.request.startDate ?? new Date().toISOString().slice(0, 10));
  const endDate = String(input.request.endDate ?? startDate);
  return inTransaction(async (client) => {
    const result = await client.query<TripRow>(
      `INSERT INTO roam.trip_plans
       (id, access_token, client_id, user_id, destination, start_date, end_date, input_json, plan_json, backend)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::jsonb, $9::jsonb, $10)
       RETURNING *`,
      [input.id, input.accessToken, input.clientId, input.userId, destination, startDate, endDate, JSON.stringify(input.request), JSON.stringify(input.plan), input.backend],
    );
    await client.query(
      `INSERT INTO roam.trip_plan_versions(trip_id, version, change_type, plan_json)
       VALUES ($1, 1, 'generated', $2::jsonb)`,
      [input.id, JSON.stringify(input.plan)],
    );
    return result.rows[0];
  });
}

export async function updateTrip(input: {
  tripId: string;
  accessToken?: string;
  clientId?: string;
  userId?: string;
  plan: Record<string, unknown>;
  changeType: "replan" | "manual_edit";
  instruction?: string;
}) {
  return inTransaction(async (client) => {
    const result = await client.query<TripRow>(
      `UPDATE roam.trip_plans
         SET plan_json = $5::jsonb, current_version = current_version + 1, updated_at = now()
       WHERE id = $1 AND (($2::uuid IS NOT NULL AND access_token = $2::uuid) OR ($3::uuid IS NOT NULL AND client_id = $3::uuid) OR ($4::uuid IS NOT NULL AND user_id = $4::uuid))
       RETURNING *`,
      [input.tripId, input.accessToken || null, input.clientId || null, input.userId || null, JSON.stringify(input.plan)],
    );
    const trip = result.rows[0];
    if (!trip) return null;
    await client.query(
      `INSERT INTO roam.trip_plan_versions(trip_id, version, change_type, instruction, plan_json)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [trip.id, trip.current_version, input.changeType, input.instruction?.slice(0, 2000) ?? null, JSON.stringify(input.plan)],
    );
    return trip;
  });
}

export async function getTrip(id: string, accessToken?: string, clientId?: string, userId?: string) {
  const pool = await ensureDatabase();
  const result = await pool.query<TripRow>(
    `SELECT * FROM roam.trip_plans
     WHERE id = $1 AND (($2::uuid IS NOT NULL AND access_token = $2::uuid) OR ($3::uuid IS NOT NULL AND client_id = $3::uuid) OR ($4::uuid IS NOT NULL AND user_id = $4::uuid))`,
    [id, accessToken || null, clientId || null, userId || null],
  );
  return result.rows[0] ?? null;
}

export async function listTrips(userId: string, limit = 30) {
  const pool = await ensureDatabase();
  const result = await pool.query<TripRow>(
    `SELECT * FROM roam.trip_plans WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 50)],
  );
  return result.rows;
}

export async function findUserByUsername(username: string) {
  const pool = await ensureDatabase();
  const result = await pool.query<UserRow>("SELECT * FROM roam.users WHERE lower(username) = lower($1)", [username]);
  return result.rows[0] ?? null;
}

export async function createUser(input: { username: string; displayName: string; passwordHash: string }) {
  const pool = await ensureDatabase();
  const result = await pool.query<UserRow>(
    `INSERT INTO roam.users(id, username, display_name, password_hash)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [crypto.randomUUID(), input.username, input.displayName, input.passwordHash],
  );
  return result.rows[0];
}

export async function createAuthSession(input: { id: string; userId: string; tokenHash: string; expiresAt: Date }) {
  const pool = await ensureDatabase();
  await pool.query(
    `INSERT INTO roam.auth_sessions(id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [input.id, input.userId, input.tokenHash, input.expiresAt],
  );
}

export async function findUserBySession(tokenHash: string) {
  const pool = await ensureDatabase();
  const result = await pool.query<UserRow>(
    `UPDATE roam.auth_sessions s SET last_seen_at = now()
     FROM roam.users u
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.id = s.user_id
     RETURNING u.*`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function deleteAuthSession(tokenHash: string) {
  const pool = await ensureDatabase();
  await pool.query("DELETE FROM roam.auth_sessions WHERE token_hash = $1", [tokenHash]);
}
