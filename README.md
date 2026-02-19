# Mx Dev Toolkit

## 用法

### Keil 配置

使用 vscode 打开一个文件夹, 在打开的根路径下创建 `mx_dev.json`.

在 `mx_dev.json` 中配置 `project`, 其值为 Keil 项目路径, 可以是绝对路径或相对于根路径:

```js
{
    "project": "xxx/xx/xx.uvprojx",
}
```

这将触发插件生成 vscode 的 C/C++ 配置文件 `.vscode/c_cpp_properties.json`.

也可以通过命令面板运行 `mx keil gen config`, 从列表选择 Keil 项目并自动生成 `mx_dev.json`.
`mx keil build/rebuild/clean` 在执行前会严格校验:
- `mx_dev.json` 必须存在.
- `project` 字段必须存在.
- `project` 指向的 `.uvprojx` 文件必须存在.

### Keil 编译

按下 `ctrl + shift + p`, 在弹框中输入: `mx keil build`, 执行回车.

### 重新编译

mx keil rebuild

### 清除编译

mx keil clean

### 选区行数显示

- 选中文本后, 左下角状态栏会显示: `已选 N 行`.
- 未选中文本时, 状态栏自动隐藏.

### 复制路径和行号范围

- `ctrl+alt+c`: 复制相对路径 + 行号范围, 如 `tsconfig.json:5-10`.
- `ctrl+shift+alt+c`: 复制绝对路径 + 行号范围, 如 `E:/git/maxu/mx-dev-toolkit/tsconfig.json:5-10`.

## 输出通道

所有命令都会在 `mx-dev-toolkit` 输出通道打印明确的 `[命令]` 信息.
