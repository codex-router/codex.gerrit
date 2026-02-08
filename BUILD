load("//tools/bzl:plugin.bzl", "gerrit_plugin")

gerrit_plugin(
    name = "codex-gerrit",
    srcs = glob(["src/main/java/**/*.java"]),
    manifest_entries = [
        "Gerrit-PluginName: codex-gerrit",
        "Gerrit-Module: com.codex.gerrit.Module",
        "Gerrit-HttpModule: com.codex.gerrit.HttpModule",
        "Implementation-Title: Codex Gerrit Plugin",
    ],
    resources = glob(["src/main/resources/**/*"]),
)
