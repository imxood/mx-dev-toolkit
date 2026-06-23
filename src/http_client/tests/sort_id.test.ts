import { test } from "node:test";
import assert from "node:assert/strict";
import { betweenSortIds, newSortId } from "../sort_id";

test("sort_id: betweenSortIds 接受两侧时返回中点", () => {
  const prev = "01H8XGJWBW00000000000000A0";
  const next = "01H8XGJWBW00000000000000Z0";
  const mid = betweenSortIds(prev, next);
  assert.ok(mid > prev, `mid ${mid} 应大于 prev ${prev}`);
  assert.ok(mid < next, `mid ${mid} 应小于 next ${next}`);
});

test("sort_id: betweenSortIds prev=null 时取 next-1", () => {
  const next = "01H8XGJWBW00000000000000F0";
  const result = betweenSortIds(null, next);
  assert.ok(result < next, `result ${result} 应小于 next ${next}`);
});

test("sort_id: betweenSortIds next=null 时取 prev+1", () => {
  const prev = "01H8XGJWBW00000000000000F0";
  const result = betweenSortIds(prev, null);
  assert.ok(result > prev, `result ${result} 应大于 prev ${prev}`);
});

test("sort_id: betweenSortIds 两端都 null 时返回全新 ULID", () => {
  const result = betweenSortIds(null, null);
  assert.equal(result.length, 26);
  assert.ok(result >= "0");
});

test("sort_id: betweenSortIds 碰撞时退避不与 existing 冲突", () => {
  const prev = "01H8XGJWBW00000000000000A0";
  const next = "01H8XGJWBW00000000000000F0";
  // 占用中间可能的位置
  const occupied = betweenSortIds(prev, next);
  const existing = new Set([occupied]);
  const result = betweenSortIds(prev, next, existing);
  assert.notEqual(result, occupied, "新值不应等于已占用的中点");
  assert.ok(result > prev && result < next, "新值仍应在 prev 与 next 之间");
});

test("sort_id: betweenSortIds 多次退避后仍能生成合法值", () => {
  // 模拟"中间值都被占用"的最坏情况
  const prev = "01H8XGJWBW00000000000000A0";
  const next = "01H8XGJWBW00000000000000F0";
  const mid1 = betweenSortIds(prev, next);
  const mid2 = betweenSortIds(prev, mid1);
  const mid3 = betweenSortIds(prev, mid2);
  const occupied = new Set([mid1, mid2, mid3]);
  const result = betweenSortIds(prev, next, occupied);
  assert.ok(result > prev && result < next, "多次退避后仍应在区间内");
});

test("sort_id: newSortId 长度 26 且字典序随时间递增", async () => {
  const a = newSortId();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = newSortId();
  assert.equal(a.length, 26);
  assert.equal(b.length, 26);
  assert.ok(b > a, `新生成的 ULID ${b} 字典序应大于旧的 ${a}`);
});
