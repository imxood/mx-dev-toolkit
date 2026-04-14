import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestLogger } from "../../http_client/tests/helpers";
import { ToastService } from "../service";
import { ToastItem } from "../types";

test("toast_service: 选择最高优先级可用宿主并标准化默认时长", async () => {
  const logger = await createTestLogger("toast_service.txt");
  await logger.flow("验证 ToastService 会优先选择最高优先级宿主, 并为未指定时长的提示补齐默认值");

  const lowPriorityToasts: ToastItem[] = [];
  const highPriorityToasts: ToastItem[] = [];
  const nativeMessages: string[] = [];
  const service = new ToastService({
    showInformationMessage: async (message: string) => {
      nativeMessages.push(`info:${message}`);
    },
    showWarningMessage: async (message: string) => {
      nativeMessages.push(`warning:${message}`);
    },
    showErrorMessage: async (message: string) => {
      nativeMessages.push(`error:${message}`);
    },
  });

  service.registerHost({
    id: "low",
    priority: 10,
    isAvailable: () => true,
    postToast: async (toast) => {
      lowPriorityToasts.push(toast);
      return true;
    },
  });
  service.registerHost({
    id: "high",
    priority: 100,
    isAvailable: () => true,
    postToast: async (toast) => {
      highPriorityToasts.push(toast);
      return true;
    },
  });

  await logger.step("发送 success 提示, 检查高优宿主是否优先接收");
  await service.notify({
    kind: "success",
    message: "请求完成",
    source: "toast.test",
  });

  await logger.verify("高优宿主收到 1 条 Toast, 默认时长为 1800ms");
  assert.equal(highPriorityToasts.length, 1);
  assert.equal(lowPriorityToasts.length, 0);
  assert.equal(nativeMessages.length, 0);
  assert.equal(highPriorityToasts[0].durationMs, 1800);
  assert.equal(highPriorityToasts[0].copyText, "请求完成");

  await logger.conclusion("ToastService 已满足宿主优先级选择和默认时长归一化要求");
});

test("toast_service: 无可用宿主时回退 VS Code 原生提示", async () => {
  const logger = await createTestLogger("toast_service.txt");
  await logger.flow("验证无可用 Webview 宿主时, ToastService 会回退到 VS Code 原生消息");

  const nativeMessages: string[] = [];
  const service = new ToastService({
    showInformationMessage: async (message: string) => {
      nativeMessages.push(`info:${message}`);
    },
    showWarningMessage: async (message: string) => {
      nativeMessages.push(`warning:${message}`);
    },
    showErrorMessage: async (message: string) => {
      nativeMessages.push(`error:${message}`);
    },
  });

  service.registerHost({
    id: "hidden-host",
    priority: 100,
    isAvailable: () => false,
    postToast: async () => true,
  });

  await logger.step("发送 warning 提示, 由于宿主不可用应直接进入原生回退路径");
  await service.notify({
    kind: "warning",
    message: "未找到活动编辑器",
    source: "toast.test",
  });

  await logger.verify("warning 消息已通过原生接口发送");
  assert.deepEqual(nativeMessages, ["warning:未找到活动编辑器"]);

  await logger.conclusion("ToastService 在无宿主场景下可稳定回退原生消息");
});
