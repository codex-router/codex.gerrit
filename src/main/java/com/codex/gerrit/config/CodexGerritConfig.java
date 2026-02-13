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

package com.codex.gerrit.config;

import com.google.gerrit.extensions.annotations.PluginName;
import com.google.gerrit.server.config.PluginConfig;
import com.google.gerrit.server.config.PluginConfigFactory;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.StringTokenizer;

@Singleton
public class CodexGerritConfig {
  private static final int DEFAULT_MAX_FILES = 200;
  private static final String DEFAULT_CLI = "codex";
  private static final List<String> SUPPORTED_CLIS =
      Collections.unmodifiableList(Arrays.asList("codex", "claude", "gemini", "opencode", "qwen"));

  private final String gerritBotUser;
  private final String codexPath;
  private final List<String> codexArgs;
  private final String claudePath;
  private final List<String> claudeArgs;
  private final String geminiPath;
  private final List<String> geminiArgs;
  private final String opencodePath;
  private final List<String> opencodeArgs;
  private final String qwenPath;
  private final List<String> qwenArgs;
  private final String defaultCli;
  private final int maxFiles;
  private final String litellmBaseUrl;
  private final String litellmApiKey;
  private final List<String> litellmModels;

  @Inject
  CodexGerritConfig(PluginConfigFactory configFactory, @PluginName String pluginName) {
    PluginConfig config = configFactory.getFromGerritConfig(pluginName);
    this.gerritBotUser = trimToEmpty(config.getString("gerritBotUser"));
    this.codexPath = trimToEmpty(config.getString("codexPath"));
    this.codexArgs = parseArgs(config.getString("codexArgs"));
    this.claudePath = trimToEmpty(config.getString("claudePath"));
    this.claudeArgs = parseArgs(config.getString("claudeArgs"));
    this.geminiPath = trimToEmpty(config.getString("geminiPath"));
    this.geminiArgs = parseArgs(config.getString("geminiArgs"));
    this.opencodePath = trimToEmpty(config.getString("opencodePath"));
    this.opencodeArgs = parseArgs(config.getString("opencodeArgs"));
    this.qwenPath = trimToEmpty(config.getString("qwenPath"));
    this.qwenArgs = parseArgs(config.getString("qwenArgs"));
    this.defaultCli = normalizeCli(config.getString("defaultCli"));
    this.maxFiles = config.getInt("maxFiles", DEFAULT_MAX_FILES);
    this.litellmBaseUrl = trimToEmpty(config.getString("litellmBaseUrl"));
    this.litellmApiKey = trimToEmpty(config.getString("litellmApiKey"));
    this.litellmModels = parseList(config.getString("litellmModels"));
  }

  public String getGerritBotUser() {
    return gerritBotUser;
  }

  public String getCodexPath() {
    return codexPath;
  }

  public List<String> getCodexArgs() {
    return codexArgs;
  }

  public int getMaxFiles() {
    return maxFiles;
  }

  public boolean hasCodexPath() {
    return !codexPath.isEmpty();
  }

  public String getDefaultCli() {
    return defaultCli;
  }

  public static List<String> getSupportedClis() {
    return SUPPORTED_CLIS;
  }

  public String normalizeCliOrDefault(String cli) {
    return normalizeCli(cli);
  }

  public boolean isSupportedCli(String cli) {
    return SUPPORTED_CLIS.contains(normalizeCli(cli));
  }

  public String getCliPath(String cli) {
    String normalizedCli = normalizeCli(cli);
    switch (normalizedCli) {
      case "claude":
        return claudePath;
      case "gemini":
        return geminiPath;
      case "opencode":
        return opencodePath;
      case "qwen":
        return qwenPath;
      case "codex":
      default:
        return codexPath;
    }
  }

  public List<String> getCliArgs(String cli) {
    String normalizedCli = normalizeCli(cli);
    switch (normalizedCli) {
      case "claude":
        return claudeArgs;
      case "gemini":
        return geminiArgs;
      case "opencode":
        return opencodeArgs;
      case "qwen":
        return qwenArgs;
      case "codex":
      default:
        return codexArgs;
    }
  }

  public boolean hasCliPath(String cli) {
    return !getCliPath(cli).isEmpty();
  }

  public List<String> getConfiguredClis() {
    List<String> configured = new ArrayList<>();
    for (String cli : SUPPORTED_CLIS) {
      if (hasCliPath(cli)) {
        configured.add(cli);
      }
    }
    if (configured.isEmpty()) {
      configured.add(DEFAULT_CLI);
    }
    return configured;
  }

  public String getLitellmBaseUrl() {
    return litellmBaseUrl;
  }

  public String getLitellmApiKey() {
    return litellmApiKey;
  }

  public List<String> getLitellmModels() {
    return litellmModels;
  }

  private String normalizeCli(String rawCli) {
    if (rawCli == null) {
      return DEFAULT_CLI;
    }
    String normalized = rawCli.trim().toLowerCase();
    if (normalized.isEmpty()) {
      return DEFAULT_CLI;
    }
    if (!SUPPORTED_CLIS.contains(normalized)) {
      return DEFAULT_CLI;
    }
    return normalized;
  }

  private static List<String> parseArgs(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      return Collections.emptyList();
    }
    List<String> args = new ArrayList<>();
    StringTokenizer tokenizer = new StringTokenizer(raw);
    while (tokenizer.hasMoreTokens()) {
      args.add(tokenizer.nextToken());
    }
    return args;
  }

  private static List<String> parseList(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      return Collections.emptyList();
    }
    List<String> items = new ArrayList<>();
    for (String item : raw.split(",")) {
      String trimmed = item.trim();
      if (!trimmed.isEmpty()) {
        items.add(trimmed);
      }
    }
    return items;
  }

  private static String trimToEmpty(String value) {
    return value == null ? "" : value.trim();
  }
}
