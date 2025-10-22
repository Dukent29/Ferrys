import request from "supertest";
import app from "../src/server";

describe("API Endpoints", () => {
  test("GET /api/suppliers should return a list of suppliers", async () => {
    const response = await request(app).get("/api/suppliers");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      suppliers: [
        { supplierId: "BFT", name: "BlueFerry Trans", country: "FR" },
        { supplierId: "POT", name: "PortOcean Lines", country: "UK" },
      ],
    });
  });

  test("GET /api/methods/POT should return methods for supplier POT", async () => {
    const response = await request(app).get("/api/methods/POT");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      methods: [
        { code: "CAR", label: "Voiture standard", lengthMin: 0, lengthMax: 6, addLength: false },
        { code: "HCR", label: "Voiture avec coffre", lengthMin: 0, lengthMax: 7, addLength: true, addHeight: true },
      ],
    });
  });

  test("GET /api/sailings should return sailings based on query parameters", async () => {
    const response = await request(app).get(
      "/api/sailings?supplierId=BFT&departDate=20251020&departPort=CAEN&arrivePort=PORS"
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      sailings: [
        {
          sailingId: "BFT-20251020-001",
          supplierId: "BFT",
          departPort: "CAEN",
          arrivePort: "PORS",
          departTime: "2025-10-20T08:30:00+02:00",
          arriveTime: "2025-10-20T11:00:00+02:00",
          durationMinutes: 150,
          vessel: "Blue Star 3",
          onBoardFacilities: ["cafe", "wifi", "pets_allowed"],
        },
      ],
    });
  });
});