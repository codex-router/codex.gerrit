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

import com.codex.gerrit.service.CodexAgentClient;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestModifyView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;

@Singleton
public class CodexInsightRest implements RestModifyView<RevisionResource, CodexInsightInput> {
  private final CodexAgentClient agentClient;

  @Inject
  CodexInsightRest(CodexAgentClient agentClient) {
    this.agentClient = agentClient;
  }

  @Override
  public Response<CodexInsightResponse> apply(RevisionResource resource, CodexInsightInput input)
      throws RestApiException {
    if (input == null) {
      throw new BadRequestException("Missing request body");
    }
    return Response.ok(agentClient.runInsight(input));
  }
}
