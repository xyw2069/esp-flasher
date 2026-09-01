/**
 * ESP32 Flasher — 基于 esptool-js 官方库
 */

class ESP32Flasher {
    constructor(options = {}) {
        this.chipType   = options.chipType || 'esp32c3';
        this.baudRate   = options.baudRate || 460800;
        this.flashSize  = options.flashSize || '4MB';
        this.flashMode  = options.flashMode || 'dio';
        this.flashFreq  = options.flashFreq || '40m';
        this.eraseAll   = options.eraseAll || false;
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

        const baudRates = [this.baudRate, 460800, 115200]
            .filter((rate, index, rates) => rates.indexOf(rate) === index);
        // 页面要求用户手动进入下载模式，因此先保持当前模式读取 Bootloader；
        // 对支持 DTR/RTS 自动复位的开发板，再回退到自动复位连接。
        const resetModes = options.resetModes || ['no_reset', 'default_reset'];
        let lastError;

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

                    const modeLabel = resetMode === 'no_reset' ? '保持下载模式' : '自动复位';
                    this.log(`正在连接设备（${modeLabel}，速率 ${baudRate}）...`, 'info');
                    const chipName = await this.esploader.main(resetMode);
                    this.chip = chipName;
                    this.baudRate = baudRate;
                    this.log(`芯片已识别: ${chipName}，速率 ${baudRate}`, 'success');
                    return;
                } catch (err) {
                    lastError = err;
                    await this.disconnect();
                    if (baudRate !== baudRates[baudRates.length - 1]) {
                        this.log(`${baudRate} 连接超时，尝试降低速率...`, 'warning');
                    } else if (resetMode === resetModes[0]) {
                        this.log('保持下载模式连接失败，尝试自动复位...', 'warning');
                    }
                }
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
                    await this.connect(this.port, { resetModes: ['default_reset', 'no_reset'] });
                }
                await this.flash(files);
                return;
            } catch (err) {
                lastError = err;
                const message = String(err && err.message || err);
                // esptool-js may expose a generic connection/stub error instead
                // of the literal "Timeout" even though a lower baud rate fixes it.
                const isRecoverable = /timeout|timed out|failed to connect|invalid response|failed to start stub|unexpected response/i.test(message);
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
