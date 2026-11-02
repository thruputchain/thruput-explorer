import { toBase58 } from "@thruputchain/client";
import {
  ContractTypeKind,
  ContractTypeDefKind,
  ContractUnionCaseKind,
  formatSpecId,
  type ContractType,
  type ContractTypeDef,
  type ContractSpecId,
} from "@thruputchain/client/contract";

/** Display type structure without expanding named definitions or recursive types. */
export function formatContractType(type: ContractType, depth = 0): string {
  if (depth >= 32) return "…";
  const inner = (value: ContractType) => formatContractType(value, depth + 1);
  switch (type.v) {
    case ContractTypeKind.Named:
      return type.named.declared;
    case ContractTypeKind.Option:
      return `Option<${inner(type.option_inner)}>`;
    case ContractTypeKind.Vector:
      return `Vector<${inner(type.vector.element)}, ${type.vector.max_len}>`;
    case ContractTypeKind.Array:
      return `[${inner(type.array.element)}; ${type.array.len}]`;
    case ContractTypeKind.Tuple:
      return `(${type.tuple.map(inner).join(", ")})`;
    case ContractTypeKind.SignedToken:
      return `SignedToken<${type.signed_token_preimage.preimage_type ? inner(type.signed_token_preimage.preimage_type) : "unknown"}>`;
    default:
      return ContractTypeKind[type.v]?.toLowerCase() ?? `Unknown(${type.v})`;
  }
}

export interface SpecDefinitionView {
  name: string;
  identity: string;
  members: string[];
}

export function definitionId(definition: ContractTypeDef): ContractSpecId {
  switch (definition.v) {
    case ContractTypeDefKind.TypeDefStruct:
      return definition.struct_def.name;
    case ContractTypeDefKind.TypeDefEnum:
      return definition.enum_def.name;
    case ContractTypeDefKind.TypeDefUnion:
      return definition.union_def.name;
  }
}

export function formatDefinition(
  definition: ContractTypeDef,
): SpecDefinitionView {
  const id = definitionId(definition);
  let members: string[];
  switch (definition.v) {
    case ContractTypeDefKind.TypeDefStruct:
      members = definition.struct_def.fields.map(
        (field) => `${field.name}: ${formatContractType(field.ty)}`,
      );
      break;
    case ContractTypeDefKind.TypeDefEnum:
      members = definition.enum_def.variants.map(
        (variant) => `${variant.name} = ${variant.value}`,
      );
      break;
    case ContractTypeDefKind.TypeDefUnion:
      members = definition.union_def.cases.map((entry) => {
        const payload = entry.case_type;
        const fields =
          payload.v === ContractUnionCaseKind.UnionCaseTuple
            ? `(${payload.tuple.map((type) => formatContractType(type)).join(", ")})`
            : payload.v === ContractUnionCaseKind.UnionCaseStruct
              ? ` { ${payload.struct_fields.map((field) => `${field.name}: ${formatContractType(field.ty)}`).join(", ")} }`
              : "";
        return `${entry.name}${fields} = ${entry.discriminant}`;
      });
  }
  return { name: id.declared, identity: formatSpecId(id), members };
}

export interface SpecArgumentView {
  name: string;
  type: string;
  value: string;
}

export function formatArgumentValue(
  value: unknown,
  type: ContractType,
): string {
  if (type.v === ContractTypeKind.Address && value instanceof Uint8Array)
    return toBase58(value);
  if (
    typeof value === "bigint" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  return formatSpecValue(value);
}

/** Preserve wide integers and byte values when presenting a decoded event. */
export function formatSpecValue(value: unknown): string {
  return (
    JSON.stringify(
      value,
      (_key, item: unknown) => {
        if (typeof item === "bigint") return item.toString();
        if (item instanceof Uint8Array)
          return `0x${Buffer.from(item).toString("hex")}`;
        return item;
      },
      2,
    ) ?? "null"
  );
}
