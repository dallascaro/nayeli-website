import { createRemoteJWKSet, jwtVerify } from "jose";

const ACCESS_TEAM_DOMAIN = "schoolpsychny.cloudflareaccess.com";
const ACCESS_ISSUER = `https://${ACCESS_TEAM_DOMAIN}`;
const ACCESS_AUDIENCE = (env) =>
  env.ACCESS_AUDIENCE ||
  "77e7e305474082b3ef0472528f91214184b4d11e0a769f66a70c959364a10791";
const ACCESS_JWKS = createRemoteJWKSet(
  new URL(`${ACCESS_ISSUER}/cdn-cgi/access/certs`),
);

async function requireAdminAccess(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, ACCESS_JWKS, {
      issuer: ACCESS_ISSUER,
      audience: ACCESS_AUDIENCE(env),
    });

    if (payload.email !== "schoolpsychny@gmail.com") {
      return new Response("Forbidden", { status: 403 });
    }

    return null;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(",").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);

  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload)),
  );
  const expected = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) {
      difference |= expected.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
    }
    return difference === 0;
  });
}

function isValidProductInput(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }

  const allowedFields = new Set([
    "url",
    "name",
    "description",
    "price",
    "category",
    "preview_image",
    "status",
  ]);

  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return false;
  }

  if (!partial && (!body.url || !body.name || body.price === undefined)) {
    return false;
  }

  if (
    body.url !== undefined &&
    (typeof body.url !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.url))
  ) {
    return false;
  }

  if (
    body.name !== undefined &&
    (typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 200)
  ) {
    return false;
  }

  if (
    body.description !== undefined &&
    (typeof body.description !== "string" || body.description.length > 10000)
  ) {
    return false;
  }

  if (
    body.price !== undefined &&
    (typeof body.price !== "number" ||
      !Number.isFinite(body.price) ||
      body.price < 0)
  ) {
    return false;
  }

  if (
    body.category !== undefined &&
    (typeof body.category !== "string" || body.category.length > 100)
  ) {
    return false;
  }

  if (
    body.preview_image !== undefined &&
    body.preview_image !== null &&
    (typeof body.preview_image !== "string" || body.preview_image.length > 1000)
  ) {
    return false;
  }

  if (
    body.status !== undefined &&
    !["draft", "published", "archived"].includes(body.status)
  ) {
    return false;
  }

  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Development-only Stripe webhook. Verify signatures before processing events.
    if (url.pathname === "/api/stripe/webhook") {
      if (env.ENVIRONMENT !== "development" || env.WORKER_NAME !== "nayeli-dev") {
        return jsonError("Not found.", 404);
      }
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      if (!env.STRIPE_WEBHOOK_SECRET) {
        return jsonError("Stripe webhook is not configured.", 503);
      }

      const rawBody = await request.text();
      let validSignature = false;
      try {
        validSignature = await verifyStripeSignature(
          rawBody,
          request.headers.get("Stripe-Signature"),
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        return jsonError("Invalid webhook signature.", 400);
      }
      if (!validSignature) return jsonError("Invalid webhook signature.", 400);

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return jsonError("Invalid webhook payload.", 400);
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data?.object;
        if (session?.payment_status === "paid" && session?.id && session?.client_reference_id) {
          await env.DB.prepare(
            "UPDATE orders SET payment_status = 'paid' WHERE id = ? AND payment_reference = ? AND payment_status = 'pending'",
          ).bind(session.client_reference_id, session.id).run();
        }
      } else if (event.type === "checkout.session.expired") {
        const session = event.data?.object;
        if (session?.id && session?.client_reference_id) {
          await env.DB.prepare(
            "UPDATE orders SET payment_status = 'cancelled' WHERE id = ? AND payment_reference = ? AND payment_status = 'pending'",
          ).bind(session.client_reference_id, session.id).run();
        }
      }

      return Response.json({ received: true });
    }

    // All admin endpoints require a valid Cloudflare Access JWT.
    if (url.pathname.startsWith("/api/admin/")) {
      const denied = await requireAdminAccess(request, env);

      if (denied) {
        return denied;
      }

      // POST /api/admin/products/:id/file
      // Upload a PDF to private R2 storage for an existing draft product.
      const uploadMatch = url.pathname.match(
        /^\/api\/admin\/products\/([a-zA-Z0-9_-]+)\/file$/,
      );

      if (uploadMatch) {
        if (request.method !== "POST") {
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "POST" },
          });
        }

        const MAX_FILE_SIZE = 20 * 1024 * 1024;
        const productId = uploadMatch[1];
        const contentLength = Number(request.headers.get("Content-Length"));

        // Allow some multipart overhead, but reject obviously oversized bodies.
        if (
          Number.isFinite(contentLength) &&
          contentLength > MAX_FILE_SIZE + 100_000
        ) {
          return jsonError("File exceeds the 20 MB limit.", 413);
        }

        const product = await env.DB.prepare(
          `SELECT id, status, file_key
           FROM products
           WHERE id = ?`,
        )
          .bind(productId)
          .first();

        if (!product) {
          return jsonError("Product not found.", 404);
        }

        if (product.status !== "draft") {
          return jsonError("Only draft products can receive uploads.", 409);
        }

        let form;

        try {
          form = await request.formData();
        } catch {
          return jsonError("Expected a multipart form containing a PDF.");
        }

        const file = form.get("file");

        if (
          !file ||
          typeof file === "string" ||
          typeof file.size !== "number"
        ) {
          return jsonError("A file is required.");
        }

        if (file.size === 0) {
          return jsonError("The file is empty.");
        }

        if (file.size > MAX_FILE_SIZE) {
          return jsonError("File exceeds the 20 MB limit.", 413);
        }

        const originalName = file.name || "resource.pdf";
        const safeName = originalName
          .replace(/[\/\\\x00-\x1f\x7f]/g, "_")
          .slice(0, 255);

        if (!safeName.toLowerCase().endsWith(".pdf")) {
          return jsonError("Only PDF files are allowed.");
        }

        // Basic PDF signature check. This is not a malware scan.
        const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());

        if (header.length !== 5 || String.fromCharCode(...header) !== "%PDF-") {
          return jsonError("The uploaded file is not a valid PDF.");
        }

        // The server generates the R2 key; clients cannot choose it.
        const fileKey = `products/${productId}/${crypto.randomUUID()}.pdf`;

        let uploaded = false;

        try {
          await env.PRODUCT_FILES.put(fileKey, file.stream(), {
            httpMetadata: {
              contentType: "application/pdf",
              contentDisposition: "attachment",
            },
            customMetadata: {
              productId,
              originalFileName: safeName,
            },
          });

          uploaded = true;

          const result = await env.DB.prepare(
            `UPDATE products
             SET file_key = ?, file_name = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'draft'`,
          )
            .bind(fileKey, safeName, productId)
            .run();

          if (result.meta.changes === 0) {
            throw new Error("Product was no longer an eligible draft.");
          }
        } catch (error) {
          // Remove the new object if associating it with the product fails.
          if (uploaded) {
            try {
              await env.PRODUCT_FILES.delete(fileKey);
            } catch {
              // Cleanup can be retried if storage is temporarily unavailable.
            }
          }

          throw error;
        }

        // Remove the previous object only after the new file is associated.
        if (product.file_key && product.file_key !== fileKey) {
          try {
            await env.PRODUCT_FILES.delete(product.file_key);
          } catch {
            // The new file remains associated if old-file cleanup fails.
          }
        }

        return Response.json({
          id: productId,
          fileName: safeName,
          fileSize: file.size,
          uploaded: true,
          status: "draft",
        });
      }

      // GET /api/admin/products
      // POST /api/admin/products
      if (url.pathname === "/api/admin/products") {
        if (request.method === "GET") {
          const { results } = await env.DB.prepare(
            `SELECT id, url, name, description, price, category,
                    preview_image, file_key, file_name, status,
                    created_at, updated_at
             FROM products
             ORDER BY created_at DESC`,
          ).all();

          return Response.json({ products: results });
        }

        if (request.method === "POST") {
          let body;

          try {
            body = await request.json();
          } catch {
            return jsonError("Invalid JSON.");
          }

          if (!isValidProductInput(body)) {
            return jsonError("Invalid product data.");
          }

          const id = crypto.randomUUID();

          try {
            await env.DB.prepare(
              `INSERT INTO products
                 (id, url, name, description, price, category,
                  preview_image, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
            )
              .bind(
                id,
                body.url,
                body.name.trim(),
                body.description ?? "",
                body.price,
                body.category ?? "",
                body.preview_image ?? null,
              )
              .run();
          } catch (error) {
            if (String(error).includes("UNIQUE")) {
              return jsonError("That product URL is already in use.", 409);
            }

            throw error;
          }

          return Response.json({ id, status: "draft" }, { status: 201 });
        }

        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET, POST" },
        });
      }

      // PATCH /api/admin/products/:id
      // DELETE /api/admin/products/:id (archives the product).
      const productMatch = url.pathname.match(
        /^\/api\/admin\/products\/([a-zA-Z0-9_-]+)$/,
      );

      if (productMatch) {
        const id = productMatch[1];

        if (request.method === "PATCH") {
          let body;

          try {
            body = await request.json();
          } catch {
            return jsonError("Invalid JSON.");
          }

          if (
            !isValidProductInput(body, true) ||
            Object.keys(body).length === 0
          ) {
            return jsonError("Invalid product data.");
          }

          if (body.status === "published") {
            const product = await env.DB.prepare(
              `SELECT id, file_key, file_name, name, price
     FROM products
     WHERE id = ?`,
            )
              .bind(id)
              .first();

            if (!product) {
              return jsonError("Product not found.", 404);
            }

            if (!product.file_key || !product.file_name) {
              return jsonError("Upload a PDF before publishing.", 400);
            }

            if (
              !product.name?.trim() ||
              product.price == null ||
              product.price < 0
            ) {
              return jsonError(
                "Complete the product details before publishing.",
                400,
              );
            }
          }

          const fields = Object.keys(body);
          const assignments = fields.map((field) => `${field} = ?`).join(", ");

          try {
            const result = await env.DB.prepare(
              `UPDATE products
               SET ${assignments}, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            )
              .bind(
                ...fields.map((field) =>
                  field === "name" ? body[field].trim() : body[field],
                ),
                id,
              )
              .run();

            if (result.meta.changes === 0) {
              return jsonError("Product not found.", 404);
            }
          } catch (error) {
            if (String(error).includes("UNIQUE")) {
              return jsonError("That product URL is already in use.", 409);
            }

            throw error;
          }

          return Response.json({ id, updated: true });
        }

        if (request.method === "DELETE") {
          const result = await env.DB.prepare(
            `UPDATE products
             SET status = 'archived', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
            .bind(id)
            .run();

          if (result.meta.changes === 0) {
            return jsonError("Product not found.", 404);
          }

          return Response.json({ id, status: "archived" });
        }

        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "PATCH, DELETE" },
        });
      }

      return jsonError("Not found.", 404);
    }
    // Development-only Stripe Checkout session creation.
    if (url.pathname === "/api/checkout/create-session") {
      if (
        env.ENVIRONMENT !== "development" ||
        env.WORKER_NAME !== "nayeli-dev"
      ) {
        return jsonError("Stripe test checkout is only available in development.", 403);
      }

      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }

      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
        return jsonError("Stripe test mode is not configured.", 503);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError("Invalid JSON.");
      }

      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const email = typeof body?.email === "string" ? body.email.trim() : "";
      const items = body?.items;

      if (!name || name.length > 120) {
        return jsonError("Enter a valid name.");
      }

      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonError("Enter a valid email address.");
      }

      if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 50 ||
        items.some(
          (item) =>
            !item ||
            typeof item.id !== "string" ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1 ||
            item.quantity > 99,
        )
      ) {
        return jsonError("Your cart is invalid.");
      }

      const quantities = new Map();
      for (const item of items) {
        quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);
      }

      if ([...quantities.values()].some((quantity) => quantity > 99)) {
        return jsonError("A product quantity is too high.");
      }

      const purchasedItems = [];
      const lineItems = [];
      let totalCents = 0;

      for (const [productId, quantity] of quantities) {
        const product = await env.DB.prepare(
          `SELECT id, name, price, file_key, file_name
           FROM products
           WHERE id = ? AND status = 'published'`,
        )
          .bind(productId)
          .first();

        if (!product || !product.file_key || !product.file_name) {
          return jsonError("A cart item is no longer available.", 409);
        }

        const unitPriceCents = Math.round(product.price * 100);
        const lineTotalCents = unitPriceCents * quantity;
        totalCents += lineTotalCents;

        purchasedItems.push({
          productId: product.id,
          name: product.name,
          quantity,
          unitPriceCents,
          lineTotalCents,
        });

        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: { name: product.name },
            unit_amount: unitPriceCents,
          },
          quantity,
        });
      }

      if (totalCents <= 0) {
        return jsonError("Your cart total must be greater than $0.00 to use Stripe Checkout.", 400);
      }

      const orderId = crypto.randomUUID();
      const orderNumber = `SPNY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      await env.DB.prepare(
        `INSERT INTO orders
          (id, order_number, customer_email, total_paid, payment_status,
           original_purchase, payment_reference)
         VALUES (?, ?, ?, ?, 'pending', ?, NULL)`,
      )
        .bind(
          orderId,
          orderNumber,
          email,
          totalCents / 100,
          JSON.stringify({ name, items: purchasedItems, paymentProvider: "stripe" }),
        )
        .run();

      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("customer_email", email);
      form.set("client_reference_id", orderId);
      form.set("success_url", "https://nayeli-dev.dallascaro98.workers.dev/pages/shop.html?checkout=success&session_id={CHECKOUT_SESSION_ID}");
      form.set("cancel_url", "https://nayeli-dev.dallascaro98.workers.dev/pages/shop.html?checkout=cancelled");
      form.set("metadata[order_id]", orderId);
      form.set("metadata[order_number]", orderNumber);
      form.set("metadata[customer_name]", name);

      for (const [index, item] of lineItems.entries()) {
        form.set(`line_items[${index}][price_data][currency]`, item.price_data.currency);
        form.set(`line_items[${index}][price_data][product_data][name]`, item.price_data.product_data.name);
        form.set(`line_items[${index}][price_data][unit_amount]`, String(item.price_data.unit_amount));
        form.set(`line_items[${index}][quantity]`, String(item.quantity));
      }

      let stripeResponse;
      let session;
      try {
        stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form,
        });
        session = await stripeResponse.json();
      } catch {
        await env.DB.prepare(
          "UPDATE orders SET payment_status = 'failed' WHERE id = ?",
        ).bind(orderId).run();
        return jsonError("Unable to connect to Stripe. Please try again.", 502);
      }

      if (!stripeResponse.ok || !session?.id || !session?.url) {
        await env.DB.prepare(
          "UPDATE orders SET payment_status = 'failed' WHERE id = ?",
        ).bind(orderId).run();
        return jsonError("Stripe could not create checkout. Please try again.", 502);
      }

      await env.DB.prepare(
        "UPDATE orders SET payment_reference = ? WHERE id = ?",
      ).bind(session.id, orderId).run();

      return Response.json({
        success: true,
        checkoutUrl: session.url,
        orderNumber,
        total: totalCents / 100,
        paymentStatus: "pending",
      }, { status: 201 });
    }

    // Development-only simulated checkout. Never processes real payments.
    if (url.pathname === "/api/checkout/simulate") {
      if (
        env.ENVIRONMENT !== "development" ||
        env.WORKER_NAME !== "nayeli-dev"
      ) {
        return jsonError(
          "Simulated checkout is only available in development.",
          403,
        );
      }

      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError("Invalid JSON.");
      }

      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const email = typeof body?.email === "string" ? body.email.trim() : "";
      const items = body?.items;

      if (!name || name.length > 120) {
        return jsonError("Enter a valid name.");
      }

      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonError("Enter a valid email address.");
      }

      if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 50 ||
        items.some(
          (item) =>
            !item ||
            typeof item.id !== "string" ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1 ||
            item.quantity > 99,
        )
      ) {
        return jsonError("Your cart is invalid.");
      }

      const quantities = new Map();
      for (const item of items) {
        quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);
      }

      if ([...quantities.values()].some((quantity) => quantity > 99)) {
        return jsonError("A product quantity is too high.");
      }

      const purchasedItems = [];
      let total = 0;

      for (const [productId, quantity] of quantities) {
        const product = await env.DB.prepare(
          `SELECT id, name, price, file_key, file_name
           FROM products
           WHERE id = ? AND status = 'published'`,
        )
          .bind(productId)
          .first();

        if (!product || !product.file_key || !product.file_name) {
          return jsonError("A cart item is no longer available.", 409);
        }

        const lineTotal = Math.round(product.price * 100) * quantity;
        total += lineTotal;

        purchasedItems.push({
          productId: product.id,
          name: product.name,
          quantity,
          unitPriceCents: Math.round(product.price * 100),
          lineTotalCents: lineTotal,
        });
      }

      const orderId = crypto.randomUUID();
      const orderNumber = `TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const paymentReference = `SIMULATED-${orderId}`;

      await env.DB.prepare(
        `INSERT INTO orders
          (id, order_number, customer_email, total_paid, payment_status,
           original_purchase, payment_reference)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
        .bind(
          orderId,
          orderNumber,
          email,
          total / 100,
          JSON.stringify({ name, items: purchasedItems, simulated: true }),
          paymentReference,
        )
        .run();

      return Response.json(
        {
          success: true,
          simulated: true,
          orderNumber,
          total: total / 100,
          paymentStatus: "pending",
          message: "Development simulation recorded. No payment was taken.",
        },
        { status: 201 },
      );
    }

    // Public storefront products: only published products.
    if (url.pathname === "/api/products" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT id, url, name, description, price, category, preview_image
     FROM products
     WHERE status = 'published'
     ORDER BY created_at DESC`,
      ).all();

      return Response.json({ products: results });
    }

    // Public health check.
    if (url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        database: Boolean(env.DB),
        productStorage: Boolean(env.PRODUCT_FILES),
      });
    }

    // Serve the existing public website.
    return env.ASSETS.fetch(request);
  },
};
