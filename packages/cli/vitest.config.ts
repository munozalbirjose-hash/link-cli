import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      LINK_CLI_TELEMETRY_OPTOUT: '1',
      // Subprocess tests must use fixture credentials, not the invoking shell.
      LINK_ACCESS_TOKEN: '',
      LINK_REFRESH_TOKEN: '',
      LINK_AUTH_FILE: '',
      LINK_NO_REFRESH: '',
      LINK_HTTP_PROXY: '',
    },
  },
});
