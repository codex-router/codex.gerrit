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
  const fallbackAgents = ['codex'];
  const codespacesActions = [
    { value: 'open-android-studio', label: 'Open in Android Studio' },
    { value: 'open-browser', label: 'Open in Browser' },
    { value: 'open-cursor', label: 'Open in Cursor' },
    { value: 'open-vscode', label: 'Open in VS Code' }
  ];
  const workspaceRootStorageKey = `${pluginName}-workspace-root`;
  const browserRepoStorageKey = `${pluginName}-browser-repo-url`;
  const defaultBrowserRepoUrl = 'https://github.com/codesandbox/codesandbox-client';
  const log = (...args) => console.log(logPrefix, ...args);
  const warn = (...args) => console.warn(logPrefix, ...args);
  const logError = (...args) => console.error(logPrefix, ...args);

  log('Plugin installed.', {
    pluginName,
    location: window.location.href
  });

  class CodexChatPanel extends HTMLElement {
    constructor() {
      super();
      this.patchsetFiles = [];
      this.filteredMentionFiles = [];
      this.activeMentionIndex = -1;
      this.currentMentionRange = null;
      this.isBusyState = false;
      this.activeSessionId = null;
      this.promptHistory = [];
      this.promptHistoryIndex = -1;
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

      const agentContainer = document.createElement('div');
      agentContainer.className = 'codex-selector-container';

      const agentLabel = document.createElement('label');
      agentLabel.className = 'codex-selector-label';
      agentLabel.textContent = 'Agent:';

      const agentSelect = document.createElement('select');
      agentSelect.className = 'codex-selector-select';

      fallbackAgents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent;
        option.textContent = agent;
        agentSelect.appendChild(option);
      });

      agentContainer.appendChild(agentLabel);
      agentContainer.appendChild(agentSelect);

      const modelContainer = document.createElement('div');
      modelContainer.className = 'codex-selector-container';

      const modelLabel = document.createElement('label');
      modelLabel.className = 'codex-selector-label';
      modelLabel.textContent = 'Model:';

      const modelSelect = document.createElement('select');
      modelSelect.className = 'codex-selector-select';

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select';
      defaultOption.selected = true;
      modelSelect.appendChild(defaultOption);

      modelContainer.appendChild(modelLabel);
      modelContainer.appendChild(modelSelect);

      const codespacesContainer = document.createElement('div');
      codespacesContainer.className = 'codex-selector-container';

      const codespacesLabel = document.createElement('label');
      codespacesLabel.className = 'codex-selector-label';
      codespacesLabel.textContent = 'Codespaces:';

      const codespacesSelect = document.createElement('select');
      codespacesSelect.className = 'codex-selector-select';

      const codespacesDefaultOption = document.createElement('option');
      codespacesDefaultOption.value = '';
      codespacesDefaultOption.textContent = 'Select';
      codespacesDefaultOption.selected = true;
      codespacesSelect.appendChild(codespacesDefaultOption);

      codespacesActions.forEach(action => {
        const option = document.createElement('option');
        option.value = action.value;
        option.textContent = action.label;
        codespacesSelect.appendChild(option);
      });

      codespacesContainer.appendChild(codespacesLabel);
      codespacesContainer.appendChild(codespacesSelect);

      selectors.appendChild(agentContainer);
      selectors.appendChild(modelContainer);
      selectors.appendChild(codespacesContainer);

      const inputPanel = document.createElement('div');
      inputPanel.className = 'codex-input-panel';

      const inputRow = document.createElement('div');
      inputRow.className = 'codex-input-row';

      const input = document.createElement('textarea');
      input.className = 'codex-input';
      input.rows = 1;
      input.placeholder = 'Ask Codex about this change. Type @ to reference patchset files.';

      const sendButton = document.createElement('button');
      sendButton.className = 'codex-button';
      sendButton.textContent = 'Send';

      const mentionDropdown = document.createElement('div');
      mentionDropdown.className = 'codex-mention-dropdown hidden';

      const actions = document.createElement('div');
      actions.className = 'codex-actions';

      const footer = document.createElement('div');
      footer.className = 'codex-footer';

      const applyButton = document.createElement('button');
      applyButton.className = 'codex-button outline';
      applyButton.textContent = 'Apply Patchset';

      const reverseButton = document.createElement('button');
      reverseButton.className = 'codex-button outline';
      reverseButton.textContent = 'Reverse Patchset';

      const stopButton = document.createElement('button');
      stopButton.className = 'codex-button outline';
      stopButton.textContent = 'Stop';
      stopButton.disabled = true;

      const status = document.createElement('div');
      status.className = 'codex-status';

      const output = document.createElement('div');
      output.className = 'codex-output';
      output.setAttribute('role', 'log');
      output.setAttribute('aria-live', 'polite');

      inputRow.appendChild(input);
      inputRow.appendChild(stopButton);
      inputRow.appendChild(sendButton);

      actions.appendChild(applyButton);
      actions.appendChild(reverseButton);
      footer.appendChild(selectors);
      footer.appendChild(actions);
      inputPanel.appendChild(inputRow);
      inputPanel.appendChild(footer);

      wrapper.appendChild(header);
      wrapper.appendChild(output);
      wrapper.appendChild(inputPanel);
      wrapper.appendChild(mentionDropdown);
      wrapper.appendChild(status);

      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `/plugins/${pluginName}/static/codex-gerrit.css`;

      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(wrapper);
      log('Panel DOM mounted. Loading models...');

      applyButton.addEventListener('click', () => this.submitPatchset());
      reverseButton.addEventListener('click', () => this.submitReversePatchset());
      stopButton.addEventListener('click', () => this.stopChat());
      sendButton.addEventListener('click', () => this.submitChat());
      input.addEventListener('input', () => this.handleInputChanged());
      input.addEventListener('keydown', event => this.handleInputKeydown(event));
      input.addEventListener('click', () => this.handleInputChanged());
      codespacesSelect.addEventListener('change', () => this.handleCodespacesAction());
      document.addEventListener('click', event => {
        if (!this.shadowRoot || !this.shadowRoot.contains(event.target)) {
          this.hideMentionDropdown();
        }
      });

      this.input = input;
      this.agentSelect = agentSelect;
      this.modelSelect = modelSelect;
      this.codespacesSelect = codespacesSelect;
      this.mentionDropdown = mentionDropdown;
      this.output = output;
      this.status = status;
      this.applyButton = applyButton;
      this.reverseButton = reverseButton;
      this.stopButton = stopButton;
      this.sendButton = sendButton;
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
        const defaultAgent = response
          ? response.defaultAgent || response.default_agent
          : null;
        const patchsetFiles = response ? response.patchsetFiles || response.patchset_files : null;

        if (pluginVersion) {
          this.headerVersion.textContent = pluginVersion;
        }

        const apiAgents = response && response.agents && response.agents.length > 0 ? response.agents : [];
        const agents = apiAgents.length > 0 ? apiAgents : fallbackAgents;
        if (agents.length > 0) {
          this.agentSelect.innerHTML = '';
          agents.forEach(agent => {
            const option = document.createElement('option');
            option.value = agent;
            option.textContent = agent;
            this.agentSelect.appendChild(option);
          });
          if (defaultAgent && agents.includes(defaultAgent)) {
            this.agentSelect.value = defaultAgent;
          } else {
            this.agentSelect.value = agents[0];
          }
          log('Agent options populated.', {
            count: agents.length,
            defaultAgent
          });
        } else {
          log('No agent list returned; using codex default option.');
        }

        if (response && response.models && response.models.length > 0) {
          response.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            this.modelSelect.appendChild(option);
          });
          this.modelSelect.value = '';
          log('Models populated.', { count: response.models.length });
        } else {
          log('No models returned.');
        }

        if (patchsetFiles && patchsetFiles.length > 0) {
          this.patchsetFiles = patchsetFiles.slice();
          log('Patchset files loaded for @ mentions.', { count: this.patchsetFiles.length });
        } else {
          this.patchsetFiles = [];
          log('No patchset files returned for @ mentions.');
        }
      } catch (err) {
        warn('Failed to load models.', err);
      }
    }

    async submitChat() {
      await this.submit('chat', false, false);
    }

    async submitPatchset() {
      await this.submit('patchset', true, true);
    }

    async submitReversePatchset() {
      const changeId = this.getChangeId();
      if (!changeId) {
        warn('Reverse patchset blocked: unable to detect change id.', {
          pathname: window.location.pathname,
          hash: window.location.hash
        });
        this.setStatus('Unable to detect change id.');
        return;
      }

      this.setBusy(true);
      this.setStatus('Reversing latest patchset...');

      try {
        const path = `/changes/${changeId}/revisions/current/codex-reverse-patchset`;
        log('Submitting reverse patchset request.', { path });
        const response = await plugin.restApi().post(path, {});
        log('Reverse patchset REST response received.', response);
        if (response && response.reply) {
          this.appendMessage('assistant', response.reply);
          this.setStatus('Done.');
        } else {
          this.setStatus('No reply received.');
        }
      } catch (err) {
        logError('Reverse patchset request failed.', err);
        this.appendMessage('assistant', `Request failed: ${err && err.message ? err.message : err}`);
        this.setStatus(`Request failed: ${err && err.message ? err.message : err}`);
      } finally {
        this.setBusy(false);
      }
    }

    async handleCodespacesAction() {
      if (!this.codespacesSelect) {
        return;
      }
      const action = this.codespacesSelect.value;
      this.codespacesSelect.value = '';
      if (!action) {
        return;
      }
      if (action === 'open-browser') {
        await this.openPatchsetFilesInBrowser();
        return;
      }
      if (action === 'open-vscode') {
        await this.openPatchsetFilesInVsCode();
        return;
      }
      if (action === 'open-cursor') {
        await this.openPatchsetFilesInCursor();
        return;
      }
      if (action === 'open-android-studio') {
        await this.openPatchsetFilesInAndroidStudio();
      }
    }

    async openPatchsetFilesInVsCode() {
      if (!this.patchsetFiles || this.patchsetFiles.length === 0) {
        this.setStatus('No patchset files found for this change.');
        return;
      }

      const workspaceRoot = this.getOrPromptWorkspaceRoot();
      if (!workspaceRoot) {
        this.setStatus('Open in VS Code canceled.');
        return;
      }

      let opened = 0;
      this.patchsetFiles.forEach((relativePath, index) => {
        const uri = this.toVsCodeFileUri(this.joinPaths(workspaceRoot, relativePath));
        window.setTimeout(() => {
          window.open(uri, '_blank');
        }, index * 60);
        opened += 1;
      });
      this.setStatus(`Opening ${opened} patchset files in VS Code...`);
    }

    async openPatchsetFilesInBrowser() {
      if (!this.patchsetFiles || this.patchsetFiles.length === 0) {
        this.setStatus('No patchset files found for this change.');
        return;
      }

      const repoUrl = this.getOrPromptBrowserRepoUrl();
      if (!repoUrl) {
        this.setStatus('Open in Browser canceled.');
        return;
      }

      let opened = 0;
      this.patchsetFiles.forEach((relativePath, index) => {
        const uri = this.toBrowserFileUrl(repoUrl, relativePath);
        window.setTimeout(() => {
          window.open(uri, '_blank');
        }, index * 60);
        opened += 1;
      });
      this.setStatus(`Opening ${opened} patchset files in browser...`);
    }

    async openPatchsetFilesInCursor() {
      if (!this.patchsetFiles || this.patchsetFiles.length === 0) {
        this.setStatus('No patchset files found for this change.');
        return;
      }

      const workspaceRoot = this.getOrPromptWorkspaceRoot();
      if (!workspaceRoot) {
        this.setStatus('Open in Cursor canceled.');
        return;
      }

      let opened = 0;
      this.patchsetFiles.forEach((relativePath, index) => {
        const uri = this.toCursorFileUri(this.joinPaths(workspaceRoot, relativePath));
        window.setTimeout(() => {
          window.open(uri, '_blank');
        }, index * 60);
        opened += 1;
      });
      this.setStatus(`Opening ${opened} patchset files in Cursor...`);
    }

    async openPatchsetFilesInAndroidStudio() {
      if (!this.patchsetFiles || this.patchsetFiles.length === 0) {
        this.setStatus('No patchset files found for this change.');
        return;
      }

      const workspaceRoot = this.getOrPromptWorkspaceRoot();
      if (!workspaceRoot) {
        this.setStatus('Open in Android Studio canceled.');
        return;
      }

      let opened = 0;
      this.patchsetFiles.forEach((relativePath, index) => {
        const uri = this.toAndroidStudioFileUri(workspaceRoot, this.joinPaths(workspaceRoot, relativePath));
        window.setTimeout(() => {
          window.open(uri, '_blank');
        }, index * 60);
        opened += 1;
      });
      this.setStatus(`Opening ${opened} patchset files in Android Studio...`);
    }

    getOrPromptWorkspaceRoot() {
      const savedRoot = window.localStorage.getItem(workspaceRootStorageKey);
      const promptDefault = savedRoot || '';
      const workspaceRoot = window.prompt(
          'Enter your local workspace root path for this repository (e.g. /home/user/repo or C:\\repo).',
          promptDefault);
      if (workspaceRoot === null) {
        return '';
      }
      const normalized = this.normalizePath(workspaceRoot);
      if (!normalized) {
        return '';
      }
      window.localStorage.setItem(workspaceRootStorageKey, normalized);
      return normalized;
    }

    getOrPromptBrowserRepoUrl() {
      const savedRepo = window.localStorage.getItem(browserRepoStorageKey);
      const promptDefault = savedRepo || defaultBrowserRepoUrl;
      const repoUrl = window.prompt(
          'Enter your GitHub repository URL (e.g. https://github.com/codesandbox/codesandbox-client).',
          promptDefault);
      if (repoUrl === null) {
        return '';
      }
      const normalized = this.normalizeBrowserRepoUrl(repoUrl);
      if (!normalized) {
        return '';
      }
      window.localStorage.setItem(browserRepoStorageKey, normalized);
      return normalized;
    }

    joinPaths(rootPath, relativePath) {
      const root = this.normalizePath(rootPath).replace(/\/+$/, '');
      const file = this.normalizePath(relativePath).replace(/^\/+/, '');
      return `${root}/${file}`;
    }

    normalizePath(value) {
      if (!value) {
        return '';
      }
      return value.trim().replace(/\\/g, '/');
    }

    normalizeBrowserRepoUrl(value) {
      if (!value) {
        return '';
      }
      let normalized = value.trim();
      if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
      }
      normalized = normalized.replace(/\/+$/, '').replace(/\.git$/i, '');
      const treeIndex = normalized.indexOf('/tree/');
      if (treeIndex > 0) {
        normalized = normalized.substring(0, treeIndex);
      }
      const blobIndex = normalized.indexOf('/blob/');
      if (blobIndex > 0) {
        normalized = normalized.substring(0, blobIndex);
      }
      return normalized;
    }

    toBrowserFileUrl(repoUrl, relativePath) {
      const normalizedRepo = this.normalizeBrowserRepoUrl(repoUrl);
      const normalizedFile = this.normalizePath(relativePath).replace(/^\/+/, '');
      const encodedFile = normalizedFile
          .split('/')
          .filter(segment => segment && segment.length > 0)
          .map(segment => encodeURIComponent(segment))
          .join('/');
      return `${normalizedRepo}/blob/HEAD/${encodedFile}`;
    }

    toVsCodeFileUri(path) {
      const normalized = this.normalizePath(path);
      const drivePathMatch = normalized.match(/^[A-Za-z]:\//);
      const withLeadingSlash = drivePathMatch ? `/${normalized}` : normalized;
      const encodedPath = withLeadingSlash
          .split('/')
          .map(segment => encodeURIComponent(segment))
          .join('/')
          .replace(/^\/(%[0-9A-Fa-f]{2})?([A-Za-z])%3A\//, '/$2:/');
      return `vscode://file${encodedPath}`;
    }

    toCursorFileUri(path) {
      const normalized = this.normalizePath(path);
      const drivePathMatch = normalized.match(/^[A-Za-z]:\//);
      const withLeadingSlash = drivePathMatch ? `/${normalized}` : normalized;
      const encodedPath = withLeadingSlash
          .split('/')
          .map(segment => encodeURIComponent(segment))
          .join('/')
          .replace(/^\/(%[0-9A-Fa-f]{2})?([A-Za-z])%3A\//, '/$2:/');
      return `cursor://file${encodedPath}`;
    }

    toAndroidStudioFileUri(workspaceRoot, fullPath) {
      const normalizedRoot = this.normalizePath(workspaceRoot).replace(/\/+$/, '');
      const normalizedPath = this.normalizePath(fullPath);
      const projectName = normalizedRoot.split('/').filter(Boolean).pop() || 'project';
      const encodedProject = encodeURIComponent(projectName);
      const encodedPath = encodeURIComponent(normalizedPath);
      return `jetbrains://android-studio/navigate/reference?project=${encodedProject}&path=${encodedPath}`;
    }

    async submit(mode, postAsReview, applyPatchset) {
      if (this.isBusyState) {
        this.setStatus('A request is already running.');
        return;
      }

      if (!(await this.ensureAuthenticated())) {
        this.setStatus('Sign in to Gerrit before using Codex Chat.');
        return;
      }

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
      this.pushPromptHistory(prompt);
      this.appendMessage('user', prompt);
      this.input.value = '';
      this.promptHistoryIndex = -1;
      this.hideMentionDropdown();

      const agent = this.agentSelect && this.agentSelect.value ? this.agentSelect.value : 'codex';
      const model = this.modelSelect && this.modelSelect.value ? this.modelSelect.value : null;
      const contextFiles = this.extractContextFiles(prompt);
      const sessionId = this.createSessionId();
      this.activeSessionId = sessionId;

      try {
        const path = `/changes/${changeId}/revisions/current/codex-chat`;
        log('Submitting chat request.', { mode, postAsReview, applyPatchset, agent, model, sessionId, contextFilesCount: contextFiles.length, path });
        const response = await plugin.restApi().post(path, {
          prompt,
          mode,
          postAsReview,
          applyPatchset,
          agent,
          model,
          sessionId,
          contextFiles
        });
        log('Chat REST response received.', response);
        if (response && response.reply) {
          this.appendMessage('assistant', response.reply);
          this.setStatus('Done.');
        } else {
          this.appendMessage('assistant', 'No reply received.');
          this.setStatus('No reply received.');
        }
      } catch (err) {
        logError('Chat request failed.', err);
        this.appendMessage('assistant', `Request failed: ${this.getErrorMessage(err)}`);
        this.setStatus(`Request failed: ${this.getErrorMessage(err)}`);
      } finally {
        this.activeSessionId = null;
        this.setBusy(false);
      }
    }

    async stopChat() {
      if (!this.isBusyState || !this.activeSessionId) {
        this.setStatus('No active chat session to stop.');
        return;
      }

      const changeId = this.getChangeId();
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return;
      }

      const path = `/changes/${changeId}/revisions/current/codex-chat-stop`;
      const sessionId = this.activeSessionId;
      this.setStatus('Stopping chat...');

      if (!(await this.ensureAuthenticated())) {
        this.setStatus('Sign in to Gerrit before stopping chat.');
        return;
      }

      try {
        log('Submitting chat stop request.', { path, sessionId });
        await plugin.restApi().post(path, { sessionId });
        this.setStatus('Stop request sent. Waiting for session to close...');
      } catch (stopError) {
        logError('Chat stop request failed.', stopError);
        this.setStatus(`Stop failed: ${this.getErrorMessage(stopError)}`);
      }
    }

    async ensureAuthenticated() {
      try {
        const account = await plugin.restApi().get('/accounts/self/detail');
        return !!(account && account._account_id);
      } catch (authError) {
        warn('Authentication check failed.', authError);
        return false;
      }
    }

    getErrorMessage(err) {
      if (!err) {
        return 'Unknown error';
      }
      if (typeof err === 'string') {
        return err;
      }
      if (err.message && String(err.message).trim()) {
        return String(err.message);
      }
      if (typeof err.status === 'number') {
        if (err.status === 403) {
          return 'Forbidden (403). Please sign in and ensure you have change access.';
        }
        return `HTTP ${err.status}`;
      }
      return String(err);
    }

    setBusy(isBusy) {
      this.isBusyState = isBusy;
      if (this.applyButton) {
        this.applyButton.disabled = isBusy;
      }
      if (this.reverseButton) {
        this.reverseButton.disabled = isBusy;
      }
      if (this.stopButton) {
        this.stopButton.disabled = !isBusy;
      }
      if (this.sendButton) {
        this.sendButton.disabled = isBusy;
      }
    }

    appendMessage(role, text) {
      if (!this.output) {
        return;
      }
      const normalizedRole = role === 'user' ? 'user' : 'assistant';
      const message = document.createElement('div');
      message.className = `codex-message ${normalizedRole}`;
      message.textContent = text || '';
      this.output.appendChild(message);
      this.output.scrollTop = this.output.scrollHeight;
    }

    createSessionId() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      const randomPart = Math.random().toString(36).slice(2);
      return `gerrit-${Date.now()}-${randomPart}`;
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

      if (event.key === 'PageUp' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        this.restorePreviousPrompt();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.submitChat();
      }
    }

    pushPromptHistory(prompt) {
      if (!prompt) {
        return;
      }
      this.promptHistory.push(prompt);
      if (this.promptHistory.length > 50) {
        this.promptHistory.splice(0, this.promptHistory.length - 50);
      }
    }

    restorePreviousPrompt() {
      if (!this.input || this.promptHistory.length === 0) {
        this.setStatus('No previous message to restore.');
        return;
      }
      if (this.promptHistoryIndex < this.promptHistory.length - 1) {
        this.promptHistoryIndex += 1;
      }
      const historyIndex = this.promptHistory.length - 1 - this.promptHistoryIndex;
      const previousPrompt = this.promptHistory[historyIndex] || '';
      this.input.value = previousPrompt;
      this.input.focus();
      this.input.setSelectionRange(previousPrompt.length, previousPrompt.length);
      this.hideMentionDropdown();
      this.setStatus(`Restored previous message (${this.promptHistoryIndex + 1}/${this.promptHistory.length}).`);
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
