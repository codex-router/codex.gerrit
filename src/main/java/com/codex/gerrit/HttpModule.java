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

public class HttpModule extends ServletModule {
  @Override
  protected void configureServlets() {
    // Serve static resources (JS, CSS files) from src/main/resources/static/
    // This makes the plugin's JavaScript and CSS files accessible to the Gerrit UI
  }
}
