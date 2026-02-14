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
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Singleton
public class CodexConsoleService {
  private static final int MAX_OUTPUT_CHARS = 20000;
  private static final int MAX_COMMAND_CHARS = 2000;

  private final CodexGerritConfig config;

  @Inject
  CodexConsoleService(CodexGerritConfig config) {
    this.config = config;
  }

  public ConsoleResult runCommand(String command) throws RestApiException {
    String normalizedCommand = command == null ? "" : command.trim();
    if (normalizedCommand.isEmpty()) {
      throw new BadRequestException("command is required");
    }
    if (normalizedCommand.length() > MAX_COMMAND_CHARS) {
      throw new BadRequestException("command is too long");
    }

    ProcessBuilder builder =
        new ProcessBuilder(Arrays.asList(config.getBashPath(), "-lc", normalizedCommand));
    builder.redirectErrorStream(true);
    configureWorkingDirectory(builder);
    configureEnvironment(builder.environment());

    try {
      Process process = builder.start();
      String output = readOutput(process);
      boolean finished = process.waitFor(config.getConsoleTimeoutSeconds(), TimeUnit.SECONDS);
      if (!finished) {
        process.destroyForcibly();
        throw new BadRequestException(
            "Command timed out after " + config.getConsoleTimeoutSeconds() + " seconds");
      }
      int exitCode = process.exitValue();
      return new ConsoleResult(output.trim(), exitCode);
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new BadRequestException("Console execution interrupted: " + ex.getMessage());
    } catch (IOException ex) {
      throw new BadRequestException("Console execution failed: " + ex.getMessage());
    }
  }

  private void configureWorkingDirectory(ProcessBuilder builder) throws BadRequestException {
    String configuredDir = config.getConsoleWorkDir();
    if (configuredDir == null || configuredDir.isEmpty()) {
      return;
    }
    File workDir = new File(configuredDir);
    if (!workDir.exists() || !workDir.isDirectory()) {
      throw new BadRequestException("consoleWorkDir is not a valid directory: " + configuredDir);
    }
    builder.directory(workDir);
  }

  private static void configureEnvironment(Map<String, String> env) {
    env.put("TERM", "dumb");
    env.put("PAGER", "cat");
    env.put("GIT_PAGER", "cat");
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

  public static class ConsoleResult {
    private final String output;
    private final int exitCode;

    ConsoleResult(String output, int exitCode) {
      this.output = output;
      this.exitCode = exitCode;
    }

    public String getOutput() {
      return output;
    }

    public int getExitCode() {
      return exitCode;
    }
  }
}
