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
import com.codex.gerrit.service.CodexPromptBuilder;
import com.codex.gerrit.service.CodexReviewPoster;
import com.google.gerrit.extensions.api.GerritApi;
import com.google.gerrit.extensions.api.changes.ChangeApi;
import com.google.gerrit.extensions.common.ChangeInfo;
import com.google.gerrit.extensions.common.FileInfo;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestModifyView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
public class CodexChatRest implements RestModifyView<RevisionResource, CodexChatInput> {
  private static final Logger logger = LoggerFactory.getLogger(CodexChatRest.class);

  private final CodexGerritConfig config;
  private final GerritApi gerritApi;
  private final CodexAgentClient agentClient;
  private final CodexPromptBuilder promptBuilder;
  private final CodexReviewPoster reviewPoster;

  @Inject
  CodexChatRest(
      CodexGerritConfig config,
      GerritApi gerritApi,
      CodexAgentClient agentClient,
      CodexPromptBuilder promptBuilder,
      CodexReviewPoster reviewPoster) {
    this.config = config;
    this.gerritApi = gerritApi;
    this.agentClient = agentClient;
    this.promptBuilder = promptBuilder;
    this.reviewPoster = reviewPoster;
  }

  @Override
  public Response<CodexChatResponse> apply(RevisionResource resource, CodexChatInput input)
      throws RestApiException {
    String changeId = String.valueOf(resource.getChangeResource().getId().get());

    ChangeApi changeApi = gerritApi.changes().id(changeId);
    ChangeInfo changeInfo = changeApi.get();
    Map<String, FileInfo> files = changeApi.current().files();
    CodexChatInput normalized = normalizeInput(input, files);

    String prompt = promptBuilder.buildPrompt(changeInfo, files, normalized);
    String reply = agentClient.run(prompt, normalized.model, normalized.agent, normalized.sessionId);

    if (normalized.postAsReview) {
      try {
        reviewPoster.postReview(changeId, reply, normalized.mode);
      } catch (RestApiException ex) {
        logger.warn("Failed to post review for change {}", changeId, ex);
      }
    }

    return Response.ok(new CodexChatResponse(reply, normalized.mode, config.getGerritBotUser()));
  }

  private CodexChatInput normalizeInput(CodexChatInput input, Map<String, FileInfo> files)
      throws BadRequestException {
    if (input == null) {
      throw new BadRequestException("Missing request body");
    }
    String prompt = input.prompt == null ? "" : input.prompt.trim();
    if (prompt.isEmpty()) {
      throw new BadRequestException("prompt is required");
    }
    CodexChatInput normalized = new CodexChatInput();
    normalized.prompt = prompt;
    normalized.mode = normalizeMode(input.mode);
    normalized.postAsReview = input.postAsReview;
    String requestedAgent = input.agent != null ? input.agent : input.cli;
    normalized.agent = config.normalizeAgentOrDefault(requestedAgent);
    normalized.model = normalizeModel(input.model);
    normalized.sessionId = normalizeSessionId(input.sessionId);
    normalized.contextFiles = normalizeContextFiles(input.contextFiles, files);
    return normalized;
  }

  private static String normalizeSessionId(String sessionId) {
    return normalizeOptionalText(sessionId);
  }

  private static String normalizeOptionalText(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  private static List<String> normalizeContextFiles(
      List<String> contextFiles, Map<String, FileInfo> files) {
    if (contextFiles == null || contextFiles.isEmpty() || files == null || files.isEmpty()) {
      return new ArrayList<>();
    }
    Set<String> availableFiles = new HashSet<>();
    for (String file : files.keySet()) {
      if (file == null || file.isEmpty() || file.startsWith("/")) {
        continue;
      }
      availableFiles.add(file);
    }
    List<String> normalized = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    for (String selectedFile : contextFiles) {
      if (selectedFile == null) {
        continue;
      }
      String trimmed = selectedFile.trim();
      if (trimmed.isEmpty()) {
        continue;
      }
      if (availableFiles.contains(trimmed) && seen.add(trimmed)) {
        normalized.add(trimmed);
      }
    }
    return normalized;
  }

  private static String normalizeMode(String mode) {
    if (mode == null) {
      return "chat";
    }
    String normalized = mode.trim().toLowerCase();
    if (normalized.isEmpty()) {
      return "chat";
    }
    if (!"chat".equals(normalized)
        && !"review".equals(normalized)
        && !"generate".equals(normalized)) {
      return "chat";
    }
    return normalized;
  }

  private static String normalizeModel(String model) {
    if (model == null) {
      return null;
    }
    String normalized = model.trim();
    if (normalized.isEmpty()) {
      return null;
    }
    String lower = normalized.toLowerCase();
    if ("default".equals(lower)) {
      return null;
    }
    return normalized;
  }
}
