export default function (eleventyConfig) {
	eleventyConfig.addCollection(
		'stock',
		function (collectionsApi) {
			return collectionsApi.getFilteredByTags('product').filter((page) => {
        return page.data.restock || page.data.stock > 0;
      });
		}
	);
};
