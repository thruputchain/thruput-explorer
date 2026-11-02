import {
  addressFromBase58,
  toBase58,
  type ThruputClient,
  type IdentifiedEvent,
} from "@thruputchain/client";
import { getContractSpec, getEffectiveContractSpec } from "@thruputchain/client/actions";
import {
  ContractMethodEffect,
  ContractTypeKind,
  createContractEventDecoder,
  formatSpecId,
  specIdKey,
} from "@thruputchain/client/contract";

import { toRpcFailure } from "./rpc";
import type { RpcFailure } from "./types";
import {
  definitionId,
  formatDefinition,
  formatContractType,
  formatSpecValue,
  formatArgumentValue,
  type SpecArgumentView,
  type SpecDefinitionView,
} from "./spec-format";

export type SpecEventPreview = { txHash: string; sequenceNumber: number } & (
  | {
      status: "decoded";
      name: string;
      topics: string;
      fields: string;
      values: SpecArgumentView[];
    }
  | { status: "invalid" }
);

export type ContractSpecView =
  | { status: "unavailable"; error: RpcFailure }
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
    };

/** Current deployment metadata only; it does not establish historical execution identity. */
export async function loadContractSpec(
  client: ThruputClient,
  address: string,
  events: Promise<IdentifiedEvent[]> = Promise.resolve([]),
  context?: "root" | "nested",
): Promise<ContractSpecView> {
  try {
    const effective = context ? await getEffectiveContractSpec(client, {
      address: addressFromBase58(address), context,
    }) : undefined;
    const selection = effective?.selection;
    if (selection && !("contract" in selection))
      throw new Error("Unsupported effective contract selection");
    const result = effective ? {
      ...effective,
      deployment: selection?.contract ?? null,
    } : await getContractSpec(client, { address: addressFromBase58(address) });
    const stateBlockHeight = result.stateBlockHeight.toString();
    if (result.deployment === null)
      return { status: "notDeployed", stateBlockHeight };
    const metadata = result.artifactSpec;
    if (metadata === null)
      throw new Error("Deployed contract has no artifact result");
    const eventPreviews: SpecEventPreview[] = [];
    if (metadata.kind === "spec") {
      const decode = createContractEventDecoder(metadata.spec);
      const eventDefinitions = new Map(
        metadata.spec.events.map((event) => [formatSpecId(event.name), event]),
      );
      for (const entry of await events) {
        if (toBase58(entry.event.address) !== address) continue;
        const identity = {
          txHash: toBase58(entry.transactionHash),
          sequenceNumber: entry.sequenceNumber,
        };
        try {
          const decoded = decode(entry.event);
          if (decoded) {
            const definition = eventDefinitions.get(decoded.name);
            eventPreviews.push({
              ...identity,
              status: "decoded",
              name: definition?.name.declared ?? decoded.name,
              topics: formatSpecValue(decoded.topics),
              fields: formatSpecValue(decoded.fields),
              values: definition
                ? [
                    ...definition.topics.map((field) => ({
                      name: field.name,
                      type: `${formatContractType(field.ty)} · indexed`,
                      value: formatArgumentValue(
                        decoded.topics[field.name],
                        field.ty,
                      ),
                    })),
                    ...definition.fields.map((field) => ({
                      name: field.name,
                      type: formatContractType(field.ty),
                      value: formatArgumentValue(
                        decoded.fields[field.name],
                        field.ty,
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
    const spec = metadata.kind === "spec" ? metadata.spec : effective?.nativeInterface?.spec;
    const errorTypes = new Map(
      spec?.interfaces.flatMap((value) =>
        value.throws.map(
          (error) =>
            [
              error.ty.v === ContractTypeKind.Named
                ? specIdKey(error.ty.named)
                : formatContractType(error.ty),
              error.ty,
            ] as const,
        ),
      ),
    );
    const definitions = new Map(
      spec?.type_defs.map((definition) => [
        specIdKey(definitionId(definition)),
        formatDefinition(definition),
      ]),
    );
    return {
      status: "available",
      stateBlockHeight,
      hash: toBase58(result.deployment.hash),
      size: result.deployment.size,
      selectionSource: selection?.source,
      wallet: selection?.source === "networkDefault" || effective?.nativeInterface?.name === "DefaultWallet",
      metadata: effective?.nativeInterface ? "nativeInterface" : metadata.kind,
      name: spec?.interfaces.length === 1 ? spec.interfaces[0].name : undefined,
      errors: [...errorTypes].map(
        ([key, type]) =>
          definitions.get(key) ?? {
            name: formatContractType(type),
            identity:
              type.v === ContractTypeKind.Named
                ? formatSpecId(type.named)
                : formatContractType(type),
            members: [],
          },
      ),
      types: [...definitions]
        .filter(([key]) => !errorTypes.has(key))
        .map(([, value]) => value),
      interfaces:
        spec
          ? spec.interfaces.map(
              (value) => `${value.name}@${value.vers}`,
            )
          : [],
      methods:
        spec
          ? spec.interfaces.flatMap((value) =>
              value.methods.map((method) => ({
                interface: `${value.name}@${value.vers}`,
                name: method.name,
                parameters: method.args
                  .map((arg) => `${arg.name}: ${formatContractType(arg.ty)}`)
                  .join(", "),
                returns: formatContractType(method.return_type),
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
          : [],
      events: spec
        ? spec.events.map((value) => ({
            name: value.name.declared,
            fields: [
              ...value.topics.map(
                (field) =>
                  `${field.name}: ${formatContractType(field.ty)} [indexed]`,
              ),
              ...value.fields.map(
                (field) => `${field.name}: ${formatContractType(field.ty)}`,
              ),
            ].join(", "),
          }))
        : [],
      eventPreviews,
    };
  } catch (error) {
    return { status: "unavailable", error: toRpcFailure(error) };
  }
}
