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

package com.codex.gerrit.service;

import com.google.gerrit.extensions.api.GerritApi;
import com.google.gerrit.extensions.api.changes.ChangeEditApi;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.ArrayList;
import java.util.List;

@Singleton
public class CodexPatchsetApplier {
  private static final String BEGIN_FILE = "BEGIN_FILE ";
  private static final String END_FILE = "END_FILE";
  private static final String DELETE_FILE = "DELETE_FILE ";
  private static final String BEGIN_SUMMARY = "BEGIN_SUMMARY";
  private static final String END_SUMMARY = "END_SUMMARY";
  private static final String BEGIN_COMMIT = "BEGIN_COMMIT_MESSAGE";
  private static final String END_COMMIT = "END_COMMIT_MESSAGE";

  private final GerritApi gerritApi;

  @Inject
  CodexPatchsetApplier(GerritApi gerritApi) {
    this.gerritApi = gerritApi;
  }

  public PatchsetApplyResult apply(String changeId, String reply) throws RestApiException {
    PatchsetPayload payload = parse(reply);
    if (payload.updates.isEmpty() && payload.deletes.isEmpty()) {
      throw new BadRequestException("No file updates found in Codex output");
    }

    ChangeEditApi editApi = gerritApi.changes().id(changeId).edit();
    ensureEditReady(editApi);

    for (FileUpdate update : payload.updates) {
      editApi.modifyFile(update.path, new StringRawInput(update.content));
    }
    for (String deletePath : payload.deletes) {
      editApi.deleteFile(deletePath);
    }
    if (payload.commitMessage != null && !payload.commitMessage.isEmpty()) {
      editApi.modifyCommitMessage(payload.commitMessage);
    }

    editApi.publish();
    return PatchsetApplyResult.fromPayload(payload);
  }

  private void ensureEditReady(ChangeEditApi editApi) throws RestApiException {
    try {
      editApi.create();
    } catch (RestApiException ex) {
      editApi.delete();
      editApi.create();
    }
  }

  private PatchsetPayload parse(String reply) throws BadRequestException {
    PatchsetPayload payload = new PatchsetPayload();
    String[] lines = reply.split("\\r?\\n", -1);
    int index = 0;
    while (index < lines.length) {
      String line = lines[index];
      if (line.startsWith(BEGIN_FILE)) {
        String path = line.substring(BEGIN_FILE.length()).trim();
        validatePath(path);
        StringBuilder content = new StringBuilder();
        index++;
        while (index < lines.length && !END_FILE.equals(lines[index])) {
          if (content.length() > 0) {
            content.append("\n");
          }
          content.append(lines[index]);
          index++;
        }
        if (index >= lines.length) {
          throw new BadRequestException("Missing END_FILE for " + path);
        }
        payload.updates.add(new FileUpdate(path, content.toString()));
      } else if (line.startsWith(DELETE_FILE)) {
        String path = line.substring(DELETE_FILE.length()).trim();
        validatePath(path);
        payload.deletes.add(path);
      } else if (BEGIN_COMMIT.equals(line)) {
        StringBuilder message = new StringBuilder();
        index++;
        while (index < lines.length && !END_COMMIT.equals(lines[index])) {
          if (message.length() > 0) {
            message.append("\n");
          }
          message.append(lines[index]);
          index++;
        }
        if (index >= lines.length) {
          throw new BadRequestException("Missing END_COMMIT_MESSAGE");
        }
        payload.commitMessage = message.toString().trim();
      } else if (BEGIN_SUMMARY.equals(line)) {
        StringBuilder summary = new StringBuilder();
        index++;
        while (index < lines.length && !END_SUMMARY.equals(lines[index])) {
          if (summary.length() > 0) {
            summary.append("\n");
          }
          summary.append(lines[index]);
          index++;
        }
        if (index >= lines.length) {
          throw new BadRequestException("Missing END_SUMMARY");
        }
        payload.summary = summary.toString().trim();
      }
      index++;
    }

    return payload;
  }

  private void validatePath(String path) throws BadRequestException {
    if (path.isEmpty() || path.startsWith("/") || path.contains("..")) {
      throw new BadRequestException("Invalid file path: " + path);
    }
  }

  private static class PatchsetPayload {
    private final List<FileUpdate> updates = new ArrayList<>();
    private final List<String> deletes = new ArrayList<>();
    private String summary;
    private String commitMessage;
  }

  private static class FileUpdate {
    private final String path;
    private final String content;

    private FileUpdate(String path, String content) {
      this.path = path;
      this.content = content;
    }
  }

  public static class PatchsetApplyResult {
    private final String summary;
    private final List<String> updatedFiles;
    private final List<String> deletedFiles;

    private PatchsetApplyResult(String summary, List<String> updatedFiles, List<String> deletedFiles) {
      this.summary = summary;
      this.updatedFiles = updatedFiles;
      this.deletedFiles = deletedFiles;
    }

    public String getSummary() {
      return summary;
    }

    public String getReviewMessage() {
      StringBuilder builder = new StringBuilder();
      builder.append("Codex patchset applied.");
      if (summary != null && !summary.isEmpty()) {
        builder.append("\n").append(summary);
      }
      if (!updatedFiles.isEmpty()) {
        builder.append("\nUpdated: ").append(String.join(", ", updatedFiles));
      }
      if (!deletedFiles.isEmpty()) {
        builder.append("\nDeleted: ").append(String.join(", ", deletedFiles));
      }
      return builder.toString();
    }

    private static PatchsetApplyResult fromPayload(PatchsetPayload payload) {
      List<String> updated = new ArrayList<>();
      for (FileUpdate update : payload.updates) {
        updated.add(update.path);
      }
      return new PatchsetApplyResult(payload.summary, updated, payload.deletes);
    }
  }
}
