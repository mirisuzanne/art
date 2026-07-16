const ozToLb = (oz, digits) => (oz / 16).toFixed(digits || 0);

const product = (data) => {
  if (!data.product) return;

  if (data.product.oz && !data.product.lb) {
    data.product.lb = ozToLb(data.product.oz);
  }

  return data.product;
};

export default {
  layout: 'is/product',
  eleventyComputed: {
    product,
  },
};
