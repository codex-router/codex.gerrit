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
import com.google.gerrit.extensions.api.GerritApi;
import com.google.gerrit.extensions.api.changes.ChangeApi;
import com.google.gerrit.extensions.common.FileInfo;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestReadView;
import com.google.gerrit.server.change.RevisionResource;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Singleton
public class CodexConfigRest implements RestReadView<RevisionResource> {
  private final CodexGerritConfig config;
  private final GerritApi gerritApi;

  @Inject
  CodexConfigRest(CodexGerritConfig config, GerritApi gerritApi) {
    this.config = config;
    this.gerritApi = gerritApi;
  }

  @Override
  public Response<CodexConfigResponse> apply(RevisionResource resource) throws RestApiException {
    String changeId = String.valueOf(resource.getChangeResource().getId().get());
    ChangeApi changeApi = gerritApi.changes().id(changeId);
    Map<String, FileInfo> files = changeApi.current().files();
    return Response.ok(
        new CodexConfigResponse(
            config.getLitellmModels(),
            CodexGerritConfig.getSupportedClis(),
            config.getDefaultCli(),
            getPluginVersion(),
            normalizeFiles(files)));
  }

  private static List<String> normalizeFiles(Map<String, FileInfo> files) {
    List<String> result = new ArrayList<>();
    for (String file : files.keySet()) {
      if (file == null || file.isEmpty() || file.startsWith("/")) {
        continue;
      }
      result.add(file);
    }
    Collections.sort(result);
    return result;
  }

  private String getPluginVersion() {
    String implementationVersion = getClass().getPackage().getImplementationVersion();
    return implementationVersion == null ? "" : implementationVersion;
  }

  public static class CodexConfigResponse {
    public List<String> models;
    public List<String> clis;
    public String defaultCli;
    public String pluginVersion;
    public List<String> patchsetFiles;

    public CodexConfigResponse(
        List<String> models,
        List<String> clis,
        String defaultCli,
        String pluginVersion,
        List<String> patchsetFiles) {
      this.models = models;
      this.clis = clis;
      this.defaultCli = defaultCli;
      this.pluginVersion = pluginVersion;
      this.patchsetFiles = patchsetFiles;
    }
  }
}
