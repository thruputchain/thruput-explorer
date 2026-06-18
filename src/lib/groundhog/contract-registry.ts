import { stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type ContractRegistryEntry = {
  name: string;
  token?: true;
};

export type ContractRegistry = Record<string, ContractRegistryEntry>;

const LOCAL_CONTRACT_REGISTRY_FILE = "contract-registry.local.mjs";
const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

const BUILT_IN_CONTRACT_REGISTRY: ContractRegistry = {
  "0x0000000000000000000000000000000000000000000000000000000000000001": {
    name: "HOG",
    token: true,
  },
};

export async function loadContractRegistry(): Promise<ContractRegistry> {
  return {
    ...BUILT_IN_CONTRACT_REGISTRY,
    ...(await loadLocalContractRegistry()),
  };
}

export function getContractInfo(registry: ContractRegistry, address: string) {
  return registry[normalizeContractAddress(address)];
}

async function loadLocalContractRegistry() {
  try {
    const path = join(process.cwd(), LOCAL_CONTRACT_REGISTRY_FILE);
    const file = pathToFileURL(path);
    const metadata = await stat(path);
    file.search = `?mtime=${metadata.mtimeMs}`;

    const localRegistryModule = (await nativeImport(file.href)) as { default?: unknown; registry?: unknown };
    return parseContractRegistry(localRegistryModule.default ?? localRegistryModule.registry);
  } catch {
    return {};
  }
}

function parseContractRegistry(value: unknown) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.fromEntries(
      Object.entries(value).flatMap(([address, entry]) => {
        if (!isContractAddress(address) || !isContractRegistryEntry(entry)) return [];
        return [[normalizeContractAddress(address), entry]];
      }),
    );
  } catch {
    return {};
  }
}

function isContractRegistryEntry(value: unknown): value is ContractRegistryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string" && (entry.token === undefined || entry.token === true);
}

function isContractAddress(address: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(address.trim());
}

function normalizeContractAddress(address: string) {
  return address.trim().toLowerCase();
}
