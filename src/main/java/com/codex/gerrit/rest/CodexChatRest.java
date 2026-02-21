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
import com.google.gerrit.extensions.restapi.BinaryResult;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.ResourceConflictException;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestModifyView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
  private static final int MAX_CONTEXT_FILES_TO_READ = 20;
  private static final int MAX_CONTEXT_FILE_CHARS = 12_000;

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
    List<CodexAgentClient.ContextFile> contextFiles = loadContextFiles(changeApi, normalized.contextFiles);
    List<CodexAgentClient.ContextFile> attachedContextFiles = buildAttachedContextFiles(normalized.attachedFiles);
    List<CodexAgentClient.ContextFile> allContextFiles = mergeContextFileLists(contextFiles, attachedContextFiles);

    String prompt = promptBuilder.buildPrompt(changeInfo, files, normalized);
    String reply =
      agentClient.run(prompt, normalized.model, normalized.agent, normalized.sessionId, allContextFiles);

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
    List<String> selectedContextFiles = normalizeContextFiles(input.contextFiles, files);
    List<String> mentionedContextFiles = normalizeContextFilesFromPrompt(prompt, files);
    normalized.contextFiles = mergeContextFiles(selectedContextFiles, mentionedContextFiles);
    normalized.attachedFiles = normalizeAttachedFiles(input.attachedFiles);
    return normalized;
  }

  private static List<CodexChatInput.AttachedFile> normalizeAttachedFiles(
      List<CodexChatInput.AttachedFile> attachedFiles) {
    if (attachedFiles == null || attachedFiles.isEmpty()) {
      return new ArrayList<>();
    }
    List<CodexChatInput.AttachedFile> normalized = new ArrayList<>();
    for (CodexChatInput.AttachedFile af : attachedFiles) {
      if (af == null) {
        continue;
      }
      String name = af.name == null ? "" : af.name.trim();
      if (name.isEmpty()) {
        continue;
      }
      boolean hasContent = af.content != null && !af.content.isEmpty();
      boolean hasBase64 = af.base64Content != null && !af.base64Content.trim().isEmpty();
      if (!hasContent && !hasBase64) {
        continue;
      }
      CodexChatInput.AttachedFile normAf = new CodexChatInput.AttachedFile();
      normAf.name = name;
      normAf.content = af.content;
      normAf.base64Content = hasBase64 ? af.base64Content.trim() : null;
      normalized.add(normAf);
    }
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
    if (contextFiles == null || contextFiles.isEmpty()) {
      return new ArrayList<>();
    }
    Set<String> availableFiles = collectAvailableFiles(files);
    if (availableFiles.isEmpty()) {
      return new ArrayList<>();
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

  private static List<String> normalizeContextFilesFromPrompt(String prompt, Map<String, FileInfo> files) {
    if (prompt == null || prompt.isEmpty()) {
      return new ArrayList<>();
    }
    Set<String> availableFiles = collectAvailableFiles(files);
    if (availableFiles.isEmpty()) {
      return new ArrayList<>();
    }
    List<String> normalized = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    String[] tokens = prompt.split("\\s+");
    for (String token : tokens) {
      if (token == null || token.isEmpty() || !token.startsWith("@")) {
        continue;
      }
      String candidate = token.substring(1).replaceAll("[\\]\\[(){}.,!?;:]+$", "");
      if (candidate.isEmpty()) {
        continue;
      }
      if (availableFiles.contains(candidate) && seen.add(candidate)) {
        normalized.add(candidate);
      }
    }
    return normalized;
  }

  private static List<String> mergeContextFiles(List<String> selected, List<String> mentioned) {
    List<String> merged = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    for (String file : selected) {
      if (file != null && seen.add(file)) {
        merged.add(file);
      }
    }
    for (String file : mentioned) {
      if (file != null && seen.add(file)) {
        merged.add(file);
      }
    }
    return merged;
  }

  private static Set<String> collectAvailableFiles(Map<String, FileInfo> files) {
    Set<String> availableFiles = new HashSet<>();
    if (files == null || files.isEmpty()) {
      return availableFiles;
    }
    for (String file : files.keySet()) {
      if (file == null || file.isEmpty() || file.startsWith("/")) {
        continue;
      }
      availableFiles.add(file);
    }
    return availableFiles;
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

  private List<CodexAgentClient.ContextFile> buildAttachedContextFiles(
      List<CodexChatInput.AttachedFile> attachedFiles) {
    if (attachedFiles == null || attachedFiles.isEmpty()) {
      return new ArrayList<>();
    }
    List<CodexAgentClient.ContextFile> resolved = new ArrayList<>();
    for (CodexChatInput.AttachedFile af : attachedFiles) {
      if (af == null) {
        continue;
      }
      String name = af.name == null ? "" : af.name.trim();
      if (name.isEmpty()) {
        continue;
      }
      String text = null;
      String base64Content = null;
      if (af.base64Content != null && !af.base64Content.trim().isEmpty()) {
        base64Content = af.base64Content.trim();
      } else if (af.content != null) {
        text = af.content;
      } else {
        continue;
      }

      if (text != null && text.length() > MAX_CONTEXT_FILE_CHARS) {
        text = text.substring(0, MAX_CONTEXT_FILE_CHARS)
            + "\n\n[truncated by codex.gerrit context limit]";
      }

      if (base64Content != null) {
        resolved.add(CodexAgentClient.ContextFile.withBase64(name, base64Content));
      } else {
        resolved.add(new CodexAgentClient.ContextFile(name, text));
      }
    }
    return resolved;
  }

  private static List<CodexAgentClient.ContextFile> mergeContextFileLists(
      List<CodexAgentClient.ContextFile> primary,
      List<CodexAgentClient.ContextFile> secondary) {
    List<CodexAgentClient.ContextFile> merged = new ArrayList<>(primary);
    Set<String> seen = new HashSet<>();
    for (CodexAgentClient.ContextFile cf : primary) {
      if (cf != null && cf.path != null) {
        seen.add(cf.path);
      }
    }
    for (CodexAgentClient.ContextFile cf : secondary) {
      if (cf != null && cf.path != null && seen.add(cf.path)) {
        merged.add(cf);
      }
    }
    return merged;
  }

  private List<CodexAgentClient.ContextFile> loadContextFiles(
      ChangeApi changeApi, List<String> selectedFiles) {
    if (selectedFiles == null || selectedFiles.isEmpty()) {
      return new ArrayList<>();
    }

    List<CodexAgentClient.ContextFile> resolved = new ArrayList<>();
    int limit = Math.min(selectedFiles.size(), MAX_CONTEXT_FILES_TO_READ);
    for (int index = 0; index < limit; index++) {
      String filePath = selectedFiles.get(index);
      if (filePath == null || filePath.trim().isEmpty()) {
        continue;
      }
      try {
        String content = readRevisionFileText(changeApi, filePath);
        resolved.add(new CodexAgentClient.ContextFile(filePath, content));
      } catch (RestApiException ex) {
        logger.warn("Failed to load context file {}", filePath, ex);
      }
    }
    return resolved;
  }

  private String readRevisionFileText(ChangeApi changeApi, String filePath) throws RestApiException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (BinaryResult binaryResult = changeApi.current().file(filePath).content()) {
      binaryResult.writeTo(output);
    } catch (IOException ioException) {
      throw new ResourceConflictException(
          "Failed to read file content for " + filePath + ": " + ioException.getMessage());
    }

    String text = new String(output.toByteArray(), StandardCharsets.UTF_8);
    if (text.length() <= MAX_CONTEXT_FILE_CHARS) {
      return text;
    }
    return text.substring(0, MAX_CONTEXT_FILE_CHARS)
        + "\n\n[truncated by codex.gerrit context limit]";
  }
}
