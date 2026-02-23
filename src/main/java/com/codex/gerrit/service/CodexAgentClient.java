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

import com.codex.gerrit.config.CodexGerritConfig;
import com.codex.gerrit.rest.CodexInsightInput;
import com.codex.gerrit.rest.CodexInsightResponse;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

@Singleton
public class CodexAgentClient {
  private static final int MAX_OUTPUT_CHARS = 20000;
  private static final int DEBUG_FILE_PREVIEW_LIMIT = 5;
  private static final int CONNECT_TIMEOUT_MS = 10_000;
  private static final int RUN_READ_TIMEOUT_MS = 300_000;
  private static final int CONTROL_READ_TIMEOUT_MS = 15_000;
  private static final Gson GSON = new Gson();
  private static final Logger LOGGER = Logger.getLogger(CodexAgentClient.class.getName());

  private final CodexGerritConfig config;

  @Inject
  CodexAgentClient(CodexGerritConfig config) {
    this.config = config;
  }

  public String run(String prompt) throws RestApiException {
    return run(prompt, null, null);
  }

  public String run(String prompt, String model) throws RestApiException {
    return run(prompt, model, null);
  }

  public String run(String prompt, String model, String agent) throws RestApiException {
    return run(prompt, model, agent, null);
  }

  public String run(String prompt, String model, String agent, String sessionId) throws RestApiException {
    return run(prompt, model, agent, sessionId, Collections.emptyList());
  }

  public String run(
      String prompt,
      String model,
      String agent,
      String sessionId,
      List<ContextFile> contextFiles)
      throws RestApiException {
    String normalizedAgent = config.normalizeAgentOrDefault(agent);
    if (config.getCodexServeUrl().isEmpty()) {
      throw new BadRequestException("codexServeUrl is not configured");
    }

    try {
      return runOnServer(prompt, model, normalizedAgent, sessionId, contextFiles);
    } catch (IOException e) {
      throw new BadRequestException("Remote execution failed: " + e.getMessage());
    }
  }

  public void stopSession(String sessionId) throws RestApiException {
    if (config.getCodexServeUrl().isEmpty()) {
      throw new BadRequestException("codexServeUrl is not configured");
    }
    String normalizedSessionId = sessionId == null ? "" : sessionId.trim();
    if (normalizedSessionId.isEmpty()) {
      throw new BadRequestException("sessionId is required");
    }

    try {
      stopSessionOnServer(normalizedSessionId);
    } catch (IOException e) {
      throw new BadRequestException("Failed to stop session: " + e.getMessage());
    }
  }

  public List<String> getModels() throws RestApiException {
    if (config.getCodexServeUrl().isEmpty()) {
      throw new BadRequestException("codexServeUrl is not configured");
    }

    try {
      return fetchModelsFromServer();
    } catch (IOException e) {
      throw new BadRequestException("Failed to fetch models: " + e.getMessage());
    }
  }

  public List<String> getAgents() throws RestApiException {
    if (config.getCodexServeUrl().isEmpty()) {
      throw new BadRequestException("codexServeUrl is not configured");
    }

    try {
      return fetchAgentsFromServer();
    } catch (IOException e) {
      throw new BadRequestException("Failed to fetch agents: " + e.getMessage());
    }
  }

  public CodexInsightResponse runInsight(CodexInsightInput input) throws RestApiException {
    if (config.getCodexServeUrl().isEmpty()) {
      throw new BadRequestException("codexServeUrl is not configured");
    }
    if (input == null) {
      throw new BadRequestException("input is required");
    }

    if (input.files == null || input.files.isEmpty()) {
      throw new BadRequestException("files is required");
    }
    String outPath = normalizeOptionalPath(input.outPath);

    LOGGER.info(
      String.format(
        "Insight request received: files=%d, dryRun=%s, outPath=%s, include=%d, exclude=%d, envKeys=%s, filePreview=%s",
        input.files == null ? 0 : input.files.size(),
        input.dryRun,
        outPath == null ? "" : outPath,
        input.include == null ? 0 : input.include.size(),
        input.exclude == null ? 0 : input.exclude.size(),
        input.env == null ? "[]" : input.env.keySet().toString(),
        summarizeInsightInputFiles(input.files)));

    try {
      return runInsightOnServer(outPath, input);
    } catch (IOException e) {
      throw new BadRequestException("Failed to run insight: " + e.getMessage());
    }
  }

  private String runOnServer(
      String prompt,
      String model,
      String agent,
      String sessionId,
      List<ContextFile> contextFiles)
      throws IOException, RestApiException {
    URL url = new URL(config.getCodexServeUrl() + "/agent/run");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setRequestProperty("Content-Type", "application/json");
    conn.setDoOutput(true);
    conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
    conn.setReadTimeout(RUN_READ_TIMEOUT_MS);

    ArrayList<String> args = new ArrayList<>();
    if (model != null && !model.trim().isEmpty()) {
      args.add("--model");
      args.add(model.trim());
    }

    JsonObject json = new JsonObject();
    json.addProperty("agent", agent);
    json.addProperty("stdin", prompt);
    String normalizedSessionId = sessionId == null ? "" : sessionId.trim();
    if (!normalizedSessionId.isEmpty()) {
      json.addProperty("sessionId", normalizedSessionId);
    }

    json.add("args", GSON.toJsonTree(args));
    if (contextFiles != null && !contextFiles.isEmpty()) {
      json.add("contextFiles", GSON.toJsonTree(contextFiles));
    }

    String jsonInputString = GSON.toJson(json);

    try (OutputStream os = conn.getOutputStream()) {
      byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
      os.write(input, 0, input.length);
    }

    int responseCode = conn.getResponseCode();
    InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();

    StringBuilder stdoutBuilder = new StringBuilder();
    StringBuilder stderrBuilder = new StringBuilder();
    int exitCode = 0;

    if (is != null) {
      try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
        String line;
        while ((line = br.readLine()) != null) {
          if (line.trim().isEmpty()) {
            continue;
          }
          try {
            JsonObject event = GSON.fromJson(line, JsonObject.class);
            if (event.has("type")) {
              String type = event.get("type").getAsString();
              if ("stdout".equals(type)) {
                if (stdoutBuilder.length() < MAX_OUTPUT_CHARS) {
                  stdoutBuilder.append(event.get("data").getAsString());
                }
              } else if ("stderr".equals(type)) {
                if (stderrBuilder.length() < MAX_OUTPUT_CHARS) {
                  stderrBuilder.append(event.get("data").getAsString());
                }
              } else if ("exit".equals(type)) {
                exitCode = event.get("code").getAsInt();
              }
            }
          } catch (Exception e) {
            stderrBuilder.append(line).append("\n");
          }
        }
      }
    }

    if (responseCode != 200) {
      throw new BadRequestException("Remote server error " + responseCode + ": " + stderrBuilder.toString());
    }

    String stdout = stdoutBuilder.toString();
    String stderr = stderrBuilder.toString();

    if (exitCode != 0) {
      throw new BadRequestException(agent + " exited with status " + exitCode + "\n" + stderr + "\n" + stdout);
    }

    if (stdout.length() > MAX_OUTPUT_CHARS) {
      stdout = stdout.substring(0, MAX_OUTPUT_CHARS) + "\n[truncated]";
    }

    return stdout.trim();
  }

  private CodexInsightResponse runInsightOnServer(String outPath, CodexInsightInput input)
      throws IOException, RestApiException {
    URL url = new URL(config.getCodexServeUrl() + "/insight/run");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setRequestProperty("Content-Type", "application/json");
    conn.setRequestProperty("Accept", "application/json");
    conn.setDoOutput(true);
    conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
    conn.setReadTimeout(RUN_READ_TIMEOUT_MS);

    JsonObject json = new JsonObject();
    if (outPath != null && !outPath.isEmpty()) {
      json.addProperty("outPath", outPath);
    }
    JsonArray filesJson = new JsonArray();
    for (CodexInsightInput.InsightFile file : input.files) {
      if (file == null) {
        continue;
      }
      String path = file.path == null ? "" : file.path.trim();
      if (path.isEmpty()) {
        continue;
      }
      JsonObject fileJson = new JsonObject();
      fileJson.addProperty("path", path);
      if (file.base64Content != null && !file.base64Content.isEmpty()) {
        fileJson.addProperty("base64Content", file.base64Content);
      } else {
        fileJson.addProperty("content", file.content == null ? "" : file.content);
      }
      filesJson.add(fileJson);
    }
    if (filesJson.size() == 0) {
      throw new BadRequestException("files is required");
    }
    json.add("files", filesJson);

    if (input.include != null && !input.include.isEmpty()) {
      json.add("include", GSON.toJsonTree(input.include));
    }
    if (input.exclude != null && !input.exclude.isEmpty()) {
      json.add("exclude", GSON.toJsonTree(input.exclude));
    }
    if (input.maxFilesPerModule != null) {
      json.addProperty("maxFilesPerModule", input.maxFilesPerModule);
    }
    if (input.maxCharsPerFile != null) {
      json.addProperty("maxCharsPerFile", input.maxCharsPerFile);
    }
    if (input.dryRun != null) {
      json.addProperty("dryRun", input.dryRun);
    }
    if (input.env != null && !input.env.isEmpty()) {
      Map<String, String> normalizedEnv = new LinkedHashMap<>();
      for (Map.Entry<String, String> entry : input.env.entrySet()) {
        String key = entry.getKey() == null ? "" : entry.getKey().trim();
        if (key.isEmpty()) {
          continue;
        }
        String value = entry.getValue();
        normalizedEnv.put(key, value == null ? "" : value);
      }
      if (!normalizedEnv.isEmpty()) {
        json.add("env", GSON.toJsonTree(normalizedEnv));
      }
    }

    String jsonInputString = GSON.toJson(json);
    try (OutputStream os = conn.getOutputStream()) {
      byte[] payload = jsonInputString.getBytes(StandardCharsets.UTF_8);
      os.write(payload, 0, payload.length);
    }

    int responseCode = conn.getResponseCode();
    InputStream is =
        (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
    String body = readText(is);

    if (responseCode < 200 || responseCode >= 300) {
      throw new BadRequestException("Remote server error " + responseCode + ": " + body);
    }
    if (body.trim().isEmpty()) {
      throw new BadRequestException("Invalid /insight/run response from codex.serve: empty body");
    }

    JsonObject jsonBody = GSON.fromJson(body, JsonObject.class);
    if (jsonBody == null) {
      throw new BadRequestException("Invalid /insight/run response from codex.serve");
    }

    CodexInsightResponse response = new CodexInsightResponse();
    response.stdout = getAsString(jsonBody, "stdout");
    response.stderr = getAsString(jsonBody, "stderr");
    response.outputDir = getAsString(jsonBody, "outputDir");
    response.exitCode = getAsInt(jsonBody, "exit_code", 0);
    if (jsonBody.has("exitCode") && jsonBody.get("exitCode").isJsonPrimitive()) {
      response.exitCode = jsonBody.get("exitCode").getAsInt();
    }

    JsonArray files = jsonBody.has("files") && jsonBody.get("files").isJsonArray()
        ? jsonBody.getAsJsonArray("files")
        : new JsonArray();
    for (JsonElement element : files) {
      if (!element.isJsonObject()) {
        continue;
      }
      JsonObject fileObj = element.getAsJsonObject();
      String path = getAsString(fileObj, "path");
      String content = getAsString(fileObj, "content");
      if (path == null || path.trim().isEmpty()) {
        continue;
      }
      response.files.add(new CodexInsightResponse.GeneratedFile(path, content == null ? "" : content));
    }

    response.count = jsonBody.has("count") && jsonBody.get("count").isJsonPrimitive()
        ? jsonBody.get("count").getAsInt()
        : response.files.size();

    LOGGER.info(
        String.format(
            "Insight response received: httpStatus=%d, exitCode=%d, count=%d, outputDir=%s, stderrLen=%d, stdoutLen=%d, filePreview=%s",
            responseCode,
            response.exitCode,
            response.count,
            response.outputDir == null ? "" : response.outputDir,
            safeLength(response.stderr),
            safeLength(response.stdout),
            summarizeGeneratedFiles(response.files)));

    return response;
  }

  private static int safeLength(String value) {
    return value == null ? 0 : value.length();
  }

  private static String summarizeInsightInputFiles(List<CodexInsightInput.InsightFile> files) {
    if (files == null || files.isEmpty()) {
      return "[]";
    }
    StringBuilder preview = new StringBuilder("[");
    int limit = Math.min(files.size(), DEBUG_FILE_PREVIEW_LIMIT);
    for (int i = 0; i < limit; i++) {
      CodexInsightInput.InsightFile file = files.get(i);
      if (i > 0) {
        preview.append(", ");
      }
      String path = file == null || file.path == null ? "" : file.path;
      String content = file == null ? null : file.content;
      String base64Content = file == null ? null : file.base64Content;
      preview
          .append(path)
          .append("{contentLen=")
          .append(safeLength(content))
          .append(",base64Len=")
          .append(safeLength(base64Content))
          .append("}");
    }
    if (files.size() > limit) {
      preview.append(", ...+").append(files.size() - limit);
    }
    preview.append("]");
    return preview.toString();
  }

  private static String summarizeGeneratedFiles(List<CodexInsightResponse.GeneratedFile> files) {
    if (files == null || files.isEmpty()) {
      return "[]";
    }
    StringBuilder preview = new StringBuilder("[");
    int limit = Math.min(files.size(), DEBUG_FILE_PREVIEW_LIMIT);
    for (int i = 0; i < limit; i++) {
      CodexInsightResponse.GeneratedFile file = files.get(i);
      if (i > 0) {
        preview.append(", ");
      }
      String path = file == null || file.path == null ? "" : file.path;
      String content = file == null ? null : file.content;
      preview.append(path).append("{contentLen=").append(safeLength(content)).append("}");
    }
    if (files.size() > limit) {
      preview.append(", ...+").append(files.size() - limit);
    }
    preview.append("]");
    return preview.toString();
  }

  private void stopSessionOnServer(String sessionId) throws IOException, RestApiException {
    String encodedSessionId = URLEncoder.encode(sessionId, StandardCharsets.UTF_8);
    URL url = new URL(config.getCodexServeUrl() + "/sessions/" + encodedSessionId + "/stop");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setRequestProperty("Accept", "application/json");
    conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
    conn.setReadTimeout(CONTROL_READ_TIMEOUT_MS);

    int responseCode = conn.getResponseCode();
    InputStream is =
        (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
    String body = readText(is);

    if (responseCode >= 200 && responseCode < 300) {
      return;
    }

    if (responseCode == 404) {
      throw new BadRequestException("Session not found or already finished: " + sessionId);
    }

    throw new BadRequestException("Remote server error " + responseCode + ": " + body);
  }

  private List<String> fetchModelsFromServer() throws IOException, RestApiException {
    URL url = new URL(config.getCodexServeUrl() + "/models");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("GET");
    conn.setRequestProperty("Accept", "application/json");
    conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
    conn.setReadTimeout(CONTROL_READ_TIMEOUT_MS);

    int responseCode = conn.getResponseCode();
    InputStream is =
        (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
    String body = readText(is);

    if (responseCode != 200) {
      throw new BadRequestException("Remote server error " + responseCode + ": " + body);
    }

    if (body.trim().isEmpty()) {
      return Collections.emptyList();
    }

    JsonObject json = GSON.fromJson(body, JsonObject.class);
    if (json == null || !json.has("models") || !json.get("models").isJsonArray()) {
      throw new BadRequestException("Invalid /models response from codex.serve");
    }

    List<String> models = new ArrayList<>();
    for (int i = 0; i < json.getAsJsonArray("models").size(); i++) {
      if (!json.getAsJsonArray("models").get(i).isJsonPrimitive()) {
        continue;
      }
      String model = json.getAsJsonArray("models").get(i).getAsString();
      if (model == null) {
        continue;
      }
      String trimmed = model.trim();
      if (!trimmed.isEmpty()) {
        models.add(trimmed);
      }
    }
    return models;
  }

  private List<String> fetchAgentsFromServer() throws IOException, RestApiException {
    URL url = new URL(config.getCodexServeUrl() + "/agents");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("GET");
    conn.setRequestProperty("Accept", "application/json");
    conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
    conn.setReadTimeout(CONTROL_READ_TIMEOUT_MS);

    int responseCode = conn.getResponseCode();
    InputStream is =
        (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
    String body = readText(is);

    if (responseCode != 200) {
      throw new BadRequestException("Remote server error " + responseCode + ": " + body);
    }

    if (body.trim().isEmpty()) {
      return Collections.emptyList();
    }

    JsonObject json = GSON.fromJson(body, JsonObject.class);
    String field = "agents";
    if (json == null || !json.has(field) || !json.get(field).isJsonArray()) {
      throw new BadRequestException("Invalid /agents response from codex.serve");
    }

    List<String> agents = new ArrayList<>();
    for (int i = 0; i < json.getAsJsonArray(field).size(); i++) {
      if (!json.getAsJsonArray(field).get(i).isJsonPrimitive()) {
        continue;
      }
      String agent = json.getAsJsonArray(field).get(i).getAsString();
      if (agent == null) {
        continue;
      }
      String trimmed = agent.trim();
      if (!trimmed.isEmpty()) {
        agents.add(trimmed);
      }
    }
    return agents;
  }

  private static String readText(InputStream is) throws IOException {
    if (is == null) {
      return "";
    }
    StringBuilder output = new StringBuilder();
    try (BufferedReader reader =
        new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
      char[] buffer = new char[2048];
      int read;
      while ((read = reader.read(buffer)) != -1) {
        output.append(buffer, 0, read);
        if (output.length() >= MAX_OUTPUT_CHARS) {
          output.setLength(MAX_OUTPUT_CHARS);
          output.append("\n[truncated]");
          break;
        }
      }
    }
    return output.toString();
  }

  private static String normalizeRequiredPath(String value, String fieldName) throws BadRequestException {
    String normalized = value == null ? "" : value.trim();
    if (normalized.isEmpty()) {
      throw new BadRequestException(fieldName + " is required");
    }
    return normalized;
  }

  private static String normalizeOptionalPath(String value) {
    String normalized = value == null ? "" : value.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  private static String getAsString(JsonObject json, String fieldName) {
    if (json == null || !json.has(fieldName) || json.get(fieldName).isJsonNull()) {
      return null;
    }
    JsonElement element = json.get(fieldName);
    return element.isJsonPrimitive() ? element.getAsString() : null;
  }

  private static int getAsInt(JsonObject json, String fieldName, int defaultValue) {
    if (json == null || !json.has(fieldName) || !json.get(fieldName).isJsonPrimitive()) {
      return defaultValue;
    }
    try {
      return json.get(fieldName).getAsInt();
    } catch (RuntimeException ex) {
      return defaultValue;
    }
  }

  public static class ContextFile {
    public String path;
    public String content;
    public String base64Content;

    public ContextFile(String path, String content) {
      this.path = path;
      this.content = content;
      this.base64Content = null;
    }

    public static ContextFile withBase64(String path, String base64Content) {
      ContextFile file = new ContextFile(path, null);
      file.base64Content = base64Content;
      return file;
    }
  }
}
