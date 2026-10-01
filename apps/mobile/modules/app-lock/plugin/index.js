// No-op config mod — the module's own AndroidManifest.xml (device admin
// receiver + meta-data) and res/xml (device_admin policy descriptor) are
// picked up automatically by Expo autolinking's manifest merge during
// prebuild/EAS Build. This file exists so the plugin is discoverable by
// name in app.json, consistent with the screen-activity module.
module.exports = function withAppLock(config) {
  return config;
};
