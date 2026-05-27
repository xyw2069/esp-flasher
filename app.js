/**
 * ESP32 在线烧录工具 — 主应用
 */

class ESPFlashApp {
    constructor() {
        this.flasher       = null;
        this.isConnected   = false;
        this.currentStep   = 1;
        this.selectedProduct = null;
        this.firmwareFiles = [];   // [{ file, data: Uint8Array, address }]

        this.initElements();
        this.bindEvents();
        this.initProducts();
        this.checkSerialSupport();
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
        this.refreshVersions = document.getElementById('refreshVersions');
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
        this.sumProduct      = document.getElementById('sumProduct');
        this.sumChip         = document.getElementById('sumChip');
        this.sumFirmware     = document.getElementById('sumFirmware');
        this.sumSize         = document.getElementById('sumSize');
        this.progressTitle   = document.getElementById('progressTitle');
        this.progressPercent = document.getElementById('progressPercent');
        this.progressFill    = document.getElementById('progressFill');
        this.progressGlow    = document.getElementById('progressGlow');
        this.progressStage   = document.getElementById('progressStage');
        this.flashFileList   = document.getElementById('flashFileList');
        this.flashBtn        = document.getElementById('flashBtn');
        this.stopBtn         = document.getElementById('stopBtn');
        this.backStep2Btn    = document.getElementById('backStep2');

        // 日志
        this.logArea         = document.getElementById('logArea');
        this.clearLogBtn     = document.getElementById('clearLog');
        this.exportLogBtn    = document.getElementById('exportLog');
        this.autoScrollCheck = document.getElementById('autoScroll');

        // 状态点
        this.browserDot      = document.getElementById('browserDot');
    }

    bindEvents() {
        // 产品列表 (通过事件委托)
        this.productList.addEventListener('click', (e) => {
            const item = e.target.closest('.product-item');
            if (item) this.selectProduct(parseInt(item.dataset.id, 10));
        });

        // 版本下拉
        this.versionSelect.addEventListener('change', () => this.onVersionChange());

        // 步骤导航
        this.toStep2Btn.addEventListener('click', () => this.goToStep(2));
        this.toStep3Btn.addEventListener('click', () => this.goToStep(3));
        this.backStep1Btn.addEventListener('click', () => this.goToStep(1));
        this.backStep2Btn.addEventListener('click', () => this.goToStep(2));

        // 串口
        this.connectBtn.addEventListener('click', () => this.toggleConnection());

        // 烧录
        this.flashBtn.addEventListener('click', () => this.startFlash());
        this.stopBtn.addEventListener('click', () => this.stopFlash());

        // 日志
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.exportLogBtn.addEventListener('click', () => this.exportLog());
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

        this.selectedProduct = product;

        // 更新侧边栏选中态
        this.productList.querySelectorAll('.product-item').forEach(el => {
            el.classList.toggle('selected', parseInt(el.dataset.id, 10) === id);
        });

        // 更新 URL hash
        window.location.hash = `product_id=${id}`;

        // 更新信息栏
        this.infoProduct.textContent = product.name;
        this.infoChip.textContent    = CHIP_LABELS[product.chip] || product.chip;
        this.infoFirmware.textContent = '请选择版本';

        // 更新版本下拉
        this.versionSelect.innerHTML = '';
        this.versionSelect.disabled = false;
        this.refreshVersions.disabled = false;

        product.versions.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.tag;
            opt.textContent = `${v.tag}  (${v.date})${v.latest ? '  - 最新' : ''}`;
            opt.selected = v.latest;
            this.versionSelect.appendChild(opt);
        });

        // 应用产品默认配置
        this.baudRateSelect.value  = String(product.baudRate);
        this.flashSizeSelect.value = product.flashSize;
        this.flashModeSelect.value = product.flashMode;
        this.flashFreqSelect.value = product.flashFreq || '40m';

        // 清空之前的自定义文件
        this.firmwareFiles = [];
        this.fileList.innerHTML = '';

        this.onVersionChange();
        this.log(`已选择产品: ${product.name} (${CHIP_LABELS[product.chip]})`, 'info');
    }

    async onVersionChange() {
        const version = this.versionSelect.value;
        if (!this.selectedProduct || !version) return;
        this.infoFirmware.textContent = version;
        this.log(`固件版本: ${version}`, 'info');

        // 从服务器加载固件
        this.firmwareFiles = [];
        this.fileList.innerHTML = '<div class="file-loading">正在加载固件...</div>';
        this.toStep2Btn.disabled = true;

        try {
            await this.loadFirmwareFromServer(this.selectedProduct, version);
            this.renderFileList();
            this.updateStep1Button();
        } catch (err) {
            this.fileList.innerHTML = '';
            this.log(`固件加载失败: ${err.message}`, 'error');
        }
    }

    async loadFirmwareFromServer(product, versionTag) {
        // 查找版本信息
        const ver = product.versions.find(v => v.tag === versionTag);
        if (!ver) throw new Error(`未找到版本 ${versionTag}`);

        // 固件文件在 firmware/{firmwarePath}/{filename}
        const url = `${product.firmwarePath}/${ver.file}`;
        this.log(`正在从服务器加载固件: ${url}`, 'info');

        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buf = await resp.arrayBuffer();
            const data = new Uint8Array(buf);

            this.firmwareFiles.push({
                name: ver.file,
                data,
                address: ver.address,
                size: data.byteLength,
            });
            this.log(`  ${ver.file} (${this.formatSize(data.byteLength)}) -> 0x${ver.address.toString(16)}`, 'success');
        } catch (err) {
            this.log(`  ${ver.file} 加载失败: ${err.message}`, 'warning');
            this.firmwareFiles.push({
                name: ver.file,
                data: null,
                address: ver.address,
                size: 0,
                error: true,
            });
        }

        const loaded = this.firmwareFiles.filter(f => !f.error).length;
        this.log(`固件加载完成: ${loaded} 个文件`, loaded > 0 ? 'success' : 'error');
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
        this.fileList.innerHTML = '';
        this.firmwareFiles.forEach((fw) => {
            const el = document.createElement('div');
            el.className = `file-item${fw.error ? ' file-error' : ''}`;
            el.innerHTML = `
                <div class="file-icon${fw.error ? ' error' : ''}">
                    ${fw.error
                        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
                        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                    }
                </div>
                <div class="file-info">
                    <div class="file-name">${fw.name}</div>
                    <div class="file-meta">
                        <span>${fw.error ? '加载失败' : this.formatSize(fw.size)}</span>
                    </div>
                </div>
                <div class="file-address-row">
                    <label>地址</label>
                    <span class="file-addr-value">0x${fw.address.toString(16).padStart(6, '0')}</span>
                </div>
            `;
            this.fileList.appendChild(el);
        });
    }

    updateStep1Button() {
        // 至少有自定义上传的文件 或 选中了产品版本
        const hasCustomFiles = this.firmwareFiles.length > 0;
        const hasProduct = this.selectedProduct && this.versionSelect.value;
        this.toStep2Btn.disabled = !(hasCustomFiles || hasProduct);
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

        if (step === 3) this.prepareStep3();
    }

    /* ========================= 串口连接 ========================= */

    async toggleConnection() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        this.log('正在请求串口...', 'info');
        this.setStatus('busy', '连接中...');
        try {
            const chipType = this.selectedProduct ? this.selectedProduct.chip : 'esp32c3';
            const baudRate = parseInt(this.baudRateSelect.value, 10) || 460800;

            this.flasher = new ESP32Flasher({
                chipType,
                baudRate,
                flashSize: this.flashSizeSelect.value,
                flashMode: this.flashModeSelect.value,
                flashFreq: this.flashFreqSelect.value,
                onLog:     (msg, type) => this.log(msg, type),
                onProgress: (pct, stage, extra) => this.handleProgress(pct, stage, extra),
            });

            await this.flasher.connect();
            this.log(`芯片: ${this.flasher.chip}`, 'success');

            this.isConnected = true;

            this.connectBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                断开连接
            `;
            this.toStep3Btn.disabled = false;
            this.updateConnectionStatus('connected');
            this.showDevicePanel();
            this.toast('设备已连接', 'success');

        } catch (err) {
            this.log(`连接失败: ${err.message}`, 'error');
            this.updateConnectionStatus('error');
            this.toast(`连接失败: ${err.message}`, 'error');
        }
    }

    async disconnect() {
        if (this.flasher) {
            await this.flasher.disconnect();
            this.flasher = null;
        }
        this.isConnected = false;
        this.connectBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/>
                <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
            </svg>
            连接设备
        `;
        this.toStep3Btn.disabled = true;
        this.flashBtn.disabled   = true;
        this.updateConnectionStatus('disconnected');
        this.devicePanel.style.display = 'none';
    }

    showDevicePanel() {
        this.devicePanel.style.display = 'block';
        const chip = this.selectedProduct ? this.selectedProduct.chip : 'esp32c3';
        this.deviceInfo.innerHTML = `
            <div class="device-property">
                <span class="device-prop-label">芯片</span>
                <span class="device-prop-value">${CHIP_LABELS[chip] || chip}</span>
            </div>
            <div class="device-property">
                <span class="device-prop-label">波特率</span>
                <span class="device-prop-value">${this.baudRateSelect.value}</span>
            </div>
            <div class="device-property">
                <span class="device-prop-label">Flash</span>
                <span class="device-prop-value">${this.flashSizeSelect.value} ${this.flashModeSelect.value.toUpperCase()}</span>
            </div>
        `;
    }

    updateConnectionStatus(status) {
        const dot  = this.connectionStatus.querySelector('.status-dot');
        const text = this.connectionStatus.querySelector('.status-text');
        dot.className  = 'status-dot ' + status;
        const labels   = { connected: '已连接', disconnected: '未连接', error: '连接错误', busy: '请在弹窗中选择串口' };
        text.textContent = labels[status] || status;
    }

    setStatus(level, text) {
        this.infoStatus.className = `status-value ${level}`;
        this.infoStatus.textContent = text;
    }

    /* ========================= Step 3 准备 ========================= */

    prepareStep3() {
        const prod = this.selectedProduct;
        if (!prod) return;

        this.sumProduct.textContent = prod.name;
        this.sumChip.textContent    = CHIP_LABELS[prod.chip];
        this.sumFirmware.textContent = this.versionSelect.value || '-';

        const totalSize = this.firmwareFiles.reduce((s, f) => s + (f.data ? f.data.byteLength : 0), 0);
        this.sumSize.textContent = this.formatSize(totalSize);

        // 文件列表
        this.flashFileList.innerHTML = '';
        this.firmwareFiles.forEach(fw => {
            const el = document.createElement('div');
            el.className = 'flash-file-entry';
            el.dataset.name = fw.name;
            el.innerHTML = `
                <span class="flash-file-status pending"></span>
                <span class="flash-file-name">${fw.name}</span>
                <span class="flash-file-addr">0x${fw.address.toString(16).padStart(6,'0')}</span>
            `;
            this.flashFileList.appendChild(el);
        });

        // 重置进度
        this.resetProgress();

        // 如果已连接且有文件，启用烧录按钮
        this.flashBtn.disabled = !(this.isConnected && this.firmwareFiles.length > 0);
    }

    /* ========================= 烧录流程 ========================= */

    async startFlash() {
        if (!this.isConnected || !this.flasher) {
            this.toast('请先连接设备', 'warning');
            return;
        }
        if (this.firmwareFiles.length === 0) {
            this.toast('没有固件文件', 'warning');
            return;
        }

        this.flashBtn.style.display = 'none';
        this.stopBtn.style.display  = 'inline-flex';
        this.setStatus('busy', '烧录中...');
        this.progressTitle.textContent = '正在烧录...';

        try {
            // 构造 esptool-js 需要的文件数组（data 为 base64 编码）
            const files = this.firmwareFiles.map(fw => ({
                name:    fw.name,
                address: fw.address,
                data:    this.uint8ToBase64(fw.data),
            }));

            for (const fw of this.firmwareFiles) {
                this.markFileStatus(fw.name, 'flashing');
            }

            await this.flasher.flash(files);

            for (const fw of this.firmwareFiles) {
                this.markFileStatus(fw.name, 'done');
            }

            this.progressTitle.textContent = '烧录完成';
            this.toast('烧录完成！', 'success');
            this.log('===== 全部烧录完成 =====', 'success');
            this.setStatus('ready', '完成');

            setTimeout(() => this.disconnect(), 2000);

        } catch (err) {
            this.log(`烧录失败: ${err.message}`, 'error');
            this.toast(`烧录失败: ${err.message}`, 'error');
            this.setStatus('error', '失败');
        } finally {
            this.flashBtn.style.display = 'inline-flex';
            this.stopBtn.style.display  = 'none';
        }
    }

    uint8ToBase64(uint8) {
        let binary = '';
        for (let i = 0; i < uint8.byteLength; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        return btoa(binary);
    }

    stopFlash() {
        if (this.flasher) this.flasher.abort();
        this.toast('已停止', 'warning');
    }

    /* ========================= 进度管理 ========================= */

    handleProgress(pct, stage, extra) {
        if (pct !== undefined) this.updateProgress(pct, stage);
        if (extra?.currentFile) {
            // 可以用文件名高亮当前文件
        }
        if (extra?.fileDone) {
            this.markFileStatus(extra.fileDone, 'done');
        }
    }

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
        this.flashFileList.querySelectorAll('.flash-file-status').forEach(el => {
            el.className = 'flash-file-status pending';
        });
    }

    markFileStatus(name, status) {
        const entry = this.flashFileList.querySelector(`[data-name="${name}"] .flash-file-status`);
        if (entry) entry.className = `flash-file-status ${status}`;
    }

    /* ========================= 日志 ========================= */

    log(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        line.innerHTML = `<span class="timestamp">${this.timestamp()}</span>${this.escHtml(message)}`;
        this.logArea.appendChild(line);

        // 保留最近 500 条
        while (this.logArea.children.length > 500) {
            this.logArea.removeChild(this.logArea.firstChild);
        }

        if (this.autoScrollCheck.checked) {
            this.logArea.scrollTop = this.logArea.scrollHeight;
        }
    }

    clearLog() {
        this.logArea.innerHTML = '';
        this.log('日志已清空', 'info');
    }

    exportLog() {
        const lines = this.logArea.innerText;
        const blob  = new Blob([lines], { type: 'text/plain;charset=utf-8' });
        const url   = URL.createObjectURL(blob);
        const a     = document.createElement('a');
        a.href      = url;
        a.download  = `flash-log-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast('日志已导出', 'success');
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
            this.log('Web Serial API 可用', 'success');
        } else {
            this.browserDot.className = 'check-dot unsupported';
            this.browserDot.title = '浏览器不支持 Web Serial API，请使用 Chrome 89+ 或 Edge 89+';
            this.log('浏览器不支持 Web Serial API，请使用 Chrome 89+ 或 Edge 89+', 'error');
            this.connectBtn.disabled = true;
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
