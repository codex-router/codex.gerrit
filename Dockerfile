# Use Ubuntu as base image
FROM ubuntu:22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH=$JAVA_HOME/bin:/usr/local/bin:/usr/bin:$PATH

# Update system and install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    zip \
    unzip \
    wget \
    build-essential \
    ca-certificates \
    openjdk-11-jdk-headless \
    python3 \
    python3-distutils \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 16.x and npm from NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - \
    && apt-get install -y nodejs

# Ensure `python` points to Python 3 for Bazel builds
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Ensure `node` binary exists
RUN [ -e /usr/bin/node ] || ln -sf /usr/bin/nodejs /usr/bin/node

# Install Yarn 1.x for Bazel rules_nodejs
RUN npm install -g yarn@1.22.22

# Create working directory
WORKDIR /workspace

# Install Bazelisk (auto-selects correct Bazel version via Gerrit .bazelversion)
RUN curl -L https://github.com/bazelbuild/bazelisk/releases/download/v1.21.0/bazelisk-linux-amd64 -o /usr/local/bin/bazel \
    && chmod +x /usr/local/bin/bazel

# Create a non-root user for building (bower doesn't allow root)
RUN useradd -m -s /bin/bash builder \
    && chown -R builder:builder /workspace

# Clone Gerrit
RUN git clone https://gerrit.googlesource.com/gerrit -b stable-3.4 \
    && chown -R builder:builder /workspace/gerrit

# Copy plugin source
RUN mkdir -p /workspace/gerrit/plugins/codex
COPY . /workspace/gerrit/plugins/codex/
RUN chown -R builder:builder /workspace/gerrit

# Initialize plugin as separate git repo to use VERSION file instead of parent repo's git describe
RUN cd /workspace/gerrit/plugins/codex \
    && git config --global user.email "builder@localhost" \
    && git config --global user.name "Builder" \
    && git config --global --add safe.directory /workspace/gerrit/plugins/codex \
    && git init \
    && git add . \
    && git commit -m "codex plugin" \
    && PLUGIN_VERSION=$(grep PLUGIN_VERSION VERSION | cut -d"'" -f2) \
    && git tag -a "v${PLUGIN_VERSION}" -m "codex plugin v${PLUGIN_VERSION}" \
    && chown -R builder:builder /workspace/gerrit/plugins/codex

# Initialize Gerrit submodules
RUN git config --global --add safe.directory '*' \
    && cd gerrit && git submodule update --init --recursive \
    && chown -R builder:builder /workspace/gerrit

# Switch to non-root user for build
USER builder
ENV HOME=/home/builder

# Build Codex plugin with Bazel
WORKDIR /workspace/gerrit
RUN java -version \
    && javac -version \
    && node --version \
    && npm --version \
    && yarn --version \
    && which node \
    && which npm \
    && which yarn \
    && echo "build --java_language_version=11" >> .bazelrc \
    && echo "build --java_runtime_version=11" >> .bazelrc \
    && echo "build --tool_java_language_version=11" >> .bazelrc \
    && python3 -c "import re; content = open('WORKSPACE', 'r').read(); content = re.sub(r'(rbe_autoconfig\s*\()', r'\1use_checked_in_confs = \"Force\", ', content); open('WORKSPACE', 'w').write(content)" \
    && bazel sync --configure 2>&1 | tee /tmp/sync.log || (echo "Sync had errors, but continuing..." && tail -20 /tmp/sync.log) \
    && bazel build --verbose_failures //plugins/codex:codex

# Export built plugin (switch back to root for file operations)
USER root
RUN mkdir -p /workspace/output \
    && cp /workspace/gerrit/bazel-bin/plugins/codex/codex.jar /workspace/output/codex-gerrit.jar \
    && chown -R builder:builder /workspace/output

# Set working directory
WORKDIR /workspace/gerrit

# Expose ports
EXPOSE 8080 29418

# Default command
CMD ["/bin/bash"]
