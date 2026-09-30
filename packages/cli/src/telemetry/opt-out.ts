export function telemetryOptedOut(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return [env.DO_NOT_TRACK, env.LINK_CLI_TELEMETRY_OPTOUT].some(
    (value) => value === '1' || value?.toLowerCase() === 'true',
  );
}
