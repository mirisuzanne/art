const inStock = (page) => page.data.restock || page.data.stock;

const sortByStock = (collection) => collection
	.toReversed()
	.sort((a,b) => !inStock(b) && inStock(a) ? -1 : 0);

export default function (eleventyConfig) {
  eleventyConfig.addFilter('sortByStock', sortByStock);

	eleventyConfig.addCollection(
		'stock',
		function (collectionsApi) {
			return collectionsApi.getFilteredByTags('product').filter((page) => {
        return page.data.restock || page.data.stock > 0;
      });
		}
	);
};
