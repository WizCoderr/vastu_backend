# Flutter Prompt — Remidies User-Side E-Commerce

## Overview

Add a full **Remidies (Vastu Store)** e-commerce section to the existing Flutter app. The UI design is already defined (see screenshots). Match the design as closely as possible using the existing app theme.

---

## Design Tokens (from screenshots)

```dart
// Colors
const Color kBackground  = Color(0xFFF5F0EB); // warm off-white
const Color kPrimary     = Color(0xFFB8860B); // golden/mustard
const Color kDarkGreen   = Color(0xFF1B3A2D); // banner background
const Color kCardBg      = Colors.white;
const Color kPriceColor  = Color(0xFFB8860B);
const Color kBadgeSeller = Color(0xFF4CAF50); // "Best Seller" green
const Color kBadgeNew    = Color(0xFFE53935); // "New" red

// Typography
// Product title: 14px semi-bold, black
// Price: 16px bold, kPrimary
// Rating: 12px, amber star + grey text
```

---

## API Integration

**Base URL:** `https://api.vastuarunsharma.com/api/student/remidies`  
**Auth:** All requests require `Authorization: Bearer <token>` (from existing auth token storage).

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/categories` | For filter chips |
| GET | `/products?page=1&limit=20&categoryId=&isActive=true` | Product listing |
| GET | `/cart` | Get cart |
| POST | `/cart` | `{ productId, quantity }` |
| PUT | `/cart/:productId` | `{ quantity }` |
| DELETE | `/cart/:productId` | Remove item |
| POST | `/orders` | Checkout with shipping details |
| GET | `/orders` | Order history |

---

## Screens to Build

---

### Screen 1 — Vastu Store (Product Listing)

**Route:** `/remidies` or existing bottom nav "Store" tab

**Layout:**
- `AppBar`: back arrow left, title **"Vastu Store"**, cart icon with badge (item count) top-right
- `TextField` search bar with rounded corners, grey background, search icon — filters products client-side by name
- Horizontal scrollable **category filter chips**: "All" (gold/filled when selected), then one chip per category from API. Pills with rounded corners, white background when unselected.
- **Hero banner card** — dark green (`#1B3A2D`) full-width rounded card with:
  - Badge text "NEW ARRIVALS" in small gold uppercase
  - Big white title (e.g., "Golden Ratio Collection")
  - A product image on the right side
- **2-column grid** of product cards (`StaggeredGridView` or `GridView.count`)

**Product Card:**
- Rounded white card with shadow
- Full-width image (fit: cover, top rounded corners)
- Favourite heart icon (outlined, top-right of image)
- Optional badge overlay top-left: green "Best Seller" or red "New"
- Star rating row: gold star icon + rating number (e.g., `4.5`) + count in grey `(128)`
- Product name in black semi-bold
- Price in gold bold (e.g., `$45.00`)
- Round gold `+` add-to-cart button bottom-right (calls `POST /cart` with quantity 1)

---

### Screen 2 — Product Detail

**Route:** `/remidies/product/:id`

**Layout:**
- Full-width image with page-dot indicators at the bottom (use `PageView` if multiple images, else single image)
- Heart (favourite) icon top-right of image (white circle background)
- Back arrow top-left
- Cart icon top-right (outside image)
- Below image (white card sheet):
  - Product name — large bold
  - Category badge (gold outlined pill) + Star rating + review count on same row
  - Price row: **₹1,299** bold primary + ~~₹1,899~~ strikethrough grey + **"In Stock"** green badge (or **"Out of Stock"** red)
  - "About this product" section header with description text
  - Spec tiles row (e.g., Size, Material) — small icon + label + value in rounded grey cards
  - Shipping info row — truck icon + "Free Delivery" + estimated date + arrow
- **Bottom bar** (pinned):
  - Quantity selector: `-` `[count]` `+` in outlined rounded box
  - **"Buy Now →"** full-width gold rounded button → adds to cart then navigates to cart

---

### Screen 3 — Shopping Cart

**Route:** `/remidies/cart`

**Layout:**
- `AppBar`: back arrow, title **"Shopping Cart"**, no other actions
- Scrollable list of cart items:
  - Each item: square image (rounded corners) + product name (bold) + category/subtitle (grey) + price (gold bold) + quantity stepper (`-` `[n]` `+`) + `×` remove button top-right
  - Calls `PUT /cart/:productId` on quantity change (debounce 400ms)
  - Calls `DELETE /cart/:productId` on remove
- **Price Details card** (rounded white card):
  - Subtotal row
  - Shipping Fee row (show "FREE" in green)
  - Discount row if applicable (show in green negative)
  - **Total Amount** row — bold
- **Bottom CTA**: full-width gold rounded button **"Proceed to Checkout →"** → navigates to Checkout screen

---

### Screen 4 — Checkout / Shipping Details

**Route:** `/remidies/checkout`

**Layout:**
- `AppBar`: back arrow, title **"Checkout"**
- Form with fields (all required):
  - Full Name
  - Phone Number
  - Address (multiline)
  - City
  - State
  - Postal Code
- Order summary card (collapsed/expandable) showing total amount
- **"Place Order →"** gold full-width button:
  - Calls `POST /orders` with shipping details
  - On success → navigate to Order Confirmation screen
  - Show loading indicator on button while in flight

---

### Screen 5 — Order Confirmation

**Route:** `/remidies/order-success`

**Layout:**
- Centered lottie/icon animation — checkmark
- "Order Placed Successfully!" title
- Order ID shown
- Estimated delivery text
- **"Continue Shopping"** button → pop to store
- **"View Orders"** text button → navigate to My Orders

---

### Screen 6 — My Orders

**Route:** `/remidies/orders`

**Layout:**
- `AppBar`: title **"My Orders"**
- List of orders (from `GET /orders`):
  - Each card: Order ID, date, total, status badge (colored), list of item names truncated, **"View Details"** link
- Status badge colors:
  - PENDING → amber
  - PAID → blue
  - SHIPPED → purple
  - DELIVERED → green
  - CANCELLED → red

---

## State Management

Use the **existing state management** solution in the project (Provider / Riverpod / BLoC — match what's already used).

Create the following:
- `RemidiesRepository` — all API calls
- `RemidiesProvider` / `RemidiesCubit` — product list + category filter + search state
- `CartProvider` / `CartCubit` — cart state, item count badge
- `OrderProvider` / `OrderCubit` — checkout + order history

---

## Additional Requirements

- All API errors → show `SnackBar` with the error message from `error["error"]`
- Show `CircularProgressIndicator` while loading
- Product images → use `CachedNetworkImage` with a placeholder
- Cart item count badge on the store tab / cart icon updates in real-time
- `isActive: false` products must not be shown or addable to cart
- Stock = 0 → show "Out of Stock" badge, disable add-to-cart button
- Currency format: `₹` prefix, 2 decimal places

---



## Data Models

```dart
class Category {
  final String id, name;
  final String? description, image;
}

class Product {
  final String id, name, categoryId;
  final String? description, image;
  final double price;
  final int stock;
  final bool isActive;
  final Category category;
}

class CartItem {
  final String id, cartId, productId;
  final int quantity;
  final Product product;
}

class Cart {
  final String id, userId;
  final List<CartItem> items;
}

enum OrderStatus { PENDING, PAID, SHIPPED, DELIVERED, CANCELLED }

class Order {
  final String id, userId;
  final double totalAmount;
  final OrderStatus status;
  final List<OrderItem> items;
  final DateTime createdAt;
  // + shipping fields
}

class OrderItem {
  final String id, productId;
  final int quantity;
  final double price; // snapshot price
  final Product product;
}
```
