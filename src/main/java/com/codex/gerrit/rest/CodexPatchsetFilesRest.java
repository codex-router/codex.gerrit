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

import com.google.gerrit.extensions.api.GerritApi;
import com.google.gerrit.extensions.api.changes.ChangeApi;
import com.google.gerrit.extensions.api.changes.RevisionApi;
import com.google.gerrit.extensions.common.FileInfo;
import com.google.gerrit.extensions.restapi.BinaryResult;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.ResourceConflictException;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestReadView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
public class CodexPatchsetFilesRest implements RestReadView<RevisionResource> {
  private static final Logger logger = LoggerFactory.getLogger(CodexPatchsetFilesRest.class);

  private final GerritApi gerritApi;

  @Inject
  CodexPatchsetFilesRest(GerritApi gerritApi) {
    this.gerritApi = gerritApi;
  }

  @Override
  public Response<CodexPatchsetFilesResponse> apply(RevisionResource resource) throws RestApiException {
    String changeId = String.valueOf(resource.getChangeResource().getId().get());
    ChangeApi changeApi = gerritApi.changes().id(changeId);
    RevisionApi revisionApi = resolveRevisionApi(resource, changeApi);
    Map<String, FileInfo> files = revisionApi.files();

    List<String> normalizedFiles = normalizeFiles(files);
    List<CodexPatchsetFileContent> resultFiles = new ArrayList<>();

    for (String filePath : normalizedFiles) {
      String base64Content = readFileAsBase64(revisionApi, filePath);
      resultFiles.add(new CodexPatchsetFileContent(filePath, base64Content));
    }

    return Response.ok(new CodexPatchsetFilesResponse(resultFiles));
  }

  private String readFileAsBase64(RevisionApi revisionApi, String filePath) throws RestApiException {
    try {
      ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
      try (BinaryResult binaryResult = revisionApi.file(filePath).content()) {
        binaryResult.writeTo(outputStream);
      }
      byte[] bytes = outputStream.toByteArray();
      return Base64.getEncoder().encodeToString(bytes);
    } catch (IOException ioException) {
      logger.warn("Failed to read patchset file content for {}", filePath, ioException);
      throw new ResourceConflictException(
          "Failed to read patchset file content for " + filePath);
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

  private RevisionApi resolveRevisionApi(RevisionResource resource, ChangeApi changeApi)
      throws RestApiException {
    String revisionId = resolveRevisionId(resource);
    if (revisionId == null || revisionId.isEmpty()) {
      return changeApi.current();
    }
    return changeApi.revision(revisionId);
  }

  private String resolveRevisionId(RevisionResource resource) {
    if (resource == null) {
      return null;
    }

    Object patchSet = invokeNoArg(resource, "getPatchSet", "patchSet");
    Object commitId = invokeNoArg(patchSet, "commitId", "getCommitId");
    String revisionFromCommit = normalizeRevisionId(invokeNoArg(commitId, "name", "getName"));
    if (revisionFromCommit != null) {
      return revisionFromCommit;
    }

    Object patchSetId = invokeNoArg(patchSet, "id", "getId");
    String revisionFromPatchsetNumber = normalizeRevisionId(invokeNoArg(patchSetId, "get", "id", "getId"));
    if (revisionFromPatchsetNumber != null) {
      return revisionFromPatchsetNumber;
    }

    return null;
  }

  private static Object invokeNoArg(Object target, String... methodNames) {
    if (target == null || methodNames == null || methodNames.length == 0) {
      return null;
    }

    for (String methodName : methodNames) {
      if (methodName == null || methodName.isEmpty()) {
        continue;
      }
      Object result = invokeNoArgSingle(target, methodName);
      if (result != null) {
        return result;
      }
    }
    return null;
  }

  private static Object invokeNoArgSingle(Object target, String methodName) {
    try {
      return target.getClass().getMethod(methodName).invoke(target);
    } catch (ReflectiveOperationException ignored) {
      // Fall through and retry declared methods.
    }

    Class<?> currentClass = target.getClass();
    while (currentClass != null) {
      try {
        java.lang.reflect.Method declaredMethod = currentClass.getDeclaredMethod(methodName);
        declaredMethod.setAccessible(true);
        return declaredMethod.invoke(target);
      } catch (ReflectiveOperationException | RuntimeException ignored) {
        currentClass = currentClass.getSuperclass();
      }
    }
    return null;
  }

  private static String normalizeRevisionId(Object value) {
    if (value == null) {
      return null;
    }
    String normalized = String.valueOf(value).trim();
    return normalized.isEmpty() ? null : normalized;
  }

  public static class CodexPatchsetFilesResponse {
    public List<CodexPatchsetFileContent> files;

    public CodexPatchsetFilesResponse(List<CodexPatchsetFileContent> files) {
      this.files = files;
    }
  }

  public static class CodexPatchsetFileContent {
    public String path;
    public String contentBase64;

    public CodexPatchsetFileContent(String path, String contentBase64) {
      this.path = path;
      this.contentBase64 = contentBase64;
    }
  }
}
