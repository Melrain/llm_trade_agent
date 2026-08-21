# llm_trade_agent

LLM Trade Agent **桌面客户端**（Electron · React · TypeScript）。

- 主进程 / 预加载 / 渲染进程分离
- 开发期 Vite HMR
- 打包使用 electron-builder

## 启动

```bash
cd llm_trade_agent
npm install
npm run dev
```

## 常用脚本

| 命令                | 说明                 |
| ------------------- | -------------------- |
| `npm run dev`       | 开发模式             |
| `npm run build`     | 构建渲染进程与主进程 |
| `npm run build:win` | 打包 Windows 安装包  |
| `npm run lint`      | ESLint               |
| `npm run typecheck` | TypeScript 检查      |

## 目录

```
src/
  main/       # Electron 主进程
  preload/    # 预加载脚本（安全暴露 API）
  renderer/   # React 界面
```
