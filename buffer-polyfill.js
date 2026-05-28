/**
 * 轻量 Buffer polyfill — 提供 esptool-js 需要的 Buffer.from / Buffer.alloc 等方法
 */
if (typeof Buffer === 'undefined') {
    class Buffer extends Uint8Array {
        static from(value, encodingOrOffset, length) {
            if (typeof value === 'string') {
                if (encodingOrOffset === 'base64') {
                    const binary = atob(value);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    return new Buffer(bytes.buffer);
                }
                if (encodingOrOffset === 'hex') {
                    const bytes = new Uint8Array(value.length / 2);
                    for (let i = 0; i < value.length; i += 2) {
                        bytes[i / 2] = parseInt(value.substr(i, 2), 16);
                    }
                    return new Buffer(bytes.buffer);
                }
                const encoder = new TextEncoder();
                return new Buffer(encoder.encode(value).buffer);
            }
            if (value instanceof ArrayBuffer) {
                return new Buffer(value, encodingOrOffset, length);
            }
            if (ArrayBuffer.isView(value)) {
                return new Buffer(value.buffer, value.byteOffset, value.byteLength);
            }
            if (Array.isArray(value)) {
                return new Buffer(new Uint8Array(value).buffer);
            }
            if (typeof value === 'number') {
                return new Buffer(new ArrayBuffer(value));
            }
            return new Buffer(new Uint8Array(0).buffer);
        }

        static alloc(size, fill) {
            const buf = new Buffer(size);
            if (fill !== undefined) buf.fill(fill);
            return buf;
        }

        static concat(list, totalLength) {
            if (totalLength === undefined) {
                totalLength = list.reduce((acc, buf) => acc + buf.byteLength, 0);
            }
            const result = new Buffer(totalLength);
            let offset = 0;
            for (const buf of list) {
                result.set(new Uint8Array(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength), offset);
                offset += buf.byteLength;
            }
            return result;
        }

        static isBuffer(obj) {
            return obj instanceof Buffer;
        }

        toString(encoding) {
            if (encoding === 'base64') {
                let binary = '';
                for (let i = 0; i < this.byteLength; i++) binary += String.fromCharCode(this[i]);
                return btoa(binary);
            }
            if (encoding === 'hex') {
                return Array.from(this).map(b => b.toString(16).padStart(2, '0')).join('');
            }
            return new TextDecoder().decode(this);
        }

        write(string, offset, length) {
            const encoded = new TextEncoder().encode(string);
            this.set(encoded.slice(0, length || this.byteLength), offset || 0);
            return encoded.byteLength;
        }

        readUInt32LE(offset) {
            return this[offset] | (this[offset+1] << 8) | (this[offset+2] << 16) | (this[offset+3] << 24) >>> 0;
        }

        readUInt16LE(offset) {
            return this[offset] | (this[offset+1] << 8);
        }

        readUInt8(offset) {
            return this[offset];
        }

        writeUInt32LE(value, offset) {
            this[offset]     = value & 0xFF;
            this[offset + 1] = (value >>> 8) & 0xFF;
            this[offset + 2] = (value >>> 16) & 0xFF;
            this[offset + 3] = (value >>> 24) & 0xFF;
        }

        writeUInt16LE(value, offset) {
            this[offset]     = value & 0xFF;
            this[offset + 1] = (value >>> 8) & 0xFF;
        }

        writeUInt8(value, offset) {
            this[offset] = value;
        }

        slice(start, end) {
            const sliced = super.slice(start, end);
            return new Buffer(sliced.buffer);
        }

        subarray(start, end) {
            const sub = super.subarray(start, end);
            return new Buffer(sub.buffer);
        }

        toJSON() {
            return { type: 'Buffer', data: Array.from(this) };
        }

        includes(val, byteOffset) {
            if (typeof val === 'number') {
                for (let i = byteOffset || 0; i < this.byteLength; i++) {
                    if (this[i] === val) return true;
                }
                return false;
            }
            return false;
        }

        indexOf(val, byteOffset) {
            if (typeof val === 'number') {
                for (let i = byteOffset || 0; i < this.byteLength; i++) {
                    if (this[i] === val) return i;
                }
                return -1;
            }
            return -1;
        }
    }

    window.Buffer = Buffer;
}
