# Chrome DevTools MCP Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped Cursor MCP config for Chrome DevTools that is committed to the repo, opens a visible Chrome window by default, and is documented for teammates.

**Architecture:** Keep the implementation small and native to Cursor. Track a single `.cursor/mcp.json` file with the official `npx -y chrome-devtools-mcp@latest` stdio config, narrow `.gitignore` so only that shared file is committed from `.cursor/`, and add a short README note for discovery and verification.

**Tech Stack:** Cursor MCP project config, JSON, `.gitignore`, Markdown, Git, Node.js `npx`

---

### Task 1: Track the shared Cursor MCP config in the repo

**Files:**
- Modify: `.gitignore`
- Create: `.cursor/mcp.json`

- [ ] **Step 1: Confirm the current repo blocks the shared config**

Run:

```bash
git check-ignore -v .cursor/mcp.json
```

Expected: output shows `.gitignore` currently ignores `.cursor/mcp.json` via the `.cursor/` rule.

- [ ] **Step 2: Narrow the `.cursor` ignore rule so `mcp.json` can be tracked**

Update the IDE section in `.gitignore` from:

```gitignore
.claude/
.cursor/
.idea/
.vscode/
```

to:

```gitignore
.claude/
.cursor/*
!.cursor/mcp.json
.idea/
.vscode/
```

- [ ] **Step 3: Create the project-scoped Cursor MCP config**

Create `.cursor/mcp.json` with exactly:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

- [ ] **Step 4: Verify the config is valid JSON and no longer ignored**

Run:

```bash
python -m json.tool .cursor/mcp.json >/dev/null
if git check-ignore -v .cursor/mcp.json; then
  echo "STILL_IGNORED"
  exit 1
else
  echo "NOT_IGNORED"
fi
```

Expected:
- the JSON validation command exits successfully with no output,
- the second command prints `NOT_IGNORED`.

- [ ] **Step 5: Commit the repo config change**

Run:

```bash
git add .gitignore .cursor/mcp.json
git commit -m "chore: add project chrome devtools mcp config"
```

Expected: one commit containing the `.gitignore` change and the new `.cursor/mcp.json` file.

### Task 2: Document how teammates use the shared MCP setup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Confirm the README does not already document the shared config**

Run:

```bash
rg -n "chrome-devtools|mcp.json|cursor-agent mcp list" README.md
```

Expected: no matches.

- [ ] **Step 2: Add a short Cursor MCP note in the local setup section**

Insert this block after the frontend dependency step and before the environment-file section:

```md
### Cursor Chrome DevTools MCP

This repo includes a project-scoped Cursor MCP config at `.cursor/mcp.json` for Chrome DevTools.

- Cursor should auto-discover the `chrome-devtools` server when you open the project.
- The server launches with `npx -y chrome-devtools-mcp@latest` and opens a visible Chrome window by default.
- Make sure your local machine has Node.js v20.19+ and `npx` available.
- If you use Cursor CLI, run `cursor-agent mcp list` from the repo root to verify discovery.
```

- [ ] **Step 3: Verify the README now exposes the setup and verification path**

Run:

```bash
rg -n "Cursor Chrome DevTools MCP|chrome-devtools|cursor-agent mcp list|Node.js v20.19" README.md
```

Expected: matches show the new documentation block in the local setup area.

- [ ] **Step 4: Commit the README change**

Run:

```bash
git add README.md
git commit -m "docs: add cursor chrome devtools mcp note"
```

Expected: one commit containing only the README documentation update.

### Task 3: Verify discovery and visible-browser behavior end to end

**Files:**
- Verify only

- [ ] **Step 1: Recheck the tracked config and working tree**

Run:

```bash
cat .cursor/mcp.json
git status --short
```

Expected:
- `cat` shows the `chrome-devtools` config with `npx`, `-y`, and `chrome-devtools-mcp@latest`,
- `git status --short` is clean.

- [ ] **Step 2: Verify CLI discovery when available**

Run:

```bash
if command -v cursor-agent >/dev/null; then
  cursor-agent mcp list
else
  echo "cursor-agent not installed; verify in Cursor MCP settings instead"
fi
```

Expected:
- if Cursor CLI is installed, the output includes the project-scoped `chrome-devtools` server,
- otherwise the fallback message prints and editor-side verification is still required.

- [ ] **Step 3: Verify editor-side discovery and visible Chrome behavior manually**

In Cursor:

```text
Open Settings -> MCP, confirm the project lists chrome-devtools from .cursor/mcp.json, then ask the agent to inspect any local page and confirm a visible Chrome window opens.
```

Expected:
- the `chrome-devtools` server appears in Cursor's MCP settings,
- starting a browser task opens a normal visible Chrome window rather than headless-only behavior.

## Self-Review

- Spec coverage: the plan covers the checked-in config, targeted `.gitignore` change, README note, and discovery verification path from the approved design.
- Placeholder scan: no `TODO`, `TBD`, or generic "handle later" steps remain.
- Type consistency: the same server name `chrome-devtools`, config path `.cursor/mcp.json`, and launch args `["-y", "chrome-devtools-mcp@latest"]` are used throughout.
