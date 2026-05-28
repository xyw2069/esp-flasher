/**
 * ESP32 在线烧录工具 — 主应用
 */

class ESPFlashApp {
    constructor() {
        this.currentStep   = 1;
        this.selectedProduct = null;
        this.installBtn    = null;

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
        this.backStep2Btn    = document.getElementById('backStep2');
        this.eraseCheckbox   = document.getElementById('eraseBeforeFlash');

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
        this.backStep1Btn.addEventListener('click', () => this.goToStep(1));
        this.backStep2Btn.addEventListener('click', () => this.goToStep(2));

        // 串口 (不再需要，ESP Web Tools 自动处理)
        this.connectBtn.style.display = 'none';

        // ESP Web Tools 事件监听
        this.installBtn = document.getElementById('installBtn');
        this.installBtn.addEventListener('state-changed', (e) => this.onInstallStateChanged(e));

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

        // 设置 ESP Web Tools 的 manifest URL
        const manifestUrl = `${product.firmwarePath}/manifest.json`;
        this.installBtn.setAttribute('manifest', manifestUrl);
        this.log(`固件清单: ${manifestUrl}`, 'info');

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

        // 更新 manifest URL（如果版本对应不同固件）
        // ESP Web Tools 会自动从 manifest 加载固件
        this.toStep2Btn.disabled = false;
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
        this.fileList.innerHTML = '<div class="file-loading">固件将由 ESP Web Tools 自动加载</div>';
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
            // 进入步骤 2 时直接跳到步骤 3（ESP Web Tools 自动处理连接）
            this.goToStep(3);
        }

        if (step === 3) this.prepareStep3();
    }

    /* ========================= ESP Web Tools 事件处理 ========================= */

    onInstallStateChanged(e) {
        const state = e.detail.state;
        this.log(`烧录状态: ${state}`, 'info');

        switch (state) {
            case 'start':
                this.setStatus('busy', '准备中...');
                this.progressTitle.textContent = '正在连接设备...';
                this.progressStage.textContent = '请在弹出的对话框中选择设备串口';
                this.log('正在连接设备，请在弹出的对话框中选择串口...', 'info');
                break;

            case 'preparing':
                this.setStatus('busy', '准备中...');
                this.progressTitle.textContent = '正在准备烧录...';
                this.progressStage.textContent = '正在初始化设备和加载固件';
                this.log('正在初始化设备并加载固件...', 'info');
                break;

            case 'erasing':
                this.setStatus('busy', '擦除中...');
                this.progressTitle.textContent = '正在擦除 Flash...';
                this.progressStage.textContent = '正在擦除，请勿断开设备连接';
                this.log('正在擦除 Flash，请勿断开设备连接...', 'warning');
                break;

            case 'writing':
                this.setStatus('busy', '烧录中...');
                this.progressTitle.textContent = '正在烧录固件...';
                this.progressStage.textContent = '正在写入固件数据，请耐心等待';
                this.log('正在写入固件数据，请耐心等待...', 'info');
                break;

            case 'finished':
                this.setStatus('ready', '完成');
                this.progressTitle.textContent = '烧录完成！';
                this.progressStage.textContent = '设备将自动重启';
                this.updateProgress(100, '烧录完成');
                this.toast('烧录完成！设备将自动重启', 'success');
                this.log('===== 烧录完成！设备将自动重启 =====', 'success');
                break;

            case 'error':
                this.setStatus('error', '失败');
                this.progressTitle.textContent = '烧录失败';
                this.progressStage.textContent = '请检查设备连接后重试';
                this.toast('烧录失败，请检查设备连接后重试', 'error');
                this.log('烧录失败，请检查设备连接后重试', 'error');
                break;
        }
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

        // 重置进度
        this.resetProgress();
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
