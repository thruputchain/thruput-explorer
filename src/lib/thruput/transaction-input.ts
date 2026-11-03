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
  getEffectiveContractSpec,
  readTransactionInput,
  decodeDefaultWalletRequests,
} from "@thruputchain/client/actions";
import {
  createContractCallDecoder,
  ContractVerificationError,
  specIdKey,
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
  definitionId,
  formatContractType,
  formatSpecValue,
  type SpecArgumentView,
} from "./spec-format";
import { DisplayBudget } from "./display-budget";
import { metadataFailure } from "./metadata-failure";

export interface CallPreview {
  target: string;
  selector: string;
  calldata: string;
  gasLimit: string;
  metadata: string;
  method?: string;
  displayMethod?: string;
  source?: "current" | "native";
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
      truncated?: boolean;
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
  budget = new DisplayBudget(),
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
      throw new ContractVerificationError(
        "Input and receipt commitment heights disagree",
      );
    const cache = new Map<
      string,
      ReturnType<typeof getEffectiveContractSpec>
    >();
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
        const context = root ? "root" : "nested";
        const key = `${context}:${view.target}`;
        let pending = cache.get(key);
        if (!pending) {
          pending = getEffectiveContractSpec(client, {
            address: invocation.invoked_address,
            context,
          });
          cache.set(key, pending);
        }
        const result = await pending;
        const selection = result.selection;
        if (selection && !("contract" in selection))
          throw new Error("Unsupported effective contract selection");
        const deployment = selection?.contract;
        let spec: ContractSpec | undefined;
        if (result.artifactSpec?.kind === "spec") {
          spec = result.artifactSpec.spec;
          view.source = "current";
          view.metadata = `Current ${selection?.source} spec ${toBase58(deployment!.hash)} at block ${result.stateBlockHeight}; historical code identity is not established.`;
        } else if (deployment) {
          const hash = toBase58(deployment.hash);
          if (hash === walletHash) {
            spec = DefaultWalletSpec;
            wallet = true;
          }
          if (hash === tokenHash) spec = ERC20Spec;
          if (spec) view.source = "native";
          view.metadata = spec
            ? "Built-in native ABI preview; native identity does not authenticate runtime code or historical behavior."
            : `Metadata: ${result.artifactSpec?.kind ?? "unavailable"}.`;
        } else {
          view.metadata =
            "No current deployment. A requested call may refer to a transaction-local deployment.";
        }
        if (spec) {
          const definitions = new Map(
            spec.type_defs.map((definition) => [
              specIdKey(definitionId(definition)),
              definition,
            ]),
          );
          const decoded = createContractCallDecoder(spec)(invocation);
          if (decoded) {
            view.method = budget.text(
              `${decoded.interfaceName}@${decoded.interfaceVersion}.${decoded.methodName}`,
            );
            view.displayMethod = budget.text(
              `${decoded.interfaceName}.${decoded.methodName}`,
            );
            const method = spec.interfaces
              .find(
                (iface) =>
                  iface.name === decoded.interfaceName &&
                  iface.vers === decoded.interfaceVersion,
              )
              ?.methods.find((method) => method.name === decoded.methodName);
            const args = decoded.args ?? {};
            view.arguments = budget.rows(method?.args ?? [], (arg) => ({
              name: budget.text(arg.name),
              type: formatContractType(arg.ty, 0, budget),
              value: formatArgumentValue(
                args[arg.name],
                arg.ty,
                budget,
                definitions,
              ),
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
                    : formatSpecValue(args.initializer, budget),
              };
            }
            if (root && receipt) {
              const outcome = decoded.method.decodeReceiptOutcome(receipt);
              view.output = formatSpecValue(outcome, budget);
            }
          } else view.metadata += " Unknown selector.";
        }
      } catch (error) {
        view.metadata = metadataFailure(error);
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
      truncated: budget.truncated,
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason:
        error instanceof ContractVerificationError
          ? "Input verification failed."
          : "Input could not be retrieved.",
    };
  }
}
