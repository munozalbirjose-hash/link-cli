import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      LINK_CLI_TELEMETRY_OPTOUT: '1',
    },
  },
});
