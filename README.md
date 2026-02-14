# codex.gerrit

Codex Gerrit plugin that adds a chat panel to the bottom of a change view. It can send prompts
to supported AI CLIs for interactive chat and can generate/apply a patchset to the current change.

## Features

- Chat panel in the change footer with input and reply UI.
- CLI provider dropdown to choose among configured supported CLIs.
- Model selection dropdown that defaults to `Auto`, plus configured LiteLLM models.
- Run dropdown next to Model, with Console as a menu item to open a web sandbox popup for bash/git commands.
- `@` file mention dropdown sourced from current patchset files for context selection.
- Chat action returns a reply in the UI using the selected CLI and model.
- Apply Patchset updates files and publishes a new patchset on the change.
- Supports multiple AI CLIs: Codex (default), Claude, Gemini, OpenCode, and Qwen.
- Supports LiteLLM proxy integration with configurable base URL and API key.

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
	# Required: path to the Codex CLI binary.
	codexPath = /usr/local/bin/codex

	# Optional: extra CLI args passed to codex.
	codexArgs = --format text

	# Optional: path/args for other supported CLIs.
	claudePath = /usr/local/bin/claude
	claudeArgs = --print
	geminiPath = /usr/local/bin/gemini
	geminiArgs = --format text
	opencodePath = /usr/local/bin/opencode
	opencodeArgs = --format text
	qwenPath = /usr/local/bin/qwen
	qwenArgs = --format text

	# Optional: default CLI for the panel when no explicit CLI is selected.
	# Supported values: codex, claude, gemini, opencode, qwen.
	defaultCli = codex

	# Optional: Gerrit bot username used as a message prefix.
	gerritBotUser = codex-bot

	# Optional: limit how many file names are included in prompts.
	maxFiles = 200

	# Optional: bash executable used by the Console button sandbox.
	bashPath = /bin/bash

	# Optional: working directory for Console commands.
	# Set this to a git repository path if you want git commands like `git status`.
	consoleWorkDir = /path/to/repo

	# Optional: timeout in seconds for each Console command.
	consoleTimeoutSeconds = 20

	# Optional: LiteLLM proxy base URL.
	litellmBaseUrl = http://localhost:4000

	# Optional: LiteLLM API key.
	litellmApiKey = sk-your-api-key

	# Optional: Comma-separated list of available models for UI selection.
	litellmModels = gpt-4,gpt-3.5-turbo,claude-3-opus,claude-3-sonnet
```

Each configured CLI is expected to accept the prompt via stdin and print the response to stdout.

### LiteLLM Configuration

When `litellmBaseUrl` and `litellmApiKey` are configured, the plugin sets the `LITELLM_API_BASE`
and `LITELLM_API_KEY` environment variables when invoking the Codex CLI. If `litellmModels` is
configured, users can select a model from a dropdown in the chat panel.

- Selecting `Auto` (default) does not send `--model`, allowing the CLI/plugin to pick a model automatically.
- Selecting a specific model sends that value via the `--model` parameter.

See [LITELLM_CONFIG.md](LITELLM_CONFIG.md) for detailed LiteLLM configuration instructions.

## Usage

- Open any change page and scroll to the bottom to find the Codex Chat panel.
- Select a CLI from the dropdown (`codex`, `claude`, `gemini`, `opencode`, `qwen`; defaults to `codex`).
- Model defaults to `Auto` for automatic model selection; optionally choose a specific model from the dropdown.
- Select `Console` from the `Run` dropdown (next to `Model`) to open the web sandbox popup and run bash or git commands.
- In the Console popup, use `Run` to execute a command, `Close` to dismiss, `Esc` to close quickly, and `Ctrl+Enter` to run from the command input.
- Type `@` in the prompt to pick files from the current patchset and include them as context.
- Enter a prompt and click `Chat` to receive a reply in the UI from the selected CLI/model (or auto-selected model when `Auto` is chosen).
- Enter a prompt and click `Apply Patchset` to update files and publish a new patchset on the change.
	The patchset is published by the current user who triggered the action.

`gerritBotUser` is used as a message prefix for Gerrit review messages posted by patchset flow;
the review is posted by the current user who triggered the action.

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

### Console Notes

- Console commands run via `bash -lc`.
- Git commands are supported. For repository-scoped commands (for example `git status`), set
	`consoleWorkDir` to a valid git repository path.
- Console output is merged from stdout/stderr and may be truncated for safety.

## Reference

- [gerrit-dev-plugins-ui-extension](https://gerrit.cloudera.org/Documentation/dev-plugins.html#ui_extension)
- [gerrit-plugins-ai-code-review](https://gerrit.googlesource.com/plugins/ai-code-review/)
