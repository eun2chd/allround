// Supabase Edge Function: contests 테이블에서 오래 갱신되지 않은 행 삭제
// 크롤이 자주 돌면서 updated_at이 밀리므로, 목록에서 사라진 공고는 며칠 안에 삭제됨.
// contests.manual_entry = true 제외 + DB에서 한국(KST) 달력 기준 실행일 당일 갱신분도 삭제 제외.
//
// 스케줄: 하루 1회 (시간 무관). Supabase Dashboard → Edge Functions → Cron 또는 외부 스케줄러.
//
// Query: ?days=3  — 오늘 기준 N일 이전(updated_at)까지 삭제. 범위 1~30, 기본 3.
// 보안: 환경변수 CRON_SECRET 이 있으면 Authorization: Bearer <CRON_SECRET> 또는 x-cron-secret 헤더 필요.
//
// npx supabase functions deploy prune-stale-contests --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_DAYS = 3;
const MIN_DAYS = 1;
const MAX_DAYS = 30;

function clampDays(raw: string | null): number {
  const n = raw === null || raw === "" ? DEFAULT_DAYS : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
}

function cronAuthOk(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return true;
  const auth = req.headers.get("Authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  if (!cronAuthOk(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Supabase env not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const days = clampDays(url.searchParams.get("days"));

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase.rpc("prune_stale_contests", { p_days: days });

    if (error) {
      console.error("prune_stale_contests RPC error:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const deleted = typeof data === "number" ? data : Number(data ?? 0);

    return new Response(
      JSON.stringify({
        success: true,
        days,
        deleted_count: deleted,
        message: `updated_at 기준 ${days}일 이전 contests ${deleted}건 삭제`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
