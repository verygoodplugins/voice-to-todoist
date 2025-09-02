# Voice to Todoist (Raycast Script Command)

Capture a voice note with SuperWhisper, parse it with Claude, and file a smart task into Todoist — with labels, due date, project, and section when applicable.

- One-file Raycast Script (Node.js, no node_modules)
- AI parsing via Anthropic (Claude)
- Auto-creates missing Todoist labels
- Caches Todoist projects/labels/sections (6h)

## Install

```bash
# Clone or open this folder
cd voice-to-todoist

# Link the command into Raycast
npm run install:raycast
# In Raycast: search "Reload Script Directories" and run it
```

## Configure

Create a `.env` file in this folder:

```env
ANTHROPIC_API_KEY=sk-ant-...
TODOIST_API_TOKEN=... # REST v2 token
# Optional
# TODOIST_VOICE_PROJECT_ID=2359262770
# VOICE_NOTE_MODEL=claude-3-5-haiku-latest
# TODOIST_CACHE_TTL_MS=21600000
```

(Optional) Create `tools/voice-note-rules.json` to add simple keyword → routing rules. See `tools/voice-note-rules.example.json`.

## Use

- In Raycast: run “Voice to Todoist” (bind to Cmd+Shift+T if you like)
- Press ESC to stop SuperWhisper recording
- You’ll get a macOS notification like: `Task Added: <title> → <Project › Section>`

## Notes

- Requires: macOS, Raycast, SuperWhisper extension, Node 18+
- The script waits for SuperWhisper to finish (new recording detected), then captures the clipboard transcription once and restores your clipboard.
- Tasks are created via Todoist REST v2 `/tasks` with `labels` by name.

## License
MIT
