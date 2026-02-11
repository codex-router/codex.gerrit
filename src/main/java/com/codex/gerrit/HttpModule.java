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

import com.google.inject.servlet.ServletModule;

/**
 * HTTP module for the Codex Gerrit plugin.
 *
 * <p>Static resources (e.g. {@code static/codex-gerrit.js}) are served by Gerrit from the plugin
 * JAR at {@code /plugins/codex-gerrit/static/...}.
 *
 * <p>For PolyGerrit to load the chat panel script automatically, the plugin would need to register
 * a WebUiPlugin (JavaScriptPlugin) in this module. That requires {@code WebUiPlugin} and {@code
 * JavaScriptPlugin} from the server, which are not part of the public plugin API used by Bazel
 * builds. If the chat panel does not appear in PolyGerrit, deploy {@code codex-gerrit.js} as a
 * standalone file to {@code $GERRIT_SITE/plugins/codex-gerrit.js} so Gerrit loads it.
 */
public class HttpModule extends ServletModule {
  @Override
  protected void configureServlets() {
    // Optional: add servlet bindings here if needed.
  }
}
