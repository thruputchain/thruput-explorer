import { toBase58 } from "@thruputchain/client";
import {
  ContractTypeKind,
  ContractTypeDefKind,
  ContractUnionCaseKind,
  formatSpecId,
  specIdKey,
  type ContractType,
  type ContractTypeDef,
  type ContractSpecId,
} from "@thruputchain/client/contract";
import { DisplayBudget, TRUNCATED } from "./display-budget";

/** Display type structure without expanding named definitions or recursive types. */
export function formatContractType(
  type: ContractType,
  depth = 0,
  budget = new DisplayBudget(),
): string {
  return budget.format((write) => writeType(type, write, depth));
}

function writeType(
  type: ContractType,
  write: (text: string) => void,
  depth = 0,
): void {
  if (depth >= 32) {
    write("…");
    return;
  }
  const inner = (value: ContractType) => writeType(value, write, depth + 1);
  switch (type.v) {
    case ContractTypeKind.Named:
      write(type.named.declared);
      break;
    case ContractTypeKind.Option:
      write("Option<");
      inner(type.option_inner);
      write(">");
      break;
    case ContractTypeKind.Vector:
      write("Vector<");
      inner(type.vector.element);
      write(`, ${type.vector.max_len}>`);
      break;
    case ContractTypeKind.Array:
      write("[");
      inner(type.array.element);
      write(`; ${type.array.len}]`);
      break;
    case ContractTypeKind.Tuple:
      write("(");
      type.tuple.forEach((ty, i) => {
        if (i) write(", ");
        inner(ty);
      });
      write(")");
      break;
    case ContractTypeKind.SignedToken:
      write("SignedToken<");
      if (type.signed_token_preimage.preimage_type)
        inner(type.signed_token_preimage.preimage_type);
      else write("unknown");
      write(">");
      break;
    default:
      write(ContractTypeKind[type.v]?.toLowerCase() ?? `Unknown(${type.v})`);
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
  budget = new DisplayBudget(),
): SpecDefinitionView {
  const id = definitionId(definition);
  let members: string[];
  switch (definition.v) {
    case ContractTypeDefKind.TypeDefStruct:
      members = budget.rows(definition.struct_def.fields, (field) =>
        budget.format((write) => {
          write(field.name);
          write(": ");
          writeType(field.ty, write);
        }),
      );
      break;
    case ContractTypeDefKind.TypeDefEnum:
      members = budget.rows(definition.enum_def.variants, (variant) =>
        budget.format((write) => {
          write(variant.name);
          write(` = ${variant.value}`);
        }),
      );
      break;
    case ContractTypeDefKind.TypeDefUnion:
      members = budget.rows(definition.union_def.cases, (entry) =>
        budget.format((write) => {
          const payload = entry.case_type;
          write(entry.name);
          if (payload.v === ContractUnionCaseKind.UnionCaseTuple) {
            write("(");
            payload.tuple.forEach((ty, i) => {
              if (i) write(", ");
              writeType(ty, write);
            });
            write(")");
          } else if (payload.v === ContractUnionCaseKind.UnionCaseStruct) {
            write(" { ");
            payload.struct_fields.forEach((field, i) => {
              if (i) write(", ");
              write(field.name);
              write(": ");
              writeType(field.ty, write);
            });
            write(" }");
          }
          write(` = ${entry.discriminant}`);
        }),
      );
  }
  return {
    name: budget.text(id.declared),
    identity: budget.text(formatSpecId(id)),
    members,
  };
}

export interface SpecArgumentView {
  name: string;
  type: string;
  value: string;
}

export function formatArgumentValue(
  value: unknown,
  type: ContractType,
  budget = new DisplayBudget(),
  definitions: ReadonlyMap<string, ContractTypeDef> = new Map(),
): string {
  if (type.v === ContractTypeKind.Address && value instanceof Uint8Array)
    return budget.text(toBase58(value));
  if (
    typeof value === "bigint" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return budget.text(String(value));
  return formatSpecValue(value, budget, type, definitions);
}

/** Preserve wide integers and byte values when presenting a decoded event. */
export function formatSpecValue(
  value: unknown,
  budget = new DisplayBudget(),
  type?: ContractType,
  definitions: ReadonlyMap<string, ContractTypeDef> = new Map(),
): string {
  return budget.format((write) => {
    const quoted = (text: string) => {
      write('"');
      // Escape in small chunks; never allocate a serialized copy of a huge name.
      for (const char of text) write(JSON.stringify(char).slice(1, -1));
      write('"');
    };
    const visit = (item: unknown, ty?: ContractType, depth = 0): void => {
      if (depth >= 64) {
        quoted(TRUNCATED);
        budget.truncated = true;
        return;
      }
      if (ty?.v === ContractTypeKind.Option) {
        visit(item, ty.option_inner, depth + 1);
        return;
      }
      if (item instanceof Uint8Array) {
        if (ty?.v === ContractTypeKind.Address) quoted(toBase58(item));
        else {
          write('"0x');
          for (const byte of item) write(byte.toString(16).padStart(2, "0"));
          write('"');
        }
      } else if (typeof item === "string" || typeof item === "bigint")
        quoted(String(item));
      else if (item === null || item === undefined) write("null");
      else if (Array.isArray(item)) {
        write("[");
        item.forEach((child, i) => {
          if (i) write(", ");
          const childType =
            ty?.v === ContractTypeKind.Array
              ? ty.array.element
              : ty?.v === ContractTypeKind.Vector
                ? ty.vector.element
                : ty?.v === ContractTypeKind.Tuple
                  ? ty.tuple[i]
                  : undefined;
          visit(child, childType, depth + 1);
        });
        write("]");
      } else if (typeof item === "object") {
        const definition =
          ty?.v === ContractTypeKind.Named
            ? definitions.get(specIdKey(ty.named))
            : undefined;
        write("{");
        let count = 0;
        const field = (key: string, fieldType?: ContractType) => {
          if (count++) write(", ");
          quoted(key);
          write(": ");
          visit((item as Record<string, unknown>)[key], fieldType, depth + 1);
        };
        if (definition?.v === ContractTypeDefKind.TypeDefStruct)
          for (const entry of definition.struct_def.fields)
            field(entry.name, entry.ty);
        else if (definition?.v === ContractTypeDefKind.TypeDefUnion) {
          const union = item as { case: string; value: unknown };
          field("case");
          const payload = definition.union_def.cases.find(
            (entry) => entry.name === union.case,
          )?.case_type;
          if (payload?.v === ContractUnionCaseKind.UnionCaseTuple) {
            field("value", { v: ContractTypeKind.Tuple, tuple: payload.tuple });
          } else if (payload?.v === ContractUnionCaseKind.UnionCaseStruct) {
            write(', "value": {');
            payload.struct_fields.forEach((entry, index) => {
              if (index) write(", ");
              quoted(entry.name);
              write(": ");
              visit(
                (union.value as Record<string, unknown>)[entry.name],
                entry.ty,
                depth + 1,
              );
            });
            write("}");
          }
        } else for (const key in item) if (Object.hasOwn(item, key)) field(key);
        write("}");
      } else write(String(item));
    };
    visit(value, type);
  });
}

export function formatFields(
  fields: readonly { name: string; ty: ContractType }[],
  budget: DisplayBudget,
): string {
  return budget.format((write) =>
    fields.forEach((field, i) => {
      if (i) write(", ");
      write(field.name);
      write(": ");
      writeType(field.ty, write);
    }),
  );
}
