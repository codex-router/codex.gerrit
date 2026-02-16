# codex.gerrit

Codex Gerrit plugin that adds a chat panel to the bottom of a change view. It can send prompts
to supported AI CLIs for interactive chat and can generate/apply a patchset to the current change.

## Features

- Chat panel in the change footer with selector row, prompt input, actions, status, and output.
- Selector row includes `CLI`, `Model`, and `Codespaces` controls.
- CLI selector chooses among configured supported CLIs.
- Model selector defaults to `Auto`, plus models returned by `codex.serve` `GET /models`.
- `@` file mention dropdown sourced from current patchset files for context selection.
- `Codespaces` includes `Open in Android Studio`, `Open in Browser`, `Open in Cursor`, and `Open in VS Code` to open patchset files in browser/local IDEs.
- Chat mode is the default input mode and returns a reply in the UI using the selected CLI and model.
- Apply Patchset updates files and publishes a new patchset on the change.
- Reverse Patchset restores the previous patchset state and publishes it as a new patchset on the same change.
- Supports multiple AI CLIs: Codex (default), Claude, Gemini, OpenCode, and Qwen.
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
	# Required: URL for codex.serve to run CLIs remotely.
	codexServeUrl = http://localhost:8000

	# Optional: default CLI for the panel when no explicit CLI is selected.
	# Supported values: codex, claude, gemini, opencode, qwen.
	defaultCli = codex

	# Optional: Gerrit bot username used as a message prefix.
	gerritBotUser = codex-bot

	# Optional: limit how many file names are included in prompts.
	maxFiles = 200
```

### Remote Execution (codex.serve)

`codex.gerrit` executes all CLIs via `codex.serve` using `POST /run`.

```
[plugin "codex-gerrit"]
    codexServeUrl = http://codex-serve:8000
```

When enabled:
- All CLI requests are sent to the configured URL via HTTP POST.
- The server must support the `codex.serve` API protocol (NDJSON streaming).
- The plugin sends `cli`, `stdin`, and `args` (`--model` when a specific model is selected).
- The plugin fetches model options from `codex.serve` using `GET /models`.

### LiteLLM Configuration

`codex.gerrit` does not configure LiteLLM directly.
Configure LiteLLM on `codex.serve` (for example with `LITELLM_API_BASE` and `LITELLM_API_KEY`).
The model dropdown is populated from `codex.serve` `GET /models`.

- Selecting `Auto` (default) does not send `--model`, allowing `codex.serve` and the CLI to pick a model automatically.
- Selecting a specific model sends that value via the `--model` parameter.

## Usage

- Open any change page and scroll to the bottom to find the Codex Chat panel.
- Use the selector row to choose `CLI` (`codex`, `claude`, `gemini`, `opencode`, `qwen`; defaults to `codex`).
- `Model` defaults to `Auto` for automatic model selection; optionally choose a specific model.
- Use `Codespaces` → `Open in Android Studio`, `Open in Browser`, `Open in Cursor`, or `Open in VS Code` to open all patchset files.
- Type `@` in the prompt to pick files from the current patchset and include them as context.
- Enter a prompt and press `Enter` to send in default chat mode to the CLI selected in `CLI` (or use `Shift+Enter` for a newline).
- Replies are shown in the UI using the selected CLI/model (or auto-selected model when `Auto` is chosen).
- Enter a prompt and click `Apply Patchset` to update files and publish a new patchset on the change.
	The patchset is published by the current user who triggered the action.
- Click `Reverse Patchset` to restore the previous patchset content as a new patchset on the same change.

`gerritBotUser` is used as a message prefix for Gerrit review messages posted by patchset flow;
the review is posted by the current user who triggered the action.

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

### Patchset Output Format

When using `Apply Patchset`, Codex must return updates using the following markers only:

```
BEGIN_SUMMARY
Short summary of the changes.
END_SUMMARY
BEGIN_COMMIT_MESSAGE
Optional commit message.
END_COMMIT_MESSAGE
BEGIN_FILE path/to/file
<full file content>
END_FILE
DELETE_FILE path/to/old_file
```

If no `BEGIN_SUMMARY` or `BEGIN_COMMIT_MESSAGE` block is provided, the plugin will apply the
files and publish the edit using the existing commit message.

## Reference

- [gerrit-dev-plugins-ui-extension](https://gerrit.cloudera.org/Documentation/dev-plugins.html#ui_extension)
- [gerrit-plugins-ai-code-review](https://gerrit.googlesource.com/plugins/ai-code-review/)
