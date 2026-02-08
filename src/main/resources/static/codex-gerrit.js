// Copyright (C) 2026
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

Gerrit.install(plugin => {
  const pluginName = plugin.getPluginName();

  class CodexChatPanel extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) {
        return;
      }
      this.attachShadow({ mode: 'open' });
      this.render();
    }

    render() {
      const wrapper = document.createElement('div');
      wrapper.className = 'codex-chat';

      const header = document.createElement('div');
      header.className = 'codex-header';
      header.textContent = 'Codex Chat';

      const input = document.createElement('textarea');
      input.className = 'codex-input';
      input.placeholder = 'Describe what you want. Use Review for feedback, Generate for ideas, or Apply Patchset to update files.';

      const actions = document.createElement('div');
      actions.className = 'codex-actions';

      const reviewButton = document.createElement('button');
      reviewButton.className = 'codex-button';
      reviewButton.textContent = 'Review';

      const generateButton = document.createElement('button');
      generateButton.className = 'codex-button secondary';
      generateButton.textContent = 'Generate';

      const applyButton = document.createElement('button');
      applyButton.className = 'codex-button outline';
      applyButton.textContent = 'Apply Patchset';

      const status = document.createElement('div');
      status.className = 'codex-status';

      const output = document.createElement('pre');
      output.className = 'codex-output';
      output.textContent = '';

      actions.appendChild(reviewButton);
      actions.appendChild(generateButton);
      actions.appendChild(applyButton);

      wrapper.appendChild(header);
      wrapper.appendChild(input);
      wrapper.appendChild(actions);
      wrapper.appendChild(status);
      wrapper.appendChild(output);

      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `/plugins/${pluginName}/static/codex-gerrit.css`;

      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(wrapper);

      reviewButton.addEventListener('click', () => this.submit('review', true, false));
      generateButton.addEventListener('click', () => this.submit('generate', false, false));
      applyButton.addEventListener('click', () => this.submit('patchset', true, true));

      this.input = input;
      this.output = output;
      this.status = status;
      this.reviewButton = reviewButton;
      this.generateButton = generateButton;
      this.applyButton = applyButton;
    }

    async submit(mode, postAsReview, applyPatchset) {
      const prompt = (this.input && this.input.value || '').trim();
      if (!prompt) {
        this.setStatus('Enter a prompt first.');
        return;
      }

      const changeId = this.getChangeId();
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return;
      }

      this.setBusy(true);
      this.setStatus(`Running ${mode}...`);

      try {
        const path = `/changes/${changeId}/revisions/current/codex-chat`;
        const response = await plugin.restApi().post(path, {
          prompt,
          mode,
          postAsReview,
          applyPatchset
        });
        if (response && response.reply) {
          this.output.textContent = response.reply;
          this.setStatus('Done.');
        } else {
          this.output.textContent = '';
          this.setStatus('No reply received.');
        }
      } catch (error) {
        this.output.textContent = '';
        this.setStatus(`Request failed: ${error && error.message ? error.message : error}`);
      } finally {
        this.setBusy(false);
      }
    }

    setBusy(isBusy) {
      if (this.reviewButton) {
        this.reviewButton.disabled = isBusy;
      }
      if (this.generateButton) {
        this.generateButton.disabled = isBusy;
      }
      if (this.applyButton) {
        this.applyButton.disabled = isBusy;
      }
    }

    setStatus(text) {
      if (this.status) {
        this.status.textContent = text;
      }
    }

    getChangeId() {
      if (window.Gerrit && typeof window.Gerrit.getChangeId === 'function') {
        return window.Gerrit.getChangeId();
      }
      const match = window.location.pathname.match(/\/\+\/(\d+)/);
      if (match && match[1]) {
        return match[1];
      }
      const numericMatch = window.location.pathname.match(/\/(\d+)(?:$|\/)/);
      if (numericMatch && numericMatch[1]) {
        return numericMatch[1];
      }
      return '';
    }
  }

  customElements.define('codex-chat-panel', CodexChatPanel);
  plugin.registerCustomComponent('change-footer', 'codex-chat-panel');
});
