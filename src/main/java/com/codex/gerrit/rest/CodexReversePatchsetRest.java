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

import com.codex.gerrit.config.CodexGerritConfig;
import com.codex.gerrit.service.CodexPatchsetReverter;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestModifyView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;

@Singleton
public class CodexReversePatchsetRest implements RestModifyView<RevisionResource, Object> {
  private final CodexPatchsetReverter patchsetReverter;
  private final CodexGerritConfig config;

  @Inject
  CodexReversePatchsetRest(CodexPatchsetReverter patchsetReverter, CodexGerritConfig config) {
    this.patchsetReverter = patchsetReverter;
    this.config = config;
  }

  @Override
  public Response<CodexChatResponse> apply(RevisionResource resource, Object input)
      throws RestApiException {
    String changeId = String.valueOf(resource.getChangeResource().getId().get());
    String summary = patchsetReverter.revertLatestPatchset(changeId);
    return Response.ok(new CodexChatResponse(summary, "reverse_patchset", config.getGerritBotUser()));
  }
}