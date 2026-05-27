/**
 * 产品配置数据库
 * 每个产品定义了芯片类型、烧录参数和默认固件
 * 固件文件存放在 firmware/{firmwarePath}/{version}/ 目录下
 */

const PRODUCT_DB = [
    {
        id: 1,
        name: '基础款小车',
        chip: 'esp32c3',
        icon: '基',
        flashSize: '4MB',
        flashMode: 'dio',
        flashFreq: '40m',
        baudRate: 460800,
        firmwarePath: 'firmware/basic-car',
        firmware: [
            { file: 'bootloader.bin', address: 0x0 },
            { file: 'partition-table.bin', address: 0x8000 },
            { file: 'ota_data_initial.bin', address: 0xd000 },
            { file: 'app.bin', address: 0x10000 },
        ],
        versions: [
            { tag: 'v1.0.0', date: '2026-05-27', latest: true },
        ],
    },
    {
        id: 2,
        name: '语音款小车',
        chip: 'esp32c3',
        icon: '语',
        flashSize: '4MB',
        flashMode: 'dio',
        flashFreq: '40m',
        baudRate: 460800,
        firmwarePath: 'firmware/voice-car',
        firmware: [
            { file: 'bootloader.bin', address: 0x0 },
            { file: 'partition-table.bin', address: 0x8000 },
            { file: 'ota_data_initial.bin', address: 0xd000 },
            { file: 'app.bin', address: 0x10000 },
        ],
        versions: [
            { tag: 'v1.0.0', date: '2026-05-27', latest: true },
        ],
    },
    {
        id: 3,
        name: 'AI款小车',
        chip: 'esp32s3',
        icon: 'AI',
        flashSize: '8MB',
        flashMode: 'dio',
        flashFreq: '80m',
        baudRate: 921600,
        firmwarePath: 'firmware/ai-car',
        firmware: [
            { file: 'bootloader.bin', address: 0x0 },
            { file: 'partition-table.bin', address: 0x8000 },
            { file: 'ota_data_initial.bin', address: 0xd000 },
            { file: 'app.bin', address: 0x10000 },
        ],
        versions: [
            { tag: 'v1.0.0', date: '2026-05-27', latest: true },
        ],
    },
    {
        id: 4,
        name: '小智摄像头小车',
        chip: 'esp32s3',
        icon: 'CAM',
        flashSize: '8MB',
        flashMode: 'dio',
        flashFreq: '80m',
        baudRate: 921600,
        firmwarePath: 'firmware/camera-car',
        firmware: [
            { file: 'bootloader.bin', address: 0x0 },
            { file: 'partition-table.bin', address: 0x8000 },
            { file: 'ota_data_initial.bin', address: 0xd000 },
            { file: 'app.bin', address: 0x10000 },
        ],
        versions: [
            { tag: 'v1.0.0', date: '2026-05-27', latest: true },
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
    const hash = window.location.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash.substring(1));
    const id = parseInt(params.get('product_id'), 10);
    return Number.isNaN(id) ? null : id;
}

window.PRODUCT_DB   = PRODUCT_DB;
window.CHIP_LABELS  = CHIP_LABELS;
window.parseProductIdFromURL = parseProductIdFromURL;
