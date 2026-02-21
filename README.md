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
- Backend also parses `@` file mentions from prompt text and merges them with `contextFiles` for robust context selection.
- For selected or `@`-mentioned files, backend reads current revision file content and forwards it as explicit context so the agent can operate on actual file text.
- Patchset files are not included as default analysis context; they are included only when explicitly referenced via `@` mention.
- Users can attach arbitrary local files via the 📎 attach button in the chat panel; attached files are sent as inline context in each request and cleared after submission.
- Attached files are treated as authoritative inline context even when they are not part of the current patchset file list.
- Attached file content is bounded by a 512 KB per-file browser-side limit and a 12 000-character server-side limit per file.
- When one or more `@` files are mentioned, the plugin appends guidance to return unified diff blocks so `Review` can detect changed files and patch content.
- When one or more `@` files are mentioned, the plugin appends static-analysis guidance to focus findings on those files (bugs, security risks, null-safety, error handling, resource/concurrency risks, and performance concerns).
- If a diff block omits file headers, `Review` can still map changes to `@`-mentioned files and show the popup.
- If exactly one `@` file is mentioned and the reply provides only a fenced code block, the plugin synthesizes a unified diff preview for `Review`.
- `Codespaces` includes `Open in Browser`.
- `Open in Browser` is coming soon.
- Chat mode is the default input mode and returns a reply in the UI using the selected agent and model.
- When Codex response includes a unified diff, a popup dialog shows changed files and patch content.
- Popup dialog supports per-file `Keep` or `Undo` decision similar to Copilot-style review flow.
- Stop Chat interrupts an active chat request from the panel.
- Clear action removes all messages and resets chat panel state.
- Prompt history navigation in the input panel uses `Up` (previous) and `Down` (next/newer).
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
- When `@` files are used, the plugin also sends `contextFiles` with `{path, content}` entries to `codex.serve`.
- When files are attached by the user in the chat panel, the plugin sends attachment payloads with `name` (alias of `path`) and `base64Content` (or `content` fallback); backend forwards them to `codex.serve` via `contextFiles` for `POST /run` compatibility.
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
- Use `Codespaces` → `Open in Browser` (currently coming soon).
- Type `@` in the prompt to pick files from the current patchset and include them as context. Without `@` mentions, patchset files are not used as default analysis context.
- Click the 📎 button next to the prompt input to attach local files (up to 512 KB each). Attached files appear as removable chips above the input and are sent with the next request, then automatically cleared.
- `@` file mentions are validated server-side against patchset files and merged with UI-selected `contextFiles`.
- `@` file mentions now include real current-revision file content in the agent input (bounded by server-side limits).
- Attached files are considered valid inline context even when they are not part of the Gerrit change file list.
- If your prompt includes `@` files and requests code changes, Codex is guided to answer with unified diff blocks that automatically open the review dialog.
- If your prompt includes `@` files, Codex is also guided to perform static analysis for those files and report concrete risks.
- Even if the returned diff block does not include `diff --git` / `---` / `+++`, review fallback can still use `@` file context to enable the dialog.
- For single-file `@` prompts, a plain fenced code suggestion can still be shown in the review dialog via synthesized unified diff output.
- Enter a prompt and press `Enter` to send in default chat mode to the agent selected in `Agent` (or use `Ctrl+Enter` for a newline).
- In the prompt input, press `Up` to restore previous messages and `Down` to move forward to newer history entries.
- Replies are shown in the UI using the selected agent/model.
- If a reply contains file diffs, review them in the popup and choose `Keep` or `Undo` for each file.
- While a chat request is running, click `Stop Chat` to interrupt the current session.
- Click `Clear` to remove all chat panel content (messages, input, and pending review state).
### Chat Session Stop Flow

- Each chat request includes a generated session identifier (`sessionId`) in the request to `codex.serve` `POST /run`.
- `Stop Chat` sends a plugin REST request to `codex-chat-stop`, which forwards to `codex.serve` `POST /sessions/{sessionId}/stop`.
- If the target session is already finished, `codex.serve` may return `404` and the panel shows the failure status.

`gerritBotUser` is used as a message prefix for Gerrit review messages.

When using `Open in Browser` for the first time, the panel prompts for your GitHub repository URL
(default: `https://github.com/codesandbox/codesandbox-client`) and stores it in browser local storage for future opens.

### Codespaces: Open in Browser

- `Open in Browser` is coming soon.

## Reference

- [gerrit-dev-plugins-ui-extension](https://gerrit.cloudera.org/Documentation/dev-plugins.html#ui_extension)
- [gerrit-plugins-ai-code-review](https://gerrit.googlesource.com/plugins/ai-code-review/)
