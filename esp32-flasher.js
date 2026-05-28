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
        this.onLog      = options.onLog     || (() => {});
        this.onProgress = options.onProgress || (() => {});

        this.transport = null;
        this.esploader = null;
        this.chip      = null;
        this.isFlashing = false;
        this.isAborted  = false;
    }

    log(msg, type = 'info') { this.onLog(msg, type); }

    async connect() {
        this.log('正在加载 esptool-js...', 'info');
        const module = await import('./esptool-bundle.js');
        const ESPLoader = module.ESPLoader;
        const Transport = module.Transport;

        this.log('正在请求串口...', 'info');
        const port = await navigator.serial.requestPort();

        // 创建传输层，tracing=true 输出调试日志
        this.transport = new Transport(port, true);

        this.esploader = new ESPLoader({
            transport: this.transport,
            baudrate:  115200,
        });

        this.log('正在连接并识别芯片（会自动进入下载模式）...', 'info');
        try {
            const chipName = await this.esploader.main();
            this.chip = chipName;
            this.log(`芯片已识别: ${chipName}`, 'success');
        } catch (err) {
            this.log('连接失败: ' + err.message, 'error');
            await this.disconnect();
            throw err;
        }
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
     * @param {{ name: string, address: number, data: string }[]} files
     *   data 是 base64 编码的固件内容
     */
    async flash(files) {
        if (!this.esploader) throw new Error('设备未连接');
        this.isFlashing = true;
        this.isAborted  = false;

        this.log(`开始烧录 ${files.length} 个文件...`, 'info');

        const self = this;
        const fileArray = files.map(f => ({
            data:    f.data,
            address: f.address,
        }));

        try {
            await this.esploader.writeFlash({
                fileArray:  fileArray,
                flashSize:  this.flashSize,
                flashMode:  this.flashMode,
                flashFreq:  this.flashFreq,
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

    abort() {
        this.isAborted = true;
        this.isFlashing = false;
        this.log('正在停止...', 'warning');
    }
}

window.ESP32Flasher = ESP32Flasher;
