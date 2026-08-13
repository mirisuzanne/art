const ozToLb = (oz, digits) => (oz / 16).toFixed(digits || 0);

const lb = (data) => {
  if (data.lb) return data.lb;
  if (data.oz) return ozToLb(data.oz);
};

export default {
  layout: 'is/product',
  eleventyComputed: {
    lb,
  },
};
