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
- `#insight` optional flags:
	- `--repo <path>`: repository path for insight.
	- `--out <path>`: output directory for generated files.
	- `--dry-run`: run insight in dry-run mode.

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
- If multiple Markdown files are returned, they are merged and shown as sections in one popup.
- If `--repo` is omitted, the panel may prompt for workspace root path.
