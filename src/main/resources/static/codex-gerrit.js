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
    constructor() {
      super();
      this.consolePs1 = 'sandbox$ ';
      this.consoleInputStart = 0;
      this.patchsetFiles = [];
      this.filteredMentionFiles = [];
      this.activeMentionIndex = -1;
      this.currentMentionRange = null;
    }

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

      const headerTitle = document.createElement('span');
      headerTitle.className = 'codex-header-title';
      headerTitle.textContent = '🤖 Codex Chat';

      const headerVersion = document.createElement('span');
      headerVersion.className = 'codex-header-version';

      header.appendChild(headerTitle);
      header.appendChild(headerVersion);

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
      defaultOption.textContent = 'Auto';
      defaultOption.selected = true;
      modelSelect.appendChild(defaultOption);

      modelContainer.appendChild(modelLabel);
      modelContainer.appendChild(modelSelect);

      const runContainer = document.createElement('div');
      runContainer.className = 'codex-selector-container';

      const runLabel = document.createElement('label');
      runLabel.className = 'codex-selector-label';
      runLabel.textContent = 'Run:';

      const runSelect = document.createElement('select');
      runSelect.className = 'codex-selector-select codex-run-select';

      const runDefaultOption = document.createElement('option');
      runDefaultOption.value = '';
      runDefaultOption.textContent = 'Select';
      runDefaultOption.selected = true;
      runSelect.appendChild(runDefaultOption);

      const runConsoleOption = document.createElement('option');
      runConsoleOption.value = 'console';
      runConsoleOption.textContent = 'Console';
      runSelect.appendChild(runConsoleOption);

      runContainer.appendChild(runLabel);
      runContainer.appendChild(runSelect);

      selectors.appendChild(cliContainer);
      selectors.appendChild(modelContainer);
      selectors.appendChild(runContainer);

      const input = document.createElement('textarea');
      input.className = 'codex-input';
      input.placeholder = 'Chat with the selected CLI/model, or use Apply Patchset to generate and apply changes to this Gerrit change.';

      const mentionDropdown = document.createElement('div');
      mentionDropdown.className = 'codex-mention-dropdown hidden';

      const actions = document.createElement('div');
      actions.className = 'codex-actions';

      const footer = document.createElement('div');
      footer.className = 'codex-footer';

      const applyButton = document.createElement('button');
      applyButton.className = 'codex-button outline';
      applyButton.textContent = 'Apply Patchset';

      const status = document.createElement('div');
      status.className = 'codex-status';

      const output = document.createElement('pre');
      output.className = 'codex-output';
      output.textContent = '';

      const consoleModal = document.createElement('div');
      consoleModal.className = 'codex-console-modal hidden';

      const consoleDialog = document.createElement('div');
      consoleDialog.className = 'codex-console-dialog';

      const consoleHeader = document.createElement('div');
      consoleHeader.className = 'codex-console-header';
      consoleHeader.textContent = 'Bash Console Sandbox';

      const consoleTerminal = document.createElement('textarea');
      consoleTerminal.className = 'codex-console-terminal';
      consoleTerminal.setAttribute('spellcheck', 'false');
      consoleTerminal.value = '';

      const consoleActions = document.createElement('div');
      consoleActions.className = 'codex-console-actions';

      const consoleClearButton = document.createElement('button');
      consoleClearButton.type = 'button';
      consoleClearButton.className = 'codex-button outline';
      consoleClearButton.textContent = 'Clear';

      const consoleCloseButton = document.createElement('button');
      consoleCloseButton.type = 'button';
      consoleCloseButton.className = 'codex-button outline';
      consoleCloseButton.textContent = 'Close';

      consoleActions.appendChild(consoleClearButton);
      consoleActions.appendChild(consoleCloseButton);
      consoleDialog.appendChild(consoleHeader);
      consoleDialog.appendChild(consoleTerminal);
      consoleDialog.appendChild(consoleActions);
      consoleModal.appendChild(consoleDialog);

      actions.appendChild(applyButton);
      footer.appendChild(selectors);
      footer.appendChild(actions);

      wrapper.appendChild(header);
      wrapper.appendChild(output);
      wrapper.appendChild(input);
      wrapper.appendChild(mentionDropdown);
      wrapper.appendChild(footer);
      wrapper.appendChild(status);
      wrapper.appendChild(consoleModal);

      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `/plugins/${pluginName}/static/codex-gerrit.css`;

      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(wrapper);
      log('Panel DOM mounted. Loading models...');

      applyButton.addEventListener('click', () => this.submitPatchset());
      runSelect.addEventListener('change', event => this.handleRunSelectChanged(event));
      consoleClearButton.addEventListener('click', () => this.clearConsoleTerminal());
      consoleCloseButton.addEventListener('click', () => this.closeConsole());
      consoleTerminal.addEventListener('keydown', event => this.handleConsoleTerminalKeydown(event));
      consoleTerminal.addEventListener('click', () => this.ensureConsoleCaretAtInput());
      consoleModal.addEventListener('click', event => {
        if (event.target === consoleModal) {
          this.closeConsole();
        }
      });
      input.addEventListener('input', () => this.handleInputChanged());
      input.addEventListener('keydown', event => this.handleInputKeydown(event));
      input.addEventListener('click', () => this.handleInputChanged());
      document.addEventListener('click', event => {
        if (!this.shadowRoot || !this.shadowRoot.contains(event.target)) {
          this.hideMentionDropdown();
        }
      });
      document.addEventListener('keydown', event => this.handleDocumentKeydown(event));

      this.input = input;
      this.cliSelect = cliSelect;
      this.modelSelect = modelSelect;
      this.runSelect = runSelect;
      this.mentionDropdown = mentionDropdown;
      this.output = output;
      this.status = status;
      this.applyButton = applyButton;
      this.consoleModal = consoleModal;
      this.consoleTerminal = consoleTerminal;
      this.consoleClearButton = consoleClearButton;
      this.consoleCloseButton = consoleCloseButton;
      this.headerVersion = headerVersion;

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

        const pluginVersion = response ? response.pluginVersion || response.plugin_version : null;
        const defaultCli = response ? response.defaultCli || response.default_cli : null;
        const patchsetFiles = response ? response.patchsetFiles || response.patchset_files : null;

        if (pluginVersion) {
          this.headerVersion.textContent = pluginVersion;
        }

        const apiClis = response && response.clis && response.clis.length > 0 ? response.clis : [];
        const mergedClis = Array.from(new Set([...supportedClis, ...apiClis]));
        if (mergedClis.length > 0) {
          this.cliSelect.innerHTML = '';
          mergedClis.forEach(cli => {
            const option = document.createElement('option');
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.submitChat();
            option.value = cli;
            option.textContent = cli;
            this.cliSelect.appendChild(option);
          });
          log('CLI options populated.', {
            count: mergedClis.length,
            defaultCli
          });
        } else {
          log('No CLI list returned; using codex default option.');
        }

        if (response && response.models && response.models.length > 0) {
          response.models.forEach(model => {
            if (!model || model.trim().toLowerCase() === 'auto') {
              return;
            }
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            this.modelSelect.appendChild(option);
          });
          this.modelSelect.value = '';
          log('Models populated.', { count: response.models.length });
        } else {
          log('No models returned; keeping Auto only.');
        }

        if (patchsetFiles && patchsetFiles.length > 0) {
          this.patchsetFiles = patchsetFiles.slice();
          log('Patchset files loaded for @ mentions.', { count: this.patchsetFiles.length });
        } else {
          this.patchsetFiles = [];
          log('No patchset files returned for @ mentions.');
        }
      } catch (error) {
        warn('Failed to load models.', error);
      }
    }

    async submitChat() {
      await this.submit('chat', false, false);
    }

    async submitPatchset() {
      await this.submit('patchset', true, true);
    }

    handleRunSelectChanged(event) {
      const selected = event && event.target ? event.target.value : '';
      if (selected === 'console') {
        this.openConsole();
      }
      if (this.runSelect) {
        this.runSelect.value = '';
      }
    }

    openConsole() {
      if (!this.consoleModal) {
        return;
      }
      this.ensureConsolePrompt();
      this.consoleModal.classList.remove('hidden');
      this.focusConsoleTerminal();
    }

    closeConsole() {
      if (this.consoleModal) {
        this.consoleModal.classList.add('hidden');
      }
    }

    handleConsoleTerminalKeydown(event) {
      if (!this.consoleTerminal) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.runConsoleCommandFromTerminal();
        return;
      }
      if (event.key === 'Backspace') {
        if (this.consoleTerminal.selectionStart <= this.consoleInputStart
            && this.consoleTerminal.selectionEnd <= this.consoleInputStart) {
          event.preventDefault();
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        if (this.consoleTerminal.selectionStart <= this.consoleInputStart
            && this.consoleTerminal.selectionEnd <= this.consoleInputStart) {
          event.preventDefault();
        }
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        this.setConsoleSelection(this.consoleInputStart, this.consoleInputStart);
      }
    }

    handleDocumentKeydown(event) {
      if (!this.consoleModal || this.consoleModal.classList.contains('hidden')) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeConsole();
      }
    }

    async runConsoleCommandFromTerminal() {
      const command = this.getConsoleCurrentCommand();
      this.appendConsoleText('\n');
      if (!command) {
        this.startConsolePrompt();
        return;
      }

      await this.runConsoleCommand(command);
    }

    async runConsoleCommand(command) {
      const normalizedCommand = command == null ? '' : command.trim();
      if (!normalizedCommand) {
        this.startConsolePrompt();
        return;
      }

      const changeId = this.getChangeId();
      if (!changeId) {
        warn('Console blocked: unable to detect change id.', {
          pathname: window.location.pathname,
          hash: window.location.hash
        });
        this.setStatus('Unable to detect change id.');
        this.startConsolePrompt();
        return;
      }

      this.setConsoleBusy(true);
      this.setStatus('Running console command...');

      try {
        const path = `/changes/${changeId}/revisions/current/codex-console`;
        log('Submitting console request.', { path });
        const response = await plugin.restApi().post(path, { command: normalizedCommand });
        log('Console REST response received.', response);
        const output = response && typeof response.output === 'string' ? response.output : '';
        const exitCode = response && typeof response.exitCode === 'number' ? response.exitCode : null;
        if (output) {
          this.appendConsoleText(`${output.replace(/\s+$/, '')}\n`);
        }
        this.startConsolePrompt();
        this.setStatus(exitCode === null ? 'Console command finished.' : `Console command finished (exit ${exitCode}).`);
      } catch (error) {
        error('Console request failed.', error);
        this.appendConsoleText(`Error: ${error && error.message ? error.message : error}\n`);
        this.startConsolePrompt();
        this.setStatus(`Console failed: ${error && error.message ? error.message : error}`);
      } finally {
        this.setConsoleBusy(false);
        this.focusConsoleTerminal();
      }
    }

    ensureConsolePrompt() {
      if (!this.consoleTerminal) {
        return;
      }
      if (!this.consoleTerminal.value) {
        this.startConsolePrompt();
      }
    }

    startConsolePrompt() {
      this.appendConsoleText(this.consolePs1);
      this.consoleInputStart = this.consoleTerminal ? this.consoleTerminal.value.length : 0;
      this.setConsoleSelection(this.consoleInputStart, this.consoleInputStart);
    }

    appendConsoleText(text) {
      if (!this.consoleTerminal) {
        return;
      }
      this.consoleTerminal.value += text == null ? '' : String(text);
      this.consoleTerminal.scrollTop = this.consoleTerminal.scrollHeight;
    }

    getConsoleCurrentCommand() {
      if (!this.consoleTerminal) {
        return '';
      }
      return (this.consoleTerminal.value || '').substring(this.consoleInputStart).trim();
    }

    ensureConsoleCaretAtInput() {
      if (!this.consoleTerminal) {
        return;
      }
      if (this.consoleTerminal.selectionStart < this.consoleInputStart) {
        this.setConsoleSelection(this.consoleTerminal.value.length, this.consoleTerminal.value.length);
      }
    }

    setConsoleSelection(start, end) {
      if (!this.consoleTerminal) {
        return;
      }
      this.consoleTerminal.setSelectionRange(start, end);
    }

    focusConsoleTerminal() {
      if (!this.consoleTerminal) {
        return;
      }
      this.consoleTerminal.focus();
      this.setConsoleSelection(this.consoleTerminal.value.length, this.consoleTerminal.value.length);
    }

    clearConsoleTerminal() {
      if (!this.consoleTerminal) {
        return;
      }
      this.consoleTerminal.value = '';
      this.consoleInputStart = 0;
      this.startConsolePrompt();
      this.focusConsoleTerminal();
      this.setStatus('Console cleared.');
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
      const contextFiles = this.extractContextFiles(prompt);

      try {
        const path = `/changes/${changeId}/revisions/current/codex-chat`;
        log('Submitting chat request.', { mode, postAsReview, applyPatchset, cli, model, contextFilesCount: contextFiles.length, path });
        const response = await plugin.restApi().post(path, {
          prompt,
          mode,
          postAsReview,
          applyPatchset,
          cli,
          model,
          contextFiles
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
      if (this.applyButton) {
        this.applyButton.disabled = isBusy;
      }
      if (this.runSelect) {
        this.runSelect.disabled = isBusy;
      }
    }

    setConsoleBusy(isBusy) {
      if (this.consoleClearButton) {
        this.consoleClearButton.disabled = isBusy;
      }
      if (this.consoleCloseButton) {
        this.consoleCloseButton.disabled = isBusy;
      }
      if (this.consoleTerminal) {
        this.consoleTerminal.disabled = isBusy;
      }
    }

    handleInputChanged() {
      const mentionInfo = this.getMentionAtCursor();
      if (!mentionInfo) {
        this.hideMentionDropdown();
        return;
      }
      this.currentMentionRange = {
        start: mentionInfo.start,
        end: mentionInfo.end
      };
      const query = mentionInfo.query.toLowerCase();
      this.filteredMentionFiles = this.patchsetFiles
          .filter(file => file.toLowerCase().includes(query))
          .slice(0, 20);
      if (this.filteredMentionFiles.length === 0) {
        this.hideMentionDropdown();
        return;
      }
      this.activeMentionIndex = 0;
      this.renderMentionDropdown();
    }

    handleInputKeydown(event) {
      if (this.isMentionDropdownVisible()) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.activeMentionIndex = (this.activeMentionIndex + 1) % this.filteredMentionFiles.length;
          this.renderMentionDropdown();
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          this.activeMentionIndex = (this.activeMentionIndex - 1 + this.filteredMentionFiles.length) % this.filteredMentionFiles.length;
          this.renderMentionDropdown();
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          const selectedFile = this.filteredMentionFiles[this.activeMentionIndex];
          if (selectedFile) {
            this.applyMentionSelection(selectedFile);
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          this.hideMentionDropdown();
          return;
        }
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.submitChat();
      }
    }

    getMentionAtCursor() {
      if (!this.input) {
        return null;
      }
      const text = this.input.value || '';
      const cursorPosition = this.input.selectionStart;
      const beforeCursor = text.substring(0, cursorPosition);
      const atIndex = beforeCursor.lastIndexOf('@');
      if (atIndex < 0) {
        return null;
      }
      const previousChar = atIndex > 0 ? beforeCursor.charAt(atIndex - 1) : '';
      if (previousChar && !/\s/.test(previousChar)) {
        return null;
      }
      const mentionText = beforeCursor.substring(atIndex + 1);
      if (/\s/.test(mentionText)) {
        return null;
      }
      return {
        start: atIndex,
        end: cursorPosition,
        query: mentionText
      };
    }

    renderMentionDropdown() {
      if (!this.mentionDropdown || !this.input) {
        return;
      }
      this.mentionDropdown.style.top = `${this.input.offsetTop + this.input.offsetHeight + 4}px`;
      this.mentionDropdown.innerHTML = '';
      this.filteredMentionFiles.forEach((file, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `codex-mention-item ${index === this.activeMentionIndex ? 'active' : ''}`;
        item.textContent = file;
        item.addEventListener('mousedown', event => {
          event.preventDefault();
          this.applyMentionSelection(file);
        });
        this.mentionDropdown.appendChild(item);
      });
      this.mentionDropdown.classList.remove('hidden');
    }

    applyMentionSelection(file) {
      if (!this.input || !this.currentMentionRange) {
        this.hideMentionDropdown();
        return;
      }
      const text = this.input.value || '';
      const before = text.substring(0, this.currentMentionRange.start);
      const after = text.substring(this.currentMentionRange.end);
      const replacement = `@${file} `;
      this.input.value = `${before}${replacement}${after}`;
      const nextCursor = before.length + replacement.length;
      this.input.focus();
      this.input.setSelectionRange(nextCursor, nextCursor);
      this.hideMentionDropdown();
    }

    isMentionDropdownVisible() {
      return this.mentionDropdown && !this.mentionDropdown.classList.contains('hidden');
    }

    hideMentionDropdown() {
      if (this.mentionDropdown) {
        this.mentionDropdown.classList.add('hidden');
        this.mentionDropdown.innerHTML = '';
      }
      this.filteredMentionFiles = [];
      this.activeMentionIndex = -1;
      this.currentMentionRange = null;
    }

    extractContextFiles(prompt) {
      if (!prompt || !this.patchsetFiles || this.patchsetFiles.length === 0) {
        return [];
      }
      const available = new Set(this.patchsetFiles);
      const selected = [];
      const seen = new Set();
      const tokens = prompt.split(/\s+/);
      tokens.forEach(token => {
        if (!token || !token.startsWith('@')) {
          return;
        }
        const candidate = token.substring(1).replace(/[.,!?;:]+$/, '');
        if (!candidate) {
          return;
        }
        if (available.has(candidate) && !seen.has(candidate)) {
          seen.add(candidate);
          selected.push(candidate);
        }
      });
      return selected;
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
