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
import com.google.gerrit.extensions.api.changes.ChangeApi;
import com.google.gerrit.extensions.api.changes.ChangeEditApi;
import com.google.gerrit.extensions.common.ChangeInfo;
import com.google.gerrit.extensions.common.FileInfo;
import com.google.gerrit.extensions.common.RevisionInfo;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.BinaryResult;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.io.IOException;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@Singleton
public class CodexPatchsetReverter {
  private final GerritApi gerritApi;

  @Inject
  CodexPatchsetReverter(GerritApi gerritApi) {
    this.gerritApi = gerritApi;
  }

  public String revertLatestPatchset(String changeId) throws RestApiException {
    ChangeApi changeApi = gerritApi.changes().id(changeId);
    ChangeInfo changeInfo = changeApi.get();
    String currentRevisionId = changeInfo.currentRevision;
    String previousRevisionId = findPreviousRevisionId(changeInfo, currentRevisionId);

    if (previousRevisionId == null || previousRevisionId.isEmpty()) {
      throw new BadRequestException("No previous patchset exists to revert to");
    }

    Map<String, FileInfo> currentFiles = changeApi.revision(currentRevisionId).files();
    Map<String, FileInfo> previousFiles = changeApi.revision(previousRevisionId).files();

    ChangeEditApi editApi = changeApi.edit();
    ensureEditReady(editApi);

    int updatedCount = 0;
    int deletedCount = 0;

    Set<String> allFiles = new HashSet<>();
    allFiles.addAll(currentFiles.keySet());
    allFiles.addAll(previousFiles.keySet());

    for (String path : allFiles) {
      if (!isPatchsetFile(path)) {
        continue;
      }

      boolean existsInCurrent = currentFiles.containsKey(path);
      boolean existsInPrevious = previousFiles.containsKey(path);

      if (!existsInPrevious && existsInCurrent) {
        editApi.deleteFile(path);
        deletedCount++;
        continue;
      }

      if (existsInPrevious) {
        String previousContent = readFileContent(changeApi, previousRevisionId, path);
        if (!existsInCurrent) {
          editApi.modifyFile(path, new StringRawInput(previousContent));
          updatedCount++;
          continue;
        }
        String currentContent = readFileContent(changeApi, currentRevisionId, path);
        if (!previousContent.equals(currentContent)) {
          editApi.modifyFile(path, new StringRawInput(previousContent));
          updatedCount++;
        }
      }
    }

    if (updatedCount == 0 && deletedCount == 0) {
      editApi.delete();
      throw new BadRequestException("Latest patchset has no reversible file changes");
    }

    editApi.publish();

    return String.format(
        "Reversed latest patchset by restoring patchset %s state. Updated: %d, Deleted: %d.",
        previousRevisionId, updatedCount, deletedCount);
  }

  private static boolean isPatchsetFile(String path) {
    return path != null && !path.isEmpty() && !path.startsWith("/");
  }

  private static String findPreviousRevisionId(ChangeInfo changeInfo, String currentRevisionId) {
    if (changeInfo == null
        || changeInfo.revisions == null
        || changeInfo.revisions.isEmpty()
        || currentRevisionId == null
        || currentRevisionId.isEmpty()) {
      return null;
    }

    RevisionInfo current = changeInfo.revisions.get(currentRevisionId);
    if (current == null) {
      return null;
    }

    int currentNumber = current._number;
    String previousRevisionId = null;
    int previousNumber = -1;

    for (Map.Entry<String, RevisionInfo> entry : changeInfo.revisions.entrySet()) {
      RevisionInfo revision = entry.getValue();
      if (revision == null) {
        continue;
      }
      int revisionNumber = revision._number;
      if (revisionNumber < currentNumber && revisionNumber > previousNumber) {
        previousNumber = revisionNumber;
        previousRevisionId = entry.getKey();
      }
    }

    return previousRevisionId;
  }

  private static String readFileContent(ChangeApi changeApi, String revisionId, String path)
      throws RestApiException {
    BinaryResult contentResult = changeApi.revision(revisionId).file(path).content();
    try {
      return contentResult.asString();
    } catch (IOException ex) {
      throw new BadRequestException(
          String.format(
              "Failed to read content for file '%s' at revision '%s': %s",
              path, revisionId, ex.getMessage()));
    }
  }

  private static void ensureEditReady(ChangeEditApi editApi) throws RestApiException {
    try {
      editApi.create();
    } catch (RestApiException ex) {
      editApi.delete();
      editApi.create();
    }
  }
}