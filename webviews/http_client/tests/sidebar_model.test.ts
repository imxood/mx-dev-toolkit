import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDefaultCollection,
  createDefaultEnvironment,
  createDefaultRequest,
  type HttpClientViewState,
  type HttpHistoryRecord,
} from "../../../src/http_client/types";
import { createTestLogger } from "../../../src/http_client/tests/helpers";
import {
  buildCollectionGroups,
  buildEnvironmentItems,
  buildHistoryGroups,
  buildUngroupedRequests,
  formatClock,
  relativeTime,
} from "../shared/sidebar_model";
import { createFallbackViewState } from "../shared/workbench_model";

test("sidebar_model: React 侧边栏分组与筛选逻辑保持现状一致", async () => {
  const logger = await createTestLogger("http_client_sidebar_model.txt");
  await logger.flow("验证 React 侧边栏共享纯函数与旧侧边栏分组逻辑保持一致");

  const viewState = createSidebarState();

  await logger.step("验证最近 30 条历史记录按请求聚合且默认展开最新分组");
  const groups = buildHistoryGroups(viewState, "", {});
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, "获取会员信息");
  assert.equal(groups[0].totalCount, 29);
  assert.equal(groups[0].expanded, true);
  assert.equal(groups[0].records[0].id, "history-1");
  assert.equal(groups[1].title, "查询设备状态");
  assert.equal(groups[1].totalCount, 1);
  assert.equal(groups[1].expanded, false);

  await logger.step("验证历史关键字筛选和展开状态继承");
  const filteredGroups = buildHistoryGroups(viewState, "设备", { [groups[0].key]: true });
  assert.equal(filteredGroups.length, 1);
  assert.equal(filteredGroups[0].title, "查询设备状态");
  assert.equal(filteredGroups[0].expanded, true);

  await logger.step("验证集合和未分组请求筛选");
  const collectionGroups = buildCollectionGroups(viewState.config, "");
  assert.equal(collectionGroups.length, 1);
  assert.equal(collectionGroups[0].requests.length, 1);
  assert.equal(collectionGroups[0].collectionName, "默认集合");

  const collectionFiltered = buildCollectionGroups(viewState.config, "会员");
  assert.equal(collectionFiltered.length, 1);
  assert.equal(collectionFiltered[0].requests[0].name, "获取会员信息");

  const looseRequests = buildUngroupedRequests(viewState.config, "");
  assert.equal(looseRequests.length, 1);
  assert.equal(looseRequests[0].name, "查询设备状态");

  await logger.step("验证环境筛选和时间格式化工具");
  const environmentItems = buildEnvironmentItems(viewState, "prod");
  assert.equal(environmentItems.length, 1);
  assert.equal(environmentItems[0].environment.name, "prod");
  assert.equal(environmentItems[0].active, true);

  assert.equal(relativeTime("2026-04-14T07:58:00.000Z", new Date("2026-04-14T08:00:00.000Z").getTime()), "2 分钟前");
  assert.equal(
    formatClock("2026-04-14T08:05:00.000Z"),
    new Date("2026-04-14T08:05:00.000Z").toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );

  await logger.verify("最近 30 条聚合, 集合筛选和环境筛选逻辑均符合预期");
  await logger.conclusion("React 侧边栏共享纯函数已具备稳定回归保护");
});

function createSidebarState(): HttpClientViewState {
  const viewState = createFallbackViewState();
  const collection = createDefaultCollection("默认集合");
  const envDefault = createDefaultEnvironment("default");
  const envProd = createDefaultEnvironment("prod");
  const requestMember = createDefaultRequest("获取会员信息", collection.id);
  const requestDevice = createDefaultRequest("查询设备状态", null);
  requestMember.method = "POST";
  requestMember.url = "http://iot.iotim.com/ehong/tool/GetMemberInfo";
  requestDevice.method = "GET";
  requestDevice.url = "https://api.example.com/device/status";

  viewState.config = {
    version: 1,
    collections: [collection],
    requests: [requestMember, requestDevice],
    environments: [envDefault, envProd],
  };
  viewState.activeRequestId = requestMember.id;
  viewState.activeEnvironmentId = envProd.id;
  viewState.history = createHistory(requestMember, requestDevice);
  return viewState;
}

function createHistory(memberRequest: HttpClientViewState["config"]["requests"][number], deviceRequest: HttpClientViewState["config"]["requests"][number]): HttpHistoryRecord[] {
  const history: HttpHistoryRecord[] = [];

  for (let index = 0; index < 31; index += 1) {
    history.push({
      id: `history-${index + 1}`,
      request: {
        ...memberRequest,
        params: memberRequest.params.map((item) => ({ ...item })),
        headers: memberRequest.headers.map((item) => ({ ...item })),
      },
      responseSummary: {
        status: 200,
        statusText: "OK",
        durationMs: 40 + index,
        ok: true,
        sizeBytes: 4305,
      },
      environmentId: null,
      executedAt: new Date(Date.UTC(2026, 3, 14, 8, 0, 0) - index * 60000).toISOString(),
    });
  }

  history.splice(5, 0, {
    id: "history-device-1",
    request: {
      ...deviceRequest,
      params: deviceRequest.params.map((item) => ({ ...item })),
      headers: deviceRequest.headers.map((item) => ({ ...item })),
    },
    responseSummary: {
      status: 500,
      statusText: "Internal Server Error",
      durationMs: 88,
      ok: false,
      sizeBytes: 612,
    },
    environmentId: null,
    executedAt: "2026-04-14T07:53:00.000Z",
  });

  return history;
}
