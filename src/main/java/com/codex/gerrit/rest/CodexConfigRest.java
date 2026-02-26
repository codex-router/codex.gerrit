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

import com.codex.gerrit.config.CodexGerritConfig;
import com.codex.gerrit.service.CodexAgentClient;
import com.google.gerrit.extensions.api.GerritApi;
import com.google.gerrit.extensions.api.changes.ChangeApi;
import com.google.gerrit.extensions.api.changes.RevisionApi;
import com.google.gerrit.extensions.common.FileInfo;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestReadView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
public class CodexConfigRest implements RestReadView<RevisionResource> {
  private static final Logger logger = LoggerFactory.getLogger(CodexConfigRest.class);
  private static final List<String> HASH_COMMANDS = List.of("insight", "graph");

  private final CodexGerritConfig config;
  private final GerritApi gerritApi;
  private final CodexAgentClient agentClient;

  @Inject
  CodexConfigRest(CodexGerritConfig config, GerritApi gerritApi, CodexAgentClient agentClient) {
    this.config = config;
    this.gerritApi = gerritApi;
    this.agentClient = agentClient;
  }

  @Override
  public Response<CodexConfigResponse> apply(RevisionResource resource) throws RestApiException {
    String changeId = String.valueOf(resource.getChangeResource().getId().get());
    ChangeApi changeApi = gerritApi.changes().id(changeId);
    RevisionApi revisionApi = resolveRevisionApi(resource, changeApi);
    Map<String, FileInfo> files = revisionApi.files();

    List<String> models;
    try {
      models = agentClient.getModels();
    } catch (RestApiException e) {
      logger.warn("Failed to fetch models from codex.serve", e);
      models = Collections.emptyList();
    }

    List<String> agents;
    try {
      agents = agentClient.getAgents();
    } catch (RestApiException e) {
      logger.warn("Failed to fetch agents from codex.serve", e);
      agents = Collections.emptyList();
    }

    return Response.ok(
      new CodexConfigResponse(models, agents, getPluginVersion(), normalizeFiles(files), HASH_COMMANDS));
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

  private String getPluginVersion() {
    String implementationVersion = getClass().getPackage().getImplementationVersion();
    return implementationVersion == null ? "" : implementationVersion;
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

  public static class CodexConfigResponse {
    public List<String> models;
    public List<String> agents;
    public String pluginVersion;
    public List<String> patchsetFiles;
    public List<String> hashCommands;

    public CodexConfigResponse(
        List<String> models,
        List<String> agents,
        String pluginVersion,
        List<String> patchsetFiles,
        List<String> hashCommands) {
      this.models = models;
      this.agents = agents;
      this.pluginVersion = pluginVersion;
      this.patchsetFiles = patchsetFiles;
      this.hashCommands = hashCommands;
    }
  }
}
