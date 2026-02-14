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

import com.codex.gerrit.service.CodexConsoleService;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestModifyView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;

@Singleton
public class CodexConsoleRest implements RestModifyView<RevisionResource, CodexConsoleInput> {
  private final CodexConsoleService consoleService;

  @Inject
  CodexConsoleRest(CodexConsoleService consoleService) {
    this.consoleService = consoleService;
  }

  @Override
  public Response<CodexConsoleResponse> apply(RevisionResource resource, CodexConsoleInput input)
      throws RestApiException {
    if (input == null) {
      throw new BadRequestException("Missing request body");
    }

    CodexConsoleService.ConsoleResult result = consoleService.runCommand(input.command);
    return Response.ok(new CodexConsoleResponse(result.getOutput(), result.getExitCode()));
  }
}
