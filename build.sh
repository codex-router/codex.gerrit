#!/bin/bash

docker build -t gerrit-plugins-codex:3.4 .
docker run -it -d --name gerrit-plugins-codex gerrit-plugins-codex:3.4
docker cp gerrit-plugins-codex:/workspace/output/codex-gerrit.jar .
docker rm -f gerrit-plugins-codex
