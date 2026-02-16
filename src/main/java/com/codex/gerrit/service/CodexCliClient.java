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
import com.google.inject.Inject;
import com.google.inject.Singleton;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;


@Singleton
public class CodexCliClient {
  private static final int MAX_OUTPUT_CHARS = 20000;
  private static final Gson GSON = new Gson();

  private final CodexGerritConfig config;

  @Inject
  CodexCliClient(CodexGerritConfig config) {
    this.config = config;
  }

  public String run(String prompt) throws RestApiException {
    return run(prompt, null, null);
  }

  public String run(String prompt, String model) throws RestApiException {
    return run(prompt, model, null);
  }

  public String run(String prompt, String model, String cli) throws RestApiException {
    String normalizedCli = config.normalizeCliOrDefault(cli);
    if (config.getCodexServeUrl().isEmpty()) {
      throw new BadRequestException("codexServeUrl is not configured");
    }

    try {
      return runOnServer(prompt, model, normalizedCli);
    } catch (IOException e) {
      throw new BadRequestException("Remote execution failed: " + e.getMessage());
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

  private String runOnServer(String prompt, String model, String cli) throws IOException, RestApiException {
    URL url = new URL(config.getCodexServeUrl() + "/run");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setRequestProperty("Content-Type", "application/json");
    conn.setDoOutput(true);

    ArrayList<String> args = new ArrayList<>();
    if (model != null && !model.trim().isEmpty()) {
      args.add("--model");
      args.add(model.trim());
    }

    JsonObject json = new JsonObject();
    json.addProperty("cli", cli);
    json.addProperty("stdin", prompt);

    json.add("args", GSON.toJsonTree(args));

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
        try (BufferedReader br = new BufferedReader(
            new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
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
                   // Ignore parse errors or non-json lines
                   stderrBuilder.append(line).append("\n");
                }
            }
        }
    }

    if (responseCode != 200) {
        throw new BadRequestException("Remote server error " + responseCode + ": " + stderrBuilder.toString());
    }

    // If we didn't see an exit event but stream ended successfully, assume 0?
    // Or maybe we should assume failure if we expected streaming.
    // For now, respect explicit exit code if seen.

    String stdout = stdoutBuilder.toString();
    String stderr = stderrBuilder.toString();

    if (exitCode != 0) {
        throw new BadRequestException(cli + " exited with status " + exitCode + "\n" + stderr + "\n" + stdout);
    }

    if (stdout.length() > MAX_OUTPUT_CHARS) {
        stdout = stdout.substring(0, MAX_OUTPUT_CHARS) + "\n[truncated]";
    }

    return stdout.trim();
  }

  private List<String> fetchModelsFromServer() throws IOException, RestApiException {
    URL url = new URL(config.getCodexServeUrl() + "/models");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("GET");
    conn.setRequestProperty("Accept", "application/json");

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
}
