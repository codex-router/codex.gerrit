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
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Singleton
public class CodexCliClient {
  private static final int MAX_OUTPUT_CHARS = 20000;

  private final CodexGerritConfig config;

  @Inject
  CodexCliClient(CodexGerritConfig config) {
    this.config = config;
  }

  public String run(String prompt) throws RestApiException {
    if (!config.hasCodexPath()) {
      throw new BadRequestException("codexPath is not configured");
    }
    List<String> command = new ArrayList<>();
    command.add(config.getCodexPath());
    command.addAll(config.getCodexArgs());

    ProcessBuilder builder = new ProcessBuilder(command);
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
        throw new BadRequestException("codex exited with status " + exitCode + "\n" + output);
      }
      return output.trim();
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new BadRequestException("codex execution interrupted: " + ex.getMessage());
    } catch (IOException ex) {
      throw new BadRequestException("codex execution failed: " + ex.getMessage());
    }
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
