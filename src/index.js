
import { createRemoteJWKSet, jwtVerify } from "jose";

const ACCESS_TEAM_DOMAIN = "schoolpsychny.cloudflareaccess.com";
const ACCESS_ISSUER = `https://${ACCESS_TEAM_DOMAIN}`;
const ACCESS_AUDIENCE =
  "77e7e305474082b3ef0472528f91214184b4d11e0a769f66a70c959364a10791";

const ACCESS_JWKS = createRemoteJWKSet(
  new URL(`${ACCESS_ISSUER}/cdn-cgi/access/certs`),
);

async function requireAdminAccess(request) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, ACCESS_JWKS, {
      issuer: ACCESS_ISSUER,
      audience: ACCESS_AUDIENCE,
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
    (typeof body.description !== "string" ||
      body.description.length > 10000)
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
    (typeof body.preview_image !== "string" ||
      body.preview_image.length > 1000)
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

    // All admin endpoints require a valid Cloudflare Access JWT.
    if (url.pathname.startsWith("/api/admin/")) {
      const denied = await requireAdminAccess(request);

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
          return jsonError(
            "Only draft products can receive uploads.",
            409,
          );
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
        const header = new Uint8Array(
          await file.slice(0, 5).arrayBuffer(),
        );

        if (
          header.length !== 5 ||
          String.fromCharCode(...header) !== "%PDF-"
        ) {
          return jsonError("The uploaded file is not a valid PDF.");
        }

        // The server generates the R2 key; clients cannot choose it.
        const fileKey =
          `products/${productId}/${crypto.randomUUID()}.pdf`;

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
              return jsonError(
                "That product URL is already in use.",
                409,
              );
            }

            throw error;
          }

          return Response.json(
            { id, status: "draft" },
            { status: 201 },
          );
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
            return jsonError(
              "Products cannot be published until secure file uploads and readiness checks are implemented.",
              400,
            );
          }

          const fields = Object.keys(body);
          const assignments = fields
            .map((field) => `${field} = ?`)
            .join(", ");

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
              return jsonError(
                "That product URL is already in use.",
                409,
              );
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
