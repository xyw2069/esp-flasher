/**
 * ESP32 Flasher — 基于 esptool-js 官方库
 */

class ESP32Flasher {
    constructor(options = {}) {
        this.chipType   = options.chipType || 'esp32c3';
        this.baudRate   = options.baudRate || 921600;
        this.flashSize  = options.flashSize || '4MB';
        this.flashMode  = options.flashMode || 'dio';
        this.flashFreq  = options.flashFreq || '40m';
        this.eraseAll   = options.eraseAll || false;
        this.verify     = options.verify === true;
        this.onLog      = options.onLog     || (() => {});
        this.onProgress = options.onProgress || (() => {});

        this.transport = null;
        this.esploader = null;
        this.chip      = null;
        this.port      = null;
        this.isFlashing = false;
        this.isAborted  = false;
    }

    log(msg, type = 'info') { this.onLog(msg, type); }

    async connect(port, options = {}) {
        this.log('正在加载 esptool-js...', 'info');
        const bundleUrl = new URL('./esptool-bundle.js', document.baseURI).href;
        let module;
        try {
            module = await import(bundleUrl);
        } catch (err) {
            throw new Error(`烧录器组件无法加载：${bundleUrl}（${err.message}）`);
        }
        const ESPLoader = module.ESPLoader;
        const Transport = module.Transport;

        if (!port) {
            this.log('正在请求串口...', 'info');
            port = await navigator.serial.requestPort();
        }
        this.port = port;

        const baudRates = (options.baudRates || [this.baudRate, 460800, 115200])
            .filter((rate, index, rates) => rates.indexOf(rate) === index);
        // Use automatic reset first so the normal connection path does not
        // spend time retrying a board that is not already in download mode.
        const resetModes = options.resetModes || ['default_reset'];
        let lastError;
        let stubUploadFailed = false;
        let uploadingStub = false;

        for (const resetMode of resetModes) {
            for (const baudRate of baudRates) {
                try {
                    // 关闭逐包追踪，并增大串口缓冲，减少高速传输丢包。
                    this.transport = new Transport(port, false);
                    this.esploader = new ESPLoader({
                        transport: this.transport,
                        // ROM 先以 115200 同步，再切换到目标速率。
                        baudrate: baudRate,
                        serialOptions: { bufferSize: 65536 },
                        terminal: {
                            clean: () => {},
                            writeLine: (message) => this.log(message),
                            write: (message) => this.log(message),
                        },
                    });

                    // CH340/USB-UART adapters on Windows can take longer than
                    // the esptool default while uploading the RAM stub.
                    this.esploader.DEFAULT_TIMEOUT = 10000;
                    this.esploader.MAX_TIMEOUT = 240000;
                    if (options.skipStub) {
                        this.esploader.runStub = async function () {
                            this.info('跳过 RAM 临时烧录程序，使用 ROM 直写模式');
                            this.IS_STUB = false;
                            return this.chip;
                        };
                    }

                    const modeLabel = resetMode === 'no_reset' ? '保持下载模式' : '自动复位';
                    this.log(`正在连接设备（${modeLabel}，速率 ${baudRate}）...`, 'info');
                    uploadingStub = !options.skipStub;
                    if (uploadingStub) {
                        this.log('提示：正在上传 RAM 临时烧录程序，可能需要几秒钟...', 'info');
                    }
                    const chipName = await this.esploader.main(resetMode);
                    uploadingStub = false;
                    this.chip = chipName;
                    this.baudRate = baudRate;
                    this.log(`芯片已识别: ${chipName}，速率 ${baudRate}`, 'success');
                    return;
                } catch (err) {
                    lastError = err;
                    if (uploadingStub) {
                        stubUploadFailed = true;
                    }
                    uploadingStub = false;
                    await this.disconnect();
                    if (baudRate !== baudRates[baudRates.length - 1]) {
                        this.log(`${baudRate} 连接失败：${err.message || err}，尝试降低速率...`, 'warning');
                    }
                }
            }
        }

        if (stubUploadFailed && !options.skipStub) {
            this.log('RAM 临时烧录程序上传失败，切换到 ESP32 ROM 直写模式...', 'warning');
            try {
                return await this.connect(port, {
                    baudRates: [115200],
                    resetModes: ['default_reset'],
                    skipStub: true,
                });
            } catch (romError) {
                lastError = romError;
                this.log(`ROM 直写模式也失败：${romError.message || romError}`, 'error');
            }
        }

        throw lastError || new Error('设备连接超时');
    }

    async disconnect() {
        if (this.transport) {
            try { await this.transport.disconnect(); } catch (_) {}
            this.transport = null;
            this.esploader = null;
        }
        this.log('已断开连接', 'info');
    }

    /**
     * 烧录固件
     * @param {{ name: string, address: number, data: Uint8Array }[]} files
     *   data 是二进制字节数组格式的固件内容
     */
    async flash(files) {
        if (!this.esploader) throw new Error('设备未连接');
        this.isFlashing = true;
        this.isAborted  = false;

        this.log(`开始烧录 ${files.length} 个文件...`, 'info');

        const self = this;
        const fileArray = files.map(f => ({
            data:    f.data instanceof Uint8Array ? f.data : Uint8Array.from(f.data, c => c.charCodeAt(0)),
            address: f.address,
        }));

        try {
            await this.esploader.writeFlash({
                fileArray:  fileArray,
                flashSize:  this.flashSize,
                flashMode:  this.flashMode,
                flashFreq:  this.flashFreq,
                eraseAll:   this.eraseAll,
                compress:   true,
                ...(this.verify ? { calculateMD5Hash: md5Hex } : {}),
                reportProgress: (fileIndex, written, total) => {
                    if (self.isAborted) return;
                    const file = files[fileIndex];
                    if (file) {
                        const pct = total > 0 ? Math.floor((written / total) * 100) : 0;
                        self.onProgress(pct, `烧录 ${file.name}  (${written}/${total})`);
                        if (written === total && total > 0) {
                            self.log(`  ${file.name} 完成`, 'success');
                        }
                    }
                },
            });

            this.onProgress(100, '完成');
            this.log('全部烧录完成', 'success');

            // 重启设备
            try { await this.esploader.hardReset(); } catch (_) {}

        } catch (err) {
            if (this.isAborted) {
                this.log('烧录已中止', 'warning');
            } else {
                throw err;
            }
        } finally {
            this.isFlashing = false;
        }
    }

    /**
     * 烧录阶段超时时，重新连接并自动降低串口速率重试。
     * 连接阶段的降速不能覆盖写 Flash 阶段的超时，因此这里也要重建 loader。
     */
    async flashWithFallback(files) {
        const baudRates = [this.baudRate, 460800, 115200]
            .filter((rate, index, rates) => rates.indexOf(rate) === index);
        let lastError;

        for (let index = 0; index < baudRates.length; index++) {
            const baudRate = baudRates[index];
            try {
                if (index > 0) {
                    this.log(`烧录超时，正在以 ${baudRate} 重连并重试...`, 'warning');
                    await this.disconnect();
                    this.baudRate = baudRate;
                    // A failed write may leave the ROM at the previous high speed.
                    // Auto-reset returns it to a known bootloader state before retrying.
                    await this.connect(this.port, { resetModes: ['default_reset'] });
                }
                await this.flash(files);
                return;
            } catch (err) {
                lastError = err;
                const message = String(err && err.message || err);
                // esptool-js may expose a generic connection/stub error instead
                // of the literal "Timeout" even though a lower baud rate fixes it.
                const isRecoverable = /timeout|timed out|failed to connect|invalid response|failed to start stub|unexpected response|no serial data|invalid head|serial .*error/i.test(message);
                if (!isRecoverable || index === baudRates.length - 1) {
                    throw err;
                }
            }
        }

        throw lastError || new Error('设备连接超时');
    }

    abort() {
        this.isAborted = true;
        this.isFlashing = false;
        this.log('正在停止...', 'warning');
    }
}

window.ESP32Flasher = ESP32Flasher;

// esptool-js calls this synchronously to calculate the expected post-write MD5.
function md5Hex(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const bitLength = bytes.length * 8;
    const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6;
    const data = new Uint8Array(paddedLength);
    data.set(bytes);
    data[bytes.length] = 0x80;
    const view = new DataView(data.buffer);
    view.setUint32(paddedLength - 8, bitLength >>> 0, true);
    view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const shifts = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000));

    for (let offset = 0; offset < data.length; offset += 64) {
        const words = new Uint32Array(16);
        for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true);
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;

        for (let i = 0; i < 64; i++) {
            let f;
            let g;
            if (i < 16) {
                f = (b & c) | (~b & d);
                g = i;
            } else if (i < 32) {
                f = (d & b) | (~d & c);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = (7 * i) % 16;
            }
            const previousD = d;
            const sum = (a + f + constants[i] + words[g]) >>> 0;
            d = c;
            c = b;
            b = (b + ((sum << shifts[i]) | (sum >>> (32 - shifts[i])))) >>> 0;
            a = previousD;
        }

        a0 = (a0 + a) >>> 0;
        b0 = (b0 + b) >>> 0;
        c0 = (c0 + c) >>> 0;
        d0 = (d0 + d) >>> 0;
    }

    const digest = new Uint8Array(16);
    const output = new DataView(digest.buffer);
    output.setUint32(0, a0, true);
    output.setUint32(4, b0, true);
    output.setUint32(8, c0, true);
    output.setUint32(12, d0, true);
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
