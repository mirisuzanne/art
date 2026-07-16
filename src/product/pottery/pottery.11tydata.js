const title = (data) => {
  if (data.title) return data.title;
  return data.second
    ? `${data.product} second`
    : data.product;
};

export default {
  layout: 'is/pottery',
  padding: 1,
  eleventyComputed: {
    title,
  },
};

