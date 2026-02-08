# Dockerfile.slim - Minimal build without full Gerrit clone
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH=$JAVA_HOME/bin:/usr/local/bin:/usr/bin:$PATH

# Install minimal dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    openjdk-11-jdk-headless \
    python3 \
    wget \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create working directory
WORKDIR /workspace

# Install Bazelisk
RUN curl -L https://github.com/bazelbuild/bazelisk/releases/download/v1.21.0/bazelisk-linux-amd64 -o /usr/local/bin/bazel \
    && chmod +x /usr/local/bin/bazel

# Create non-root user
RUN useradd -m -s /bin/bash builder \
    && chown -R builder:builder /workspace

# Shallow clone Gerrit (save disk space)
RUN git clone --depth 1 --single-branch -b stable-3.4 https://gerrit.googlesource.com/gerrit \
    && chown -R builder:builder /workspace/gerrit

# Copy only necessary plugin files
COPY --chown=builder:builder BUILD VERSION /workspace/gerrit/plugins/codex/
COPY --chown=builder:builder src /workspace/gerrit/plugins/codex/src/

# Switch to builder user
USER builder
ENV HOME=/home/builder

# Initialize plugin repo
WORKDIR /workspace/gerrit/plugins/codex
RUN git config --global user.email "builder@localhost" \
    && git config --global user.name "Builder" \
    && git config --global --add safe.directory /workspace/gerrit/plugins/codex \
    && git init \
    && git add . \
    && git commit -m "codex plugin" \
    && PLUGIN_VERSION=$(grep PLUGIN_VERSION VERSION | cut -d"'" -f2) \
    && git tag -a "v${PLUGIN_VERSION}" -m "codex plugin v${PLUGIN_VERSION}"

# Build plugin with minimal resources
WORKDIR /workspace/gerrit
RUN git config --global --add safe.directory '*' \
    && echo "build --java_language_version=11" >> .bazelrc \
    && echo "build --java_runtime_version=11" >> .bazelrc \
    && echo "build --tool_java_language_version=11" >> .bazelrc \
    && echo "build --repository_cache=/tmp/bazel-repo" >> .bazelrc \
    && echo "build --disk_cache=/tmp/bazel-disk" >> .bazelrc \
    && echo "build --jobs=2" >> .bazelrc \
    && python3 -c "import re; content = open('WORKSPACE', 'r').read(); content = re.sub(r'(rbe_autoconfig\s*\()', r'\1use_checked_in_confs = \"Force\", ', content); open('WORKSPACE', 'w').write(content)" \
    && bazel build --verbose_failures --noexperimental_check_external_repository_files plugins/codex \
    && rm -rf /tmp/bazel-* ~/.cache/bazel

# Export stage
FROM scratch AS export
COPY --from=builder /workspace/gerrit/bazel-bin/plugins/codex/codex.jar /codex.jar

# Runtime stage (optional, for testing)
FROM ubuntu:22.04
COPY --from=builder /workspace/gerrit/bazel-bin/plugins/codex/codex.jar /workspace/output/
WORKDIR /workspace
CMD ["/bin/bash"]
