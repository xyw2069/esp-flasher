# ESP32 在线烧录工具

基于 Web Serial API 的 ESP32 在线烧录工具，支持多产品配置和分步烧录。

## 功能特性

- **多产品支持** — 通过 `products.js` 配置多个产品，URL 参数自动加载
- **多芯片** — ESP32 / ESP32-S2 / ESP32-S3 / ESP32-C3 / ESP32-C2 / ESP32-H2
- **分步向导** — 选固件 → 连设备 → 烧录，三步完成
- **自定义固件上传** — 拖拽 .bin 文件，自动识别 bootloader / partition / app 地址
- **产品预设固件** — 每个产品可配置多个版本
- **烧录配置** — 波特率、Flash 大小、模式、频率可调
- **擦除 & 验证** — 烧录前可选全片擦除
- **实时进度** — 进度条 + 文件级状态 + 日志输出
- **暗色主题** — 全局暗色 UI，专业风格

## 快速开始

### 启动服务器

```bash
cd esp-flasher
python -m http.server 8080
# 或
npx serve .
```

然后打开 http://localhost:8080

也可以直接双击 `启动服务器.bat`（Windows）。

### 浏览器要求

- **Chrome 89+** 或 **Edge 89+**
- 需要支持 Web Serial API

## URL 产品加载

通过 URL hash 指定产品：

```
http://localhost:8080#product_id=1
```

## 配置产品

编辑 `products.js` 中的 `PRODUCT_DB` 数组，每个产品包含：

| 字段 | 说明 |
|------|------|
| `id` | 产品唯一 ID |
| `name` | 产品显示名称 |
| `chip` | 芯片类型，如 `esp32c3` |
| `icon` | 侧边栏显示的缩写 |
| `flashSize` | Flash 容量，如 `4MB` |
| `firmware` | 预设文件列表 `{ file, address }` |
| `versions` | 版本列表 `{ tag, date, latest }` |

## 烧录步骤

1. **选择产品** — 从左侧产品列表中选择，或上传自定义固件
2. **连接设备** — 让 ESP32 进入下载模式（按住 BOOT → 按 RESET → 松开 BOOT），点击连接并选择串口
3. **开始烧录** — 点击烧录按钮，等待完成

## 文件结构

```
esp-flasher/
├── index.html          # 主页面（步骤向导 UI）
├── styles.css          # 暗色主题样式
├── products.js         # 产品配置数据库
├── esp32-flasher.js    # ESP32 ROM bootloader 协议实现
├── app.js              # 主应用逻辑
├── 启动服务器.bat        # Windows 一键启动
└── README.md           # 说明文档
```

## 技术原理

通过 Web Serial API 与 ESP32 ROM bootloader 通信：

1. 控制 DTR/RTS 将芯片置入下载模式
2. SLIP 帧同步 (`SYNC` 命令)
3. `FLASH_BEGIN` 开始烧录
4. 分块发送数据（每块 1 KB，SLIP 编码）
5. `FLASH_END` 结束并重启

## 注意事项

- 烧录前确保设备已进入下载模式
- 921600 波特率速度最快，但部分串口芯片可能不稳定，建议先用 460800
- 自定义上传的文件支持拖拽，地址可手动修改
