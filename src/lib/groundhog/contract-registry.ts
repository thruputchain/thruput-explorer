export type ContractRegistryEntry = {
  name?: string;
  token?: true;
  kind?: "ticketmaster";
};

export type ContractRegistry = Record<string, ContractRegistryEntry>;

const BUILT_IN_CONTRACT_REGISTRY: ContractRegistry = {
  "0x0000000000000000000000000000000000000000000000000000000000000001": {
    name: "HOG",
    token: true,
  },
};

export async function loadContractRegistry(): Promise<ContractRegistry> {
  return {
    ...BUILT_IN_CONTRACT_REGISTRY,
    ...loadEnvContractRegistry(),
  };
}

export function getContractInfo(registry: ContractRegistry, address: string) {
  return registry[normalizeContractAddress(address)];
}

export function getTokenContracts(registry: ContractRegistry) {
  return Object.entries(registry)
    .filter(([, entry]) => entry.token)
    .map(([address, entry]) => ({ address, entry }));
}

function loadEnvContractRegistry() {
  return Object.fromEntries(
    [
      envContract(process.env.GROUNDHOG_ALULA_ADDRESS, { name: "ALULA", token: true }),
      envContract(process.env.GROUNDHOG_USDC_ADDRESS, { name: "USDC", token: true }),
      envContract(process.env.GROUNDHOG_TICKETMASTER_ADDRESS, { name: "Ticketmaster", kind: "ticketmaster" }),
    ].filter((entry): entry is [string, ContractRegistryEntry] => entry !== undefined),
  );
}

function envContract(address: string | undefined, entry: ContractRegistryEntry): [string, ContractRegistryEntry] | undefined {
  if (!address || !isContractAddress(address)) return undefined;
  return [normalizeContractAddress(address), entry];
}

function isContractAddress(address: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(address.trim());
}

function normalizeContractAddress(address: string) {
  return address.trim().toLowerCase();
}
