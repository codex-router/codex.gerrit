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

package com.codex.gerrit.rest;

import com.codex.gerrit.service.CodexAgentClient;
import com.google.gerrit.extensions.api.GerritApi;
import com.google.gerrit.extensions.api.changes.ChangeApi;
import com.google.gerrit.extensions.api.changes.RevisionApi;
import com.google.gerrit.extensions.common.FileInfo;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.BinaryResult;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.ResourceConflictException;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestModifyView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
public class CodexPatchsetSyncRest implements RestModifyView<RevisionResource, CodexPatchsetSyncInput> {
  private static final Logger logger = LoggerFactory.getLogger(CodexPatchsetSyncRest.class);

  private final GerritApi gerritApi;
  private final CodexAgentClient agentClient;

  @Inject
  CodexPatchsetSyncRest(GerritApi gerritApi, CodexAgentClient agentClient) {
    this.gerritApi = gerritApi;
    this.agentClient = agentClient;
  }

  @Override
  public Response<CodexPatchsetSyncResponse> apply(RevisionResource resource, CodexPatchsetSyncInput input)
      throws RestApiException {
    if (input == null || input.workspaceRoot == null || input.workspaceRoot.trim().isEmpty()) {
      throw new BadRequestException("workspaceRoot is required");
    }

    String changeId = String.valueOf(resource.getChangeResource().getId().get());
    ChangeApi changeApi = gerritApi.changes().id(changeId);
    RevisionApi revisionApi = changeApi.current();
    Map<String, FileInfo> files = revisionApi.files();

    List<String> normalizedFiles = normalizeFiles(files);
    List<CodexAgentClient.WorkspaceSyncFile> syncFiles = new ArrayList<>();
    for (String filePath : normalizedFiles) {
      syncFiles.add(new CodexAgentClient.WorkspaceSyncFile(filePath, readFileContent(revisionApi, filePath)));
    }

    CodexAgentClient.WorkspaceSyncResult result =
        agentClient.syncWorkspaceFiles(input.workspaceRoot.trim(), syncFiles);

    return Response.ok(new CodexPatchsetSyncResponse(result.written, normalizedFiles.size()));
  }

  private byte[] readFileContent(RevisionApi revisionApi, String filePath) throws RestApiException {
    try {
      ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
      try (BinaryResult binaryResult = revisionApi.file(filePath).content()) {
        binaryResult.writeTo(outputStream);
      }
      return outputStream.toByteArray();
    } catch (IOException ioException) {
      logger.warn("Failed to read patchset file content for {}", filePath, ioException);
      throw new ResourceConflictException("Failed to read patchset file content for " + filePath);
    }
  }

  private static List<String> normalizeFiles(Map<String, FileInfo> files) {
    List<String> result = new ArrayList<>();
    for (String file : files.keySet()) {
      if (file == null || file.isEmpty() || file.startsWith("/")) {
        continue;
      }
      result.add(file);
    }
    Collections.sort(result);
    return result;
  }

  public static class CodexPatchsetSyncResponse {
    public int written;
    public int total;

    public CodexPatchsetSyncResponse(int written, int total) {
      this.written = written;
      this.total = total;
    }
  }
}
