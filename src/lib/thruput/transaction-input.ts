import {
  hashFromBase58,
  hashContract,
  toBase58,
  toHex0x,
  formatUnits,
  type ThruputClient,
  type TransactionReceipt,
} from "@thruputchain/client";
import {
  getContractSpec,
  readTransactionInput,
  decodeDefaultWalletRequests,
} from "@thruputchain/client/actions";
import {
  createContractCallDecoder,
  type ContractSpec,
} from "@thruputchain/client/contract";
import { DefaultWalletSpec, ERC20Spec } from "@thruputchain/client/contracts";
import {
  ContractType,
  HogexecPrecompiledNativeContracts,
  type Invocation,
} from "@thruputchain/protocol";

import {
  formatArgumentValue,
  formatContractType,
  formatSpecValue,
  type SpecArgumentView,
} from "./spec-format";

export interface CallPreview {
  target: string;
  selector: string;
  calldata: string;
  gasLimit: string;
  metadata: string;
  method?: string;
  displayMethod?: string;
  source?: "current" | "native" | "walletCandidate";
  arguments?: SpecArgumentView[];
  deployment?: { hash: string; funding: string; initializer: string };
  args?: string;
  output?: string;
}

export type TransactionInputView =
  | { status: "unavailable"; reason: string }
  | {
      status: "available";
      blockHeight: string;
      transactionXdr: string;
      root: CallPreview;
      requested: CallPreview[];
      omitted: number;
    };

const nativeHash = (id: number) =>
  toBase58(
    hashContract({
      contract_type: ContractType.kNative,
      native_contract_id: id,
    }),
  );
const walletHash = nativeHash(
  HogexecPrecompiledNativeContracts.kNativeContractDefaultWallet,
);
const tokenHash = nativeHash(
  HogexecPrecompiledNativeContracts.kNativeContractNativeToken,
);

/** Input identity is verified; spec selection remains a separately labelled preview. */
export async function loadTransactionInput(
  client: ThruputClient,
  hash: string,
  receipt?: TransactionReceipt | null,
): Promise<TransactionInputView> {
  try {
    const input = await readTransactionInput(client, {
      transactionHash: hashFromBase58(hash),
    });
    if (!("status" in input))
      return {
        status: "unavailable",
        reason: "Unsupported transaction input response.",
      };
    if (input.status === "unavailable")
      return {
        status: "unavailable",
        reason:
          "Original input is not retained. This does not prove nonexecution.",
      };
    if (receipt && input.blockHeight !== receipt.blockHeight)
      throw new Error("Input and receipt commitment heights disagree");
    const cache = new Map<string, ReturnType<typeof getContractSpec>>();
    const describe = async (invocation: Invocation, root: boolean) => {
      const view: CallPreview = {
        target: toBase58(invocation.invoked_address),
        selector: toHex0x(invocation.entrypoint),
        calldata: toHex0x(invocation.calldata),
        gasLimit: invocation.gas_limit.toString(),
        metadata: "Metadata unavailable; raw input preserved.",
      };
      let wallet = false;
      try {
        let pending = cache.get(view.target);
        if (!pending) {
          pending = getContractSpec(client, {
            address: invocation.invoked_address,
          });
          cache.set(view.target, pending);
        }
        const result = await pending;
        let spec: ContractSpec | undefined;
        if (result.artifactSpec?.kind === "spec") {
          spec = result.artifactSpec.spec;
          view.source = "current";
          view.metadata = `Current spec ${toBase58(result.deployment!.hash)} at block ${result.stateBlockHeight}; historical code identity is not established.`;
        } else if (result.deployment) {
          const hash = toBase58(result.deployment.hash);
          if (hash === walletHash) {
            spec = DefaultWalletSpec;
            wallet = true;
          }
          if (hash === tokenHash) spec = ERC20Spec;
          if (spec) view.source = "native";
          view.metadata = spec
            ? "Built-in native ABI preview; native identity does not authenticate runtime code or historical behavior."
            : `Metadata: ${result.artifactSpec?.kind ?? "unavailable"}.`;
        } else if (root) {
          // Runtime can use a chain-configured wallet for undeployed roots. Its
          // historical hash is not exposed, so this is explicitly a candidate ABI.
          spec = DefaultWalletSpec;
          wallet = true;
          view.source = "walletCandidate";
          view.metadata =
            "DefaultWallet ABI candidate for an undeployed root. The historical chain-configured wallet identity is unavailable.";
        } else {
          view.metadata =
            "No current deployment. A requested call may refer to a transaction-local deployment.";
        }
        if (spec) {
          const decoded = createContractCallDecoder(spec)(invocation);
          if (decoded) {
            view.method = `${decoded.interfaceName}@${decoded.interfaceVersion}.${decoded.methodName}`;
            view.displayMethod = `${decoded.interfaceName}.${decoded.methodName}`;
            view.args = formatSpecValue(decoded.args ?? {});
            const method = spec.interfaces
              .find(
                (iface) =>
                  iface.name === decoded.interfaceName &&
                  iface.vers === decoded.interfaceVersion,
              )
              ?.methods.find((method) => method.name === decoded.methodName);
            const args = decoded.args ?? {};
            view.arguments = method?.args.map((arg) => ({
              name: arg.name,
              type: formatContractType(arg.ty),
              value: formatArgumentValue(args[arg.name], arg.ty),
            }));
            if (
              wallet &&
              decoded.methodName === "deploy" &&
              args.contract_hash instanceof Uint8Array &&
              typeof args.amount === "bigint"
            ) {
              view.deployment = {
                hash: toBase58(args.contract_hash),
                funding: `${formatUnits(args.amount, 7)} native tokens`,
                initializer:
                  args.initializer === null
                    ? "None"
                    : formatSpecValue(args.initializer),
              };
            }
            if (root && receipt) {
              const outcome = decoded.method.decodeReceiptOutcome(receipt);
              view.output = formatSpecValue(outcome);
            }
          } else view.metadata += " Unknown selector.";
        }
      } catch {
        view.metadata +=
          " Decoding unavailable: metadata or input could not be validated.";
      }
      return { view, wallet };
    };
    const root = await describe(input.transaction.invocation, true);
    let calls: Invocation[] = [];
    if (root.wallet) {
      try {
        calls =
          decodeDefaultWalletRequests(input.transaction.invocation)
            ?.requestedCalls ?? [];
      } catch {
        root.view.metadata += " Malformed wallet request.";
      }
    }
    // Bound metadata fan-out, including attacker-controlled wallet call counts.
    const requested: CallPreview[] = [];
    for (let offset = 0; offset < Math.min(calls.length, 32); offset += 4) {
      const batch = await Promise.all(
        calls
          .slice(offset, Math.min(offset + 4, 32))
          .map((call) => describe(call, false)),
      );
      requested.push(...batch.map((value) => value.view));
    }
    return {
      status: "available",
      blockHeight: input.blockHeight.toString(),
      transactionXdr: toHex0x(input.transactionXdr),
      root: root.view,
      requested,
      omitted: Math.max(0, calls.length - 32),
    };
  } catch {
    return {
      status: "unavailable",
      reason: "Input could not be retrieved or verified.",
    };
  }
}
