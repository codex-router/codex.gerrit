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
- `Codespaces` includes `Open in Android Studio`, `Open in Browser`, `Open in Cursor`, and `Open in VS Code` to open patchset files in browser/local IDEs.
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
- Use `Codespaces` → `Open in Android Studio`, `Open in Browser`, `Open in Cursor`, or `Open in VS Code` to open all patchset files.
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

When using `Open in Android Studio`, `Open in Cursor`, or `Open in VS Code` for the first time, the panel prompts for your local repository root
path and stores it in browser local storage for future opens. All actions open all current patchset files.

### Codespaces: Open in Android Studio

- `Open in Android Studio` opens every file in the current patchset in your local Android Studio IDE using `jetbrains://android-studio/...` links.
- On first use, enter your local repository root path:
	- Linux/macOS example: `/home/<user>/my-tmp/codex.gerrit`
	- Windows example: `C:\Users\<user>\src\codex.gerrit`
- The root path is saved in browser local storage and reused for later opens.
- If your browser asks for permission to open Android Studio links, allow it.
- If files do not open, ensure JetBrains protocol handler support is enabled for Android Studio on your machine and that the saved root path matches your local checkout.

### Codespaces: Open in Browser

- `Open in Browser` opens every file in the current patchset in GitHub using `https://github.com/<owner>/<repo>/blob/HEAD/<path>` links.
- On first use, enter your repository URL:
	- Example: `https://github.com/codesandbox/codesandbox-client`
- The repository URL is saved in browser local storage and reused for later opens.
- If your browser blocks popups, allow popups for Gerrit to open all patchset files.

### Codespaces: Open in Cursor

- `Open in Cursor` opens every file in the current patchset in your local Cursor IDE using `cursor://file/...` links.
- On first use, enter your local repository root path:
	- Linux/macOS example: `/home/<user>/my-tmp/codex.gerrit`
	- Windows example: `C:\Users\<user>\src\codex.gerrit`
- The root path is saved in browser local storage and reused for later opens.
- If your browser asks for permission to open Cursor links, allow it.
- If files do not open, check that Cursor URL handling is enabled on your machine and that the saved root path matches your local checkout.

### Codespaces: Open in VS Code

- `Open in VS Code` opens every file in the current patchset using `vscode://file/...` links.
- On first use, enter your local repository root path:
	- Linux/macOS example: `/home/<user>/my-tmp/codex.gerrit`
	- Windows example: `C:\Users\<user>\src\codex.gerrit`
- The root path is saved in browser local storage and reused for later opens.
- If your browser asks for permission to open VS Code links, allow it.
- If files do not open, check that VS Code URL handling is enabled on your machine and that the saved root path matches your local checkout.

## Reference

- [gerrit-dev-plugins-ui-extension](https://gerrit.cloudera.org/Documentation/dev-plugins.html#ui_extension)
- [gerrit-plugins-ai-code-review](https://gerrit.googlesource.com/plugins/ai-code-review/)
