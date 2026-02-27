# Codex Chat Quickstart

## 🚀 Open the Chat Panel

1. Open any Gerrit change page.
2. Scroll to the bottom.
3. Find the **Codex Chat** panel.

## 🎛️ Dropdown Selection

- **Agent**:
	- By default, the first item in the returned list is selected.
	- If loading fails, it falls back to `codex`.
- **Model**:
	- By default, the first item in the returned list is selected.
	- The selected model is passed to the backend via `--model`.
- **Codespaces -> Open in Browser**:
	- Currently coming soon.

## ⌨️ Prompt Commands

- Type your prompt and press `Enter` to send.
- Press `Ctrl+Enter` to insert a newline in the prompt.
- Press `Up` to load previous prompt from history.
- Press `Down` to move to newer prompt history.
- Type `@` to open patchset file mention suggestions.
- Type `@all` to include all current patchset files as context.
- Type `#` to open all available command suggestions (shown with the `#` prefix).
- Type `#insight` to run insight generation and open the result in a Markdown popup dialog.
- Type `#graph` to run graph generation from selected files.
- `#insight` optional flags:
	- `--repo <path>`: repository path for insight.
	- `--out <path>`: output directory for generated files.
	- `--dry-run`: run insight in dry-run mode.
- `#graph` optional flags:
	- `--framework <name>` (or `--framework-hint <name>`): framework hint forwarded to graph analysis.
	- `--file` (or `--files`): choose one or more files as graph input.

## 🔘 Buttons and Actions

- **Help**:
	- Located at the right side of the chat header.
	- Click to open the Quickstart popup.
	- Supports language switching between `English` and `中文`.
- **📎 Attach**:
	- Add local files as extra context.
	- Files appear as removable chips above the input box.
	- Files are sent with the next request and then automatically cleared.
	- Browser-side file size limit is 512 KB per file.
- **Stop Chat**:
	- Interrupts the currently running chat session.
- **Clear**:
	- Clears messages, input content, and pending review state.

## 🚦 Queue Status Indicator

- The selector row shows a queue status card for chat requests.
- `Queue: idle` means no pending request.
- `Queue: request active` means your request is accepted and running.
- `Queue: waiting for slot` means backend capacity is busy and your request is waiting.
- `Queue: full` means server queue is saturated; retry after a short delay.
- `Queue: wait timeout` means queue wait exceeded server timeout; retry after a short delay.
- When queue backpressure happens, chat failure messages may include queue details from server `503` responses.

## 📎 Uploaded File Context

- Patchset files are **not** included automatically.
- Only explicit `@` mentions are sent as patchset-file context.
- `@all` includes all current patchset files as context.
- Mentioned files are validated server-side against current patchset files.
- Mentioned files include current revision content when sent to the agent.

## 🔍 Review Popup Behavior

- If the response includes unified diff content, the review popup opens.
- Use **Keep** or **Undo** per file.
- If diff headers are missing, fallback mapping can still be done using `@` file context.
- If only one `@` file is mentioned and the reply contains only a code block, a synthesized unified diff preview can still be generated.

## 📊 Insight Popup Behavior

- On success, generated Markdown content is displayed in a popup dialog.
- If multiple Markdown files are returned, each file is shown in its own tab in the popup.
- You can switch tabs to view each generated file and download the currently active file.
- If `--repo` is omitted, the panel prompts for repo path input in a dialog.

## 🕸️ Graph Popup Behavior

- On `#graph` success, graph result files are displayed in the same popup dialog style.
- `#graph` uses a file picker dialog and supports selecting one or more files only.
- The popup includes tabs (for example summary and response payload).
- You can switch tabs to inspect details and download the currently active graph result file.
- For graph payload tabs (for example `Graph-Response.md`), a `Visualize` button appears in the toolbar.
- Click `Visualize` to render the graph JSON into a node-edge diagram with workflow and LLM summary pills.
- Click the same button again (shown as `Markdown`) to return to the original Markdown payload view.
