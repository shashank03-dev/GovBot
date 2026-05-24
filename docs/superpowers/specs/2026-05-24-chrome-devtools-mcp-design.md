# Chrome DevTools MCP Setup Design

## Goal

Set up a project-scoped Chrome DevTools MCP configuration for GOVbot so anyone opening the repo in Cursor can use the official Chrome DevTools MCP server without creating a separate local server entry by hand.

The setup should:
- be checked into the repo,
- launch a visible Chrome window by default,
- stay aligned with Cursor's native project-level MCP discovery,
- avoid committing unrelated local Cursor state.

## Chosen Strategy

Use Cursor's project configuration file at `.cursor/mcp.json` and define a single stdio MCP server named `chrome-devtools`.

The server will use the official launch command:
- `command`: `npx`
- `args`: `["-y", "chrome-devtools-mcp@latest"]`

No headless flag will be added. That keeps Chrome visible for interactive debugging, inspection, and demo use.

## Scope

### In scope

- add a checked-in `.cursor/mcp.json`,
- update `.gitignore` so `.cursor/mcp.json` can be committed while other `.cursor` files remain ignored,
- add short usage and verification notes to `README.md`.

### Out of scope

- global `~/.cursor/mcp.json` setup,
- support for non-Cursor editors,
- pinning a fixed `chrome-devtools-mcp` version,
- advanced launch flags such as custom Chrome binaries, headless mode, or isolated profiles.

## Configuration Design

### Cursor project config

The new file will live at `.cursor/mcp.json` because Cursor's documented project-level MCP discovery uses that path.

The config shape is:

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

This keeps the setup minimal and aligned with the official Chrome DevTools MCP getting-started example.

### Visible Chrome behavior

The configuration intentionally omits `--headless`.

That means:
- Chrome opens as a normal visible browser window,
- agents can inspect live rendering during debugging,
- the behavior matches the user's stated preference for an interactive browser session.

## Git Ignore Design

The repo currently ignores the full `.cursor/` directory. That prevents a shared project config from being committed.

The ignore rules should be narrowed so:
- `.cursor/mcp.json` is tracked,
- every other file under `.cursor/` stays ignored by default.

The target pattern is:

```gitignore
.cursor/*
!.cursor/mcp.json
```

If needed for Git path traversal, `.cursor/` itself should be unignored while its contents remain ignored except for `mcp.json`.

## README Changes

The README should gain a short note in the local setup section or a nearby tooling note that explains:
- this repo includes a project-scoped Cursor MCP config,
- Cursor should auto-discover it from `.cursor/mcp.json`,
- teammates need `node` and `npx` available locally,
- they can verify discovery with Cursor's MCP UI or `cursor-agent mcp list`.

The README should stay brief. The config file itself is the source of truth.

## Failure Modes And Constraints

### Local prerequisites

This setup depends on:
- Node.js v20.19 or newer being installed,
- `npx` being available on the local machine,
- Cursor supporting project-level MCP discovery from `.cursor/mcp.json`.

If one of those is missing, the server will not start even though the repo config is present.

### Package freshness

Using `@latest` favors ease of setup and follows the official example, but it means behavior can change when the upstream package changes.

That trade-off is acceptable here because:
- the user asked for setup rather than version-locking,
- Chrome DevTools MCP is still evolving,
- the official docs use `@latest`.

If reproducibility becomes more important later, the config can be pinned to a specific version.

## Verification Plan

After implementation, verify with:

1. `cat .cursor/mcp.json` to confirm the checked-in server entry.
2. `git check-ignore -v .cursor/mcp.json` to confirm the file is no longer ignored.
3. `cursor-agent mcp list` if Cursor CLI is installed, to confirm project discovery.
4. Cursor editor MCP settings, to confirm the `chrome-devtools` server appears.
5. One real prompt through Cursor, such as asking the agent to inspect a local page, to confirm Chrome opens visibly.

## Success Criteria

This design is successful if:
- `.cursor/mcp.json` is committed in the repo,
- teammates opening the repo in Cursor can see the `chrome-devtools` MCP server without manual entry,
- launching the server opens a visible Chrome window,
- no unrelated `.cursor` files become tracked,
- the README explains the dependency and verification path clearly enough for reuse.
