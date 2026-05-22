export function readCompactUint128FromHex(value?: string) {
  const bytes = bytesFromHex(value);
  if (!bytes) return undefined;

  try {
    const reader = new CompactXdrReader(bytes);
    const result = reader.readUint128();
    return reader.remaining === 0 ? result : undefined;
  } catch {
    return undefined;
  }
}

function bytesFromHex(value?: string) {
  if (!value) return undefined;

  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0 || !/^[\da-f]*$/i.test(hex)) return undefined;

  return Buffer.from(hex, "hex");
}

class CompactXdrReader {
  #position = 0;

  constructor(private readonly data: Uint8Array) {}

  get remaining() {
    return this.data.length - this.#position;
  }

  readUint128() {
    return (this.readUnsigned() << BigInt(64)) | this.readUnsigned();
  }

  private readUnsigned() {
    const header = this.readByte();
    const size = (header & 0xc0) >> 6;
    const value = header & 0x3f;

    if (value !== 63) {
      if (size !== 0) throw new Error(`Invalid CXS unsigned header: 0x${header.toString(16)}`);
      return BigInt(value);
    }

    const byteLength = [1, 2, 4, 8][size];
    this.ensure(byteLength);

    let result = BigInt(0);
    for (let index = byteLength - 1; index >= 0; index -= 1) {
      result = (result << BigInt(8)) | BigInt(this.data[this.#position + index]);
    }
    this.#position += byteLength;

    const minimum = [BigInt(63), BigInt(256), BigInt(65536), BigInt(4294967296)][size];
    if (result < minimum) throw new Error("Non-minimal CXS unsigned encoding");

    return result;
  }

  private readByte() {
    this.ensure(1);
    const value = this.data[this.#position];
    this.#position += 1;
    return value;
  }

  private ensure(length: number) {
    if (this.#position + length > this.data.length) {
      throw new Error(`CXS read past end: need ${length} bytes, have ${this.remaining}`);
    }
  }
}
