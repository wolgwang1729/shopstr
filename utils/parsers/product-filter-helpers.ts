import { nip19 } from "nostr-tools";
import { ProductData } from "./product-parser-functions";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Checks if a product satisfies the category filter.
 * @param productData - The product to check.
 * @param selectedCategories - Set of selected category names.
 * @returns boolean
 */
export const productSatisfiesCategoryFilter = (
  productData: ProductData,
  selectedCategories: Set<string>
) => {
  if (selectedCategories.size === 0) return true;
  return Array.from(selectedCategories).some((selectedCategory) => {
    const re = new RegExp(escapeRegExp(selectedCategory), "gi");
    return productData?.categories?.some((category) => {
      const match = category.match(re);
      return match && match.length > 0;
    });
  });
};

/**
 * Checks if a product satisfies the location filter.
 * @param productData - The product to check.
 * @param selectedLocation - The selected location string.
 * @returns boolean
 */
export const productSatisfiesLocationFilter = (
  productData: ProductData,
  selectedLocation: string
) => {
  return !selectedLocation || productData.location === selectedLocation;
};

/**
 * Checks if a product satisfies the search filter.
 * Supports Nip-19 addresses (naddr1, npub1) and text-based search in title/summary.
 * Also supports numeric price matching.
 * @param productData - The product to check.
 * @param selectedSearch - The search query string.
 * @returns boolean
 */
export const productSatisfiesSearchFilter = (
  productData: ProductData,
  selectedSearch: string
) => {
  const normalizedSearch = selectedSearch.trim();

  if (!normalizedSearch) return true;
  if (!productData.title) return false;

  // Handle Nip-19 naddr search
  if (normalizedSearch.includes("naddr1")) {
    try {
      const parsedNaddr = nip19.decode(normalizedSearch);
      if (parsedNaddr.type === "naddr") {
        return (
          productData.d === parsedNaddr.data.identifier &&
          productData.pubkey === parsedNaddr.data.pubkey
        );
      }
      return false;
    } catch {
      return false;
    }
  }

  // Handle Nip-19 npub search
  if (normalizedSearch.includes("npub1")) {
    try {
      const parsedNpub = nip19.decode(normalizedSearch);
      if (parsedNpub.type === "npub") {
        return parsedNpub.data === productData.pubkey;
      }
      return false;
    } catch {
      return false;
    }
  }

  try {
    const re = new RegExp(escapeRegExp(normalizedSearch), "i");

    // Match in title
    const titleMatch = productData.title.match(re);
    if (titleMatch && titleMatch.length > 0) return true;

    // Match in summary
    if (productData.summary) {
      const summaryMatch = productData.summary.match(re);
      if (summaryMatch && summaryMatch.length > 0) return true;
    }

    // Match numeric price
    const numericSearch = parseFloat(normalizedSearch);
    if (!isNaN(numericSearch) && productData.price === numericSearch) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Checks if a product has a valid price (>= 1 in its currency).
 * Products with a price below 1 are considered invalid and hidden.
 * @param productData - The product to check.
 * @returns boolean
 */
export const productSatisfiesPriceFilter = (productData: ProductData) => {
  return Number(productData.price) >= 1;
};

/**
 * Global blacklist of pubkeys that should be hidden from the marketplace.
 */
export const BANNED_PUBKEYS = new Set([
  "3da2082b7aa5b76a8f0c134deab3f7848c3b5e3a3079c65947d88422b69c1755",
]);

/**
 * Checks if a product is a valid listing and should be displayed.
 * Enforces baseline moderation and data completeness rules.
 * @param product - The product data to validate.
 * @param currentUserPubkey - (Optional) The current user's pubkey, to bypass some filters.
 * @returns boolean
 */
export const productIsValidListing = (
  product: ProductData,
  currentUserPubkey?: string
) => {
  if (!product.currency) return false;
  if (product.images.length === 0) return false;
  if (product.contentWarning) return false;

  if (
    BANNED_PUBKEYS.has(product.pubkey) &&
    product.pubkey !== currentUserPubkey
  ) {
    return false;
  }

  return true;
};

/**
 * Orchestrates all individual filters for a product.
 */
export const productSatisfiesAllFilters = (
  productData: ProductData,
  filters: {
    selectedCategories: Set<string>;
    selectedLocation: string;
    selectedSearch: string;
  }
) => {
  return (
    productSatisfiesPriceFilter(productData) &&
    productSatisfiesCategoryFilter(productData, filters.selectedCategories) &&
    productSatisfiesLocationFilter(productData, filters.selectedLocation) &&
    productSatisfiesSearchFilter(productData, filters.selectedSearch)
  );
};
