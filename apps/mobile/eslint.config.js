// ESLint 9 flat config. `eslint-config-expo` carries the React, React Hooks and
// React Native rules that match the SDK, so this only adds what is project-specific.

const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
]);
