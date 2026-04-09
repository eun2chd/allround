// Supabase Edge Function: 요즘것들(allforyoung) 목록만 순회하며 contests.d_day / updated_at 만 갱신 (알림 없음)
// npx supabase functions deploy refresh-allforyoung-dday

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12";

const BASE_URL = "https://www.allforyoung.com";
const SOURCE = "요즘것들";
const PAGES_MAX_CAP = 50;
const DELAY_MS = 1000;
const UPDATE_CONCURRENCY = 15;

interface ListRow {
  id: string;
  d_day: string;
}

function parseContestListPage(html: string): ListRow[] {
  const $ = load(html);
  const results: ListRow[] = [];
  const seenIds = new Set<string>();

  $('a[href*="/posts/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/\/posts\/(\d+)(?:\?|$)/);
    if (!m) return;
    const postId = m[1];
    if (seenIds.has(postId)) return;

    const li = $(el).closest("li");
    if (!li.length) return;
    seenIds.add(postId);

    const badgeSpan = li.find("[data-slot=badge]").first();
    const dDay = badgeSpan.text().trim() || "-";

    results.push({ id: postId, d_day: dDay });
  });

  return results;
}

async function crawlContestListPage(page: number): Promise<ListRow[]> {
  const url = `${BASE_URL}/posts/contest?page=${page}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseContestListPage(await res.text());
}

async function collectAllListRows(): Promise<ListRow[]> {
  const all: ListRow[] = [];
  const seenIds = new Set<string>();

  for (let p = 1; p <= PAGES_MAX_CAP; p++) {
    try {
      const rows = await crawlContestListPage(p);
      if (rows.length === 0) break;
      for (const r of rows) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          all.push(r);
        }
      }
      if (p < PAGES_MAX_CAP) await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (e) {
      console.error(`Allforyoung d-day refresh page ${p}:`, e);
    }
  }

  return all;
}

async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Supabase env not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const listRows = await collectAllListRows();
    const now = new Date().toISOString();

    const updateResults = await runPool(listRows, UPDATE_CONCURRENCY, async (r) => {
      const { data, error } = await supabase
        .from("contests")
        .update({ d_day: r.d_day, updated_at: now })
        .eq("source", SOURCE)
        .eq("id", r.id)
        .select("id");
      if (error) {
        console.error(`update ${r.id}:`, error);
        return "error" as const;
      }
      return data?.length ? ("updated" as const) : ("skipped" as const);
    });

    const rowsUpdated = updateResults.filter((x) => x === "updated").length;
    const rowsSkipped = updateResults.filter((x) => x === "skipped").length;
    const rowsErrors = updateResults.filter((x) => x === "error").length;

    return new Response(
      JSON.stringify({
        success: true,
        source: SOURCE,
        listItems: listRows.length,
        contestsUpdated: rowsUpdated,
        noMatchingRow: rowsSkipped,
        updateErrors: rowsErrors,
        message: `요즘것들 d-day 갱신: 목록 ${listRows.length}건, DB 반영 ${rowsUpdated}건`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
