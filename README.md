# 考研单词

个人使用的离线背词 PWA。每天快速过最多 300 个词，只把不熟的词留到下一轮。

## 本地运行

```bash
npm install
npm run extract:vocab -- /path/to/考研大纲词汇乱序版.pdf
npm run dev
```

## 验证

```bash
npm test
npm run build
```

学习进度只保存在当前设备。设置页可以导出和导入 JSON 备份。
