// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    priceCents: integer("price_cents").notNull(),
  },
  (t) => [index("products_category_price").on(t.category, t.priceCents)]
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    status: text("status").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("orders_created").on(t.createdAt)]
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id").notNull(),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order").on(t.orderId)]
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idempotency_keys_created").on(t.createdAt)]
);

export const receipts = sqliteTable("receipts", {
  orderId: text("order_id").primaryKey(),
  issuedAt: integer("issued_at").notNull(),
});
