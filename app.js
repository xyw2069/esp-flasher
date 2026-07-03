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
        this.progressTitle   = document.getElementById('progressTitle');
        this.progressPercent = document.getElementById('progressPercent');
        this.progressFill    = document.getElementById('progressFill');
        this.progressGlow    = document.getElementById('progressGlow');
        this.progressStage   = document.getElementById('progressStage');

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
        this.toStep3Btn.addEventListener('click', () => this.goToStep(3));

        // 串口连接
        this.connectBtn.addEventListener('click', () => this.requestSerialPort());
        this.selectedPort = null;

        // ESP Web Tools 事件监听
        this.installBtn = document.getElementById('installBtn');
        this.installBtn.addEventListener('state-changed', (e) => this.onInstallStateChanged(e));
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
        this.infoStatus.textContent = product.note || '就绪';

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

        if (!this.versionSelect.value && product.versions.length > 0) {
            this.versionSelect.value = product.versions[0].tag;
            this.infoFirmware.textContent = product.versions[0].tag;
            this.updateStep1Button();
        }

        // 应用产品默认配置
        this.baudRateSelect.value  = String(product.baudRate);
        this.flashSizeSelect.value = product.flashSize;
        this.flashModeSelect.value = product.flashMode;
        this.flashFreqSelect.value = product.flashFreq || '40m';

        // 设置 ESP Web Tools 的 manifest URL
        const manifestUrl = `${product.firmwarePath}/manifest.json`;
        this.installBtn.setAttribute('manifest', manifestUrl);

        // 清空之前的自定义文件
        this.firmwareFiles = [];
        this.fileList.innerHTML = '';

        this.onVersionChange();
    }

    async onVersionChange() {
        const version = this.versionSelect.value;
        if (!this.selectedProduct || !version) return;
        this.infoFirmware.textContent = version;
        this.infoStatus.textContent = this.selectedProduct.note || '就绪';

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
            this.resetConnectionStatus();
        }

        if (step === 3) this.prepareStep3();
    }

    /* ========================= 串口连接 ========================= */

    async requestSerialPort() {
        try {
            const port = await navigator.serial.requestPort();
            this.selectedPort = port;

            // 更新连接状态 UI
            this.connectionStatus.querySelector('.status-dot').className = 'status-dot connected';
            this.connectionStatus.querySelector('.status-text').textContent = '已连接';
            this.statusDetail.textContent = '串口已选择';

            // 启用"下一步"按钮
            this.toStep3Btn.disabled = false;
        } catch (err) {
            if (err.name !== 'NotFoundError') {
                this.toast('串口连接失败', 'error');
            }
        }
    }

    resetConnectionStatus() {
        this.connectionStatus.querySelector('.status-dot').className = 'status-dot disconnected';
        this.connectionStatus.querySelector('.status-text').textContent = '未连接';
        this.statusDetail.textContent = '';
        this.toStep3Btn.disabled = !this.selectedPort;
    }

    patchSerialRequestPort() {
        if (!this.selectedPort) return;
        const storedPort = this.selectedPort;
        const original = navigator.serial.requestPort.bind(navigator.serial);
        this._originalRequestPort = original;
        navigator.serial.requestPort = async () => storedPort;
    }

    restoreSerialRequestPort() {
        if (this._originalRequestPort) {
            navigator.serial.requestPort = this._originalRequestPort;
            this._originalRequestPort = null;
        }
    }

    /* ========================= ESP Web Tools 事件处理 ========================= */

    onInstallStateChanged(e) {
        const state = e.detail.state;

        switch (state) {
            case 'start':
                this.setStatus('busy', '准备中...');
                this.progressTitle.textContent = '正在连接设备...';
                break;

            case 'preparing':
                this.setStatus('busy', '准备中...');
                this.progressTitle.textContent = '正在准备...';
                break;

            case 'erasing':
                this.setStatus('busy', '擦除中...');
                this.progressTitle.textContent = '正在擦除 Flash...';
                break;

            case 'writing':
                this.setStatus('busy', '烧录中...');
                this.progressTitle.textContent = '正在烧录固件...';
                break;

            case 'finished':
                this.setStatus('ready', '完成');
                this.progressTitle.textContent = '烧录完成';
                this.updateProgress(100, '烧录完成');
                this.toast('烧录完成！', 'success');
                this.restoreSerialRequestPort();
                break;

            case 'error':
                this.setStatus('error', '失败');
                this.progressTitle.textContent = '烧录失败';
                this.toast('烧录失败', 'error');
                this.restoreSerialRequestPort();
                break;
        }
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

        // 复用已选端口，避免重复弹出串口选择
        this.patchSerialRequestPort();
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
