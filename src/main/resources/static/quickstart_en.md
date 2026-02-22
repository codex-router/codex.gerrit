# 💬 Codex Chat Quickstart

This guide covers only chat panel controls, keyboard commands, and button usage on a Gerrit change page.

## 🚀 Open the Chat Panel

1. Open any Gerrit change page.
2. Scroll to the bottom.
3. Find the **Codex Chat** panel.

## 🎛️ Selector Row Controls

- **Agent**: Loaded from `codex.serve` `GET /agents`.
	- First returned item is selected by default.
	- If loading fails, fallback is `codex`.
- **Model**: Loaded from `codex.serve` `GET /models`.
	- First returned item is selected by default.
	- Selected model is sent to backend as `--model`.
- **Codespaces -> Open in Browser**:
	- Currently coming soon.

## ⌨️ Prompt Commands

- Type your prompt and press `Enter` to send.
- Press `Ctrl+Enter` to insert a newline in the prompt.
- Press `Up` to load previous prompt from history.
- Press `Down` to move to newer prompt history.
- Type `@` to open patchset file mention suggestions.
- Type `@all` to include all current patchset files as context.

## 🔘 Buttons and Actions

- **Help**:
	- Located at the right side of the chat header.
	- Opens the Quickstart popup dialog.
	- Supports language switch between `English` and `中文`.
- **📎 Attach**:
	- Add local files as extra context.
	- Files appear as removable chips above input.
	- Files are sent with the next request and then cleared.
	- Browser-side file size limit is 512 KB per file.
- **Stop Chat**:
	- Interrupts the currently running chat session.
	- Plugin forwards stop request to `POST /sessions/{sessionId}/stop`.
- **Clear**:
	- Clears messages, input text, and pending review state.

## 📎 `@` File Context Behavior

- Patchset files are **not** included automatically.
- Only explicit `@` mentions are sent as patchset-file context.
- `@all` includes all current patchset files as context.
- Mentioned files are validated server-side against current patchset files.
- Mentioned files include current revision content when sent to the agent.

## 🔍 Review Popup Behavior

- If response includes unified diff content, review popup opens.
- Use **Keep** or **Undo** per file.
- If diff headers are missing, fallback can still map changes using `@` file context.
- For a single `@` file, fenced code-only replies can be converted into a synthesized unified diff preview.
