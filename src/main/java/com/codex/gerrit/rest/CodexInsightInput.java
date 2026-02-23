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

package com.codex.gerrit.rest;

import com.google.gson.annotations.SerializedName;
import java.util.List;
import java.util.Map;

public class CodexInsightInput {
  public String outPath;
  public List<InsightFile> files;
  public List<String> include;
  public List<String> exclude;
  public Integer maxFilesPerModule;
  public Integer maxCharsPerFile;
  public Boolean dryRun;
  @SerializedName(value = "env", alternate = {"environment"})
  public Map<String, String> env;

  public static class InsightFile {
    public String path;
    @SerializedName(value = "content", alternate = {"fileContent", "file_content"})
    public String content;
    @SerializedName(value = "base64Content", alternate = {"base64_content", "base64"})
    public String base64Content;
  }
}
