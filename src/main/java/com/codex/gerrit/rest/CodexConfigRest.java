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
    Map<String, FileInfo> files = changeApi.current().files();

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

    agents = ensureDefaultAgentPresent(agents, config.getDefaultAgent());

    return Response.ok(
        new CodexConfigResponse(
            models,
            agents,
            config.getDefaultAgent(),
            getPluginVersion(),
            normalizeFiles(files)));
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

  private static List<String> ensureDefaultAgentPresent(List<String> agents, String defaultAgent) {
    String normalizedDefault = defaultAgent == null ? "" : defaultAgent.trim().toLowerCase();
    if (normalizedDefault.isEmpty()) {
      normalizedDefault = "codex";
    }

    List<String> result = new ArrayList<>();
    if (agents != null) {
      for (String agent : agents) {
        if (agent == null) {
          continue;
        }
        String trimmed = agent.trim();
        if (!trimmed.isEmpty()) {
          result.add(trimmed);
        }
      }
    }

    if (!result.contains(normalizedDefault)) {
      result.add(0, normalizedDefault);
    }
    return result;
  }

  private String getPluginVersion() {
    String implementationVersion = getClass().getPackage().getImplementationVersion();
    return implementationVersion == null ? "" : implementationVersion;
  }

  public static class CodexConfigResponse {
    public List<String> models;
    public List<String> agents;
    public String defaultAgent;
    public String pluginVersion;
    public List<String> patchsetFiles;

    public CodexConfigResponse(
        List<String> models,
        List<String> agents,
        String defaultAgent,
        String pluginVersion,
        List<String> patchsetFiles) {
      this.models = models;
      this.agents = agents;
      this.defaultAgent = defaultAgent;
      this.pluginVersion = pluginVersion;
      this.patchsetFiles = patchsetFiles;
    }
  }
}
