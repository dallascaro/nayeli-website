const PRODUCTS = [
  {
    id: "feelings-check-in",
    title: "Feelings Check-In Cards",
    category: "Social-Emotional Learning",
    description:
      "A sample set of prompts to help students identify and talk about their feelings.",
    price: 5.0,
    format: "Printable PDF",
    symbol: "💛",
    cover: "cover-yellow",
  },
  {
    id: "executive-functioning",
    title: "Executive Functioning Visuals",
    category: "Student Supports",
    description:
      "Sample visual supports for routines, organization, and getting started on tasks.",
    price: 7.0,
    format: "Printable PDF",
    symbol: "🧠",
    cover: "cover-pink",
  },
  {
    id: "session-planner",
    title: "School Psych Session Planner",
    category: "School Psychologist Tools",
    description:
      "A sample planner for organizing counseling sessions and tracking activities.",
    price: 4.0,
    format: "Digital planner",
    symbol: "🍎",
    cover: "cover-green",
  },
];

const productGrid = document.querySelector("#product-grid");
const cartItems = document.querySelector("#cart-items");
const cartEmpty = document.querySelector("#cart-empty");
const cartSummary = document.querySelector("#cart-summary");
const cartCount = document.querySelector("#cart-count");
const cartSubtotal = document.querySelector("#cart-subtotal");
const cartStatus = document.querySelector("#cart-status");
const clearCartButton = document.querySelector("#clear-cart");

const cart = new Map();

const formatPrice = (price) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);

function renderProducts() {
  productGrid.innerHTML = PRODUCTS.map(
    (product) => `
      <article class="product-card">
        <div class="product-cover ${product.cover}" aria-hidden="true">
          <span class="product-cover-symbol">${product.symbol}</span>
          <span class="product-cover-brand">School Psych NY</span>
        </div>

        <div class="product-card-content">
          <p class="product-category">${product.category}</p>
          <h3>${product.title}</h3>
          <p class="product-description">${product.description}</p>
          <p class="product-format">${product.format}</p>

          <div class="product-card-footer">
            <strong class="product-price">${formatPrice(product.price)}</strong>
            <button
              class="add-to-cart-button"
              type="button"
              data-add-product="${product.id}"
            >
              Add to cart
            </button>
          </div>
        </div>
      </article>
    `,
  ).join("");
}

function renderCart() {
  const entries = [...cart.entries()];
  const itemCount = entries.reduce((sum, [, quantity]) => sum + quantity, 0);

  const subtotal = entries.reduce((sum, [id, quantity]) => {
    const product = PRODUCTS.find((item) => item.id === id);
    return sum + product.price * quantity;
  }, 0);

  cartCount.textContent = itemCount;
  cartEmpty.hidden = entries.length > 0;
  cartSummary.hidden = entries.length === 0;

  cartItems.innerHTML = entries
    .map(([id, quantity]) => {
      const product = PRODUCTS.find((item) => item.id === id);

      return `
        <div class="cart-item">
          <div class="cart-item-info">
            <strong>${product.title}</strong>
            <span>${formatPrice(product.price)} each</span>
          </div>

          <div class="cart-item-controls">
            <button
              type="button"
              data-cart-action="decrease"
              data-product-id="${id}"
              aria-label="Decrease quantity of ${product.title}"
            >−</button>

            <span aria-label="Quantity">${quantity}</span>

            <button
              type="button"
              data-cart-action="increase"
              data-product-id="${id}"
              aria-label="Increase quantity of ${product.title}"
            >+</button>

            <button
              type="button"
              class="remove-item-button"
              data-cart-action="remove"
              data-product-id="${id}"
            >Remove</button>
          </div>
        </div>
      `;
    })
    .join("");

  cartSubtotal.textContent = formatPrice(subtotal);
}

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-product]");
  if (!button) return;

  const productId = button.dataset.addProduct;
  const product = PRODUCTS.find((item) => item.id === productId);

  if (!product) return;

  cart.set(productId, (cart.get(productId) || 0) + 1);
  renderCart();

  cartStatus.textContent = `${product.title} added to your cart.`;
});

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;

  const { cartAction, productId } = button.dataset;
  const quantity = cart.get(productId);

  if (!quantity) return;

  if (
    cartAction === "remove" ||
    (cartAction === "decrease" && quantity === 1)
  ) {
    cart.delete(productId);
  } else if (cartAction === "decrease") {
    cart.set(productId, quantity - 1);
  } else if (cartAction === "increase") {
    cart.set(productId, quantity + 1);
  }

  renderCart();
  cartStatus.textContent = "Cart updated.";
});

clearCartButton.addEventListener("click", () => {
  cart.clear();
  renderCart();
  cartStatus.textContent = "Cart cleared.";
});

renderProducts();
renderCart();
