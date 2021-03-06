/*
 * Copyright 2017 The OpenYOLO for Web Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

let subtleCrypto: SubtleCrypto|null = null;
if (window.crypto) {
  // Fix for Safari.
  subtleCrypto = window.crypto.subtle || (window.crypto as any)['webkitSubtle'];
}

/**
 * Generates a random string ID.
 */
export function generateId(): string {
  let buf = new Uint32Array(2);
  window.crypto.getRandomValues(buf);
  return buf[0].toString(16) + buf[1].toString(16);
}

/**
 * Returns the SHA-256 hash of the string given.
 * https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 *
 * TODO(tch): Find a better fallback mechanism.
 */
export async function sha256(str: string): Promise<string> {
  // To avoid issues where crypto is not available, return the ID without
  // hashing it.
  if (!subtleCrypto) {
    return Promise.resolve(str);
  }
  // Transform the string into an arraybuffer.
  const buffer = encodeStringToBuffer(str);
  try {
    const hash = await subtleCrypto.digest('SHA-256', buffer);
    return hex(hash);
  } catch (e) {
    // Insecure origin error. Fallback to passing the un-hashed string.
    return Promise.resolve(str);
  }
}

function encodeStringToBuffer(str: string): ArrayBuffer {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder('utf-8').encode(str);
  }
  // Polyfill the encoding.
  return new Uint8Array(stringToUtf8ByteArray(str));
}

/**
 * Converts a JS string to a UTF-8 "byte" array.
 * Taken from Closure Crypt library.
 */
function stringToUtf8ByteArray(str: string): number[] {
  const out = [];
  let p = 0;
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 128) {
      out[p++] = c;
    } else if (c < 2048) {
      out[p++] = (c >> 6) | 192;
      out[p++] = (c & 63) | 128;
    } else if (
        ((c & 0xFC00) === 0xD800) && (i + 1) < str.length &&
        ((str.charCodeAt(i + 1) & 0xFC00) === 0xDC00)) {
      // Surrogate Pair
      c = 0x10000 + ((c & 0x03FF) << 10) + (str.charCodeAt(++i) & 0x03FF);
      out[p++] = (c >> 18) | 240;
      out[p++] = ((c >> 12) & 63) | 128;
      out[p++] = ((c >> 6) & 63) | 128;
      out[p++] = (c & 63) | 128;
    } else {
      out[p++] = (c >> 12) | 224;
      out[p++] = ((c >> 6) & 63) | 128;
      out[p++] = (c & 63) | 128;
    }
  }
  return out;
};

/**
 * Computes the hex digest of an ArrayBuffer.
 */
function hex(buffer: ArrayBuffer) {
  const hexCodes = [];
  const view = new DataView(buffer);
  for (let i = 0; i < view.byteLength; i += 4) {
    // Using getUint32 reduces the number of iterations needed (we process 4
    // bytes each time)
    const value = view.getUint32(i);
    // toString(16) will give the hex representation of the number
    // without padding
    const stringValue = value.toString(16);
    // Use concatenation and slice for padding
    const padding = '00000000';
    const paddedValue = (padding + stringValue).slice(-padding.length);
    hexCodes.push(paddedValue);
  }

  // Join all the hex strings into one
  return hexCodes.join('');
}

export function noDataValidator(value: any) {
  return !value;
}

/**
 * Ensures that the provided value is a non-empty string.
 */
export function stringValidator(value: any): boolean {
  return !!value && typeof value === 'string' && value.length > 0;
}

/**
 * Utility to handle a promise result. It allows for more readable code
 * as this pattern is often used.
 */
export class PromiseResolver<T> {
  readonly promise: Promise<T>;
  protected resolveFn: ((result?: T) => void)|null;
  protected rejectFn: ((error: Error) => void)|null;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });
  }

  resolve(result?: T): void {
    if (!this.resolveFn) throw new Error('Promise Resolver already disposed.');
    this.resolveFn(result);
    this.dispose();
  }

  reject(error: Error): void {
    if (!this.rejectFn) throw new Error('Promise Resolver already disposed.');
    this.rejectFn(error);
    this.dispose();
  }

  dispose(): void {
    this.resolveFn = null;
    this.rejectFn = null;
  }
}

/**
 * A promise resolver which automatically rejects after a specified timeout.
 */
export class TimeoutPromiseResolver<T> extends PromiseResolver<T> {
  private timeoutId: number;
  constructor(private timeoutError: Error, timeoutMs: number) {
    super();
    this.timeoutId = setTimeout(this.timeoutReject.bind(this), timeoutMs);
  }

  resolve(result?: T): void {
    super.resolve(result);
    clearTimeout(this.timeoutId);
  }

  reject(error: Error): void {
    super.reject(error);
    clearTimeout(this.timeoutId);
  }

  private timeoutReject() {
    if (!this.rejectFn) {
      return;
    }
    this.reject(this.timeoutError);
  }
}

export function timeoutPromise<T>(error: Error, timeoutMs: number): Promise<T> {
  let promiseResolver = new TimeoutPromiseResolver(error, timeoutMs);
  return promiseResolver.promise;
}
