import {
  addressFromBase58,
  toBase58,
  type ThruputClient,
  type IdentifiedEvent,
} from "@thruputchain/client";
import {
  getContractSpec,
  getEffectiveContractSpec,
} from "@thruputchain/client/actions";
import {
  ContractMethodEffect,
  ContractTypeKind,
  createContractEventDecoder,
  formatSpecId,
  specIdKey,
  topicRepresentation,
  type ContractType,
} from "@thruputchain/client/contract";

import { toRpcFailure } from "./rpc";
import { DisplayBudget } from "./display-budget";
import { metadataFailure } from "./metadata-failure";
import type { RpcFailure } from "./types";
import {
  definitionId,
  formatDefinition,
  formatContractType,
  formatArgumentValue,
  formatFields,
  type SpecArgumentView,
  type SpecDefinitionView,
} from "./spec-format";

export type SpecEventPreview = {
  txHash: string;
  sequenceNumber: number;
  hash: string;
  stateBlockHeight: string;
} & (
  | {
      status: "decoded";
      name: string;
      values: SpecArgumentView[];
    }
  | { status: "invalid" }
);

export type ContractSpecView =
  | { status: "unavailable"; error: RpcFailure; reason?: string }
  | { status: "notDeployed"; stateBlockHeight: string }
  | {
      status: "available";
      stateBlockHeight: string;
      hash: string;
      size: number;
      selectionSource?: "explicitDeployment" | "networkDefault";
      wallet?: boolean;
      metadata:
        | "native"
        | "nativeInterface"
        | "absent"
        | "unsupportedFormat"
        | "unsupportedSchema"
        | "unsupportedContract"
        | "spec";
      interfaces: string[];
      name?: string;
      errors: SpecDefinitionView[];
      types: SpecDefinitionView[];
      methods: {
        interface: string;
        name: string;
        parameters: string;
        returns: string;
        effect: string;
      }[];
      events: { name: string; fields: string }[];
      eventPreviews: SpecEventPreview[];
      truncated?: boolean;
    };

/** Current deployment metadata only; it does not establish historical execution identity. */
export async function loadContractSpec(
  client: ThruputClient,
  address: string,
  events: Promise<IdentifiedEvent[]> = Promise.resolve([]),
  context?: "root" | "nested",
  budget = new DisplayBudget(),
): Promise<ContractSpecView> {
  try {
    const effective = context
      ? await getEffectiveContractSpec(client, {
          address: addressFromBase58(address),
          context,
        })
      : undefined;
    const selection = effective?.selection;
    if (selection && !("contract" in selection))
      throw new Error("Unsupported effective contract selection");
    const result = effective
      ? {
          ...effective,
          deployment: selection?.contract ?? null,
        }
      : await getContractSpec(client, { address: addressFromBase58(address) });
    const stateBlockHeight = result.stateBlockHeight.toString();
    if (result.deployment === null)
      return { status: "notDeployed", stateBlockHeight };
    const metadata = result.artifactSpec;
    if (metadata === null)
      throw new Error("Deployed contract has no artifact result");
    const eventPreviews: SpecEventPreview[] = [];
    const spec =
      metadata.kind === "spec"
        ? metadata.spec
        : effective?.nativeInterface?.spec;
    const rawDefinitions = new Map(
      spec?.type_defs.map((definition) => [
        specIdKey(definitionId(definition)),
        definition,
      ]),
    );
    if (metadata.kind === "spec") {
      const decode = createContractEventDecoder(metadata.spec);
      const eventDefinitions = new Map(
        metadata.spec.events.map((event) => [formatSpecId(event.name), event]),
      );
      for (const entry of await events) {
        if (toBase58(entry.event.address) !== address) continue;
        if (eventPreviews.length >= 128 || budget.remaining < 256) {
          budget.truncated = true;
          break;
        }
        budget.remaining -= 128;
        const identity = {
          txHash: toBase58(entry.transactionHash),
          sequenceNumber: entry.sequenceNumber,
          hash: toBase58(result.deployment.hash),
          stateBlockHeight,
        };
        try {
          const decoded = decode(entry.event);
          if (decoded) {
            const definition = eventDefinitions.get(decoded.name);
            eventPreviews.push({
              ...identity,
              status: "decoded",
              name: budget.text(definition?.name.declared ?? decoded.name),
              values: definition
                ? [
                    ...budget.rows(definition.topics, (field) => ({
                      name: budget.text(field.name),
                      type: `${formatContractType(field.ty, 0, budget)} · ${topicRepresentation(field.ty) === "hash" ? "indexed hash (original value unavailable)" : "indexed"}`,
                      value: formatArgumentValue(
                        decoded.topics[field.name],
                        topicRepresentation(field.ty) === "hash"
                          ? { v: ContractTypeKind.Bytes }
                          : field.ty,
                        budget,
                        rawDefinitions,
                      ),
                    })),
                    ...budget.rows(definition.fields, (field) => ({
                      name: budget.text(field.name),
                      type: formatContractType(field.ty, 0, budget),
                      value: formatArgumentValue(
                        decoded.fields[field.name],
                        field.ty,
                        budget,
                        rawDefinitions,
                      ),
                    })),
                  ]
                : [],
            });
          }
        } catch {
          eventPreviews.push({ ...identity, status: "invalid" });
        }
      }
    }
    const errorTypes = new Map<string, ContractType>();
    errors: for (const iface of spec?.interfaces ?? []) {
      for (const error of iface.throws) {
        if (errorTypes.size >= 128 || budget.remaining < 256) {
          budget.truncated = true;
          break errors;
        }
        const key =
          error.ty.v === ContractTypeKind.Named
            ? specIdKey(error.ty.named)
            : formatContractType(error.ty, 0, budget);
        errorTypes.set(key, error.ty);
      }
    }
    const definitions = rawDefinitions;
    return {
      status: "available",
      stateBlockHeight,
      hash: toBase58(result.deployment.hash),
      size: result.deployment.size,
      selectionSource: selection?.source,
      wallet:
        selection?.source === "networkDefault" ||
        effective?.nativeInterface?.name === "DefaultWallet",
      metadata: effective?.nativeInterface ? "nativeInterface" : metadata.kind,
      name:
        spec?.interfaces.length === 1
          ? budget.text(spec.interfaces[0].name)
          : undefined,
      errors: budget.rows([...errorTypes], ([key, type]) =>
        definitions.has(key)
          ? formatDefinition(definitions.get(key)!, budget)
          : {
              name: formatContractType(type, 0, budget),
              identity:
                type.v === ContractTypeKind.Named
                  ? budget.text(formatSpecId(type.named))
                  : formatContractType(type, 0, budget),
              members: [],
            },
      ),
      types: budget.rows(
        [...definitions].filter(([key]) => !errorTypes.has(key)),
        ([, value]) => formatDefinition(value, budget),
      ),
      interfaces: spec
        ? budget.rows(spec.interfaces, (value) =>
            budget.text(`${value.name}@${value.vers}`),
          )
        : [],
      methods: spec
        ? budget
            .rows(spec.interfaces, (value) =>
              budget.rows(value.methods, (method) => ({
                interface: budget.text(`${value.name}@${value.vers}`),
                name: budget.text(method.name),
                parameters: formatFields(method.args, budget),
                returns: formatContractType(method.return_type, 0, budget),
                effect:
                  method.effect === ContractMethodEffect.EffectPure
                    ? "pure"
                    : method.effect === ContractMethodEffect.EffectReadOnly
                      ? "read-only"
                      : method.effect ===
                          ContractMethodEffect.EffectStateChanging
                        ? "state-changing"
                        : "",
              })),
            )
            .flat()
        : [],
      events: spec
        ? budget.rows(spec.events, (value) => ({
            name: budget.text(value.name.declared),
            fields: [
              value.topics.length
                ? formatFields(value.topics, budget) + " [indexed]"
                : "",
              formatFields(value.fields, budget),
            ]
              .filter(Boolean)
              .join("; "),
          }))
        : [],
      eventPreviews,
      truncated: budget.truncated,
    };
  } catch (error) {
    return {
      status: "unavailable",
      error: toRpcFailure(error),
      reason: metadataFailure(error),
    };
  }
}
