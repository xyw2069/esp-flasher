/**
 * ESP32 Flasher — 基于 esptool-js 官方库
 * https://github.com/nickytonline/esptool-js
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
        // 动态加载 esptool-js
        if (!this._esptoolLoaded) {
            this.log('正在加载 esptool-js...', 'info');
            const module = await import('./esptool-bundle.js');
            window.ESPLoader = module.ESPLoader;
            window.Transport = module.Transport;
            this._esptoolLoaded = true;
        }

        this.log('正在请求串口...', 'info');
        const port = await navigator.serial.requestPort();
        this.transport = new Transport(port, true);

        this.log('正在初始化...', 'info');
        this.esploader = new ESPLoader({
            transport:    this.transport,
            baudrate:     this.baudRate,
            romBaudrate:  115200,
            terminal:     { clean() {}, writeLine(msg) {}, write(msg) {} },
            enableTracing: false,
        });

        this.log('正在同步并识别芯片...', 'info');
        this.chip = await this.esploader.main_fn();
        this.log(`芯片已识别: ${this.chip}`, 'success');
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

        // 监听写入进度
        const self = this;
        const originalWriter = this.esploader.write_flash;

        const fileArray = files.map(f => ({
            data:    f.data,
            address: f.address,
        }));

        try {
            await this.esploader.write_flash({
                fileArray:  fileArray,
                flashSize:  this.flashSize,
                flashMode:  this.flashMode,
                flashFreq:  this.flashFreq,
                compress:   true,
                reportProgress: (fileIndex, written, total) => {
                    if (self.isAborted) throw new Error('中止');
                    const file = files[fileIndex];
                    if (file) {
                        const pct = Math.floor((written / total) * 100);
                        self.onProgress(pct, `烧录 ${file.name}  (${written}/${total})`);
                        if (written === total) {
                            self.log(`  ${file.name} 完成`, 'success');
                        }
                    }
                },
            });

            this.onProgress(100, '完成');
            this.log('全部烧录完成', 'success');

            // 重启设备
            try { await this.esploader.hard_reset(); } catch (_) {}

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
