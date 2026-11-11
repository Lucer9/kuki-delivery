// OpenAPI spec, served at /openapi.json. Descriptions are written for the model:
// they say when to call each tool and what to tell the customer.
export const openapi = (server: string) => ({
  openapi: "3.1.0",
  info: {
    title: "Cookie delivery service",
    version: "0.1.0",
    description: "Delivery quotes, orders and tracking for the bakery. The menu lives in the agent, not here.",
  },
  servers: [{ url: server }],
  paths: {
    "/quote": {
      post: {
        operationId: "getDeliveryQuote",
        summary: "Price a cart with delivery to an address",
        description:
          "Call after the customer has chosen their cookies and given a delivery address. Returns the subtotal, delivery fee, total and a quote_id. Read the `summary` field to the customer and ask them to confirm before calling placeOrder. Quotes expire (see expires_at).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["dropoff", "items"],
                properties: {
                  dropoff: {
                    type: "object",
                    required: ["address"],
                    properties: {
                      address: { type: "string", description: "Full US address: street and number, city, state, ZIP code." },
                      lat: { type: "number" },
                      lng: { type: "number" },
                    },
                  },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["name", "unit_price", "quantity"],
                      properties: {
                        name: { type: "string" },
                        unit_price: { type: "number", description: "Price per unit from the menu, in USD." },
                        quantity: { type: "integer", minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Quote" }, "422": { description: "Address outside delivery area or not found" } },
      },
    },
    "/order": {
      post: {
        operationId: "placeOrder",
        summary: "Place the order for a confirmed quote",
        description:
          "Call only after the customer explicitly confirms the quoted total. If the error code is quote_expired, call getDeliveryQuote again and confirm the new total before retrying.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["quote_id", "customer"],
                properties: {
                  quote_id: { type: "string" },
                  customer: {
                    type: "object",
                    required: ["name", "phone"],
                    properties: {
                      name: { type: "string" },
                      phone: { type: "string", description: "With country code, e.g. +13235550123" },
                    },
                  },
                  notes: { type: "string", description: "Delivery instructions for the courier, max 200 chars." },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Order created" }, "410": { description: "Quote expired" } },
      },
    },
    "/order/{order_id}": {
      get: {
        operationId: "getOrderStatus",
        summary: "Check where an order is",
        description: "Call when the customer asks about their order. Share the `summary` and the tracking_url.",
        parameters: [{ name: "order_id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Status" }, "404": { description: "Order not found" } },
      },
    },
  },
});
