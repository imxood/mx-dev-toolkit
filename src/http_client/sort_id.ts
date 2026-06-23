/**
 * ULID 排序键工具.
 *
 * ULID = 26 字符 Crockford base32 字符串, 字典序 = 时间序.
 * 用 ULID 当排序键的好处:
 * - 插入时只改一条 (sortId 取前后中点), 写盘 O(1)
 * - 数据天然有序, 数组按 sortId 字典序排就是用户最后看到的顺序
 * - 头部时间戳可读, 调试友好
 *
 * 算法核心: 把 ULID 字符串当 130 bit (26 * 5) 大整数处理, 中点 / +1 / -1 都是 BigInt.
 */

import { ulid } from "ulid";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 26 字符 ULID 字符串对应的 130 bit 大整数. */
function ulidToBigInt(value: string): bigint {
  if (value.length !== 26) {
    throw new Error(`ULID 长度应为 26, 收到 ${value.length}`);
  }
  let result = 0n;
  for (const ch of value) {
    const index = CROCKFORD_BASE32.indexOf(ch);
    if (index < 0) {
      throw new Error(`ULID 含无效字符: ${ch}`);
    }
    result = (result << 5n) | BigInt(index);
  }
  return result;
}

/** 130 bit 大整数转回 26 字符 ULID. */
function bigIntToUlid(value: bigint): string {
  let buffer = value;
  let out = "";
  for (let index = 0; index < 26; index += 1) {
    const chunk = Number(buffer & 31n);
    out = CROCKFORD_BASE32[chunk] + out;
    buffer >>= 5n;
  }
  if (buffer !== 0n) {
    throw new Error("ULID 数值超出 130 bit 范围");
  }
  return out;
}

/** ULID 字典序 +1, 仍为合法 ULID. */
function incrementUlid(value: string): string {
  return bigIntToUlid(ulidToBigInt(value) + 1n);
}

/** ULID 字典序 -1, 仍为合法 ULID. */
function decrementUlid(value: string): string {
  return bigIntToUlid(ulidToBigInt(value) - 1n);
}

/** 取两个 ULID 之间的中点 (字典序严格在两者之间). */
function midpointUlid(prev: string, next: string): string {
  const prevNum = ulidToBigInt(prev);
  const nextNum = ulidToBigInt(next);
  if (prevNum >= nextNum) {
    throw new Error(`ULID 中点要求 prev < next, 收到 ${prev} >= ${next}`);
  }
  // prev/next 紧邻 (next - prev <= 1) 时, midpoint 向下取整 = prev, 触发碰撞检测死循环
  // 这种情况直接 ulid() 兜底 (130 bit 空间, 跟 existing 撞概率 ≈ 0)
  if (nextNum - prevNum <= 1n) {
    return ulid();
  }
  return bigIntToUlid((prevNum + nextNum) / 2n);
}

/**
 * 在 prev / next 之间生成一个不冲突的 ULID 排序键.
 *
 * - prev = null 且 next = null: 生成全新 ULID
 * - prev = null: 字典序小于 next
 * - next = null: 字典序大于 prev
 * - 都有: 取中点
 *
 * existing 用于碰撞检测, 最多退避 5 次 (实际 ULID 空间 130 bit, 几乎不会撞).
 * 极端兜底: 直接生成全新 ULID.
 */
export function betweenSortIds(
  prev: string | null,
  next: string | null,
  existing: ReadonlySet<string> = new Set()
): string {
  let candidate: string;
  if (prev === null && next === null) {
    candidate = ulid();
  } else if (prev === null) {
    candidate = decrementUlid(next as string);
  } else if (next === null) {
    candidate = incrementUlid(prev);
  } else {
    candidate = midpointUlid(prev, next);
  }

  let lowerBound = prev;
  let upperBound = next;
  for (let attempt = 0; attempt < 5 && existing.has(candidate); attempt += 1) {
    if (lowerBound === null) {
      // 之前就因为 prev=null 退到 decrement(next); 还撞说明 next 极特殊, 继续 decrement
      upperBound = candidate;
      candidate = decrementUlid(candidate);
    } else if (upperBound === null) {
      lowerBound = candidate;
      candidate = incrementUlid(candidate);
    } else {
      // 在 lowerBound 和原 candidate 之间再取中点
      upperBound = candidate;
      candidate = midpointUlid(lowerBound, candidate);
    }
  }
  if (existing.has(candidate)) {
    return ulid();
  }
  return candidate;
}

/** 新建请求时生成 ULID 排序键. */
export function newSortId(): string {
  return ulid();
}
