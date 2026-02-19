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

import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.List;


@Singleton
public class CodexCliClient {
  private final CodexAgentClient agentClient;

  @Inject
  CodexCliClient(CodexAgentClient agentClient) {
    this.agentClient = agentClient;
  }

  public String run(String prompt) throws RestApiException {
    return agentClient.run(prompt);
  }

  public String run(String prompt, String model) throws RestApiException {
    return agentClient.run(prompt, model);
  }

  public String run(String prompt, String model, String cli) throws RestApiException {
    return agentClient.run(prompt, model, cli);
  }

  public String run(String prompt, String model, String cli, String sessionId) throws RestApiException {
    return agentClient.run(prompt, model, cli, sessionId);
  }

  public void stopSession(String sessionId) throws RestApiException {
    agentClient.stopSession(sessionId);
  }

  public List<String> getModels() throws RestApiException {
    return agentClient.getModels();
  }

  public List<String> getClis() throws RestApiException {
    return agentClient.getAgents();
  }
}
