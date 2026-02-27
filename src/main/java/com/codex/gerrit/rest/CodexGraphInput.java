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

import com.google.gson.JsonElement;
import com.google.gson.annotations.SerializedName;
import java.util.List;
import java.util.Map;

public class CodexGraphInput {
  public String code;
  @SerializedName(value = "file_paths", alternate = {"filePaths"})
  public List<String> filePaths;
  @SerializedName(value = "framework_hint", alternate = {"frameworkHint"})
  public String frameworkHint;
  public JsonElement metadata;
  @SerializedName(value = "http_connections", alternate = {"httpConnections"})
  public JsonElement httpConnections;
  @SerializedName(value = "env", alternate = {"environment"})
  public Map<String, String> env;
}