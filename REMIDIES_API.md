# Remidies E-Commerce API

Base URLs:
- **User:** `/api/student/remidies`
- **Admin:** `/api/admin/remidies`

All endpoints require a `Bearer <token>` in the `Authorization` header.

---

## Categories

### `GET /categories`
> Available to both users and admins.

Returns all categories.

**Response**
```json
{ "success": true, "data": [{ "id": "...", "name": "Herbal", "description": "...", "image": "..." }] }
```

---

### `POST /categories` 🔒 Admin
**Body**
```json
{ "name": "Herbal", "description": "Optional", "image": "https://..." }
```

---

### `PUT /categories/:id` 🔒 Admin
**Body** — all fields optional
```json
{ "name": "Updated Name", "description": "...", "image": "https://..." }
```

---

### `DELETE /categories/:id` 🔒 Admin

---

## Products

### `GET /products`
> Available to both users and admins.

**Query Params**
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page |
| `categoryId` | ObjectId | — | Filter by category |
| `isActive` | boolean | — | Filter by status |

**Response**
```json
{
  "success": true,
  "data": [...],
  "meta": { "total": 50, "page": 1, "limit": 10, "totalPages": 5 }
}
```

---

### `POST /products` 🔒 Admin
**Body**
```json
{
  "name": "Ashwagandha Tablets",
  "description": "...",
  "image": "https://...",
  "price": 499.0,
  "stock": 100,
  "isActive": true,
  "categoryId": "<ObjectId>"
}
```

---

### `PUT /products/:id` 🔒 Admin
**Body** — all fields optional, same shape as create.

---

### `DELETE /products/:id` 🔒 Admin

---

## Cart

> All cart endpoints require user auth.

### `GET /cart`
Returns the authenticated user's cart with all items and product details.

---

### `POST /cart`
Add a product to cart. If the product is already in cart, quantity is incremented.

**Body**
```json
{ "productId": "<ObjectId>", "quantity": 2 }
```

> ⚠️ Returns `400` if `quantity > stock`.

---

### `PUT /cart/:productId`
Set a specific quantity for a cart item.

**Body**
```json
{ "quantity": 5 }
```

> ⚠️ Returns `400` if `quantity > stock`.

---

### `DELETE /cart/:productId`
Remove a product from the cart.

---

## Orders

### `POST /orders`
Checkout the cart atomically:
1. Validates stock for all items
2. Decrements stock
3. Creates the `Order` with snapshot prices
4. Creates a `Payment` record (`type: PRODUCT, status: PENDING`)
5. Clears the cart

**Body**
```json
{
  "shippingName": "Ravi Sharma",
  "shippingPhone": "9876543210",
  "shippingAddress": "123 Main St",
  "shippingCity": "Delhi",
  "shippingState": "Delhi",
  "shippingPostal": "110001"
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "order": { "id": "...", "totalAmount": 998.0, "status": "PENDING", "items": [...] },
    "payment": { "id": "...", "amount": 998.0, "status": "PENDING", "provider": "RAZORPAY" }
  }
}
```

---

### `GET /orders`
Returns the authenticated user's order history with items and payment info.

---

### `PUT /orders/:id/status` 🔒 Admin
Update order status.

**Body**
```json
{ "status": "SHIPPED" }
```

**Valid statuses:** `PENDING` → `PAID` → `SHIPPED` → `DELIVERED` / `CANCELLED`

---

## Error Responses

| Code | Meaning |
|---|---|
| `400` | Validation error / insufficient stock / inactive product |
| `401` | Missing or invalid JWT |
| `403` | Admin-only endpoint |
| `404` | Resource not found |
| `500` | Internal server error |

```json
{ "success": false, "error": "Insufficient stock. Available: 3" }
```
