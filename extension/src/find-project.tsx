import { Action, ActionPanel, Clipboard, List, getPreferenceValues, showHUD, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";

type Prefs = { todoistApiToken: string };

type Project = { id: string; name: string };

export default function Command() {
  const prefs = getPreferenceValues<Prefs>();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://api.todoist.com/rest/v2/projects", { headers: { Authorization: `Bearer ${prefs.todoistApiToken}` } });
        if (!res.ok) throw new Error(`Projects ${res.status}`);
        const data = (await res.json()) as any[];
        setProjects(data.map((p) => ({ id: String(p.id), name: String(p.name) })));
      } catch (e: any) {
        await showToast(Toast.Style.Failure, "Failed to load projects", e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copy(id: string, name: string) {
    await Clipboard.copy(id);
    await showHUD(`Copied ${name} → ${id}`);
  }

  return (
    <List isLoading={loading} searchBarPlaceholder="Search Todoist projects…">
      {projects.map((p) => (
        <List.Item key={p.id} title={p.name} subtitle={p.id} actions={<Actions id={p.id} name={p.name} onCopy={copy} />} />
      ))}
    </List>
  );
}

function Actions(props: { id: string; name: string; onCopy: (id: string, name: string) => void }) {
  return (
    <ActionPanel>
      <Action title="Copy Project ID" onAction={() => props.onCopy(props.id, props.name)} />
    </ActionPanel>
  );
}

