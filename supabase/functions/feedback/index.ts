// Supabase Edge Function "feedback": legt einen Verbesserungsvorschlag aus der App als GitHub-Issue an.
// Nur für eingeloggte Mitglieder, max. DAILY_LIMIT pro Person und Tag.
// Secrets: GITHUB_ISSUES_TOKEN (fine-grained Token, nur "Issues: Read and write" auf dieses Repo), GITHUB_REPO ("besitzer/InterChampionship")
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { buildIssue, DAILY_LIMIT } from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: "Nicht angemeldet" }, 401);
  const { data: member } = await db.from("members").select("role, player").eq("user_id", user.id).maybeSingle();
  if (!member) return json({ error: "Kein Mitglied" }, 403);

  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from("feedback_log").select("*", { count: "exact", head: true })
    .eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `Maximal ${DAILY_LIMIT} Vorschläge pro Tag.` }, 429);

  let issue;
  try {
    issue = buildIssue(await req.json(), member);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  const res = await fetch(`https://api.github.com/repos/${Deno.env.get("GITHUB_REPO")}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("GITHUB_ISSUES_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "InterChampionship",
    },
    body: JSON.stringify(issue),
  });
  if (!res.ok) return json({ error: "GitHub hat den Vorschlag nicht angenommen." }, 502);
  const gh = await res.json();
  await db.from("feedback_log").insert({ user_id: user.id, issue_number: gh.number });
  return json({ number: gh.number, url: gh.html_url });
});
