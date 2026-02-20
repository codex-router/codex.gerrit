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

package com.codex.gerrit;

import static com.google.gerrit.server.change.RevisionResource.REVISION_KIND;

import com.codex.gerrit.rest.CodexChatRest;
import com.codex.gerrit.rest.CodexChatStopRest;
import com.codex.gerrit.rest.CodexConfigRest;
import com.codex.gerrit.rest.CodexPatchsetFilesRest;
import com.google.gerrit.extensions.registration.DynamicSet;
import com.google.gerrit.extensions.restapi.RestApiModule;
import com.google.gerrit.extensions.webui.JavaScriptPlugin;
import com.google.gerrit.extensions.webui.WebUiPlugin;
import com.google.inject.AbstractModule;

public class Module extends AbstractModule {
  @Override
  protected void configure() {
    // Register PolyGerrit UI plugin script explicitly (same loading model used by coder-workspace).
    DynamicSet.bind(binder(), WebUiPlugin.class).toInstance(new JavaScriptPlugin("codex-gerrit.js"));

    install(
        new RestApiModule() {
          @Override
          protected void configure() {
            post(REVISION_KIND, "codex-chat").to(CodexChatRest.class);
            post(REVISION_KIND, "codex-chat-stop").to(CodexChatStopRest.class);
            get(REVISION_KIND, "codex-config").to(CodexConfigRest.class);
            get(REVISION_KIND, "codex-patchset-files").to(CodexPatchsetFilesRest.class);
          }
        });
  }
}
