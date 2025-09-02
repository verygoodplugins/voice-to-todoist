#!/usr/bin/env node
// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Record Voice Note
// @raycast.mode compact
// @raycast.packageName Voice Notes
// @raycast.icon 🎙️
// @raycast.description Record with SuperWhisper, parse with Claude, and create a Todoist task

/*
  Single-file Raycast Script Command (Node.js)
  - Triggers SuperWhisper toggle-record via Raycast URL
  - Captures the clipboard transcription safely (sentinel + polling)
  - Uses Anthropic (Claude) to extract structured task fields
  - Saves the raw transcription under ~/Documents/Voice Notes/{Category}/
  - Creates a Todoist task (Inbox by default), auto-creating missing labels

  No external npm dependencies are required at runtime.
  It reads your repo .env directly; optional fallback path is used if installed in Raycast Scripts.
*/

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, exec } from 'child_process';
import { fileURLToPath } from 'url';

// ---------- Config & Utilities ----------

const LOG_FILE = path.join(os.homedir(), 'Documents', 'Voice Notes', 'process.log');
ensureDir(path.dirname(LOG_FILE));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function pbpaste() {
  try { return execSync('pbpaste', { encoding: 'utf8' }); } catch { return ''; }
}

function pbcopy(s) {
  try { execSync('pbcopy', { input: s }); } catch {}
}

function openUrl(u) { try { execSync(`open "${u}"`); } catch (e) { log(`⚠️ open failed: ${e.message}`); } }

function notify(title, message) {
  try { exec(`osascript -e 'display notification "${escapeOsascript(message)}" with title "${escapeOsascript(title)}"'`); } catch {}
}

function escapeOsascript(s) { return String(s).replace(/"/g, '\\"'); }

function parseEnvFile(content) {
  const out = {};
  String(content || '').split(/\r?\n/).forEach((line) => {
    const l = line.trim();
    if (!l || l.startsWith('#')) return;
    const idx = l.indexOf('=');
    if (idx === -1) return;
    const k = l.slice(0, idx).trim();
    let v = l.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  });
  return out;
}

function loadEnv() {
  // Try repo-relative .env (if running from repo), else fallback to a common path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const scriptDir = __dirname; // tools/
  const repoRoot = path.resolve(scriptDir, '..');
  let envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) {
    const alt = path.join(os.homedir(), 'Projects', 'OpenAI', 'claude-automation-hub', '.env');
    if (fs.existsSync(alt)) envPath = alt; else envPath = null;
  }
  if (envPath) {
    try {
      const text = fs.readFileSync(envPath, 'utf8');
      const kv = parseEnvFile(text);
      for (const [k, v] of Object.entries(kv)) if (!(k in process.env)) process.env[k] = v;
      log(`ℹ️ Loaded env from ${envPath}`);
    } catch (e) { log(`⚠️ Failed to load .env: ${e.message}`); }
  } else {
    log('ℹ️ No .env found (env vars must be present in Raycast).');
  }
}

function resolveRepoRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const scriptDir = __dirname; // tools/
  const repoRoot = path.resolve(scriptDir, '..');
  if (fs.existsSync(path.join(repoRoot, '.env'))) return repoRoot;
  return repoRoot;
}

function loadRules() {
  try {
    const root = resolveRepoRoot();
    const p = path.join(root, 'tools', 'voice-note-rules.json');
    if (!fs.existsSync(p)) return null;
    const text = fs.readFileSync(p, 'utf8');
    const json = JSON.parse(text);
    if (!json || !Array.isArray(json.rules)) return null;
    return json.rules;
  } catch { return null; }
}

function applyRules({ transcription, enriched, rules }) {
  try {
    const hay = `${enriched?.title || ''}\n${enriched?.description || ''}\n${transcription || ''}`;
    const next = { ...enriched };
    for (const r of rules) {
      const pattern = String(r.test || '').trim();
      if (!pattern) continue;
      let re = null;
      try { re = new RegExp(pattern); } catch { continue; }
      if (!re.test(hay)) continue;
      if (!next.projectName && r.projectName) next.projectName = r.projectName;
      if (!next.sectionName && r.sectionName) next.sectionName = r.sectionName;
      if (Array.isArray(r.labels) && r.labels.length) {
        const set = new Set([...(next.labels || []), ...r.labels]);
        next.labels = Array.from(set);
      }
      if (!next.priority && r.priority) next.priority = r.priority;
      if (!next.due_string && r.due_string) next.due_string = r.due_string;
    }
    return next;
  } catch { return enriched; }
}

// ---------- Todoist helpers ----------

function cachePaths() {
  const dir = path.join(os.homedir(), '.cache', 'claude-automation-hub');
  const file = path.join(dir, 'todoist-refs.json');
  return { dir, file };
}

async function getTodoistRefs(token) {
  const { dir, file } = cachePaths();
  const ttlMs = parseInt(process.env.TODOIST_CACHE_TTL_MS || '21600000', 10); // 6h
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < ttlMs) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  const headers = { Authorization: `Bearer ${token}` };
  const [pRes, lRes] = await Promise.all([
    fetch('https://api.todoist.com/rest/v2/projects', { headers }),
    fetch('https://api.todoist.com/rest/v2/labels', { headers })
  ]);
  if (!pRes.ok) throw new Error(`Projects ${pRes.status}`);
  if (!lRes.ok) throw new Error(`Labels ${lRes.status}`);
  const projects = await pRes.json();
  const labels = await lRes.json();
  const refs = { projects, labels, sections: {} };
  try { ensureDir(dir); fs.writeFileSync(file, JSON.stringify(refs), 'utf8'); } catch {}
  return refs;
}

async function ensureSections(token, refs, projectId) {
  if (!projectId) return;
  if (refs.sections[projectId]) return;
  const headers = { Authorization: `Bearer ${token}` };
  const r = await fetch(`https://api.todoist.com/rest/v2/sections?project_id=${projectId}`, { headers });
  if (!r.ok) throw new Error(`Sections ${r.status}`);
  const s = await r.json();
  refs.sections[projectId] = s;
  try { const { file } = cachePaths(); fs.writeFileSync(file, JSON.stringify(refs), 'utf8'); } catch {}
}

async function prefetchSomeSections(token, refs, maxProjects = 6) {
  try {
    const projects = refs.projects || [];
    for (let i = 0; i < Math.min(maxProjects, projects.length); i++) {
      const p = projects[i];
      if (!refs.sections[p.id]) {
        await ensureSections(token, refs, p.id).catch(() => {});
      }
    }
  } catch {}
}

function buildSectionsDoc(refs, maxProjects = 6) {
  try {
    const projects = (refs.projects || []).slice(0, maxProjects);
    const out = [];
    for (const p of projects) {
      const secs = (refs.sections[p.id] || []).map(s => s.name).filter(Boolean);
      if (secs.length) out.push(`- ${p.name}: ${secs.join(' | ')}`);
    }
    return out.join('\n');
  } catch { return ''; }
}

function matchProjectId(name, projects) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  const found = (projects || []).find((p) => String(p.name || '').trim().toLowerCase() === n);
  return found ? found.id : null;
}

function matchSectionId(name, projectId, sectionsByProject) {
  if (!name || !projectId) return undefined;
  const list = sectionsByProject[projectId] || [];
  const n = String(name).trim().toLowerCase();
  const found = list.find((s) => String(s.name || '').trim().toLowerCase() === n);
  return found ? found.id : undefined;
}

function mapLabelNamesToIds(names = [], labels = []) {
  if (!Array.isArray(names) || names.length === 0) return [];
  const map = new Map(labels.map((l) => [String(l.name || '').trim().toLowerCase(), l.id]));
  const out = [];
  for (const raw of names) {
    const id = map.get(String(raw || '').trim().toLowerCase());
    if (id) out.push(id);
  }
  return out;
}

async function ensureLabels(token, requestedNames = [], refs) {
  const existingMap = new Map((refs.labels || []).map((l) => [String(l.name || '').trim().toLowerCase(), l]));
  const created = [];
  for (const raw of requestedNames) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existingMap.has(key)) continue;
    const res = await fetch('https://api.todoist.com/rest/v2/labels', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      const lbl = await res.json();
      refs.labels.push(lbl);
      existingMap.set(key, lbl);
      created.push(lbl);
      try { const { file } = cachePaths(); fs.writeFileSync(file, JSON.stringify(refs), 'utf8'); } catch {}
      log(`🏷️ Created Todoist label: ${lbl.name}`);
    } else {
      const t = await res.text().catch(() => '');
      log(`⚠️ Failed to create label '${name}': ${res.status} ${t}`);
    }
  }
  return created;
}

function clampPriority(p) {
  const n = parseInt(p, 10);
  return Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : undefined;
}

// ---------- Anthropic ----------

async function analyzeTranscription({ transcription }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const model = process.env.VOICE_NOTE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';

  // Optional grounding from Todoist
  let projectsList = [];
  let labelsList = [];
  let sectionsDoc = '';
  try {
    if (process.env.TODOIST_API_TOKEN) {
      const refs = await getTodoistRefs(process.env.TODOIST_API_TOKEN);
      projectsList = (refs.projects || []).map((p) => p.name).slice(0, 100);
      labelsList = (refs.labels || []).map((l) => l.name).slice(0, 200);
      // Prefetch sections for first N projects to provide richer context
      const maxProjects = parseInt(process.env.VOICE_NOTE_SECTIONS_PREFETCH || '6', 10);
      await prefetchSomeSections(process.env.TODOIST_API_TOKEN, refs, maxProjects);
      sectionsDoc = buildSectionsDoc(refs, maxProjects);
    }
  } catch {}

  const sys = [
    'You extract structured task info from short voice transcriptions.',
    'Return strict JSON only. Do not include extra text.',
    'If unsure, leave fields empty or conservative.',
    'priority uses Todoist scale 1(low)–4(high).',
    projectsList.length ? `Projects: ${projectsList.join(' | ')}` : '',
    labelsList.length ? `Labels: ${labelsList.join(' | ')}` : '',
    sectionsDoc ? `Sections by Project:\n${sectionsDoc}` : '',
    'Rules: If a section clearly matches the intent (e.g., "upcoming bills"), set sectionName exactly as listed for the chosen project. Otherwise use null.'
  ].filter(Boolean).join('\n');

  const user = `Transcription:\n${transcription}\n\nRespond with JSON exactly matching this schema:\n{\n  "title": string,\n  "description": string | null,\n  "category": "meetings|ideas|tasks|personal|support|documentation|misc",\n  "projectName": string | null,\n  "sectionName": string | null,\n  "labels": string[],\n  "priority": 1|2|3|4 | null,\n  "due_string": string | null,\n  "urls": string[]\n}`;

  const respRaw = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model, max_tokens: 400, system: sys, messages: [{ role: 'user', content: user }], temperature: 0 })
  });
  if (!respRaw.ok) {
    const t = await respRaw.text().catch(() => '');
    throw new Error(`Anthropic error ${respRaw.status}: ${t}`);
  }
  const resp = await respRaw.json();
  let json = {};
  try { json = JSON.parse(resp.content?.[0]?.text || '{}'); }
  catch {
    try { const m = String(resp.content?.[0]?.text || '').match(/\{[\s\S]*\}/); if (m) json = JSON.parse(m[0]); } catch {}
  }
  if (!json.title) json.title = transcription.split('\n')[0].slice(0, 120);
  if (!json.category) json.category = 'misc';
  // Apply optional heuristic rules from tools/voice-note-rules.json
  try {
    const rules = loadRules();
    if (rules) json = applyRules({ transcription, enriched: json, rules });
  } catch {}
  return { enriched: json, category: json.category };
}

// ---------- Main Flow ----------

async function captureClipboardTranscription() {
  const sentinel = `__VOICE_NOTE_WAIT_${Math.random().toString(36).slice(2)}_${Date.now()}__`;
  const original = pbpaste();
  pbcopy(sentinel);

  // Launch SuperWhisper toggle
  openUrl('raycast://extensions/nchudleigh/superwhisper/toggle-record');
  log('Recording started; waiting for SuperWhisper to finish...');

  // Wait for SuperWhisper to finish by watching its recordings folder for a new item
  const stopDetected = await waitForSuperwhisperStop(10 * 60_000); // up to 10 minutes

  // After stop, capture the clipboard change (SuperWhisper copies transcription)
  log('Recording finished; waiting for clipboard update...');
  const captured = await waitForClipboardChangeFromSentinel(sentinel, 20_000); // 20s window after stop

  // Restore original clipboard
  await sleep(1200);
  pbcopy(original);
  log('Restored original clipboard content');

  if (!captured) {
    notify('⚠️ Voice Note Error', 'No new clipboard content detected');
    throw new Error('Timeout waiting for transcription');
  }
  return captured.trim();
}

function listDirNamesSafe(dir) {
  try { return fs.readdirSync(dir).filter(Boolean); } catch { return []; }
}

async function waitForSuperwhisperStop(timeoutMs = 600_000) {
  const base = path.join(os.homedir(), 'Documents', 'SuperWhisper', 'recordings');
  if (!fs.existsSync(base)) {
    log('ℹ️ SuperWhisper recordings dir not found; skipping stop detection.');
    return null;
  }
  const baseline = new Set(listDirNamesSafe(base));
  const start = Date.now();
  const interval = 200;
  if (baseline.size === 0) log('ℹ️ SuperWhisper recordings dir baseline is empty.');
  while (Date.now() - start < timeoutMs) {
    const names = listDirNamesSafe(base);
    const added = names.find(n => !baseline.has(n));
    if (added) {
      // Optional settle: give the OS a moment to flush file writes
      await sleep(500);
      log(`Detected new SuperWhisper recording: ${added}`);
      return { name: added, base };
    }
    await sleep(interval);
  }
  log('⚠️ Timeout waiting for SuperWhisper stop event; proceeding to clipboard capture anyway.');
  return null;
}

async function waitForClipboardChangeFromSentinel(sentinel, timeoutMs = 20_000) {
  const start = Date.now();
  const interval = 80;
  let last = sentinel;
  while (Date.now() - start < timeoutMs) {
    const cur = pbpaste();
    if (cur && cur !== sentinel && cur !== last && cur.length >= 8) {
      await sleep(200);
      const cur2 = pbpaste();
      return (cur2 && cur2.length >= cur.length) ? cur2 : cur;
    }
    last = cur;
    await sleep(interval);
  }
  return '';
}

async function maybeAddToTodoist({ transcription, category, analysis }) {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) { log('ℹ️ Todoist not configured (set TODOIST_API_TOKEN). Skipping.'); return; }
  const explicitProjectId = process.env.TODOIST_VOICE_PROJECT_ID || null;

  const { projectName, sectionName, labels = [], priority, due_string, title, description, urls = [] } = analysis?.enriched || {};

  const refs = await getTodoistRefs(token);
  // Always include a 'Voice' label plus AI-suggested labels
  const desiredLabels = Array.from(new Set(['Voice', ...labels].filter(Boolean)));
  await ensureLabels(token, desiredLabels, refs).catch(() => {});

  const projectId = explicitProjectId || matchProjectId(projectName, refs.projects) || null;
  if (projectId && sectionName) await ensureSections(token, refs, projectId).catch(() => {});
  const sectionId = projectId ? matchSectionId(sectionName, projectId, refs.sections) : undefined;
  const labelIds = mapLabelNamesToIds(desiredLabels, refs.labels); // kept for possible future use

  const fallbackTitle = transcription.split('\n')[0].slice(0, 120);
  const content = `${title || fallbackTitle}`.trim();

  let desc = description || '';
  if (!desc) desc = transcription;
  if (urls && urls.length) desc += `\n\nLinks:\n- ${urls.join('\n- ')}`;

  // If no section suggested, try fuzzy match against existing section names
  let finalSectionId = sectionId;
  if (projectId && !finalSectionId) {
    try { await ensureSections(token, refs, projectId); } catch {}
    const guessed = guessSectionIdFromContent({ transcription, analysis, projectId, refs });
    if (guessed) finalSectionId = guessed;
  }

  const common = {
    priority: clampPriority(priority),
    description: desc,
    ...(projectId ? { project_id: projectId } : {}),
    ...(projectId && finalSectionId ? { section_id: finalSectionId } : {}),
    // Use label names for REST v2 compatibility
    ...(desiredLabels.length ? { labels: desiredLabels } : {}),
  };

  // Always use /tasks with due_string for reliability (accepts project/section/labels/description)
  const url = 'https://api.todoist.com/rest/v2/tasks';
  const body = { content, ...(due_string ? { due_string } : {}), ...common };

  try { log(`[Todoist] POST /tasks body: ${JSON.stringify(body).slice(0,300)}${JSON.stringify(body).length>300?'…':''}`); } catch {}
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Request-Id': `${Date.now()}-${Math.random().toString(36).slice(2)}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Todoist error ${res.status}: ${t}`); }
  const task = await res.json();
  const projName = projectId ? (refs.projects.find(p => p.id === projectId)?.name || 'Project') : 'Inbox';
  const sectName = (projectId && (finalSectionId || sectionId)) ? (refs.sections[projectId]?.find(s => s.id === (finalSectionId || sectionId))?.name || '') : '';
  const where = sectName ? `${projName} › ${sectName}` : projName;
  log(`🧾 Todoist task created: ${task.id} (${where}, ${category})`);
  // Return info for notification
  return { task, where };
}

async function main() {
  loadEnv();

  const transcription = await captureClipboardTranscription();
  log(`📝 Processing: "${transcription.substring(0, 50)}..."`);

  const analysis = await analyzeTranscription({ transcription });
  const category = (analysis.category || 'misc').toLowerCase();
  const catCap = category.charAt(0).toUpperCase() + category.slice(1);

  const baseDir = path.join(os.homedir(), 'Documents', 'Voice Notes');
  const categoryDir = path.join(baseDir, catCap);
  ensureDir(categoryDir);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fp = path.join(categoryDir, `${ts}.txt`);
  try { fs.writeFileSync(fp, transcription); } catch {}
  log(`✅ Saved to: ${catCap}/${ts}.txt`);

  try {
    const result = await maybeAddToTodoist({ transcription, category, analysis });
    if (result && result.task) {
      notify('✅ Task Added', `${analysis?.enriched?.title || transcription.slice(0,50)} → ${result.where}`);
    } else {
      notify('✅ Voice Note Organized', `Filed to ${catCap}`);
    }
  } catch (e) {
    log(`❌ Todoist integration failed: ${e.message}`);
    notify('❌ Voice Note Error', e.message);
  }
}

// Ensure fetch exists (Node 18+); if not, fail gracefully
if (typeof fetch !== 'function') {
  log('❌ fetch is not available in this Node runtime. Please upgrade to Node 18+.');
  process.exit(1);
}

main().catch((e) => { log(`❌ Uncaught Error: ${e.message}`); notify('❌ Voice Note Error', e.message); });

// --- Fuzzy helpers ---
function normalize(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function containsWord(hay, needle) {
  const H = normalize(hay);
  const N = normalize(needle);
  if (!H || !N) return false;
  // exact word or substring match
  return H.includes(N);
}

function guessSectionIdFromContent({ transcription, analysis, projectId, refs }) {
  try {
    const sections = refs.sections[projectId] || [];
    if (!sections.length) return undefined;
    const candidates = [
      analysis?.enriched?.title,
      analysis?.enriched?.description,
      transcription
    ].filter(Boolean);
    // Score sections by presence in any candidate text
    let best = { id: undefined, score: 0 };
    for (const sec of sections) {
      const name = sec.name || '';
      let score = 0;
      for (const text of candidates) {
        if (containsWord(text, name)) score += name.length; // length-weighted match
      }
      if (score > best.score) best = { id: sec.id, score };
    }
    return best.id;
  } catch { return undefined; }
}
