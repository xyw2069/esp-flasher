@echo off
chcp 65001 >nul
title ESP32 在线烧录工具 - 服务器
cd /d "%~dp0"
echo ========================================
echo    ESP32 在线烧录工具
echo ========================================
echo.
echo 正在启动本地服务器...
echo.
echo 请在浏览器中打开: http://localhost:8080
echo 按 Ctrl+C 停止服务器
echo.
node -e "const http=require('http'),fs=require('fs'),path=require('path');const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'application/javascript;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};http.createServer((q,r)=>{let f=q.url.split('?')[0];if(f==='/')f='/index.html';f=path.join(__dirname,f);const e=path.extname(f);fs.readFile(f,(err,d)=>{if(err){r.writeHead(404);r.end('Not found');return}r.writeHead(200,{'Content-Type':mime[e]||'application/octet-stream'});r.end(d)})}).listen(8080,()=>console.log('Server running on http://localhost:8080'))"
pause
