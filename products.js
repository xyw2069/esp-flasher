/**
 * 产品配置数据库
 * 固件文件存放在 firmware/{firmwarePath}/{version}/ 目录下
 * 每个版本可以有单个或多个 .bin 文件
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
        note: 'wifi，小程序控制小车',
        versions: [
            { tag: 'basic_car0123', date: '2026-04-29', latest: true,  file: 'basic_car0123.bin', address: 0x0 },
            { tag: 'basic_car0132', date: '2026-04-29', latest: false, file: 'basic_car0132.bin', address: 0x0 },
            { tag: 'basic_car1023', date: '2026-04-29', latest: false, file: 'basic_car1023.bin', address: 0x0 },
            { tag: 'basic_car1032', date: '2026-04-29', latest: false, file: 'basic_car1032.bin', address: 0x0 },
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
        note: '语音、wifi、小程序控制小车',
        versions: [
            { tag: 'voice_car0123', date: '2026-05-29', latest: true,  file: 'voice_car0123.bin', address: 0x0 },
            { tag: 'voice_car0132', date: '2026-05-29', latest: false, file: 'voice_car0132.bin', address: 0x0 },
            { tag: 'voice_car1023', date: '2026-05-29', latest: false, file: 'voice_car1023.bin', address: 0x0 },
            { tag: 'voice_car1032', date: '2026-05-29', latest: false, file: 'voice_car1032.bin', address: 0x0 },
        ],
    },
    {
        id: 3,
        name: 'AI款小车',
        chip: 'esp32s3',
        icon: 'AI',
        flashSize: '16MB',
        flashMode: 'dio',
        flashFreq: '80m',
        baudRate: 921600,
        firmwarePath: 'firmware/ai-car',
        note: 'AI 中文对话，唤醒词：你好，小智',
        versions: [
            { tag: 'xiaozhi_car', date: '2026-05-27', latest: true, file: 'xiaozhi_car.bin', address: 0x0 },
        ],
    },
    {
        id: 4,
        name: 'AI 英文款小车',
        chip: 'esp32s3',
        icon: 'EN',
        flashSize: '16MB',
        flashMode: 'dio',
        flashFreq: '80m',
        baudRate: 921600,
        firmwarePath: 'firmware/ai-car-english',
        note: 'AI 英文对话，唤醒词：HI,JASON',
        versions: [
            { tag: 'xiaozhi_car_english', date: '2026-07-01', latest: true, file: 'xiaozhi_car_english.bin', address: 0x0 },
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
