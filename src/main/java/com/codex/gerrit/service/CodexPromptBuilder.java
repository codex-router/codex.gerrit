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
import com.codex.gerrit.rest.CodexChatInput;
import com.google.gerrit.extensions.common.ChangeInfo;
import com.google.gerrit.extensions.common.FileInfo;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Singleton
public class CodexPromptBuilder {
  private final CodexGerritConfig config;

  @Inject
  CodexPromptBuilder(CodexGerritConfig config) {
    this.config = config;
  }

  public String buildPrompt(
      ChangeInfo changeInfo, Map<String, FileInfo> files, CodexChatInput input) {
    StringBuilder builder = new StringBuilder();
    builder.append("Task: ").append(input.mode).append("\n");
    builder.append("Change: ")
        .append(safe(changeInfo.project))
        .append(" ")
        .append(safe(changeInfo.branch))
        .append("\n");
    builder.append("Subject: ").append(safe(changeInfo.subject)).append("\n");
    if (changeInfo.owner != null) {
      builder.append("Owner: ")
          .append(safe(changeInfo.owner.name))
          .append(" ")
          .append(safe(changeInfo.owner.email))
          .append("\n");
    }

    builder.append("Files:\n");
    for (String file : trimFiles(files)) {
      builder.append("- ").append(file).append("\n");
    }

    builder.append("\nUser prompt:\n").append(input.prompt).append("\n");
    if ("patchset".equals(input.mode)) {
      builder.append("\nOutput only in this exact format:\n");
      builder.append("BEGIN_SUMMARY\n<short summary>\nEND_SUMMARY\n");
      builder.append("BEGIN_COMMIT_MESSAGE\n<commit message>\nEND_COMMIT_MESSAGE\n");
      builder.append("BEGIN_FILE path/to/file\n<full file content>\nEND_FILE\n");
      builder.append("DELETE_FILE path/to/file\n");
      builder.append("\nDo not include extra commentary outside the markers.\n");
    } else if ("generate".equals(input.mode)) {
      builder.append("\nOutput a unified diff if you propose code changes.\n");
    } else {
      builder.append("\nFocus on code review feedback and risks.\n");
    }
    if (!config.getGerritBotUser().isEmpty()) {
      builder.append("\nPost as Gerrit bot: ").append(config.getGerritBotUser()).append("\n");
    }
    return builder.toString();
  }

  private List<String> trimFiles(Map<String, FileInfo> files) {
    List<String> fileNames = new ArrayList<>(files.keySet());
    if (fileNames.size() <= config.getMaxFiles()) {
      return fileNames;
    }
    return fileNames.subList(0, config.getMaxFiles());
  }

  private static String safe(String value) {
    return value == null ? "" : value.trim();
  }
}
