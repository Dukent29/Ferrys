import { getSuppliers, getMethodsOfTravel, getSailingTimes } from "../src/ferryClient";
import NodeCache from "node-cache";

jest.mock("node-cache");

const mockCache = new NodeCache();

jest.mock("axios", () => ({
  create: jest.fn(() => ({
    get: jest.fn((url: string) => {
      if (url.includes("getSuppliers")) {
        return Promise.resolve({ data: { success: true, suppliers: [{ supplierId: "BFT", name: "BlueFerry Trans", country: "FR" }] } });
      }
      if (url.includes("getMethodsOfTravel")) {
        return Promise.resolve({ data: { success: true, methods: [{ code: "CAR", label: "Voiture standard" }] } });
      }
      if (url.includes("getSailingTimes")) {
        return Promise.resolve({ data: { success: true, sailings: [{ sailingId: "BFT-20251020-001", departPort: "CAEN" }] } });
      }
      return Promise.reject(new Error("Invalid URL"));
    }),
  })),
}));

describe("ferryClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getSuppliers should return suppliers from mock data", async () => {
    const suppliers = await getSuppliers();
    expect(suppliers).toEqual({ success: true, suppliers: [{ supplierId: "BFT", name: "BlueFerry Trans", country: "FR" }] });
  });

  test("getMethodsOfTravel should return methods for a supplier", async () => {
    const methods = await getMethodsOfTravel("POT");
    expect(methods).toEqual({ success: true, methods: [{ code: "CAR", label: "Voiture standard" }] });
  });

  test("getSailingTimes should return sailings based on parameters", async () => {
    const sailings = await getSailingTimes({
      supplierId: "BFT",
      departDate: "20251020",
      departPort: "CAEN",
      arrivePort: "PORS",
    });
    expect(sailings).toEqual({ success: true, sailings: [{ sailingId: "BFT-20251020-001", departPort: "CAEN" }] });
  });
});