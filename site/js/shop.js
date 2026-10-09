const productGrid = document.querySelector("#product-grid");
const cartItems = document.querySelector("#cart-items");
const cartEmpty = document.querySelector("#cart-empty");
const cartSummary = document.querySelector("#cart-summary");
const cartCount = document.querySelector("#cart-count");
const cartSubtotal = document.querySelector("#cart-subtotal");
const cartStatus = document.querySelector("#cart-status");
const clearCartButton = document.querySelector("#clear-cart");

let PRODUCTS = [];

async function loadProducts() {
  productGrid.setAttribute("aria-busy", "true");

  try {
    const response = await fetch("/api/products");

    if (!response.ok) {
      throw new Error(`Product request failed: ${response.status}`);
    }

    const data = await response.json();

    PRODUCTS = data.products.map((product) => ({
      ...product,
      title: product.name,
      format: "Digital resource",
      symbol: "📄",
      cover: "cover-yellow",
    }));

    renderProducts();
  } catch (error) {
    productGrid.innerHTML =
      '<p role="status">Products could not be loaded. Please try again later.</p>';
    console.error("Failed to load products:", error);
  } finally {
    productGrid.removeAttribute("aria-busy");
  }
  renderCart();
}

const CART_STORAGE_KEY = "school-psych-ny-cart";

function loadSavedCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");

    if (!Array.isArray(saved)) return new Map();

    return new Map(
      saved.filter(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === "string" &&
          Number.isInteger(entry[1]) &&
          entry[1] > 0,
      ),
    );
  } catch {
    return new Map();
  }
}

const cart = loadSavedCart();

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([...cart.entries()]));
}

const formatPrice = (price) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);

function renderProducts() {
  if (PRODUCTS.length === 0) {
    productGrid.innerHTML =
      '<p role="status">No products available yet. Please check back soon.</p>';
    return;
  }

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
    return sum + (product ? product.price * quantity : 0);
  }, 0);

  cartCount.textContent = itemCount;
  cartEmpty.hidden = entries.length > 0;
  cartSummary.hidden = entries.length === 0;

  cartItems.innerHTML = entries
    .map(([id, quantity]) => {
      const product = PRODUCTS.find((item) => item.id === id);
      if (!product) return "";

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
  saveCart();
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

  saveCart();
  renderCart();
  cartStatus.textContent = "Cart updated.";
});

clearCartButton.addEventListener("click", () => {
  cart.clear();
  saveCart();
  renderCart();
  cartStatus.textContent = "Cart cleared.";
});

const checkoutForm = document.querySelector("#checkout-form");
const checkoutName = document.querySelector("#checkout-name");
const checkoutEmail = document.querySelector("#checkout-email");
const checkoutButton = document.querySelector("#checkout-button");
const checkoutFormStatus = document.querySelector("#checkout-form-status");
const checkoutNameError = document.querySelector("#checkout-name-error");
const checkoutEmailError = document.querySelector("#checkout-email-error");

const orderConfirmation = document.querySelector("#order-confirmation");
const confirmationOrderNumber = document.querySelector(
  "#confirmation-order-number",
);
const confirmationOrderTotal = document.querySelector(
  "#confirmation-order-total",
);
const confirmationCopyStatus = document.querySelector(
  "#confirmation-copy-status",
);
const copyOrderDetailsButton = document.querySelector("#copy-order-details");
const closeOrderConfirmationButton = document.querySelector(
  "#close-order-confirmation",
);

let completedOrderDetails = "";

copyOrderDetailsButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(completedOrderDetails);
    confirmationCopyStatus.textContent = "Order details copied.";
  } catch {
    confirmationCopyStatus.textContent =
      "Copying wasn't available. Please select and copy the order details manually.";
  }
});

closeOrderConfirmationButton.addEventListener("click", () => {
  orderConfirmation.close();
});

function validateCheckout() {
  const name = checkoutName.value.trim();
  const email = checkoutEmail.value.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const nameValid = name.length > 0;
  const emailValid = emailPattern.test(email);

  checkoutNameError.textContent = nameValid
    ? ""
    : "Please enter your full name.";
  checkoutNameError.hidden = nameValid;

  checkoutEmailError.textContent = emailValid
    ? ""
    : "Please enter a valid email address.";
  checkoutEmailError.hidden = emailValid;

  const cartHasItems = [...cart.entries()].some(
    ([id, quantity]) =>
      quantity > 0 && PRODUCTS.some((product) => product.id === id),
  );

  checkoutButton.disabled = !nameValid || !emailValid || !cartHasItems;

  return nameValid && emailValid && cartHasItems;
}

checkoutName.addEventListener("input", validateCheckout);
checkoutEmail.addEventListener("input", validateCheckout);

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validateCheckout()) {
    checkoutFormStatus.textContent = "Please review the highlighted fields.";
    return;
  }

  const confirmed = window.confirm(
    "One last check: please confirm your email address is correct and your cart contains the resources you want. Continue with this development-only purchase simulation? No payment will be taken.",
  );

  if (!confirmed) {
    checkoutFormStatus.textContent = "No problem. Please review your details.";
    return;
  }

  checkoutButton.disabled = true;
  checkoutFormStatus.textContent = "Preparing secure Stripe checkout...";

  try {
    const response = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: checkoutName.value.trim(),
        email: checkoutEmail.value.trim(),
        items: [...cart.entries()].map(([id, quantity]) => ({ id, quantity })),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to record the test order.");
    }

    if (!result.checkoutUrl || typeof result.checkoutUrl !== "string") {
      throw new Error(
        "Stripe did not return a checkout link. Please try again.",
      );
    }

    window.location.assign(result.checkoutUrl);
    return;
  } catch (error) {
    checkoutFormStatus.textContent =
      error.message || "Something went wrong. Please try again.";
  } finally {
    validateCheckout();
  }
});

loadProducts().then(() => {
  renderCart();
  validateCheckout();
});
renderCart();
