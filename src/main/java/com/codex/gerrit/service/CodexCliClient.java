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

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;


@Singleton
public class CodexCliClient {
  private static final int MAX_OUTPUT_CHARS = 20000;

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
    if (config.getCodexServeUrl().isEmpty() && !config.hasCliPath(normalizedCli)) {
      throw new BadRequestException(normalizedCli + "Path is not configured");
    }

    if (!config.getCodexServeUrl().isEmpty()) {
      try {
        return runOnServer(prompt, model, normalizedCli);
      } catch (IOException e) {
        throw new BadRequestException("Remote execution failed: " + e.getMessage());
      }
    }

    List<String> command = new ArrayList<>();
    command.add(config.getCliPath(normalizedCli));
    command.addAll(config.getCliArgs(normalizedCli));

    // Add model parameter if specified
    if (model != null && !model.trim().isEmpty()) {
      command.add("--model");
      command.add(model.trim());
    }

    ProcessBuilder builder = new ProcessBuilder(command);

    // Set litellm environment variables if configured
    if (!config.getLitellmBaseUrl().isEmpty()) {
      builder.environment().put("LITELLM_API_BASE", config.getLitellmBaseUrl());
    }
    if (!config.getLitellmApiKey().isEmpty()) {
      builder.environment().put("LITELLM_API_KEY", config.getLitellmApiKey());
    }
    builder.redirectErrorStream(true);

    try {
      Process process = builder.start();

      try (BufferedWriter writer =
          new BufferedWriter(
              new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8))) {
        writer.write(prompt);
        writer.flush();
      }

      String output = readOutput(process);
      int exitCode = process.waitFor();
      if (exitCode != 0) {
        throw new BadRequestException(
            normalizedCli + " exited with status " + exitCode + "\n" + output);
      }
      return output.trim();
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new BadRequestException(normalizedCli + " execution interrupted: " + ex.getMessage());
    } catch (IOException ex) {
      throw new BadRequestException(normalizedCli + " execution failed: " + ex.getMessage());
    }
  }

  private String runOnServer(String prompt, String model, String cli) throws IOException, RestApiException {
    URL url = new URL(config.getCodexServeUrl() + "/run");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setRequestProperty("Content-Type", "application/json");
    conn.setDoOutput(true);

    List<String> args = new ArrayList<>(config.getCliArgs(cli));
    if (model != null && !model.trim().isEmpty()) {
      args.add("--model");
      args.add(model.trim());
    }

    Map<String, String> env = new HashMap<>();
    if (!config.getLitellmBaseUrl().isEmpty()) {
      env.put("LITELLM_API_BASE", config.getLitellmBaseUrl());
    }
    if (!config.getLitellmApiKey().isEmpty()) {
      env.put("LITELLM_API_KEY", config.getLitellmApiKey());
    }

    JsonObject json = new JsonObject();
    json.addProperty("cli", cli);
    json.addProperty("stdin", prompt);

    Gson gson = new Gson();
    json.add("args", gson.toJsonTree(args));
    if (!env.isEmpty()) {
      json.add("env", gson.toJsonTree(env));
    }

    String jsonInputString = gson.toJson(json);

    try (OutputStream os = conn.getOutputStream()) {
      byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
      os.write(input, 0, input.length);
    }

    int responseCode = conn.getResponseCode();
    InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();

    StringBuilder stdoutBuilder = new StringBuilder();
    StringBuilder stderrBuilder = new StringBuilder();
    int exitCode = 0;
    boolean seenExit = false;

    if (is != null) {
        try (BufferedReader br = new BufferedReader(
            new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                try {
                    JsonObject event = gson.fromJson(line, JsonObject.class);
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
                            seenExit = true;
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

  private static String readOutput(Process process) throws IOException {
    StringBuilder output = new StringBuilder();
    try (BufferedReader reader =
        new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
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
