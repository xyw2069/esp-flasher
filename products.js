/**
 * 产品配置数据库
 * 每个产品定义了芯片类型、烧录参数和默认固件
 */

const PRODUCT_DB = [
    {
        id: 1,
        name: '智能温湿度传感器',
        chip: 'esp32c3',
        icon: 'TH',
        flashSize: '4MB',
        flashMode: 'dio',
        flashFreq: '40m',
        baudRate: 460800,
        baudRateApp: 115200,
        firmware: [
            { file: 'bootloader.bin', address: 0x0 },
            { file: 'partition-table.bin', address: 0x8000 },
            { file: 'ota_data_initial.bin', address: 0xd000 },
            { file: 'app.bin', address: 0x10000 },
        ],
        versions: [
            { tag: 'v2.1.0', date: '2026-05-20', latest: true },
            { tag: 'v2.0.3', date: '2026-04-10', latest: false },
            { tag: 'v1.9.0', date: '2026-02-15', latest: false },
        ],
    },
    {
        id: 2,
        name: 'ESP32-S3 开发板',
        chip: 'esp32s3',
        icon: 'S3',
        flashSize: '8MB',
        flashMode: 'dio',
        flashFreq: '80m',
        baudRate: 921600,
        baudRateApp: 115200,
        firmware: [
            { file: 'bootloader.bin', address: 0x0 },
            { file: 'partition-table.bin', address: 0x8000 },
            { file: 'ota_data_initial.bin', address: 0xd000 },
            { file: 'app.bin', address: 0x10000 },
        ],
        versions: [
            { tag: 'v1.5.0', date: '2026-05-15', latest: true },
            { tag: 'v1.4.2', date: '2026-03-28', latest: false },
        ],
    },
    {
        id: 3,
        name: '智能灯光控制器',
        chip: 'esp32c3',
        icon: 'LC',
        flashSize: '4MB',
        flashMode: 'dio',
        flashFreq: '40m',
        baudRate: 460800,
        baudRateApp: 115200,
        firmware: [
            { file: 'bootloader.bin', address: 0x0 },
            { file: 'partition-table.bin', address: 0x8000 },
            { file: 'app.bin', address: 0x10000 },
        ],
        versions: [
            { tag: 'v3.0.1', date: '2026-05-18', latest: true },
            { tag: 'v3.0.0', date: '2026-05-01', latest: false },
            { tag: 'v2.8.5', date: '2026-03-10', latest: false },
        ],
    },
    {
        id: 4,
        name: 'MQTT 网关模块',
        chip: 'esp32s3',
        icon: 'GW',
        flashSize: '16MB',
        flashMode: 'dio',
        flashFreq: '80m',
        baudRate: 921600,
        baudRateApp: 115200,
        firmware: [
            { file: 'bootloader.bin', address: 0x0 },
            { file: 'partition-table.bin', address: 0x8000 },
            { file: 'ota_data_initial.bin', address: 0xd000 },
            { file: 'app.bin', address: 0x10000 },
            { file: 'littlefs.bin', address: 0x210000 },
        ],
        versions: [
            { tag: 'v1.2.0', date: '2026-05-22', latest: true },
        ],
    },
];

const CHIP_LABELS = {
    esp32:    'ESP32',
    esp32s2:  'ESP32-S2',
    esp32s3:  'ESP32-S3',
    esp32c3:  'ESP32-C3',
    esp32c2:  'ESP32-C2',
    esp32h2:  'ESP32-H2',
};

/** 从 URL hash 读取 product_id，例如 flash.html#product_id=1 */
function parseProductIdFromURL() {
    const hash = window.location.hash;          //  #product_id=1
    if (!hash) return null;
    const params = new URLSearchParams(hash.substring(1));   // strip leading #
    const id = parseInt(params.get('product_id'), 10);
    return Number.isNaN(id) ? null : id;
}

window.PRODUCT_DB   = PRODUCT_DB;
window.CHIP_LABELS  = CHIP_LABELS;
window.parseProductIdFromURL = parseProductIdFromURL;
