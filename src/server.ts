import dotenv from "dotenv";
dotenv.config();

import express from "express";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";



// Import after dotenv.config() to ensure env is loaded before module init
const ferryClient = require("./ferryClient") as typeof import("./ferryClient");

// Debug env loaded
console.log("ENV:", {
  FERRY_BASE: process.env.FERRY_BASE ? "**OK**" : "MISSING",
  USE_MOCKS: process.env.USE_MOCKS,
  XCHANGE_USER: process.env.XCHANGE_USER ? "**OK**" : "MISSING"
});

const app = express();
app.use(helmet());
app.use(express.json());
app.use(rateLimit({ windowMs: 10 * 1000, max: 20 }));
// Dev CORS: allow other origins (e.g., opening UI via Apache/XAMPP)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Route root simple
app.get("/", (_, res) => res.send("Ferry proxy alive — try /api/suppliers"));

// Serve static UI from /public and mount a friendly /ui route
app.use(express.static(path.join(__dirname, "../public")));
app.get("/ui", (_, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Suppliers
app.get("/api/suppliers", async (_, res) => {
  console.log("[req] GET /api/suppliers");
  try {
    const data = await ferryClient.getSuppliers();
    const suppliers = Array.isArray((data as any).suppliers)
      ? (data as any).suppliers
      : [];
    // Filter to expected valid suppliers for API output
    const filtered = suppliers.filter((s: any) =>
      s && typeof s === "object" && ["BFT", "POT"].includes(s.supplierId)
    );
    console.log("[ok] suppliers ->", `suppliers:${filtered.length}`);
    res.json({ success: true, suppliers: filtered });
  } catch (err: any) {
    console.error("[err] /api/suppliers", err?.stack || err);
    res.status(502).json({ error: err?.message || String(err) });
  }
});

// Methods
app.get("/api/methods/:supplierId", async (req, res) => {
  console.log(`[req] GET /api/methods/${req.params.supplierId}`);
  try {
    const data = await ferryClient.getMethodsOfTravel(req.params.supplierId);
    const methods = Array.isArray((data as any).methods)
      ? (data as any).methods
      : [];
    // Keep only expected valid methods
    const filtered = methods.filter((m: any) => m && ["CAR", "HCR"].includes(m.code));
    console.log("[ok] methods ->", `methods:${filtered.length}`);
    res.json({ success: true, methods: filtered });
  } catch (err: any) {
    console.error("[err] /api/methods", err?.stack || err);
    res.status(502).json({ error: err?.message || String(err) });
  }
});

// Sailings
app.get("/api/sailings", async (req, res) => {
  console.log("[req] GET /api/sailings", req.query);
  try {
    const { supplierId, departDate, departPort, arrivePort } = req.query;
    if (!supplierId || !departDate || !departPort || !arrivePort) {
      return res.status(400).json({ error: "Missing required query params" });
    }
    const data = await ferryClient.getSailingTimes({
      supplierId: supplierId as string,
      departDate: departDate as string,
      departPort: departPort as string,
      arrivePort: arrivePort as string
    });
    const sailings = Array.isArray((data as any).sailings)
      ? (data as any).sailings
      : [];
    // Filter sailings by the provided query params
    const dateStr = String(departDate);
    const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    const filtered = sailings.filter((s: any) =>
      s &&
      s.supplierId === supplierId &&
      s.departPort === departPort &&
      s.arrivePort === arrivePort &&
      typeof s.departTime === "string" && s.departTime.startsWith(isoDate)
    );
    console.log("[ok] sailings ->", `sailings:${filtered.length}`);
    res.json({ success: true, sailings: filtered });
  } catch (err: any) {
    console.error("[err] /api/sailings", err?.stack || err);
    res.status(502).json({ error: err?.message || String(err) });
  }
});

// Simple helpers to load local mocks
function readMock(name: string) {
  const p = path.join(__dirname, "../mocks", `${name}.json`);
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  } catch (e) {
    console.error("readMock error", name, e);
  }
  return null;
}

// Cabins and fees endpoints
app.get("/api/cabins", (_, res) => {
  const data = readMock("cabins") || { cabins: [] };
  res.json(data);
});

app.get("/api/fees", (_, res) => {
  const data = readMock("fees") || { fees: {} };
  res.json(data);
});

// Distinct routes for suggestions
app.get("/api/routes", (_, res) => {
  const data = (readMock("sailings") as any) || { sailings: [] as any[] };
  const routesMap = new Map<string, { departPort: string; arrivePort: string; suppliers: string[] }>();
  for (const s of (data.sailings as any[]) || []) {
    if (!s?.departPort || !s?.arrivePort) continue;
    const key = `${s.departPort}__${s.arrivePort}`;
    const entry = routesMap.get(key) || { departPort: s.departPort, arrivePort: s.arrivePort, suppliers: [] as string[] };
    if (s.supplierId && !entry.suppliers.includes(s.supplierId)) entry.suppliers.push(s.supplierId);
    routesMap.set(key, entry);
  }
  res.json({ success: true, routes: Array.from(routesMap.values()) });
});

// Search endpoint: aggregates sailings and returns basic priced options
app.get("/api/search", async (req, res) => {
  try {
    const { supplierId, departDate, departPort, arrivePort, adults = "1", children = "0", pets = "0", vehicles = "0", method = "", childrenAges = "" } = req.query as Record<string, string>;
    // Allow searching across all companies when supplierId is missing or 'ALL'
    if (!departDate || !departPort || !arrivePort) {
      return res.status(400).json({ error: "Missing required query params" });
    }
    let sailings: any[] = [];
    if (!supplierId || supplierId === "ALL") {
      // In mocks mode, read all sailings and filter locally
      const all = readMock("sailings");
      sailings = Array.isArray(all?.sailings) ? all.sailings : [];
    } else {
      const raw = await ferryClient.getSailingTimes({ supplierId, departDate, departPort, arrivePort });
      sailings = Array.isArray((raw as any).sailings) ? (raw as any).sailings : [];
    }

    const dateStr = String(departDate);
    const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    const filtered = sailings.filter((s: any) => {
      if (!s) return false;
      if (supplierId && supplierId !== "ALL" && s.supplierId !== supplierId) return false;
      if (s.departPort !== departPort) return false;
      if (s.arrivePort !== arrivePort) return false;
      return typeof s.departTime === "string" && s.departTime.startsWith(isoDate);
    });

    const fees = (readMock("fees") || {}).fees || {};
    const numPets = Number(pets) || 0;
    const numVehicles = Number(vehicles) || 0;
    const ages = String(childrenAges || "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => Number(a))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 17);
    const explicitChildren = Number(children) || 0;
    // Derive counts: if ages provided, use them to classify; else fall back to counts
    const infantCount = ages.length ? ages.filter((n) => n < 2).length : 0;
    const childCount = ages.length ? ages.filter((n) => n >= 2 && n < 12).length : explicitChildren;
    // Any ages >= 12 effectively behave as adults increment
    const adultFromAges = ages.length ? ages.filter((n) => n >= 12).length : 0;
    const numAdults = (Number(adults) || 0) + adultFromAges;

    const baseAdult = Number(fees.baseAdult || 50);
    const baseChild = Number(fees.baseChild || 30);
    const baseInfant = Number(fees.infant || 0);
    const petFee = Number(fees.pet || 10);
    const vehicleFee = Number(fees.vehicle || 20);
    const methodSurcharges = fees.methodSurcharges || {};
    const methodSurcharge = Number(methodSurcharges[method as string] || 0);

    const priced = filtered.map((s: any) => {
      const subtotal = baseAdult * numAdults + baseChild * childCount + baseInfant * infantCount + petFee * numPets + vehicleFee * numVehicles;
      const total = subtotal + methodSurcharge; // simple per-booking method surcharge
      return {
        ...s,
        price: {
          currency: fees.currency || "EUR",
          total,
          breakdown: {
            adults: { count: numAdults, unit: baseAdult },
            children: { count: childCount, unit: baseChild },
            infants: { count: infantCount, unit: baseInfant },
            pets: { count: numPets, unit: petFee },
            vehicles: { count: numVehicles, unit: vehicleFee },
            methodSurcharge,
          },
        },
      };
    });

    res.json({ success: true, results: priced });
  } catch (err: any) {
    console.error("[err] /api/search", err?.stack || err);
    res.status(502).json({ error: err?.message || String(err) });
  }
});

// Start server only when run directly (not during tests)
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Proxy API running on http://localhost:${PORT}`);
  });
}

export default app;
