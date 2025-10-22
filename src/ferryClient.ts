import axios from "axios";
import axiosRetry from "axios-retry";
import NodeCache from "node-cache";
import qs from "qs";
import fs from "fs";
import path from "path";

const cache = new NodeCache({ stdTTL: Number(process.env.CACHE_TTL_SECONDS) || 86400 });

// debug: accept undefined -> treat as false unless explicitly "true"
const USE_MOCKS = (process.env.USE_MOCKS || "").toLowerCase() === "true";

const baseURL = process.env.FERRY_BASE || "";
const xchangeUser = process.env.XCHANGE_USER || "";
const xchangePSW = process.env.XCHANGE_PSW || "";

console.log("[ferryClient] CONFIG:",
  { USE_MOCKS, baseURL: baseURL ? "**OK**" : "MISSING", hasXchangeUser: !!xchangeUser, hasXchangePSW: !!xchangePSW }
);

const IS_TEST = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === "test";

const client = axios.create({
  baseURL,
  timeout: 10000,
  headers: { Accept: "application/json" },
});
// Attach retry only when axios instance exposes interceptors (skip in lightweight mocks)
try {
  const anyClient: any = client as any;
  if (anyClient?.interceptors?.request && anyClient?.interceptors?.response) {
    axiosRetry(client, { retries: 2, retryDelay: axiosRetry.exponentialDelay });
  }
} catch {
  // ignore in tests with mocked axios
}

function withAuthParams(params: Record<string, any> = {}) {
  return { ...params, xchangeUser, xchangePSW };
}

function loadMock(name: string) {
  const p = path.join(__dirname, "../mocks", `${name}.json`);
  console.log("[ferryClient] loadMock -> trying:", p);
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      console.log("[ferryClient] loadMock -> found", p, "size", raw.length);
      return JSON.parse(raw);
    } else {
      console.log("[ferryClient] loadMock -> NOT FOUND", p);
      return null;
    }
  } catch (e:any) {
    console.error("[ferryClient] loadMock -> error reading", p, e && e.stack ? e.stack : e);
    return null;
  }
}

// Safe getters: always return something or throw clear error for debug
export async function getSuppliers() {
  if (USE_MOCKS) {
    const m = loadMock("suppliers");
    if (m) return m;
    throw new Error("Mock suppliers.json not found or invalid");
  }
  if (!baseURL && !IS_TEST) throw new Error("FERRY_BASE is not set (cannot call real API)");
  const { data } = await client.get(`/getSuppliers?${qs.stringify(withAuthParams())}`);
  return data;
}

export async function getMethodsOfTravel(supplierId: string) {
  if (USE_MOCKS) {
    const m = loadMock(`methods_${supplierId}`) || loadMock("methods_POT");
    if (m) return m;
    throw new Error(`Mock methods for ${supplierId} not found`);
  }
  if (!baseURL && !IS_TEST) throw new Error("FERRY_BASE is not set (cannot call real API)");
  const { data } = await client.get(`/getMethodsOfTravel?${qs.stringify(withAuthParams({ supplierId }))}`);
  return data;
}

export async function getSailingTimes(supplierIdOrParams: any, departDate?: string, departPort?: string, arrivePort?: string) {
  // support both signature styles
  if (USE_MOCKS) {
    const m = loadMock("sailings");
    if (m) return m;
    throw new Error("Mock sailings.json not found");
  }
  if (!baseURL && !IS_TEST) throw new Error("FERRY_BASE is not set (cannot call real API)");
  const params = typeof supplierIdOrParams === "object" ? supplierIdOrParams : { supplierId: supplierIdOrParams, departDate, departPort, arrivePort };
  const { data } = await client.get(`/getSailingTimes?${qs.stringify(withAuthParams(params))}`);
  return data;
}
