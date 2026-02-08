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
import com.google.gerrit.extensions.api.GerritApi;
import com.google.gerrit.extensions.api.changes.ReviewInput;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.inject.Inject;
import com.google.inject.Singleton;

@Singleton
public class CodexReviewPoster {
  private final GerritApi gerritApi;
  private final CodexGerritConfig config;

  @Inject
  CodexReviewPoster(GerritApi gerritApi, CodexGerritConfig config) {
    this.gerritApi = gerritApi;
    this.config = config;
  }

  public void postReview(String changeId, String reply, String mode) throws RestApiException {
    ReviewInput reviewInput = new ReviewInput();
    reviewInput.message = withBotPrefix(reply);
    reviewInput.tag = "codex-gerrit/" + mode;
    gerritApi.changes().id(changeId).current().review(reviewInput);
  }

  private String withBotPrefix(String message) {
    if (config.getGerritBotUser().isEmpty()) {
      return message;
    }
    return "[bot: " + config.getGerritBotUser() + "]\n" + message;
  }
}
