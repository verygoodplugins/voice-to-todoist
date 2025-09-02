# 🎙️ Voice to Todoist · Raycast Extension

> **Speak your tasks, get them organized** — Record with SuperWhisper, let Claude understand context, and watch your Todoist magically organize itself. No typing, no manual filing, just natural speech that becomes perfectly structured tasks.

[![Raycast Extension](https://img.shields.io/badge/Raycast-Extension-FF6363)](https://raycast.com/?via=verygoodplugins)
[![SuperWhisper](https://img.shields.io/badge/SuperWhisper-Required-blue)](https://superwhisper.com)
[![Claude AI](https://img.shields.io/badge/Claude-Powered-orange)](https://claude.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

https://github.com/user-attachments/assets/2d91ccc4-f018-494f-8e1c-f4358041362d

## ✨ What Makes This Special

🎯 **Natural Language Intelligence**: Say "remind me to review the quarterly report next Tuesday, it's high priority" and get a properly filed task with due date, priority, and labels.

🚀 **Zero-Friction Capture**: Hit your hotkey, speak, press ESC. Task is created, filed, and you're back to work in seconds.

🧠 **Smart Context Understanding**: Claude parses intent, not just words. It knows "EOD" means today at 5pm and "the usual project" means your default.

🎯 **Intelligent Routing**: Automatically caches your Todoist projects, labels, and sections (6h TTL) and passes them to the LLM for perfect task placement. No more manual filing!

⚡ **Two Powerful Modes**:
- **Script Command**: Lightweight, single-file, instant deployment
- **Full Extension**: TypeScript, preferences UI, project finder, rules editor

🏷️ **Auto-Label Creation**: Mention a label that doesn't exist? It's created automatically. Your taxonomy grows organically.

📁 **Voice Archive**: Every recording saved to `~/Documents/Voice Notes/` categorized by type for future reference.

## 🔧 Works With Any Automation Tool

While we love Raycast, the script (`tools/voice-note-raycast.js`) is just standalone Node.js that works with ANY automation tool:

### Alfred Workflow
```bash
# In Alfred Workflow, add Run Script action:
/usr/local/bin/node /path/to/voice-to-todoist/tools/voice-note-raycast.js
```

### Hammerspoon
```lua
-- In ~/.hammerspoon/init.lua
hs.hotkey.bind({"cmd", "shift"}, "T", function()
  hs.task.new("/usr/local/bin/node", nil, {"/path/to/voice-to-todoist/tools/voice-note-raycast.js"}):start()
end)
```

### Apple Shortcuts
1. Create new Shortcut
2. Add "Run Shell Script" action
3. Enter: `node /path/to/voice-to-todoist/tools/voice-note-raycast.js`
4. Assign keyboard shortcut in Settings

### Keyboard Maestro
Create macro with "Execute Shell Script" action using the same node command.

### Terminal/CLI
```bash
# Run directly anytime
node tools/voice-note-raycast.js

# Or make it executable
chmod +x tools/voice-note-raycast.js
./tools/voice-note-raycast.js
```

The script handles everything: triggers SuperWhisper, captures transcription, calls Claude, creates task. No Raycast required!

## 🏃 Quick Start

### Option 1: Script Command (5 minutes)

```bash
# Clone the repo
git clone https://github.com/verygoodplugins/voice-to-todoist.git
cd voice-to-todoist

# Link to Raycast Scripts
npm run install:raycast

# Create your config
cp .env.example .env
# Add your API keys to .env

# Reload in Raycast
# Search: "Reload Script Directories"
```

### Option 2: Full Extension (Production Ready)

```bash
# Install the extension
cd extension
npm install

# Configure in Raycast preferences:
# - Anthropic API Key
# - Todoist API Token
# - (Optional) Default Project

# Run in development
npm run dev

# Or build for production
npm run build
```

## ⚙️ Configuration

### Getting Your Anthropic API Key (2 minutes)
1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in (new users get $5 free credits)
3. Go to **API Keys** → **Create Key**
4. Copy your key starting with `sk-ant-api03-...`

**🎉 Free Credits**: New users get $5 in credits — enough for ~15,000 voice tasks with Haiku!

### Script Command (.env)
```env
ANTHROPIC_API_KEY=sk-ant-...
TODOIST_API_TOKEN=...

# Optional
TODOIST_VOICE_PROJECT_ID=2359262770
VOICE_NOTE_MODEL=claude-3-5-haiku-latest  # or claude-3-7-sonnet-latest
TODOIST_CACHE_TTL_MS=21600000  # 6 hours
```

### Extension (Raycast Preferences)
Configure directly in Raycast → Extensions → Voice to Todoist:
- 🔑 **API Keys**: Anthropic & Todoist (stored securely)
- 📁 **Default Project**: ID or name for quick filing
- 🤖 **Model**: Choose based on your needs (see comparison below)
- 📑 **Sections Prefetch**: How many projects to include section data for
- 📋 **Rules**: Enable JSON-based routing rules

### 🤖 Model Comparison

| Model | Speed | Cost per 1K tasks | Best For |
|-------|-------|-------------------|----------|
| **claude-3-5-haiku-latest** | ~0.8s | ~$0.30 | Straightforward tasks ("Buy milk tomorrow at 2pm") |
| **claude-3-7-sonnet-latest** | ~1.5s | ~$1.25 | Complex parsing ("that thing we discussed with John") |

**💡 Cost Reality Check**: Even if you create 100 voice tasks per day, you'd spend less than $1/month with Haiku. That's 3,000 tasks for the price of a coffee!

**Recommendation**: Start with Haiku — it's excellent at structured data extraction and handles 95% of voice tasks perfectly. Only upgrade to Sonnet if you need:
- Complex natural language understanding
- Smart date/time/priority inference from context
- Handling of ambiguous or multi-step requests

## 🎯 Usage

### Basic Flow
1. **Trigger**: Hit `Cmd+Shift+T` (or your custom hotkey)
2. **Speak**: "Schedule a call with Sarah about the Q4 roadmap next Friday at 2pm, tag it as high priority"
3. **Stop**: Press `ESC` when done
4. **Done**: See notification → `✅ Task Added: Call with Sarah → Work › Meetings`

### What Claude Understands

✅ **Natural Dates**: "tomorrow", "next Monday", "end of month", "in 2 weeks"  
✅ **Times**: "at 3pm", "morning", "EOD" (5pm), "by noon"  
✅ **Priority**: "urgent", "high priority", "ASAP" → p1, p2, p3  
✅ **Projects**: Fuzzy matches your existing projects  
✅ **Sections**: Finds the right section within projects  
✅ **Labels**: Creates them if they don't exist  
✅ **Context**: "the usual place" uses your default project  

## 🛠️ Advanced Features

### Custom Routing Rules
Create `tools/voice-note-rules.json`:
```json
{
  "rules": [
    {
      "test": "(?i)(meeting|call|standup)",
      "projectName": "Work",
      "sectionName": "Meetings",
      "labels": ["meeting"],
      "priority": 2
    },
    {
      "test": "(?i)(bug|fix|broken)",
      "projectName": "Development",
      "labels": ["bug", "urgent"],
      "priority": 1
    }
  ]
}
```

### Voice Archive
All recordings are saved to:
```
~/Documents/Voice Notes/
├── Work/           # Category from Claude
│   └── 2024-01-15-09-30-45.txt
├── Personal/
├── Shopping/
└── Misc/
```

## 🏗️ Architecture

### Two Implementations, One Goal

**Script Command** (`tools/voice-note-raycast.js`)
- Single Node.js file, zero dependencies
- Clipboard sentinel technique for reliable capture
- Direct API calls, no framework overhead
- Perfect for personal use

**Extension** (`extension/`)
- Full TypeScript with @raycast/api
- Preference UI for easy configuration
- Built-in project finder and rules editor
- Store-ready for distribution

### How It Works
1. **Trigger**: Opens SuperWhisper via `raycast://` URL scheme
2. **Capture**: Polls for recording completion, grabs clipboard
3. **Context**: Loads cached Todoist structure (projects, labels, sections)
4. **Parse**: Claude analyzes speech with full context for intelligent routing
5. **Create**: Todoist API creates perfectly filed task with all metadata
6. **Archive**: Raw transcript saved for reference

## 🐛 Troubleshooting

**No transcription detected?**
- Ensure SuperWhisper copies to clipboard on stop
- Check `~/Documents/Voice Notes/process.log`

**Wrong project/section?**
- Increase `sectionsPrefetch` in preferences
- Add specific rules to `voice-note-rules.json`
- Use project name in your speech

**Labels not created?**
- We use `labels` (names) not `label_ids`
- Check Todoist API token has write permissions

## 🔐 Privacy & Security

- 🔒 API keys stored in Raycast's secure preferences (never in code)
- 📝 Only transcription and extracted fields sent to APIs
- 💾 Local voice archive stays on your machine
- 🚫 No telemetry, no external logging

## 📚 Requirements

- macOS 12+ (Raycast requirement)
- [Raycast](https://raycast.com/?via=verygoodplugins) (free)
- [SuperWhisper](https://superwhisper.com) extension
- Node.js 18+ (for script command)
- API Keys:
  - [Anthropic](https://console.anthropic.com) (Claude)
  - [Todoist](https://todoist.com/app/settings/integrations/developer)

## 🤝 Contributing

Found a bug? Have an idea? PRs welcome!

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/voice-to-todoist.git

# Create your feature branch
git checkout -b feature/amazing-feature

# Commit your changes
git commit -m 'Add amazing feature'

# Push and create PR
git push origin feature/amazing-feature
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with 🧡 by [Jack Arturo](https://github.com/verygoodplugins) at [Very Good Plugins](https://verygoodplugins.com?utm_source=github&utm_medium=readme&utm_campaign=voice-to-todoist) for the open-source community.
