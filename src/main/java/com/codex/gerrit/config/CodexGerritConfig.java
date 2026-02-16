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
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@Singleton
public class CodexGerritConfig {
  private static final int DEFAULT_MAX_FILES = 200;
  private static final String DEFAULT_CLI = "codex";
  private static final String DEFAULT_BASH_PATH = "/bin/bash";
  private static final List<String> SUPPORTED_CLIS =
      Collections.unmodifiableList(Arrays.asList("codex", "claude", "gemini", "opencode", "qwen"));

  private final String gerritBotUser;
  private final String defaultCli;
  private final int maxFiles;
  private final String bashPath;
  private final String codexServeUrl;

  @Inject
  CodexGerritConfig(PluginConfigFactory configFactory, @PluginName String pluginName) {
    PluginConfig config = configFactory.getFromGerritConfig(pluginName);
    this.gerritBotUser = trimToEmpty(config.getString("gerritBotUser"));
    this.defaultCli = normalizeCli(config.getString("defaultCli"));
    this.maxFiles = config.getInt("maxFiles", DEFAULT_MAX_FILES);
    this.bashPath = trimToDefault(config.getString("bashPath"), DEFAULT_BASH_PATH);
    this.codexServeUrl = trimToEmpty(config.getString("codexServeUrl"));
  }

  public String getGerritBotUser() {
    return gerritBotUser;
  }

  public int getMaxFiles() {
    return maxFiles;
  }

  public String getBashPath() {
    return bashPath;
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

  public List<String> getConfiguredClis() {
    return SUPPORTED_CLIS;
  }

  public String getCodexServeUrl() {
    return codexServeUrl;
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

  private static String trimToEmpty(String value) {
    return value == null ? "" : value.trim();
  }

  private static String trimToDefault(String value, String defaultValue) {
    String trimmed = trimToEmpty(value);
    return trimmed.isEmpty() ? defaultValue : trimmed;
  }
}
