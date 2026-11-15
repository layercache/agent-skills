// ==== COST GUARD TEST FIXTURE: DO NOT DEPLOY ====
// This is a deliberate counterexample for testing the cloudflare-cost-guard
// skill. Cases in this folder contain code that can run up a Cloudflare bill
// on purpose. Never deploy it, run it, or copy it into a real project.
// ==== END OF TEST FIXTURE NOTICE ====

import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Customer } from "../auth";
import { idempotencyKeys, orderItems, orders, products } from "../db/schema";
import type { Env } from "../index";

const MAX_ITEMS = 20;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;

interface OrderRequest {
  idempotencyKey: string;
  items: { productId: string; quantity: number }[];
}

export async function listOrders(customer: Customer, env: Env): Promise<Response> {
  const rows = await drizzle(env.DB)
    .select()
    .from(orders)
    .where(eq(orders.customerId, customer.id))
    .orderBy(desc(orders.createdAt));
  return Response.json({ orders: rows });
}

export async function createOrder(customer: Customer, request: Request, env: Env): Promise<Response> {
  const body = await request.json<OrderRequest>();
  const items = Array.isArray(body.items) ? body.items : [];
  const valid =
    IDEMPOTENCY_KEY.test(body.idempotencyKey ?? "") &&
    items.length > 0 &&
    items.length <= MAX_ITEMS &&
    items.every((item) => Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity < 100);
  if (!valid) return new Response("invalid order", { status: 400 });

  const db = drizzle(env.DB);
  const claimed = await db
    .insert(idempotencyKeys)
    .values({ key: `${customer.id}:${body.idempotencyKey}`, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (claimed.length === 0) return Response.json({ error: "duplicate request" }, { status: 409 });

  const priced = await db
    .select({ id: products.id, priceCents: products.priceCents })
    .from(products)
    .where(inArray(products.id, items.map((item) => item.productId)));
  const prices = new Map(priced.map((p) => [p.id, p.priceCents]));
  if (items.some((item) => !prices.has(item.productId))) {
    return new Response("unknown product", { status: 400 });
  }

  const orderId = crypto.randomUUID();
  const totalCents = items.reduce((sum, item) => sum + prices.get(item.productId)! * item.quantity, 0);
  await db.batch([
    db.insert(orders).values({ id: orderId, customerId: customer.id, status: "placed", totalCents, createdAt: Date.now() }),
    db.insert(orderItems).values(items.map((item) => ({ orderId, productId: item.productId, quantity: item.quantity }))),
  ]);
  await env.JOBS.enqueueReceipt(orderId);
  return Response.json({ id: orderId }, { status: 201 });
}
