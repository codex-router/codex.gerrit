# codex.gerrit

Codex Gerrit plugin that adds a chat panel to the bottom of a change view. It can send prompts
to supported AI agents for interactive chat.

## Features

- Chat panel in the change footer with selector row, prompt input, actions, status, and output.
- Selector row includes `Agent`, `Model`, and `Codespaces` controls.
- Agent selector is populated from `codex.serve` `GET /agents`.
- The first item returned by `GET /agents` is selected by default.
- If `GET /agents` is unavailable, the selector falls back to `codex`.
- Model selector shows models returned by `codex.serve` `GET /models`.
- The first item returned by `GET /models` is selected by default.
- `@` file mention dropdown sourced from current patchset files for context selection.
- `Codespaces` includes `Open in Android Studio`, `Open in Browser` (coming soon), `Open in Cursor`, `Open in Trae`, and `Open in VS Code`.
- `Open in VS Code` writes all files from the latest patchset to a local directory and opens that directory/files in VS Code.
- `Open in Trae` writes all files from the latest patchset to a local directory and opens that directory/files in Trae.
- Chat mode is the default input mode and returns a reply in the UI using the selected agent and model.
- When Codex response includes a unified diff, a popup dialog shows changed files and patch content.
- Popup dialog supports per-file `Keep` or `Undo` decision similar to Copilot-style review flow.
- Stop Chat interrupts an active chat request from the panel.
- Supports multiple AI agents exposed by `codex.serve`.
- Loads available models from `codex.serve` via `GET /models`.

## Build

```bash
mvn -U clean package
```

## Install

Upload the jar from `target/codex-gerrit-<version>.jar` to `$gerrit_site/plugins`.

## Configuration

Add the following to `$gerrit_site/etc/gerrit.config`:

```
[plugin "codex-gerrit"]
	# Required: URL for codex.serve to run agents remotely.
	codexServeUrl = http://localhost:8000

	# Optional: Gerrit bot username used as a message prefix.
	gerritBotUser = codex-bot

	# Optional: limit how many file names are included in prompts.
	maxFiles = 200
```

### Remote Execution (codex.serve)

`codex.gerrit` executes all agents via `codex.serve` using `POST /run`.

```
[plugin "codex-gerrit"]
    codexServeUrl = http://codex-serve:8000
```

When enabled:
- All agent requests are sent to the configured URL via HTTP POST.
- The server must support the `codex.serve` API protocol (NDJSON streaming).
- The plugin sends `agent`, `stdin`, `sessionId`, and `args` (`--model` when a specific model is selected).
- During an active chat request, the plugin can stop that session via `POST /sessions/{sessionId}/stop`.
- The plugin fetches agent options from `codex.serve` using `GET /agents`.
- The first item returned by `GET /agents` is selected by default.
- If `GET /agents` fails, the UI falls back to `codex`.
- The plugin fetches model options from `codex.serve` using `GET /models`.
- The first item returned by `GET /models` is selected by default.

### LiteLLM Configuration

`codex.gerrit` does not configure LiteLLM directly.
Configure LiteLLM on `codex.serve` runtime environment (for example with `LITELLM_BASE_URL` and `LITELLM_API_KEY`).
In Docker mode, `codex.serve` passes these values to the execution container by default.
The model dropdown is populated from `codex.serve` `GET /models`.

- Selecting a specific model sends that value via the `--model` parameter.

## Usage

- Open any change page and scroll to the bottom to find the Codex Chat panel.
- Use the selector row to choose `Agent` (options are loaded from `codex.serve` `GET /agents`; the first returned item is selected by default, and if unavailable it falls back to `codex`).
- `Model` shows models loaded from `codex.serve`; the first returned item is selected by default, and you can optionally choose a specific model.
- Use `Codespaces` → `Open in Android Studio`, `Open in Cursor`, `Open in Trae`, or `Open in VS Code` to open all patchset files. `Open in Browser` currently shows a coming soon status.
- Type `@` in the prompt to pick files from the current patchset and include them as context.
- Enter a prompt and press `Enter` to send in default chat mode to the agent selected in `Agent` (or use `Shift+Enter` for a newline).
- Replies are shown in the UI using the selected agent/model.
- If a reply contains file diffs, review them in the popup and choose `Keep` or `Undo` for each file.
- While a chat request is running, click `Stop Chat` to interrupt the current session.
### Chat Session Stop Flow

- Each chat request includes a generated session identifier (`sessionId`) in the request to `codex.serve` `POST /run`.
- `Stop Chat` sends a plugin REST request to `codex-chat-stop`, which forwards to `codex.serve` `POST /sessions/{sessionId}/stop`.
- If the target session is already finished, `codex.serve` may return `404` and the panel shows the failure status.

`gerritBotUser` is used as a message prefix for Gerrit review messages.

When using `Open in Browser` for the first time, the panel prompts for your GitHub repository URL
(default: `https://github.com/codesandbox/codesandbox-client`) and stores it in browser local storage for future opens.

When using `Open in Android Studio`, `Open in Cursor`, `Open in Trae`, or `Open in VS Code` for the first time, the panel opens a workspace-root dialog.
Use `Browse...` to open the browser's native directory picker on Windows, Ubuntu/Linux, or macOS, then confirm or edit the root path and click `Save`.
If the native picker is blocked or unavailable, enter the path manually and click `Save`. The path is stored in browser local storage for future opens.
All actions open all current patchset files.

### Codespaces: Open in Android Studio

- `Open in Android Studio` downloads every file in the latest patchset from Gerrit to a local directory you choose in the browser file picker.
- In the workspace-root dialog, use `Browse...` (file explorer) and confirm the local repository root path (used to build `jetbrains://android-studio/...` links after download):
	- Linux/macOS example: `/home/<user>/my-tmp/codex.gerrit`
	- Windows example: `C:\Users\<user>\src\codex.gerrit`
- Pick the target local directory when prompted; plugin writes latest patchset files into that directory (including nested folders).
- The root path is saved in browser local storage and reused for later opens.
- If your browser asks for file-system write permission or to open Android Studio links, allow it.
- If files do not open, ensure JetBrains protocol handler support is enabled, use a Chromium-based browser (for directory picker support), and that the saved root path matches the selected local directory.

### Codespaces: Open in Browser

- `Open in Browser` is coming soon.

### Codespaces: Open in Cursor

- `Open in Cursor` writes every file in the latest patchset from Gerrit to your local workspace.
- In the workspace-root dialog, use `Browse...` (file explorer) and confirm the local repository root path (used to build `cursor://file/...` links after download):
	- Linux/macOS example: `/home/<user>/my-tmp/codex.gerrit`
	- Windows example: `C:\Users\<user>\src\codex.gerrit`
- If your browser supports directory picker, choose the target local directory and plugin writes files there.
- If directory picker is unavailable or blocked, plugin syncs files directly to the workspace root path you entered (via `codex.serve`) with no `.zip` artifact.
- The root path is saved in browser local storage and reused for later opens.
- If your browser asks for file-system write permission or to open Cursor links, allow it.
- If files do not open, check that Cursor URL handling is enabled, use a Chromium-based browser (for directory picker support), and that the saved root path matches the selected local directory.

### Codespaces: Open in Trae

- `Open in Trae` writes every file in the latest patchset from Gerrit to your local workspace.
- In the workspace-root dialog, use `Browse...` (file explorer) and confirm the local repository root path (used to build `trae://file/...` links after download):
	- Linux/macOS example: `/home/<user>/my-tmp/codex.gerrit`
	- Windows example: `C:\Users\<user>\src\codex.gerrit`
- If your browser supports directory picker, choose the target local directory and plugin writes files there.
- If directory picker is unavailable or blocked, plugin syncs files directly to the workspace root path you entered (via `codex.serve`) with no `.zip` artifact.
- The root path is saved in browser local storage and reused for later opens.
- If your browser asks for file-system write permission or to open Trae links, allow it.
- If files do not open, check that Trae URL handling is enabled, use a Chromium-based browser (for directory picker support), and ensure the saved root path matches the selected local directory.

### Codespaces: Open in VS Code

- `Open in VS Code` writes every file in the latest patchset from Gerrit to your local workspace.
- In the workspace-root dialog, use `Browse...` (file explorer) and confirm the local repository root path (used to build `vscode://file/...` links after download):
	- Linux/macOS example: `/home/<user>/my-tmp/codex.gerrit`
	- Windows example: `C:\Users\<user>\src\codex.gerrit`
- If your browser supports directory picker, choose the target local directory and plugin writes files there.
- If directory picker is unavailable or blocked, plugin syncs files directly to the workspace root path you entered (via `codex.serve`) with no `.zip` artifact.
- The root path is saved in browser local storage and reused for later opens.
- If your browser asks for file-system write permission or to open VS Code links, allow it.
- If files do not open, check that VS Code URL handling is enabled, use a Chromium-based browser (for directory picker support), and ensure the saved root path matches the selected local directory.

## Reference

- [gerrit-dev-plugins-ui-extension](https://gerrit.cloudera.org/Documentation/dev-plugins.html#ui_extension)
- [gerrit-plugins-ai-code-review](https://gerrit.googlesource.com/plugins/ai-code-review/)
