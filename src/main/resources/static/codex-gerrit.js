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
  const mentionAllKeyword = 'all';
  const defaultHashCommands = ['insight'];
  const fallbackAgents = ['codex'];
  const codespacesActions = [
    { value: 'open-browser', label: 'Open in Browser' }
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
      this.currentMentionTrigger = '@';
      this.hashCommands = defaultHashCommands.slice();
      this.isBusyState = false;
      this.activeSessionId = null;
      this.promptHistory = [];
      this.promptHistoryIndex = -1;
      this.pendingFileChanges = [];
      this.fileChangeSequence = 0;
      /** @type {Array<{name: string, content?: string, base64Content?: string}>} Files attached by the user in this session. */
      this.attachedFiles = [];
      this.quickstartDocs = null;
      this.quickstartDocsPromise = null;
      this.quickstartLanguage = 'en';
      this.insightDialogOverlay = null;
      this.insightDialogBody = null;
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
      header.className = 'codex-header engcodex-header';

      const headerLeft = document.createElement('div');
      headerLeft.className = 'codex-header-left';

      const headerTitle = document.createElement('span');
      headerTitle.className = 'codex-header-title';
      headerTitle.textContent = '🤖 Codex Chat';

      const helpButton = document.createElement('button');
      helpButton.type = 'button';
      helpButton.className = 'codex-button outline codex-small-button codex-help-button';
      helpButton.textContent = 'Help';

      headerLeft.appendChild(headerTitle);
      header.appendChild(headerLeft);
      header.appendChild(helpButton);

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

      const status = document.createElement('div');
      status.className = 'codex-status';

      selectors.appendChild(agentContainer);
      selectors.appendChild(modelContainer);
      selectors.appendChild(codespacesContainer);

      const inputPanel = document.createElement('div');
      inputPanel.className = 'codex-input-panel';

      // Hidden file input for attachment uploads
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.className = 'codex-file-input-hidden';

      // Row that shows attached-file chips
      const attachedFilesRow = document.createElement('div');
      attachedFilesRow.className = 'codex-attached-files-row hidden';

      const inputRow = document.createElement('div');
      inputRow.className = 'codex-input-row';

      const input = document.createElement('textarea');
      input.className = 'codex-input';
      input.rows = 1;
      input.placeholder = 'Ask Codex about this change. Type @ to reference patchset files. Type # to use commands. Use 📎 to attach local files. Enter to send · Ctrl+Enter for newline · Up/Down for history.';

      // Attach-file button (paperclip)
      const attachButton = document.createElement('button');
      attachButton.type = 'button';
      attachButton.className = 'codex-button outline codex-attach-button';
      attachButton.title = 'Attach files';
      attachButton.setAttribute('aria-label', 'Attach files');
      attachButton.innerHTML = '&#128206;&#xFE0E;'; // 📎 in text presentation

      const mentionDropdown = document.createElement('div');
      mentionDropdown.className = 'codex-mention-dropdown hidden';

      const footer = document.createElement('div');
      footer.className = 'codex-footer';

      const stopButton = document.createElement('button');
      stopButton.className = 'codex-button outline';
      stopButton.textContent = 'Stop';
      stopButton.disabled = true;

      const clearButton = document.createElement('button');
      clearButton.className = 'codex-button outline';
      clearButton.textContent = 'Clear';

      const output = document.createElement('div');
      output.className = 'codex-output';
      output.setAttribute('role', 'log');
      output.setAttribute('aria-live', 'polite');
      output.appendChild(status);

      const changeDialogOverlay = document.createElement('div');
      changeDialogOverlay.className = 'codex-change-dialog-overlay hidden';

      const changeDialog = document.createElement('div');
      changeDialog.className = 'codex-change-dialog';
      changeDialog.setAttribute('role', 'dialog');
      changeDialog.setAttribute('aria-modal', 'true');
      changeDialog.addEventListener('click', event => event.stopPropagation());

      const changeDialogHeader = document.createElement('div');
      changeDialogHeader.className = 'codex-change-dialog-header';

      const changeDialogTitle = document.createElement('div');
      changeDialogTitle.className = 'codex-change-dialog-title';
      changeDialogTitle.textContent = 'Codex File Changes';

      const changeDialogClose = document.createElement('button');
      changeDialogClose.type = 'button';
      changeDialogClose.className = 'codex-button outline codex-dialog-close';
      changeDialogClose.textContent = 'Close';

      changeDialogHeader.appendChild(changeDialogTitle);
      changeDialogHeader.appendChild(changeDialogClose);

      const changeDialogBody = document.createElement('div');
      changeDialogBody.className = 'codex-change-dialog-body';

      changeDialog.appendChild(changeDialogHeader);
      changeDialog.appendChild(changeDialogBody);
      changeDialogOverlay.appendChild(changeDialog);

      const quickstartDialogOverlay = document.createElement('div');
      quickstartDialogOverlay.className = 'codex-quickstart-dialog-overlay hidden';

      const quickstartDialog = document.createElement('div');
      quickstartDialog.className = 'codex-quickstart-dialog';
      quickstartDialog.setAttribute('role', 'dialog');
      quickstartDialog.setAttribute('aria-modal', 'true');
      quickstartDialog.addEventListener('click', event => event.stopPropagation());

      const quickstartDialogHeader = document.createElement('div');
      quickstartDialogHeader.className = 'codex-change-dialog-header';

      const quickstartDialogTitle = document.createElement('div');
      quickstartDialogTitle.className = 'codex-change-dialog-title';
      quickstartDialogTitle.textContent = 'Codex Chat Quickstart';

      const quickstartDialogClose = document.createElement('button');
      quickstartDialogClose.type = 'button';
      quickstartDialogClose.className = 'codex-button outline codex-dialog-close';
      quickstartDialogClose.textContent = 'Close';

      quickstartDialogHeader.appendChild(quickstartDialogTitle);
      quickstartDialogHeader.appendChild(quickstartDialogClose);

      const quickstartLanguageSwitch = document.createElement('div');
      quickstartLanguageSwitch.className = 'codex-quickstart-language-switch';

      const quickstartEnglishButton = document.createElement('button');
      quickstartEnglishButton.type = 'button';
      quickstartEnglishButton.className = 'codex-button outline codex-small-button active';
      quickstartEnglishButton.textContent = 'English';

      const quickstartChineseButton = document.createElement('button');
      quickstartChineseButton.type = 'button';
      quickstartChineseButton.className = 'codex-button outline codex-small-button';
      quickstartChineseButton.textContent = '中文';

      quickstartLanguageSwitch.appendChild(quickstartEnglishButton);
      quickstartLanguageSwitch.appendChild(quickstartChineseButton);

      const quickstartDialogBody = document.createElement('div');
      quickstartDialogBody.className = 'codex-quickstart-dialog-body';

      quickstartDialog.appendChild(quickstartDialogHeader);
      quickstartDialog.appendChild(quickstartLanguageSwitch);
      quickstartDialog.appendChild(quickstartDialogBody);
      quickstartDialogOverlay.appendChild(quickstartDialog);

      const insightDialogOverlay = document.createElement('div');
      insightDialogOverlay.className = 'codex-quickstart-dialog-overlay hidden';

      const insightDialog = document.createElement('div');
      insightDialog.className = 'codex-quickstart-dialog';
      insightDialog.setAttribute('role', 'dialog');
      insightDialog.setAttribute('aria-modal', 'true');
      insightDialog.addEventListener('click', event => event.stopPropagation());

      const insightDialogHeader = document.createElement('div');
      insightDialogHeader.className = 'codex-change-dialog-header';

      const insightDialogTitle = document.createElement('div');
      insightDialogTitle.className = 'codex-change-dialog-title';
      insightDialogTitle.textContent = 'Codex Insight';

      const insightDialogClose = document.createElement('button');
      insightDialogClose.type = 'button';
      insightDialogClose.className = 'codex-button outline codex-dialog-close';
      insightDialogClose.textContent = 'Close';

      insightDialogHeader.appendChild(insightDialogTitle);
      insightDialogHeader.appendChild(insightDialogClose);

      const insightDialogBody = document.createElement('div');
      insightDialogBody.className = 'codex-quickstart-dialog-body';

      insightDialog.appendChild(insightDialogHeader);
      insightDialog.appendChild(insightDialogBody);
      insightDialogOverlay.appendChild(insightDialog);

        const workspaceRootDialogOverlay = document.createElement('div');
        workspaceRootDialogOverlay.className = 'codex-workspace-root-dialog-overlay hidden';

        const workspaceRootDialog = document.createElement('div');
        workspaceRootDialog.className = 'codex-workspace-root-dialog';
        workspaceRootDialog.setAttribute('role', 'dialog');
        workspaceRootDialog.setAttribute('aria-modal', 'true');
        workspaceRootDialog.addEventListener('click', event => event.stopPropagation());

        const workspaceRootDialogHeader = document.createElement('div');
        workspaceRootDialogHeader.className = 'codex-change-dialog-header';

        const workspaceRootDialogTitle = document.createElement('div');
        workspaceRootDialogTitle.className = 'codex-change-dialog-title';
        workspaceRootDialogTitle.textContent = 'Workspace Root Path';

        workspaceRootDialogHeader.appendChild(workspaceRootDialogTitle);

        const workspaceRootDialogBody = document.createElement('div');
        workspaceRootDialogBody.className = 'codex-workspace-root-dialog-body';

        const workspaceRootDialogDescription = document.createElement('div');
        workspaceRootDialogDescription.className = 'codex-workspace-root-dialog-description';
        workspaceRootDialogDescription.textContent =
            'Enter your local workspace root path for this repository (e.g. /home/user/repo, /Users/user/repo, or C:\\repo).';

        const workspaceRootDialogInput = document.createElement('input');
        workspaceRootDialogInput.type = 'text';
        workspaceRootDialogInput.className = 'codex-workspace-root-dialog-input';
        workspaceRootDialogInput.placeholder = '/home/user/repo, /Users/user/repo, or C:/repo';

        const workspaceRootDialogActions = document.createElement('div');
        workspaceRootDialogActions.className = 'codex-workspace-root-dialog-actions';

        const workspaceRootDialogBrowse = document.createElement('button');
        workspaceRootDialogBrowse.type = 'button';
        workspaceRootDialogBrowse.className = 'codex-button outline codex-small-button';
        workspaceRootDialogBrowse.textContent = 'Browse...';

        const workspaceRootDialogCancel = document.createElement('button');
        workspaceRootDialogCancel.type = 'button';
        workspaceRootDialogCancel.className = 'codex-button outline codex-small-button';
        workspaceRootDialogCancel.textContent = 'Cancel';

        const workspaceRootDialogSave = document.createElement('button');
        workspaceRootDialogSave.type = 'button';
        workspaceRootDialogSave.className = 'codex-button codex-small-button';
        workspaceRootDialogSave.textContent = 'Save';

        workspaceRootDialogActions.appendChild(workspaceRootDialogBrowse);
        workspaceRootDialogActions.appendChild(workspaceRootDialogCancel);
        workspaceRootDialogActions.appendChild(workspaceRootDialogSave);

        workspaceRootDialogBody.appendChild(workspaceRootDialogDescription);
        workspaceRootDialogBody.appendChild(workspaceRootDialogInput);
        workspaceRootDialogBody.appendChild(workspaceRootDialogActions);

        workspaceRootDialog.appendChild(workspaceRootDialogHeader);
        workspaceRootDialog.appendChild(workspaceRootDialogBody);
        workspaceRootDialogOverlay.appendChild(workspaceRootDialog);

      const inputActions = document.createElement('div');
      inputActions.className = 'codex-actions';
      inputActions.appendChild(stopButton);
      inputActions.appendChild(clearButton);

      inputRow.appendChild(input);
      inputRow.appendChild(attachButton);
      inputRow.appendChild(inputActions);

      footer.appendChild(selectors);
      inputPanel.appendChild(fileInput);
      inputPanel.appendChild(attachedFilesRow);
      inputPanel.appendChild(inputRow);
      inputPanel.appendChild(footer);

      wrapper.appendChild(header);
      wrapper.appendChild(output);
      wrapper.appendChild(inputPanel);
      wrapper.appendChild(mentionDropdown);
      wrapper.appendChild(changeDialogOverlay);
      wrapper.appendChild(quickstartDialogOverlay);
      wrapper.appendChild(insightDialogOverlay);
      wrapper.appendChild(workspaceRootDialogOverlay);

      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `/plugins/${pluginName}/static/codex-gerrit.css`;

      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(wrapper);
      log('Panel DOM mounted. Loading models...');

      stopButton.addEventListener('click', () => this.stopChat());
      clearButton.addEventListener('click', () => this.clearChatPanel());
      input.addEventListener('input', () => this.handleInputChanged());
      input.addEventListener('keydown', event => this.handleInputKeydown(event));
      input.addEventListener('click', () => this.handleInputChanged());
      attachButton.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => this.handleFilesSelected(fileInput));
      codespacesSelect.addEventListener('change', () => this.handleCodespacesAction());
      document.addEventListener('click', event => {
        if (!this.shadowRoot || !this.shadowRoot.contains(event.target)) {
          this.hideMentionDropdown();
        }
      });
      changeDialogClose.addEventListener('click', () => this.closeFileChangesDialog());
      changeDialogOverlay.addEventListener('click', () => this.closeFileChangesDialog());
      helpButton.addEventListener('click', () => this.openQuickstartDialog(this.quickstartLanguage));
      quickstartDialogClose.addEventListener('click', () => this.closeQuickstartDialog());
      quickstartDialogOverlay.addEventListener('click', () => this.closeQuickstartDialog());
      insightDialogClose.addEventListener('click', () => this.closeInsightDialog());
      insightDialogOverlay.addEventListener('click', () => this.closeInsightDialog());
      quickstartEnglishButton.addEventListener('click', () => this.setQuickstartLanguage('en'));
      quickstartChineseButton.addEventListener('click', () => this.setQuickstartLanguage('cn'));

      this.shadowRoot.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.isQuickstartDialogVisible()) {
          this.closeQuickstartDialog();
          return;
        }
        if (event.key === 'Escape' && this.isFileChangesDialogVisible()) {
          this.closeFileChangesDialog();
          return;
        }
        if (event.key === 'Escape' && this.isInsightDialogVisible()) {
          this.closeInsightDialog();
        }
      });

      this.input = input;
      this.agentSelect = agentSelect;
      this.modelSelect = modelSelect;
      this.codespacesSelect = codespacesSelect;
      this.mentionDropdown = mentionDropdown;
      this.output = output;
      this.status = status;
      this.stopButton = stopButton;
      this.clearButton = clearButton;
      this.changeDialogOverlay = changeDialogOverlay;
      this.changeDialogBody = changeDialogBody;
      this.quickstartDialogOverlay = quickstartDialogOverlay;
      this.quickstartDialogBody = quickstartDialogBody;
      this.quickstartEnglishButton = quickstartEnglishButton;
      this.quickstartChineseButton = quickstartChineseButton;
      this.insightDialogOverlay = insightDialogOverlay;
      this.insightDialogBody = insightDialogBody;
      this.workspaceRootDialogOverlay = workspaceRootDialogOverlay;
      this.workspaceRootDialogInput = workspaceRootDialogInput;
      this.workspaceRootDialogBrowse = workspaceRootDialogBrowse;
      this.workspaceRootDialogCancel = workspaceRootDialogCancel;
      this.workspaceRootDialogSave = workspaceRootDialogSave;
      this.fileInput = fileInput;
      this.attachedFilesRow = attachedFilesRow;

      this.showWelcomeMessage();
      this.loadConfig();
    }

    showWelcomeMessage() {
      this.appendMessage(
          'assistant',
          '👋 Welcome to Codex Chat in Gerrit. Loading configuration, agents, and models...');
      this.setStatus('Loading Codex Chat...');
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
        const patchsetFiles = response ? response.patchsetFiles || response.patchset_files : null;

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
          this.agentSelect.value = agents[0];
          log('Agent options populated.', {
            count: agents.length,
            selectedAgent: this.agentSelect.value
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
          this.modelSelect.value = response.models[0];
          log('Models populated.', {
            count: response.models.length,
            selectedModel: this.modelSelect.value
          });
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

        const configuredCommands = this.normalizeHashCommands(
            response ? response.hashCommands || response.hash_commands || response.commands : null);
        this.hashCommands = configuredCommands.length > 0 ? configuredCommands : defaultHashCommands.slice();
        log('# commands loaded for dropdown.', {
          count: this.hashCommands.length,
          commands: this.hashCommands
        });
      } catch (err) {
        warn('Failed to load models.', err);
      }
    }

    normalizeHashCommands(commands) {
      if (!Array.isArray(commands) || commands.length === 0) {
        return [];
      }
      const normalized = [];
      const seen = new Set();
      commands.forEach(command => {
        if (typeof command !== 'string') {
          return;
        }
        const trimmed = command.trim().replace(/^#+/, '');
        if (!trimmed || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        normalized.push(trimmed);
      });
      return normalized;
    }

    async submitChat() {
      await this.submit('chat', false);
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
      }
    }

    async openPatchsetFilesInVsCode() {
      const changeId = this.getChangeId();
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return;
      }

      const workspaceRoot = await this.getOrPromptWorkspaceRoot();
      if (!workspaceRoot) {
        this.setStatus('Open in VS Code canceled.');
        return;
      }

      const directoryHandle = await this.selectDownloadDirectoryHandle('VS Code', changeId);
      if (!directoryHandle) {
        return;
      }

      try {
        const files = await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return;
        }

        this.setStatus('Downloading latest patchset files from Gerrit...');
        await this.writePatchsetFilesToDirectory(directoryHandle, files);
        this.openPatchsetInVsCode(workspaceRoot, files);
        this.setStatus(`Downloaded ${files.length} patchset files and opening in VS Code...`);
      } catch (err) {
        logError('Open in VS Code failed.', err);
        this.setStatus(`Open in VS Code failed: ${this.getErrorMessage(err)}`);
      }
    }

    async fetchLatestPatchsetFiles(changeId) {
      const path = `/changes/${changeId}/revisions/current/codex-patchset-files`;
      const response = await plugin.restApi().get(path);
      return response && response.files ? response.files : [];
    }

    async selectDownloadDirectoryHandle(editorName, changeId) {
      if (!window.showDirectoryPicker) {
        await this.downloadLatestPatchsetFilesIndividually(changeId, editorName);
        return null;
      }
      try {
        return await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (error) {
        if (error && error.name === 'AbortError') {
          this.setStatus(`Open in ${editorName || 'editor'} canceled.`);
          return null;
        }
        logError('Directory picker is unavailable, falling back to direct file downloads.', error);
        await this.downloadLatestPatchsetFilesIndividually(changeId, editorName);
        return null;
      }
    }

    async downloadLatestPatchsetFilesIndividually(changeId, editorName) {
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return false;
      }

      try {
        this.setStatus('Fetching latest patchset files from Gerrit...');
        const files = await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return false;
        }

        const downloadErrors = [];
        let downloaded = 0;
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          this.setStatus(`Downloading file ${index + 1}/${files.length} from latest patchset...`);
          try {
            const relativePath = this.normalizePath(file.path || '').replace(/^\/+/, '');
            if (!relativePath) {
              continue;
            }
            const bytes = this.base64ToUint8Array(file.contentBase64 || '');
            if (!bytes || bytes.length === 0) {
              continue;
            }
            this.triggerBrowserFileDownload(bytes, relativePath);
            downloaded += 1;
          } catch (fileError) {
            downloadErrors.push(`${file && file.path ? file.path : '(unknown file)'}: ${this.getErrorMessage(fileError)}`);
          }
        }

        if (downloaded === 0) {
          throw new Error(downloadErrors.length > 0 ? downloadErrors.join('; ') : 'No files downloaded.');
        }

        if (downloadErrors.length > 0) {
          logError('Some latest patchset files failed to download.', downloadErrors);
          this.setStatus(`Downloaded ${downloaded}/${files.length} latest patchset files.`);
        } else {
          this.setStatus(`Downloaded ${downloaded} latest patchset files. Run Open in ${editorName || 'editor'} again.`);
        }
        return true;
      } catch (error) {
        logError('Failed to download latest patchset files.', error);
        this.setStatus(`Patchset download failed: ${this.getErrorMessage(error)}`);
        return false;
      }
    }

    triggerBrowserFileDownload(bytes, relativePath) {
      const safeFileName = this.toBrowserDownloadName(relativePath);
      if (!safeFileName) {
        return;
      }
      const objectUrl = window.URL.createObjectURL(new Blob([bytes]));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = safeFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
    }

    toBrowserDownloadName(relativePath) {
      const normalizedPath = this.normalizePath(relativePath).replace(/^\/+/, '');
      if (!normalizedPath) {
        return '';
      }
      return normalizedPath
          .split('/')
          .filter(part => part && part.length > 0)
          .join('__');
    }

    async getJsonFromGerrit(path) {
      const restApi = plugin.restApi && plugin.restApi();
      const candidates = this.getGerritRestCandidates(path);

      if (restApi && typeof restApi.get === 'function') {
        for (const candidate of candidates) {
          try {
            const data = await restApi.get(candidate);
            if (data !== undefined && data !== null) {
              return data;
            }
          } catch (restError) {
            logError('Gerrit REST get failed for candidate path.', { path: candidate, error: this.getErrorMessage(restError) });
          }
        }
      }

      const response = await this.fetchFromGerrit(path, { method: 'GET' }, false);
      return await this.parseGerritJsonResponse(response);
    }

    async fetchFromGerrit(path, options, expectJson) {
      const candidates = this.getGerritRestCandidates(path);

      const errors = [];
      for (const candidate of candidates) {
        const response = await this.tryFetchGerritCandidate(candidate, options);
        if (!response) {
          errors.push(`${candidate}: no response`);
          continue;
        }
        if (!response.ok) {
          errors.push(`${candidate}: HTTP ${response.status}`);
          continue;
        }
        if (expectJson) {
          try {
            await this.parseGerritJsonResponse(response.clone());
          } catch (parseError) {
            errors.push(`${candidate}: ${this.getErrorMessage(parseError)}`);
            continue;
          }
        }
        return response;
      }

      throw new Error(errors.join('; '));
    }

    async tryFetchGerritCandidate(path, options) {
      try {
        return await window.fetch(path, Object.assign({ credentials: 'same-origin' }, options || { method: 'GET' }));
      } catch (fetchError) {
        logError('window.fetch failed for candidate path.', { path, error: this.getErrorMessage(fetchError) });
        return null;
      }
    }

    getGerritRestCandidates(path) {
      const candidates = [path];
      if (!path.startsWith('/a/') && !window.location.pathname.startsWith('/a/')) {
        candidates.push(`/a${path}`);
      }
      return candidates;
    }

    async parseGerritJsonResponse(response) {
      const bodyText = await response.text();
      const sanitized = bodyText.replace(/^\)\]\}'\n/, '');
      return sanitized ? JSON.parse(sanitized) : null;
    }


    async writePatchsetFilesToDirectory(directoryHandle, files) {
      for (const file of files) {
        if (!file || !file.path) {
          continue;
        }
        const relativePath = this.normalizePath(file.path).replace(/^\/+/, '');
        if (!relativePath) {
          continue;
        }
        const directoryParts = relativePath.split('/').filter(Boolean);
        const fileName = directoryParts.pop();
        if (!fileName) {
          continue;
        }
        let parentDirectory = directoryHandle;
        for (const directoryName of directoryParts) {
          parentDirectory = await parentDirectory.getDirectoryHandle(directoryName, { create: true });
        }
        const fileHandle = await parentDirectory.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        try {
          const bytes = this.base64ToUint8Array(file.contentBase64 || '');
          await writable.write(bytes);
        } finally {
          await writable.close();
        }
      }
    }

    openPatchsetInVsCode(workspaceRoot, files) {
      const normalizedRoot = this.normalizePath(workspaceRoot).replace(/\/+$/, '');
      const workspaceUri = this.toVsCodeFileUri(normalizedRoot);
      window.open(workspaceUri, '_blank');

      files.forEach((file, index) => {
        if (!file || !file.path) {
          return;
        }
        const uri = this.toVsCodeFileUri(this.joinPaths(normalizedRoot, file.path));
        window.setTimeout(() => {
          window.open(uri, '_blank');
        }, (index + 1) * 60);
      });
    }

    base64ToUint8Array(value) {
      const raw = window.atob(value || '');
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) {
        bytes[i] = raw.charCodeAt(i);
      }
      return bytes;
    }

    async openPatchsetFilesInBrowser() {
      this.setStatus('Open in Browser is coming soon.');
    }

    async openPatchsetFilesInCursor() {
      const changeId = this.getChangeId();
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return;
      }

      const workspaceRoot = await this.getOrPromptWorkspaceRoot();
      if (!workspaceRoot) {
        this.setStatus('Open in Cursor canceled.');
        return;
      }

      const directoryHandle = await this.selectDownloadDirectoryHandle('Cursor', changeId);
      if (!directoryHandle) {
        return;
      }

      try {
        const files = await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return;
        }

        this.setStatus('Downloading latest patchset files from Gerrit...');
        await this.writePatchsetFilesToDirectory(directoryHandle, files);
        this.openPatchsetInCursor(workspaceRoot, files);
        this.setStatus(`Downloaded ${files.length} patchset files and opening in Cursor...`);
      } catch (err) {
        logError('Open in Cursor failed.', err);
        this.setStatus(`Open in Cursor failed: ${this.getErrorMessage(err)}`);
      }
    }

    async openPatchsetFilesInTrae() {
      const changeId = this.getChangeId();
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return;
      }

      const workspaceRoot = await this.getOrPromptWorkspaceRoot();
      if (!workspaceRoot) {
        this.setStatus('Open in Trae canceled.');
        return;
      }

      const directoryHandle = await this.selectDownloadDirectoryHandle('Trae', changeId);
      if (!directoryHandle) {
        return;
      }

      try {
        const files = await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return;
        }

        this.setStatus('Downloading latest patchset files from Gerrit...');
        await this.writePatchsetFilesToDirectory(directoryHandle, files);
        this.openPatchsetInTrae(workspaceRoot, files);
        this.setStatus(`Downloaded ${files.length} patchset files and opening in Trae...`);
      } catch (err) {
        logError('Open in Trae failed.', err);
        this.setStatus(`Open in Trae failed: ${this.getErrorMessage(err)}`);
      }
    }

    openPatchsetInTrae(workspaceRoot, files) {
      const normalizedRoot = this.normalizePath(workspaceRoot).replace(/\/+$/, '');
      const workspaceUri = this.toTraeFileUri(normalizedRoot);
      window.open(workspaceUri, '_blank');

      files.forEach((file, index) => {
        if (!file || !file.path) {
          return;
        }
        const uri = this.toTraeFileUri(this.joinPaths(normalizedRoot, file.path));
        window.setTimeout(() => {
          window.open(uri, '_blank');
        }, (index + 1) * 60);
      });
    }

    openPatchsetInCursor(workspaceRoot, files) {
      const normalizedRoot = this.normalizePath(workspaceRoot).replace(/\/+$/, '');
      const workspaceUri = this.toCursorFileUri(normalizedRoot);
      window.open(workspaceUri, '_blank');

      files.forEach((file, index) => {
        if (!file || !file.path) {
          return;
        }
        const uri = this.toCursorFileUri(this.joinPaths(normalizedRoot, file.path));
        window.setTimeout(() => {
          window.open(uri, '_blank');
        }, (index + 1) * 60);
      });
    }

    async openPatchsetFilesInAndroidStudio() {
      const changeId = this.getChangeId();
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return;
      }

      const workspaceRoot = await this.getOrPromptWorkspaceRoot();
      if (!workspaceRoot) {
        this.setStatus('Open in Android Studio canceled.');
        return;
      }

      const directoryHandle = await this.selectDownloadDirectoryHandle('Android Studio', changeId);
      if (!directoryHandle) {
        return;
      }

      try {
        const files = await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return;
        }

        this.setStatus('Downloading latest patchset files from Gerrit...');
        await this.writePatchsetFilesToDirectory(directoryHandle, files);
        this.openPatchsetInAndroidStudio(workspaceRoot, files);
        this.setStatus(`Downloaded ${files.length} patchset files and opening in Android Studio...`);
      } catch (err) {
        logError('Open in Android Studio failed.', err);
        this.setStatus(`Open in Android Studio failed: ${this.getErrorMessage(err)}`);
      }
    }

    openPatchsetInAndroidStudio(workspaceRoot, files) {
      const normalizedRoot = this.normalizePath(workspaceRoot).replace(/\/+$/, '');
      files.forEach((file, index) => {
        if (!file || !file.path) {
          return;
        }
        const fullPath = this.joinPaths(normalizedRoot, file.path);
        const uri = this.toAndroidStudioFileUri(normalizedRoot, fullPath);
        window.setTimeout(() => {
          window.open(uri, '_blank');
        }, index * 60);
      });
    }

    async getOrPromptWorkspaceRoot() {
      const savedRoot = window.localStorage.getItem(workspaceRootStorageKey);
      let workspaceRoot = '';

      if (this.workspaceRootDialogOverlay && this.workspaceRootDialogInput) {
        workspaceRoot = await this.promptWorkspaceRootDialog(savedRoot || '');
      } else {
        const promptDefault = savedRoot || '';
        const promptValue = window.prompt(
            'Enter your local workspace root path for this repository (e.g. /home/user/repo or C:\\repo).',
            promptDefault);
        if (promptValue === null) {
          return '';
        }
        workspaceRoot = promptValue;
      }

      const normalized = this.normalizePath(workspaceRoot);
      if (!normalized) {
        return '';
      }
      window.localStorage.setItem(workspaceRootStorageKey, normalized);
      return normalized;
    }

    promptWorkspaceRootDialog(defaultValue) {
      if (this.workspaceRootDialogPromise) {
        return this.workspaceRootDialogPromise;
      }

      this.workspaceRootDialogPromise = new Promise(resolve => {
        const overlay = this.workspaceRootDialogOverlay;
        const input = this.workspaceRootDialogInput;
        const browseButton = this.workspaceRootDialogBrowse;
        const cancelButton = this.workspaceRootDialogCancel;
        const saveButton = this.workspaceRootDialogSave;
        if (!overlay || !input || !browseButton || !cancelButton || !saveButton) {
          this.workspaceRootDialogPromise = null;
          resolve('');
          return;
        }

        let done = false;
        const cleanup = () => {
          overlay.removeEventListener('click', onOverlayClick);
          input.removeEventListener('keydown', onInputKeydown);
          browseButton.removeEventListener('click', onBrowseClick);
          cancelButton.removeEventListener('click', onCancelClick);
          saveButton.removeEventListener('click', onSaveClick);
        };
        const finish = value => {
          if (done) {
            return;
          }
          done = true;
          cleanup();
          overlay.classList.add('hidden');
          this.workspaceRootDialogPromise = null;
          resolve(value || '');
        };

        const onOverlayClick = () => finish('');
        const onCancelClick = () => finish('');
        const onSaveClick = () => finish(input.value || '');
        const onInputKeydown = event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            finish('');
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            finish(input.value || '');
          }
        };
        const onBrowseClick = async () => {
          const path = await this.pickWorkspaceRootPathFromDirectory(input.value || '');
          if (path) {
            input.value = path;
            finish(path);
          }
        };

        overlay.addEventListener('click', onOverlayClick);
        input.addEventListener('keydown', onInputKeydown);
        browseButton.addEventListener('click', onBrowseClick);
        cancelButton.addEventListener('click', onCancelClick);
        saveButton.addEventListener('click', onSaveClick);

        input.value = defaultValue || '';
        overlay.classList.remove('hidden');
        window.setTimeout(() => {
          input.focus();
          input.select();
        }, 0);
      });

      return this.workspaceRootDialogPromise;
    }

    async pickWorkspaceRootPathFromDirectory(currentPath) {
      try {
        if (window.showDirectoryPicker) {
          const directoryHandle = await this.showDirectoryPickerCompat();
          if (directoryHandle && directoryHandle.name) {
            const guessed = this.inferWorkspaceRootFromSelection(currentPath, directoryHandle.name);
            if (!guessed) {
              return '';
            }
            this.setStatus('Directory selected from file explorer. Verify the full path, then click Save.');
            return guessed;
          }
        }

        const fallbackPath = await this.pickWorkspaceRootPathUsingFileInput(currentPath);
        if (!fallbackPath) {
          return '';
        }
        this.setStatus('Directory selected from file explorer. Verify the full path, then click Save.');
        return fallbackPath;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return '';
        }

        const fallbackPath = await this.pickWorkspaceRootPathUsingFileInput(currentPath);
        if (fallbackPath) {
          this.setStatus('Directory selected from file explorer. Verify the full path, then click Save.');
          return fallbackPath;
        }

        this.setStatus(`Directory picker is blocked or unavailable: ${this.getErrorMessage(error)}. Enter the path manually, then click Save.`);
        return '';
      }
    }

    async pickWorkspaceRootPathUsingFileInput(currentPath) {
      if (!document || !document.body) {
        return '';
      }

      const selectedDirectoryName = await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0';
        input.multiple = true;
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');

        const cleanup = () => {
          input.removeEventListener('change', onChange);
          input.removeEventListener('cancel', onCancel);
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        };

        const onCancel = () => {
          cleanup();
          resolve('');
        };

        const onChange = () => {
          const file = input.files && input.files.length > 0 ? input.files[0] : null;
          const relative = file && typeof file.webkitRelativePath === 'string' ? file.webkitRelativePath : '';
          const directoryName = relative && relative.indexOf('/') > 0
              ? relative.split('/')[0]
              : '';
          cleanup();
          resolve(directoryName || '');
        };

        input.addEventListener('change', onChange, { once: true });
        input.addEventListener('cancel', onCancel, { once: true });
        document.body.appendChild(input);
        input.click();
      });

      if (!selectedDirectoryName) {
        return '';
      }

      return this.inferWorkspaceRootFromSelection(currentPath, selectedDirectoryName);
    }

    async showDirectoryPickerCompat() {
      if (!window.showDirectoryPicker) {
        return null;
      }

      try {
        return await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (error) {
        const message = this.getErrorMessage(error).toLowerCase();
        const unsupportedOptions =
            (error && error.name === 'TypeError') ||
            message.indexOf('mode') >= 0 ||
            message.indexOf('dictionary') >= 0;
        if (!unsupportedOptions) {
          throw error;
        }
      }

      return await window.showDirectoryPicker();
    }

    inferWorkspaceRootFromSelection(currentPath, selectedDirectoryName) {
      const normalizedName = this.normalizePath(selectedDirectoryName).replace(/^\/+/g, '').replace(/\/+$/g, '');
      if (!normalizedName) {
        return this.normalizePath(currentPath);
      }

      const normalizedCurrent = this.normalizePath(currentPath).replace(/\/+$/g, '');
      if (!normalizedCurrent) {
        return normalizedName;
      }

      const pathParts = normalizedCurrent.split('/').filter(part => part && part.length > 0);
      if (pathParts.length === 0) {
        return normalizedName;
      }

      pathParts[pathParts.length - 1] = normalizedName;
      const inferredPath = pathParts.join('/');

      if (normalizedCurrent.startsWith('/')) {
        return `/${inferredPath}`;
      }
      return inferredPath;
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

    toTraeFileUri(path) {
      const normalized = this.normalizePath(path);
      const drivePathMatch = normalized.match(/^[A-Za-z]:\//);
      const withLeadingSlash = drivePathMatch ? `/${normalized}` : normalized;
      const encodedPath = withLeadingSlash
          .split('/')
          .map(segment => encodeURIComponent(segment))
          .join('/')
          .replace(/^\/(%[0-9A-Fa-f]{2})?([A-Za-z])%3A\//, '/$2:/');
      return `trae://file${encodedPath}`;
    }

    toAndroidStudioFileUri(workspaceRoot, fullPath) {
      const normalizedRoot = this.normalizePath(workspaceRoot).replace(/\/+$/, '');
      const normalizedPath = this.normalizePath(fullPath);
      const projectName = normalizedRoot.split('/').filter(Boolean).pop() || 'project';
      const encodedProject = encodeURIComponent(projectName);
      const encodedPath = encodeURIComponent(normalizedPath);
      return `jetbrains://android-studio/navigate/reference?project=${encodedProject}&path=${encodedPath}`;
    }

    async submit(mode, postAsReview) {
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

      const insightCommand = this.parseInsightCommand(prompt);
      if (insightCommand) {
        await this.submitInsightCommand(prompt, insightCommand);
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
      const attachedFiles = (this.attachedFiles || []).map(f => {
        const payload = { name: f.name };
        if (f.base64Content) {
          payload.base64Content = f.base64Content;
        } else {
          payload.content = f.content || '';
        }
        return payload;
      });
      const sessionId = this.createSessionId();
      this.activeSessionId = sessionId;

      try {
        const path = `/changes/${changeId}/revisions/current/codex-chat`;
        log('Submitting chat request.', { mode, postAsReview, agent, model, sessionId, contextFilesCount: contextFiles.length, attachedFilesCount: attachedFiles.length, path });
        const response = await plugin.restApi().post(path, {
          prompt,
          mode,
          postAsReview,
          agent,
          model,
          sessionId,
          session_id: sessionId,
          contextFiles,
          attachedFiles
        });
        log('Chat REST response received.', response);
        if (response && response.reply) {
          this.appendMessage('assistant', response.reply);
          const fileChanges = this.extractFileChangesFromReply(response.reply, contextFiles);
          if (fileChanges.length > 0) {
            this.showFileChangesDialog(fileChanges);
            this.setStatus(`Detected ${fileChanges.length} changed file(s). Review dialog opened for Keep/Undo.`);
          } else {
            this.setStatus('Done.');
          }
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
        // Clear attached files after each submission so they are not re-sent.
        this.attachedFiles = [];
        this.renderAttachedFileChips();
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
        await plugin.restApi().post(path, { sessionId, session_id: sessionId });
        this.setStatus('Stop request sent. Waiting for session to close...');
      } catch (stopError) {
        logError('Chat stop request failed.', stopError);
        this.setStatus(`Stop failed: ${this.getErrorMessage(stopError)}`);
      }
    }

    clearChatPanel() {
      if (this.output) {
        this.output.innerHTML = '';
        if (this.status) {
          this.output.appendChild(this.status);
        }
      }
      if (this.input) {
        this.input.value = '';
      }
      this.hideMentionDropdown();
      this.promptHistory = [];
      this.promptHistoryIndex = -1;
      this.pendingFileChanges = [];
      this.closeFileChangesDialog();
      this.closeInsightDialog();
      this.attachedFiles = [];
      this.renderAttachedFileChips();
      if (this.fileInput) {
        this.fileInput.value = '';
      }
      this.setStatus('Chat panel cleared.');
    }

    /**
     * Called when the user selects files via the hidden file input.
    * Reads each file and stores it in this.attachedFiles.
     * @param {HTMLInputElement} fileInputEl
     */
    handleFilesSelected(fileInputEl) {
      const files = fileInputEl.files;
      if (!files || files.length === 0) {
        return;
      }
      const MAX_FILE_SIZE = 512 * 1024; // 512 KB per file
      let readCount = 0;
      const totalFiles = files.length;
      Array.from(files).forEach(file => {
        if (file.size > MAX_FILE_SIZE) {
          warn('Attached file exceeds size limit, skipping.', { name: file.name, size: file.size });
          this.setStatus(`File "${file.name}" is too large (max 512 KB).`);
          readCount++;
          if (readCount === totalFiles) {
            fileInputEl.value = '';
            this.renderAttachedFileChips();
          }
          return;
        }
        const reader = new FileReader();
        reader.onload = event => {
          const result = event.target ? event.target.result : null;
          const name = file.name || 'file';
          const base64Content = this.toBase64FromDataUrl(result);
          const content = typeof result === 'string' ? this.extractTextFromDataUrl(result) : '';
          // Avoid duplicates by name
          const alreadyExists = this.attachedFiles.some(f => f.name === name);
          if (!alreadyExists) {
            this.attachedFiles.push(base64Content ? { name, base64Content } : { name, content });
            log('Attached file added.', { name, size: file.size, encoded: !!base64Content });
          } else {
            log('Attached file already in list, skipping.', { name });
          }
          readCount++;
          if (readCount === totalFiles) {
            fileInputEl.value = '';
            this.renderAttachedFileChips();
          }
        };
        reader.onerror = () => {
          warn('Failed to read attached file.', { name: file.name });
          readCount++;
          if (readCount === totalFiles) {
            fileInputEl.value = '';
            this.renderAttachedFileChips();
          }
        };
        reader.readAsDataURL(file);
      });
    }

    toBase64FromDataUrl(dataUrl) {
      if (typeof dataUrl !== 'string') {
        return null;
      }
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex < 0) {
        return null;
      }
      const base64Part = dataUrl.substring(commaIndex + 1).trim();
      return base64Part || null;
    }

    extractTextFromDataUrl(dataUrl) {
      if (typeof dataUrl !== 'string') {
        return '';
      }
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex < 0) {
        return '';
      }
      const body = dataUrl.substring(commaIndex + 1);
      try {
        return atob(body);
      } catch (error) {
        return '';
      }
    }

    readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => {
          const result = event && event.target ? event.target.result : '';
          resolve(typeof result === 'string' ? result : '');
        };
        reader.onerror = () => reject(new Error(`Failed to read file: ${file && file.name ? file.name : 'unknown'}`));
        reader.readAsDataURL(file);
      });
    }

    async encodeInsightDirectoryFiles(fileList) {
      const files = Array.isArray(fileList) ? fileList : [];
      const encoded = [];
      for (const file of files) {
        if (!file) {
          continue;
        }
        const relativePath = this.normalizePath(file.webkitRelativePath || file.name || '').replace(/^\/+/, '');
        if (!relativePath) {
          continue;
        }
        const dataUrl = await this.readFileAsDataUrl(file);
        const base64Content = this.toBase64FromDataUrl(dataUrl);
        const content = this.extractTextFromDataUrl(dataUrl);
        if (base64Content) {
          encoded.push({ path: relativePath, base64Content });
        } else {
          encoded.push({ path: relativePath, content: content || '' });
        }
      }
      return encoded;
    }

    async pickInsightFilesFromDirectory() {
      if (!document || !document.body) {
        return [];
      }

      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0';
        input.multiple = true;
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');

        const cleanup = () => {
          input.removeEventListener('change', onChange);
          input.removeEventListener('cancel', onCancel);
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        };

        const onCancel = () => {
          cleanup();
          resolve([]);
        };

        const onChange = async () => {
          try {
            const files = Array.from(input.files || []);
            const encodedFiles = await this.encodeInsightDirectoryFiles(files);
            cleanup();
            resolve(encodedFiles);
          } catch (error) {
            cleanup();
            warn('Failed to encode selected insight directory files.', error);
            resolve([]);
          }
        };

        input.addEventListener('change', onChange, { once: true });
        input.addEventListener('cancel', onCancel, { once: true });
        document.body.appendChild(input);
        input.click();
      });
    }

    /**
     * Removes an attached file by name and re-renders the chips row.
     * @param {string} fileName
     */
    removeAttachedFile(fileName) {
      this.attachedFiles = this.attachedFiles.filter(f => f.name !== fileName);
      this.renderAttachedFileChips();
      log('Attached file removed.', { fileName });
    }

    /**
     * Re-renders the chips row that shows currently attached files.
     * Shows/hides the row depending on whether any files are attached.
     */
    renderAttachedFileChips() {
      const row = this.attachedFilesRow;
      if (!row) {
        return;
      }
      row.innerHTML = '';
      if (!this.attachedFiles || this.attachedFiles.length === 0) {
        row.classList.add('hidden');
        return;
      }
      row.classList.remove('hidden');
      this.attachedFiles.forEach(file => {
        const chip = document.createElement('span');
        chip.className = 'codex-attached-chip';
        const estimatedChars = (file.content || file.base64Content || '').length;
        chip.title = `${file.name} (${Math.ceil(estimatedChars / 1024)} KB)`;

        const label = document.createElement('span');
        label.className = 'codex-attached-chip-label';
        label.textContent = file.name;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'codex-attached-chip-remove';
        removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
        removeBtn.textContent = '\u00d7'; // ×
        removeBtn.addEventListener('click', () => this.removeAttachedFile(file.name));

        chip.appendChild(label);
        chip.appendChild(removeBtn);
        row.appendChild(chip);
      });
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
      if (this.stopButton) {
        this.stopButton.disabled = !isBusy;
      }
    }

    extractFileChangesFromReply(reply, contextFiles) {
      const blocks = this.extractDiffBlocks(reply || '');
      const merged = new Map();
      const fallbackFilePath = this.resolveFallbackDiffFilePath(reply, contextFiles || []);
      if (blocks.length > 0) {
        blocks.forEach(block => {
          const parsedChanges = this.parseDiffBlock(block);
          if (parsedChanges.length === 0 && fallbackFilePath && this.blockContainsPatchContent(block)) {
            parsedChanges.push({ filePath: fallbackFilePath, diffText: block.trim() });
          }
          parsedChanges.forEach(change => {
            if (!change.filePath || !change.diffText) {
              return;
            }
            const existing = merged.get(change.filePath);
            if (!existing) {
              merged.set(change.filePath, change.diffText.trim());
              return;
            }
            merged.set(change.filePath, `${existing}\n\n${change.diffText.trim()}`.trim());
          });
        });
      } else if (fallbackFilePath) {
        const synthesizedDiff = this.synthesizeDiffFromCodeBlock(reply || '', fallbackFilePath);
        if (synthesizedDiff) {
          merged.set(fallbackFilePath, synthesizedDiff);
        }
      }

      if (merged.size === 0) {
        return [];
      }

      return Array.from(merged.entries()).map(([filePath, diffText]) => {
        this.fileChangeSequence += 1;
        return {
          id: `change-${this.fileChangeSequence}`,
          filePath,
          diffText,
          decision: 'pending'
        };
      });
    }

    resolveFallbackDiffFilePath(reply, contextFiles) {
      if (!contextFiles || contextFiles.length === 0) {
        return '';
      }

      if (contextFiles.length === 1) {
        return contextFiles[0];
      }

      const text = String(reply || '');
      for (const file of contextFiles) {
        if (!file) {
          continue;
        }
        if (text.includes(`\`${file}\``) || text.includes(file)) {
          return file;
        }
      }

      return '';
    }

    blockContainsPatchContent(block) {
      const lines = (block || '').split('\n');
      return lines.some(line => {
        if (!line || line.length === 0) {
          return false;
        }
        if (line.startsWith('@@')) {
          return true;
        }
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return true;
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return true;
        }
        return false;
      });
    }

    synthesizeDiffFromCodeBlock(reply, filePath) {
      const codeBlocks = this.extractFencedCodeBlocks(reply || '');
      if (codeBlocks.length === 0) {
        return '';
      }

      const preferred = codeBlocks.find(block => {
        const language = (block.language || '').toLowerCase();
        if (language === 'diff' || language === 'patch') {
          return false;
        }
        return !!(block.content || '').trim();
      });
      if (!preferred || !preferred.content) {
        return '';
      }

      const contentLines = preferred.content
          .replace(/\r\n?/g, '\n')
          .split('\n');
      while (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') {
        contentLines.pop();
      }
      if (contentLines.length === 0) {
        return '';
      }

      const addedLines = contentLines.map(line => `+${line}`);
      return [
        `diff --git a/${filePath} b/${filePath}`,
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -1,0 +1,${contentLines.length} @@`,
        ...addedLines
      ].join('\n');
    }

    extractFencedCodeBlocks(text) {
      const normalized = (text || '').replace(/\r\n?/g, '\n');
      if (!normalized.trim()) {
        return [];
      }

      const blocks = [];
      const fencedBlockRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
      let match;
      while ((match = fencedBlockRegex.exec(normalized)) !== null) {
        blocks.push({
          language: (match[1] || '').trim(),
          content: (match[2] || '').trim()
        });
      }
      return blocks;
    }

    extractDiffBlocks(text) {
      const normalizedText = (text || '').replace(/\r\n?/g, '\n');
      if (!normalizedText.trim()) {
        return [];
      }

      const blocks = [];
      const fencedBlockRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
      let match;
      while ((match = fencedBlockRegex.exec(normalizedText)) !== null) {
        const language = (match[1] || '').trim().toLowerCase();
        const content = (match[2] || '').trim();
        if (!content) {
          continue;
        }
        const looksLikeDiff = /^(diff --git\s+|---\s+|\+\+\+\s+|@@\s)/m.test(content);
        if (language === 'diff' || language === 'patch' || looksLikeDiff) {
          blocks.push(content);
        }
      }

      if (blocks.length > 0) {
        return blocks;
      }

      if (/^(diff --git\s+|---\s+|\+\+\+\s+|@@\s)/m.test(normalizedText)) {
        return [normalizedText];
      }

      return [];
    }

    parseDiffBlock(block) {
      const lines = (block || '').split('\n');
      const changes = [];
      let currentPath = '';
      let currentLines = [];

      const pushCurrent = () => {
        const diffText = currentLines.join('\n').trim();
        const hasDiffLines = currentLines.some(line => {
          if (!line || line.length === 0) {
            return false;
          }
          if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('@@')) {
            return true;
          }
          if (line.startsWith('+') && !line.startsWith('+++')) {
            return true;
          }
          if (line.startsWith('-') && !line.startsWith('---')) {
            return true;
          }
          return false;
        });
        if (currentPath && diffText && hasDiffLines) {
          changes.push({ filePath: currentPath, diffText });
        }
      };

      lines.forEach(line => {
        const diffHeaderMatch = line.match(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/);
        if (diffHeaderMatch) {
          pushCurrent();
          currentPath = this.normalizePatchPath(diffHeaderMatch[2]);
          currentLines = [line];
          return;
        }

        const plusPlusPlusMatch = line.match(/^\+\+\+\s+(.+)$/);
        if (plusPlusPlusMatch) {
          const path = this.extractPatchMarkerPath(plusPlusPlusMatch[1]);
          if (path) {
            currentPath = path;
          }
          currentLines.push(line);
          return;
        }

        const minusMinusMinusMatch = line.match(/^---\s+(.+)$/);
        if (minusMinusMinusMatch) {
          if (currentPath && currentLines.some(existingLine => existingLine.startsWith('@@'))) {
            pushCurrent();
            currentPath = '';
            currentLines = [];
          }
          const oldPath = this.extractPatchMarkerPath(minusMinusMinusMatch[1]);
          if (!currentPath && oldPath) {
            currentPath = oldPath;
          }
          currentLines.push(line);
          return;
        }

        currentLines.push(line);
      });

      pushCurrent();
      return changes;
    }

    extractPatchMarkerPath(value) {
      if (!value) {
        return '';
      }
      const marker = value.trim().split(/\s+/)[0];
      if (!marker || marker === '/dev/null') {
        return '';
      }
      return this.normalizePatchPath(marker);
    }

    normalizePatchPath(value) {
      if (!value) {
        return '';
      }
      let path = String(value).trim();
      if (path.startsWith('a/') || path.startsWith('b/')) {
        path = path.substring(2);
      }
      return path;
    }

    showFileChangesDialog(fileChanges) {
      this.pendingFileChanges = fileChanges.slice();
      this.renderFileChangesDialog();
      this.openFileChangesDialog();
    }

    isFileChangesDialogVisible() {
      return !!(this.changeDialogOverlay && !this.changeDialogOverlay.classList.contains('hidden'));
    }

    isQuickstartDialogVisible() {
      return !!(this.quickstartDialogOverlay && !this.quickstartDialogOverlay.classList.contains('hidden'));
    }

    isInsightDialogVisible() {
      return !!(this.insightDialogOverlay && !this.insightDialogOverlay.classList.contains('hidden'));
    }

    async openQuickstartDialog(language) {
      if (!this.quickstartDialogOverlay) {
        return;
      }
      await this.ensureQuickstartDocsLoaded();
      this.setQuickstartLanguage(language || this.quickstartLanguage || 'en');
      this.quickstartDialogOverlay.classList.remove('hidden');
    }

    closeQuickstartDialog() {
      if (this.quickstartDialogOverlay) {
        this.quickstartDialogOverlay.classList.add('hidden');
      }
    }

    openInsightDialog(markdown) {
      if (!this.insightDialogOverlay || !this.insightDialogBody) {
        return;
      }
      const normalizedMarkdown = (markdown || '').trim() || '# Insight\n\nNo markdown content generated.';
      this.insightDialogBody.innerHTML = '';

      const content = document.createElement('div');
      content.className = 'codex-message assistant markdown-preview codex-quickstart-markdown';
      content.innerHTML = this.renderMarkdown(normalizedMarkdown);

      this.insightDialogBody.appendChild(content);
      this.insightDialogBody.scrollTop = 0;
      this.insightDialogOverlay.classList.remove('hidden');
    }

    closeInsightDialog() {
      if (this.insightDialogOverlay) {
        this.insightDialogOverlay.classList.add('hidden');
      }
    }

    parseInsightCommand(prompt) {
      const trimmed = String(prompt || '').trim();
      if (!/^#insight(?:\s|$)/i.test(trimmed)) {
        return null;
      }

      const argsPart = trimmed.replace(/^#insight\s*/i, '');
      const tokens = this.tokenizeCommandArgs(argsPart);
      const command = {
        repoPath: '',
        outPath: '',
        dryRun: false
      };

      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token === '--dry-run') {
          command.dryRun = true;
          continue;
        }
        if (token === '--repo') {
          command.repoPath = i + 1 < tokens.length ? tokens[i + 1] : '';
          i += 1;
          continue;
        }
        if (token === '--out') {
          command.outPath = i + 1 < tokens.length ? tokens[i + 1] : '';
          i += 1;
        }
      }

      return command;
    }

    tokenizeCommandArgs(source) {
      const text = String(source || '').trim();
      if (!text) {
        return [];
      }
      const tokens = [];
      const tokenPattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
      let match;
      while ((match = tokenPattern.exec(text)) !== null) {
        tokens.push(match[1] || match[2] || match[3] || '');
      }
      return tokens.filter(token => !!token);
    }

    async submitInsightCommand(originalPrompt, command) {
      if (this.isBusyState) {
        this.setStatus('A request is already running.');
        return;
      }

      if (!(await this.ensureAuthenticated())) {
        this.setStatus('Sign in to Gerrit before using Codex Chat.');
        return;
      }

      const changeId = this.getChangeId();
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return;
      }

      this.setBusy(true);
      this.pushPromptHistory(originalPrompt);
      this.appendMessage('user', originalPrompt);
      this.input.value = '';
      this.promptHistoryIndex = -1;
      this.hideMentionDropdown();

      try {
        const directoryFiles = await this.pickInsightFilesFromDirectory();
        const outPath = (command && command.outPath ? command.outPath : '').trim();
        if (!directoryFiles || directoryFiles.length === 0) {
          this.appendMessage('assistant', 'Insight canceled: directory selection is required. Select a project directory to upload for insight.');
          this.setStatus('Insight canceled.');
          return;
        }
        const path = `/changes/${changeId}/revisions/current/codex-insight`;
        const requestBody = {
          dryRun: !!(command && command.dryRun),
          files: directoryFiles
        };
        if (outPath) {
          requestBody.outPath = outPath;
        }

        this.setStatus('Running #insight...');
        log('Submitting insight request.', {
          path,
          dryRun: requestBody.dryRun,
          outPath: requestBody.outPath || '',
          filesCount: directoryFiles.length
        });
        const response = await plugin.restApi().post(path, requestBody);
        const files = response && Array.isArray(response.files) ? response.files : [];
        const markdown = this.composeInsightMarkdown(files, response);
        this.openInsightDialog(markdown);
        const fileCount = files.length;
        this.appendMessage('assistant', `Insight generated (${fileCount} file${fileCount === 1 ? '' : 's'}). Opened in popup dialog.`);
        this.setStatus(`Insight generated (${fileCount} file${fileCount === 1 ? '' : 's'}).`);
      } catch (error) {
        logError('Insight request failed.', error);
        const message = this.getErrorMessage(error);
        this.appendMessage('assistant', `Insight failed: ${message}`);
        this.setStatus(`Insight failed: ${message}`);
      } finally {
        this.setBusy(false);
      }
    }

    composeInsightMarkdown(files, response) {
      const safeFiles = Array.isArray(files) ? files : [];
      if (safeFiles.length === 0) {
        const stderr = response && response.stderr ? String(response.stderr).trim() : '';
        const stdout = response && response.stdout ? String(response.stdout).trim() : '';
        if (stderr) {
          return `# Insight\n\nNo markdown files were returned.\n\n## stderr\n\n\`\`\`text\n${stderr}\n\`\`\``;
        }
        if (stdout) {
          return `# Insight\n\nNo markdown files were returned.\n\n## stdout\n\n\`\`\`text\n${stdout}\n\`\`\``;
        }
        return '# Insight\n\nNo markdown files were returned.';
      }

      if (safeFiles.length === 1) {
        const only = safeFiles[0];
        return (only && only.content ? String(only.content) : '# Insight\n\nGenerated file is empty.').trim();
      }

      const sections = safeFiles.map(file => {
        const path = file && file.path ? String(file.path) : 'Insight';
        const content = file && file.content ? String(file.content) : '';
        return `## ${path}\n\n${content}`.trim();
      });
      return sections.join('\n\n---\n\n');
    }

    setQuickstartLanguage(language) {
      const normalizedLanguage = language === 'cn' ? 'cn' : 'en';
      this.quickstartLanguage = normalizedLanguage;

      if (this.quickstartEnglishButton) {
        this.quickstartEnglishButton.classList.toggle('active', normalizedLanguage === 'en');
      }
      if (this.quickstartChineseButton) {
        this.quickstartChineseButton.classList.toggle('active', normalizedLanguage === 'cn');
      }

      this.renderQuickstartDialogContent();
    }

    renderQuickstartDialogContent() {
      if (!this.quickstartDialogBody) {
        return;
      }
      const docs = this.quickstartDocs || {};
      const source = this.quickstartLanguage === 'cn' ? docs.cn : docs.en;
      const markdown = source || '# Quickstart\n\nQuickstart content is currently unavailable.';
      this.quickstartDialogBody.innerHTML = '';

      const content = document.createElement('div');
      content.className = 'codex-message assistant markdown-preview codex-quickstart-markdown';
      content.innerHTML = this.renderMarkdown(markdown);

      this.quickstartDialogBody.appendChild(content);
      this.quickstartDialogBody.scrollTop = 0;
    }

    async ensureQuickstartDocsLoaded() {
      if (this.quickstartDocs && this.quickstartDocs.en && this.quickstartDocs.cn) {
        return;
      }
      if (this.quickstartDocsPromise) {
        await this.quickstartDocsPromise;
        return;
      }

      this.quickstartDocsPromise = (async () => {
        const fetchDoc = async path => {
          const response = await window.fetch(path, { credentials: 'same-origin' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return await response.text();
        };

        const basePath = `/plugins/${pluginName}/static`;
        const enPath = `${basePath}/quickstart_en.md`;
        const cnPath = `${basePath}/quickstart_cn.md`;
        const fallbackEn = '# Codex Chat Quickstart\n\nUnable to load quickstart content.';
        const fallbackCn = '# Codex Chat 快速上手\n\n无法加载快速上手内容。';

        const [enResult, cnResult] = await Promise.allSettled([fetchDoc(enPath), fetchDoc(cnPath)]);

        if (enResult.status === 'rejected') {
          logError('Failed to load English quickstart.', this.getErrorMessage(enResult.reason));
        }
        if (cnResult.status === 'rejected') {
          logError('Failed to load Chinese quickstart.', this.getErrorMessage(cnResult.reason));
        }

        this.quickstartDocs = {
          en: enResult.status === 'fulfilled' ? enResult.value : fallbackEn,
          cn: cnResult.status === 'fulfilled' ? cnResult.value : fallbackCn
        };
      })();

      try {
        await this.quickstartDocsPromise;
      } finally {
        this.quickstartDocsPromise = null;
      }
    }

    openFileChangesDialog() {
      if (!this.changeDialogOverlay || !this.pendingFileChanges || this.pendingFileChanges.length === 0) {
        return;
      }
      this.renderFileChangesDialog();
      this.changeDialogOverlay.classList.remove('hidden');
    }

    closeFileChangesDialog() {
      if (this.changeDialogOverlay) {
        this.changeDialogOverlay.classList.add('hidden');
      }
    }

    updateFileChangeDecision(changeId, decision) {
      this.pendingFileChanges = this.pendingFileChanges.map(change => {
        if (change.id !== changeId) {
          return change;
        }
        return {
          ...change,
          decision
        };
      });
      this.renderFileChangesDialog();
      const summary = this.getFileChangeDecisionSummary();
      this.setStatus(`Changes: ${summary.kept} kept, ${summary.undone} undone, ${summary.pending} pending.`);
    }

    getFileChangeDecisionSummary() {
      return this.pendingFileChanges.reduce(
          (accumulator, change) => {
            if (change.decision === 'kept') {
              accumulator.kept += 1;
            } else if (change.decision === 'undone') {
              accumulator.undone += 1;
            } else {
              accumulator.pending += 1;
            }
            return accumulator;
          },
          { kept: 0, undone: 0, pending: 0 });
    }

    renderFileChangesDialog() {
      if (!this.changeDialogBody) {
        return;
      }

      this.changeDialogBody.innerHTML = '';

      if (!this.pendingFileChanges || this.pendingFileChanges.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-change-empty';
        empty.textContent = 'No file changes detected in the latest Codex response.';
        this.changeDialogBody.appendChild(empty);
        return;
      }

      this.pendingFileChanges.forEach(change => {
        const item = document.createElement('div');
        item.className = `codex-change-item ${change.decision}`;

        const header = document.createElement('div');
        header.className = 'codex-change-item-header';

        const filePath = document.createElement('div');
        filePath.className = 'codex-change-file';
        filePath.textContent = change.filePath;

        const decision = document.createElement('span');
        decision.className = `codex-change-badge ${change.decision}`;
        if (change.decision === 'kept') {
          decision.textContent = 'Kept';
        } else if (change.decision === 'undone') {
          decision.textContent = 'Undone';
        } else {
          decision.textContent = 'Pending';
        }

        const actions = document.createElement('div');
        actions.className = 'codex-change-actions';

        const keepButton = document.createElement('button');
        keepButton.type = 'button';
        keepButton.className = `codex-button codex-small-button ${change.decision === 'kept' ? 'active' : ''}`;
        keepButton.textContent = 'Keep';
        keepButton.addEventListener('click', () => this.updateFileChangeDecision(change.id, 'kept'));

        const undoButton = document.createElement('button');
        undoButton.type = 'button';
        undoButton.className = `codex-button outline codex-small-button ${change.decision === 'undone' ? 'active' : ''}`;
        undoButton.textContent = 'Undo';
        undoButton.addEventListener('click', () => this.updateFileChangeDecision(change.id, 'undone'));

        actions.appendChild(keepButton);
        actions.appendChild(undoButton);

        header.appendChild(filePath);
        header.appendChild(decision);

        const diff = document.createElement('pre');
        diff.className = 'codex-change-diff';
        diff.innerHTML = this.renderDiffText(change.diffText);

        item.appendChild(header);
        item.appendChild(actions);
        item.appendChild(diff);

        this.changeDialogBody.appendChild(item);
      });
    }

    renderDiffText(diffText) {
      return (diffText || '')
          .split('\n')
          .map(line => {
            const escaped = this.escapeHtml(line);
            if (line.startsWith('+') && !line.startsWith('+++')) {
              return `<div class="codex-diff-line add">${escaped}</div>`;
            }
            if (line.startsWith('-') && !line.startsWith('---')) {
              return `<div class="codex-diff-line remove">${escaped}</div>`;
            }
            if (line.startsWith('@@')) {
              return `<div class="codex-diff-line hunk">${escaped}</div>`;
            }
            return `<div class="codex-diff-line">${escaped}</div>`;
          })
          .join('');
    }

    appendMessage(role, text) {
      if (!this.output) {
        return;
      }
      const normalizedRole = role === 'user' ? 'user' : 'assistant';
      const message = document.createElement('div');
      message.className = `codex-message ${normalizedRole}`;
      if (normalizedRole === 'assistant') {
        message.classList.add('markdown-preview');
        message.innerHTML = this.renderMarkdown(text || '');
      } else {
        message.textContent = text || '';
      }
      this.output.appendChild(message);
      this.output.scrollTop = this.output.scrollHeight;
    }

    renderMarkdown(text) {
      const normalizedText = (text || '').replace(/\r\n?/g, '\n').trim();
      if (!normalizedText) {
        return '';
      }

      const lines = normalizedText.split('\n');
      const html = [];
      const paragraphLines = [];
      const codeLines = [];
      let inCodeBlock = false;
      let codeBlockLanguage = '';
      let inUnorderedList = false;
      let inOrderedList = false;

      const closeUnorderedList = () => {
        if (inUnorderedList) {
          html.push('</ul>');
          inUnorderedList = false;
        }
      };

      const closeOrderedList = () => {
        if (inOrderedList) {
          html.push('</ol>');
          inOrderedList = false;
        }
      };

      const closeLists = () => {
        closeUnorderedList();
        closeOrderedList();
      };

      const flushParagraph = () => {
        if (paragraphLines.length === 0) {
          return;
        }
        const paragraphText = paragraphLines.join(' ');
        html.push(`<p>${this.renderMarkdownInline(paragraphText)}</p>`);
        paragraphLines.length = 0;
      };

      const flushCodeBlock = () => {
        if (!inCodeBlock) {
          return;
        }
        const languageClass = codeBlockLanguage ? ` class="language-${codeBlockLanguage}"` : '';
        const codeContent = this.escapeHtml(codeLines.join('\n'));
        html.push(`<pre><code${languageClass}>${codeContent}</code></pre>`);
        codeLines.length = 0;
        inCodeBlock = false;
        codeBlockLanguage = '';
      };

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];

        if (inCodeBlock) {
          if (/^```\s*$/.test(line)) {
            flushCodeBlock();
          } else {
            codeLines.push(line);
          }
          continue;
        }

        const headerCells = this.parseMarkdownTableRow(line);
        const tableAlignments = lineIndex + 1 < lines.length
            ? this.parseMarkdownTableAlignments(lines[lineIndex + 1])
            : null;
        if (headerCells && tableAlignments && headerCells.length === tableAlignments.length) {
          flushParagraph();
          closeLists();

          const bodyRows = [];
          let rowIndex = lineIndex + 2;
          while (rowIndex < lines.length) {
            const bodyRowCells = this.parseMarkdownTableRow(lines[rowIndex]);
            if (!bodyRowCells || bodyRowCells.length !== tableAlignments.length) {
              break;
            }
            bodyRows.push(bodyRowCells);
            rowIndex += 1;
          }

          html.push(this.renderMarkdownTable(headerCells, tableAlignments, bodyRows));
          lineIndex = rowIndex - 1;
          continue;
        }

        const codeFenceMatch = line.match(/^```\s*([a-zA-Z0-9_+-]+)?\s*$/);
        if (codeFenceMatch) {
          flushParagraph();
          closeLists();
          inCodeBlock = true;
          codeBlockLanguage = codeFenceMatch[1] || '';
          continue;
        }

        if (/^\s*$/.test(line)) {
          flushParagraph();
          closeLists();
          continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          flushParagraph();
          closeLists();
          const level = headingMatch[1].length;
          html.push(`<h${level}>${this.renderMarkdownInline(headingMatch[2].trim())}</h${level}>`);
          continue;
        }

        if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
          flushParagraph();
          closeLists();
          html.push('<hr>');
          continue;
        }

        const blockquoteMatch = line.match(/^>\s?(.*)$/);
        if (blockquoteMatch) {
          flushParagraph();
          closeLists();
          html.push(`<blockquote>${this.renderMarkdownInline(blockquoteMatch[1].trim())}</blockquote>`);
          continue;
        }

        const unorderedListMatch = line.match(/^\s*[-*+]\s+(.+)$/);
        if (unorderedListMatch) {
          flushParagraph();
          closeOrderedList();
          if (!inUnorderedList) {
            html.push('<ul>');
            inUnorderedList = true;
          }
          html.push(`<li>${this.renderMarkdownInline(unorderedListMatch[1].trim())}</li>`);
          continue;
        }

        const orderedListMatch = line.match(/^\s*\d+\.\s+(.+)$/);
        if (orderedListMatch) {
          flushParagraph();
          closeUnorderedList();
          if (!inOrderedList) {
            html.push('<ol>');
            inOrderedList = true;
          }
          html.push(`<li>${this.renderMarkdownInline(orderedListMatch[1].trim())}</li>`);
          continue;
        }

        closeLists();
        paragraphLines.push(line.trim());
      }

      flushParagraph();
      closeLists();
      flushCodeBlock();

      return html.join('');
    }

    parseMarkdownTableRow(line) {
      if (typeof line !== 'string' || !line.includes('|')) {
        return null;
      }

      const trimmed = line.trim();
      if (!trimmed || /^\|?\s*-{3,}\s*\|?$/.test(trimmed)) {
        return null;
      }

      const raw = trimmed.replace(/^\|/, '').replace(/\|$/, '');
      const cells = raw.split('|').map(cell => cell.trim());
      if (cells.length < 2 || cells.some(cell => !cell.length)) {
        return null;
      }
      return cells;
    }

    parseMarkdownTableAlignments(line) {
      if (typeof line !== 'string' || !line.includes('|')) {
        return null;
      }

      const raw = line.trim().replace(/^\|/, '').replace(/\|$/, '');
      const tokens = raw.split('|').map(token => token.trim());
      if (tokens.length < 2) {
        return null;
      }

      const alignments = [];
      for (const token of tokens) {
        if (!/^:?-{3,}:?$/.test(token)) {
          return null;
        }
        if (token.startsWith(':') && token.endsWith(':')) {
          alignments.push('center');
        } else if (token.endsWith(':')) {
          alignments.push('right');
        } else {
          alignments.push('left');
        }
      }
      return alignments;
    }

    renderMarkdownTable(headerCells, alignments, bodyRows) {
      const renderHeaderCells = headerCells
          .map((cell, index) => `<th class="codex-table-${alignments[index]}">${this.renderMarkdownInline(cell)}</th>`)
          .join('');

      const renderBodyRows = bodyRows
          .map(row => {
            const cells = row
                .map((cell, index) => `<td class="codex-table-${alignments[index]}">${this.renderMarkdownInline(cell)}</td>`)
                .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');

      return `<table><thead><tr>${renderHeaderCells}</tr></thead><tbody>${renderBodyRows}</tbody></table>`;
    }

    renderMarkdownInline(value) {
      let text = this.escapeHtml(value || '');
      const codeTokens = [];

      text = text.replace(/`([^`\n]+)`/g, (_, codeContent) => {
        const token = `\u0000${codeTokens.length}\u0000`;
        codeTokens.push(`<code>${codeContent}</code>`);
        return token;
      });

      text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, href) => {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      });
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
      text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

      text = text.replace(/\u0000(\d+)\u0000/g, (_, tokenIndex) => {
        const index = Number(tokenIndex);
        return Number.isInteger(index) && codeTokens[index] ? codeTokens[index] : '';
      });

      return text;
    }

    escapeHtml(value) {
      return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
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
      this.currentMentionTrigger = mentionInfo.trigger;
      const query = mentionInfo.query.toLowerCase();
      if (mentionInfo.trigger === '@') {
        const mentionCandidates = this.patchsetFiles
            .filter(file => file.toLowerCase().includes(query))
            .slice(0, 20);
        const normalizedCandidates =
          mentionAllKeyword.includes(query) || query.includes(mentionAllKeyword)
            ? [mentionAllKeyword, ...mentionCandidates.filter(file => file !== mentionAllKeyword)]
            : mentionCandidates;
        this.filteredMentionFiles = normalizedCandidates.map(file => `@${file}`);
      } else if (mentionInfo.trigger === '#') {
        const commandCandidates = this.hashCommands
            .filter(command => command.toLowerCase().includes(query))
            .slice(0, 20);
        this.filteredMentionFiles = commandCandidates.map(command => `#${command}`);
      } else {
        this.filteredMentionFiles = [];
      }
      if (this.filteredMentionFiles.length === 0) {
        this.hideMentionDropdown();
        return;
      }
      this.activeMentionIndex = 0;
      this.renderMentionDropdown();
    }

    handleInputKeydown(event) {
      const isArrowUp =
        event.code === 'ArrowUp' || event.key === 'ArrowUp' || event.key === 'Up' || event.keyCode === 38;
      const isArrowDown =
        event.code === 'ArrowDown' || event.key === 'ArrowDown' || event.key === 'Down' || event.keyCode === 40;

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
          const selectedItem = this.filteredMentionFiles[this.activeMentionIndex];
          if (selectedItem) {
            this.applyMentionSelection(selectedItem);
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          this.hideMentionDropdown();
          return;
        }
      }

      if (isArrowUp && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && this.isCursorOnFirstLine()) {
        event.preventDefault();
        event.stopPropagation();
        this.restorePreviousPrompt();
        return;
      }

      if (isArrowDown && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && this.isCursorOnLastLine()) {
        event.preventDefault();
        event.stopPropagation();
        this.restoreNextPrompt();
        return;
      }

      if (event.key === 'Enter' && event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
        event.preventDefault();
        if (!this.input) {
          return;
        }
        const value = this.input.value || '';
        const selectionStart = this.input.selectionStart;
        const selectionEnd = this.input.selectionEnd;
        this.input.value = `${value.substring(0, selectionStart)}\n${value.substring(selectionEnd)}`;
        const nextPosition = selectionStart + 1;
        this.input.setSelectionRange(nextPosition, nextPosition);
        this.handleInputChanged();
        return;
      }

      if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
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

    isCursorOnFirstLine() {
      if (!this.input) {
        return false;
      }
      const selectionStart = this.input.selectionStart;
      const selectionEnd = this.input.selectionEnd;
      if (selectionStart !== selectionEnd) {
        return false;
      }
      const value = this.input.value || '';
      return value.substring(0, selectionStart).indexOf('\n') === -1;
    }

    isCursorOnLastLine() {
      if (!this.input) {
        return false;
      }
      const selectionStart = this.input.selectionStart;
      const selectionEnd = this.input.selectionEnd;
      if (selectionStart !== selectionEnd) {
        return false;
      }
      const value = this.input.value || '';
      return value.substring(selectionEnd).indexOf('\n') === -1;
    }

    restoreNextPrompt() {
      if (!this.input || this.promptHistory.length === 0) {
        this.setStatus('No next message to restore.');
        return;
      }
      if (this.promptHistoryIndex <= -1) {
        this.setStatus('Already at newest input.');
        return;
      }
      this.promptHistoryIndex -= 1;
      if (this.promptHistoryIndex === -1) {
        this.input.value = '';
        this.input.focus();
        this.input.setSelectionRange(0, 0);
        this.hideMentionDropdown();
        this.setStatus('Returned to newest input.');
        return;
      }
      const historyIndex = this.promptHistory.length - 1 - this.promptHistoryIndex;
      const nextPrompt = this.promptHistory[historyIndex] || '';
      this.input.value = nextPrompt;
      this.input.focus();
      this.input.setSelectionRange(nextPrompt.length, nextPrompt.length);
      this.hideMentionDropdown();
      this.setStatus(`Restored next message (${this.promptHistoryIndex + 1}/${this.promptHistory.length}).`);
    }

    getMentionAtCursor() {
      if (!this.input) {
        return null;
      }
      const text = this.input.value || '';
      const cursorPosition = this.input.selectionStart;
      const beforeCursor = text.substring(0, cursorPosition);
      const atIndex = beforeCursor.lastIndexOf('@');
      const hashIndex = beforeCursor.lastIndexOf('#');
      const triggerIndex = Math.max(atIndex, hashIndex);
      if (triggerIndex < 0) {
        return null;
      }
      const trigger = triggerIndex === hashIndex ? '#' : '@';
      const previousChar = triggerIndex > 0 ? beforeCursor.charAt(triggerIndex - 1) : '';
      if (previousChar && !/\s/.test(previousChar)) {
        return null;
      }
      const mentionText = beforeCursor.substring(triggerIndex + 1);
      if (/\s/.test(mentionText)) {
        return null;
      }
      return {
        start: triggerIndex,
        end: cursorPosition,
        query: mentionText,
        trigger
      };
    }

    renderMentionDropdown() {
      if (!this.mentionDropdown || !this.input) {
        return;
      }
      this.mentionDropdown.style.top = `${this.input.offsetTop + this.input.offsetHeight + 4}px`;
      this.mentionDropdown.innerHTML = '';
      this.filteredMentionFiles.forEach((itemValue, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `codex-mention-item ${index === this.activeMentionIndex ? 'active' : ''}`;
        item.textContent = itemValue;
        item.addEventListener('mousedown', event => {
          event.preventDefault();
          this.applyMentionSelection(itemValue);
        });
        this.mentionDropdown.appendChild(item);
      });
      this.mentionDropdown.classList.remove('hidden');
    }

    applyMentionSelection(itemValue) {
      if (!this.input || !this.currentMentionRange) {
        this.hideMentionDropdown();
        return;
      }
      const text = this.input.value || '';
      const before = text.substring(0, this.currentMentionRange.start);
      const after = text.substring(this.currentMentionRange.end);
      const replacement = `${itemValue} `;
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
      this.currentMentionTrigger = '@';
    }

    extractContextFiles(prompt) {
      if (!prompt || !this.patchsetFiles || this.patchsetFiles.length === 0) {
        return [];
      }
      const available = new Set(this.patchsetFiles);
      const selected = [];
      const seen = new Set();
      let selectAll = false;
      const tokens = prompt.split(/\s+/);
      tokens.forEach(token => {
        if (!token || !token.startsWith('@')) {
          return;
        }
        const candidate = token.substring(1).replace(/[.,!?;:]+$/, '');
        if (!candidate) {
          return;
        }
        if (candidate.toLowerCase() === mentionAllKeyword) {
          selectAll = true;
          return;
        }
        if (available.has(candidate) && !seen.has(candidate)) {
          seen.add(candidate);
          selected.push(candidate);
        }
      });
      if (selectAll) {
        return this.patchsetFiles.slice();
      }
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
