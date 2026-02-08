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
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestReadView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.List;

@Singleton
public class CodexConfigRest implements RestReadView<RevisionResource> {
  private final CodexGerritConfig config;

  @Inject
  CodexConfigRest(CodexGerritConfig config) {
    this.config = config;
  }

  @Override
  public Response<CodexConfigResponse> apply(RevisionResource resource) throws RestApiException {
    return Response.ok(new CodexConfigResponse(config.getLitellmModels()));
  }

  public static class CodexConfigResponse {
    public List<String> models;

    public CodexConfigResponse(List<String> models) {
      this.models = models;
    }
  }
}
