export function getNetworkModeError(
  networkId: string,
  test: boolean,
): string | undefined {
  const isTestNetwork = networkId.startsWith('profile_test_');

  if (isTestNetwork && !test) {
    return `Network ID ${networkId} is test mode. Re-run with --test.`;
  }

  if (!isTestNetwork && networkId.startsWith('profile_') && test) {
    return `Network ID ${networkId} is live mode. Remove --test.`;
  }

  return undefined;
}
