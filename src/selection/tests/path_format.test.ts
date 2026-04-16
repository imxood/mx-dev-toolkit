import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestLogger } from "../../http_client/tests/helpers";
import { normalizeSelectionPath } from "../path_format";

test("selection_path_format: Windows 绝对路径盘符统一转为大写", async () => {
  const logger = await createTestLogger("selection_path_format.txt");
  await logger.flow("验证 selection 路径复制会将 Windows 绝对路径盘符统一归一为大写");

  await logger.step("格式化小写盘符绝对路径");
  const normalized = normalizeSelectionPath("e:\\repo\\mx-dev-toolkit\\src\\extension.ts");

  await logger.verify(`格式化结果: ${normalized}`);
  assert.equal(normalized, "E:/repo/mx-dev-toolkit/src/extension.ts");

  await logger.conclusion("Windows 绝对路径盘符已稳定归一为大写");
});

test("selection_path_format: 相对路径与非盘符路径保持原样语义", async () => {
  const logger = await createTestLogger("selection_path_format.txt");
  await logger.flow("验证相对路径和非 Windows 盘符路径不会被误改, 只做斜杠归一化");

  await logger.step("格式化相对路径和 UNC 路径");
  const relativePath = normalizeSelectionPath("src\\selection\\copy_path_range.ts");
  const uncPath = normalizeSelectionPath("\\\\server\\share\\logs\\today.txt");

  await logger.verify(`相对路径结果: ${relativePath}; UNC 结果: ${uncPath}`);
  assert.equal(relativePath, "src/selection/copy_path_range.ts");
  assert.equal(uncPath, "//server/share/logs/today.txt");

  await logger.conclusion("路径格式化规则只提升 Windows 盘符大小写, 不改变其他路径语义");
});
