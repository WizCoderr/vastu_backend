# Admin Panel — Remidies E-Commerce Section

## Context

I am building an admin panel for a backend that exposes the following Remidies e-commerce API.

**Base URL:** `https://api.vastuarunsharma.com/api/admin/remidies`  
**Auth:** All requests require `Authorization: Bearer <token>` header (admin JWT stored in localStorage/context).

---

## API Reference

### Categories
| Method | Endpoint | Body |
|---|---|---|
| GET | `/categories` | — |
| POST | `/categories` | `{ name, description?, image? }` |
| PUT | `/categories/:id` | `{ name?, description?, image? }` |
| DELETE | `/categories/:id` | — |

### Products
| Method | Endpoint | Body / Query |
|---|---|---|
| GET | `/products` | `?page&limit&categoryId&isActive` |
| POST | `/products` | `{ name, description?, image?, price, stock, isActive?, categoryId }` |
| PUT | `/products/:id` | same fields, all optional |
| DELETE | `/products/:id` | — |

### Orders
| Method | Endpoint | Body |
|---|---|---|
| PUT | `/orders/:id/status` | `{ status: "PENDING" \| "PAID" \| "SHIPPED" \| "DELIVERED" \| "CANCELLED" }` |

---

## What to Build

Build a full **Remidies** section in the existing admin panel with the following pages/views:

---

### 1. Categories Page `/admin/remidies/categories`

- Table with columns: **Image**, **Name**, **Description**, **Actions**
- **Create** button → opens a modal/drawer with fields: Name (required), Description, Image URL
- **Edit** button per row → pre-filled modal
- **Delete** button per row → confirmation dialog before deleting
- Show a toast/snackbar on success and error

---

### 2. Products Page `/admin/remidies/products`

- Table with columns: **Image**, **Name**, **Category**, **Price (₹)**, **Stock**, **Status (Active/Inactive)**, **Actions**
- Filters at top: dropdown for **Category**, toggle for **Active/Inactive**, **Search by name** (client-side)
- **Pagination** — page size 10
- **Create Product** button → form/modal with:
  - Name (required)
  - Description (textarea)
  - Image URL
  - Price (number, required)
  - Stock (number, required)
  - Category (dropdown — fetched from `/categories`)
  - Is Active (toggle/checkbox, default: true)
- **Edit** button per row → pre-filled modal
- **Delete** button with confirmation
- Show stock as a badge: **red if stock = 0**, **orange if stock < 10**, **green otherwise**
- Show status as a pill badge: Active (green) / Inactive (grey)

---

### 3. Orders Page `/admin/remidies/orders`

> Note: This page fetches all orders from a future admin orders list endpoint. For now, build the UI structure and wire the status update.

- Table with columns: **Order ID**, **Customer**, **Total (₹)**, **Items**, **Status**, **Date**, **Actions**
- Status shown as a colored badge:
  - PENDING → yellow
  - PAID → blue
  - SHIPPED → purple
  - DELIVERED → green
  - CANCELLED → red
- **Update Status** button → dropdown/select to change status, calls `PUT /orders/:id/status`
- Inline status update with optimistic UI

---

## Technical Requirements

- Use the **existing UI component library** already in the project (do not introduce new ones)
- Use **async/await with try/catch** for all API calls
- Show **loading spinners** on fetch and on form submit buttons
- Show **error messages** from the API response (`error.response.data.error`)
- All forms should have **basic validation** matching the backend Zod schemas (required fields, positive numbers)
- Use the **existing admin auth context/hook** to get the JWT token for API calls
- Follow the **existing admin panel folder structure and naming conventions**
- Add a **Remidies** sidebar menu item with sub-items: Categories, Products, Orders

---

## Data Types (TypeScript)

```ts
interface Category {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  stock: number;
  isActive: boolean;
  categoryId: string;
  category: Category;
  createdAt: string;
  updatedAt: string;
}

type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface Order {
  id: string;
  userId: string;
  totalAmount: number;
  status: OrderStatus;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPostal: string;
  items: OrderItem[];
  payment: Payment | null;
  createdAt: string;
}

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;         // snapshot price at time of order
  product: Product;
}
```
