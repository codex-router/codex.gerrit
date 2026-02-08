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
import java.util.Collections;
import java.util.List;
import java.util.StringTokenizer;

@Singleton
public class CodexGerritConfig {
  private static final int DEFAULT_MAX_FILES = 200;

  private final String gerritBotUser;
  private final String codexPath;
  private final List<String> codexArgs;
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

  public String getLitellmBaseUrl() {
    return litellmBaseUrl;
  }

  public String getLitellmApiKey() {
    return litellmApiKey;
  }

  public List<String> getLitellmModels() {
    return litellmModels;
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
