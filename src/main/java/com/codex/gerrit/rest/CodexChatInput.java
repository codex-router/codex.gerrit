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

public class CodexChatInput {
  public String prompt;
  public String mode;
  public boolean postAsReview;
  public String agent;
  public String cli;
  public String model;
  @SerializedName(value = "session_id", alternate = {"sessionId"})
  public String sessionId;
  public List<String> contextFiles;
  /** Arbitrary files attached by the user in the chat panel UI. */
  public List<AttachedFile> attachedFiles;

  /** A file uploaded directly by the user, identified by name and inline text content. */
  public static class AttachedFile {
    /** The file name (or relative path) as provided by the user's browser. */
    public String name;
    /** Plain-text content of the file. */
    public String content;
    /**
     * Base64-encoded content of the file (used for binary or non-UTF-8 files).
     * When present it takes precedence over {@code content}.
     */
    public String base64Content;
  }
}
