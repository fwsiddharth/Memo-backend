const fs = require("fs");
const path = require("path");

const registry = new Map();
const providersDir = path.join(__dirname, "providers");

function validateExtension(ext) {
  return (
    ext &&
    typeof ext.name === "string" &&
    typeof ext.search === "function" &&
    typeof ext.getEpisodes === "function" &&
    typeof ext.getStream === "function"
  );
}

function extensionKey(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

function loadExtensions() {
  registry.clear();

  if (!fs.existsSync(providersDir)) return;

  for (const file of fs.readdirSync(providersDir)) {
    if (!file.endsWith(".js")) continue;
    const fullPath = path.join(providersDir, file);

    // Ensure hot reload picks up updates in dev.
    delete require.cache[require.resolve(fullPath)];
    const mod = require(fullPath);
    const ext = mod.default || mod;
    if (!validateExtension(ext)) continue;
    registry.set(extensionKey(ext.name), ext);
  }
}

function getExtension(name) {
  if (!name) {
    return registry.get("animesalt") || registry.get("kaa-manifest") || registry.values().next().value || null;
  }
  return registry.get(extensionKey(name)) || null;
}

function listExtensions() {
  return Array.from(registry.keys());
}

module.exports = {
  loadExtensions,
  getExtension,
  listExtensions,
};
