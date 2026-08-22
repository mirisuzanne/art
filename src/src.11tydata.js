const baseURL = () => process.env.URL || `https://art.miriamsuzanne.com`;

export default {
  layout: 'is/default',
  eleventyComputed: {
    baseURL,
  },
};
