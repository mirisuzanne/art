const inStock = (data) => data.stock && data.stock !== 0;
const reStock = (data) => data.restock && !inStock(data);
const showStock = (data) => inStock(data) || reStock(data) || data.feature;
const isSecond = (data) => data.flag?.includes('second');

const sortByStock = (collection) => collection
	.toReversed()
	.sort((a,b) => {
		if (isSecond(b.data) && !isSecond(a.data)) return -1;
		return 0;
	});

export default function (eleventyConfig) {
  eleventyConfig.addFilter('inStock', inStock);
  eleventyConfig.addFilter('reStock', reStock);
  eleventyConfig.addFilter('showStock', showStock);
  eleventyConfig.addFilter('isSecond', isSecond);
  eleventyConfig.addFilter('sortByStock', sortByStock);

	eleventyConfig.addCollection(
		'stock',
		function (collectionsApi) {
			return collectionsApi.getFilteredByTags('product').filter((page) =>
				showStock(page.data)
      );
		}
	);

	eleventyConfig.addCollection(
		'request',
		function (collectionsApi) {
			return collectionsApi.getFilteredByTags('product').filter((page) =>
				reStock(page.data)
      );
		}
	);
};
