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
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gson.Gson;
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
import java.util.List;

@Singleton
public class CodexAgentClient {
  private static final int MAX_OUTPUT_CHARS = 20000;
  private static final int CONNECT_TIMEOUT_MS = 10_000;
  private static final int RUN_READ_TIMEOUT_MS = 300_000;
  private static final int CONTROL_READ_TIMEOUT_MS = 15_000;
  private static final Gson GSON = new Gson();

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

    private String runOnServer(
      String prompt,
      String model,
      String agent,
      String sessionId,
      List<ContextFile> contextFiles)
      throws IOException, RestApiException {
    URL url = new URL(config.getCodexServeUrl() + "/run");
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
