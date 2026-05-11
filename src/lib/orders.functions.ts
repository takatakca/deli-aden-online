import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ItemOptionSchema = z.object({
  groupLabel: z.string(),
  values: z.array(z.string()),
});

const ItemSchema = z.object({
  itemId: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  unitPrice: z.number().min(0).max(10000),
  quantity: z.number().int().min(1).max(99),
  options: z.array(ItemOptionSchema).optional(),
  combo: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

const CreateOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(4).max(40),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
  }),
  orderType: z.enum(["pickup", "delivery"]),
  deliveryAddress: z.string().max(400).optional().or(z.literal("")),
  preferredTime: z.string().max(100).default("ASAP"),
  paymentMethod: z.enum(["pay_at_restaurant", "cash", "card_on_arrival"]),
  specialNotes: z.string().max(1000).optional().or(z.literal("")),
  items: z.array(ItemSchema).min(1).max(50),
  subtotal: z.number().min(0),
  gst: z.number().min(0),
  qst: z.number().min(0),
  total: z.number().min(0),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => CreateOrderSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.orderType === "delivery" && !data.deliveryAddress) {
      throw new Error("Adresse de livraison requise");
    }
    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: data.customer.name,
        customer_phone: data.customer.phone,
        customer_email: data.customer.email || null,
        order_type: data.orderType,
        delivery_address: data.deliveryAddress || null,
        preferred_time: data.preferredTime || "ASAP",
        payment_method: data.paymentMethod,
        items: data.items as never,
        subtotal: data.subtotal,
        gst: data.gst,
        qst: data.qst,
        total: data.total,
        special_notes: data.specialNotes || null,
      })
      .select("order_number, id, created_at")
      .single();
    if (error) {
      console.error("createOrder error", error);
      throw new Error("Impossible de créer la commande");
    }
    return { orderNumber: row.order_number, id: row.id };
  });

export const getOrderByNumber = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ orderNumber: z.string().max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("order_number", data.orderNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { order: row };
  });

const AdminAuthSchema = z.object({ password: z.string().min(1).max(200) });

function checkAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD || "deli-aden-admin";
  return password === expected;
}

export const adminListOrders = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    AdminAuthSchema.extend({
      status: z.string().max(40).optional(),
      search: z.string().max(120).optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    if (!checkAdminPassword(data.password)) throw new Error("Mot de passe invalide");
    let q = supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false }).limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`order_number.ilike.${s},customer_name.ilike.${s},customer_phone.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { orders: rows ?? [] };
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    AdminAuthSchema.extend({
      id: z.string().uuid(),
      status: z.enum(["new", "accepted", "preparing", "ready", "completed", "cancelled"]),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    if (!checkAdminPassword(data.password)) throw new Error("Mot de passe invalide");
    const { error } = await supabaseAdmin.from("orders").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminVerify = createServerFn({ method: "POST" })
  .inputValidator((input) => AdminAuthSchema.parse(input))
  .handler(async ({ data }) => {
    return { ok: checkAdminPassword(data.password) };
  });

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(3000),
});

export const submitContact = createServerFn({ method: "POST" })
  .inputValidator((input) => ContactSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("contact_messages").insert({
      name: data.name,
      phone: data.phone || null,
      email: data.email,
      message: data.message,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
