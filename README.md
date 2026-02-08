# codex.gerrit

Codex Gerrit plugin that adds a chat panel to the bottom of a change view. It can send prompts
to the OpenAI Codex CLI to generate change suggestions or review feedback and can post the reply
as a Gerrit review comment.

## Features

- Chat panel in the change footer with input and reply UI.
- Review action posts a Gerrit review comment (optionally tagged with a bot name).
- Generate action returns a reply in the UI without posting.
- Apply Patchset updates files and publishes a new patchset on the change.
- Uses the OpenAI Codex CLI as the AI agent (configurable path and args).

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
	codexArgs = --model gpt-4o-mini --format text

	# Optional: Gerrit bot username used as a message prefix.
	gerritBotUser = codex-bot

	# Optional: limit how many file names are included in prompts.
	maxFiles = 200
```

The Codex CLI is expected to accept the prompt via stdin and print the response to stdout.

## Usage

- Open any change page and scroll to the bottom to find the Codex Chat panel.
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

- [gerrit-plugins-ai-code-review](https://gerrit.googlesource.com/plugins/ai-code-review/)
