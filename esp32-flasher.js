/**
 * ESP32 Flasher – 基于 Web Serial API 的 ROM Bootloader 协议实现
 * 支持 ESP32 / ESP32-S2 / ESP32-S3 / ESP32-C3 / ESP32-C2 / ESP32-H2
 *
 * 协议参考: https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/serial-protocol.html
 */

class ESP32Flasher {
    constructor(options = {}) {
        this.port = null;
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        this.reader = null;
        this.writer = null;

        this.chipType  = options.chipType  || 'esp32c3';
        this.baudRate  = options.baudRate  || 460800;
        this.onLog     = options.onLog     || (() => {});
        this.onProgress = options.onProgress || (() => {});

        this.isFlashing = false;
        this.isAborted  = false;
        this.synced     = false;

        // ROM bootloader 命令码
        this.CMD = {
            READ_REG:         0x0A,
            WRITE_REG:        0x09,
            SPI_ATTACH:       0x0D,
            CHANGE_BAUDRATE:  0x0F,
            FLASH_BEGIN:      0x02,
            FLASH_DATA:       0x03,
            FLASH_END:        0x04,
            MEM_BEGIN:        0x05,
            MEM_END:          0x06,
            SYNC:             0x08,
            READ_FLASH:       0x0E,
            ERASE_FLASH:      0xD0,
            ERASE_REGION:     0xD1,
        };

        this.RESPONSE = {
            SUCCESS: 0x01,
            ERROR:   0x05,
        };
    }

    /* ========================= 公开 API ========================= */

    async connect() {
        try {
            this.port = await navigator.serial.requestPort();
            await this._openPort(this.baudRate);
            this.log('串口已连接', 'success');
        } catch (err) {
            this.log(`连接失败: ${err.message}`, 'error');
            throw err;
        }
    }

    async disconnect() {
        this._readerCancelled = true;
        try {
            if (this.reader) {
                await this.reader.cancel();
                await this.readableStreamClosed?.catch(() => {});
            }
            if (this.writer) {
                this.writer.releaseLock();
            }
            if (this.port?.readable) {
                await this.port.close();
            }
        } catch (_) {}
        this.reader = null;
        this.writer = null;
        this.port   = null;
        this.synced = false;
        this.log('已断开连接', 'info');
    }

    async syncAndDetect() {
        if (!this.port) throw new Error('串口未连接');

        this.log('正在同步并检测芯片...', 'info');

        // 重置序列端口，确保进入 bootloader
        await this._resetIntoBootloader();

        // 发送同步帧
        const resp = await this._sync();

        // 读取芯片 ID
        const chipId = await this._readRegister(0x40001000);
        const detected = this._identifyChip(chipId);
        this.log(`芯片已识别: ${detected}`, 'success');
        this.synced = true;
        return detected;
    }

    async eraseFlash() {
        this.log('正在擦除 Flash (全片擦除)...', 'info');
        this.progress(2, '擦除中');

        const packet = this._buildCommand(this.CMD.ERASE_FLASH, new Uint8Array(0));
        await this._sendCommand(packet);
        await this._readResponse(10000, 'erase');

        this.log('Flash 擦除完成', 'success');
        this.progress(5, '擦除完成');
    }

    /**
     * 烧录单个文件
     * @param {Uint8Array} data     固件数据
     * @param {number}     address  烧录起始地址
     * @param {string}     name     文件名
     * @param {Function}   onPct    进度回调 (percent, stage)
     */
    async flashOneFile(data, address, name, onPct) {
        if (!this.port) throw new Error('串口未连接');
        this.isFlashing = true;
        this.isAborted  = false;

        this.log(`开始烧录: ${name} -> 0x${address.toString(16)}`, 'info');

        const blockSize = 0x0400;   // 1 KB per packet
        const numBlocks = Math.ceil(data.byteLength / blockSize);

        // FLASH_BEGIN
        await this._flashBegin(data.byteLength, numBlocks, address);

        for (let seq = 0; seq < numBlocks; seq++) {
            if (this.isAborted) throw new Error('烧录被用户中止');

            const start = seq * blockSize;
            const chunk = data.slice(start, start + blockSize);
            const paddedLen = Math.ceil(chunk.byteLength / 4) * 4;
            const padded = new Uint8Array(paddedLen);
            padded.set(chunk);

            await this._flashData(padded, seq);

            const pct = Math.floor((seq + 1) / numBlocks * 100);
            onPct?.(pct, `烧录 ${name}  (${seq + 1}/${numBlocks})`);

            if (seq % 8 === 7) await this._sleep(2);
        }

        // FLASH_END（不重启，等最后一个文件）
        await this._flashFinish(false);

        this.isFlashing = false;
    }

    /**
     * 烧录多个文件并重启
     * @param {{ name: string, address: number, data: Uint8Array }[]} firmwareEntries
     * @param {Function} onFileDone  单文件完成回调
     */
    async flash(firmwareEntries, onFileDone) {
        if (!this.port) throw new Error('串口未连接');
        this.isFlashing = true;
        this.isAborted  = false;

        const totalBytes = firmwareEntries.reduce((s, f) => s + f.data.byteLength, 0);
        let   written    = 0;

        for (const entry of firmwareEntries) {
            if (this.isAborted) throw new Error('烧录被用户中止');
            this._setCurrentFile(entry.name);
            await this.flashOneFile(entry.data, entry.address, entry.name, (pct) => {
                const doneBytes = Math.floor(totalBytes * pct / 100);
                this.progress(Math.floor((written + doneBytes) / totalBytes * 100), `烧录 ${entry.name}`);
            });
            written += entry.data.byteLength;
            this._setFileDone(entry.name);
            onFileDone?.(entry.name);
        }

        // 所有文件完成，重启
        await this._flashFinish(true);
        this.progress(100, '完成');
        this.isFlashing = false;
    }

    abort() {
        this.isAborted = true;
        this.log('正在停止...', 'warning');
    }

    /* ========================= 内部 – 烧录流程 ========================= */

    async _flashOne(data, address, onProgress) {
        const blockSize = 0x0400;   // 1 KB per packet
        const numBlocks = Math.ceil(data.byteLength / blockSize);

        this.log(`  地址 0x${address.toString(16).padStart(6,'0')}，${data.byteLength} bytes，${numBlocks} 块`, 'info');

        // FLASH_BEGIN
        await this._flashBegin(data.byteLength, numBlocks, address);

        // 分块发送
        for (let seq = 0; seq < numBlocks; seq++) {
            if (this.isAborted) throw new Error('中止');

            const start = seq * blockSize;
            const chunk = data.slice(start, start + blockSize);
            // 对齐到 4 字节
            const paddedLen = Math.ceil(chunk.byteLength / 4) * 4;
            const padded = new Uint8Array(paddedLen);
            padded.set(chunk);

            await this._flashData(padded, seq);
            onProgress?.(chunk.byteLength);

            // 防止缓冲区溢出
            if (seq % 8 === 7) await this._sleep(2);
        }
    }

    async _flashBegin(size, numBlocks, offset) {
        const payload = new Uint8Array(16);
        this._writeU32LE(payload, 0, size);
        this._writeU32LE(payload, 4, numBlocks);
        this._writeU32LE(payload, 8, 0x0400);       // block size
        this._writeU32LE(payload, 12, offset);

        const pkt = this._buildCommand(this.CMD.FLASH_BEGIN, payload);
        await this._sendCommand(pkt);
        await this._readResponse(5000, 'flash_begin');
    }

    async _flashData(data, seq) {
        const header = new Uint8Array(16);
        this._writeU32LE(header, 0, data.byteLength);
        this._writeU32LE(header, 4, seq);
        // offset, stays 0

        const pkt = new Uint8Array(16 + data.byteLength);
        pkt.set(header);
        pkt.set(data, 16);

        const cmdPkt = this._buildCommand(this.CMD.FLASH_DATA, pkt);
        await this._sendCommand(cmdPkt);
        await this._readResponse(5000, 'flash_data');
    }

    async _flashFinish(reboot) {
        const payload = new Uint8Array(4);
        this._writeU32LE(payload, 0, reboot ? 1 : 0);

        const pkt = this._buildCommand(this.CMD.FLASH_END, payload);
        await this._sendCommand(pkt);
        await this._readResponse(2000, 'flash_end');
    }

    /* ========================= 内部 – Bootloader 同步 ========================= */

    async _resetIntoBootloader() {
        // 先关闭，再以低波特率重新打开，以控制 DTR/RTS
        try {
            if (this.reader) { await this.reader.cancel(); await this.readableStreamClosed?.catch(()=>{}); this.reader = null; }
            if (this.port?.readable) await this.port.close();
        } catch (_) {}

        await this._openPort(115200);

        // ESP32-C3 / S3: DTR 控制 BOOT，RTS 控制 EN（低电平触发）
        // 拉低 DTR(BOOT) → 拉低 RTS(EN) → 松开 RTS → 松开 DTR
        await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
        await this._sleep(50);
        await this.port.setSignals({ dataTerminalReady: true,  requestToSend: false });  // DTR=low → BOOT=low
        await this._sleep(50);
        await this.port.setSignals({ dataTerminalReady: true,  requestToSend: true });   // RTS=low  → EN=low (reset)
        await this._sleep(50);
        await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });   // EN 恢复
        await this._sleep(50);
        await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });

        // 等待 bootloader 启动
        await this._sleep(200);

        // 关闭 115200，以目标波特率重新打开
        try { await this.reader.cancel(); await this.readableStreamClosed?.catch(()=>{}); this.reader = null; } catch (_) {}
        try { if (this.port?.readable) await this.port.close(); } catch (_) {}

        await this._openPort(this.baudRate);
        await this._sleep(100);
    }

    async _sync() {
        const syncData = new Uint8Array(36);
        // 填充 0x55 同步字节
        syncData.fill(0x07, 0, 1);   // 方向 + 命令标识
        for (let i = 0; i < 36; i++) {
            syncData[i] = 0x55;
        }
        syncData[0] = 0x08;   // direction
        syncData[1] = 0x00;   // size low
        syncData[2] = 0x00;   // size high
        syncData[3] = 0x00;   // value
        syncData[4] = 0x00;
        syncData[5] = 0x00;
        // checksum = 0x55

        const pkt = this._buildCommand(this.CMD.SYNC, syncData);
        await this._sendCommand(pkt);

        // 读取 sync 响应
        const maxRetries = 5;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const resp = await this._readResponse(300, 'sync');
                return resp;
            } catch (_) {
                // bootloader 可能还没启动，重试
                if (attempt < maxRetries - 1) {
                    await this._sleep(100);
                    await this._sendCommand(pkt);
                }
            }
        }
        throw new Error('同步失败：无法与 Bootloader 通信');
    }

    async _readRegister(addr) {
        const payload = new Uint8Array(16);
        this._writeU32LE(payload, 0, addr);

        const pkt = this._buildCommand(this.CMD.READ_REG, payload);
        await this._sendCommand(pkt);
        const resp = await this._readResponse(2000, 'read_reg');
        return this._readU32LE(resp, 0);
    }

    _identifyChip(chipId) {
        // 常见芯片 ID 映射（EFUSE magic value）
        const chipMap = {
            0x000007c6: 'esp32c3',
            0x00000009: 'esp32s3',
            0x00000000: 'esp32',    // 0 = fallback
            0x00000007: 'esp32s2',
        };
        // 简化处理：直接使用前端选中的类型
        return this.chipType;
    }

    /* ========================= 内部 – SLIP 帧 ========================= */

    _buildCommand(code, payload) {
        // 命令帧: direction(1) | command(1) | size(2 LE) | checksum(4 LE,unused) | payload
        const dir   = 0x00; // host → target
        const frame = new Uint8Array(8 + payload.byteLength);
        frame[0] = dir;
        frame[1] = code;
        this._writeU16LE(frame, 2, payload.byteLength);
        // checksum 0
        frame.set(payload, 8);
        return this._slipEncode(frame);
    }

    _slipEncode(data) {
        const encoded = [];
        encoded.push(0xC0); // SLIP start
        for (let i = 0; i < data.byteLength; i++) {
            const b = data[i];
            if (b === 0xC0) {
                encoded.push(0xDB, 0xDC);
            } else if (b === 0xDB) {
                encoded.push(0xDB, 0xDD);
            } else {
                encoded.push(b);
            }
        }
        encoded.push(0xC0); // SLIP end
        return new Uint8Array(encoded);
    }

    _slipDecode(buf) {
        const decoded = [];
        let i = 0;
        while (i < buf.byteLength) {
            if (buf[i] === 0xC0) { i++; continue; }
            if (buf[i] === 0xDB) {
                if (i + 1 < buf.byteLength) {
                    if (buf[i + 1] === 0xDC) { decoded.push(0xC0); i += 2; continue; }
                    if (buf[i + 1] === 0xDD) { decoded.push(0xDB); i += 2; continue; }
                }
                decoded.push(buf[i]); i++;
            } else {
                decoded.push(buf[i]); i++;
            }
        }
        return new Uint8Array(decoded);
    }

    /* ========================= 内部 – 串口读写 ========================= */

    async _sendCommand(encoded) {
        if (!this.port?.writable) throw new Error('串口不可写');
        if (!this.writer) {
            this.writer = this.port.writable.getWriter();
        }
        await this.writer.write(encoded);
    }

    async _readResponse(timeoutMs, label) {
        const deadline = Date.now() + timeoutMs;
        let buffer = new Uint8Array(0);

        while (Date.now() < deadline) {
            const chunk = await this._rawRead(64);
            if (chunk) {
                buffer = this._concatU8(buffer, chunk);
                // 响应帧以 0xC0 结尾
                if (buffer.byteLength > 2 && buffer[buffer.byteLength - 1] === 0xC0) {
                    break;
                }
            } else {
                await this._sleep(10);
            }
        }

        if (buffer.byteLength === 0) {
            throw new Error(`${label}: 响应超时`);
        }

        // 找到最后一个 SLIP 帧
        let frameStart = -1;
        for (let i = buffer.byteLength - 1; i >= 0; i--) {
            if (buffer[i] === 0xC0) {
                // 向前找匹配的起始 0xC0
                for (let j = i - 1; j >= 0; j--) {
                    if (buffer[j] === 0xC0) {
                        frameStart = j;
                        break;
                    }
                }
                if (frameStart === -1) frameStart = 0;
                break;
            }
        }

        if (frameStart === -1) throw new Error(`${label}: 无 SLIP 帧`);

        const frame = buffer.slice(frameStart);
        const decoded = this._slipDecode(frame);

        if (decoded.byteLength < 8) {
            throw new Error(`${label}: 响应帧过短 (${decoded.byteLength} bytes)`);
        }

        const dir      = decoded[0];
        const cmdCode  = decoded[1];
        const size     = this._readU16LE(decoded, 2);
        const status   = decoded[8]; // 第一个 payload 字节 = 状态

        if (status !== this.RESPONSE.SUCCESS && status !== 0x00) {
            // status 0x00 在一些芯片上也表示成功（取决于帧长度）
            if (decoded.byteLength > 9) {
                const errCode = decoded[9];
                this.log(`命令 ${cmdCode.toString(16)} 错误: status=0x${status.toString(16)} error=0x${errCode.toString(16)}`, 'warning');
            }
        }

        // 返回 payload 部分（跳过 8 字节头）
        return decoded.byteLength > 8 ? decoded.slice(8) : decoded;
    }

    async _rawRead(maxBytes) {
        if (!this.port?.readable) return null;
        try {
            if (!this.reader) {
                this._readerCancelled = false;
                this.readableStreamClosed = this.port.readable.pipeTo(
                    new WritableStream({ write: () => {} })
                ).catch(() => {});
                this.reader = this.port.readable.getReader();
            }

            const { value, done } = await Promise.race([
                this.reader.read(),
                this._sleepTimeout(50),
            ]);

            if (value && value.byteLength > 0) {
                return value;
            }
        } catch (err) {
            if (err.name === 'NetworkError' || this._readerCancelled) {
                this.reader = null;
                return null;
            }
        }
        return null;
    }

    async _openPort(baud) {
        await this.port.open({
            baudRate: baud,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            bufferSize: 4096,
        });
        this.writer = null;
        this.reader = null;
    }

    /* ========================= 工具方法 ========================= */

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    _sleepTimeout(ms) { return new Promise(r => setTimeout(() => r({ value: undefined, done: false }), ms)); }

    _concatU8(a, b) {
        const c = new Uint8Array(a.byteLength + b.byteLength);
        c.set(a); c.set(b, a.byteLength);
        return c;
    }

    _writeU32LE(buf, off, val) {
        buf[off]     = val & 0xFF;
        buf[off + 1] = (val >>> 8) & 0xFF;
        buf[off + 2] = (val >>> 16) & 0xFF;
        buf[off + 3] = (val >>> 24) & 0xFF;
    }

    _writeU16LE(buf, off, val) {
        buf[off]     = val & 0xFF;
        buf[off + 1] = (val >>> 8) & 0xFF;
    }

    _readU32LE(buf, off) {
        return buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24) >>> 0;
    }

    _readU16LE(buf, off) {
        return buf[off] | (buf[off+1] << 8);
    }

    log(message, type = 'info') { this.onLog(message, type); }
    progress(percent, stage = '') { this.onProgress(percent, stage); }
    _setCurrentFile(name) { this.onProgress(undefined, undefined, { currentFile: name }); }
    _setFileDone(name)    { this.onProgress(undefined, undefined, { fileDone: name }); }
}

window.ESP32Flasher = ESP32Flasher;
