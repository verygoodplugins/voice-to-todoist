import { Action, ActionPanel, Form, open, showHUD, showToast, Toast, useNavigation } from "@raycast/api";
import fs from "node:fs";
import path from "node:path";
import { environment } from "@raycast/api";

type Rule = { test: string; projectName?: string; sectionName?: string; labels?: string[]; priority?: number; due_string?: string };

export default function Command() {
  const { push } = useNavigation();
  return <RuleForm onDone={() => push(<DoneView />)} />;
}

function RuleForm({ onDone }: { onDone: () => void }) {
  async function handleSubmit(values: { test: string; projectName?: string; sectionName?: string; labels?: string; priority?: string; due_string?: string }) {
    try {
      const file = getRulesPath();
      const current = readRules(file);
      const rule: Rule = {
        test: values.test.trim(),
        projectName: values.projectName?.trim() || undefined,
        sectionName: values.sectionName?.trim() || undefined,
        labels: (values.labels || "").split(",").map((s) => s.trim()).filter(Boolean),
        priority: values.priority ? Number(values.priority) : undefined,
        due_string: values.due_string?.trim() || undefined
      };
      if (!rule.test) throw new Error("Regex pattern is required");
      current.rules = Array.isArray(current.rules) ? current.rules : [];
      current.rules.push(rule);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(current, null, 2), "utf8");
      await showHUD("✅ Rule added");
      onDone();
    } catch (e: any) {
      await showToast(Toast.Style.Failure, "Failed to add rule", e?.message || String(e));
    }
  }

  const file = getRulesPath();
  const existing = readRules(file).rules || [];
  const hint = existing.slice(0, 3).map((r: Rule) => `• ${r.test}${r.sectionName ? ` → ${r.sectionName}` : ""}`).join("\n");

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Rule" onSubmit={handleSubmit} />
          <Action.Open title="Open Rules File" target={file} application="Finder" />
          <Action title="Open in Default Editor" onAction={() => open(file)} />
        </ActionPanel>
      }
    >
      <Form.Description title="Existing Rules" text={existing.length ? `${existing.length} rule(s)\n${hint}` : "No rules yet"} />
      <Form.TextField id="test" title="Regex Pattern" placeholder="(?i)(bill|billing|invoice)" />
      <Form.TextField id="projectName" title="Project Name" placeholder="Work" />
      <Form.TextField id="sectionName" title="Section Name" placeholder="Upcoming bills" />
      <Form.TextField id="labels" title="Labels (comma-separated)" placeholder="finance, recurring" />
      <Form.Dropdown id="priority" title="Priority">
        <Form.Dropdown.Item value="" title="(none)" />
        <Form.Dropdown.Item value="1" title="1 (low)" />
        <Form.Dropdown.Item value="2" title="2" />
        <Form.Dropdown.Item value="3" title="3" />
        <Form.Dropdown.Item value="4" title="4 (high)" />
      </Form.Dropdown>
      <Form.TextField id="due_string" title="Due String" placeholder="tomorrow 9am" />
      <Form.Separator />
      <Form.Description title="Where is it saved?" text={file} />
      <Form.Description title="Tip" text="Open the JSON file to edit or delete rules." />
    </Form>
  );
}

function DoneView() {
  return <Form.Description title="Rule saved" text="You can close this window." />;
}

function getRulesPath() {
  return path.join(environment.supportPath, "voice-note-rules.json");
}

function readRules(p: string): { rules: Rule[] } {
  try {
    const t = fs.readFileSync(p, "utf8");
    const j = JSON.parse(t);
    if (Array.isArray(j?.rules)) return { rules: j.rules };
    return { rules: [] };
  } catch {
    return { rules: [] };
  }
}
