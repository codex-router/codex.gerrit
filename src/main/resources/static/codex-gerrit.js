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
    { value: 'open-trae', label: 'Open in Trae' },
    { value: 'open-cursor', label: 'Open in Cursor' },
    { value: 'open-vscode', label: 'Open in VS Code' }
  ];
  const workspaceRootStorageKey = `${pluginName}-workspace-root`;
  const browserRepoStorageKey = `${pluginName}-browser-repo-url`;
  const syncedViaWorkspaceRootSentinel = '__codex_synced_via_workspace_root__';
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
      this.pendingFileChanges = [];
      this.fileChangeSequence = 0;
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
      input.placeholder = 'Ask Codex about this change. Type @ to reference patchset files. Enter to send · Ctrl+Enter for newline.';

      const mentionDropdown = document.createElement('div');
      mentionDropdown.className = 'codex-mention-dropdown hidden';

      const footer = document.createElement('div');
      footer.className = 'codex-footer';

      const stopButton = document.createElement('button');
      stopButton.className = 'codex-button outline';
      stopButton.textContent = 'Stop';
      stopButton.disabled = true;

      const reviewChangesButton = document.createElement('button');
      reviewChangesButton.className = 'codex-button outline';
      reviewChangesButton.textContent = 'Review';
      reviewChangesButton.disabled = true;

      const status = document.createElement('div');
      status.className = 'codex-status';

      const output = document.createElement('div');
      output.className = 'codex-output';
      output.setAttribute('role', 'log');
      output.setAttribute('aria-live', 'polite');

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

        const workspaceRootFallbackDirectoryInput = document.createElement('input');
        workspaceRootFallbackDirectoryInput.type = 'file';
        workspaceRootFallbackDirectoryInput.className = 'codex-workspace-root-directory-input hidden';
        workspaceRootFallbackDirectoryInput.setAttribute('webkitdirectory', '');
        workspaceRootFallbackDirectoryInput.setAttribute('mozdirectory', '');
        workspaceRootFallbackDirectoryInput.setAttribute('msdirectory', '');
        workspaceRootFallbackDirectoryInput.setAttribute('directory', '');
        workspaceRootFallbackDirectoryInput.setAttribute('multiple', '');
        workspaceRootFallbackDirectoryInput.webkitdirectory = true;
        workspaceRootFallbackDirectoryInput.directory = true;

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
        workspaceRootDialogBody.appendChild(workspaceRootFallbackDirectoryInput);
        workspaceRootDialogBody.appendChild(workspaceRootDialogActions);

        workspaceRootDialog.appendChild(workspaceRootDialogHeader);
        workspaceRootDialog.appendChild(workspaceRootDialogBody);
        workspaceRootDialogOverlay.appendChild(workspaceRootDialog);

      inputRow.appendChild(input);
      inputRow.appendChild(stopButton);
      inputRow.appendChild(reviewChangesButton);

      footer.appendChild(selectors);
      inputPanel.appendChild(inputRow);
      inputPanel.appendChild(footer);

      wrapper.appendChild(header);
      wrapper.appendChild(output);
      wrapper.appendChild(inputPanel);
      wrapper.appendChild(mentionDropdown);
      wrapper.appendChild(status);
      wrapper.appendChild(changeDialogOverlay);
      wrapper.appendChild(workspaceRootDialogOverlay);

      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `/plugins/${pluginName}/static/codex-gerrit.css`;

      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(wrapper);
      log('Panel DOM mounted. Loading models...');

      stopButton.addEventListener('click', () => this.stopChat());
      reviewChangesButton.addEventListener('click', () => this.openFileChangesDialog());
      input.addEventListener('input', () => this.handleInputChanged());
      input.addEventListener('keydown', event => this.handleInputKeydown(event));
      input.addEventListener('click', () => this.handleInputChanged());
      codespacesSelect.addEventListener('change', () => this.handleCodespacesAction());
      document.addEventListener('click', event => {
        if (!this.shadowRoot || !this.shadowRoot.contains(event.target)) {
          this.hideMentionDropdown();
        }
      });
      changeDialogClose.addEventListener('click', () => this.closeFileChangesDialog());
      changeDialogOverlay.addEventListener('click', () => this.closeFileChangesDialog());

      this.shadowRoot.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.isFileChangesDialogVisible()) {
          this.closeFileChangesDialog();
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
      this.reviewChangesButton = reviewChangesButton;
      this.headerVersion = headerVersion;
      this.changeDialogOverlay = changeDialogOverlay;
      this.changeDialogBody = changeDialogBody;
      this.workspaceRootDialogOverlay = workspaceRootDialogOverlay;
      this.workspaceRootDialogInput = workspaceRootDialogInput;
      this.workspaceRootDialogBrowse = workspaceRootDialogBrowse;
      this.workspaceRootDialogCancel = workspaceRootDialogCancel;
      this.workspaceRootDialogSave = workspaceRootDialogSave;
      this.workspaceRootFallbackDirectoryInput = workspaceRootFallbackDirectoryInput;

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

        const pluginVersion = response ? response.pluginVersion || response.plugin_version : null;
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
      } catch (err) {
        warn('Failed to load models.', err);
      }
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
        this.setStatus('Open in Browser is coming soon.');
        return;
      }
      if (action === 'open-vscode') {
        await this.openPatchsetFilesInVsCode();
        return;
      }
      if (action === 'open-trae') {
        await this.openPatchsetFilesInTrae();
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

      const directoryHandle = await this.selectDownloadDirectoryHandle('VS Code', changeId, workspaceRoot);
      if (!directoryHandle) {
        return;
      }

      try {
        const files = directoryHandle === syncedViaWorkspaceRootSentinel
            ? await this.listLatestPatchsetFilesFromGerrit(changeId, 'current')
            : await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return;
        }

        if (directoryHandle !== syncedViaWorkspaceRootSentinel) {
          this.setStatus('Downloading latest patchset files from Gerrit...');
          await this.writePatchsetFilesToDirectory(directoryHandle, files);
        }
        this.openPatchsetInVsCode(workspaceRoot, files);
        const syncLabel = directoryHandle === syncedViaWorkspaceRootSentinel ? 'Synced' : 'Downloaded';
        this.setStatus(`${syncLabel} ${files.length} patchset files and opening in VS Code...`);
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

    async selectDownloadDirectoryHandle(editorName, changeId, workspaceRoot) {
      if (!window.showDirectoryPicker) {
        return await this.syncPatchsetFilesToWorkspaceRoot(changeId, workspaceRoot, editorName);
      }
      try {
        return await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (error) {
        if (error && error.name === 'AbortError') {
          this.setStatus(`Open in ${editorName || 'editor'} canceled.`);
          return null;
        }
        if (error && error.name === 'SecurityError') {
          return await this.syncPatchsetFilesToWorkspaceRoot(changeId, workspaceRoot, editorName);
        }
        throw error;
      }
    }

    async syncPatchsetFilesToWorkspaceRoot(changeId, workspaceRoot, editorName) {
      const normalizedRoot = this.normalizePath(workspaceRoot);
      if (!normalizedRoot) {
        this.setStatus(`Open in ${editorName || 'editor'} canceled.`);
        return null;
      }
      try {
        this.setStatus(`Syncing latest patchset files to ${normalizedRoot}...`);
        const syncPath = `/changes/${encodeURIComponent(changeId)}/revisions/current/codex-patchset-sync`;
        const response = await plugin.restApi().post(syncPath, { workspaceRoot: normalizedRoot });
        const written = response && Number.isFinite(response.written) ? response.written : 0;
        if (written <= 0) {
          throw new Error('No files were synchronized.');
        }
        return syncedViaWorkspaceRootSentinel;
      } catch (syncError) {
        logError('Workspace-root sync failed, falling back to ZIP download.', syncError);
        await this.downloadLatestPatchsetFilesViaContentApi(changeId, editorName);
        return null;
      }
    }

    async downloadLatestPatchsetFilesViaContentApi(changeId, editorName) {
      if (!changeId) {
        this.setStatus('Unable to detect change id.');
        return false;
      }

      const revisionId = 'current';
      const fileSafeChangeId = String(changeId).replace(/[^A-Za-z0-9._-]+/g, '-');
      const outputFileName = `${fileSafeChangeId}-${revisionId}.zip`;

      try {
        this.setStatus('Listing latest patchset files from Gerrit...');
        const files = await this.listLatestPatchsetFilesFromGerrit(changeId, revisionId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return false;
        }

        const zipEntries = [];
        const downloadErrors = [];
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          this.setStatus(`Downloading file ${index + 1}/${files.length} via Gerrit Download Content API...`);
          try {
            const entry = await this.downloadPatchsetFileAsZipEntry(changeId, revisionId, file.path);
            if (entry) {
              zipEntries.push(entry);
            }
          } catch (fileError) {
            downloadErrors.push(`${file.path}: ${this.getErrorMessage(fileError)}`);
          }
        }

        if (zipEntries.length === 0) {
          throw new Error(downloadErrors.length > 0 ? downloadErrors.join('; ') : 'No files downloaded.');
        }

        const blob = this.createZipBlob(zipEntries);

        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = outputFileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
        if (downloadErrors.length > 0) {
          logError('Some patchset files failed to download via Download Content API.', downloadErrors);
          this.setStatus(`Downloaded ${zipEntries.length}/${files.length} files via Gerrit Download Content API as ZIP.`);
        } else {
          this.setStatus(
              `Downloaded latest patchset files via Gerrit Download Content API. Extract locally, then run Open in ${editorName || 'editor'} again.`);
        }
        return true;
      } catch (error) {
        logError('Failed to download latest patchset files via Download Content API.', error);
        this.setStatus(`Patchset download failed: ${this.getErrorMessage(error)}`);
        return false;
      }
    }

    async listLatestPatchsetFilesFromGerrit(changeId, revisionId) {
      const basePath = `/changes/${encodeURIComponent(changeId)}/revisions/${encodeURIComponent(revisionId)}/files/`;
      const fileMap = await this.getJsonFromGerrit(basePath);
      if (!fileMap || typeof fileMap !== 'object') {
        return [];
      }

      return Object.keys(fileMap)
          .filter(path => !!path && !path.startsWith('/'))
          .filter(path => !(fileMap[path] && fileMap[path].status === 'D'))
          .map(path => ({ path }))
          .sort((left, right) => left.path.localeCompare(right.path));
    }

    async downloadPatchsetFileAsZipEntry(changeId, revisionId, filePath) {
      const normalizedPath = this.normalizePath(filePath).replace(/^\/+/, '');
      if (!normalizedPath) {
        return null;
      }

      const encodedFilePath = encodeURIComponent(normalizedPath);
      const downloadPath = `/changes/${encodeURIComponent(changeId)}/revisions/${encodeURIComponent(revisionId)}/files/${encodedFilePath}/download`;
      const response = await this.fetchFromGerrit(downloadPath, { method: 'GET' }, false);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0) {
        return null;
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.indexOf('application/zip') >= 0) {
        const serverName = this.parseFilenameFromContentDisposition(response.headers.get('content-disposition'));
        const fallbackName = `${normalizedPath.split('/').pop() || 'file'}.safe.zip`;
        return {
          name: `unsafe/${serverName || fallbackName}`,
          bytes
        };
      }

      return {
        name: normalizedPath,
        bytes
      };
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

    parseFilenameFromContentDisposition(value) {
      if (!value) {
        return '';
      }
      const filenameStarMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
      if (filenameStarMatch && filenameStarMatch[1]) {
        try {
          return decodeURIComponent(filenameStarMatch[1]).replace(/^\"|\"$/g, '');
        } catch (error) {
          return filenameStarMatch[1].replace(/^\"|\"$/g, '');
        }
      }
      const filenameMatch = value.match(/filename=([^;]+)/i);
      if (!filenameMatch || !filenameMatch[1]) {
        return '';
      }
      return filenameMatch[1].trim().replace(/^\"|\"$/g, '');
    }

    createZipBlob(entries) {
      const textEncoder = new TextEncoder();
      const localParts = [];
      const centralParts = [];
      let offset = 0;

      entries.forEach(entry => {
        const fileName = this.normalizePath(entry.name).replace(/^\/+/, '');
        if (!fileName) {
          return;
        }
        const nameBytes = textEncoder.encode(fileName);
        const dataBytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes || []);
        const crc = this.computeCrc32(dataBytes);

        const localHeader = new ArrayBuffer(30 + nameBytes.length);
        const localView = new DataView(localHeader);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, 0, true);
        localView.setUint16(12, 0, true);
        localView.setUint32(14, crc >>> 0, true);
        localView.setUint32(18, dataBytes.length, true);
        localView.setUint32(22, dataBytes.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        new Uint8Array(localHeader, 30).set(nameBytes);

        localParts.push(new Uint8Array(localHeader));
        localParts.push(dataBytes);

        const centralHeader = new ArrayBuffer(46 + nameBytes.length);
        const centralView = new DataView(centralHeader);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, 0, true);
        centralView.setUint16(14, 0, true);
        centralView.setUint32(16, crc >>> 0, true);
        centralView.setUint32(20, dataBytes.length, true);
        centralView.setUint32(24, dataBytes.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, offset, true);
        new Uint8Array(centralHeader, 46).set(nameBytes);

        centralParts.push(new Uint8Array(centralHeader));

        offset += localHeader.byteLength + dataBytes.length;
      });

      const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
      const endRecord = new ArrayBuffer(22);
      const endView = new DataView(endRecord);
      const entryCount = centralParts.length;
      endView.setUint32(0, 0x06054b50, true);
      endView.setUint16(4, 0, true);
      endView.setUint16(6, 0, true);
      endView.setUint16(8, entryCount, true);
      endView.setUint16(10, entryCount, true);
      endView.setUint32(12, centralSize, true);
      endView.setUint32(16, offset, true);
      endView.setUint16(20, 0, true);

      return new Blob([...localParts, ...centralParts, new Uint8Array(endRecord)], { type: 'application/zip' });
    }

    computeCrc32(bytes) {
      let crc = 0 ^ (-1);
      for (let index = 0; index < bytes.length; index += 1) {
        crc = (crc >>> 8) ^ this.crc32Table[(crc ^ bytes[index]) & 0xff];
      }
      return (crc ^ (-1)) >>> 0;
    }

    get crc32Table() {
      if (this._crc32Table) {
        return this._crc32Table;
      }
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let value = i;
        for (let j = 0; j < 8; j += 1) {
          if ((value & 1) === 1) {
            value = 0xEDB88320 ^ (value >>> 1);
          } else {
            value >>>= 1;
          }
        }
        table[i] = value >>> 0;
      }
      this._crc32Table = table;
      return this._crc32Table;
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

      const directoryHandle = await this.selectDownloadDirectoryHandle('Cursor', changeId, workspaceRoot);
      if (!directoryHandle) {
        return;
      }

      try {
        const files = directoryHandle === syncedViaWorkspaceRootSentinel
            ? await this.listLatestPatchsetFilesFromGerrit(changeId, 'current')
            : await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return;
        }

        if (directoryHandle !== syncedViaWorkspaceRootSentinel) {
          this.setStatus('Downloading latest patchset files from Gerrit...');
          await this.writePatchsetFilesToDirectory(directoryHandle, files);
        }
        this.openPatchsetInCursor(workspaceRoot, files);
        const syncLabel = directoryHandle === syncedViaWorkspaceRootSentinel ? 'Synced' : 'Downloaded';
        this.setStatus(`${syncLabel} ${files.length} patchset files and opening in Cursor...`);
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

      const directoryHandle = await this.selectDownloadDirectoryHandle('Trae', changeId, workspaceRoot);
      if (!directoryHandle) {
        return;
      }

      try {
        const files = directoryHandle === syncedViaWorkspaceRootSentinel
            ? await this.listLatestPatchsetFilesFromGerrit(changeId, 'current')
            : await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return;
        }

        if (directoryHandle !== syncedViaWorkspaceRootSentinel) {
          this.setStatus('Downloading latest patchset files from Gerrit...');
          await this.writePatchsetFilesToDirectory(directoryHandle, files);
        }
        this.openPatchsetInTrae(workspaceRoot, files);
        const syncLabel = directoryHandle === syncedViaWorkspaceRootSentinel ? 'Synced' : 'Downloaded';
        this.setStatus(`${syncLabel} ${files.length} patchset files and opening in Trae...`);
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

      const directoryHandle = await this.selectDownloadDirectoryHandle('Android Studio', changeId, workspaceRoot);
      if (!directoryHandle) {
        return;
      }

      try {
        const files = directoryHandle === syncedViaWorkspaceRootSentinel
            ? await this.listLatestPatchsetFilesFromGerrit(changeId, 'current')
            : await this.fetchLatestPatchsetFiles(changeId);
        if (!files || files.length === 0) {
          this.setStatus('No patchset files found for this change.');
          return;
        }

        if (directoryHandle !== syncedViaWorkspaceRootSentinel) {
          this.setStatus('Downloading latest patchset files from Gerrit...');
          await this.writePatchsetFilesToDirectory(directoryHandle, files);
        }
        this.openPatchsetInAndroidStudio(workspaceRoot, files);
        const syncLabel = directoryHandle === syncedViaWorkspaceRootSentinel ? 'Synced' : 'Downloaded';
        this.setStatus(`${syncLabel} ${files.length} patchset files and opening in Android Studio...`);
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
            input.focus();
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
      if (!window.showDirectoryPicker) {
        return await this.pickWorkspaceRootPathFromFallbackChooser(currentPath);
      }

      try {
        const directoryHandle = await this.showDirectoryPickerCompat();
        if (!directoryHandle || !directoryHandle.name) {
          return '';
        }
        const guessed = this.inferWorkspaceRootFromSelection(currentPath, directoryHandle.name);
        if (!guessed) {
          return '';
        }
        this.setStatus('Directory selected from file explorer. Verify the full path, then click Save.');
        return guessed;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return '';
        }
        warn('showDirectoryPicker failed, falling back to input directory chooser.', error);
        return await this.pickWorkspaceRootPathFromFallbackChooser(currentPath);
      }
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

    pickWorkspaceRootPathFromFallbackChooser(currentPath) {
      return new Promise(resolve => {
        const fileInput = this.workspaceRootFallbackDirectoryInput;
        if (!fileInput) {
          this.setStatus('Directory picker is not available in this browser. Enter the path manually.');
          resolve('');
          return;
        }

        const finish = value => {
          fileInput.removeEventListener('change', onChange);
          window.removeEventListener('focus', onWindowFocus);
          resolve(value || '');
        };

        const onChange = () => {
          const files = fileInput.files;
          if (!files || files.length === 0) {
            fileInput.value = '';
            finish('');
            return;
          }

          const firstFile = files[0];
          const relativePath = firstFile && firstFile.webkitRelativePath ? this.normalizePath(firstFile.webkitRelativePath) : '';
          fileInput.value = '';

          if (!relativePath) {
            this.setStatus('Directory selected from file explorer. Verify the full path, then click Save.');
            finish(this.normalizePath(currentPath));
            return;
          }

          const selectedDirectoryName = relativePath.split('/').filter(Boolean)[0] || '';
          const inferredPath = this.inferWorkspaceRootFromSelection(currentPath, selectedDirectoryName);
          this.setStatus('Directory selected from file explorer. Verify the full path, then click Save.');
          finish(inferredPath);
        };

        const onWindowFocus = () => {
          window.setTimeout(() => {
            const files = fileInput.files;
            if (!files || files.length === 0) {
              fileInput.value = '';
              finish('');
            }
          }, 250);
        };

        fileInput.addEventListener('change', onChange);
        window.addEventListener('focus', onWindowFocus, { once: true });
        fileInput.click();
      });
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
        log('Submitting chat request.', { mode, postAsReview, agent, model, sessionId, contextFilesCount: contextFiles.length, path });
        const response = await plugin.restApi().post(path, {
          prompt,
          mode,
          postAsReview,
          agent,
          model,
          sessionId,
          session_id: sessionId,
          contextFiles
        });
        log('Chat REST response received.', response);
        if (response && response.reply) {
          this.appendMessage('assistant', response.reply);
          const fileChanges = this.extractFileChangesFromReply(response.reply);
          if (fileChanges.length > 0) {
            this.showFileChangesDialog(fileChanges);
            this.setStatus(`Detected ${fileChanges.length} changed file(s). Choose Keep or Undo in Review.`);
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
      if (this.reviewChangesButton) {
        this.reviewChangesButton.disabled = isBusy || this.pendingFileChanges.length === 0;
      }
    }

    extractFileChangesFromReply(reply) {
      const blocks = this.extractDiffBlocks(reply || '');
      if (blocks.length === 0) {
        return [];
      }

      const merged = new Map();
      blocks.forEach(block => {
        this.parseDiffBlock(block).forEach(change => {
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
      if (this.reviewChangesButton) {
        this.reviewChangesButton.disabled = false;
      }
    }

    isFileChangesDialogVisible() {
      return !!(this.changeDialogOverlay && !this.changeDialogOverlay.classList.contains('hidden'));
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

      lines.forEach(line => {
        if (inCodeBlock) {
          if (/^```\s*$/.test(line)) {
            flushCodeBlock();
          } else {
            codeLines.push(line);
          }
          return;
        }

        const codeFenceMatch = line.match(/^```\s*([a-zA-Z0-9_+-]+)?\s*$/);
        if (codeFenceMatch) {
          flushParagraph();
          closeLists();
          inCodeBlock = true;
          codeBlockLanguage = codeFenceMatch[1] || '';
          return;
        }

        if (/^\s*$/.test(line)) {
          flushParagraph();
          closeLists();
          return;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          flushParagraph();
          closeLists();
          const level = headingMatch[1].length;
          html.push(`<h${level}>${this.renderMarkdownInline(headingMatch[2].trim())}</h${level}>`);
          return;
        }

        if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
          flushParagraph();
          closeLists();
          html.push('<hr>');
          return;
        }

        const blockquoteMatch = line.match(/^>\s?(.*)$/);
        if (blockquoteMatch) {
          flushParagraph();
          closeLists();
          html.push(`<blockquote>${this.renderMarkdownInline(blockquoteMatch[1].trim())}</blockquote>`);
          return;
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
          return;
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
          return;
        }

        closeLists();
        paragraphLines.push(line.trim());
      });

      flushParagraph();
      closeLists();
      flushCodeBlock();

      return html.join('');
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
