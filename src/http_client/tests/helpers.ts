import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { HttpClientStateStore } from "../types";

type LogStage = "流程" | "步骤" | "验证" | "结论";

const logQueues = new Map<string, Promise<void>>();

export class MemoryStateStore implements HttpClientStateStore {
  private readonly store = new Map<string, unknown>();

  public get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined;
  }

  public update(key: string, value: unknown): PromiseLike<void> {
    if (typeof value === "undefined") {
      this.store.delete(key);
    } else {
      this.store.set(key, value);
    }
    return Promise.resolve();
  }
}

export class TestLogger {
  constructor(private readonly filePath: string) {}

  public async flow(message: string): Promise<void> {
    await this.write("流程", message);
  }

  public async step(message: string): Promise<void> {
    await this.write("步骤", message);
  }

  public async verify(message: string): Promise<void> {
    await this.write("验证", message);
  }

  public async conclusion(message: string): Promise<void> {
    await this.write("结论", message);
  }

  private async write(stage: LogStage, message: string): Promise<void> {
    const next = (logQueues.get(this.filePath) ?? Promise.resolve()).then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const line = `[${new Date().toLocaleString("zh-CN", { hour12: false })}][${stage}] ${message}\n`;
      await fs.appendFile(this.filePath, line, "utf8");
    });
    logQueues.set(this.filePath, next);
    await next;
  }
}

export async function createTestLogger(fileName: string): Promise<TestLogger> {
  const filePath = path.join(process.cwd(), "logs", "mx-dev-toolkit", "tests", fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "", "utf8");
  return new TestLogger(filePath);
}

export async function createTempWorkspace(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

export async function createMockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock server address unavailable");
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

export async function closeMockServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
