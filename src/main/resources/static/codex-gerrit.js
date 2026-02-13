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
  const elementName = 'codex-chat-panel';
  const logPrefix = '[codex-gerrit]';
  const supportedClis = ['codex', 'claude', 'gemini', 'opencode', 'qwen'];
  const log = (...args) => console.log(logPrefix, ...args);
  const warn = (...args) => console.warn(logPrefix, ...args);
  const error = (...args) => console.error(logPrefix, ...args);

  log('Plugin installed.', {
    pluginName,
    location: window.location.href
  });

  class CodexChatPanel extends HTMLElement {
    connectedCallback() {
      log('Panel connectedCallback invoked.');
      if (this.shadowRoot) {
        log('Panel already has shadowRoot, skipping render.');
        return;
      }
      this.attachShadow({ mode: 'open' });
      log('Panel shadowRoot created, rendering UI.');
      this.render();
    }

    render() {
      log('Rendering panel UI.');
      const wrapper = document.createElement('div');
      wrapper.className = 'codex-chat';

      const header = document.createElement('div');
      header.className = 'codex-header';
      header.textContent = 'Codex Chat';

      const selectors = document.createElement('div');
      selectors.className = 'codex-selectors';

      const cliContainer = document.createElement('div');
      cliContainer.className = 'codex-selector-container';

      const cliLabel = document.createElement('label');
      cliLabel.className = 'codex-selector-label';
      cliLabel.textContent = 'CLI:';

      const cliSelect = document.createElement('select');
      cliSelect.className = 'codex-selector-select';

      supportedClis.forEach(cli => {
        const option = document.createElement('option');
        option.value = cli;
        option.textContent = cli;
        cliSelect.appendChild(option);
      });

      cliContainer.appendChild(cliLabel);
      cliContainer.appendChild(cliSelect);

      const modelContainer = document.createElement('div');
      modelContainer.className = 'codex-selector-container';

      const modelLabel = document.createElement('label');
      modelLabel.className = 'codex-selector-label';
      modelLabel.textContent = 'Model:';

      const modelSelect = document.createElement('select');
      modelSelect.className = 'codex-selector-select';

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Default';
      modelSelect.appendChild(defaultOption);

      modelContainer.appendChild(modelLabel);
      modelContainer.appendChild(modelSelect);

      selectors.appendChild(cliContainer);
      selectors.appendChild(modelContainer);

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
      wrapper.appendChild(selectors);
      wrapper.appendChild(input);
      wrapper.appendChild(actions);
      wrapper.appendChild(status);
      wrapper.appendChild(output);

      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `/plugins/${pluginName}/static/codex-gerrit.css`;

      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(wrapper);
      log('Panel DOM mounted. Loading models...');

      reviewButton.addEventListener('click', () => this.submit('review', true, false));
      generateButton.addEventListener('click', () => this.submit('generate', false, false));
      applyButton.addEventListener('click', () => this.submit('patchset', true, true));

      this.input = input;
      this.cliSelect = cliSelect;
      this.modelSelect = modelSelect;
      this.output = output;
      this.status = status;
      this.reviewButton = reviewButton;
      this.generateButton = generateButton;
      this.applyButton = applyButton;

      this.loadConfig();
    }

    async loadConfig() {
      const changeId = this.getChangeId();
      if (!changeId) {
        warn('loadConfig skipped: could not detect change id.', {
          pathname: window.location.pathname,
          hash: window.location.hash
        });
        return;
      }

      try {
        const path = `/changes/${changeId}/revisions/current/codex-config`;
        log('Loading panel config from REST API.', { path });
        const response = await plugin.restApi().get(path);
        log('Panel config REST response received.', response);

        const apiClis = response && response.clis && response.clis.length > 0 ? response.clis : [];
        const mergedClis = Array.from(new Set([...supportedClis, ...apiClis]));
        if (mergedClis.length > 0) {
          this.cliSelect.innerHTML = '';
          mergedClis.forEach(cli => {
            const option = document.createElement('option');
            option.value = cli;
            option.textContent = cli;
            this.cliSelect.appendChild(option);
          });
          if (response.defaultCli) {
            this.cliSelect.value = response.defaultCli;
          }
          log('CLI options populated.', {
            count: mergedClis.length,
            defaultCli: response.defaultCli
          });
        } else {
          log('No CLI list returned; using codex default option.');
        }

        if (response && response.models && response.models.length > 0) {
          response.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            this.modelSelect.appendChild(option);
          });
          log('Models populated.', { count: response.models.length });
        } else {
          log('No models returned; keeping Default only.');
        }
      } catch (error) {
        warn('Failed to load models.', error);
      }
    }

    async submit(mode, postAsReview, applyPatchset) {
      const prompt = (this.input && this.input.value || '').trim();
      if (!prompt) {
        this.setStatus('Enter a prompt first.');
        return;
      }

      const changeId = this.getChangeId();
      if (!changeId) {
        warn('Submit blocked: unable to detect change id.', {
          pathname: window.location.pathname,
          hash: window.location.hash
        });
        this.setStatus('Unable to detect change id.');
        return;
      }

      this.setBusy(true);
      this.setStatus(`Running ${mode}...`);

      const cli = this.cliSelect && this.cliSelect.value ? this.cliSelect.value : 'codex';
      const model = this.modelSelect && this.modelSelect.value ? this.modelSelect.value : null;

      try {
        const path = `/changes/${changeId}/revisions/current/codex-chat`;
        log('Submitting chat request.', { mode, postAsReview, applyPatchset, cli, model, path });
        const response = await plugin.restApi().post(path, {
          prompt,
          mode,
          postAsReview,
          applyPatchset,
          cli,
          model
        });
        log('Chat REST response received.', response);
        if (response && response.reply) {
          this.output.textContent = response.reply;
          this.setStatus('Done.');
        } else {
          this.output.textContent = '';
          this.setStatus('No reply received.');
        }
      } catch (error) {
        error('Chat request failed.', error);
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
        const idFromApi = window.Gerrit.getChangeId();
        log('Detected change id via window.Gerrit.getChangeId().', idFromApi);
        return idFromApi;
      }
      const match = window.location.pathname.match(/\/\+\/(\d+)/);
      if (match && match[1]) {
        log('Detected change id via /+/ path match.', match[1]);
        return match[1];
      }
      const numericMatch = window.location.pathname.match(/\/(\d+)(?:$|\/)/);
      if (numericMatch && numericMatch[1]) {
        log('Detected change id via numeric path match.', numericMatch[1]);
        return numericMatch[1];
      }
      warn('Failed to detect change id from page URL.', {
        pathname: window.location.pathname,
        hash: window.location.hash
      });
      return '';
    }
  }

  if (!customElements.get(elementName)) {
    customElements.define(elementName, CodexChatPanel);
    log('Custom element registered.', elementName);
  } else {
    log('Custom element already registered.', elementName);
  }

  // PolyGerrit UI extension (Gerrit 3.x): register panel at change-view-integration
  // (between Files and Change Log). See pg-plugin-endpoints.html.
  if (typeof plugin.registerCustomComponent === 'function') {
    log('Registering custom component at endpoint change-view-integration.');
    plugin.registerCustomComponent('change-view-integration', elementName);
  } else if (typeof plugin.hook === 'function') {
    // Low-level DOM hook fallback for PolyGerrit.
    log('registerCustomComponent unavailable; using plugin.hook fallback.');
    const domHook = plugin.hook('change-view-integration');
    domHook.onAttached(function (element) {
      log('Hook attached for change-view-integration.', element);
      const panel = document.createElement(elementName);
      if (element.appendChild) {
        element.appendChild(panel);
        log('Panel appended via hook fallback.');
      } else {
        warn('Hook element has no appendChild; panel not appended.');
      }
    });
  } else {
    warn('Neither registerCustomComponent nor hook is available.');
  }

  // GWT UI fallback for pre–PolyGerrit Gerrit.
  if (typeof plugin.panel === 'function') {
    log('Registering legacy GWT panel fallback.');
    plugin.panel('CHANGE_SCREEN_BELOW_COMMIT_INFO_BLOCK', () => {
      log('Legacy GWT panel callback invoked.');
      const panel = document.createElement(elementName);
      panel.style.display = 'block';
      panel.style.marginTop = '20px';
      return panel;
    });
  } else {
    log('Legacy GWT panel API unavailable (expected on PolyGerrit).');
  }

  if (typeof plugin.on === 'function') {
    plugin.on('history', token => {
      log('History event received.', token);
    });
    plugin.on('showchange', (change, revision) => {
      log('Showchange event received.', {
        changeNumber: change && change._number,
        changeId: change && change.change_id,
        revisionId: revision && revision._number
      });
    });
  }
});
