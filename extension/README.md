# 🎙️ Voice to Todoist · Raycast Extension

> **The production-ready Raycast extension** — Full TypeScript implementation with preferences UI, project finder, and rules editor. For the lightweight script version, see the parent directory.

[![TypeScript](https://img.shields.io/badge/TypeScript-Powered-blue)](https://www.typescriptlang.org)
[![Raycast API](https://img.shields.io/badge/Raycast-API-FF6363)](https://developers.raycast.com/?via=verygoodplugins)
[![Store Ready](https://img.shields.io/badge/Store-Ready-green)](https://raycast.com/store?via=verygoodplugins)

## Setup

1) Install dependencies
```bash
npm install
```

2) Add preferences (Raycast → Extensions → Voice to Todoist)
- Anthropic API Key (secret)
- Todoist API Token (secret)
- Optional: Default Project ID, Model, Sections Prefetch, Enable Rules

Examples:

- Get your Todoist project IDs:
```bash
curl -s https://api.todoist.com/rest/v2/projects -H "Authorization: Bearer $TODOIST_API_TOKEN" | jq -r '.[] | "\(.id) \(.name)"'
```

- Set preferences in Raycast:
  - Default Project ID: paste the numeric id (keeps Inbox if omitted)
  - Model: `claude-3-5-haiku-latest` (fast/cost‑efficient) or `claude-3-7-sonnet-20250219` (most reliable)
  - Sections Prefetch: 6 (number of projects to include sections for in the AI context)
  - Enable Rules: on (use a JSON rules file to guide routing)

3) Dev / Build
```bash
npm run dev    # run locally
npm run build  # validate build
```

4) Publish (opens PR to raycast/extensions)
```bash
npm run publish
```

## Usage
- Map a shortcut (e.g., Cmd+Shift+T) to "Voice to Todoist"
- Start speaking, press ESC to stop
- You’ll get a HUD: `Task Added → Project › Section`

## Notes
- The command opens SuperWhisper’s `toggle-record` URL, waits for the recording to finish (by detecting a new recording folder), then captures the clipboard once and restores it.
- The extension passes project/section/label names into the LLM to encourage an exact match when appropriate.

## Optional Rules
Place `voice-note-rules.json` in the extension’s Support Path to add simple routing rules:
```json
{ "rules": [
  { "test": "(?i)(bill|billing|invoice)", "projectName": "Work", "sectionName": "Upcoming bills", "labels": ["finance"], "priority": 3 }
]}
```

Support Path (Raycast) is shown in the dev logs and accessible via `environment.supportPath`.

More rule examples:
```json
{ "rules": [
  { "test": "(?i)(bill|billing|invoice)", "projectName": "Work", "sectionName": "Upcoming bills", "labels": ["finance"], "priority": 3 },
  { "test": "(?i)(hubspot|wp\\s*fusion)", "projectName": "Work", "sectionName": "WP Fusion", "labels": ["client","hubspot"], "priority": 3 },
  { "test": "(?i)(groceries|shopping)", "projectName": "Personal", "labels": ["errand"], "due_string": "today" }
]}
```

## Icon
- Add a 512×512 `assets/icon.png`. Concept ideas:
  - A microphone glyph feeding into the Todoist checkmark
  - A waveform arrow pointing to a Todoist checkbox
  - A talking bubble + Todoist glyph combo

## Permissions
- Reads `~/Documents/SuperWhisper/recordings` to detect stop event
- Reads/Writes clipboard once per run
- Uses network: Anthropic + Todoist REST v2

## Privacy
- API keys are stored as Raycast Preferences (never committed)
- Only the transcription and selected fields are sent to Anthropic and Todoist

## Troubleshooting
- No labels? Ensure we send `labels` (names) not `label_ids`. This extension uses `labels`.
- Wrong section? The model may skip it; a fuzzy fallback runs per project. Add a rule or increase `Sections Prefetch`.
- No transcription? Make sure SuperWhisper is configured to copy transcription to clipboard after stop.

## 📄 License

MIT License - see [LICENSE](../LICENSE) for details.

---

Built with 🧡 by [Jack Arturo](https://github.com/jackarturo) at [Very Good Plugins](https://verygoodplugins.com?utm_source=github&utm_medium=readme&utm_campaign=voice-to-todoist-extension) · Made with love for the open-source community
