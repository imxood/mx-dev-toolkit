import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDefaultEnvironment,
  createDefaultRequest,
  type HttpClientViewState,
} from "../../../src/http_client/types";
import { createTestLogger } from "../../../src/http_client/tests/helpers";
import {
  buildCollectionGroups,
  buildEnvironmentItems,
  formatClock,
  getRequestStatusBadge,
  relativeTime,
} from "../shared/sidebar_model";
import { createFallbackViewState } from "../shared/workbench_model";

test("sidebar_model: 集合筛选, 默认集合保护, 状态徽章与时间工具", async () => {
  const logger = await createTestLogger("http_client_sidebar_model.txt");
  await logger.flow("验证 React 侧边栏共享纯函数的集合筛选, 默认集合保护, 状态徽章和时间工具");

  const viewState = createSidebarState();

  await logger.step("默认集合应识别为默认, 不可被重命名或删除");
  const groups = buildCollectionGroups(viewState.config, "", null, {});
  assert.equal(groups.length, 2);
  assert.equal(groups[0].isDefault, true);
  assert.equal(groups[0].collectionName, "默认集合");
  assert.equal(groups[0].expanded, true);
  assert.equal(groups[1].isDefault, false);
  assert.equal(groups[1].collectionName, "产品 API");

  await logger.step("关键字筛选应同时影响集合名和请求");
  const filtered = buildCollectionGroups(viewState.config, "iotim", null, {});
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].isDefault, true);
  assert.equal(filtered[0].requests.length, 1);

  await logger.step("未保存草稿应出现在它所属的集合里, 没有归属则进默认集合");
  const scratch = createDefaultRequest("新草稿");
  const scratchGroups = buildCollectionGroups(viewState.config, "", scratch, {});
  const defaultGroup = scratchGroups.find((group) => group.isDefault);
  assert.ok(defaultGroup);
  assert.ok(defaultGroup.requests.some((request) => request.id === scratch.id));

  await logger.step("expandedCollectionGroups=false 应折叠目标集合");
  const collapsed = buildCollectionGroups(viewState.config, "", null, {
    [groups[1].collectionId]: false,
  });
  const products = collapsed.find((group) => group.collectionName === "产品 API");
  assert.ok(products);
  assert.equal(products.expanded, false);

  await logger.step("环境筛选应按名称或变量名匹配, 并高亮当前激活环境");
  const items = buildEnvironmentItems(viewState, "prod");
  assert.equal(items.length, 1);
  assert.equal(items[0].environment.name, "prod");
  assert.equal(items[0].active, true);

  await logger.step("状态徽章应根据 lastStatus 显示 ok / warn / err / neutral");
  const okRequest = viewState.config.collections[0].requests[0];
  okRequest.lastStatus = 200;
  okRequest.lastDurationMs = 120;
  okRequest.lastExecutedAt = new Date(Date.now() - 60_000).toISOString();
  const okBadge = getRequestStatusBadge(okRequest);
  assert.equal(okBadge.className, "ok");
  assert.equal(okBadge.label, "200");
  assert.equal(okBadge.durationLabel, "120ms");

  const errRequest = viewState.config.collections[1].requests[0];
  errRequest.lastStatus = 500;
  const errBadge = getRequestStatusBadge(errRequest);
  assert.equal(errBadge.className, "err");

  const unrunRequest = createDefaultRequest("unrun");
  const neutralBadge = getRequestStatusBadge(unrunRequest);
  assert.equal(neutralBadge.className, "neutral");
  assert.equal(neutralBadge.label, "未运行");

  await logger.step("时间格式化工具应支持中文化相对时间与本地时钟");
  assert.equal(relativeTime("2026-04-14T07:58:00.000Z", new Date("2026-04-14T08:00:00.000Z").getTime()), "2 分钟前");
  assert.equal(
    formatClock("2026-04-14T08:05:00.000Z"),
    new Date("2026-04-14T08:05:00.000Z").toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );

  await logger.verify("集合模型, 默认集合保护, 状态徽章和时间工具均符合预期");
  await logger.conclusion("React 侧边栏共享纯函数已具备稳定回归保护");
});

function createSidebarState(): HttpClientViewState {
  const viewState = createFallbackViewState();
  viewState.config.collections = [
    {
      id: "default-collection",
      name: "默认集合",
      isDefault: true,
      requests: [
        {
          ...createDefaultRequest("获取会员信息"),
          method: "POST",
          url: "http://iot.iotim.com/ehong/tool/GetMemberInfo",
          lastStatus: null,
          lastDurationMs: null,
          lastExecutedAt: null,
          lastResponseSnapshot: null,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "products-collection",
      name: "产品 API",
      isDefault: false,
      requests: [
        {
          ...createDefaultRequest("查询设备状态"),
          method: "GET",
          url: "https://api.example.com/device/status",
          lastStatus: null,
          lastDurationMs: null,
          lastExecutedAt: null,
          lastResponseSnapshot: null,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  viewState.config.environments = [
    createDefaultEnvironment("default"),
    { ...createDefaultEnvironment("prod"), variables: { baseUrl: "https://prod", token: "t" } },
  ];
  viewState.activeEnvironmentId = viewState.config.environments[1].id;
  return viewState;
}
