/**
 * ESP32 在线烧录工具 — 主应用
 */

class ESPFlashApp {
    constructor() {
        this.currentStep   = 1;
        this.selectedProduct = null;
        this.flasher       = null;
        this.isFlashing    = false;

        this.initElements();
        this.bindEvents();
        this.initProducts();
        this.checkSerialSupport();
        this.checkSecurePage();
    }

    /* ========================= 初始化 ========================= */

    initElements() {
        // 侧边栏
        this.productList    = document.getElementById('productList');
        this.devicePanel    = document.getElementById('devicePanel');
        this.deviceInfo     = document.getElementById('deviceInfo');

        // 信息栏
        this.infoProduct    = document.getElementById('infoProduct');
        this.infoChip       = document.getElementById('infoChip');
        this.infoFirmware   = document.getElementById('infoFirmware');
        this.infoStatus     = document.getElementById('infoStatus');

        // 步骤导航
        this.stepEls        = document.querySelectorAll('.step');
        this.stepLines      = document.querySelectorAll('.step-line');
        this.stepPanels     = document.querySelectorAll('.step-panel');

        // Step 1 - 固件
        this.versionSelect   = document.getElementById('versionSelect');
        this.fileList        = document.getElementById('fileList');
        this.baudRateSelect  = document.getElementById('baudRate');
        this.flashSizeSelect = document.getElementById('flashSize');
        this.flashModeSelect = document.getElementById('flashMode');
        this.flashFreqSelect = document.getElementById('flashFreq');
        this.eraseCheckbox   = document.getElementById('eraseFlash');
        this.verifyCheckbox  = document.getElementById('verifyFlash');
        this.toStep2Btn      = document.getElementById('toStep2');

        // Step 2 - 连接
        this.connectBtn      = document.getElementById('connectBtn');
        this.serialPortSelect = document.getElementById('serialPort');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusDetail     = document.getElementById('statusDetail');
        this.backStep1Btn     = document.getElementById('backStep1');
        this.toStep3Btn       = document.getElementById('toStep3');

        // Step 3 - 烧录
        this.progressTitle   = document.getElementById('progressTitle');
        this.progressPercent = document.getElementById('progressPercent');
        this.progressFill    = document.getElementById('progressFill');
        this.progressGlow    = document.getElementById('progressGlow');
        this.progressStage   = document.getElementById('progressStage');
        this.flashBtn        = document.getElementById('flashBtn');
        this.logArea         = document.getElementById('logArea');
        this.logVisibilityToggle = document.getElementById('logVisibilityToggle');
        this.copyLogBtn      = document.getElementById('copyLog');
        this.clearLogBtn     = document.getElementById('clearLog');

        // 状态点
        this.browserDot      = document.getElementById('browserDot');
    }

    bindEvents() {
        // 产品列表 (通过事件委托)
        this.productList.addEventListener('click', (e) => {
            const item = e.target.closest('.product-item');
            if (item && !this.isFlashing) this.selectProduct(parseInt(item.dataset.id, 10));
        });

        // 版本下拉
        this.versionSelect.addEventListener('change', () => this.onVersionChange());

        // 步骤导航
        this.toStep2Btn.addEventListener('click', () => this.goToStep(2));
        this.backStep1Btn.addEventListener('click', () => this.goToStep(1));
        this.toStep3Btn.addEventListener('click', () => this.goToStep(3));

        // 串口连接
        this.connectBtn.addEventListener('click', () => this.requestSerialPort());
        this.selectedPort = null;

        // 旧版 HTML 可能被 CDN 短暂缓存，避免缺少新按钮时阻断产品列表渲染。
        if (this.flashBtn) {
            this.flashBtn.addEventListener('click', () => this.startFlashing());
        }
        if (this.copyLogBtn) {
            this.copyLogBtn.addEventListener('click', () => this.copyLog());
        }
        if (this.clearLogBtn) {
            this.clearLogBtn.addEventListener('click', () => this.clearLog());
        }
        if (this.logVisibilityToggle) {
            this.logVisibilityToggle.addEventListener('change', () => {
                this.setLogVisibility(this.logVisibilityToggle.checked);
            });
            this.setLogVisibility(false);
        }
    }

    /* ========================= 产品系统 ========================= */

    initProducts() {
        this.renderProductList();

        const urlId = parseProductIdFromURL();
        if (urlId) {
            const product = PRODUCT_DB.find(p => p.id === urlId);
            if (product) {
                this.selectProduct(product.id);
                return;
            }
        }
        // 默认选中第一个
        if (PRODUCT_DB.length > 0) {
            this.selectProduct(PRODUCT_DB[0].id);
        }
    }

    selectProduct(id) {
        const product = PRODUCT_DB.find(p => p.id === id);
        if (!product) return;

        const isSwitchingProduct = this.selectedProduct && this.selectedProduct.id !== id;
        if (isSwitchingProduct && !this.isFlashing) {
            // A different product starts a fresh workflow. Do not reuse the
            // previous board's selected port or leave the user on step 3.
            this.selectedPort = null;
            this.resetConnectionStatus();
            this.goToStep(1);
            this.clearLog();
        }

        this.selectedProduct = product;

        // 更新侧边栏选中态
        this.productList.querySelectorAll('.product-item').forEach(el => {
            el.classList.toggle('selected', parseInt(el.dataset.id, 10) === id);
        });

        // 更新 URL hash
        window.location.hash = `product_id=${id}`;

        // 更新版本下拉
        this.versionSelect.innerHTML = '';
        this.versionSelect.disabled = false;

        product.versions.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.tag;
            opt.textContent = `${v.tag}  (${v.date})${v.latest ? '  - 最新' : ''}`;
            opt.selected = v.latest;
            this.versionSelect.appendChild(opt);
        });

        if (!this.versionSelect.value && product.versions.length > 0) {
            this.versionSelect.value = product.versions[0].tag;
        }

        this.infoProduct.textContent = product.name;
        this.infoChip.textContent    = CHIP_LABELS[product.chip] || product.chip;
        this.infoFirmware.textContent = this.versionSelect.value || '请选择版本';
        this.infoStatus.textContent = product.note || '就绪';

        // 应用产品默认配置
        this.baudRateSelect.value  = String(product.baudRate);
        this.flashSizeSelect.value = product.flashSize;
        this.flashModeSelect.value = product.flashMode;
        this.flashFreqSelect.value = product.flashFreq || '40m';

        // 清空之前的自定义文件
        this.firmwareFiles = [];
        if (this.fileList) this.fileList.innerHTML = '';

        this.toStep2Btn.disabled = false;
    }

    async onVersionChange() {
        const version = this.versionSelect.value;
        if (!this.selectedProduct || !version) return;
        this.infoFirmware.textContent = version;
        this.infoStatus.textContent = this.selectedProduct.note || '就绪';
    }

    renderProductList() {
        this.productList.innerHTML = '';
        PRODUCT_DB.forEach(p => {
            const el = document.createElement('div');
            el.className = 'product-item';
            el.dataset.id = p.id;
            el.innerHTML = `
                <div class="product-icon">${p.icon}</div>
                <div class="product-meta">
                    <div class="product-name">${p.name}</div>
                    <div class="product-chip">${CHIP_LABELS[p.chip] || p.chip}</div>
                </div>
            `;
            this.productList.appendChild(el);
        });
    }

    renderFileList() {
        // ESP Web Tools 自动处理固件文件，不需要手动渲染
        if (this.fileList) {
            this.fileList.innerHTML = '<div class="file-loading">固件将由烧录器自动加载</div>';
        }
    }

    updateStep1Button() {
        // 选中了产品版本即可
        const hasProduct = this.selectedProduct && this.versionSelect.value;
        this.toStep2Btn.disabled = !hasProduct;
    }

    /* ========================= 步骤导航 ========================= */

    goToStep(step) {
        this.currentStep = step;
        this.stepEls.forEach(el => {
            const s = parseInt(el.dataset.step, 10);
            el.classList.remove('active', 'done');
            if (s === step)  el.classList.add('active');
            if (s < step)    el.classList.add('done');
        });
        this.stepLines.forEach((line, i) => {
            line.classList.toggle('done', i < step - 1);
        });
        this.stepPanels.forEach((panel, i) => {
            panel.classList.toggle('active', i + 1 === step);
        });

        if (step === 2) {
            this.resetConnectionStatus();
        }

        if (step === 3) this.prepareStep3();
    }

    /* ========================= 串口连接 ========================= */

    async requestSerialPort() {
        try {
            this.writeLog('正在请求选择串口...', 'info');
            const port = await navigator.serial.requestPort();
            this.selectedPort = port;

            // 更新连接状态 UI
            this.connectionStatus.querySelector('.status-dot').className = 'status-dot connected';
            this.connectionStatus.querySelector('.status-text').textContent = '已连接';
            this.statusDetail.textContent = '串口已选择';
            const info = port.getInfo ? port.getInfo() : {};
            const usbInfo = info.usbVendorId && info.usbProductId
                ? `已选择串口（VID 0x${info.usbVendorId.toString(16)}，PID 0x${info.usbProductId.toString(16)}）`
                : '已选择串口';
            this.writeLog(usbInfo, 'success');

            // 启用"下一步"按钮
            this.toStep3Btn.disabled = false;
            this.goToStep(3);
        } catch (err) {
            if (err.name !== 'NotFoundError') {
                this.writeLog(`选择串口失败：${err.message || err}`, 'error');
                this.toast('串口连接失败', 'error');
            } else {
                this.writeLog('已取消选择串口。', 'warning');
            }
        }
    }

    resetConnectionStatus() {
        this.connectionStatus.querySelector('.status-dot').className = 'status-dot disconnected';
        this.connectionStatus.querySelector('.status-text').textContent = '未连接';
        this.statusDetail.textContent = '';
        this.toStep3Btn.disabled = !this.selectedPort;
    }

    setStatus(level, text) {
        this.infoStatus.className = `status-value ${level}`;
        this.infoStatus.textContent = text;
    }

    /* ========================= Step 3 准备 ========================= */

    prepareStep3() {
        if (!this.selectedProduct) return;

        // 重置进度
        this.resetProgress();

    }

    async startFlashing() {
        if (!this.selectedProduct || !this.selectedPort) {
            this.toast('请先选择产品并连接设备', 'error');
            return;
        }

        const version = this.selectedProduct.versions.find(
            item => item.tag === this.versionSelect.value
        );
        if (!version) {
            this.toast('请选择有效的固件版本', 'error');
            return;
        }

        this.flashBtn.disabled = true;
        this.isFlashing = true;
        this.setProductSelectionLocked(true);
        this.progressTitle.textContent = '正在加载固件...';
        this.clearLog();
        this.writeLog(`烧录工具版本：20260913；目标：${this.selectedProduct.name}`, 'system');
        this.writeLog(`配置：${this.baudRateSelect.value} baud，${this.flashSizeSelect.value}，${this.flashModeSelect.value.toUpperCase()}，${this.flashFreqSelect.value}`, 'info');

        try {
            const firmware = await this.loadFirmware(version);
            this.writeLog(`固件已加载：${firmware.name}，${this.formatSize(firmware.data.length)}，地址 0x${firmware.address.toString(16)}`, 'success');
            this.flasher = new ESP32Flasher({
                baudRate: parseInt(this.baudRateSelect.value, 10),
                flashSize: this.flashSizeSelect.value,
                flashMode: this.flashModeSelect.value,
                flashFreq: this.flashFreqSelect.value,
                eraseAll: this.eraseCheckbox.checked,
                verify: this.verifyCheckbox.checked,
                onLog: (message, type = 'info') => this.writeLog(message, type),
                onProgress: (percent, stage) => {
                    this.progressTitle.textContent = '正在烧录固件...';
                    this.updateProgress(percent, stage);
                },
            });

            this.progressTitle.textContent = '正在连接设备...';
            await this.flasher.connect(this.selectedPort);

            if (this.eraseCheckbox.checked) {
                this.progressTitle.textContent = '正在擦除 Flash...';
            }
            await this.flasher.flashWithFallback([firmware]);

            this.progressTitle.textContent = '烧录完成';
            this.updateProgress(100, '烧录完成');
            this.toast('烧录完成！', 'success');
        } catch (err) {
            console.error(err);
            this.progressTitle.textContent = '烧录失败';
            const message = err.message || '发生未知错误';
            this.progressStage.textContent = message;
            this.writeLog(`烧录失败：${message}`, 'error');
            const hint = /timeout|timed out|failed to connect|invalid response|failed to start stub|unexpected response|no serial data|invalid head|serial .*error/i.test(message)
                ? '（已自动尝试 460800 和 115200；仍失败时请重新进入下载模式后重试）'
                : '';
            this.toast(`烧录失败：${message}${hint}`, 'error');
        } finally {
            if (this.flasher) await this.flasher.disconnect();
            this.flasher = null;
            this.isFlashing = false;
            this.setProductSelectionLocked(false);
            this.flashBtn.disabled = false;
        }
    }

    async loadFirmware(version) {
        if (window.location.protocol === 'file:') {
            throw new Error('当前页面是通过 file:// 打开的，请先运行“启动服务器.bat”，再访问 http://localhost:8080');
        }
        const relativePath = `${this.selectedProduct.firmwarePath}/${version.file}`;
        const url = new URL(relativePath, document.baseURI).href;
        let response;
        try {
            response = await fetch(url, { cache: 'no-store' });
        } catch (err) {
            throw new Error(`固件无法下载：${url}（${err.message}）`);
        }
        if (!response.ok) throw new Error(`固件加载失败 (${response.status})：${url}`);

        const data = new Uint8Array(await response.arrayBuffer());
        return { name: version.file, address: version.address, data };
    }

    /* ========================= 进度管理 ========================= */

    updateProgress(pct, stage) {
        if (typeof pct === 'number') {
            this.progressFill.style.width   = pct + '%';
            this.progressGlow.style.width   = pct + '%';
            this.progressPercent.textContent = pct + '%';
        }
        if (stage) {
            this.progressStage.textContent = stage;
        }
    }

    resetProgress() {
        this.progressFill.style.width    = '0%';
        this.progressGlow.style.width    = '0%';
        this.progressPercent.textContent = '0%';
        this.progressStage.textContent   = '就绪';
        this.progressTitle.textContent   = '等待开始...';
    }

    setProductSelectionLocked(locked) {
        this.productList.classList.toggle('selection-locked', locked);
        this.productList.setAttribute('aria-disabled', String(locked));
    }

    setLogVisibility(visible) {
        if (this.logArea) this.logArea.hidden = !visible;
    }

    /* ========================= 烧录日志 ========================= */

    writeLog(message, type = 'info') {
        if (!this.logArea) return;
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = this.timestamp();
        const content = document.createElement('span');
        content.textContent = String(message).replace(/\r?\n/g, ' ');
        line.append(timestamp, content);
        this.logArea.appendChild(line);
        this.logArea.scrollTop = this.logArea.scrollHeight;
    }

    clearLog() {
        if (!this.logArea) return;
        this.logArea.replaceChildren();
    }

    async copyLog() {
        if (!this.logArea) return;
        const text = this.logArea.innerText.trim();
        if (!text) {
            this.toast('暂无烧录日志', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            this.toast('烧录日志已复制', 'success');
        } catch (_) {
            this.toast('无法复制日志，请直接选中日志内容', 'warning');
        }
    }

    /* ========================= 通知 ========================= */

    toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    /* ========================= 浏览器兼容性 ========================= */

    checkSerialSupport() {
        if ('serial' in navigator) {
            this.browserDot.className = 'check-dot supported';
            this.browserDot.title = 'Web Serial API 可用';
        } else {
            this.browserDot.className = 'check-dot unsupported';
            this.browserDot.title = '浏览器不支持 Web Serial API，请使用 Chrome 89+ 或 Edge 89+';
            this.connectBtn.disabled = true;
        }
    }

    checkSecurePage() {
        if (window.location.protocol === 'file:') {
            this.connectBtn.disabled = true;
            this.browserDot.className = 'check-dot unsupported';
            this.browserDot.title = '请通过 http://localhost:8080 或 HTTPS 打开页面';
            this.toast('请运行“启动服务器.bat”，再访问 http://localhost:8080', 'error');
        }
    }

    /* ========================= 工具方法 ========================= */

    timestamp() {
        return new Date().toLocaleTimeString('zh-CN', { hour12: false });
    }

    formatSize(bytes) {
        if (bytes < 1024)        return bytes + ' B';
        if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(2) + ' MB';
    }

    escHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
}

// 启动
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ESPFlashApp();
});
