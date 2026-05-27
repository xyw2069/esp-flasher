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
        this.firmwareInput   = document.getElementById('firmwareFile');
        this.uploadArea      = document.getElementById('uploadArea');
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

        // 文件上传
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
        this.firmwareInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
            e.target.value = '';
        });

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

    onVersionChange() {
        const version = this.versionSelect.value;
        if (!this.selectedProduct || !version) return;
        this.infoFirmware.textContent = version;
        this.log(`固件版本: ${version}`, 'info');
        // 清空自定义文件，因为要用产品预设的
        this.firmwareFiles = [];
        this.renderFileList();
        this.updateStep1Button();
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

    /* ========================= 文件上传 ========================= */

    handleFiles(files) {
        for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.bin')) {
                this.log(`跳过: ${file.name}（仅支持 .bin 文件）`, 'warning');
                continue;
            }
            const exists = this.firmwareFiles.some(f => f.file.name === file.name);
            if (exists) {
                this.log(`已存在: ${file.name}`, 'warning');
                continue;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const addr = this.guessAddress(file.name, this.firmwareFiles.length);
                this.firmwareFiles.push({
                    file,
                    data: new Uint8Array(e.target.result),
                    address: addr,
                });
                this.renderFileList();
                this.updateStep1Button();
                this.log(`已加载: ${file.name} (${this.formatSize(file.size)})  -> 0x${addr.toString(16)}`, 'success');
            };
            reader.readAsArrayBuffer(file);
        }
    }

    guessAddress(filename, index) {
        const lower = filename.toLowerCase();
        if (lower.includes('bootloader'))  return 0x0;
        if (lower.includes('partition'))   return 0x8000;
        if (lower.includes('ota_data') || lower.includes('ota-data')) return 0xd000;
        if (lower.includes('app') || lower.includes('firmware'))      return 0x10000;
        if (lower.includes('littlefs') || lower.includes('spiffs'))   return 0x210000;
        // fallback
        return index === 0 ? 0x0 : 0x10000;
    }

    renderFileList() {
        this.fileList.innerHTML = '';
        this.firmwareFiles.forEach((fw, idx) => {
            const el = document.createElement('div');
            el.className = 'file-item';
            el.innerHTML = `
                <div class="file-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FB923C" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${fw.file.name}</div>
                    <div class="file-meta">
                        <span>${this.formatSize(fw.file.size)}</span>
                    </div>
                </div>
                <div class="file-address-row">
                    <label>地址</label>
                    <input type="text" value="0x${fw.address.toString(16)}"
                           data-idx="${idx}" class="file-addr-input">
                </div>
                <button class="file-remove" data-idx="${idx}" title="移除">&times;</button>
            `;
            this.fileList.appendChild(el);
        });

        // 事件委托
        this.fileList.querySelectorAll('.file-addr-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const i = parseInt(e.target.dataset.idx, 10);
                const val = parseInt(e.target.value.replace(/[^0-9a-fA-Fx]/g, ''), 16);
                if (!isNaN(val)) {
                    this.firmwareFiles[i].address = val;
                    this.log(`文件 ${this.firmwareFiles[i].file.name} 地址更新为 0x${val.toString(16)}`, 'info');
                }
            });
        });

        this.fileList.querySelectorAll('.file-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const i = parseInt(e.target.dataset.idx, 10);
                const removed = this.firmwareFiles.splice(i, 1);
                this.renderFileList();
                this.updateStep1Button();
                this.log(`已移除: ${removed[0].file.name}`, 'info');
            });
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
                onLog:     (msg, type) => this.log(msg, type),
                onProgress: (pct, stage, extra) => this.handleProgress(pct, stage, extra),
            });

            await this.flasher.connect();

            // 同步 bootloader 并检测芯片
            this.log('正在进入下载模式...', 'info');
            this.setStatus('busy', '同步中...');
            const chip = await this.flasher.syncAndDetect();
            this.log(`同步成功，芯片: ${CHIP_LABELS[chip] || chip}`, 'success');

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

        // 如果用户没有上传自定义文件，使用产品预设
        if (this.firmwareFiles.length === 0 && prod.firmware && prod.firmware.length > 0) {
            // 预设固件只用地址，文件需用户之前通过上传加载
            // 此处只显示地址信息
            this.sumFirmware.textContent = this.versionSelect.value || '-';
        } else {
            this.sumFirmware.textContent = this.firmwareFiles.length + ' 个文件';
        }

        const totalSize = this.firmwareFiles.reduce((s, f) => s + f.data.byteLength, 0);
        this.sumSize.textContent = this.formatSize(totalSize);

        // 文件列表
        this.flashFileList.innerHTML = '';
        this.firmwareFiles.forEach(fw => {
            const el = document.createElement('div');
            el.className = 'flash-file-entry';
            el.dataset.name = fw.file.name;
            el.innerHTML = `
                <span class="flash-file-status pending"></span>
                <span class="flash-file-name">${fw.file.name}</span>
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
            // 擦除
            if (this.eraseCheckbox.checked) {
                await this.flasher.eraseFlash();
            }

            // 逐个烧录
            for (let i = 0; i < this.firmwareFiles.length; i++) {
                if (this.flasher.isAborted) break;
                const fw = this.firmwareFiles[i];
                this.markFileStatus(fw.file.name, 'flashing');
                this.log(`烧录 [${i + 1}/${this.firmwareFiles.length}]: ${fw.file.name} -> 0x${fw.address.toString(16)}`, 'info');

                await this.flasher.flashOneFile(fw.data, fw.address, fw.file.name,
                    (pct, stage) => this.updateProgress(pct, stage)
                );

                this.markFileStatus(fw.file.name, 'done');
                this.log(`✓ ${fw.file.name} 完成`, 'success');
            }

            this.updateProgress(100, '完成');
            this.progressTitle.textContent = '烧录完成';
            this.toast('烧录完成！', 'success');
            this.log('===== 全部烧录完成 =====', 'success');
            this.setStatus('ready', '完成');

            // 自动断开
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
