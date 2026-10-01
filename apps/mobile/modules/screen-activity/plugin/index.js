// No manifest permissions or native config changes are needed for
// ACTION_SCREEN_ON/ACTION_SCREEN_OFF — they're normal (non-dangerous)
// broadcasts any app can register for at runtime. This plugin exists so the
// module is picked up by Expo's autolinking during prebuild/EAS Build; it's
// a no-op config mod, kept as a placeholder in case native config is needed
// later (e.g. a foreground service to keep the receiver alive).
module.exports = function withScreenActivity(config) {
  return config;
};
