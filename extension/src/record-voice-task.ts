import { Clipboard, getPreferenceValues, open, showHUD, showToast, Toast, environment } from "@raycast/api";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Prefs = {
  anthropicApiKey: string;
  todoistApiToken: string;
  defaultProjectId?: string;
  defaultProjectName?: string;
  model?: string;
  sectionsPrefetch?: number;
  enableRules?: boolean;
};

export default async function main() {
  const prefs = getPreferenceValues<Prefs>();
  const logger = new Logger();

  try {
    const sentinel = `__VOICE_NOTE_WAIT_${Math.random().toString(36).slice(2)}_${Date.now()}__`;
    const original = (await Clipboard.readText()) || "";
    await Clipboard.copy(sentinel);

    await open("raycast://extensions/nchudleigh/superwhisper/toggle-record");
    await showToast({ style: Toast.Style.Animated, title: "Recording…", message: "Press ESC to stop" });

    await waitForSuperwhisperStop(logger);
    const transcription = await waitForClipboardChangeFromSentinel(sentinel, 20_000);
    await Clipboard.copy(original);

    if (!transcription) throw new Error("No transcription detected");

    const analysis = await analyzeTranscription({ transcription, prefs, logger });
    const { category, enriched } = analysis;

    const baseDir = path.join(os.homedir(), "Documents", "Voice Notes");
    const catCap = (category || "misc").replace(/^./, (c) => c.toUpperCase());
    const dir = path.join(baseDir, catCap);
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    fs.writeFileSync(path.join(dir, `${ts}.txt`), transcription);

    const { where } = await maybeAddToTodoist({ transcription, analysis, prefs, logger });
    await showHUD(`✅ Task Added → ${where}`);
  } catch (e: any) {
    logger.log(`❌ ${e?.message || e}`);
    await showToast(Toast.Style.Failure, "Voice to Todoist", e?.message || String(e));
  }
}

class Logger {
  private file: string;
  constructor() {
    const dir = path.join(os.homedir(), "Documents", "Voice Notes");
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "process.log");
  }
  log(msg: string) {
    try { fs.appendFileSync(this.file, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
  }
}

async function waitForSuperwhisperStop(logger: Logger, timeoutMs = 10 * 60_000) {
  const base = path.join(os.homedir(), "Documents", "SuperWhisper", "recordings");
  if (!fs.existsSync(base)) {
    logger.log("ℹ️ No recordings dir; skipping stop detection");
    return;
  }
  const baseline = new Set<string>(listDirNamesSafe(base));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const names = listDirNamesSafe(base);
    const added = names.find((n) => !baseline.has(n));
    if (added) {
      logger.log(`Detected SuperWhisper recording: ${added}`);
      await sleep(500);
      return;
    }
    await sleep(200);
  }
  logger.log("⚠️ Timeout waiting for SuperWhisper stop");
}

function listDirNamesSafe(dir: string) {
  try { return fs.readdirSync(dir).filter(Boolean); } catch { return []; }
}

async function waitForClipboardChangeFromSentinel(sentinel: string, timeoutMs = 20_000) {
  const start = Date.now();
  let last = sentinel;
  while (Date.now() - start < timeoutMs) {
    const cur = (await Clipboard.readText()) || "";
    if (cur && cur !== sentinel && cur !== last && cur.length >= 8) {
      await sleep(200);
      const cur2 = (await Clipboard.readText()) || "";
      return cur2 && cur2.length >= cur.length ? cur2 : cur;
    }
    last = cur;
    await sleep(80);
  }
  return "";
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function analyzeTranscription({ transcription, prefs, logger }: { transcription: string; prefs: Prefs; logger: Logger }) {
  const apiKey = prefs.anthropicApiKey;
  const model = prefs.model || "claude-3-5-haiku-latest";

  const refs = await getTodoistRefs(prefs.todoistApiToken, logger);
  const maxProjects = Math.max(1, Math.min(12, Number.parseInt(String(prefs.sectionsPrefetch ?? '6'), 10) || 6));
  await prefetchSomeSections(prefs.todoistApiToken, refs, maxProjects, logger);
  const sectionsDoc = buildSectionsDoc(refs, maxProjects);
  const projectsList = (refs.projects || []).map((p) => p.name).slice(0, 100);
  const labelsList = (refs.labels || []).map((l) => l.name).slice(0, 200);

  const sys = [
    "You extract structured task info from short voice transcriptions.",
    "Return strict JSON only. Do not include extra text.",
    "If unsure, leave fields empty or conservative.",
    "priority uses Todoist scale 1(low)–4(high).",
    projectsList.length ? `Projects: ${projectsList.join(" | ")}` : "",
    labelsList.length ? `Labels: ${labelsList.join(" | ")}` : "",
    sectionsDoc ? `Sections by Project:\n${sectionsDoc}` : "",
    'Rules: If a section clearly matches the intent, set sectionName exactly as listed for the chosen project. Otherwise use null.'
  ].filter(Boolean).join("\n");

  const user = `Transcription:\n${transcription}\n\nRespond with JSON exactly matching this schema:\n{\n  "title": string,\n  "description": string | null,\n  "category": "meetings|ideas|tasks|personal|support|documentation|misc",\n  "projectName": string | null,\n  "sectionName": string | null,\n  "labels": string[],\n  "priority": 1|2|3|4 | null,\n  "due_string": string | null,\n  "urls": string[]\n}`;

  const respRaw = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({ model, max_tokens: 400, system: sys, messages: [{ role: "user", content: user }], temperature: 0 })
  });
  if (!respRaw.ok) throw new Error(`Anthropic error ${respRaw.status}: ${await respRaw.text().catch(() => "")}`);
  const resp = await respRaw.json() as any;
  let json: any = {};
  try { json = JSON.parse(resp.content?.[0]?.text || "{}"); }
  catch { try { const m = String(resp.content?.[0]?.text || "").match(/\{[\s\S]*\}/); if (m) json = JSON.parse(m[0]); } catch {} }
  if (!json.title) json.title = transcription.split("\n")[0].slice(0, 120);
  if (!json.category) json.category = "misc";

  if (prefs.enableRules) {
    try { json = applyRules({ transcription, enriched: json, logger }); } catch {}
  }
  return { enriched: json, category: json.category, refs };
}

async function maybeAddToTodoist({ transcription, analysis, prefs, logger }: { transcription: string; analysis: any; prefs: Prefs; logger: Logger }) {
  const token = prefs.todoistApiToken;
  const refs = analysis.refs as TodoistRefs;
  const { projectName, sectionName, labels = [], priority, due_string, title, description, urls = [] } = analysis.enriched || {};

  const desiredLabels = Array.from(new Set(["Voice", ...labels].filter(Boolean)));
  await ensureLabels(token, desiredLabels, refs, logger).catch(() => {});

  const explicitProjectId = prefs.defaultProjectId || matchProjectId(prefs.defaultProjectName || null, refs.projects) || null;
  const projectId = explicitProjectId || matchProjectId(projectName, refs.projects) || null;
  let sectionId: string | undefined = undefined;
  if (projectId) {
    await ensureSections(token, refs, projectId, logger).catch(() => {});
    sectionId = matchSectionId(sectionName, projectId, refs.sections);
    if (!sectionId) sectionId = guessSectionIdFromContent({ transcription, analysis: analysis.enriched, projectId, refs });
  }

  const fallbackTitle = transcription.split("\n")[0].slice(0, 120);
  const content = `${title || fallbackTitle}`.trim();
  let desc = description || transcription;
  if (urls && urls.length) desc += `\n\nLinks:\n- ${urls.join("\n- ")}`;

  const body: any = {
    content,
    description: desc,
    ...(projectId ? { project_id: projectId } : {}),
    ...(projectId && sectionId ? { section_id: sectionId } : {}),
    ...(desiredLabels.length ? { labels: desiredLabels } : {}),
    ...(due_string ? { due_string } : {})
  };

  logger.log(`[Todoist] POST /tasks body: ${JSON.stringify(body).slice(0, 400)}`);
  const res = await fetch("https://api.todoist.com/rest/v2/tasks", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Todoist error ${res.status}: ${await res.text().catch(() => "")}`);
  const task = await res.json() as any;
  const projName = projectId ? (refs.projects.find((p) => p.id === projectId)?.name || "Project") : "Inbox";
  const sectName = projectId && sectionId ? (refs.sections[projectId]?.find((s) => s.id === sectionId)?.name || "") : "";
  const where = sectName ? `${projName} › ${sectName}` : projName;
  logger.log(`🧾 Todoist task created: ${task.id} (${where})`);
  return { task, where };
}

// ===== Todoist helpers & caching =====
type TodoistRefs = { projects: any[]; labels: any[]; sections: Record<string, any[]> };

function cachePaths() {
  const dir = path.join(environment.supportPath, "cache");
  const file = path.join(dir, "todoist-refs.json");
  return { dir, file };
}

async function getTodoistRefs(token: string, logger: Logger): Promise<TodoistRefs> {
  const { dir, file } = cachePaths();
  const ttlMs = 6 * 60 * 60 * 1000;
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < ttlMs) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  const headers = { Authorization: `Bearer ${token}` } as any;
  const [pRes, lRes] = await Promise.all([
    fetch("https://api.todoist.com/rest/v2/projects", { headers }),
    fetch("https://api.todoist.com/rest/v2/labels", { headers })
  ]);
  if (!pRes.ok) throw new Error(`Projects ${pRes.status}`);
  if (!lRes.ok) throw new Error(`Labels ${lRes.status}`);
  const projects = await pRes.json() as any[];
  const labels = await lRes.json() as any[];
  const refs: TodoistRefs = { projects, labels, sections: {} };
  fs.mkdirSync(dir, { recursive: true });
  try { fs.writeFileSync(file, JSON.stringify(refs), "utf8"); } catch {}
  logger.log("Cached projects and labels");
  return refs;
}

async function ensureSections(token: string, refs: TodoistRefs, projectId: string, logger: Logger) {
  if (!projectId) return;
  if (refs.sections[projectId]) return;
  const headers = { Authorization: `Bearer ${token}` } as any;
  const r = await fetch(`https://api.todoist.com/rest/v2/sections?project_id=${projectId}`, { headers });
  if (!r.ok) throw new Error(`Sections ${r.status}`);
  refs.sections[projectId] = await r.json() as any[];
  const { file } = cachePaths();
  try { fs.writeFileSync(file, JSON.stringify(refs), "utf8"); } catch {}
  logger.log(`Fetched sections for project ${projectId}`);
}

async function prefetchSomeSections(token: string, refs: TodoistRefs, maxProjects: number, logger: Logger) {
  try {
    const projects = refs.projects || [];
    for (let i = 0; i < Math.min(maxProjects, projects.length); i++) {
      const p = projects[i];
      if (!refs.sections[p.id]) await ensureSections(token, refs, p.id, logger).catch(() => {});
    }
  } catch {}
}

function buildSectionsDoc(refs: TodoistRefs, maxProjects: number) {
  try {
    const projects = (refs.projects || []).slice(0, maxProjects);
    const out: string[] = [];
    for (const p of projects) {
      const secs = (refs.sections[p.id] || []).map((s) => s.name).filter(Boolean);
      if (secs.length) out.push(`- ${p.name}: ${secs.join(" | ")}`);
    }
    return out.join("\n");
  } catch { return ""; }
}

function matchProjectId(name: string | null, projects: any[]) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  const f = (projects || []).find((p) => String(p.name || "").trim().toLowerCase() === n);
  return f ? f.id : null;
}
function matchSectionId(name: string | null, projectId: string, sectionsByProject: Record<string, any[]>) {
  if (!name || !projectId) return undefined;
  const list = sectionsByProject[projectId] || [];
  const n = String(name).trim().toLowerCase();
  const f = list.find((s) => String(s.name || "").trim().toLowerCase() === n);
  return f ? f.id : undefined;
}

function normalize(s: string) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function containsWord(hay: string, needle: string) { const H = normalize(hay), N = normalize(needle); return !!H && !!N && H.includes(N); }
function guessSectionIdFromContent({ transcription, analysis, projectId, refs }: { transcription: string; analysis: any; projectId: string; refs: TodoistRefs }) {
  try {
    const sections = refs.sections[projectId] || [];
    if (!sections.length) return undefined;
    const candidates = [analysis?.title, analysis?.description, transcription].filter(Boolean) as string[];
    let best: { id?: string; score: number } = { id: undefined, score: 0 };
    for (const sec of sections) {
      const name = sec.name || "";
      let score = 0;
      for (const text of candidates) if (containsWord(text, name)) score += name.length;
      if (score > best.score) best = { id: sec.id, score };
    }
    return best.id;
  } catch { return undefined; }
}

async function ensureLabels(token: string, names: string[], refs: TodoistRefs, logger: Logger) {
  const existing = new Map((refs.labels || []).map((l) => [String(l.name || "").trim().toLowerCase(), l]));
  for (const raw of names) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existing.has(key)) continue;
    const res = await fetch("https://api.todoist.com/rest/v2/labels", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (res.ok) {
      const lbl = await res.json();
      refs.labels.push(lbl);
      existing.set(key, lbl);
      const { file } = cachePaths();
      try { fs.writeFileSync(file, JSON.stringify(refs), "utf8"); } catch {}
      logger.log(`🏷️ Created label: ${lbl.name}`);
    } else {
      const t = await res.text().catch(() => "");
      logger.log(`⚠️ Failed to create label '${name}': ${res.status} ${t}`);
    }
  }
}

function applyRules({ transcription, enriched, logger }: { transcription: string; enriched: any; logger: Logger }) {
  try {
    const support = environment.supportPath;
    const file = path.join(support, "voice-note-rules.json");
    if (!fs.existsSync(file)) return enriched;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const rules = Array.isArray(data?.rules) ? data.rules : [];
    const hay = `${enriched?.title || ""}\n${enriched?.description || ""}\n${transcription || ""}`;
    const next = { ...enriched };
    for (const r of rules) {
      const pat = String(r.test || ""); if (!pat) continue;
      let re: RegExp | null = null; try { re = new RegExp(pat); } catch { continue; }
      if (!re.test(hay)) continue;
      if (!next.projectName && r.projectName) next.projectName = r.projectName;
      if (!next.sectionName && r.sectionName) next.sectionName = r.sectionName;
      if (Array.isArray(r.labels) && r.labels.length) next.labels = Array.from(new Set([...(next.labels || []), ...r.labels]));
      if (!next.priority && r.priority) next.priority = r.priority;
      if (!next.due_string && r.due_string) next.due_string = r.due_string;
    }
    return next;
  } catch (e) { logger.log(`rules error: ${String(e)}`); return enriched; }
}
