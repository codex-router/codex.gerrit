load("//tools/bzl:plugin.bzl", "gerrit_plugin")

gerrit_plugin(
    name = "codex",
    srcs = glob(["src/main/java/**/*.java"]),
    manifest_entries = [
        "Gerrit-PluginName: codex",
        "Gerrit-Module: com.codex.gerrit.Module",
        "Implementation-Title: Codex Gerrit Plugin",
    ],
    resources = glob(["src/main/resources/**/*"]),
)
