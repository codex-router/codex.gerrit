# codex.gerrit

Codex Gerrit plugin that adds a chat panel to the bottom of a change view. It can send prompts
to the OpenAI Codex CLI to generate change suggestions or review feedback and can post the reply
as a Gerrit review comment.

## Features

- Chat panel in the change footer with input and reply UI.
- Model selection dropdown to choose from configured LiteLLM models.
- Review action posts a Gerrit review comment (optionally tagged with a bot name).
- Generate action returns a reply in the UI without posting.
- Apply Patchset updates files and publishes a new patchset on the change.
- Uses the OpenAI Codex CLI as the AI agent (configurable path and args).
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

	# Optional: Gerrit bot username used as a message prefix.
	gerritBotUser = codex-bot

	# Optional: limit how many file names are included in prompts.
	maxFiles = 200

	# Optional: LiteLLM proxy base URL.
	litellmBaseUrl = http://localhost:4000

	# Optional: LiteLLM API key.
	litellmApiKey = sk-your-api-key

	# Optional: Comma-separated list of available models for UI selection.
	litellmModels = gpt-4,gpt-3.5-turbo,claude-3-opus,claude-3-sonnet
```

The Codex CLI is expected to accept the prompt via stdin and print the response to stdout.

### LiteLLM Configuration

When `litellmBaseUrl` and `litellmApiKey` are configured, the plugin sets the `LITELLM_API_BASE`
and `LITELLM_API_KEY` environment variables when invoking the Codex CLI. If `litellmModels` is
configured, users can select a model from a dropdown in the chat panel, which is passed to the
CLI via the `--model` parameter.

See [LITELLM_CONFIG.md](LITELLM_CONFIG.md) for detailed LiteLLM configuration instructions.

## Usage

- Open any change page and scroll to the bottom to find the Codex Chat panel.
- (Optional) Select a model from the dropdown if multiple models are configured.
- Enter a prompt and click `Review` to post the reply as a Gerrit review message.
- Enter a prompt and click `Generate` to receive a reply in the UI only.
- Enter a prompt and click `Apply Patchset` to update files and publish a new patchset on the change.
	The patchset is published by the current user who triggered the action.

`gerritBotUser` is used as a message prefix so the reply is easy to identify; the review is
posted by the current user who triggered the action.

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
